import { describe, it } from "node:test";
import assert from "node:assert";
import { buildExecutionTimeline } from "@/lib/executionTimeline";
import type { DecisionReceipt } from "@/lib/decisionReceipt";
import type { TransactionIntent, PolicyEvaluationResult, HumanApprovalRecord } from "@/lib/policyEngine";

describe("Phase 15.1: Execution Timeline Mapping", () => {
  it("1. Successful commerce transaction produces a complete chronological timeline with genuine timestamps", () => {
    const startedAt = new Date("2026-09-03T10:00:00.000Z");
    const completedAt = new Date("2026-09-03T10:00:02.000Z");

    const sampleIntent: TransactionIntent = {
      action: "payment.execute",
      productId: "prod_mouse_02",
      productTitle: "Wireless Precision Mouse",
      amount: 1999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
      sourceInstruction: "Order a wireless precision mouse",
    };

    const samplePolicy: PolicyEvaluationResult = {
      decision: "APPROVED",
      status: "APPROVED",
      allowed: true,
      riskLevel: "LOW",
      riskScore: "LOW",
      reason: "Transaction within bounds and policy limits.",
      reasons: ["Transaction within bounds and policy limits."],
      untrustedInputDetected: false,
      timestamp: "2026-09-03T10:00:00.500Z",
      policyVersion: "1.0.0",
    };

    const sampleReceipt: DecisionReceipt = {
      id: "rcpt_test_01",
      executionId: "exec_test_01",
      workflowId: "wf_test_01",
      receiptVersion: "1.0.0",
      integrityHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      createdAt: "2026-09-03T10:00:01.800Z",
      idempotencyKey: "idem_test_01",
      payload: {
        receiptId: "rcpt_test_01",
        executionId: "exec_test_01",
        workflowId: "wf_test_01",
        idempotencyKey: "idem_test_01",
        createdAt: "2026-09-03T10:00:01.800Z",
        receiptVersion: "1.0.0",
        userIntent: { sourceInstruction: "Order a wireless precision mouse" },
        transactionIntent: sampleIntent,
        catalogSnapshot: {
          productId: "prod_mouse_02",
          title: "Wireless Precision Mouse",
          price: 1999,
          currency: "INR",
          stock: 45,
          merchantId: "merchant_nodebase_01",
        },
        policyDecision: {
          decision: "APPROVED",
          allowed: true,
          riskLevel: "LOW",
          riskScore: "LOW",
          reasons: ["Transaction within bounds and policy limits."],
          policyVersion: "1.0.0",
          timestamp: "2026-09-03T10:00:00.500Z",
          untrustedInputDetected: false,
        },
        payment: {
          paymentOrderId: "po_test_01",
          razorpayOrderId: "order_rzp_test_01",
          razorpayOrderStatus: "created",
          amountPaise: 199900,
          amountRupees: 1999,
          currency: "INR",
          idempotencyKey: "idem_test_01",
        },
        commerceIntegrity: {
          verified: true,
          status: "VERIFIED",
          checks: {
            authorization: true,
            product: true,
            quantity: true,
            amount: true,
            currency: true,
            merchant: true,
            executionIdentity: true,
            idempotency: true,
          },
          reasons: ["All checks verified"],
          verificationVersion: "1.0.0",
          verifiedAt: "2026-09-03T10:00:01.850Z",
        },
        finalOutcome: {
          status: "SUCCESS",
          completedAt: "2026-09-03T10:00:02.000Z",
        },
      },
    };

    const timeline = buildExecutionTimeline({
      executionId: "exec_test_01",
      workflowId: "wf_test_01",
      status: "SUCCESS",
      startedAt,
      completedAt,
      context: {
        userMessage: "Order a wireless precision mouse",
        transactionIntent: sampleIntent,
        policyEvaluation: samplePolicy,
        paymentOrder: {
          id: "po_test_01",
          idempotencyKey: "idem_test_01",
          status: "CREATED",
          createdAt: "2026-09-03T10:00:01.000Z",
        },
        razorpayResult: {
          id: "order_rzp_test_01",
          amount: 199900,
          currency: "INR",
          status: "created",
          created_at: 1788429601,
        },
      },
      receipt: sampleReceipt,
    });

    assert.strictEqual(timeline.executionId, "exec_test_01");
    assert.strictEqual(timeline.currentStatus, "SUCCESS");
    assert.strictEqual(timeline.isComplete, true);
    assert.strictEqual(timeline.hasHumanEscalation, false);
    assert.strictEqual(timeline.hasProviderOrder, true);

    const stages = timeline.events.map((e) => e.stage);
    assert.ok(stages.includes("USER_INTENT"));
    assert.ok(stages.includes("AI_BUYER_INTENT"));
    assert.ok(stages.includes("CATALOG_RESOLUTION"));
    assert.ok(stages.includes("POLICY_EVALUATION"));
    assert.ok(stages.includes("PAYMENT_ORDER"));
    assert.ok(stages.includes("RAZORPAY_ORDER_CREATED"));
    assert.ok(stages.includes("DECISION_RECEIPT"));
    assert.ok(stages.includes("FINAL_OUTCOME"));

    // Verify timestamps reflect actual data
    const userIntentEvt = timeline.events.find((e) => e.stage === "USER_INTENT");
    assert.strictEqual(userIntentEvt?.timestamp, "2026-09-03T10:00:00.000Z");

    const policyEvt = timeline.events.find((e) => e.stage === "POLICY_EVALUATION");
    assert.strictEqual(policyEvt?.timestamp, "2026-09-03T10:00:00.500Z");

    const poEvt = timeline.events.find((e) => e.stage === "PAYMENT_ORDER");
    assert.strictEqual(poEvt?.timestamp, "2026-09-03T10:00:01.000Z");

    const finalEvt = timeline.events.find((e) => e.stage === "FINAL_OUTCOME");
    assert.strictEqual(finalEvt?.timestamp, "2026-09-03T10:00:02.000Z");
  });

  it("2. Timestamps are NOT fabricated when source data lacks them", () => {
    const timeline = buildExecutionTimeline({
      executionId: "exec_sparse_01",
      status: "SUCCESS",
      context: {
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_mouse_02",
          amount: 1999,
          currency: "INR",
        },
        // No startedAt, completedAt, or timestamps in context
      },
    });

    const buyerIntentEvt = timeline.events.find((e) => e.stage === "AI_BUYER_INTENT");
    assert.strictEqual(buyerIntentEvt?.timestamp, undefined);

    const catalogEvt = timeline.events.find((e) => e.stage === "CATALOG_RESOLUTION");
    assert.strictEqual(catalogEvt?.timestamp, undefined);
  });

  it("3. Escalated execution timeline displays HUMAN_APPROVAL_REQUIRED and HUMAN_APPROVAL_DECISION with TTL expiresAt", () => {
    const humanApproval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      approverName: "Alice Admin",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: "2026-09-03T12:00:00.000Z",
      expiresAt: "2026-09-03T12:15:00.000Z",
      notes: "Verified budget approval.",
    };

    const timeline = buildExecutionTimeline({
      executionId: "exec_escalated_01",
      status: "SUCCESS",
      context: {
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_keyboard_01",
          amount: 4999,
          currency: "INR",
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
          timestamp: "2026-09-03T11:59:50.000Z",
          humanApproval,
        },
      },
    });

    assert.strictEqual(timeline.hasHumanEscalation, true);

    const humanReqEvt = timeline.events.find((e) => e.stage === "HUMAN_APPROVAL_REQUIRED");
    assert.ok(humanReqEvt);
    assert.strictEqual(humanReqEvt.status, "COMPLETED");

    const humanDecEvt = timeline.events.find((e) => e.stage === "HUMAN_APPROVAL_DECISION");
    assert.ok(humanDecEvt);
    assert.strictEqual(humanDecEvt.status, "APPROVED");
    assert.strictEqual(humanDecEvt.timestamp, "2026-09-03T12:00:00.000Z");
    assert.ok(humanDecEvt.details?.some((d) => d.includes("2026-09-03T12:15:00.000Z")));
  });

  it("4. Denied execution timeline displays failure reason and produces ZERO provider/payment stages", () => {
    const timeline = buildExecutionTimeline({
      executionId: "exec_denied_01",
      status: "FAILED",
      error: "Security Alert: Prompt injection pattern detected in payload.",
      context: {
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_mouse_02",
          amount: 1999,
          currency: "INR",
        },
        policyEvaluation: {
          decision: "DENIED",
          status: "DENIED",
          allowed: false,
          riskLevel: "HIGH",
          riskScore: "HIGH",
          reason: "Security Alert: Prompt injection pattern detected in payload.",
          reasons: ["Security Alert: Prompt injection pattern detected in payload."],
          untrustedInputDetected: true,
          timestamp: "2026-09-03T14:00:00.000Z",
        },
      },
    });

    assert.strictEqual(timeline.hasProviderOrder, false);

    const stages = timeline.events.map((e) => e.stage);
    assert.ok(!stages.includes("PAYMENT_ORDER"));
    assert.ok(!stages.includes("RAZORPAY_ORDER_CREATED"));

    const policyEvt = timeline.events.find((e) => e.stage === "POLICY_EVALUATION");
    assert.strictEqual(policyEvt?.status, "DENIED");

    const finalEvt = timeline.events.find((e) => e.stage === "FINAL_OUTCOME");
    assert.strictEqual(finalEvt?.status, "FAILED");
    assert.ok(finalEvt?.description.includes("Prompt injection"));
  });

  it("5. Razorpay gateway order is distinctly labeled CREATED and not payment completed", () => {
    const timeline = buildExecutionTimeline({
      executionId: "exec_rzp_status_01",
      status: "SUCCESS",
      context: {
        razorpayResult: {
          id: "order_rzp_999",
          status: "created",
          amount: 199900,
          currency: "INR",
        },
      },
    });

    const rzpEvt = timeline.events.find((e) => e.stage === "RAZORPAY_ORDER_CREATED");
    assert.ok(rzpEvt);
    assert.strictEqual(rzpEvt.title, "Razorpay Gateway Order Created");
    assert.ok(rzpEvt.description.includes("CREATED"));
    assert.ok(rzpEvt.details?.some((d) => d.includes("Awaiting customer capture/settlement")));
    assert.ok(!rzpEvt.description.toLowerCase().includes("payment completed"));
  });

  it("6. Pending approval timeline represents DECISION_RECEIPT as PENDING with Active (SHA-256) title and pre-authorization description", () => {
    const sampleReceipt: DecisionReceipt = {
      id: "rcpt_pending_01",
      executionId: "exec_pending_01",
      workflowId: "wf_pending_01",
      receiptVersion: "1.0.0",
      integrityHash: "sha256_mock_seal_pending_0123456789abcdef",
      createdAt: "2026-09-03T12:00:00.000Z",
      payload: {
        receiptId: "rcpt_pending_01",
        executionId: "exec_pending_01",
        workflowId: "wf_pending_01",
        createdAt: "2026-09-03T12:00:00.000Z",
        receiptVersion: "1.0.0",
        userIntent: { sourceInstruction: "Buy ergonomic mechanical keyboard" },
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_keyboard_01",
          productTitle: "Ergonomic Mechanical Keyboard",
          amount: 4999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
          quantity: 1,
        },
        catalogSnapshot: {
          productId: "prod_keyboard_01",
          title: "Ergonomic Mechanical Keyboard",
          price: 4999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
        },
        policyDecision: {
          decision: "ESCALATED",
          allowed: false,
          riskLevel: "MEDIUM",
          riskScore: "MEDIUM",
          reasons: ["Amount exceeds limit"],
          policyVersion: "1.0.0",
          timestamp: "2026-09-03T12:00:00.100Z",
          untrustedInputDetected: false,
        },
        finalOutcome: {
          status: "PENDING_APPROVAL",
          completedAt: "2026-09-03T12:00:00.300Z",
        },
      },
    };

    const timeline = buildExecutionTimeline({
      executionId: "exec_pending_01",
      status: "PENDING_APPROVAL",
      context: {
        transactionIntent: sampleReceipt.payload.transactionIntent,
        policyEvaluation: sampleReceipt.payload.policyDecision,
      },
      receipt: sampleReceipt,
    });

    const receiptEvt = timeline.events.find((e) => e.stage === "DECISION_RECEIPT");
    assert.ok(receiptEvt);
    assert.strictEqual(receiptEvt.status, "PENDING");
    assert.strictEqual(receiptEvt.title, "Commerce Decision Receipt Active (SHA-256)");
    assert.ok(receiptEvt.description.includes("awaiting human authorization before final seal"));

    const finalEvt = timeline.events.find((e) => e.stage === "FINAL_OUTCOME");
    assert.ok(finalEvt);
    assert.strictEqual(finalEvt.status, "PENDING");
  });

  it("7. Terminal success and denied executions represent DECISION_RECEIPT as COMPLETED with Sealed (SHA-256) title", () => {
    // 1. Success Terminal
    const successTimeline = buildExecutionTimeline({
      executionId: "exec_term_success_01",
      status: "SUCCESS",
      receipt: {
        id: "rcpt_success_01",
        executionId: "exec_term_success_01",
        workflowId: "wf_01",
        receiptVersion: "1.0.0",
        integrityHash: "sha256_mock_seal_success_0123456789abcdef",
        createdAt: "2026-09-03T12:00:00.000Z",
        payload: {
          receiptId: "rcpt_success_01",
          executionId: "exec_term_success_01",
          workflowId: "wf_01",
          createdAt: "2026-09-03T12:00:00.000Z",
          receiptVersion: "1.0.0",
          userIntent: { sourceInstruction: "Buy mouse" },
          transactionIntent: {
            action: "payment.execute",
            productId: "prod_mouse_02",
            productTitle: "Wireless Precision Mouse",
            merchantId: "merchant_nodebase_01",
            amount: 1999,
            currency: "INR",
          },
          catalogSnapshot: { productId: "prod_mouse_02", title: "Wireless Precision Mouse", price: 1999, currency: "INR", merchantId: "merchant_nodebase_01" },
          policyDecision: { decision: "APPROVED", allowed: true, riskLevel: "LOW", riskScore: "LOW", reasons: [], policyVersion: "1.0.0", timestamp: "2026-09-03T12:00:00.100Z", untrustedInputDetected: false },
          finalOutcome: { status: "SUCCESS", completedAt: "2026-09-03T12:00:01.000Z" },
        },
      },
    });

    const successReceiptEvt = successTimeline.events.find((e) => e.stage === "DECISION_RECEIPT");
    assert.ok(successReceiptEvt);
    assert.strictEqual(successReceiptEvt.status, "COMPLETED");
    assert.strictEqual(successReceiptEvt.title, "Commerce Decision Receipt Sealed (SHA-256)");

    // 2. Denied Terminal
    const deniedTimeline = buildExecutionTimeline({
      executionId: "exec_term_denied_01",
      status: "FAILED",
      receipt: {
        id: "rcpt_denied_01",
        executionId: "exec_term_denied_01",
        workflowId: "wf_01",
        receiptVersion: "1.0.0",
        integrityHash: "sha256_mock_seal_denied_0123456789abcdef",
        createdAt: "2026-09-03T12:00:00.000Z",
        payload: {
          receiptId: "rcpt_denied_01",
          executionId: "exec_term_denied_01",
          workflowId: "wf_01",
          createdAt: "2026-09-03T12:00:00.000Z",
          receiptVersion: "1.0.0",
          userIntent: { sourceInstruction: "Buy mouse" },
          transactionIntent: {
            action: "payment.execute",
            productId: "prod_mouse_02",
            productTitle: "Wireless Precision Mouse",
            merchantId: "merchant_nodebase_01",
            amount: 1999,
            currency: "INR",
          },
          catalogSnapshot: { productId: "prod_mouse_02", title: "Wireless Precision Mouse", price: 1999, currency: "INR", merchantId: "merchant_nodebase_01" },
          policyDecision: { decision: "DENIED", allowed: false, riskLevel: "HIGH", riskScore: "HIGH", reasons: ["Denied"], policyVersion: "1.0.0", timestamp: "2026-09-03T12:00:00.100Z", untrustedInputDetected: false },
          finalOutcome: { status: "FAILED", completedAt: "2026-09-03T12:00:01.000Z" },
        },
      },
    });

    const deniedReceiptEvt = deniedTimeline.events.find((e) => e.stage === "DECISION_RECEIPT");
    assert.ok(deniedReceiptEvt);
    assert.strictEqual(deniedReceiptEvt.status, "COMPLETED");
    assert.strictEqual(deniedReceiptEvt.title, "Commerce Decision Receipt Sealed (SHA-256)");
  });
});
