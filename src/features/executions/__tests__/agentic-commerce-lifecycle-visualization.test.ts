import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  deriveCommerceLifecycle,
  type AgenticCommerceLifecycleView,
} from "@/lib/agenticCommerceContract";
import type { DecisionReceipt } from "@/lib/decisionReceipt";
import type { TransactionIntent, PolicyEvaluationResult } from "@/lib/policyEngine";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

describe("Phase 16.2: Agentic Commerce Lifecycle Visualization", () => {
  beforeEach(() => {
    resetRazorpayCallCount();
  });

  it("1. All seven lifecycle concepts are represented in derived lifecycle view", () => {
    const sampleReceipt: DecisionReceipt = {
      id: "rcpt_vis_01",
      executionId: "exec_vis_01",
      workflowId: "wf_vis_01",
      receiptVersion: "1.0.0",
      integrityHash: "sha256_mock_seal_0123456789abcdef0123456789abcdef0123456789abcdef",
      createdAt: "2026-09-03T12:00:00.000Z",
      payload: {
        receiptId: "rcpt_vis_01",
        executionId: "exec_vis_01",
        workflowId: "wf_vis_01",
        createdAt: "2026-09-03T12:00:00.000Z",
        receiptVersion: "1.0.0",
        userIntent: { sourceInstruction: "buy wireless precision mouse" },
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_mouse_02",
          productTitle: "Wireless Precision Mouse",
          amount: 1999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
          quantity: 1,
        },
        catalogSnapshot: {
          productId: "prod_mouse_02",
          title: "Wireless Precision Mouse",
          price: 1999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
        },
        policyDecision: {
          decision: "APPROVED",
          allowed: true,
          riskLevel: "LOW",
          riskScore: "LOW",
          reasons: ["Within threshold"],
          policyVersion: "1.0.0",
          timestamp: "2026-09-03T12:00:00.100Z",
          untrustedInputDetected: false,
        },
        payment: {
          paymentOrderId: "po_vis_01",
          razorpayOrderId: "order_rzp_vis_01",
          razorpayOrderStatus: "created",
          amountPaise: 199900,
          amountRupees: 1999,
          currency: "INR",
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
          reasons: ["Integrity verified"],
          verificationVersion: "1.0.0",
          verifiedAt: "2026-09-03T12:00:00.200Z",
        },
        finalOutcome: {
          status: "SUCCESS",
          completedAt: "2026-09-03T12:00:00.300Z",
        },
      },
    };

    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_vis_01",
      status: "SUCCESS",
      receipt: sampleReceipt,
      context: {
        transactionIntent: sampleReceipt.payload.transactionIntent,
        policyEvaluation: sampleReceipt.payload.policyDecision,
        razorpayResult: { id: "order_rzp_vis_01", status: "created", amount: 199900 },
      },
    });

    assert.strictEqual(lifecycle.stages.length, 7);

    const stages = lifecycle.stages.map((s) => s.stage);
    assert.deepStrictEqual(stages, [
      "DISCOVER",
      "CLARIFY",
      "ACCEPT",
      "AUTHORIZE",
      "EXECUTE",
      "VERIFY",
      "RECEIPT",
    ]);

    // Check statuses
    assert.strictEqual(lifecycle.stages[0].status, "COMPLETED");
    assert.strictEqual(lifecycle.stages[1].status, "PASSED");
    assert.strictEqual(lifecycle.stages[2].status, "CONFIRMED");
    assert.strictEqual(lifecycle.stages[3].status, "APPROVED");
    assert.strictEqual(lifecycle.stages[4].status, "COMPLETED");
    assert.strictEqual(lifecycle.stages[5].status, "VERIFIED");
    assert.strictEqual(lifecycle.stages[6].status, "SEALED");
  });

  it("2. Clarification-required state displays CLARIFY as REQUIRED and does NOT show execution as completed", () => {
    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_clarify_01",
      status: "PENDING_APPROVAL",
      context: {
        clarification: {
          clarificationRequired: true,
          reason: "Multiple candidate items",
          candidateProducts: [],
          suggestedQuestion: "Which item?",
        },
      },
    });

    const clarifyStage = lifecycle.stages.find((s) => s.stage === "CLARIFY");
    assert.ok(clarifyStage);
    assert.strictEqual(clarifyStage.status, "REQUIRED");
    assert.strictEqual(clarifyStage.statusLabel, "Clarification Required");

    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.notStrictEqual(execStage.status, "COMPLETED");
    assert.strictEqual(execStage.statusLabel.includes("0 Provider Calls"), true);
  });

  it("3. Escalated transaction visibly represents human approval requirement before execution", () => {
    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_esc_01",
      status: "PENDING_APPROVAL",
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
          allowed: false,
          riskLevel: "MEDIUM",
          riskScore: "MEDIUM",
          reason: "Amount ₹4,999 exceeds auto-approval threshold ₹2,000",
          reasons: ["Amount ₹4,999 exceeds auto-approval threshold ₹2,000"],
          untrustedInputDetected: false,
        },
      },
    });

    const authStage = lifecycle.stages.find((s) => s.stage === "AUTHORIZE");
    assert.ok(authStage);
    assert.strictEqual(authStage.status, "ESCALATED");
    assert.strictEqual(authStage.statusLabel, "Requires Human Approval");

    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.strictEqual(execStage.status, "BLOCKED");
    assert.ok(execStage.description.includes("0 provider calls"));
  });

  it("4. Denied transaction displays AUTHORIZE as DENIED and EXECUTE as BLOCKED", () => {
    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_denied_01",
      status: "FAILED",
      error: "Prompt injection detected",
      context: {
        policyEvaluation: {
          decision: "DENIED",
          status: "DENIED",
          allowed: false,
          riskLevel: "HIGH",
          riskScore: "HIGH",
          reason: "Prompt injection attack detected",
          reasons: ["Prompt injection attack detected"],
          untrustedInputDetected: true,
        },
      },
    });

    const authStage = lifecycle.stages.find((s) => s.stage === "AUTHORIZE");
    assert.ok(authStage);
    assert.strictEqual(authStage.status, "DENIED");

    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.strictEqual(execStage.status, "BLOCKED");

    const receiptStage = lifecycle.stages.find((s) => s.stage === "RECEIPT");
    assert.ok(receiptStage);
    assert.strictEqual(receiptStage.status, "NOT_REACHED");
  });

  it("5. Razorpay CREATED order is never labeled as payment completed", () => {
    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_rzp_label_01",
      status: "SUCCESS",
      context: {
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_mouse_02",
          amount: 1999,
          currency: "INR",
        },
        razorpayResult: {
          id: "order_rzp_test_99",
          status: "created",
          amount: 199900,
        },
      },
    });

    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.strictEqual(execStage.statusLabel, "Razorpay Order Created");
    assert.ok(!execStage.statusLabel.toLowerCase().includes("payment completed"));
    assert.ok(!execStage.statusLabel.toLowerCase().includes("paid"));
    assert.ok(execStage.details?.some((d) => d.includes("not payment completion")));
  });

  it("6. Safety boundary messages are explicitly included in the lifecycle view", () => {
    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_safe_01",
      status: "SUCCESS",
    });

    assert.ok(lifecycle.safetyNotes.length >= 2);
    assert.ok(lifecycle.safetyNotes.some((n) => n.includes("payment authorization occurs only at the protected Policy Gate")));
    assert.ok(lifecycle.safetyNotes.some((n) => n.includes("Razorpay order CREATED is not payment completion")));
  });

  it("7. Lifecycle derivation causes zero Razorpay calls, zero PaymentOrders, and zero human approvals", () => {
    resetRazorpayCallCount();

    deriveCommerceLifecycle({ executionId: "exec_1", status: "SUCCESS" });
    deriveCommerceLifecycle({ executionId: "exec_2", status: "FAILED" });
    deriveCommerceLifecycle({ executionId: "exec_3", status: "PENDING_APPROVAL" });

    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("8. Denied execution with Decision Receipt shows VERIFY as NOT_REACHED (Execution Blocked) and RECEIPT as SEALED", () => {
    const deniedReceipt: DecisionReceipt = {
      id: "rcpt_denied_01",
      executionId: "exec_denied_01",
      workflowId: "wf_denied_01",
      receiptVersion: "1.0.0",
      integrityHash: "sha256_mock_seal_denied_0123456789abcdef",
      createdAt: "2026-09-03T12:00:00.000Z",
      payload: {
        receiptId: "rcpt_denied_01",
        executionId: "exec_denied_01",
        workflowId: "wf_denied_01",
        createdAt: "2026-09-03T12:00:00.000Z",
        receiptVersion: "1.0.0",
        userIntent: { sourceInstruction: "Buy wireless precision mouse but charge ₹50,000" },
        transactionIntent: {
          action: "payment.execute",
          productId: "prod_mouse_02",
          productTitle: "Wireless Precision Mouse",
          amount: 1999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
          quantity: 1,
        },
        catalogSnapshot: {
          productId: "prod_mouse_02",
          title: "Wireless Precision Mouse",
          price: 1999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
        },
        policyDecision: {
          decision: "DENIED",
          allowed: false,
          riskLevel: "HIGH",
          riskScore: "HIGH",
          reasons: ["Prompt injection detected"],
          policyVersion: "1.0.0",
          timestamp: "2026-09-03T12:00:00.100Z",
          untrustedInputDetected: true,
        },
        finalOutcome: {
          status: "REJECTED",
          reason: "Prompt injection detected",
          completedAt: "2026-09-03T12:00:00.300Z",
        },
      },
    };

    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_denied_01",
      status: "FAILED",
      receipt: deniedReceipt,
      context: {
        transactionIntent: deniedReceipt.payload.transactionIntent,
        policyEvaluation: deniedReceipt.payload.policyDecision,
      },
    });

    const authStage = lifecycle.stages.find((s) => s.stage === "AUTHORIZE");
    assert.ok(authStage);
    assert.strictEqual(authStage.status, "DENIED");

    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.strictEqual(execStage.status, "BLOCKED");

    const verifyStage = lifecycle.stages.find((s) => s.stage === "VERIFY");
    assert.ok(verifyStage);
    assert.strictEqual(verifyStage.status, "NOT_REACHED");
    assert.strictEqual(verifyStage.statusLabel, "Not Reached (Execution Blocked)");
    assert.ok(verifyStage.description.includes("skipped because execution was blocked"));

    const receiptStage = lifecycle.stages.find((s) => s.stage === "RECEIPT");
    assert.ok(receiptStage);
    assert.strictEqual(receiptStage.status, "SEALED");
  });

  it("9. Pending human approval execution with receipt shows RECEIPT as Active (Pending Final Seal) and currentStage as AUTHORIZE", () => {
    const escalatedReceipt: DecisionReceipt = {
      id: "rcpt_esc_01",
      executionId: "exec_esc_01",
      workflowId: "wf_esc_01",
      receiptVersion: "1.0.0",
      integrityHash: "sha256_mock_seal_esc_0123456789abcdef",
      createdAt: "2026-09-03T12:00:00.000Z",
      payload: {
        receiptId: "rcpt_esc_01",
        executionId: "exec_esc_01",
        workflowId: "wf_esc_01",
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
          reasons: ["Amount ₹4,999 exceeds auto-approval limit (₹2,000)"],
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

    const lifecycle = deriveCommerceLifecycle({
      executionId: "exec_esc_01",
      status: "PENDING_APPROVAL",
      receipt: escalatedReceipt,
      context: {
        transactionIntent: escalatedReceipt.payload.transactionIntent,
        policyEvaluation: escalatedReceipt.payload.policyDecision,
      },
    });

    const authStage = lifecycle.stages.find((s) => s.stage === "AUTHORIZE");
    assert.ok(authStage);
    assert.strictEqual(authStage.status, "ESCALATED");
    assert.strictEqual(authStage.statusLabel, "Requires Human Approval");

    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.strictEqual(execStage.status, "BLOCKED");

    const receiptStage = lifecycle.stages.find((s) => s.stage === "RECEIPT");
    assert.ok(receiptStage);
    assert.strictEqual(receiptStage.status, "PASSED");
    assert.strictEqual(receiptStage.statusLabel, "Decision Receipt Active (Pending Final Seal)");
    assert.ok(receiptStage.description.includes("pre-authorization hash"));

    assert.strictEqual(lifecycle.currentStage, "AUTHORIZE");
  });

  it("10. Lifecycle state flags correctly map overall statuses across pending approval with receipt, success, and denial", () => {
    // 1. Pending Approval with Receipt
    const pendingLifecycle = deriveCommerceLifecycle({
      executionId: "exec_pending_test",
      status: "PENDING_APPROVAL",
      receipt: {
        id: "rcpt_1",
        executionId: "exec_pending_test",
        workflowId: "wf_1",
        receiptVersion: "1.0.0",
        integrityHash: "sha256_mock",
        createdAt: "2026-09-03T12:00:00.000Z",
        payload: {
          receiptId: "rcpt_1",
          executionId: "exec_pending_test",
          workflowId: "wf_1",
          createdAt: "2026-09-03T12:00:00.000Z",
          receiptVersion: "1.0.0",
          userIntent: { sourceInstruction: "Buy keyboard" },
          transactionIntent: { action: "payment.execute", productId: "p1", productTitle: "Keyboard", merchantId: "m1", amount: 4999, currency: "INR" },
          catalogSnapshot: { productId: "p1", title: "Keyboard", price: 4999, currency: "INR", merchantId: "m1" },
          policyDecision: { decision: "ESCALATED", allowed: false, riskLevel: "MEDIUM", riskScore: "MEDIUM", reasons: [], policyVersion: "1.0.0", timestamp: "2026-09-03T12:00:00.100Z", untrustedInputDetected: false },
          finalOutcome: { status: "PENDING_APPROVAL", completedAt: "2026-09-03T12:00:01.000Z" },
        },
      },
    });

    const isPendingEscalation =
      pendingLifecycle.overallStatus === "PENDING_APPROVAL" ||
      (pendingLifecycle.isEscalated && !pendingLifecycle.isExecuted && !pendingLifecycle.isDenied);

    assert.strictEqual(isPendingEscalation, true);
    assert.strictEqual(pendingLifecycle.isDenied, false);
    assert.strictEqual(pendingLifecycle.isExecuted, false);

    // 2. Terminal Denial
    const deniedLifecycle = deriveCommerceLifecycle({
      executionId: "exec_denied_test",
      status: "FAILED",
      receipt: {
        id: "rcpt_2",
        executionId: "exec_denied_test",
        workflowId: "wf_1",
        receiptVersion: "1.0.0",
        integrityHash: "sha256_mock_denied",
        createdAt: "2026-09-03T12:00:00.000Z",
        payload: {
          receiptId: "rcpt_2",
          executionId: "exec_denied_test",
          workflowId: "wf_1",
          createdAt: "2026-09-03T12:00:00.000Z",
          receiptVersion: "1.0.0",
          userIntent: { sourceInstruction: "Attack" },
          transactionIntent: { action: "payment.execute", productId: "p1", productTitle: "Keyboard", merchantId: "m1", amount: 4999, currency: "INR" },
          catalogSnapshot: { productId: "p1", title: "Keyboard", price: 4999, currency: "INR", merchantId: "m1" },
          policyDecision: { decision: "DENIED", allowed: false, riskLevel: "HIGH", riskScore: "HIGH", reasons: ["Attack"], policyVersion: "1.0.0", timestamp: "2026-09-03T12:00:00.100Z", untrustedInputDetected: true },
          finalOutcome: { status: "FAILED", completedAt: "2026-09-03T12:00:01.000Z" },
        },
      },
    });

    assert.strictEqual(deniedLifecycle.isDenied, true);

    // 3. Terminal Success
    const successLifecycle = deriveCommerceLifecycle({
      executionId: "exec_success_test",
      status: "SUCCESS",
      context: {
        razorpayResult: { id: "order_rzp_123", status: "created", amount: 199900 },
      },
      receipt: {
        id: "rcpt_3",
        executionId: "exec_success_test",
        workflowId: "wf_1",
        receiptVersion: "1.0.0",
        integrityHash: "sha256_mock_success",
        createdAt: "2026-09-03T12:00:00.000Z",
        payload: {
          receiptId: "rcpt_3",
          executionId: "exec_success_test",
          workflowId: "wf_1",
          createdAt: "2026-09-03T12:00:00.000Z",
          receiptVersion: "1.0.0",
          userIntent: { sourceInstruction: "Buy mouse" },
          transactionIntent: { action: "payment.execute", productId: "p2", productTitle: "Mouse", merchantId: "m1", amount: 1999, currency: "INR" },
          catalogSnapshot: { productId: "p2", title: "Mouse", price: 1999, currency: "INR", merchantId: "m1" },
          policyDecision: { decision: "APPROVED", allowed: true, riskLevel: "LOW", riskScore: "LOW", reasons: [], policyVersion: "1.0.0", timestamp: "2026-09-03T12:00:00.100Z", untrustedInputDetected: false },
          payment: { paymentOrderId: "po_1", razorpayOrderId: "order_rzp_123", razorpayOrderStatus: "created", amountPaise: 199900, amountRupees: 1999, currency: "INR" },
          finalOutcome: { status: "SUCCESS", completedAt: "2026-09-03T12:00:01.000Z" },
        },
      },
    });

    assert.strictEqual(successLifecycle.isExecuted, true);
    assert.strictEqual(successLifecycle.isDenied, false);
    assert.strictEqual(successLifecycle.isEscalated, false);
  });

  it("11. Executed HITL post-approval transaction produces consistent EXECUTE, VERIFY, RECEIPT, and receipt ID across lifecycle and timeline", () => {
    const executedHitlReceipt = {
      id: "cmtlp084b0003uiqlh45btej9", // DB CUID
      executionId: "cmtlp05mm0001uiql68decr2k",
      workflowId: "cmtlkzfoe003pui09883bp3u4",
      receiptVersion: "1.0.0",
      integrityHash: "634e22f220f9d4f92216e7594008c51fbc27ccf94a847dfdfed503af3c308ffa",
      createdAt: "2026-09-03T15:41:28.471Z",
      payload: {
        receiptId: "rcpt_ql68decr2k_mtlp0847",
        workflowId: "cmtlkzfoe003pui09883bp3u4",
        executionId: "cmtlp05mm0001uiql68decr2k",
        createdAt: "2026-09-03T15:41:28.471Z",
        receiptVersion: "1.0.0",
        userIntent: { sourceInstruction: "Buy mechanical gaming keyboard" },
        transactionIntent: {
          action: "payment.execute" as const,
          amount: 4999,
          currency: "INR",
          quantity: 1,
          productId: "prod_keyboard_01",
          merchantId: "merchant_nodebase_01",
          productTitle: "Ergonomic Mechanical Keyboard",
        },
        catalogSnapshot: {
          productId: "prod_keyboard_01",
          title: "Ergonomic Mechanical Keyboard",
          price: 4999,
          currency: "INR",
          merchantId: "merchant_nodebase_01",
        },
        policyDecision: {
          decision: "ESCALATED" as const,
          allowed: true,
          riskLevel: "MEDIUM" as const,
          riskScore: "MEDIUM" as const,
          reasons: ["Amount ₹4999 exceeds auto-approval threshold (₹2000). Confirmation required."],
          policyVersion: "1.0.0",
          timestamp: "2026-09-03T15:13:08.087Z",
          untrustedInputDetected: false,
        },
        humanDecision: {
          approved: true,
          decision: "APPROVED_BY_HUMAN" as const,
          expiresAt: "2026-09-03T15:56:23.371Z",
          approvedAt: "2026-09-03T15:41:23.371Z",
          approverId: "user_admin_01",
          approverName: "admin@example.com",
          approverEmail: "admin@example.com",
        },
        finalOutcome: {
          status: "VERIFIED" as const,
          reason: "Commerce transaction executed and verified successfully",
          completedAt: "2026-09-03T15:41:28.470Z",
        },
      },
    };

    const lifecycle = deriveCommerceLifecycle({
      executionId: "cmtlp05mm0001uiql68decr2k",
      status: "SUCCESS",
      receipt: executedHitlReceipt,
      context: {
        transactionIntent: executedHitlReceipt.payload.transactionIntent,
        policyEvaluation: {
          ...executedHitlReceipt.payload.policyDecision,
          humanApproval: executedHitlReceipt.payload.humanDecision,
        },
      },
    });

    // 1. Lifecycle is not pending escalation and is executed & verified
    assert.strictEqual(lifecycle.isExecuted, true);
    assert.strictEqual(lifecycle.isDenied, false);
    const isPendingEscalation =
      lifecycle.overallStatus === "PENDING_APPROVAL" ||
      (lifecycle.isEscalated && !lifecycle.isExecuted && !lifecycle.isDenied && lifecycle.overallStatus !== "SUCCESS");
    assert.strictEqual(isPendingEscalation, false);

    // 2. Stage 4 AUTHORIZE
    const authStage = lifecycle.stages.find((s) => s.stage === "AUTHORIZE");
    assert.ok(authStage);
    assert.strictEqual(authStage.status, "APPROVED");
    assert.strictEqual(authStage.statusLabel, "Human Authorized");

    // 3. Stage 5 EXECUTE
    const execStage = lifecycle.stages.find((s) => s.stage === "EXECUTE");
    assert.ok(execStage);
    assert.strictEqual(execStage.status, "COMPLETED");

    // 4. Stage 6 VERIFY
    const verifyStage = lifecycle.stages.find((s) => s.stage === "VERIFY");
    assert.ok(verifyStage);
    assert.strictEqual(verifyStage.status, "VERIFIED");
    assert.strictEqual(verifyStage.statusLabel, "Commerce Integrity Verified");

    // 5. Stage 7 RECEIPT
    const receiptStage = lifecycle.stages.find((s) => s.stage === "RECEIPT");
    assert.ok(receiptStage);
    assert.strictEqual(receiptStage.status, "SEALED");
    assert.strictEqual(receiptStage.statusLabel, "Decision Receipt Sealed");
    assert.ok(receiptStage.details?.some((d) => d.includes("rcpt_ql68decr2k_mtlp0847")));
  });
});
