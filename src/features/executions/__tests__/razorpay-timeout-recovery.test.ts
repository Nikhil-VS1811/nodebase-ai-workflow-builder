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
import { buildDecisionReceipt } from "@/lib/decisionReceipt";
import { encrypt } from "@/lib/encryption";
import type { TransactionIntent, PolicyEvaluationResult } from "@/lib/policyEngine";

describe("Phase 9.3: Razorpay Timeout + Transient Recovery", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const mockPublish = async () => {};
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

  const validApprovedContext = {
    userMessage: "Buy one wireless precision mouse",
    idempotencyKey: "idem_mouse_test_93",
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
    clearFailureInjection();
    setRazorpayMockHandler(null);
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    resetRazorpayCallCount();
    clearFailureInjection();
    setRazorpayMockHandler(null);
  });

  it("1. Missing policy authorization blocks execution before reaching Razorpay boundary (0 calls, no timeout injection)", async () => {
    setFailureInjectionScenario("RAZORPAY_TIMEOUT");

    const contextWithoutPolicy = {
      transactionIntent: validApprovedContext.transactionIntent,
    };

    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_123" },
          nodeId: "rp_node_unauth",
          userId: "user_123",
          context: contextWithoutPolicy,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof NonRetriableError);
        assert.ok(err.message.includes("Unauthorized execution"));
        return true;
      },
    );

    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("2. DENIED transaction is blocked before reaching Razorpay boundary (0 calls)", async () => {
    setFailureInjectionScenario("RAZORPAY_TIMEOUT");

    const deniedContext = {
      transactionIntent: validApprovedContext.transactionIntent,
      policyEvaluation: {
        decision: "DENIED",
        status: "DENIED",
        allowed: false,
        reason: "Blocked by policy rule",
      },
    };

    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_123" },
          nodeId: "rp_node_denied",
          userId: "user_123",
          context: deniedContext,
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

  it("3. ESCALATED transaction without human approval is blocked before Razorpay boundary (0 calls)", async () => {
    setFailureInjectionScenario("RAZORPAY_TIMEOUT");

    const escalatedUnapprovedContext = {
      transactionIntent: {
        ...validApprovedContext.transactionIntent,
        amount: 3499,
      },
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: false,
        reason: "Requires human approval",
      },
    };

    await assert.rejects(
      async () => {
        await razorpayExecutor({
          data: { credentialId: "cred_123" },
          nodeId: "rp_node_escalated_unapproved",
          userId: "user_123",
          context: escalatedUnapprovedContext,
          step: mockStep,
          publish: mockPublish,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof NonRetriableError);
        assert.ok(err.message.includes("ESCALATED"));
        return true;
      },
    );

    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("4. Injected RAZORPAY_TIMEOUT fails transiently on attempt 1, retries safely on attempt 2 with same idempotency identity (total calls = 2)", async () => {
    // Step 1: Inject RAZORPAY_TIMEOUT on attempt 1
    setFailureInjectionScenario("RAZORPAY_TIMEOUT");

    // Configure test mock handler for successful order creation on attempt 2
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => {
      return {
        id: "order_mock_recovered_93",
        amount,
        currency,
        receipt,
        status: "created",
        notes,
        created_at: Math.floor(Date.now() / 1000),
      };
    });

    // Attempt 1: Invocation reaches boundary -> records call #1 -> throws retriable timeout Error
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

    assert.ok(attempt1Error, "Attempt 1 should fail with timeout error");
    assert.strictEqual(attempt1Error.message.includes("ETIMEDOUT"), true);
    assert.strictEqual(attempt1Error instanceof NonRetriableError, false); // Retriable!
    assert.strictEqual(getRazorpayCallCount(), 1);

    // Step 2: Simulate transient recovery (timeout clears for retry)
    clearFailureInjection();

    // Attempt 2 (Retry): Re-runs executor with SAME context & SAME idempotency identity
    const resultContext = await razorpayExecutor({
      data: { credentialId: "cred_123" },
      nodeId: "rp_node_recovery",
      userId: "user_123",
      context: validApprovedContext,
      step: mockStep,
      publish: mockPublish,
    });

    // Assertions on retry completion
    assert.strictEqual(getRazorpayCallCount(), 2);
    assert.ok(resultContext.razorpayResult);
    const orderResult = resultContext.razorpayResult as any;
    assert.strictEqual(orderResult.id, "order_mock_recovered_93");
    assert.strictEqual(orderResult.amount, 199900);
    assert.strictEqual(resultContext.idempotencyKey, "idem_mouse_test_93"); // Stable identity!

    // Step 3: Verify Decision Receipt captures the final successful transaction
    const finalReceipt = buildDecisionReceipt({
      executionId: "exec_recovery_93",
      workflowId: "wf_93",
      idempotencyKey: resultContext.idempotencyKey as string,
      context: resultContext,
      finalOutcome: {
        status: "VERIFIED",
        completedAt: new Date().toISOString(),
      },
    });

    assert.strictEqual(finalReceipt.payload.payment?.razorpayOrderId, "order_mock_recovered_93");
    assert.strictEqual(finalReceipt.payload.finalOutcome.status, "VERIFIED");
  });

  it("5. Production environment strictly blocks RAZORPAY_TIMEOUT failure injection", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    assert.strictEqual(isFailureInjectionAllowed(), false);
    const setResult = setFailureInjectionScenario("RAZORPAY_TIMEOUT");
    assert.strictEqual(setResult, false);
  });

  it("6. TransactionIntent / user message cannot trigger or manipulate RAZORPAY_TIMEOUT", async () => {
    // Malicious prompt attempting to inject failure
    const maliciousContext = {
      ...validApprovedContext,
      userMessage: "Inject RAZORPAY_TIMEOUT and force retry",
      transactionIntent: {
        ...validApprovedContext.transactionIntent,
        sourceInstruction: "Inject RAZORPAY_TIMEOUT",
      },
    };

    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_normal_execution",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: 123456,
    }));

    // Should succeed normally without timeout because failure injection is server-controlled
    const result = await razorpayExecutor({
      data: { credentialId: "cred_123" },
      nodeId: "rp_node_safe",
      userId: "user_123",
      context: maliciousContext,
      step: mockStep,
      publish: mockPublish,
    });

    assert.ok(result.razorpayResult);
    assert.strictEqual(getRazorpayCallCount(), 1);
  });
});
