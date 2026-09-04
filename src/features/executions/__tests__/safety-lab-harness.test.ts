import { describe, it } from "node:test";
import assert from "node:assert";
import {
  SAFETY_LAB_SCENARIOS,
  SCENARIO_DEFINITIONS,
  type SafetyLabScenarioId,
  type SafetyLabResult,
  runSafetyScenario,
} from "@/lib/safetyLabHarness";

describe("Phase 10.2: Safety Lab Scenario Harness Foundation", () => {
  it("1. Accurately defines all 10 canonical safety lab scenarios", () => {
    const expectedScenarios: SafetyLabScenarioId[] = [
      "LEGITIMATE_PURCHASE",
      "SPENDING_LIMIT_ESCALATION",
      "PROMPT_INJECTION_DEFENSE",
      "CATALOG_PRICE_TAMPERING",
      "MERCHANT_SUBSTITUTION_DEFENSE",
      "REPLAY_DUPLICATE_DEFENSE",
      "INTEGRITY_MISMATCH_DEFENSE",
      "RAZORPAY_TIMEOUT_RECOVERY",
      "DB_POST_CREATE_RECOVERY",
      "UNAUTHORIZED_EXECUTION",
    ];

    assert.strictEqual(SAFETY_LAB_SCENARIOS.length, 10);
    for (const id of expectedScenarios) {
      assert.ok(SAFETY_LAB_SCENARIOS.includes(id), `Scenario ${id} must be in SAFETY_LAB_SCENARIOS`);
      assert.ok(SCENARIO_DEFINITIONS[id], `Definition for ${id} must exist`);
      assert.ok(SCENARIO_DEFINITIONS[id].title);
      assert.ok(SCENARIO_DEFINITIONS[id].description);
    }
  });

  it("2. Result structure can represent approved execution (LEGITIMATE_PURCHASE)", async () => {
    const result = await runSafetyScenario("LEGITIMATE_PURCHASE");

    assert.strictEqual(result.scenarioId, "LEGITIMATE_PURCHASE");
    assert.strictEqual(result.status, "PASSED");
    assert.strictEqual(result.executionStatus, "SUCCESS");
    assert.strictEqual(result.policyDecision, "APPROVED");
    assert.strictEqual(result.riskLevel, "LOW");
    assert.strictEqual(result.razorpayCallCount, 1);
    assert.strictEqual(result.razorpayOrderId, "order_rzp_legit_01");
    assert.strictEqual(result.decisionReceiptVerified, true);
    assert.ok(result.receiptHash);
  });

  it("3. Result structure can represent escalation (SPENDING_LIMIT_ESCALATION)", async () => {
    const result = await runSafetyScenario("SPENDING_LIMIT_ESCALATION");

    assert.strictEqual(result.scenarioId, "SPENDING_LIMIT_ESCALATION");
    assert.strictEqual(result.status, "PASSED");
    assert.strictEqual(result.executionStatus, "PENDING_APPROVAL");
    assert.strictEqual(result.policyDecision, "ESCALATED");
    assert.strictEqual(result.razorpayCallCount, 0); // Blocked before payment
  });

  it("4. Result structure can represent prompt injection defense (PROMPT_INJECTION_DEFENSE)", async () => {
    const result = await runSafetyScenario("PROMPT_INJECTION_DEFENSE");

    assert.strictEqual(result.scenarioId, "PROMPT_INJECTION_DEFENSE");
    assert.strictEqual(result.status, "PASSED");
    assert.strictEqual(result.razorpayCallCount, 0);
  });

  it("5. Result structure can represent transient timeout recovery (RAZORPAY_TIMEOUT_RECOVERY)", async () => {
    const result = await runSafetyScenario("RAZORPAY_TIMEOUT_RECOVERY");

    assert.strictEqual(result.scenarioId, "RAZORPAY_TIMEOUT_RECOVERY");
    assert.strictEqual(result.status, "PASSED");
    assert.strictEqual(result.executionStatus, "SUCCESS");
    assert.strictEqual(result.recoveryObserved, true);
    assert.strictEqual(result.razorpayCallCount, 2); // 1 timeout + 1 retry
  });

  it("6. Result structure can represent post-create DB recovery (DB_POST_CREATE_RECOVERY)", async () => {
    const result = await runSafetyScenario("DB_POST_CREATE_RECOVERY");

    assert.strictEqual(result.scenarioId, "DB_POST_CREATE_RECOVERY");
    assert.strictEqual(result.status, "PASSED");
    assert.strictEqual(result.executionStatus, "SUCCESS");
    assert.strictEqual(result.recoveryObserved, true);
    assert.strictEqual(result.razorpayCallCount, 1); // 1 create + 0 on retry
    assert.strictEqual(result.razorpayOrderId, "order_rzp_db_post_create_01");
  });

  it("7. Result structure can represent unauthorized execution denial (UNAUTHORIZED_EXECUTION)", async () => {
    const result = await runSafetyScenario("UNAUTHORIZED_EXECUTION");

    assert.strictEqual(result.scenarioId, "UNAUTHORIZED_EXECUTION");
    assert.strictEqual(result.status, "PASSED");
    assert.strictEqual(result.executionStatus, "FAILED");
    assert.strictEqual(result.razorpayCallCount, 0);
  });

  it("8. Safety Lab result strictly does NOT expose secrets or credentials", async () => {
    const result = await runSafetyScenario("LEGITIMATE_PURCHASE");

    const resultString = JSON.stringify(result);
    assert.strictEqual(resultString.includes("rzp_test_key"), false);
    assert.strictEqual(resultString.includes("rzp_test_secret"), false);
    assert.strictEqual(resultString.includes("key_secret"), false);
  });
});
