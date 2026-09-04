import { describe, it } from "node:test";
import assert from "node:assert";
import { runSafetyScenario } from "@/lib/safetyLabHarness";

describe("Phase 10.7: Safety Lab — Replay & Duplicate Order Defense", () => {
  it("1. Replays identical logical transaction and verifies PaymentOrder reuse, matching order ID, and exactly 1 total Razorpay call", async () => {
    const result = await runSafetyScenario("REPLAY_DUPLICATE_DEFENSE");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "REPLAY_DUPLICATE_DEFENSE");

    // 2. Scenario status is PASSED because replay was idempotent and 0 duplicate orders created
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status completed successfully
    assert.strictEqual(result.executionStatus, "SUCCESS");

    // 4. Policy Gate decision is APPROVED
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.riskLevel, "LOW");

    // 5. Total Razorpay calls across BOTH executions is strictly 1
    assert.strictEqual(result.razorpayCallCount, 1);

    // 6. Same original order ID is reused
    assert.strictEqual(result.razorpayOrderId, "order_rzp_replay_original_01");

    // 7. PaymentOrder was reused & verified
    assert.strictEqual(result.paymentOrderStatus, "CREATED");
    assert.strictEqual(result.recoveryObserved, true);
    assert.strictEqual(result.decisionReceiptVerified, true);
    assert.ok(result.receiptHash);

    // 8. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
    assert.strictEqual(resultJson.includes("cred_safety_lab"), false);
  });
});
