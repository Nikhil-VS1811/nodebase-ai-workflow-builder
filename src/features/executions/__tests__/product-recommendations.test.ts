import { describe, it } from "node:test";
import assert from "node:assert";
import {
  recommendProducts,
  getAgentReadableProduct,
  type ProductRecommendationItem,
} from "@/lib/commerceCatalog";
import { getRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import { evaluatePolicy, type TransactionIntent, type PolicyConfig } from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";

describe("Phase 13.1: Deterministic Product Recommendations", () => {
  it("1. Relevant query returns a trusted catalog product", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.totalRecommendations, result.recommendations.length);

    const first = result.recommendations[0];
    assert.strictEqual(first.productId, "prod_mouse_02");
    assert.strictEqual(first.name, "Wireless Precision Mouse");
  });

  it("2. Recommendation contains the correct product ID", () => {
    const result = recommendProducts("mechanical keyboard");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].productId, "prod_keyboard_01");
  });

  it("3. Recommendation contains the trusted catalog price", () => {
    const result = recommendProducts("noise-cancelling headphones");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].price, 3499);
  });

  it("4. Recommendation contains the trusted merchant", () => {
    const result = recommendProducts("10-in-1 USB-C Docking Station");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].merchantId, "merchant_nodebase_01");
  });

  it("5. Recommendation contains the trusted currency", () => {
    const result = recommendProducts("Heavy-Duty Single Monitor Arm");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].currency, "INR");
  });

  it("6. Recommendation preserves availability", () => {
    const result = recommendProducts("vegan leather desk mat");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].availability.inStock, true);
    assert.strictEqual(result.recommendations[0].availability.stockCount, 100);
    assert.strictEqual(result.recommendations[0].availability.status, "IN_STOCK");
  });

  it("7. Recommendation includes a deterministic explanation", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);
    assert.ok(typeof result.recommendations[0].reason === "string");
    assert.ok(result.recommendations[0].reason.length > 0);
    assert.ok(result.recommendations[0].reason.includes("Wireless Precision Mouse") || result.recommendations[0].reason.includes("wireless mouse"));
  });

  it("8. Same query produces identical recommendations across repeated calls", () => {
    const query = "need a reliable webcam for streaming";
    const res1 = recommendProducts(query);
    const res2 = recommendProducts(query);
    const res3 = recommendProducts(query);

    assert.strictEqual(res1.totalRecommendations, res2.totalRecommendations);
    assert.strictEqual(res2.totalRecommendations, res3.totalRecommendations);
    assert.strictEqual(res1.recommendations[0]?.productId, res2.recommendations[0]?.productId);
    assert.strictEqual(res2.recommendations[0]?.productId, res3.recommendations[0]?.productId);
    assert.strictEqual(res1.recommendations[0]?.reason, res2.recommendations[0]?.reason);
  });

  it("9. Unknown product/category returns no fabricated recommendation", () => {
    const result = recommendProducts("alien antimatter reactor 5000");
    assert.strictEqual(result.totalRecommendations, 0);
    assert.strictEqual(result.recommendations.length, 0);
  });

  it("10. User-supplied price cannot alter recommendation price", () => {
    const result = recommendProducts("Buy one wireless precision mouse for ₹1");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].productId, "prod_mouse_02");
    assert.strictEqual(result.recommendations[0].price, 1999); // Authoritative ₹1,999, NOT ₹1
  });

  it("11. User-supplied merchant cannot alter recommendation merchant", () => {
    const result = recommendProducts("Buy one wireless mouse from attacker_merchant");
    assert.ok(result.recommendations.length > 0);
    assert.strictEqual(result.recommendations[0].productId, "prod_mouse_02");
    assert.strictEqual(result.recommendations[0].merchantId, "merchant_nodebase_01"); // Authoritative merchant, NOT attacker_merchant
  });

  it("12. Recommendation cannot mutate the underlying catalog", () => {
    const result = recommendProducts("webcam");
    assert.ok(result.recommendations.length > 0);
    const item = result.recommendations[0];

    assert.throws(() => {
      (item as any).price = 0;
    }, /Cannot assign to read only property/);

    assert.throws(() => {
      (item.product as any).price = 0;
    }, /Cannot assign to read only property/);

    const fresh = getAgentReadableProduct("prod_webcam_08");
    assert.ok(fresh);
    assert.strictEqual(fresh.price, 4499);
  });

  it("13. Recommendation result contains no authorization/execution fields", () => {
    const result = recommendProducts("wireless mouse");
    assert.ok(result.recommendations.length > 0);

    const item = result.recommendations[0];
    assert.strictEqual((item as any).allowed, undefined);
    assert.strictEqual((item as any).decision, undefined);
    assert.strictEqual((item as any).razorpayOrderId, undefined);
    assert.strictEqual((item as any).paymentOrderId, undefined);
    assert.strictEqual((item as any).authorizationToken, undefined);
  });

  it("14. Recommendation does not invoke Razorpay/payment execution", () => {
    const callsBefore = getRazorpayCallCount();
    const result = recommendProducts("keyboard and mouse");
    assert.ok(result.recommendations.length > 0);
    const callsAfter = getRazorpayCallCount();

    assert.strictEqual(callsAfter, callsBefore); // Strictly 0 provider calls
  });

  it("15. Recommendation does not bypass or modify Policy Gate", () => {
    const result = recommendProducts("Ergonomic Mechanical Keyboard");
    assert.ok(result.recommendations.length > 0);
    const item = result.recommendations[0];

    // Transaction for this recommended product still goes to Policy Gate
    const intent: TransactionIntent = {
      action: "payment.execute",
      amount: item.price, // 4999 > 2000 approval limit
      currency: item.currency,
      merchantId: item.merchantId,
      productTitle: item.name,
      productId: item.productId,
      quantity: 1,
    };

    const policyEval = evaluatePolicy(intent, agentPolicy as PolicyConfig);
    // Verified that Policy Gate still escalates because ₹4,999 > ₹2,000 threshold
    assert.strictEqual(policyEval.decision, "ESCALATED");
    assert.strictEqual(policyEval.allowed, false);
  });
});
