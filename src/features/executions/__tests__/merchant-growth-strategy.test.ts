import { describe, it } from "node:test";
import assert from "node:assert";
import {
  decideMerchantGrowthStrategy,
  type MerchantGrowthPolicy,
} from "@/lib/merchantGrowthPolicy";
import { recommendProducts } from "@/lib/commerceCatalog";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

describe("Phase 13.9: Merchant Growth Strategy Decision", () => {
  it("1. RELEVANCE_ONLY maps to RELEVANCE_FIRST", () => {
    const policy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_relevance",
      objective: "RELEVANCE_ONLY",
      minRelevanceScore: 50,
      commercialWeight: 0.0,
      maxCommercialBonus: 0,
      availabilityWeight: 1.0,
    };

    const decision = decideMerchantGrowthStrategy({ policy });
    assert.strictEqual(decision.strategy, "RELEVANCE_FIRST");
    assert.strictEqual(decision.objective, "RELEVANCE_ONLY");
    assert.ok(decision.rationale.includes("Pure relevance strategy"));
  });

  it("2. BALANCED_COMMERCIAL_VALUE maps to BALANCED_VALUE", () => {
    const policy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_balanced",
      objective: "BALANCED_COMMERCIAL_VALUE",
      minRelevanceScore: 20,
      commercialWeight: 1.0,
      maxCommercialBonus: 50,
      availabilityWeight: 1.0,
    };

    const decision = decideMerchantGrowthStrategy({ policy });
    assert.strictEqual(decision.strategy, "BALANCED_VALUE");
    assert.strictEqual(decision.objective, "BALANCED_COMMERCIAL_VALUE");
    assert.ok(decision.rationale.includes("balanced commercial-value"));
  });

  it("3. MAXIMIZE_COMMERCIAL_VALUE maps to COMMERCIAL_VALUE", () => {
    const policy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_max",
      objective: "MAXIMIZE_COMMERCIAL_VALUE",
      minRelevanceScore: 50,
      commercialWeight: 1.8,
      maxCommercialBonus: 80,
      availabilityWeight: 1.0,
    };

    const decision = decideMerchantGrowthStrategy({ policy });
    assert.strictEqual(decision.strategy, "COMMERCIAL_VALUE");
    assert.strictEqual(decision.objective, "MAXIMIZE_COMMERCIAL_VALUE");
    assert.ok(decision.rationale.includes("Commercial-value strategy"));
  });

  it("4. INVENTORY_CLEARANCE maps to INVENTORY_AWARE", () => {
    const policy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_inventory",
      objective: "INVENTORY_CLEARANCE",
      minRelevanceScore: 20,
      commercialWeight: 1.0,
      maxCommercialBonus: 50,
      availabilityWeight: 1.5,
    };

    const decision = decideMerchantGrowthStrategy({ policy });
    assert.strictEqual(decision.strategy, "INVENTORY_AWARE");
    assert.strictEqual(decision.objective, "INVENTORY_CLEARANCE");
    assert.ok(decision.rationale.includes("Inventory-aware strategy"));
  });

  it("5. Strategy decision exposes correct policy ID, version, and parameters", () => {
    const decision = decideMerchantGrowthStrategy();
    assert.strictEqual(decision.policyId, "mgp_default_balanced");
    assert.strictEqual(decision.policyVersion, "1.0.0");
    assert.strictEqual(decision.strategy, "BALANCED_VALUE");
    assert.strictEqual(decision.minimumRelevanceScore, 20);
    assert.strictEqual(decision.commercialWeight, 1);
    assert.strictEqual(decision.availabilityWeight, 1);
    assert.ok(decision.appliedPolicy);
  });

  it("6. Invalid policy fails closed using existing default policy", () => {
    const invalidPolicy = {
      version: "bogus",
      objective: "INVALID",
    };

    const decision = decideMerchantGrowthStrategy({ policy: invalidPolicy });
    assert.strictEqual(decision.policyId, "mgp_default_balanced");
    assert.strictEqual(decision.strategy, "BALANCED_VALUE");
  });

  it("7. Strategy decision is embedded inside recommendProducts result", () => {
    const res = recommendProducts("wireless mouse");
    assert.strictEqual(res.activeStrategy, "BALANCED_VALUE");
    assert.ok(res.strategyDecision);
    assert.strictEqual(res.strategyDecision.strategy, "BALANCED_VALUE");
    assert.strictEqual(res.strategyDecision.policyId, "mgp_default_balanced");
  });

  it("8. Strategy decision creates 0 Razorpay calls, 0 PaymentOrders, 0 authorization decisions", () => {
    resetRazorpayCallCount();
    const decision = decideMerchantGrowthStrategy();

    assert.strictEqual(getRazorpayCallCount(), 0);
    assert.strictEqual((decision as any).allowed, undefined);
    assert.strictEqual((decision as any).authorizationToken, undefined);
    assert.strictEqual((decision as any).paymentOrderId, undefined);
  });

  it("9. Determinism: Same policy produces identical strategy decisions across calls", () => {
    const d1 = decideMerchantGrowthStrategy();
    const d2 = decideMerchantGrowthStrategy();

    assert.strictEqual(d1.strategy, d2.strategy);
    assert.strictEqual(d1.rationale, d2.rationale);
    assert.strictEqual(d1.policyId, d2.policyId);
  });

  it("10. Highly irrelevant products cannot be recommended solely due to commercial strategy", () => {
    const maxPolicy: MerchantGrowthPolicy = {
      version: "1.0.0",
      policyId: "mgp_max",
      objective: "MAXIMIZE_COMMERCIAL_VALUE",
      minRelevanceScore: 50,
      commercialWeight: 2.0,
      maxCommercialBonus: 100,
      availabilityWeight: 1.0,
    };

    const res = recommendProducts("wireless mouse", { merchantGrowthPolicy: maxPolicy });
    assert.strictEqual(res.activeStrategy, "COMMERCIAL_VALUE");
    assert.strictEqual(res.recommendations[0]?.productId, "prod_mouse_02");
  });
});
