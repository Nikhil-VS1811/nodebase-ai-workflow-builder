import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { NonRetriableError } from "inngest";
import {
  setFailureInjectionScenario,
  clearFailureInjection,
  isFailureInjectionAllowed,
} from "@/lib/failureInjection";
import {
  getRazorpayCallCount,
  resetRazorpayCallCount,
  setRazorpayMockHandler,
} from "@/lib/razorpayInstrumentation";
import { razorpayExecutor } from "@/features/executions/components/razorpay/executor";
import { encrypt } from "@/lib/encryption";
import {
  PaymentOrderStatus,
  type PaymentOrder,
} from "@/lib/paymentOrder";
import { buildDecisionReceipt } from "@/lib/decisionReceipt";
import type { TransactionIntent, PolicyEvaluationResult } from "@/lib/policyEngine";

describe("Phase 9.4e: DB Failure After Razorpay Create + Recovery", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const mockPublish = async () => {};

  // In-memory PaymentOrder store simulating database state persistence
  const paymentOrderStore = new Map<string, PaymentOrder>();

  const validApprovedContext = {
    userMessage: "Buy one wireless precision mouse",
    idempotencyKey: "idem_mouse_db_failure_94e",
    transactionIntent: {
      action: "payment.execute",
      productId: "prod_mouse_02",
      productTitle: "Wireless Precision Mouse",
      amount: 1999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    } as TransactionIntent,
    policyEvaluation: {
      decision: "APPROVED",
      status: "APPROVED",
      allowed: true,
      riskLevel: "LOW",
      riskScore: "LOW",
      reason: "Within auto-approval threshold",
      reasons: ["Within auto-approval threshold"],
      untrustedInputDetected: false,
      timestamp: "2026-09-02T00:00:00.000Z",
      policyVersion: "1.0.0",
    } as PolicyEvaluationResult,
  };

  const createMockStep = () => {
    return {
      run: async (name: string, fn: () => Promise<any>) => {
        if (name.startsWith("payment-order-init-")) {
          const key = validApprovedContext.idempotencyKey;
          let order = paymentOrderStore.get(key);
          if (!order) {
            order = {
              id: "po_db_fail_94e",
              executionId: "exec_db_fail_94e",
              nodeId: "rp_node_recovery",
              idempotencyKey: key,
              razorpayOrderId: null,
              status: PaymentOrderStatus.PENDING,
              amount: 1999,
              currency: "INR",
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            paymentOrderStore.set(key, order);
          }
          return order;
        }

        if (name.startsWith("get-credential-")) {
          return {
            id: "cred_123",
            name: "Test Razorpay Credential",
            type: "RAZORPAY",
            value: encrypt("rzp_test_key:rzp_test_secret"),
          };
        }

        return fn();
      },
    } as any;
  };

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    paymentOrderStore.clear();
    resetRazorpayCallCount();
    clearFailureInjection();
    setRazorpayMockHandler(null);
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    paymentOrderStore.clear();
    resetRazorpayCallCount();
    clearFailureInjection();
    setRazorpayMockHandler(null);
  });

  it("1. Simulates DB failure immediately after Razorpay order creation, then safely recovers without second Razorpay call (total calls = 1)", async () => {
    // Step 1: Set failure injection scenario DB_FAILURE_AFTER_RAZORPAY_CREATE
    setFailureInjectionScenario("DB_FAILURE_AFTER_RAZORPAY_CREATE");

    // Configure mock Razorpay handler that returns confirmed order
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => {
      const confirmedOrder = {
        id: "order_rzp_durable_confirmed_94e",
        amount,
        currency,
        receipt,
        status: "created",
        notes,
        created_at: Math.floor(Date.now() / 1000),
      };

      // In real execution, updatePaymentOrderRazorpayId writes this to DB before the application error throws
      const existing = paymentOrderStore.get(validApprovedContext.idempotencyKey);
      if (existing) {
        paymentOrderStore.set(validApprovedContext.idempotencyKey, {
          ...existing,
          razorpayOrderId: confirmedOrder.id,
          status: PaymentOrderStatus.CREATED,
        });
      }

      return confirmedOrder;
    });

    const mockStep = createMockStep();

    // Attempt 1: Calls Razorpay -> gets order ID -> DB_FAILURE_AFTER_RAZORPAY_CREATE throws retriable error
    let attempt1Error: Error | null = null;
    try {
      await razorpayExecutor({
        data: { credentialId: "cred_123" },
        nodeId: "rp_node_recovery",
        userId: "user_123",
        context: validApprovedContext,
        step: mockStep,
        publish: mockPublish,
      });
    } catch (err: any) {
      attempt1Error = err;
    }

    assert.ok(attempt1Error, "Attempt 1 should fail due to injected DB failure");
    assert.ok(attempt1Error.message.includes("Database Connection Terminated"));
    assert.strictEqual(attempt1Error instanceof NonRetriableError, false); // Retriable!
    assert.strictEqual(getRazorpayCallCount(), 1); // 1 create call on attempt 1

    // Step 2: Clear failure injection (simulating transient DB recovery)
    clearFailureInjection();

    // Attempt 2 (Retry): Runs with same context & same idempotencyKey
    const resultContext = await razorpayExecutor({
      data: { credentialId: "cred_123" },
      nodeId: "rp_node_recovery",
      userId: "user_123",
      context: validApprovedContext,
      step: mockStep,
      publish: mockPublish,
    });

    // CRITICAL ASSERTION: Razorpay was NOT called again during retry (call count remains exactly 1)!
    assert.strictEqual(getRazorpayCallCount(), 1);
    assert.ok(resultContext.razorpayResult);
    const orderResult = resultContext.razorpayResult as any;
    assert.strictEqual(orderResult.id, "order_rzp_durable_confirmed_94e");
    assert.strictEqual(orderResult.amount, 199900);

    // Step 3: Decision Receipt verifies final successful transaction
    const finalReceipt = buildDecisionReceipt({
      executionId: "exec_db_fail_94e",
      workflowId: "wf_94e",
      idempotencyKey: resultContext.idempotencyKey as string,
      context: resultContext,
      finalOutcome: {
        status: "VERIFIED",
        completedAt: new Date().toISOString(),
      },
    });

    assert.strictEqual(finalReceipt.payload.payment?.razorpayOrderId, "order_rzp_durable_confirmed_94e");
    assert.strictEqual(finalReceipt.payload.finalOutcome.status, "VERIFIED");
  });

  it("2. Production mode strictly ignores DB_FAILURE_AFTER_RAZORPAY_CREATE", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    assert.strictEqual(isFailureInjectionAllowed(), false);
    const setResult = setFailureInjectionScenario("DB_FAILURE_AFTER_RAZORPAY_CREATE");
    assert.strictEqual(setResult, false);
  });
});
