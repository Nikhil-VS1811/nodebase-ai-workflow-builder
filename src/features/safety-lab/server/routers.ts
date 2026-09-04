import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  SAFETY_LAB_SCENARIOS,
  SCENARIO_DEFINITIONS,
  type SafetyLabScenarioId,
  type SafetyLabResult,
  runSafetyScenario,
} from "@/lib/safetyLabHarness";

export const safetyLabRouter = createTRPCRouter({
  getScenarios: protectedProcedure.query(() => {
    return SAFETY_LAB_SCENARIOS.map((id) => SCENARIO_DEFINITIONS[id]);
  }),

  runScenario: protectedProcedure
    .input(z.object({ scenarioId: z.enum(SAFETY_LAB_SCENARIOS) }))
    .mutation(async ({ ctx, input }) => {
      const result = await runSafetyScenario(input.scenarioId, {
        userId: ctx.auth.user.id,
      });
      return {
        definition: SCENARIO_DEFINITIONS[input.scenarioId],
        result,
      };
    }),

  runAll: protectedProcedure.mutation(async ({ ctx }) => {
    const results: Array<{
      definition: (typeof SCENARIO_DEFINITIONS)[SafetyLabScenarioId];
      result: SafetyLabResult;
    }> = [];

    for (const id of SAFETY_LAB_SCENARIOS) {
      const res = await runSafetyScenario(id, {
        userId: ctx.auth.user.id,
      });
      results.push({
        definition: SCENARIO_DEFINITIONS[id],
        result: res,
      });
    }

    const scenariosTested = results.length;
    const scenariosPassed = results.filter((r) => r.result.status === "PASSED").length;
    const scenariosFailed = results.filter((r) => r.result.status === "FAILED").length;
    const totalRazorpayCalls = results.reduce((sum, r) => sum + r.result.razorpayCallCount, 0);
    const duplicateOrdersPrevented = results.filter(
      (r) =>
        r.result.scenarioId === "REPLAY_DUPLICATE_DEFENSE" ||
        r.result.scenarioId === "DB_POST_CREATE_RECOVERY",
    ).length;
    const recoveryScenariosPassed = results.filter(
      (r) =>
        (r.result.scenarioId === "RAZORPAY_TIMEOUT_RECOVERY" ||
          r.result.scenarioId === "DB_POST_CREATE_RECOVERY" ||
          r.result.scenarioId === "REPLAY_DUPLICATE_DEFENSE") &&
        r.result.status === "PASSED",
    ).length;

    return {
      results,
      metrics: {
        scenariosTested,
        scenariosPassed,
        scenariosFailed,
        totalRazorpayCalls,
        duplicateOrdersPrevented,
        recoveryScenariosPassed,
      },
    };
  }),
});
