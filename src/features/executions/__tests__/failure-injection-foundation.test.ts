import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  FAILURE_SCENARIOS,
  type FailureScenario,
  isFailureInjectionAllowed,
  isValidFailureScenario,
  setFailureInjectionScenario,
  getActiveFailureInjection,
  clearFailureInjection,
} from "@/lib/failureInjection";

describe("Phase 9.1: Failure Injection Foundation", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    clearFailureInjection();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    clearFailureInjection();
  });

  it("1. Accurately defines all 6 canonical failure injection scenarios", () => {
    const expectedScenarios: FailureScenario[] = [
      "RAZORPAY_TIMEOUT",
      "DB_FAILURE_AFTER_RAZORPAY_CREATE",
      "DUPLICATE_EXECUTION",
      "DUPLICATE_APPROVAL",
      "INTEGRITY_MISMATCH",
      "UNAUTHORIZED_EXECUTION",
    ];

    assert.strictEqual(FAILURE_SCENARIOS.length, 6);
    for (const scenario of expectedScenarios) {
      assert.ok(
        FAILURE_SCENARIOS.includes(scenario),
        `Scenario ${scenario} should be in FAILURE_SCENARIOS`,
      );
      assert.strictEqual(isValidFailureScenario(scenario), true);
    }
  });

  it("2. Rejects arbitrary or unknown scenario identifiers", () => {
    assert.strictEqual(isValidFailureScenario("UNKNOWN_RANDOM_SCENARIO"), false);
    assert.strictEqual(isValidFailureScenario(""), false);
    assert.strictEqual(isValidFailureScenario(null), false);
    assert.strictEqual(isValidFailureScenario(123), false);
    assert.strictEqual(isValidFailureScenario({ scenario: "RAZORPAY_TIMEOUT" }), false);

    const setResult = setFailureInjectionScenario("MALICIOUS_INJECTION" as any);
    assert.strictEqual(setResult, false);
    assert.strictEqual(getActiveFailureInjection(), null);
  });

  it("3. Disables failure injection in production environment", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    assert.strictEqual(isFailureInjectionAllowed(), false);

    // Attempting to configure failure injection in production must fail
    const setResult = setFailureInjectionScenario("RAZORPAY_TIMEOUT");
    assert.strictEqual(setResult, false);

    // Active failure injection must always return null in production
    assert.strictEqual(getActiveFailureInjection(), null);
  });

  it("4. Permits failure injection only in development / test environments", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    assert.strictEqual(isFailureInjectionAllowed(), true);

    const setResult = setFailureInjectionScenario("DB_FAILURE_AFTER_RAZORPAY_CREATE", {
      targetNodeId: "node_razorpay_123",
      metadata: { retryCount: 1 },
    });

    assert.strictEqual(setResult, true);
    const active = getActiveFailureInjection();
    assert.ok(active);
    assert.strictEqual(active?.scenario, "DB_FAILURE_AFTER_RAZORPAY_CREATE");
    assert.strictEqual(active?.enabled, true);
    assert.strictEqual(active?.targetNodeId, "node_razorpay_123");
    assert.deepStrictEqual(active?.metadata, { retryCount: 1 });
  });

  it("5. Normal execution remains unaffected when failure injection is cleared or disabled", () => {
    // Enable then clear
    setFailureInjectionScenario("INTEGRITY_MISMATCH");
    assert.ok(getActiveFailureInjection());

    clearFailureInjection();
    assert.strictEqual(getActiveFailureInjection(), null);

    // Setting null explicitly clears
    setFailureInjectionScenario("DUPLICATE_EXECUTION");
    assert.ok(getActiveFailureInjection());
    setFailureInjectionScenario(null);
    assert.strictEqual(getActiveFailureInjection(), null);
  });
});
