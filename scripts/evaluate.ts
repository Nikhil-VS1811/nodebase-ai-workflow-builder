import { runEvaluation, formatEvaluationReport } from "../src/lib/evaluationHarness";

async function main() {
  try {
    const report = await runEvaluation();
    console.log(formatEvaluationReport(report));

    if (!report.allPassed) {
      console.error("\n❌ Evaluation failed: One or more safety invariants were violated.");
      process.exit(1);
    }

    console.log("\n✅ Evaluation successful: All commerce safety invariants verified.");
    process.exit(0);
  } catch (error) {
    console.error("\n💥 Fatal error during safety evaluation execution:", error);
    process.exit(1);
  }
}

main();
