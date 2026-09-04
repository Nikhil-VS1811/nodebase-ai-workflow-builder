import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { NonRetriableError } from "inngest";
import {
  recordRazorpayCall,
  getRazorpayCallCount,
  resetRazorpayCallCount,
  setRazorpayMockHandler,
} from "@/lib/razorpayInstrumentation";
import { razorpayExecutor } from "@/features/executions/components/razorpay/executor";
import { encrypt } from "@/lib/encryption";
import {
  getOrCreatePaymentOrder,
  updatePaymentOrderRazorpayId,
  findPaymentOrderByKey,
  PaymentOrderStatus,
} from "@/lib/paymentOrder";
import type { TransactionIntent, PolicyEvaluationResult } from "@/lib/policyEngine";

describe("Phase 9.4d: Integrate PaymentOrder into Razorpay Execution", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const mockPublish = async () => {};

  const validApprovedContext = {
    userMessage: "Buy one wireless precision mouse",
    idempotencyKey: "idem_mouse_integration_94d",
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

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    resetRazorpayCallCount();
    setRazorpayMockHandler(null);
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    resetRazorpayCallCount();
    setRazorpayMockHandler(null);
  });

  it("1. New PaymentOrder causes exactly one Razorpay create", async () => {
    const mockStep = {
      run: async (name: string, fn: () => Promise<any>) => {
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

    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_first_time_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const resultContext = await razorpayExecutor({
      data: { credentialId: "cred_123" },
      nodeId: "rp_node_first",
      userId: "user_123",
      context: validApprovedContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.strictEqual(getRazorpayCallCount(), 1);
    assert.ok(resultContext.razorpayResult);
    assert.strictEqual((resultContext.razorpayResult as any).id, "order_rzp_first_time_01");
  });

  it("2. Existing PaymentOrder with razorpayOrderId reuses existing order and causes zero new Razorpay calls", async () => {
    // Simulate step returning an already confirmed PaymentOrder
    const mockStepWithExistingOrder = {
      run: async (name: string, fn: () => Promise<any>) => {
        if (name.startsWith("payment-order-init-")) {
          return {
            id: "po_existing_123",
            executionId: "exec_123",
            nodeId: "rp_node_existing",
            idempotencyKey: "idem_mouse_integration_94d",
            razorpayOrderId: "order_rzp_pre_existing_999",
            status: PaymentOrderStatus.CREATED,
            amount: 1999,
            currency: "INR",
          };
        }
        if (name.startsWith("get-credential-")) {
          return {
            id: "cred_123",
            name: "Test Credential",
            type: "RAZORPAY",
            value: encrypt("rzp_test:rzp_secret"),
          };
        }
        return fn();
      },
    } as any;

    setRazorpayMockHandler(async () => {
      throw new Error("Should never be called when order already exists!");
    });

    const resultContext = await razorpayExecutor({
      data: { credentialId: "cred_123" },
      nodeId: "rp_node_existing",
      userId: "user_123",
      context: validApprovedContext,
      step: mockStepWithExistingOrder,
      publish: mockPublish,
    });

    // Zero new calls to Razorpay boundary!
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.ok(resultContext.razorpayResult);
    assert.strictEqual((resultContext.razorpayResult as any).id, "order_rzp_pre_existing_999");
  });

  it("3. Same logical idempotencyKey is preserved and used for provider receipt", async () => {
    let capturedReceipt: string | undefined;

    const mockStep = {
      run: async (name: string, fn: () => Promise<any>) => {
        if (name.startsWith("get-credential-")) {
          return {
            id: "cred_123",
            name: "Test Credential",
            type: "RAZORPAY",
            value: encrypt("rzp_test:rzp_secret"),
          };
        }
        return fn();
      },
    } as any;

    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => {
      capturedReceipt = receipt;
      return {
        id: "order_rzp_receipt_test",
        amount,
        currency,
        receipt,
        status: "created",
        notes,
        created_at: 123456,
      };
    });

    await razorpayExecutor({
      data: { credentialId: "cred_123" },
      nodeId: "rp_node_receipt",
      userId: "user_123",
      context: validApprovedContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.ok(capturedReceipt);
    assert.ok(capturedReceipt.includes("idem_mouse_integration_94d".slice(0, 16)));
  });

  it("4. Unauthorized execution is blocked before PaymentOrder or Razorpay is called", async () => {
    const unauthorizedContext = {
      transactionIntent: validApprovedContext.transactionIntent,
      policyEvaluation: {
        decision: "DENIED",
        status: "DENIED",
        allowed: false,
        reason: "Blocked by policy",
      },
    };

    const mockStep = {
      run: async (_name: string, fn: () => Promise<any>) => fn(),
    } as any;

    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_123" },
          nodeId: "rp_node_unauth",
          userId: "user_123",
          context: unauthorizedContext,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof NonRetriableError);
        assert.ok(err.message.includes("DENIED"));
        return true;
      },
    );

    assert.strictEqual(getRazorpayCallCount(), 0);
  });
});
