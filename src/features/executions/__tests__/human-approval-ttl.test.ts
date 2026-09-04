import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { NonRetriableError } from "inngest";
import {
  createHumanApprovalRecord,
  validateHumanApproval,
  isApprovalExpired,
  DEFAULT_APPROVAL_TTL_MS,
  type HumanApprovalRecord,
  type TransactionIntent,
} from "@/lib/policyEngine";
import { policyGateExecutor } from "@/features/executions/components/policy-gate/executor";
import { executeCommercePipeline } from "@/lib/commercePipeline";
import {
  getRazorpayCallCount,
  resetRazorpayCallCount,
  setRazorpayMockHandler,
} from "@/lib/razorpayInstrumentation";
import { verifyReceiptIntegrity } from "@/lib/decisionReceipt";

describe("Phase 14.3: Human Approval TTL", () => {
  const mockPublish = async () => {};
  const mockStep = {
    run: async (_name: string, fn: () => Promise<any>) => fn(),
  } as any;

  beforeEach(() => {
    resetRazorpayCallCount();
  });

  it("1. Newly created approval receives an explicit expiration timestamp with default 15-minute TTL", () => {
    const fixedNow = new Date("2026-09-03T12:00:00.000Z");
    const approval = createHumanApprovalRecord({
      approved: true,
      approverId: "admin_alice",
      approverName: "Alice Admin",
      approverEmail: "alice@example.com",
      now: fixedNow,
    });

    assert.strictEqual(approval.approved, true);
    assert.strictEqual(approval.decision, "APPROVED_BY_HUMAN");
    assert.strictEqual(approval.approvedAt, "2026-09-03T12:00:00.000Z");
    assert.strictEqual(approval.expiresAt, "2026-09-03T12:15:00.000Z"); // Exactly 15 minutes later
    assert.strictEqual(DEFAULT_APPROVAL_TTL_MS, 15 * 60 * 1000);
  });

  it("2. Valid approval within TTL validates successfully", () => {
    const approval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: "2026-09-03T12:00:00.000Z",
      expiresAt: "2026-09-03T12:15:00.000Z",
    };

    // Check at 10 minutes in (within 15-minute TTL)
    const checkTime = new Date("2026-09-03T12:10:00.000Z");
    const result = validateHumanApproval(approval, checkTime);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.expired, false);
    assert.strictEqual(isApprovalExpired(approval, checkTime), false);
  });

  it("3. Valid approval within TTL authorizes execution through canonical commerce pipeline with 1 provider call", async () => {
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_ttl_valid_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const escalatedIntent: TransactionIntent = {
      action: "payment.execute",
      productId: "prod_keyboard_01",
      productTitle: "Ergonomic Mechanical Keyboard",
      amount: 4999, // Exceeds auto-approve threshold
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    };

    // Valid approval created now
    const validApproval = createHumanApprovalRecord({
      approved: true,
      approverId: "admin_alice",
    });

    const execResult = await executeCommercePipeline({
      transactionIntent: escalatedIntent,
      humanApproval: validApproval,
    });

    assert.strictEqual(execResult.status, "SUCCESS");
    assert.strictEqual(execResult.allowed, true);
    assert.strictEqual(execResult.policyDecision, "ESCALATED");
    assert.strictEqual(execResult.razorpayCallCount, 1);
    assert.ok(execResult.razorpayOrder);
    assert.strictEqual(execResult.razorpayOrder.amount, 499900);
    assert.ok(execResult.decisionReceipt);
    assert.strictEqual(execResult.decisionReceipt.payload.humanDecision?.expiresAt, validApproval.expiresAt);

    const verification = verifyReceiptIntegrity({
      payload: execResult.decisionReceipt.payload,
      integrityHash: execResult.decisionReceipt.integrityHash,
    });
    assert.strictEqual(verification.valid, true);
  });

  it("4. Expired approval is rejected by validateHumanApproval", () => {
    const approval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: "2026-09-03T12:00:00.000Z",
      expiresAt: "2026-09-03T12:15:00.000Z",
    };

    // Check at 16 minutes (past 15-minute TTL)
    const checkTime = new Date("2026-09-03T12:16:00.000Z");
    const result = validateHumanApproval(approval, checkTime);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.expired, true);
    assert.ok(result.reason?.includes("expired"));
    assert.strictEqual(isApprovalExpired(approval, checkTime), true);
  });

  it("5. Expired approval fails closed at Policy Gate executor without allowing execution", async () => {
    const expiredApproval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T10:15:00.000Z", // Expired in the past
    };

    const contextWithExpiredApproval = {
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_keyboard_01",
        amount: 4999,
        currency: "INR",
        merchantId: "merchant_nodebase_01",
      },
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: false,
        humanApproval: expiredApproval,
      },
    };

    await assert.rejects(
      async () => {
        await policyGateExecutor({
          data: {},
          nodeId: "policy_gate_ttl_node",
          userId: "user_test",
          context: contextWithExpiredApproval,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("expired"));
        return true;
      },
    );
  });

  it("6. Expired approval produces exactly 0 Razorpay calls and 0 PaymentOrders in commerce pipeline", async () => {
    const escalatedIntent: TransactionIntent = {
      action: "payment.execute",
      productId: "prod_keyboard_01",
      productTitle: "Ergonomic Mechanical Keyboard",
      amount: 4999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    };

    const expiredApproval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T10:15:00.000Z",
    };

    const execResult = await executeCommercePipeline({
      transactionIntent: escalatedIntent,
      humanApproval: expiredApproval,
    });

    assert.strictEqual(execResult.status, "DENIED");
    assert.strictEqual(execResult.allowed, false);
    assert.strictEqual(execResult.policyDecision, "DENIED");
    assert.strictEqual(execResult.razorpayCallCount, 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.strictEqual(execResult.razorpayOrder, undefined);
    assert.strictEqual(execResult.context.paymentOrder, undefined);
    assert.ok(execResult.failureReason?.includes("expired"));
  });

  it("7. Approval without explicit expiresAt defaults safely to approvedAt + DEFAULT_APPROVAL_TTL_MS", () => {
    const oldApproval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // Approved 30 mins ago
    };

    const result = validateHumanApproval(oldApproval);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.expired, true);
  });

  it("8. Malformed or invalid expiresAt date format fails closed", () => {
    const malformedApproval: HumanApprovalRecord = {
      approved: true,
      approverId: "admin_alice",
      decision: "APPROVED_BY_HUMAN",
      approvedAt: new Date().toISOString(),
      expiresAt: "invalid-date-string",
    };

    const result = validateHumanApproval(malformedApproval);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes("Invalid expiresAt"));
  });

  it("9. Non-escalated transactions within auto-approve threshold execute normally without requiring human approval", async () => {
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_auto_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const inPolicyIntent: TransactionIntent = {
      action: "payment.execute",
      productId: "prod_mouse_02",
      productTitle: "Wireless Precision Mouse",
      amount: 1999, // Below ₹2,000 auto-approval threshold
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    };

    const execResult = await executeCommercePipeline({
      transactionIntent: inPolicyIntent,
    });

    assert.strictEqual(execResult.status, "SUCCESS");
    assert.strictEqual(execResult.allowed, true);
    assert.strictEqual(execResult.policyDecision, "APPROVED");
    assert.strictEqual(execResult.razorpayCallCount, 1);
  });
});
