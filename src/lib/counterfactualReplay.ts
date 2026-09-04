import baseAgentPolicy from "@/config/agentPolicy.json";
import {
  evaluatePolicy,
  type TransactionIntent,
  type PolicyConfig,
  type PolicyDecision,
  type RiskLevel,
} from "@/lib/policyEngine";
import { getAgentReadableProduct } from "@/lib/commerceCatalog";

/**
 * Phase 15.2: Counterfactual Policy Replay Engine
 *
 * Provides a pure, deterministic, read-only simulation capability to answer:
 * "What would the Policy Gate decision have been under a different policy?"
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. SIMULATION ONLY: Never authorizes, executes, creates PaymentOrders, or calls Razorpay.
 * 2. ZERO ACTIVE MUTATION: Never modifies the active policy configuration or execution record.
 * 3. TRUSTED RE-VERIFICATION: Resolves product and pricing strictly against the authoritative catalog.
 * 4. FAIL-CLOSED: Rejects malformed policy configurations safely.
 */

export type CounterfactualScenarioKey =
  | "ACTIVE_POLICY"
  | "STRICT_THRESHOLD_1000"
  | "LENIENT_THRESHOLD_5000"
  | "STRICT_PER_TX_3000"
  | "ZERO_TOLERANCE_DAILY_CAP_1000";

export interface CounterfactualScenarioDefinition {
  readonly key: CounterfactualScenarioKey;
  readonly name: string;
  readonly description: string;
  readonly deltaSummary: string;
  readonly policy: Readonly<PolicyConfig>;
}

export const PREDEFINED_SCENARIOS: readonly CounterfactualScenarioDefinition[] = Object.freeze([
  {
    key: "ACTIVE_POLICY",
    name: "Current Active Policy",
    description: "Standard production policy with ₹2,000 auto-approval threshold and ₹5,000 transaction limit.",
    deltaSummary: "Baseline: Auto-approve below ₹2,000, Max ₹5,000 / tx",
    policy: Object.freeze({
      agent: "nodebase-commerce-agent",
      version: "1.0.0",
      permissions: Object.freeze({
        "catalog.read": true,
        "order.create": true,
        "payment.execute": true,
        "refund.execute": false,
      }),
      limits: Object.freeze({
        per_transaction: 5000,
        daily_cap: 15000,
      }),
      approval: Object.freeze({
        auto_approve_below: 2000,
        require_human_above: 2000,
      }),
    }),
  },
  {
    key: "STRICT_THRESHOLD_1000",
    name: "Strict Approval Threshold (₹1,000)",
    description: "Lowers auto-approval threshold to ₹1,000. Moderate-value items require human sign-off.",
    deltaSummary: "Strict: Human approval required above ₹1,000 (down from ₹2,000)",
    policy: Object.freeze({
      agent: "nodebase-commerce-agent",
      version: "1.0.0-strict-1000",
      permissions: Object.freeze({
        "catalog.read": true,
        "order.create": true,
        "payment.execute": true,
        "refund.execute": false,
      }),
      limits: Object.freeze({
        per_transaction: 5000,
        daily_cap: 15000,
      }),
      approval: Object.freeze({
        auto_approve_below: 1000,
        require_human_above: 1000,
      }),
    }),
  },
  {
    key: "LENIENT_THRESHOLD_5000",
    name: "Permissive Threshold (₹5,000)",
    description: "Increases auto-approval limit to ₹5,000. Automatically approves higher-tier items without human intervention.",
    deltaSummary: "Permissive: Auto-approves purchases up to ₹5,000 (up from ₹2,000)",
    policy: Object.freeze({
      agent: "nodebase-commerce-agent",
      version: "1.0.0-lenient-5000",
      permissions: Object.freeze({
        "catalog.read": true,
        "order.create": true,
        "payment.execute": true,
        "refund.execute": false,
      }),
      limits: Object.freeze({
        per_transaction: 5000,
        daily_cap: 15000,
      }),
      approval: Object.freeze({
        auto_approve_below: 5000,
        require_human_above: 5000,
      }),
    }),
  },
  {
    key: "STRICT_PER_TX_3000",
    name: "Strict Per-Transaction Limit (₹3,000)",
    description: "Hard cap of ₹3,000 per transaction. Purchases exceeding ₹3,000 are strictly DENIED.",
    deltaSummary: "Hard Cap: Denies any transaction exceeding ₹3,000",
    policy: Object.freeze({
      agent: "nodebase-commerce-agent",
      version: "1.0.0-strict-tx-3000",
      permissions: Object.freeze({
        "catalog.read": true,
        "order.create": true,
        "payment.execute": true,
        "refund.execute": false,
      }),
      limits: Object.freeze({
        per_transaction: 3000,
        daily_cap: 15000,
      }),
      approval: Object.freeze({
        auto_approve_below: 2000,
        require_human_above: 2000,
      }),
    }),
  },
  {
    key: "ZERO_TOLERANCE_DAILY_CAP_1000",
    name: "Zero-Tolerance Daily Spend Cap (₹1,000)",
    description: "Severe daily cap of ₹1,000. Denies transactions exceeding ₹1,000 cumulative spend.",
    deltaSummary: "Budget Constrained: Daily spending cap restricted to ₹1,000",
    policy: Object.freeze({
      agent: "nodebase-commerce-agent",
      version: "1.0.0-daily-cap-1000",
      permissions: Object.freeze({
        "catalog.read": true,
        "order.create": true,
        "payment.execute": true,
        "refund.execute": false,
      }),
      limits: Object.freeze({
        per_transaction: 5000,
        daily_cap: 1000,
      }),
      approval: Object.freeze({
        auto_approve_below: 2000,
        require_human_above: 2000,
      }),
    }),
  },
]);

export interface CounterfactualReplayResult {
  readonly isSimulation: true;
  readonly mode: "COUNTERFACTUAL_SIMULATION";
  readonly timestamp: string;
  readonly scenarioKey: CounterfactualScenarioKey | "CUSTOM";
  readonly scenarioName: string;
  readonly originalDecision: PolicyDecision | null;
  readonly counterfactualDecision: PolicyDecision;
  readonly counterfactualAllowed: boolean;
  readonly counterfactualRiskLevel: RiskLevel;
  readonly counterfactualReasons: readonly string[];
  readonly wouldRequireHumanApproval: boolean;
  readonly whatChanged: string;
  readonly appliedPolicyConfig: Readonly<PolicyConfig>;
  readonly simulatedTransaction: {
    readonly productId?: string;
    readonly productTitle: string;
    readonly amount: number;
    readonly currency: string;
    readonly merchantId: string;
  };
  readonly disclaimer: "Simulation only — does not authorize, approve, or execute payments.";
}

export interface ReplayCounterfactualParams {
  transactionIntent: Partial<TransactionIntent>;
  scenarioKey?: CounterfactualScenarioKey;
  customPolicy?: unknown;
  currentDailySpend?: number;
  originalDecision?: PolicyDecision | null;
}

/**
 * Validates a candidate policy configuration for counterfactual simulation.
 */
export function validateCounterfactualPolicy(input: unknown): {
  valid: boolean;
  errors: string[];
  policy: PolicyConfig | null;
} {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Policy must be a non-null object"],
      policy: null,
    };
  }

  const p = input as Partial<PolicyConfig>;

  if (!p.permissions || typeof p.permissions !== "object") {
    errors.push("Missing permissions map in policy configuration");
  }

  if (
    !p.limits ||
    typeof p.limits.per_transaction !== "number" ||
    p.limits.per_transaction <= 0 ||
    typeof p.limits.daily_cap !== "number" ||
    p.limits.daily_cap <= 0
  ) {
    errors.push("Invalid limits: per_transaction and daily_cap must be positive numbers");
  }

  if (
    !p.approval ||
    typeof p.approval.auto_approve_below !== "number" ||
    p.approval.auto_approve_below < 0 ||
    typeof p.approval.require_human_above !== "number" ||
    p.approval.require_human_above < 0
  ) {
    errors.push("Invalid approval thresholds: auto_approve_below and require_human_above must be numbers >= 0");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      policy: null,
    };
  }

  return {
    valid: true,
    errors: [],
    policy: p as PolicyConfig,
  };
}

/**
 * Executes a pure, server-side counterfactual policy simulation on a trusted transaction.
 */
export function replayCounterfactualPolicy(
  params: ReplayCounterfactualParams,
): Readonly<CounterfactualReplayResult> {
  const {
    transactionIntent,
    scenarioKey = "ACTIVE_POLICY",
    customPolicy,
    currentDailySpend = 0,
    originalDecision = null,
  } = params;

  // 1. Resolve Effective Counterfactual Policy
  let effectivePolicy: PolicyConfig;
  let scenarioName = "Custom Counterfactual Scenario";

  if (customPolicy) {
    const validation = validateCounterfactualPolicy(customPolicy);
    if (!validation.valid || !validation.policy) {
      // Fail closed to strict baseline
      effectivePolicy = PREDEFINED_SCENARIOS[0].policy;
      scenarioName = `Invalid Custom Policy (${validation.errors.join("; ")}) — Defaulted to Baseline`;
    } else {
      effectivePolicy = validation.policy;
    }
  } else {
    const predefined = PREDEFINED_SCENARIOS.find((s) => s.key === scenarioKey) || PREDEFINED_SCENARIOS[0];
    effectivePolicy = predefined.policy;
    scenarioName = predefined.name;
  }

  // 2. Build Trusted Transaction Intent Snapshot
  let authoritativeAmount = transactionIntent.amount ?? 0;
  let authoritativeMerchant = transactionIntent.merchantId || "merchant_nodebase_01";
  let authoritativeCurrency = transactionIntent.currency || "INR";
  let productTitle = transactionIntent.productTitle || "Commerce Product";

  if (transactionIntent.productId) {
    const catalogProduct = getAgentReadableProduct(transactionIntent.productId);
    if (catalogProduct) {
      const quantity = transactionIntent.quantity || 1;
      authoritativeAmount = catalogProduct.price * quantity;
      authoritativeMerchant = catalogProduct.merchantId;
      authoritativeCurrency = catalogProduct.currency;
      productTitle = catalogProduct.name;
    }
  }

  const trustedIntent: TransactionIntent = {
    action: transactionIntent.action || "payment.execute",
    amount: authoritativeAmount,
    currency: authoritativeCurrency,
    merchantId: authoritativeMerchant,
    productTitle,
    productId: transactionIntent.productId,
    quantity: transactionIntent.quantity || 1,
    sourceInstruction: transactionIntent.sourceInstruction,
  };

  // 3. Evaluate Policy Gate Logic (Simulation)
  const evaluation = evaluatePolicy(trustedIntent, effectivePolicy, currentDailySpend);

  const counterfactualDecision: PolicyDecision = evaluation.decision;
  const wouldRequireHumanApproval = counterfactualDecision === "ESCALATED";

  // 4. Deterministic "What Changed" Rationale Synthesis
  let whatChanged = "";
  if (!originalDecision) {
    whatChanged = `Simulated decision under ${scenarioName}: ${counterfactualDecision}. Thresholds: Auto-approve < ₹${effectivePolicy.approval.auto_approve_below}, Max Limit ₹${effectivePolicy.limits.per_transaction}.`;
  } else if (originalDecision === counterfactualDecision) {
    whatChanged = `No outcome change. Decision remains ${counterfactualDecision} under ${scenarioName}.`;
  } else if (originalDecision === "APPROVED" && counterfactualDecision === "ESCALATED") {
    whatChanged = `Escalation Triggered: Transaction of ₹${trustedIntent.amount.toLocaleString("en-IN")} was previously APPROVED, but now requires human approval because it exceeds the new ₹${effectivePolicy.approval.require_human_above.toLocaleString("en-IN")} threshold.`;
  } else if (originalDecision === "ESCALATED" && counterfactualDecision === "APPROVED") {
    whatChanged = `Auto-Approval Granted: Transaction of ₹${trustedIntent.amount.toLocaleString("en-IN")} was previously ESCALATED, but is now APPROVED automatically because the threshold was raised to ₹${effectivePolicy.approval.require_human_above.toLocaleString("en-IN")}.`;
  } else if (counterfactualDecision === "DENIED") {
    whatChanged = `Denial Triggered: Transaction was previously ${originalDecision}, but is now DENIED under ${scenarioName} (${evaluation.reason}).`;
  } else {
    whatChanged = `Decision shifted from ${originalDecision} to ${counterfactualDecision} under ${scenarioName}.`;
  }

  return Object.freeze({
    isSimulation: true,
    mode: "COUNTERFACTUAL_SIMULATION",
    timestamp: new Date().toISOString(),
    scenarioKey: customPolicy ? "CUSTOM" : scenarioKey,
    scenarioName,
    originalDecision,
    counterfactualDecision,
    counterfactualAllowed: evaluation.allowed,
    counterfactualRiskLevel: evaluation.riskLevel,
    counterfactualReasons: Object.freeze([...evaluation.reasons]),
    wouldRequireHumanApproval,
    whatChanged,
    appliedPolicyConfig: Object.freeze(effectivePolicy),
    simulatedTransaction: Object.freeze({
      productId: trustedIntent.productId,
      productTitle: trustedIntent.productTitle,
      amount: trustedIntent.amount,
      currency: trustedIntent.currency,
      merchantId: trustedIntent.merchantId,
    }),
    disclaimer: "Simulation only — does not authorize, approve, or execute payments.",
  });
}
