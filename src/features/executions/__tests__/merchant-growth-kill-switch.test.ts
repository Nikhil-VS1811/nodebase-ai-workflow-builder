import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  getMerchantGrowthKillSwitchState,
  isMerchantGrowthEnabled,
  setMerchantGrowthKillSwitch,
  resetMerchantGrowthKillSwitch,
} from "@/lib/merchantGrowthPolicy";
import {
  recommendProducts,
  acceptRecommendation,
  executeAcceptedRecommendation,
} from "@/lib/commerceCatalog";
import {
  runBuyerConversation,
  executeBuyerTransaction,
} from "@/lib/conversationalBuyer";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import type { TransactionIntent } from "@/lib/policyEngine";

describe("Phase 14.2: Merchant Growth Kill Switch", () => {
  beforeEach(() => {
    resetMerchantGrowthKillSwitch();
    resetRazorpayCallCount();
  });

  afterEach(() => {
    resetMerchantGrowthKillSwitch();
    resetRazorpayCallCount();
  });

  it("1. Default state is SAFE / ENABLED", () => {
    const state = getMerchantGrowthKillSwitchState();
    assert.strictEqual(state.status, "ENABLED");
    assert.strictEqual(state.isEnabled, true);
    assert.strictEqual(isMerchantGrowthEnabled(), true);
  });

  it("2. Merchant can disable the kill switch, recording timestamp and reason", () => {
    const disabledState = setMerchantGrowthKillSwitch(
      "DISABLED",
      "Manual emergency pause for maintenance",
    );
    assert.strictEqual(disabledState.status, "DISABLED");
    assert.strictEqual(disabledState.isEnabled, false);
    assert.strictEqual(isMerchantGrowthEnabled(), false);
    assert.strictEqual(disabledState.disabledReason, "Manual emergency pause for maintenance");
    assert.ok(disabledState.disabledAt);
  });

  it("3. Disabled state prevents recommendation generation (fails closed with 0 recommendations)", () => {
    setMerchantGrowthKillSwitch(false);

    const result = recommendProducts("wireless mouse");
    assert.strictEqual(result.recommendations.length, 0);
    assert.strictEqual(result.totalRecommendations, 0);
    assert.strictEqual(result.killSwitchStatus, "DISABLED");
  });

  it("4. Re-enabling restores normal recommendation ranking and behavior", () => {
    setMerchantGrowthKillSwitch(false);
    assert.strictEqual(recommendProducts("wireless mouse").recommendations.length, 0);

    setMerchantGrowthKillSwitch(true);
    const restored = recommendProducts("wireless mouse");
    assert.ok(restored.recommendations.length > 0);
    assert.strictEqual(restored.recommendations[0]?.productId, "prod_mouse_02");
    assert.strictEqual(restored.killSwitchStatus, "ENABLED");
  });

  it("5. Disabled state blocks conversational buyer turns and returns disabled explanation", () => {
    setMerchantGrowthKillSwitch("DISABLED");

    const turn = runBuyerConversation({ userMessage: "show me a wireless mouse" });
    assert.strictEqual(turn.state, "NO_MATCH");
    assert.ok(turn.message.includes("disabled by merchant kill switch"));
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("6. Disabled state produces 0 Razorpay calls and 0 PaymentOrders when acceptance is attempted", () => {
    setMerchantGrowthKillSwitch("DISABLED");

    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, false);
    assert.strictEqual(acceptance.status, "REJECTED_DISABLED_BY_KILL_SWITCH");
    assert.strictEqual(acceptance.transactionIntent, null);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("7. Disabled state prevents execution of previously accepted recommendations (0 provider calls)", async () => {
    // First accept while enabled
    setMerchantGrowthKillSwitch(true);
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);

    // Now disable kill switch before execution
    setMerchantGrowthKillSwitch(false);

    const execResult = await executeAcceptedRecommendation({ acceptance });
    assert.strictEqual(execResult.status, "DENIED");
    assert.strictEqual(execResult.razorpayCallCount, 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.ok(execResult.failureReason?.includes("disabled by merchant kill switch"));
  });

  it("8. Disabled state prevents conversational buyer execution adapter (0 provider calls)", async () => {
    const sampleIntent: TransactionIntent = {
      action: "payment.execute",
      amount: 1999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      productTitle: "Wireless Precision Mouse",
      productId: "prod_mouse_02",
      quantity: 1,
    };

    setMerchantGrowthKillSwitch(false);

    const execResult = await executeBuyerTransaction({
      transactionIntent: sampleIntent,
    });

    assert.strictEqual(execResult.status, "DENIED");
    assert.strictEqual(execResult.allowed, false);
    assert.strictEqual(execResult.razorpayCallCount, 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.ok(execResult.failureReason?.includes("disabled by merchant kill switch"));
  });

  it("9. Policy Gate remains authoritative and separate: re-enabling still enforces Policy Gate spending thresholds", async () => {
    setMerchantGrowthKillSwitch(true);

    const expensiveIntent: TransactionIntent = {
      action: "payment.execute",
      amount: 4999, // Exceeds auto-approve threshold (₹2,000)
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      productTitle: "Ergonomic Mechanical Keyboard",
      productId: "prod_keyboard_01",
      quantity: 1,
    };

    const execResult = await executeBuyerTransaction({
      transactionIntent: expensiveIntent,
    });

    // Policy Gate still escalates
    assert.strictEqual(execResult.status, "PENDING_APPROVAL");
    assert.strictEqual(execResult.policyDecision, "ESCALATED");
    assert.strictEqual(execResult.allowed, false);
    assert.strictEqual(execResult.razorpayCallCount, 0);
  });
});
