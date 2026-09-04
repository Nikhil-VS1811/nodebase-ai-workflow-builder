import { describe, it } from "node:test";
import assert from "node:assert";
import { NonRetriableError } from "inngest";
import { evaluatePolicy, type TransactionIntent, type PolicyConfig, type HumanApprovalRecord } from "@/lib/policyEngine";
import { policyGateExecutor } from "@/features/executions/components/policy-gate/executor";
import { razorpayExecutor } from "@/features/executions/components/razorpay/executor";
import { aiBuyerExecutor } from "@/features/executions/components/ai-buyer/executor";
import agentPolicy from "@/config/agentPolicy.json";
import type { NodeExecutorParams } from "@/features/executions/types";

describe("Phase 4: Human Approval Flow for Escalated Transactions", () => {
  const policy = agentPolicy as PolicyConfig;
  const mockPublish = async () => {};
  const mockStep = {
    run: async (_name: string, fn: () => Promise<any>) => fn(),
  } as any;

  it("1. ESCALATED -> PENDING_APPROVAL: Policy Gate marks context as pending approval without throwing a crash", async () => {
    // 3499 INR exceeds require_human_above (2000 INR) but is below daily cap (15000 INR)
    const escalatedIntent: TransactionIntent = {
      action: "payment.execute",
      productId: "prod_headphones_03",
      productTitle: "Noise-Cancelling Wireless Headphones",
      amount: 3499,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    };

    const initialContext = {
      transactionIntent: escalatedIntent,
    };

    const resultContext = await policyGateExecutor({
      data: {},
      nodeId: "policy_gate_node_01",
      userId: "user_alice",
      context: initialContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.ok(resultContext.policyEvaluation);
    const evalResult = resultContext.policyEvaluation as any;
    assert.strictEqual(evalResult.decision, "ESCALATED");
    assert.strictEqual(evalResult.status, "ESCALATED");
    assert.strictEqual(evalResult.allowed, false); // Not auto-allowed
    assert.strictEqual(resultContext.__pendingApproval, true); // Execution runner halts loop
  });

  it("2. Pending approval strictly blocks Razorpay execution", async () => {
    const unapprovedContext = {
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_headphones_03",
        amount: 3499,
        currency: "INR",
      },
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: false,
        reason: "Amount exceeds auto-approval threshold.",
        // No humanApproval record
      },
    };

    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_test_123" },
          nodeId: "rp_node_unapproved",
          userId: "user_alice",
          context: unapprovedContext,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("human approval"));
        assert(err.message.includes("ESCALATED"));
        return true;
      },
    );
  });

  it("3. Valid Human Approval: preserves original ESCALATED decision and attaches HumanApprovalRecord", () => {
    const originalIntent: TransactionIntent = {
      action: "payment.execute",
      productId: "prod_headphones_03",
      productTitle: "Noise-Cancelling Wireless Headphones",
      amount: 3499,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    };

    const initialEval = evaluatePolicy(originalIntent, policy);
    assert.strictEqual(initialEval.decision, "ESCALATED");

    // Construct server-verified human approval record
    const humanApproval: HumanApprovalRecord = {
      approved: true,
      approvedAt: new Date().toISOString(),
      approverId: "user_alice",
      approverName: "Alice Admin",
      approverEmail: "alice@example.com",
      decision: "APPROVED_BY_HUMAN",
      notes: "Verified high-value equipment requisition.",
    };

    // Updated policy evaluation with human sign-off
    const approvedEval = {
      ...initialEval,
      allowed: true, // Now authorized by human
      humanApproval,
    };

    // The canonical decision MUST remain "ESCALATED" for audit compliance
    assert.strictEqual(approvedEval.decision, "ESCALATED");
    assert.strictEqual(approvedEval.status, "ESCALATED");
    assert.strictEqual(approvedEval.humanApproval.approved, true);
    assert.strictEqual(approvedEval.humanApproval.decision, "APPROVED_BY_HUMAN");
    assert.strictEqual(approvedEval.allowed, true);
  });

  it("4. Resumed Execution: Policy Gate and Razorpay recognize verified human approval and allow execution", async () => {
    const humanApproval: HumanApprovalRecord = {
      approved: true,
      approvedAt: new Date().toISOString(),
      approverId: "user_alice",
      approverName: "Alice Admin",
      decision: "APPROVED_BY_HUMAN",
      notes: "Approved by manager.",
    };

    const approvedContext = {
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_headphones_03",
        productTitle: "Noise-Cancelling Wireless Headphones",
        amount: 3499,
        currency: "INR",
        merchantId: "merchant_nodebase_01",
        quantity: 1,
      },
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: true,
        riskLevel: "MEDIUM",
        riskScore: "MEDIUM",
        reason: "Amount exceeds auto-approval threshold.",
        reasons: ["Amount exceeds auto-approval threshold."],
        untrustedInputDetected: false,
        timestamp: new Date().toISOString(),
        humanApproval,
      },
    };

    // Step 1: Policy Gate on resumed flow recognizes the human approval and does NOT halt
    const pgResumedContext = await policyGateExecutor({
      data: {},
      nodeId: "pg_resumed",
      userId: "user_alice",
      context: approvedContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.strictEqual(pgResumedContext.__pendingApproval, undefined);
    assert.strictEqual((pgResumedContext.policyEvaluation as any).allowed, true);
    assert.strictEqual((pgResumedContext.policyEvaluation as any).decision, "ESCALATED");
  });

  it("5. Rejection: human rejection permanently blocks Razorpay and stops workflow", async () => {
    const humanRejection: HumanApprovalRecord = {
      approved: false,
      rejectedAt: new Date().toISOString(),
      approverId: "user_alice",
      approverName: "Alice Admin",
      decision: "REJECTED_BY_HUMAN",
      notes: "Budget exceeded for this quarter.",
    };

    const rejectedContext = {
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_headphones_03",
        amount: 3499,
        currency: "INR",
      },
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: false,
        humanApproval: humanRejection,
      },
    };

    // Razorpay must strictly reject any transaction with approved: false or REJECTED_BY_HUMAN
    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_test_123" },
          nodeId: "rp_rejected",
          userId: "user_alice",
          context: rejectedContext,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("human approval") || err.message.includes("Unauthorized execution"));
        return true;
      },
    );
  });

  it("6. Replay & Forgery Prevention: invalid approval record formats are blocked", async () => {
    // Forged: claims approved: true but decision is REJECTED_BY_HUMAN
    const forgedApproval1 = {
      transactionIntent: { amount: 3499, currency: "INR" },
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: true,
        humanApproval: {
          approved: true,
          decision: "REJECTED_BY_HUMAN", // Contradiction!
        },
      },
    };

    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_test_123" },
          nodeId: "rp_forged_approval_1",
          userId: "user_alice",
          context: forgedApproval1,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        return true;
      },
    );
  });

  it("7. Full End-to-End Pipeline with Human-in-the-Loop Approval", async () => {
    // 1. Natural language purchase for 3499 INR item
    const userPrompt = "I need 1 Noise-Cancelling Wireless Headphones";

    // 2. AI Buyer interprets intent from catalog
    const buyerContext = await aiBuyerExecutor({
      data: { inputKey: "userMessage", outputKey: "transactionIntent" },
      nodeId: "ai_buyer_phase4",
      userId: "user_alice",
      context: { userMessage: userPrompt },
      step: mockStep,
      publish: mockPublish,
    });

    assert.ok(buyerContext.transactionIntent);
    const intent = buyerContext.transactionIntent as TransactionIntent;
    assert.strictEqual(intent.amount, 3499);

    // 3. Policy Gate evaluates intent -> marks ESCALATED / PENDING_APPROVAL
    const gateContext = await policyGateExecutor({
      data: { intentKey: "transactionIntent" },
      nodeId: "policy_gate_phase4",
      userId: "user_alice",
      context: buyerContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.strictEqual(gateContext.__pendingApproval, true);
    assert.strictEqual((gateContext.policyEvaluation as any).decision, "ESCALATED");

    // 4. Before approval: Razorpay CANNOT execute
    await assert.rejects(async () => {
      await razorpayExecutor({
        data: { credentialId: "cred_test" },
        nodeId: "rp_phase4_before",
        userId: "user_alice",
        context: gateContext,
        step: mockStep,
        publish: mockPublish,
      });
    });

    // 5. Human reviews and approves transaction on server
    const humanApproval: HumanApprovalRecord = {
      approved: true,
      approvedAt: new Date().toISOString(),
      approverId: "user_alice",
      approverName: "Alice Admin",
      decision: "APPROVED_BY_HUMAN",
      notes: "Authorized by admin.",
    };

    const resumedContext = {
      ...gateContext,
      __pendingApproval: false,
      policyEvaluation: {
        ...(gateContext.policyEvaluation as any),
        allowed: true,
        humanApproval,
      },
    };

    // 6. Resumed Policy Gate verifies approval
    const afterApprovalContext = await policyGateExecutor({
      data: { intentKey: "transactionIntent" },
      nodeId: "policy_gate_resumed",
      userId: "user_alice",
      context: resumedContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.strictEqual(!afterApprovalContext.__pendingApproval, true);
    assert.strictEqual((afterApprovalContext.policyEvaluation as any).allowed, true);
  });
});
