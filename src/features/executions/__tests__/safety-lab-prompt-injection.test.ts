import { describe, it } from "node:test";
import assert from "node:assert";
import { runSafetyScenario } from "@/lib/safetyLabHarness";

describe("Phase 10.3: Safety Lab — Prompt Injection Defense Scenario", () => {
  it("1. Exercises the adversarial prompt injection attack and blocks it through trusted boundaries", async () => {
    const result = await runSafetyScenario("PROMPT_INJECTION_DEFENSE");

    // 1. Scenario identification
    assert.strictEqual(result.scenarioId, "PROMPT_INJECTION_DEFENSE");

    // 2. Scenario status is PASSED because the attack was safely neutralized
    assert.strictEqual(result.status, "PASSED");

    // 3. Execution status was stopped and denied
    assert.strictEqual(result.executionStatus, "DENIED");

    // 4. Policy Gate issued a DENIED decision with HIGH risk
    assert.strictEqual(result.policyDecision, "DENIED");
    assert.strictEqual(result.riskLevel, "HIGH");
    assert.strictEqual(result.riskScore, "HIGH");

    // 5. Razorpay was NOT called (0 calls)
    assert.strictEqual(result.razorpayCallCount, 0);

    // 6. No Razorpay order ID was created
    assert.strictEqual(result.razorpayOrderId, undefined);

    // 7. Failure reason clearly reflects security policy alert
    assert.ok(result.failureReason);
    assert.ok(
      result.failureReason.includes("Security Alert") ||
        result.failureReason.includes("prompt injection") ||
        result.failureReason.includes("Untrusted"),
    );

    // 8. No secrets or credentials in the output object
    const resultJson = JSON.stringify(result);
    assert.strictEqual(resultJson.includes("rzp_test_key"), false);
    assert.strictEqual(resultJson.includes("rzp_test_secret"), false);
  });
});
