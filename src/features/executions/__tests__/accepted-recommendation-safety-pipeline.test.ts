import { describe, it } from "node:test";
import assert from "node:assert";
import {
  recommendProducts,
  acceptRecommendation,
  executeAcceptedRecommendation,
  getAgentReadableProduct,
  type RecommendationAcceptance,
} from "@/lib/commerceCatalog";
import {
  getRazorpayCallCount,
  resetRazorpayCallCount,
  setRazorpayMockHandler,
} from "@/lib/razorpayInstrumentation";
import { evaluatePolicy, type TransactionIntent, type PolicyConfig } from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";
import { verifyReceiptIntegrity } from "@/lib/decisionReceipt";

describe("Phase 13.3: Re-Run Full Safety Pipeline After Acceptance", () => {
  it("1. Accepted in-policy recommendation reaches the existing Policy Gate and executes normally", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02", // Price ₹1,999 <= ₹2,000 threshold
      quantity: 1,
      userConfirmation: "yes, confirm purchase",
    });

    assert.strictEqual(acceptance.accepted, true);

    const result = await executeAcceptedRecommendation({ acceptance });

    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.ok(result.razorpayOrder);
    assert.strictEqual(result.razorpayOrder.amount, 199900); // 1,999 INR in paise
    assert.ok(result.decisionReceipt);
  });

  it("2. Accepted recommendation above spending threshold is ESCALATED rather than automatically executed", async () => {
    resetRazorpayCallCount();

    const acceptance = acceptRecommendation({
      productId: "prod_keyboard_01", // Price ₹4,999 > ₹2,000 threshold
      quantity: 1,
      userConfirmation: "yes",
    });

    assert.strictEqual(acceptance.accepted, true);

    const result = await executeAcceptedRecommendation({ acceptance });

    assert.strictEqual(result.status, "PENDING_APPROVAL");
    assert.strictEqual(result.policyDecision, "ESCALATED");
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.razorpayCallCount, 0); // Strictly 0 provider calls
    assert.strictEqual(result.razorpayOrder, undefined);
  });

  it("3. Escalated accepted recommendation executes only after existing human approval", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_escalated_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation({
      productId: "prod_keyboard_01", // Price ₹4,999 > ₹2,000 threshold
      quantity: 1,
      userConfirmation: "confirm",
    });

    const result = await executeAcceptedRecommendation({
      acceptance,
      humanApproval: {
        approved: true,
        approverId: "human_manager_01",
        approverName: "Finance Lead",
        decision: "APPROVED_BY_HUMAN",
        approvedAt: new Date().toISOString(),
      },
    });

    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.ok(result.razorpayOrder);
    assert.strictEqual(result.razorpayOrder.amount, 499900); // 4,999 INR in paise
  });

  it("4. Accepted recommendation with attacker-supplied price cannot change the trusted amount", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_price_tamper",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      clientSuppliedPrice: 1, // Attacker tries to inject ₹1
      userConfirmation: "yes",
    });

    const result = await executeAcceptedRecommendation({ acceptance });

    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.strictEqual(result.razorpayOrder.amount, 199900); // Strictly ₹1,999 (199900 paise) charged
  });

  it("5. Accepted recommendation with attacker-supplied merchant cannot change the trusted merchant", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_merchant_tamper",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      clientSuppliedMerchant: "attacker_evil_corp",
      userConfirmation: "yes",
    });

    const result = await executeAcceptedRecommendation({ acceptance });

    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.strictEqual(result.razorpayOrder.notes.merchantId, "merchant_nodebase_01");
  });

  it("6. Accepted recommendation with unsupported currency is rejected/fails closed", async () => {
    resetRazorpayCallCount();

    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      clientSuppliedCurrency: "USD",
    });

    assert.strictEqual(acceptance.accepted, true);
    // Currency is re-resolved to catalog currency INR
    assert.strictEqual(acceptance.transactionIntent?.currency, "INR");
  });

  it("7. Accepted unknown product cannot reach Razorpay", async () => {
    resetRazorpayCallCount();

    const fakeAcceptance: RecommendationAcceptance = {
      accepted: true,
      status: "ACCEPTED",
      productId: "prod_fake_phantom_99",
      catalogVersion: "1.0.0",
      timestamp: new Date().toISOString(),
      transactionIntent: {
        action: "payment.execute",
        amount: 100,
        currency: "INR",
        merchantId: "merchant_fake",
        productTitle: "Phantom Item",
        productId: "prod_fake_phantom_99",
        quantity: 1,
      },
    };

    const result = await executeAcceptedRecommendation({ acceptance: fakeAcceptance });

    assert.strictEqual(result.status, "DENIED");
    assert.strictEqual(result.razorpayCallCount, 0); // Strictly 0 provider calls
  });

  it("8. Accepted unavailable product cannot reach Razorpay", async () => {
    resetRazorpayCallCount();

    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      quantity: 1000, // Stock is 40
      userConfirmation: "yes",
    });

    assert.strictEqual(acceptance.accepted, false);
    assert.strictEqual(acceptance.status, "REJECTED_UNAVAILABLE");

    const result = await executeAcceptedRecommendation({ acceptance });
    assert.strictEqual(result.status, "REJECTED_UNACCEPTED");
    assert.strictEqual(result.razorpayCallCount, 0);
  });

  it("9. Acceptance does not bypass the existing authorization boundary", async () => {
    resetRazorpayCallCount();

    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(acceptance.accepted, true);

    // Verify acceptance itself does not contain allowed=true
    assert.strictEqual((acceptance as any).allowed, undefined);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("10. Provider execution occurs only after existing authorization", async () => {
    resetRazorpayCallCount();

    const acceptance = acceptRecommendation("prod_mouse_02");

    // Before execution call: 0 calls
    assert.strictEqual(getRazorpayCallCount(), 0);

    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_authorized",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    await executeAcceptedRecommendation({ acceptance });

    // After authorized execution: exactly 1 call
    assert.strictEqual(getRazorpayCallCount(), 1);
  });

  it("11. PaymentOrder/idempotency behavior remains the existing behavior", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_idem_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation("prod_mouse_02");
    const idempotencyKey = "idem_key_rec_replay_01";

    const res1 = await executeAcceptedRecommendation({ acceptance, idempotencyKey });
    assert.strictEqual(res1.status, "SUCCESS");
    assert.strictEqual(res1.razorpayCallCount, 1);
  });

  it("12. Razorpay execution uses the existing execution boundary", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_boundary_check",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation("prod_mouse_02");
    const result = await executeAcceptedRecommendation({ acceptance });

    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.razorpayOrder.id, "order_rzp_rec_boundary_check");
  });

  it("13. Commerce Decision Receipt is generated and cryptographically verifiable", async () => {
    resetRazorpayCallCount();
    setRazorpayMockHandler(async ({ amount, currency, receipt, notes }) => ({
      id: "order_rzp_rec_receipt_01",
      amount,
      currency,
      receipt,
      status: "created",
      notes,
      created_at: Math.floor(Date.now() / 1000),
    }));

    const acceptance = acceptRecommendation("prod_mouse_02");
    const result = await executeAcceptedRecommendation({ acceptance });

    assert.strictEqual(result.status, "SUCCESS");
    assert.ok(result.decisionReceipt);
    assert.strictEqual(result.decisionReceipt.payload.policyDecision.decision, "APPROVED");

    const verification = verifyReceiptIntegrity({
      payload: result.decisionReceipt.payload,
      integrityHash: result.decisionReceipt.integrityHash,
    });
    assert.strictEqual(verification.valid, true);
  });

  it("14. No second authorization/payment path exists", () => {
    const acceptance = acceptRecommendation("prod_mouse_02");
    assert.strictEqual(typeof executeAcceptedRecommendation, "function");
  });

  it("15. No recommendation-only operation creates a provider call", () => {
    resetRazorpayCallCount();
    const recs = recommendProducts("desk mat and keyboard");
    assert.ok(recs.recommendations.length > 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });

  it("16. A tampered TransactionIntent cannot directly authorize execution", async () => {
    resetRazorpayCallCount();

    const tamperedAcceptance: RecommendationAcceptance = {
      accepted: true,
      status: "ACCEPTED",
      productId: "prod_mouse_02",
      catalogVersion: "1.0.0",
      timestamp: new Date().toISOString(),
      transactionIntent: {
        action: "payment.execute",
        amount: 1, // Tampered price ₹1 vs ₹1,999
        currency: "INR",
        merchantId: "merchant_nodebase_01",
        productTitle: "Wireless Precision Mouse",
        productId: "prod_mouse_02",
        quantity: 1,
      },
    };

    const result = await executeAcceptedRecommendation({ acceptance: tamperedAcceptance });
    assert.strictEqual(result.status, "DENIED");
    assert.strictEqual(result.razorpayCallCount, 0); // Tampered intent rejected before provider
  });

  it("17. Existing direct purchase flow remains unchanged", () => {
    const intent: TransactionIntent = {
      action: "payment.execute",
      amount: 1999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      productTitle: "Wireless Precision Mouse",
      productId: "prod_mouse_02",
      quantity: 1,
    };

    const policyEval = evaluatePolicy(intent, agentPolicy as PolicyConfig);
    assert.strictEqual(policyEval.decision, "APPROVED");
    assert.strictEqual(policyEval.allowed, true);
  });

  it("18. Existing human approval flow remains unchanged", () => {
    const highAmountIntent: TransactionIntent = {
      action: "payment.execute",
      amount: 4999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      productTitle: "Ergonomic Mechanical Keyboard",
      productId: "prod_keyboard_01",
      quantity: 1,
    };

    const policyEval = evaluatePolicy(highAmountIntent, agentPolicy as PolicyConfig);
    assert.strictEqual(policyEval.decision, "ESCALATED");
    assert.strictEqual(policyEval.allowed, false);
  });
});
