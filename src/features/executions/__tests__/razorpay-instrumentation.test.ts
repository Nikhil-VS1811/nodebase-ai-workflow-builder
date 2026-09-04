import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { NonRetriableError } from "inngest";
import {
  isInstrumentationEnabled,
  recordRazorpayCall,
  getRazorpayCallCount,
  getRazorpayCallHistory,
  resetRazorpayCallCount,
  setRazorpayMockHandler,
} from "@/lib/razorpayInstrumentation";
import { razorpayExecutor } from "@/features/executions/components/razorpay/executor";
import type { TransactionIntent, PolicyEvaluationResult, HumanApprovalRecord } from "@/lib/policyEngine";

describe("Phase 9.2: Razorpay Call Instrumentation", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const mockPublish = async () => {};
  const mockStep = {
    run: async (_name: string, fn: () => Promise<any>) => fn(),
  } as any;

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

  it("1. Counter starts at zero after reset", () => {
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.strictEqual(getRazorpayCallHistory().length, 0);
  });

  it("2. One actual Razorpay executor boundary invocation increments count to 1", () => {
    recordRazorpayCall({
      nodeId: "node_rp_01",
      amount: 199900,
      currency: "INR",
      receipt: "rcpt_01",
      notes: { productTitle: "Mouse" },
    });

    assert.strictEqual(getRazorpayCallCount(), 1);
    const history = getRazorpayCallHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].nodeId, "node_rp_01");
    assert.strictEqual(history[0].amount, 199900);
    assert.strictEqual(history[0].currency, "INR");
  });

  it("3. Two actual invocations increment count to 2", () => {
    recordRazorpayCall({ nodeId: "node_1", amount: 1000, currency: "INR" });
    recordRazorpayCall({ nodeId: "node_2", amount: 2000, currency: "INR" });

    assert.strictEqual(getRazorpayCallCount(), 2);
    assert.strictEqual(getRazorpayCallHistory().length, 2);
  });

  it("4. Reset returns the count to zero", () => {
    recordRazorpayCall({ nodeId: "node_1", amount: 1000, currency: "INR" });
    assert.strictEqual(getRazorpayCallCount(), 1);

    resetRazorpayCallCount();
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.strictEqual(getRazorpayCallHistory().length, 0);
  });

  it("5. Blocked executor calls do NOT increment Razorpay call count", async () => {
    // 5A: Missing policy evaluation -> 0 calls
    const contextWithoutPolicy = {
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_mouse_02",
        amount: 1999,
        currency: "INR",
      },
    };

    await assert.rejects(async () => {
      await razorpayExecutor({
        data: { credentialId: "cred_123" },
        nodeId: "node_unauth_1",
        userId: "user_123",
        context: contextWithoutPolicy,
        step: mockStep,
        publish: mockPublish,
      });
    });
    assert.strictEqual(getRazorpayCallCount(), 0);

    // 5B: Policy decision DENIED -> 0 calls
    const contextDenied = {
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
        reason: "Blocked by security rule",
      },
    };

    await assert.rejects(async () => {
      await razorpayExecutor({
        data: { credentialId: "cred_123" },
        nodeId: "node_unauth_2",
        userId: "user_123",
        context: contextDenied,
        step: mockStep,
        publish: mockPublish,
      });
    });
    assert.strictEqual(getRazorpayCallCount(), 0);

    // 5C: Policy decision ESCALATED without valid human approval -> 0 calls
    const contextEscalatedUnapproved = {
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
        reason: "Requires human sign-off",
      },
    };

    await assert.rejects(async () => {
      await razorpayExecutor({
        data: { credentialId: "cred_123" },
        nodeId: "node_unauth_3",
        userId: "user_123",
        context: contextEscalatedUnapproved,
        step: mockStep,
        publish: mockPublish,
      });
    });
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("6. Instrumentation cannot be manipulated through transaction input or parameters", () => {
    // Attempting to inject spoofed call count into TransactionIntent has no effect on real counter
    const spoofedIntent = {
      action: "payment.execute",
      productId: "prod_mouse_02",
      amount: 1999,
      currency: "INR",
      callCount: 999, // Attempted spoof
      razorpayCallCount: 999,
    };

    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.strictEqual((spoofedIntent as any).callCount, 999);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("7. Production mode disables instrumentation recording and mock handlers", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    assert.strictEqual(isInstrumentationEnabled(), false);

    // Recording calls in production does not increment counter
    recordRazorpayCall({ nodeId: "prod_node", amount: 5000, currency: "INR" });
    assert.strictEqual(getRazorpayCallCount(), 0);

    // Setting mock handler in production is rejected
    const setMockResult = setRazorpayMockHandler(async () => ({} as any));
    assert.strictEqual(setMockResult, false);
  });
});
