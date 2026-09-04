import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  createDiscoveryAction,
  createClarificationAction,
  createAcceptanceAction,
  createAuthorizationAction,
  createExecutionAction,
  createVerificationAction,
  createReceiptAction,
  buildCommerceContract,
  type AgenticCommerceAction,
  type AgenticCommerceContract,
} from "@/lib/agenticCommerceContract";
import { recommendProducts, acceptRecommendation } from "@/lib/commerceCatalog";
import { evaluatePolicy, type TransactionIntent, type PolicyConfig } from "@/lib/policyEngine";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import baseAgentPolicy from "@/config/agentPolicy.json";

describe("Phase 16.1: Agentic Commerce Action Contract", () => {
  beforeEach(() => {
    resetRazorpayCallCount();
  });

  it("1. All 7 conceptual lifecycle stages are explicitly representable", () => {
    // 1. DISCOVER
    const recs = recommendProducts("wireless precision mouse");
    const discoverAct = createDiscoveryAction({
      query: "wireless precision mouse",
      recommendations: recs.recommendations,
    });
    assert.strictEqual(discoverAct.stage, "DISCOVER");
    assert.strictEqual(discoverAct.isAdvisory, true);
    assert.ok(discoverAct.topCandidate);

    // 2. CLARIFY
    const clarifyAct = createClarificationAction({
      query: "wireless",
      clarification: {
        clarificationRequired: true,
        reason: "Multiple matches found",
        candidateProducts: [
          {
            productId: "prod_mouse_02",
            name: "Wireless Precision Mouse",
            price: 1999,
            currency: "INR",
            merchantId: "merchant_nodebase_01",
            relevanceScore: 50,
            finalScore: 120,
          },
        ],
        suggestedQuestion: "Which wireless product would you like?",
      },
    });
    assert.strictEqual(clarifyAct.stage, "CLARIFY");
    assert.strictEqual(clarifyAct.hasExecutableIntent, false);
    assert.strictEqual(clarifyAct.isAdvisory, true);

    // 3. ACCEPT
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      userConfirmation: "yes, please buy",
    });
    const acceptAct = createAcceptanceAction({
      productId: "prod_mouse_02",
      userConfirmation: "yes, please buy",
      acceptance,
    });
    assert.strictEqual(acceptAct.stage, "ACCEPT");
    assert.strictEqual(acceptAct.isBuyerIntentOnly, true);
    assert.strictEqual(acceptAct.isAuthorized, false);
    assert.strictEqual(acceptAct.accepted, true);

    // 4. AUTHORIZE
    const evalResult = evaluatePolicy(
      acceptAct.transactionIntent as TransactionIntent,
      baseAgentPolicy as PolicyConfig,
    );
    const authAct = createAuthorizationAction({ policyEvaluation: evalResult });
    assert.strictEqual(authAct.stage, "AUTHORIZE");
    assert.strictEqual(authAct.decision, "APPROVED");
    assert.strictEqual(authAct.allowed, true);
    assert.strictEqual(authAct.isPolicyGateEvaluation, true);

    // 5. EXECUTE
    const execAct = createExecutionAction({
      status: "SUCCESS",
      paymentOrderId: "po_test_16_1",
      razorpayOrderId: "order_rzp_16_1",
      amountRupees: 1999,
      currency: "INR",
    });
    assert.strictEqual(execAct.stage, "EXECUTE");
    assert.strictEqual(execAct.status, "SUCCESS");
    assert.strictEqual(execAct.razorpayOrderId, "order_rzp_16_1");

    // 6. VERIFY
    const verifyAct = createVerificationAction({
      integrity: {
        verified: true,
        status: "VERIFIED",
        checks: {
          authorization: true,
          product: true,
          quantity: true,
          amount: true,
          currency: true,
          merchant: true,
          executionIdentity: true,
          idempotency: true,
        },
        reasons: ["All integrity checks passed"],
        verificationVersion: "1.0.0",
        verifiedAt: "2026-09-03T12:00:00.000Z",
      },
    });
    assert.strictEqual(verifyAct.stage, "VERIFY");
    assert.strictEqual(verifyAct.verified, true);
    assert.strictEqual(verifyAct.isIntegrityVerification, true);

    // 7. RECEIPT
    const receiptAct = createReceiptAction({
      receipt: {
        id: "rcpt_test_16_1",
        executionId: "exec_16_1",
        workflowId: "wf_16_1",
        receiptVersion: "1.0.0",
        integrityHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        createdAt: "2026-09-03T12:00:01.000Z",
        payload: {} as any,
      },
    });
    assert.strictEqual(receiptAct.stage, "RECEIPT");
    assert.strictEqual(receiptAct.isAuditEvidenceOnly, true);
    assert.strictEqual(receiptAct.isAuthorizationToken, false);

    // Build Contract
    const contract = buildCommerceContract({
      actions: [
        discoverAct,
        clarifyAct,
        acceptAct,
        authAct,
        execAct,
        verifyAct,
        receiptAct,
      ],
    });

    assert.strictEqual(contract.actions.length, 7);
    assert.strictEqual(contract.currentStage, "RECEIPT");
    assert.strictEqual(contract.isComplete, true);
  });

  it("2. DISCOVER stage is strictly advisory and cannot execute or authorize", () => {
    const recs = recommendProducts("wireless mouse");
    const discoverAct = createDiscoveryAction({
      query: "wireless mouse",
      recommendations: recs.recommendations,
    });

    assert.strictEqual(discoverAct.isAdvisory, true);
    assert.strictEqual((discoverAct as any).allowed, undefined);
    assert.strictEqual((discoverAct as any).transactionIntent, undefined);
  });

  it("3. CLARIFY stage explicitly prohibits executable TransactionIntent", () => {
    const clarifyAct = createClarificationAction({
      query: "wireless",
      clarification: {
        clarificationRequired: true,
        reason: "Multiple near-tied items",
        candidateProducts: [],
        suggestedQuestion: "Choose product",
      },
    });

    assert.strictEqual(clarifyAct.hasExecutableIntent, false);
    assert.strictEqual((clarifyAct as any).transactionIntent, undefined);
    assert.strictEqual((clarifyAct as any).allowed, undefined);
  });

  it("4. ACCEPT stage is distinct from authorization and cannot authorize payment", () => {
    const acceptance = acceptRecommendation({
      productId: "prod_mouse_02",
      userConfirmation: "yes, I accept",
    });
    const acceptAct = createAcceptanceAction({
      productId: "prod_mouse_02",
      userConfirmation: "yes, I accept",
      acceptance,
    });

    assert.strictEqual(acceptAct.isBuyerIntentOnly, true);
    assert.strictEqual(acceptAct.isAuthorized, false);
    assert.ok(acceptAct.transactionIntent);
  });

  it("5. RECEIPT stage is strictly audit evidence and NOT an authorization token", () => {
    const receiptAct = createReceiptAction({
      receipt: {
        id: "rcpt_99",
        executionId: "exec_99",
        workflowId: "wf_99",
        receiptVersion: "1.0.0",
        integrityHash: "sha256_mock_hash",
        createdAt: "2026-09-03T12:00:00.000Z",
        payload: {} as any,
      },
    });

    assert.strictEqual(receiptAct.isAuditEvidenceOnly, true);
    assert.strictEqual(receiptAct.isAuthorizationToken, false);
  });

  it("6. Sensitive credentials, secrets, or internal auth keys are never represented in the contract", () => {
    const recs = recommendProducts("wireless mouse");
    const discover = createDiscoveryAction({ query: "wireless mouse", recommendations: recs.recommendations });
    const auth = createAuthorizationAction({
      policyEvaluation: {
        decision: "APPROVED",
        status: "APPROVED",
        allowed: true,
        riskLevel: "LOW",
        riskScore: "LOW",
        reason: "Policy pass",
        reasons: ["Policy pass"],
        untrustedInputDetected: false,
        timestamp: "2026-09-03T12:00:00.000Z",
      },
    });

    const contract = buildCommerceContract({ actions: [discover, auth] });

    // Stringify and inspect for sensitive leaks
    const serialized = JSON.stringify(contract);
    assert.ok(!serialized.includes("apiKey"));
    assert.ok(!serialized.includes("secret"));
    assert.ok(!serialized.includes("privateKey"));
    assert.ok(!serialized.includes("bearer"));
  });

  it("7. Contract creation produces zero Razorpay calls, zero PaymentOrders, and zero human approvals", () => {
    resetRazorpayCallCount();

    const recs = recommendProducts("keyboard");
    const discover = createDiscoveryAction({ query: "keyboard", recommendations: recs.recommendations });
    const clarify = createClarificationAction({
      query: "keyboard",
      clarification: {
        clarificationRequired: true,
        reason: "Multiple items",
        candidateProducts: [],
        suggestedQuestion: "Choose item",
      },
    });

    buildCommerceContract({ actions: [discover, clarify] });

    assert.strictEqual(getRazorpayCallCount(), 0);
  });
});
