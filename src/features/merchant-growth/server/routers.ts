import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  getDefaultMerchantGrowthPolicy,
  decideMerchantGrowthStrategy,
  getMerchantGrowthKillSwitchState,
  setMerchantGrowthKillSwitch,
  isMerchantGrowthEnabled,
} from "@/lib/merchantGrowthPolicy";
import {
  recommendProducts,
  getAgentReadableCatalog,
} from "@/lib/commerceCatalog";

export const merchantGrowthRouter = createTRPCRouter({
  /**
   * Returns the currently active merchant growth policy configuration, strategy decision,
   * and kill switch status.
   */
  getActivePolicy: protectedProcedure.query(() => {
    const policy = getDefaultMerchantGrowthPolicy();
    const strategyDecision = decideMerchantGrowthStrategy({ policy });
    const catalog = getAgentReadableCatalog();
    const killSwitch = getMerchantGrowthKillSwitchState();

    return {
      policy,
      strategyDecision,
      killSwitch,
      isGrowthEnabled: isMerchantGrowthEnabled(),
      catalogSummary: {
        totalProducts: catalog.products.length,
        catalogVersion: catalog.version,
        categories: Array.from(new Set(catalog.products.map((p) => p.category))),
      },
      advisoryNotice: "Advisory only — does not authorize or execute payments.",
    };
  }),

  /**
   * Updates the merchant-controlled Kill Switch state.
   */
  setKillSwitch: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        reason: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      const nextState = setMerchantGrowthKillSwitch(input.enabled, input.reason);
      return {
        success: true,
        killSwitch: nextState,
        message: nextState.isEnabled
          ? "Merchant Growth engine ENABLED"
          : "Merchant Growth engine DISABLED by kill switch",
      };
    }),

  /**
   * Generates deterministic product recommendations and structured explanations
   * for a query using the active merchant growth policy and kill switch state.
   */
  getRecommendationPreview: protectedProcedure
    .input(
      z.object({
        query: z.string().default("wireless mouse"),
        limit: z.number().min(1).max(10).default(5),
      }),
    )
    .query(({ input }) => {
      const result = recommendProducts(input.query, { limit: input.limit });

      return {
        ...result,
        isGrowthEnabled: isMerchantGrowthEnabled(),
        advisoryNotice: "Advisory only — does not authorize or execute payments.",
      };
    }),
});
