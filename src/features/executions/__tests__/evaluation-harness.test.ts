import { describe, it } from "node:test";
import assert from "node:assert";
import {
  aggregateEvaluationMetrics,
  runEvaluation,
  formatEvaluationReport,
  COMMERCE_EVALUATION_DATASET,
  evaluateCommerceDatasetCase,
  runDatasetEvaluation,
  EVALUATION_LIMITATIONS,
  type CommerceEvaluationCase,
} from "@/lib/evaluationHarness";

describe("Phase 11.4: Structured AI Commerce Evaluation Report", () => {
  it("1. Report contains all required top-level structured sections", async () => {
    const report = await runEvaluation();

    // 1. Metadata
    assert.ok(report.metadata);
    assert.ok(report.metadata.timestamp);
    assert.strictEqual(report.metadata.evaluationVersion, "1.0.0");
    assert.strictEqual(report.metadata.totalScenarios, 10);
    assert.strictEqual(report.metadata.totalDatasetCases, 10);

    // 2. Safety Lab
    assert.ok(report.safetyLab);
    assert.strictEqual(report.safetyLab.scenariosTested, 10);
    assert.strictEqual(report.safetyLab.passed, 10);
    assert.strictEqual(report.safetyLab.failed, 0);
    assert.strictEqual(report.safetyLab.passRate, 100);
    assert.strictEqual(report.safetyLab.items.length, 10);

    // 3. Commerce Correctness
    assert.ok(report.commerceCorrectness);
    assert.strictEqual(report.commerceCorrectness.intentProductSelectionAccuracy, 100);
    assert.strictEqual(report.commerceCorrectness.catalogAuthorityCorrectness, 100);
    assert.strictEqual(report.commerceCorrectness.policyDecisionAccuracy, 100);
    assert.strictEqual(report.commerceCorrectness.falseApprovals, 0);
    assert.strictEqual(report.commerceCorrectness.falseDenials, 0);

    // 4. Safety Invariants
    assert.ok(report.safetyInvariants);
    assert.strictEqual(report.safetyInvariants.unauthorizedExecutionRate, 0);
    assert.strictEqual(report.safetyInvariants.duplicateOrderRate, 0);
    assert.strictEqual(report.safetyInvariants.duplicateOrdersPrevented, 2);
    assert.strictEqual(report.safetyInvariants.integrityDetectionRate, 100);
    assert.strictEqual(report.safetyInvariants.recoverySuccessRate, 100);
    assert.strictEqual(report.safetyInvariants.razorpayProviderCalls, 8);

    // 5. Dataset
    assert.ok(report.dataset);
    assert.strictEqual(report.dataset.totalCases, 10);
    assert.strictEqual(report.dataset.legitimateCases, 4);
    assert.strictEqual(report.dataset.legitimatePassed, 4);
    assert.strictEqual(report.dataset.adversarialCases, 6);
    assert.strictEqual(report.dataset.adversarialPassed, 6);
    assert.strictEqual(report.dataset.datasetPassRate, 100);

    // 6. Recovery
    assert.ok(report.recovery);
    assert.strictEqual(report.recovery.timeoutRecoveryObserved, true);
    assert.strictEqual(report.recovery.dbPostCreateRecoveryObserved, true);
    assert.strictEqual(report.recovery.replayDeduplicationObserved, true);
    assert.strictEqual(report.recovery.duplicateProviderOrdersPrevented, true);

    // 7. Limitations
    assert.ok(report.limitations);
    assert.strictEqual(report.limitations.length, EVALUATION_LIMITATIONS.length);
    assert.ok(report.limitations.some((l) => l.includes("Deterministic project regression suite")));
    assert.ok(report.limitations.some((l) => l.includes("Small hand-authored dataset")));
    assert.ok(report.limitations.some((l) => l.includes("Not proof of production safety")));
    assert.ok(report.limitations.some((l) => l.includes("Not proof of general AI reliability")));

    // 8. Overall Status
    assert.strictEqual(report.allPassed, true);
  });

  it("2. Report numbers match the underlying real execution results without fabrication", async () => {
    const report = await runEvaluation();

    const actualItemCount = report.safetyLab.items.length;
    const actualPassedCount = report.safetyLab.items.filter((i) => i.result.status === "PASSED").length;
    const actualCallCount = report.safetyLab.items.reduce((s, i) => s + (i.result.razorpayCallCount || 0), 0);

    assert.strictEqual(report.safetyLab.scenariosTested, actualItemCount);
    assert.strictEqual(report.safetyLab.passed, actualPassedCount);
    assert.strictEqual(report.safetyInvariants.razorpayProviderCalls, actualCallCount);
  });

  it("3. Formats human-readable console summary directly from the report object", async () => {
    const report = await runEvaluation();
    const formatted = formatEvaluationReport(report);

    assert.ok(formatted.includes("1. SAFETY LAB SCENARIO BREAKDOWN:"));
    assert.ok(formatted.includes("2. DETERMINISTIC COMMERCE DATASET EVALUATION:"));
    assert.ok(formatted.includes("3. AI COMMERCE CORRECTNESS METRICS:"));
    assert.ok(formatted.includes("4. SAFETY & RESILIENCE INVARIANT RATES:"));
    assert.ok(formatted.includes("5. FAILURE INJECTION & RECOVERY EVIDENCE:"));
    assert.ok(formatted.includes("6. EXPLICIT LIMITATIONS & DISCLAIMERS:"));
    assert.ok(formatted.includes("Evaluation Version: v1.0.0"));
  });

  it("4. A deliberately altered underlying result causes the report assertion to fail", () => {
    const corruptedItem = {
      scenarioId: "PROMPT_INJECTION_DEFENSE" as const,
      result: {
        scenarioId: "PROMPT_INJECTION_DEFENSE" as const,
        status: "FAILED" as const,
        executionStatus: "SUCCESS" as const,
        policyDecision: "APPROVED" as const,
        riskLevel: "LOW" as const,
        razorpayCallCount: 1,
        recoveryObserved: false,
      },
    };

    const metrics = aggregateEvaluationMetrics([corruptedItem]);
    assert.strictEqual(metrics.falseApprovals, 1);
    assert.strictEqual(metrics.unauthorizedExecutionRate, 100);
  });
});
