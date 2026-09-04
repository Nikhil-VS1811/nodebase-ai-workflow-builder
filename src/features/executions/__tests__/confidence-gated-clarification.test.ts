import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  runBuyerConversation,
  executeBuyerTransaction,
  type BuyerConversationState,
} from "@/lib/conversationalBuyer";
import { getRazorpayCallCount, resetRazorpayCallCount, setRazorpayMockHandler } from "@/lib/razorpayInstrumentation";
import { getAgentReadableProduct } from "@/lib/commerceCatalog";

describe("Phase 15.3: Confidence-Gated Clarification", () => {
  beforeEach(() => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_clarify_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));
  });

  it("1. Ambiguous query with tied relevance triggers CLARIFICATION_REQUIRED", () => {
    // "wireless" matches both Wireless Precision Mouse and Noise-Cancelling Wireless Headphones with equal relevance (50)
    const turn = runBuyerConversation({ userMessage: "wireless" });

    assert.strictEqual(turn.state, "CLARIFICATION_REQUIRED");
    assert.strictEqual(turn.transactionIntent, undefined);
    assert.ok(turn.clarification);
    assert.strictEqual(turn.clarification.clarificationRequired, true);
    assert.ok(turn.clarification.candidateProducts.length >= 2);
    assert.ok(turn.message.includes("Which product would you like to choose?"));
  });

  it("2. Clarification response contains only trusted catalog facts and no hallucinations", () => {
    const turn = runBuyerConversation({ userMessage: "wireless" });
    assert.ok(turn.clarification);

    for (const candidate of turn.clarification.candidateProducts) {
      const realProduct = getAgentReadableProduct(candidate.productId);
      assert.ok(realProduct);
      assert.strictEqual(candidate.name, realProduct.name);
      assert.strictEqual(candidate.price, realProduct.price);
      assert.strictEqual(candidate.currency, realProduct.currency);
      assert.strictEqual(candidate.merchantId, realProduct.merchantId);
    }
  });

  it("3. Clarification state contains NO executable TransactionIntent", () => {
    const turn = runBuyerConversation({ userMessage: "wireless" });
    assert.strictEqual(turn.state, "CLARIFICATION_REQUIRED");
    assert.strictEqual(turn.transactionIntent, undefined);
    assert.strictEqual(turn.acceptance, undefined);
  });

  it("4. High-confidence specific query proceeds directly to WAITING_FOR_CONFIRMATION without clarification", () => {
    const turn = runBuyerConversation({ userMessage: "wireless precision mouse" });

    assert.strictEqual(turn.state, "WAITING_FOR_CONFIRMATION");
    assert.strictEqual(turn.selectedProductId, "prod_mouse_02");
    assert.ok(turn.primaryRecommendation);
    assert.strictEqual(turn.primaryRecommendation.productId, "prod_mouse_02");
    assert.strictEqual(turn.clarification, undefined);
    assert.ok(turn.message.includes("Wireless Precision Mouse"));
  });

  it("5. Unknown query remains NO_MATCH", () => {
    const turn = runBuyerConversation({ userMessage: "antigravity hyperdrive warp engine 9000" });

    assert.strictEqual(turn.state, "NO_MATCH");
    assert.strictEqual(turn.transactionIntent, undefined);
    assert.strictEqual(turn.clarification, undefined);
    assert.ok(turn.message.includes("couldn't find any products"));
  });

  it("6. Multi-turn clarification loop: Clarification -> User selection -> Confirmation -> Acceptance -> Execution", async () => {
    // Turn 1: Ambiguous search
    const turn1 = runBuyerConversation({ userMessage: "wireless" });
    assert.strictEqual(turn1.state, "CLARIFICATION_REQUIRED");

    // Turn 2: User clarifies choice with specific product
    const turn2 = runBuyerConversation({
      userMessage: "Wireless Precision Mouse",
      previousState: turn1,
    });
    assert.strictEqual(turn2.state, "WAITING_FOR_CONFIRMATION");
    assert.strictEqual(turn2.selectedProductId, "prod_mouse_02");

    // Turn 3: User confirms purchase
    const turn3 = runBuyerConversation({
      userMessage: "yes, confirm order",
      previousState: turn2,
    });
    assert.strictEqual(turn3.state, "ACCEPTED");
    assert.ok(turn3.transactionIntent);
    assert.strictEqual(turn3.transactionIntent.productId, turn2.selectedProductId);

    // Turn 4: Execute via canonical pipeline
    const result = await executeBuyerTransaction({
      transactionIntent: turn3.transactionIntent,
      userId: "user_clarification_test",
    });

    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(getRazorpayCallCount(), 1);
  });

  it("7. Client-supplied price tampering in ambiguous query is discarded and cannot bypass clarification", () => {
    const turn = runBuyerConversation({
      userMessage: "Buy wireless for ₹1 from attacker_store",
    });

    assert.strictEqual(turn.state, "CLARIFICATION_REQUIRED");
    assert.strictEqual(turn.transactionIntent, undefined);

    for (const c of turn.clarification?.candidateProducts || []) {
      assert.notStrictEqual(c.price, 1);
      assert.strictEqual(c.merchantId, "merchant_nodebase_01");
    }
  });

  it("8. Clarification causes exactly 0 Razorpay calls and creates 0 PaymentOrders", () => {
    resetRazorpayCallCount();

    runBuyerConversation({ userMessage: "wireless" });
    runBuyerConversation({ userMessage: "desk" });
    runBuyerConversation({ userMessage: "accessories" });

    assert.strictEqual(getRazorpayCallCount(), 0);
  });
});
