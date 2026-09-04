import { describe, it } from "node:test";
import assert from "node:assert";
import { runSafetyScenario } from "@/lib/safetyLabHarness";

describe("Phase 10.8: Safety Lab — Integrity Mismatch Defense", () => {
  it("1. Verifies that tampering with critical commerce fields (amount, productId, merchantId, currency, quantity) is cryptographically detected and rejected", async () => {
    const result = await runSafetyScenario("INTEGRITY_MISMATCH_DEFENSE");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "INTEGRITY_MISMATCH_DEFENSE");

    // 2. Scenario status is PASSED because all 5 tampering vectors were detected and rejected
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status completed with valid legitimate baseline
    assert.strictEqual(result.executionStatus, "SUCCESS");

    // 4. Policy Gate decision is APPROVED
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.riskLevel, "LOW");

    // 5. Razorpay call count is exactly 1 (for the initial legitimate purchase, 0 for tampered payloads)
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.strictEqual(result.razorpayOrderId, "order_rzp_integrity_original_01");

    // 6. Decision receipt integrity of the authentic baseline is verified
    assert.strictEqual(result.decisionReceiptVerified, true);
    assert.ok(result.receiptHash);

    // 7. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
    assert.strictEqual(resultJson.includes("cred_safety_lab"), false);
  });
});
