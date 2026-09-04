import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildDecisionReceipt,
  canonicalizeJson,
  computeReceiptHash,
  verifyReceiptIntegrity,
  getCatalogSnapshot,
} from "@/lib/decisionReceipt";
import type { TransactionIntent, PolicyEvaluationResult, HumanApprovalRecord } from "@/lib/policyEngine";

describe("Phase 8: Commerce Decision Receipt & Tamper-Evident Audit Trail", () => {
  const sampleContext = {
    userMessage: "Buy one wireless precision mouse",
    transactionIntent: {
      action: "payment.execute",
      productId: "prod_mouse_02",
      productTitle: "Wireless Precision Mouse",
      amount: 1999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      quantity: 1,
    } as TransactionIntent,
    policyEvaluation: {
      decision: "APPROVED",
      status: "APPROVED",
      allowed: true,
      riskLevel: "LOW",
      riskScore: "LOW",
      reason: "Within auto-approval spending limit",
      reasons: ["Within auto-approval spending limit"],
      untrustedInputDetected: false,
      timestamp: "2026-09-01T00:00:00.000Z",
      policyVersion: "1.0.0",
    } as PolicyEvaluationResult,
    razorpayResult: {
      id: "order_test_mouse_01",
      amount: 199900,
      currency: "INR",
      receipt: "rcpt_mouse_01",
      status: "created",
    },
    commerceIntegrity: {
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
      reasons: ["All 8 checks passed"],
      verificationVersion: "1.0.0",
      verifiedAt: "2026-09-01T00:00:01.000Z",
    },
  };

  it("1. Builds a complete Decision Receipt for successful approved transaction", () => {
    const receipt = buildDecisionReceipt({
      executionId: "exec_approved_123",
      workflowId: "wf_123",
      context: sampleContext,
      finalOutcome: {
        status: "VERIFIED",
        completedAt: "2026-09-01T00:00:02.000Z",
      },
    });

    assert.ok(receipt.id);
    assert.strictEqual(receipt.executionId, "exec_approved_123");
    assert.strictEqual(receipt.workflowId, "wf_123");
    assert.strictEqual(receipt.receiptVersion, "1.0.0");
    assert.ok(receipt.integrityHash);
    assert.strictEqual(receipt.payload.transactionIntent.productId, "prod_mouse_02");
    assert.strictEqual(receipt.payload.payment?.razorpayOrderId, "order_test_mouse_01");
    assert.strictEqual(receipt.payload.commerceIntegrity?.status, "VERIFIED");
  });

  it("2. Captures trusted catalog snapshot accurately at decision time", () => {
    const snapshot = getCatalogSnapshot("prod_keyboard_01");
    assert.strictEqual(snapshot.productId, "prod_keyboard_01");
    assert.strictEqual(snapshot.title, "Ergonomic Mechanical Keyboard");
    assert.strictEqual(snapshot.price, 4999);
    assert.strictEqual(snapshot.currency, "INR");
    assert.strictEqual(snapshot.merchantId, "merchant_nodebase_01");
  });

  it("3. Deterministic SHA-256 Hashing: identical payloads produce identical hashes regardless of key insertion order", () => {
    const payloadA = {
      b: 2,
      a: 1,
      nested: { z: 10, y: 20 },
    };
    const payloadB = {
      a: 1,
      nested: { y: 20, z: 10 },
      b: 2,
    };

    assert.strictEqual(canonicalizeJson(payloadA), canonicalizeJson(payloadB));
  });

  it("4. Tamper Detection: modifying amount in receipt invalidates cryptographic integrity", () => {
    const receipt = buildDecisionReceipt({
      executionId: "exec_tamper_amt",
      workflowId: "wf_123",
      context: sampleContext,
      finalOutcome: { status: "VERIFIED", completedAt: "2026-09-01T00:00:02.000Z" },
    });

    // Valid check
    const initialCheck = verifyReceiptIntegrity({
      payload: receipt.payload,
      integrityHash: receipt.integrityHash,
    });
    assert.strictEqual(initialCheck.valid, true);

    // Tampered payload: change amount from 1999 to 999
    const tamperedPayload = JSON.parse(JSON.stringify(receipt.payload));
    tamperedPayload.transactionIntent.amount = 999;

    const tamperedCheck = verifyReceiptIntegrity({
      payload: tamperedPayload,
      integrityHash: receipt.integrityHash,
    });
    assert.strictEqual(tamperedCheck.valid, false);
    assert.notStrictEqual(tamperedCheck.calculatedHash, tamperedCheck.storedHash);
  });

  it("5. Tamper Detection: modifying policy decision from ESCALATED to APPROVED is detected", () => {
    const escalatedContext = {
      ...sampleContext,
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: false,
        riskLevel: "MEDIUM",
        riskScore: "MEDIUM",
        reason: "Above threshold",
        reasons: ["Above threshold"],
        untrustedInputDetected: false,
        timestamp: "2026-09-01T00:00:00.000Z",
        policyVersion: "1.0.0",
      } as PolicyEvaluationResult,
    };

    const receipt = buildDecisionReceipt({
      executionId: "exec_tamper_policy",
      workflowId: "wf_123",
      context: escalatedContext,
      finalOutcome: { status: "PENDING_APPROVAL", completedAt: "2026-09-01T00:00:02.000Z" },
    });

    assert.strictEqual(receipt.payload.policyDecision.decision, "ESCALATED");

    // Attacker tampers with decision in DB
    const tamperedPayload = JSON.parse(JSON.stringify(receipt.payload));
    tamperedPayload.policyDecision.decision = "APPROVED";
    tamperedPayload.policyDecision.allowed = true;

    const check = verifyReceiptIntegrity({
      payload: tamperedPayload,
      integrityHash: receipt.integrityHash,
    });
    assert.strictEqual(check.valid, false);
  });

  it("6. Tamper Detection: modifying human approver identity is detected", () => {
    const humanApproval: HumanApprovalRecord = {
      approved: true,
      decision: "APPROVED_BY_HUMAN",
      approverId: "user_admin_01",
      approverName: "Admin User",
      approverEmail: "admin@example.com",
      approvedAt: "2026-09-01T00:05:00.000Z",
      notes: "Approved for office use",
    };

    const escalatedWithApprovalContext = {
      ...sampleContext,
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: true,
        riskLevel: "MEDIUM",
        riskScore: "MEDIUM",
        reason: "Requires confirmation",
        reasons: ["Requires confirmation"],
        untrustedInputDetected: false,
        timestamp: "2026-09-01T00:00:00.000Z",
        policyVersion: "1.0.0",
        humanApproval,
      } as PolicyEvaluationResult,
    };

    const receipt = buildDecisionReceipt({
      executionId: "exec_tamper_human",
      workflowId: "wf_123",
      context: escalatedWithApprovalContext,
      finalOutcome: { status: "VERIFIED", completedAt: "2026-09-01T00:06:00.000Z" },
    });

    assert.strictEqual(receipt.payload.humanDecision?.approverEmail, "admin@example.com");

    // Attacker modifies approver to another user
    const tamperedPayload = JSON.parse(JSON.stringify(receipt.payload));
    tamperedPayload.humanDecision.approverEmail = "attacker@example.com";

    const check = verifyReceiptIntegrity({
      payload: tamperedPayload,
      integrityHash: receipt.integrityHash,
    });
    assert.strictEqual(check.valid, false);
  });

  it("7. Human Rejection: builds receipt capturing REJECTED_BY_HUMAN with no payment order", () => {
    const rejectionRecord: HumanApprovalRecord = {
      approved: false,
      decision: "REJECTED_BY_HUMAN",
      approverId: "user_admin_01",
      approverName: "Admin User",
      approverEmail: "admin@example.com",
      rejectedAt: "2026-09-01T00:05:00.000Z",
      notes: "Rejected due to budget limits",
    };

    const rejectedContext = {
      ...sampleContext,
      policyEvaluation: {
        decision: "ESCALATED",
        status: "ESCALATED",
        allowed: false,
        riskLevel: "MEDIUM",
        riskScore: "MEDIUM",
        reason: "Requires confirmation",
        reasons: ["Requires confirmation"],
        untrustedInputDetected: false,
        timestamp: "2026-09-01T00:00:00.000Z",
        policyVersion: "1.0.0",
        humanApproval: rejectionRecord,
      } as PolicyEvaluationResult,
      razorpayResult: undefined, // NO payment executed
    };

    const receipt = buildDecisionReceipt({
      executionId: "exec_rejected_human",
      workflowId: "wf_123",
      context: rejectedContext,
      finalOutcome: { status: "REJECTED", reason: "Rejected due to budget limits", completedAt: "2026-09-01T00:06:00.000Z" },
    });

    assert.strictEqual(receipt.payload.humanDecision?.decision, "REJECTED_BY_HUMAN");
    assert.strictEqual(receipt.payload.humanDecision?.approved, false);
    assert.strictEqual(receipt.payload.payment, undefined);
    assert.strictEqual(receipt.payload.finalOutcome.status, "REJECTED");
  });

  it("8. Policy DENIED: builds receipt capturing DENIED outcome with no payment execution", () => {
    const deniedContext = {
      userMessage: "Buy 10 keyboards",
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_keyboard_01",
        productTitle: "Ergonomic Mechanical Keyboard",
        amount: 49990,
        currency: "INR",
        merchantId: "merchant_nodebase_01",
        quantity: 10,
      } as TransactionIntent,
      policyEvaluation: {
        decision: "DENIED",
        status: "DENIED",
        allowed: false,
        riskLevel: "HIGH",
        riskScore: "HIGH",
        reason: "Transaction amount exceeds max transaction limit (₹5000)",
        reasons: ["Transaction amount exceeds max transaction limit (₹5000)"],
        untrustedInputDetected: false,
        timestamp: "2026-09-01T00:00:00.000Z",
        policyVersion: "1.0.0",
      } as PolicyEvaluationResult,
      razorpayResult: undefined,
    };

    const receipt = buildDecisionReceipt({
      executionId: "exec_policy_denied",
      workflowId: "wf_123",
      context: deniedContext,
      finalOutcome: { status: "FAILED", reason: "Policy Gate DENIED", completedAt: "2026-09-01T00:00:02.000Z" },
    });

    assert.strictEqual(receipt.payload.policyDecision.decision, "DENIED");
    assert.strictEqual(receipt.payload.policyDecision.allowed, false);
    assert.strictEqual(receipt.payload.payment, undefined);
  });
});
