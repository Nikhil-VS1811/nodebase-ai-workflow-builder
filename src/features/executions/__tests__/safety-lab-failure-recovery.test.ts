import { describe, it } from "node:test";
import assert from "node:assert";
import { runSafetyScenario } from "@/lib/safetyLabHarness";

describe("Phase 10.9: Safety Lab — Failure & Recovery Scenarios", () => {
  it("1. Tests RAZORPAY_TIMEOUT_RECOVERY: first attempt times out, retry completes safely with consistent order ID (calls = 2)", async () => {
    const result = await runSafetyScenario("RAZORPAY_TIMEOUT_RECOVERY");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "RAZORPAY_TIMEOUT_RECOVERY");

    // 2. Scenario status is PASSED
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status completed successfully
    assert.strictEqual(result.executionStatus, "SUCCESS");

    // 4. Policy Gate decision is APPROVED
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.riskLevel, "LOW");

    // 5. Total Razorpay calls: 1 initial attempt (timeout) + 1 retry = 2
    assert.strictEqual(result.razorpayCallCount, 2);
    assert.strictEqual(result.razorpayOrderId, "order_rzp_timeout_recovered");

    // 6. Recovery verified
    assert.strictEqual(result.recoveryObserved, true);
    assert.strictEqual(result.paymentOrderStatus, "CREATED");
    assert.strictEqual(result.decisionReceiptVerified, true);
    assert.ok(result.receiptHash);

    // 7. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
  });

  it("2. Tests DB_POST_CREATE_RECOVERY: order created, DB failure injected post-create, retry reuses PaymentOrder with zero duplicate provider calls (calls = 1)", async () => {
    const result = await runSafetyScenario("DB_POST_CREATE_RECOVERY");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "DB_POST_CREATE_RECOVERY");

    // 2. Scenario status is PASSED
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status completed successfully
    assert.strictEqual(result.executionStatus, "SUCCESS");

    // 4. Policy Gate decision is APPROVED
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.riskLevel, "LOW");

    // 5. Total Razorpay create calls is strictly 1 (retry reused existing PaymentOrder without calling provider again)
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.strictEqual(result.razorpayOrderId, "order_rzp_db_post_create_01");

    // 6. Recovery verified
    assert.strictEqual(result.recoveryObserved, true);
    assert.strictEqual(result.paymentOrderStatus, "CREATED");
    assert.strictEqual(result.decisionReceiptVerified, true);
    assert.ok(result.receiptHash);

    // 7. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
  });
});
