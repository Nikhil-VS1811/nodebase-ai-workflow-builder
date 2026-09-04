import defaultPolicyData from "@/config/merchantGrowthPolicy.json";

/**
 * Phase 13.8, 13.9 & 14.2: Merchant Growth Policy Foundation, Strategy Decisions & Kill Switch
 *
 * Represents merchant-defined constraints, commercial objectives, strategy decisions,
 * and emergency kill-switch controls that influence product recommendation ranking
 * and execution boundaries without creating any authorization shortcuts.
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. ADVISORY ONLY: Influences recommendation ranking ONLY. Cannot authorize or execute payments.
 * 2. KILL SWITCH SAFETY: When Kill Switch is OFF, all recommendation/growth actions fail closed.
 * 3. ZERO SHORTCUTS: Policy Gate authorization remains the sole authority for financial execution.
 * 4. RELEVANCE DOMINANCE: An irrelevant product can NEVER be recommended solely because of commercial weight.
 * 5. DETERMINISTIC & FAIL-CLOSED: Malformed policies or disabled states reject safely.
 */

export type MerchantObjective =
  | "BALANCED_COMMERCIAL_VALUE"
  | "MAXIMIZE_COMMERCIAL_VALUE"
  | "RELEVANCE_ONLY"
  | "INVENTORY_CLEARANCE";

export type GrowthStrategy =
  | "RELEVANCE_FIRST"
  | "BALANCED_VALUE"
  | "COMMERCIAL_VALUE"
  | "INVENTORY_AWARE";

export type KillSwitchStatus = "ENABLED" | "DISABLED";

export interface KillSwitchState {
  readonly status: KillSwitchStatus;
  readonly isEnabled: boolean;
  readonly disabledAt?: string;
  readonly disabledReason?: string;
  readonly lastModified: string;
}

export interface MerchantGrowthPolicy {
  readonly version: string;
  readonly policyId: string;
  readonly objective: MerchantObjective;
  readonly minRelevanceScore: number;
  readonly commercialWeight: number;
  readonly maxCommercialBonus: number;
  readonly availabilityWeight: number;
  readonly allowedCategories?: readonly string[];
  readonly excludedCategories?: readonly string[];
}

export interface PolicyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly policy: Readonly<MerchantGrowthPolicy> | null;
}

export interface GrowthStrategyDecision {
  readonly strategy: GrowthStrategy;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly objective: MerchantObjective;
  readonly rationale: string;
  readonly minimumRelevanceScore: number;
  readonly commercialWeight: number;
  readonly availabilityWeight: number;
  readonly appliedPolicy: Readonly<MerchantGrowthPolicy>;
}

const SUPPORTED_OBJECTIVES: readonly MerchantObjective[] = Object.freeze([
  "BALANCED_COMMERCIAL_VALUE",
  "MAXIMIZE_COMMERCIAL_VALUE",
  "RELEVANCE_ONLY",
  "INVENTORY_CLEARANCE",
]);

// Authoritative in-process server-side Kill Switch state (default: ENABLED)
let serverKillSwitchState: KillSwitchState = {
  status: "ENABLED",
  isEnabled: true,
  lastModified: new Date().toISOString(),
};

/**
 * Returns the current authoritative server-side kill switch state.
 */
export function getMerchantGrowthKillSwitchState(): Readonly<KillSwitchState> {
  return Object.freeze({ ...serverKillSwitchState });
}

/**
 * Checks if the Merchant Growth engine is currently enabled.
 */
export function isMerchantGrowthEnabled(): boolean {
  return serverKillSwitchState.isEnabled;
}

/**
 * Sets the merchant-controlled Kill Switch state on the server.
 */
export function setMerchantGrowthKillSwitch(
  statusOrBool: KillSwitchStatus | boolean,
  reason?: string,
): Readonly<KillSwitchState> {
  const isEnabled = typeof statusOrBool === "boolean" ? statusOrBool : statusOrBool === "ENABLED";
  const status: KillSwitchStatus = isEnabled ? "ENABLED" : "DISABLED";
  const now = new Date().toISOString();

  serverKillSwitchState = {
    status,
    isEnabled,
    disabledAt: isEnabled ? undefined : now,
    disabledReason: isEnabled ? undefined : (reason || "Disabled via Merchant Control Center"),
    lastModified: now,
  };

  return Object.freeze({ ...serverKillSwitchState });
}

/**
 * Resets the Kill Switch to default ENABLED state (for tests and recovery).
 */
export function resetMerchantGrowthKillSwitch(): Readonly<KillSwitchState> {
  return setMerchantGrowthKillSwitch("ENABLED");
}

/**
 * Validates a merchant growth policy against strict safety and integrity rules.
 */
export function validateMerchantGrowthPolicy(
  input: unknown,
): Readonly<PolicyValidationResult> {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(["Merchant growth policy must be a non-null object"]),
      policy: null,
    });
  }

  const p = input as Partial<MerchantGrowthPolicy>;

  if (p.version !== "1.0.0") {
    errors.push(`Unsupported policy version "${p.version}". Supported version is "1.0.0".`);
  }

  if (!p.policyId || typeof p.policyId !== "string" || !p.policyId.trim()) {
    errors.push("Missing or invalid policyId");
  }

  if (!p.objective || !SUPPORTED_OBJECTIVES.includes(p.objective as MerchantObjective)) {
    errors.push(
      `Unsupported objective "${p.objective}". Supported objectives: ${SUPPORTED_OBJECTIVES.join(", ")}`,
    );
  }

  if (typeof p.minRelevanceScore !== "number" || p.minRelevanceScore < 20 || p.minRelevanceScore > 1000) {
    errors.push("minRelevanceScore must be a number between 20 and 1000 to preserve relevance dominance");
  }

  if (typeof p.commercialWeight !== "number" || p.commercialWeight < 0 || p.commercialWeight > 2.0) {
    errors.push("commercialWeight must be a number between 0.0 and 2.0");
  }

  if (typeof p.maxCommercialBonus !== "number" || p.maxCommercialBonus < 0 || p.maxCommercialBonus > 100) {
    errors.push("maxCommercialBonus must be a number between 0 and 100");
  }

  if (typeof p.availabilityWeight !== "number" || p.availabilityWeight < 0 || p.availabilityWeight > 2.0) {
    errors.push("availabilityWeight must be a number between 0.0 and 2.0");
  }

  if (errors.length > 0) {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(errors),
      policy: null,
    });
  }

  const validPolicy: MerchantGrowthPolicy = Object.freeze({
    version: "1.0.0",
    policyId: p.policyId!,
    objective: p.objective as MerchantObjective,
    minRelevanceScore: p.minRelevanceScore!,
    commercialWeight: p.commercialWeight!,
    maxCommercialBonus: p.maxCommercialBonus!,
    availabilityWeight: p.availabilityWeight!,
    allowedCategories: p.allowedCategories ? Object.freeze([...p.allowedCategories]) : undefined,
    excludedCategories: p.excludedCategories ? Object.freeze([...p.excludedCategories]) : undefined,
  });

  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    policy: validPolicy,
  });
}

/**
 * Returns the default trusted merchant growth policy from config.
 */
export function getDefaultMerchantGrowthPolicy(): Readonly<MerchantGrowthPolicy> {
  const validation = validateMerchantGrowthPolicy(defaultPolicyData);
  if (!validation.valid || !validation.policy) {
    throw new Error(`Invalid default merchant growth policy config: ${validation.errors.join(", ")}`);
  }
  return validation.policy;
}

/**
 * Resolves the effective merchant growth policy, falling back to default if not specified,
 * and failing closed if an invalid policy is supplied.
 */
export function getEffectiveMerchantGrowthPolicy(
  customPolicy?: unknown,
): Readonly<MerchantGrowthPolicy> {
  if (customPolicy === undefined || customPolicy === null) {
    return getDefaultMerchantGrowthPolicy();
  }

  const validation = validateMerchantGrowthPolicy(customPolicy);
  if (!validation.valid || !validation.policy) {
    // Fail-closed to strict default with deterministic fallback
    return getDefaultMerchantGrowthPolicy();
  }

  return validation.policy;
}

/**
 * Deterministically decides which recommendation strategy to apply based on
 * the active merchant growth policy.
 */
export function decideMerchantGrowthStrategy(
  params?: { query?: string; policy?: unknown },
): Readonly<GrowthStrategyDecision> {
  const policy = getEffectiveMerchantGrowthPolicy(params?.policy);

  let strategy: GrowthStrategy = "BALANCED_VALUE";
  let rationale = "Use balanced commercial-value ranking while preserving minimum relevance.";

  switch (policy.objective) {
    case "RELEVANCE_ONLY":
      strategy = "RELEVANCE_FIRST";
      rationale = "Pure relevance strategy prioritizing query match precision and suppressing commercial weighting.";
      break;
    case "BALANCED_COMMERCIAL_VALUE":
      strategy = "BALANCED_VALUE";
      rationale = "Use balanced commercial-value ranking while preserving minimum relevance.";
      break;
    case "MAXIMIZE_COMMERCIAL_VALUE":
      strategy = "COMMERCIAL_VALUE";
      rationale = "Commercial-value strategy boosting higher basket-value candidates among relevant items.";
      break;
    case "INVENTORY_CLEARANCE":
      strategy = "INVENTORY_AWARE";
      rationale = "Inventory-aware strategy prioritizing stock availability and clearance targets among relevant items.";
      break;
  }

  return Object.freeze({
    strategy,
    policyId: policy.policyId,
    policyVersion: policy.version,
    objective: policy.objective,
    rationale,
    minimumRelevanceScore: policy.minRelevanceScore,
    commercialWeight: policy.commercialWeight,
    availabilityWeight: policy.availabilityWeight,
    appliedPolicy: policy,
  });
}
