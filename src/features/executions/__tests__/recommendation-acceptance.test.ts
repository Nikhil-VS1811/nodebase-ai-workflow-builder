import { describe, it } from "node:test";
import assert from "node:assert";
import {
  recommendProducts,
  acceptRecommendation,
  getAgentReadableProduct,
  type RecommendationAcceptance,
} from "@/lib/commerceCatalog";
import { getRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import { evaluatePolicy, type PolicyConfig } from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";

describe("Phase 13.2: Explicit User Acceptance Boundary", () => {
  it("1. Recommendation can be explicitly accepted", () => {
    const recs = recommendProducts("wireless mouse");
    assert.ok(recs.recommendations.length > 0);

    const rec = recs.recommendations[0];
    const acceptance = acceptRecommendation({
      productId: rec.productId,
      quantity: 1,
      userConfirmation: "yes, please buy this",
    });

    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.status, "ACCEPTED");
    assert.strictEqual(acceptance.productId, "prod_mouse_02");
    assert.ok(acceptance.transactionIntent);
  });

  it("2. Accepted product ID comes from the trusted catalog", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.productId, "prod_mouse_02");
  });

  it("3. Accepted price comes from the trusted catalog", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      quantity: 1,
    });
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.amount, 1999);
  });

  it("4. Accepted merchant comes from the trusted catalog", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.merchantId, "merchant_nodebase_01");
  });

  it("5. Accepted currency comes from the trusted catalog", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.currency, "INR");
  });

  it("6. Accepted availability is revalidated", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_desk_mat_06",
      quantity: 5,
    });
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.amount, 899 * 5);
  });

  it("7. Stale/attacker-supplied price cannot override the trusted catalog price", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      clientSuppliedPrice: 1, // Attacker tries to inject ₹1
      userConfirmation: "confirm",
    });
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.amount, 1999); // Authoritative ₹1,999 strictly enforced
  });

  it("8. Attacker-supplied merchant cannot override the trusted merchant", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      clientSuppliedMerchant: "attacker_rogue_merchant", // Attacker tries to substitute merchant
      userConfirmation: "confirm",
    });
    assert.strictEqual(acceptance.accepted, true);
    assert.strictEqual(acceptance.transactionIntent?.merchantId, "merchant_nodebase_01"); // Trusted merchant strictly enforced
  });

  it("9. Unknown product cannot be accepted (fails closed)", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_nonexistent_999",
      userConfirmation: "confirm",
    });
    assert.strictEqual(acceptance.accepted, false);
    assert.strictEqual(acceptance.status, "REJECTED_UNKNOWN_PRODUCT");
    assert.strictEqual(acceptance.transactionIntent, null);
    assert.ok(acceptance.rejectionReason?.includes("no longer exists"));
  });

  it("10. Unavailable/excessive quantity product cannot be accepted", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      quantity: 500, // Stock is 40
      userConfirmation: "confirm",
    });
    assert.strictEqual(acceptance.accepted, false);
    assert.strictEqual(acceptance.status, "REJECTED_UNAVAILABLE");
    assert.strictEqual(acceptance.transactionIntent, null);
  });

  it("11. Non-affirmative language cannot create acceptance", () => {
    const nonAffirmativeCases = [
      "maybe",
      "sounds good",
      "interesting",
      "tell me more",
      "what else",
      "not yet",
    ];

    for (const phrase of nonAffirmativeCases) {
      const acceptance = acceptRecommendation({
        productId: "prod_mouse_02",
        userConfirmation: phrase,
      });
      assert.strictEqual(acceptance.accepted, false);
      assert.strictEqual(acceptance.status, "REJECTED_NON_AFFIRMATIVE");
      assert.strictEqual(acceptance.transactionIntent, null);
      assert.ok(acceptance.rejectionReason?.includes("Non-affirmative confirmation"));
    }
  });

  it("12. Recommendation display alone does not create acceptance", () => {
    const recs = recommendProducts("wireless mouse");
    assert.ok(recs.recommendations.length > 0);

    // Merely querying recommendations produces 0 acceptance records and 0 transaction intents
    assert.strictEqual((recs as any).accepted, undefined);
    assert.strictEqual((recs as any).transactionIntent, undefined);
  });

  it("13. Acceptance does not call Razorpay", () => {
    const callsBefore = getRazorpayCallCount();
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);
    const callsAfter = getRazorpayCallCount();

    assert.strictEqual(callsAfter, callsBefore); // Strictly 0 provider calls
  });

  it("14. Acceptance does not create PaymentOrder", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual((acceptance as any).paymentOrderId, undefined);
    assert.strictEqual((acceptance as any).paymentOrder, undefined);
  });

  it("15. Acceptance does not grant authorization", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);

    // Acceptance only produces un-evaluated TransactionIntent
    assert.strictEqual((acceptance as any).allowed, undefined);
    assert.strictEqual((acceptance as any).decision, undefined);
    assert.strictEqual((acceptance as any).authorizationToken, undefined);

    // It must independently be submitted to Policy Gate
    const intent = acceptance.transactionIntent!;
    const policyResult = evaluatePolicy(intent, agentPolicy as PolicyConfig);
    assert.strictEqual(policyResult.decision, "APPROVED");
    assert.strictEqual(policyResult.allowed, true);
  });

  it("16. Acceptance result contains no execution credentials or tokens", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual((acceptance as any).credentials, undefined);
    assert.strictEqual((acceptance as any).secret, undefined);
    assert.strictEqual((acceptance as any).apiKey, undefined);
  });

  it("17. Same recommendation acceptance is deterministic for equivalent inputs", () => {
    const acc1 = acceptRecommendation({ productId: "prod_mouse_02", quantity: 1 });
    const acc2 = acceptRecommendation({ productId: "prod_mouse_02", quantity: 1 });

    assert.strictEqual(acc1.accepted, acc2.accepted);
    assert.strictEqual(acc1.status, acc2.status);
    assert.strictEqual(acc1.productId, acc2.productId);
    assert.strictEqual(acc1.transactionIntent?.amount, acc2.transactionIntent?.amount);
    assert.strictEqual(acc1.transactionIntent?.merchantId, acc2.transactionIntent?.merchantId);
  });

  it("18. Catalog mutation attempts cannot alter the accepted trusted product", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.ok(acceptance.transactionIntent);

    assert.throws(() => {
      (acceptance.transactionIntent as any).amount = 1;
    }, /Cannot assign to read only property/);

    const fresh = getAgentReadableProduct("prod_mouse_02");
    assert.ok(fresh);
    assert.strictEqual(fresh.price, 1999);
  });
});
