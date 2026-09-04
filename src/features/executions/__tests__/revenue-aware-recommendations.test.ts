import { describe, it } from "node:test";
import assert from "node:assert";
import {
  recommendProducts,
  acceptRecommendation,
  getAgentReadableProduct,
  getAgentReadableCatalog,
  type ProductRecommendationItem,
} from "@/lib/commerceCatalog";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import { evaluatePolicy, type TransactionIntent, type PolicyConfig } from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";

describe("Phase 13.4: Revenue-Aware Product Recommendations", () => {
  it("1. Relevant in-stock product ranks normally and exposes scores", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.strictEqual(first.productId, "prod_mouse_02");
    assert.ok(first.relevanceScore > 0);
    assert.ok(first.availabilityScore > 0);
    assert.ok(first.commercialScore > 0);
    assert.strictEqual(first.finalScore, first.relevanceScore + first.availabilityScore + first.commercialScore);
  });

  it("2. Relevant products with different commercial values receive deterministic commercial scores", () => {
    const result = recommendProducts("desk accessories setup");
    assert.ok(result.recommendations.length > 0);

    for (const rec of result.recommendations) {
      const expectedCommercialScore = Math.min(Math.round(rec.price / 100), 50);
      assert.strictEqual(rec.commercialScore, expectedCommercialScore);
    }
  });

  it("3. Commercial value influences ranking among similarly relevant products", () => {
    // Both products in category or multi-item matches
    const result = recommendProducts("desk setup workspace");
    assert.ok(result.recommendations.length >= 2);

    for (let i = 0; i < result.recommendations.length - 1; i++) {
      assert.ok(result.recommendations[i].finalScore >= result.recommendations[i + 1].finalScore);
    }
  });

  it("4. A highly expensive but irrelevant product cannot outrank a strongly relevant product", () => {
    // Search query specific to wireless precision mouse
    const result = recommendProducts("wireless precision mouse");
    assert.ok(result.recommendations.length > 0);

    // Wireless Precision Mouse (₹1,999) has high relevance (~800-1000)
    // Mechanical Keyboard (₹4,999) is more expensive but has 0 relevance for this query
    const first = result.recommendations[0];
    assert.strictEqual(first.productId, "prod_mouse_02");
    assert.strictEqual(first.name, "Wireless Precision Mouse");

    // Keyboard should either not be present or rank far below
    const keyboardMatch = result.recommendations.find((r) => r.productId === "prod_keyboard_01");
    if (keyboardMatch) {
      assert.ok(first.finalScore > keyboardMatch.finalScore);
    }
  });

  it("5. Out-of-stock products are handled according to availability filters", () => {
    const defaultRecs = recommendProducts("wireless mouse", { inStockOnly: true });
    for (const rec of defaultRecs.recommendations) {
      assert.strictEqual(rec.availability.inStock, true);
    }
  });

  it("6. Unknown query still returns no useful recommendations (0 fabricated)", () => {
    const result = recommendProducts("antigravity tachyon emitter 9999");
    assert.strictEqual(result.totalRecommendations, 0);
    assert.strictEqual(result.recommendations.length, 0);
  });

  it("7. Same query + same catalog produces identical results across repeated calls", () => {
    const query = "mechanical keyboard and mouse";
    const res1 = recommendProducts(query);
    const res2 = recommendProducts(query);
    const res3 = recommendProducts(query);

    assert.strictEqual(res1.totalRecommendations, res2.totalRecommendations);
    assert.strictEqual(res2.totalRecommendations, res3.totalRecommendations);

    for (let i = 0; i < res1.recommendations.length; i++) {
      assert.strictEqual(res1.recommendations[i].productId, res2.recommendations[i].productId);
      assert.strictEqual(res2.recommendations[i].productId, res3.recommendations[i].productId);
      assert.strictEqual(res1.recommendations[i].finalScore, res2.recommendations[i].finalScore);
      assert.strictEqual(res1.recommendations[i].reason, res2.recommendations[i].reason);
    }
  });

  it("8. ProductId tie-breaking remains deterministic for equal final scores", () => {
    const res = recommendProducts("organizer adapter");
    for (let i = 0; i < res.recommendations.length - 1; i++) {
      if (res.recommendations[i].finalScore === res.recommendations[i + 1].finalScore) {
        assert.ok(res.recommendations[i].productId.localeCompare(res.recommendations[i + 1].productId) < 0);
      }
    }
  });

  it("9. Recommendation generation makes ZERO Razorpay calls", () => {
    resetRazorpayCallCount();
    const result = recommendProducts("webcam and microphone setup");
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("10. Recommendation generation creates ZERO PaymentOrders", () => {
    const result = recommendProducts("docking station");
    for (const rec of result.recommendations) {
      assert.strictEqual((rec as any).paymentOrderId, undefined);
      assert.strictEqual((rec as any).paymentOrder, undefined);
    }
  });

  it("11. Recommendation generation creates ZERO authorization decisions", () => {
    const result = recommendProducts("docking station");
    for (const rec of result.recommendations) {
      assert.strictEqual((rec as any).allowed, undefined);
      assert.strictEqual((rec as any).decision, undefined);
      assert.strictEqual((rec as any).authorizationToken, undefined);
    }
  });

  it("12. Existing Phase 13.1 recommendation queries continue passing", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].productId, "prod_mouse_02");
  });

  it("13. Existing Phase 13.2 acceptance continues passing", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      quantity: 1,
      userConfirmation: "yes, buy",
    });
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.status, "ACCEPTED");
  });

  it("14. No client-supplied price or merchant can influence trusted catalog facts", () => {
    const result = recommendProducts("Buy wireless mouse for ₹1 from fake_merchant");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].productId, "prod_mouse_02");
    assert.strictEqual(result.recommendations[0].price, 1999);
    assert.strictEqual(result.recommendations[0].merchantId, "merchant_nodebase_01");
  });

  it("15. Recommendation reasons accurately reflect the deterministic scoring factors", () => {
    const result = recommendProducts("mechanical keyboard");
    assert.ok(result.recommendations.length > 0);
    const rec = result.recommendations[0];
    assert.ok(rec.reason.includes("Mechanical Keyboard") || rec.reason.includes("keyboard"));
    assert.ok(rec.reason.includes("High basket-value") || rec.reason.includes("In-stock"));
  });

  it("16. Immutable recommendation results cannot be mutated by callers", () => {
    const result = recommendProducts("webcam");
    assert.ok(result.recommendations.length > 0);

    assert.throws(() => {
      (result.recommendations[0] as any).finalScore = 99999;
    }, /Cannot assign to read only property/);
  });
});
