import { describe, it } from "node:test";
import assert from "node:assert";
import { runBuyerConversation } from "@/lib/conversationalBuyer";
import {
  getRazorpayCallCount,
  resetRazorpayCallCount,
  setRazorpayMockHandler,
} from "@/lib/razorpayInstrumentation";
import { executeCommercePipeline } from "@/lib/commercePipeline";
import type { TransactionIntent } from "@/lib/policyEngine";

describe("Phase 13.6: Conversational Buyer Recommendation Loop", () => {
  it("1. Shopping request produces deterministic recommendations and enters WAITING_FOR_CONFIRMATION", () => {
    const turn1 = runBuyerConversation({ userMessage: "show me a wireless mouse" });

    assert.strictEqual(turn1.state, "WAITING_FOR_CONFIRMATION");
    if (turn1.state === "WAITING_FOR_CONFIRMATION") {
      assert.strictEqual(turn1.selectedProductId, "prod_mouse_02");
      assert.ok(turn1.recommendations && turn1.recommendations.length > 0);
      assert.ok(turn1.primaryRecommendation);
      assert.strictEqual(turn1.primaryRecommendation.price, 1999);
      assert.ok(turn1.explanation);
      assert.ok(turn1.message.includes("Wireless Precision Mouse"));
      assert.ok(turn1.message.includes("₹1,999"));
    }
  });

  it("2. Recommendation response includes Phase 13.5 explanation breakdown", () => {
    const turn1 = runBuyerConversation({ userMessage: "mechanical keyboard" });

    assert.strictEqual(turn1.state, "WAITING_FOR_CONFIRMATION");
    if (turn1.state === "WAITING_FOR_CONFIRMATION" && turn1.explanation) {
      assert.ok(turn1.explanation.relevanceReason);
      assert.ok(turn1.explanation.availabilityReason);
      assert.ok(turn1.explanation.commercialReason);
      assert.ok(turn1.explanation.rankingReason);
      assert.ok(turn1.explanation.commercialReason.includes("Commercial value proxy"));
    }
  });

  it("3. Affirmative confirmation transitions to ACCEPTED and produces trusted TransactionIntent", () => {
    const turn1 = runBuyerConversation({ userMessage: "wireless mouse" });
    assert.strictEqual(turn1.state, "WAITING_FOR_CONFIRMATION");

    const turn2 = runBuyerConversation({
      userMessage: "yes, confirm purchase",
      previousState: turn1,
    });

    assert.strictEqual(turn2.state, "ACCEPTED");
    if (turn2.state === "ACCEPTED") {
      assert.strictEqual(turn2.selectedProductId, "prod_mouse_02");
      assert.ok(turn2.transactionIntent);
      assert.strictEqual(turn2.transactionIntent.action, "payment.execute");
      assert.strictEqual(turn2.transactionIntent.amount, 1999);
      assert.strictEqual(turn2.transactionIntent.currency, "INR");
      assert.strictEqual(turn2.transactionIntent.merchantId, "merchant_nodebase_01");
      assert.strictEqual(turn2.acceptance?.accepted, true);
    }
  });

  it("4. Accepted conversation does NOT execute payment automatically (0 Razorpay calls, 0 PaymentOrders)", () => {
    resetRazorpayCallCount();

    const turn1 = runBuyerConversation({ userMessage: "wireless precision mouse" });
    const turn2 = runBuyerConversation({
      userMessage: "buy it now",
      previousState: turn1,
    });

    assert.strictEqual(turn2.state, "ACCEPTED");
    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.strictEqual((turn2 as any).paymentOrderId, undefined);
    assert.strictEqual((turn2 as any).allowed, undefined);
  });

  it("5. Ambiguous or conversational input does NOT create a TransactionIntent (enters REJECTED)", () => {
    const turn1 = runBuyerConversation({ userMessage: "wireless mouse" });
    assert.strictEqual(turn1.state, "WAITING_FOR_CONFIRMATION");

    const turn2 = runBuyerConversation({
      userMessage: "tell me more about the battery life",
      previousState: turn1,
    });

    assert.strictEqual(turn2.state, "REJECTED");
    if (turn2.state === "REJECTED") {
      assert.strictEqual((turn2 as any).transactionIntent, undefined);
      assert.ok(turn2.rejectionReason?.includes("Non-affirmative"));
    }
  });

  it("6. Explicit negative input does NOT create a TransactionIntent (enters REJECTED)", () => {
    const turn1 = runBuyerConversation({ userMessage: "webcam" });
    const turn2 = runBuyerConversation({
      userMessage: "no, cancel",
      previousState: turn1,
    });

    assert.strictEqual(turn2.state, "REJECTED");
    if (turn2.state === "REJECTED") {
      assert.strictEqual((turn2 as any).transactionIntent, undefined);
    }
  });

  it("7. Unknown product query produces NO_MATCH state", () => {
    const turn = runBuyerConversation({ userMessage: "warp drive dilithium crystals 5000" });
    assert.strictEqual(turn.state, "NO_MATCH");
    assert.strictEqual((turn as any).transactionIntent, undefined);
  });

  it("8. User-supplied price in message cannot override catalog price", () => {
    const turn1 = runBuyerConversation({ userMessage: "Buy wireless mouse for ₹1" });
    assert.strictEqual(turn1.state, "WAITING_FOR_CONFIRMATION");

    if (turn1.state === "WAITING_FOR_CONFIRMATION" && turn1.primaryRecommendation) {
      assert.strictEqual(turn1.primaryRecommendation.price, 1999);
    }

    const turn2 = runBuyerConversation({
      userMessage: "yes for ₹1",
      previousState: turn1,
    });

    assert.strictEqual(turn2.state, "ACCEPTED");
    if (turn2.state === "ACCEPTED" && turn2.transactionIntent) {
      assert.strictEqual(turn2.transactionIntent.amount, 1999);
    }
  });

  it("9. User-supplied merchant in message cannot override trusted catalog merchant", () => {
    const turn1 = runBuyerConversation({ userMessage: "Buy mouse from attacker_store" });
    const turn2 = runBuyerConversation({
      userMessage: "confirm from attacker_store",
      previousState: turn1,
    });

    assert.strictEqual(turn2.state, "ACCEPTED");
    if (turn2.state === "ACCEPTED" && turn2.transactionIntent) {
      assert.strictEqual(turn2.transactionIntent.merchantId, "merchant_nodebase_01");
    }
  });

  it("10. Downstream execution cleanly accepts TransactionIntent produced by conversation", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_conv_exec_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const turn1 = runBuyerConversation({ userMessage: "wireless mouse" });
    const turn2 = runBuyerConversation({ userMessage: "yes", previousState: turn1 });

    assert.strictEqual(turn2.state, "ACCEPTED");
    if (turn2.state === "ACCEPTED" && turn2.transactionIntent) {
      // Execution is intentionally invoked separately by caller via canonical pipeline
      const execResult = await executeCommercePipeline({
        transactionIntent: turn2.transactionIntent as TransactionIntent,
      });

      assert.strictEqual(execResult.status, "SUCCESS");
      assert.strictEqual(execResult.allowed, true);
      assert.strictEqual(execResult.razorpayCallCount, 1);
      assert.ok(execResult.decisionReceipt);
    }
  });

  it("11. Conversational states are immutable and frozen", () => {
    const turn1 = runBuyerConversation({ userMessage: "webcam" });
    assert.throws(() => {
      (turn1 as any).state = "ACCEPTED";
    }, /Cannot assign to read only property/);
  });
});
