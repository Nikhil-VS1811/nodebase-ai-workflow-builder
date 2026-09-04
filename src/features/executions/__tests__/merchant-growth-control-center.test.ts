import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getDefaultMerchantGrowthPolicy,
  decideMerchantGrowthStrategy,
} from "@/lib/merchantGrowthPolicy";
import {
  recommendProducts,
  getAgentReadableCatalog,
} from "@/lib/commerceCatalog";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

describe("Phase 14.1: Merchant Control Center UI & Data Foundation", () => {
  it("1. Active policy data loader produces deterministic policy, strategy, and advisory notice", () => {
    const policy = getDefaultMerchantGrowthPolicy();
    const strategyDecision = decideMerchantGrowthStrategy({ policy });
    const catalog = getAgentReadableCatalog();

    assert.ok(policy);
    assert.strictEqual(policy.policyId, "mgp_default_balanced");
    assert.strictEqual(policy.version, "1.0.0");
    assert.strictEqual(policy.objective, "BALANCED_COMMERCIAL_VALUE");

    assert.ok(strategyDecision);
    assert.strictEqual(strategyDecision.strategy, "BALANCED_VALUE");
    assert.ok(strategyDecision.rationale.includes("balanced commercial-value"));

    assert.ok(catalog.products.length > 0);
    const categories = Array.from(new Set(catalog.products.map((p) => p.category)));
    assert.ok(categories.includes("Electronics"));
    assert.ok(categories.includes("Accessories"));
  });

  it("2. Recommendation preview returns structured, explainable recommendations for 'wireless mouse'", () => {
    const result = recommendProducts("wireless mouse", { limit: 5 });

    assert.strictEqual(result.query, "wireless mouse");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.activeStrategy, "BALANCED_VALUE");

    const first = result.recommendations[0];
    assert.strictEqual(first.productId, "prod_mouse_02");
    assert.strictEqual(first.name, "Wireless Precision Mouse");
    assert.strictEqual(first.price, 1999);
    assert.strictEqual(first.currency, "INR");
    assert.ok(first.relevanceScore > 0);
    assert.ok(first.commercialScore > 0);
    assert.ok(first.finalScore > 0);
    assert.ok(first.explanation.relevanceReason);
    assert.ok(first.explanation.availabilityReason);
    assert.ok(first.explanation.commercialReason);
    assert.ok(first.explanation.rankingReason);
  });

  it("3. Preview generation makes exactly 0 Razorpay calls, 0 PaymentOrders, 0 authorization decisions", () => {
    resetRazorpayCallCount();
    const result = recommendProducts("mechanical keyboard", { limit: 3 });

    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
    for (const rec of result.recommendations) {
      assert.strictEqual((rec as any).allowed, undefined);
      assert.strictEqual((rec as any).paymentOrderId, undefined);
      assert.strictEqual((rec as any).authorizationToken, undefined);
    }
  });

  it("4. Unknown query returns 0 recommendations without fabricating facts", () => {
    const result = recommendProducts("xyznonexistentproduct999", { limit: 5 });

    assert.strictEqual(result.recommendations.length, 0);
    assert.strictEqual(result.totalRecommendations, 0);
  });
});
