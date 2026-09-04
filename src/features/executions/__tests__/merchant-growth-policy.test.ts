import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateMerchantGrowthPolicy,
  getDefaultMerchantGrowthPolicy,
  getEffectiveMerchantGrowthPolicy,
  type MerchantGrowthPolicy,
} from "@/lib/merchantGrowthPolicy";
import { recommendProducts } from "@/lib/commerceCatalog";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

describe("Phase 13.8: Merchant Growth Policy Foundation", () => {
  it("1. Valid default merchant growth policy loads successfully", () => {
    const policy = getDefaultMerchantGrowthPolicy();
    assert.strictEqual(policy.version, "1.0.0");
    assert.strictEqual(policy.policyId, "mgp_default_balanced");
    assert.strictEqual(policy.objective, "BALANCED_COMMERCIAL_VALUE");
    assert.ok(policy.minRelevanceScore >= 20);
    assert.ok(policy.commercialWeight >= 0);
  });

  it("2. Invalid policy fails closed to validation error or safe default fallback", () => {
    const invalidInput = {
      version: "9.9.9",
      objective: "INVALID_OBJECTIVE",
      commercialWeight: -5.0,
      minRelevanceScore: 0,
    };

    const validation = validateMerchantGrowthPolicy(invalidInput);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.length >= 3);

    // Fallback resolution is safe and fail-closed
    const effective = getEffectiveMerchantGrowthPolicy(invalidInput);
    assert.strictEqual(effective.policyId, "mgp_default_balanced");
  });

  it("3. Policy objective is exposed structurally in recommendations and explanations", () => {
    const res = recommendProducts("wireless mouse");
    assert.strictEqual(res.activePolicyId, "mgp_default_balanced");

    const first = res.recommendations[0];
    assert.ok(first.explanation.commercialReason.includes("BALANCED_COMMERCIAL_VALUE"));
    assert.ok(first.explanation.rankingReason.includes("mgp_default_balanced"));
  });

  it("4. Custom policy with RELEVANCE_ONLY zeroes out commercial value score", () => {
    const relevancePolicy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_pure_relevance",
      objective: "RELEVANCE_ONLY",
      minRelevanceScore: 50,
      commercialWeight: 0.0,
      maxCommercialBonus: 0,
      availabilityWeight: 1.0,
    };

    const res = recommendProducts("desk mat setup", { merchantGrowthPolicy: relevancePolicy });
    assert.strictEqual(res.activePolicyId, "mgp_pure_relevance");

    for (const rec of res.recommendations) {
      assert.strictEqual(rec.commercialScore, 0);
    }
  });

  it("5. Custom policy with MAXIMIZE_COMMERCIAL_VALUE boosts higher basket-value candidates among relevant items", () => {
    const maxCommercialPolicy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_max_commercial",
      objective: "MAXIMIZE_COMMERCIAL_VALUE",
      minRelevanceScore: 50,
      commercialWeight: 1.5,
      maxCommercialBonus: 80,
      availabilityWeight: 1.0,
    };

    const res = recommendProducts("desk accessories setup", { merchantGrowthPolicy: maxCommercialPolicy });
    assert.strictEqual(res.activePolicyId, "mgp_max_commercial");
    assert.ok(res.recommendations.length > 0);
    assert.ok(res.recommendations[0].commercialScore > 0);
  });

  it("6. Policy cannot make an irrelevant product outrank a strongly relevant product (relevance dominance)", () => {
    const maxCommercialPolicy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_max_commercial",
      objective: "MAXIMIZE_COMMERCIAL_VALUE",
      minRelevanceScore: 50,
      commercialWeight: 2.0,
      maxCommercialBonus: 100,
      availabilityWeight: 1.0,
    };

    // User explicitly requests a wireless mouse
    const res = recommendProducts("wireless precision mouse", { merchantGrowthPolicy: maxCommercialPolicy });
    assert.ok(res.recommendations.length > 0);

    // Wireless Precision Mouse (₹1,999, ~800+ relevance) MUST rank #1
    // Expensive Mechanical Keyboard (₹4,999) has 0 relevance and must NOT outrank the mouse
    assert.strictEqual(res.recommendations[0].productId, "prod_mouse_02");
    assert.strictEqual(res.recommendations[0].name, "Wireless Precision Mouse");
  });

  it("7. Minimum relevance requirement (minRelevanceScore) is strictly enforced", () => {
    const strictPolicy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_strict_relevance",
      objective: "BALANCED_COMMERCIAL_VALUE",
      minRelevanceScore: 500, // Only direct/exact matches
      commercialWeight: 1.0,
      maxCommercialBonus: 50,
      availabilityWeight: 1.0,
    };

    const res = recommendProducts("mouse", { merchantGrowthPolicy: strictPolicy });
    for (const rec of res.recommendations) {
      assert.ok(rec.relevanceScore >= 500);
    }
  });

  it("8. Merchant growth policy cannot override trusted catalog price, merchant, or currency", () => {
    const res = recommendProducts("wireless mouse");
    const rec = res.recommendations[0];

    assert.strictEqual(rec.price, 1999);
    assert.strictEqual(rec.merchantId, "merchant_nodebase_01");
    assert.strictEqual(rec.currency, "INR");
  });

  it("9. Recommendation generation produces exactly 0 Razorpay calls", () => {
    resetRazorpayCallCount();
    const res = recommendProducts("mechanical keyboard");
    assert.ok(res.recommendations.length > 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("10. Recommendation generation produces 0 PaymentOrders", () => {
    const res = recommendProducts("docking station");
    for (const rec of res.recommendations) {
      assert.strictEqual((rec as any).paymentOrderId, undefined);
      assert.strictEqual((rec as any).paymentOrder, undefined);
    }
  });

  it("11. Recommendation generation produces 0 authorization decisions", () => {
    const res = recommendProducts("webcam");
    for (const rec of res.recommendations) {
      assert.strictEqual((rec as any).allowed, undefined);
      assert.strictEqual((rec as any).decision, undefined);
      assert.strictEqual((rec as any).authorizationToken, undefined);
    }
  });

  it("12. Determinism: Same query + same catalog + same policy produces identical results", () => {
    const query = "bluetooth headphones";
    const res1 = recommendProducts(query);
    const res2 = recommendProducts(query);

    assert.strictEqual(res1.recommendations[0]?.productId, res2.recommendations[0]?.productId);
    assert.strictEqual(res1.recommendations[0]?.finalScore, res2.recommendations[0]?.finalScore);
    assert.strictEqual(res1.recommendations[0]?.explanation.rankingReason, res2.recommendations[0]?.explanation.rankingReason);
  });
});
