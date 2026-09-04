import { describe, it } from "node:test";
import assert from "node:assert";
import {
  recommendProducts,
  acceptRecommendation,
  getAgentReadableProduct,
  type ProductRecommendationItem,
  type RecommendationExplanation,
} from "@/lib/commerceCatalog";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

describe("Phase 13.5: Explainable Recommendation Decision", () => {
  it("1. Structured explanation exists for a valid recommendation", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.ok(first.explanation);
    assert.ok(typeof first.explanation.relevanceReason === "string");
    assert.ok(typeof first.explanation.availabilityReason === "string");
    assert.ok(typeof first.explanation.commercialReason === "string");
    assert.ok(typeof first.explanation.rankingReason === "string");
  });

  it("2. Relevance explanation reflects actual relevance score and query match", () => {
    const result = recommendProducts("wireless precision mouse");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.ok(first.explanation.relevanceReason.includes("Wireless Precision Mouse") || first.explanation.relevanceReason.includes("match"));
    assert.ok(first.explanation.relevanceReason.includes(String(first.relevanceScore)) || first.explanation.relevanceReason.includes("score"));
  });

  it("3. Availability explanation reflects actual stock and availability status", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.ok(first.explanation.availabilityReason.includes("in stock"));
    assert.ok(first.explanation.availabilityReason.includes(String(first.availability.stockCount)));
  });

  it("4. Commercial explanation explicitly identifies commercial value as a catalog price proxy", () => {
    const result = recommendProducts("mechanical keyboard");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.ok(first.explanation.commercialReason.includes("Commercial value proxy"));
    assert.ok(first.explanation.commercialReason.includes("catalog price bracket proxy"));
    assert.ok(first.explanation.commercialReason.includes("not actual merchant revenue"));
  });

  it("5. Ranking explanation reflects the actual ranking factors", () => {
    const result = recommendProducts("desk mat");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.ok(first.explanation.rankingReason.includes(String(first.finalScore)));
    assert.ok(first.explanation.rankingReason.includes(String(first.relevanceScore)));
    assert.ok(first.explanation.rankingReason.includes("Relevance strictly dominates"));
  });

  it("6. Explanation is deterministic and immutable", () => {
    const result = recommendProducts("webcam");
    assert.ok(result.recommendations.length > 0);
    const exp = result.recommendations[0].explanation;

    assert.throws(() => {
      (exp as any).relevanceReason = "tampered";
    }, /Cannot assign to read only property/);
  });

  it("7. Same query + same catalog produces identical explanations across repeated calls", () => {
    const query = "10-in-1 usb-c dock";
    const res1 = recommendProducts(query);
    const res2 = recommendProducts(query);
    const res3 = recommendProducts(query);

    assert.strictEqual(
      res1.recommendations[0]?.explanation.relevanceReason,
      res2.recommendations[0]?.explanation.relevanceReason,
    );
    assert.strictEqual(
      res2.recommendations[0]?.explanation.relevanceReason,
      res3.recommendations[0]?.explanation.relevanceReason,
    );
    assert.strictEqual(
      res1.recommendations[0]?.explanation.commercialReason,
      res3.recommendations[0]?.explanation.commercialReason,
    );
  });

  it("8. Explanation cannot claim actual revenue, profit, or conversion uplift data", () => {
    const result = recommendProducts("monitor arm");
    assert.ok(result.recommendations.length > 0);

    for (const rec of result.recommendations) {
      const allText = `${rec.explanation.relevanceReason} ${rec.explanation.availabilityReason} ${rec.explanation.commercialReason} ${rec.explanation.rankingReason}`.toLowerCase();

      // Ensure no false statistical or profit claims
      assert.strictEqual(allText.includes("guaranteed revenue"), false);
      assert.strictEqual(allText.includes("20% increase"), false);
      assert.strictEqual(allText.includes("actual profit margin"), false);
      assert.strictEqual(allText.includes("predicted conversion"), false);
    }
  });

  it("9. Client-supplied price cannot alter explanation facts", () => {
    const result = recommendProducts("Buy mouse for ₹1");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.strictEqual(first.price, 1999);
    assert.ok(first.explanation.commercialReason.includes("₹1,999"));
  });

  it("10. Client-supplied merchant cannot alter explanation facts", () => {
    const result = recommendProducts("Buy mouse from attacker_store");
    assert.ok(result.recommendations.length > 0);

    const first = result.recommendations[0];
    assert.strictEqual(first.merchantId, "merchant_nodebase_01");
  });

  it("11. Unknown query produces no misleading recommendation explanations (0 results)", () => {
    const result = recommendProducts("sub-quantum hyperdrive generator 9999");
    assert.strictEqual(result.totalRecommendations, 0);
    assert.strictEqual(result.recommendations.length, 0);
  });

  it("12. Recommendation explanation generation produces 0 provider calls", () => {
    resetRazorpayCallCount();
    const result = recommendProducts("noise cancelling headphones");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("13. Recommendation explanation generation produces 0 PaymentOrders", () => {
    const result = recommendProducts("mechanical keyboard");
    for (const rec of result.recommendations) {
      assert.strictEqual((rec as any).paymentOrderId, undefined);
      assert.strictEqual((rec as any).paymentOrder, undefined);
    }
  });

  it("14. Existing Phase 13.1 tests remain compatible", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].productId, "prod_mouse_02");
    assert.ok(typeof result.recommendations[0].reason === "string");
  });

  it("15. Existing Phase 13.2 acceptance remains compatible", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      quantity: 1,
      userConfirmation: "yes",
    });
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.status, "ACCEPTED");
  });

  it("16. Existing Phase 13.4 scoring fields remain accurate", () => {
    const result = recommendProducts("wireless mouse");
    const rec = result.recommendations[0];
    assert.ok(rec.relevanceScore > 0);
    assert.ok(rec.availabilityScore > 0);
    assert.ok(rec.commercialScore > 0);
    assert.strictEqual(rec.finalScore, rec.relevanceScore + rec.availabilityScore + rec.commercialScore);
  });

  it("17. Output contains NO authorization or execution permissions", () => {
    const result = recommendProducts("webcam");
    for (const rec of result.recommendations) {
      assert.strictEqual((rec as any).allowed, undefined);
      assert.strictEqual((rec as any).decision, undefined);
      assert.strictEqual((rec as any).authorizationToken, undefined);
    }
  });

  it("18. Recommendation explanation remains strictly advisory", () => {
    const result = recommendProducts("cable organizer");
    assert.ok(result.recommendations.length > 0);
    // Explicitly check that no orders or execution flows are triggered
    assert.strictEqual(getRazorpayCallCount(), 0);
  });
});
