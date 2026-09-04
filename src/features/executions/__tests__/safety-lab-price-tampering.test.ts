import { describe, it } from "node:test";
import assert from "node:assert";
import { runSafetyScenario } from "@/lib/safetyLabHarness";

describe("Phase 10.4: Safety Lab — Catalog Price Tampering Defense", () => {
  it("1. Exercises adversarial price tampering attack, preserves catalog authority, and ensures provider charge is strictly trusted price", async () => {
    const result = await runSafetyScenario("CATALOG_PRICE_TAMPERING");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "CATALOG_PRICE_TAMPERING");

    // 2. Scenario status is PASSED because tampering was prevented & catalog price was enforced
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status completed with normalized valid purchase
    assert.strictEqual(result.executionStatus, "SUCCESS");

    // 4. Policy Gate decision
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.riskLevel, "LOW");

    // 5. Razorpay call count is exactly 1 for the authorized transaction
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.strictEqual(result.razorpayOrderId, "order_rzp_price_tamper_defended");

    // 6. Decision receipt integrity was verified
    assert.strictEqual(result.decisionReceiptVerified, true);
    assert.ok(result.receiptHash);

    // 7. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
  });
});
