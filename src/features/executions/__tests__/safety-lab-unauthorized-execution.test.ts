import { describe, it } from "node:test";
import assert from "node:assert";
import { runSafetyScenario } from "@/lib/safetyLabHarness";

describe("Phase 10.6: Safety Lab — Unauthorized Execution Defense", () => {
  it("1. Exercises all unauthorized execution states (missing, denied, allowed=false, unapproved escalation, malformed) and confirms fail-closed rejection at provider boundary", async () => {
    const result = await runSafetyScenario("UNAUTHORIZED_EXECUTION");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "UNAUTHORIZED_EXECUTION");

    // 2. Scenario status is PASSED because all unauthorized execution attempts were blocked
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status completed with FAILED (all attempts rejected)
    assert.strictEqual(result.executionStatus, "FAILED");

    // 4. Policy Gate decision
    assert.strictEqual(result.policyDecision, "DENIED");
    assert.strictEqual(result.riskLevel, "HIGH");

    // 5. Razorpay call count is strictly 0 across all 5 unauthorized states
    assert.strictEqual(result.razorpayCallCount, 0);

    // 6. No Razorpay order was ever created
    assert.strictEqual(result.razorpayOrderId, undefined);

    // 7. Failure reason details the blocked states
    assert.ok(result.failureReason);
    assert.ok(result.failureReason.includes("missing_policy"));
    assert.ok(result.failureReason.includes("denied_policy"));
    assert.ok(result.failureReason.includes("allowed_false"));
    assert.ok(result.failureReason.includes("escalated_unapproved"));
    assert.ok(result.failureReason.includes("malformed_auth"));

    // 8. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
    assert.strictEqual(resultJson.includes("cred_safety_lab"), false);
  });
});
