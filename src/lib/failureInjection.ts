/**
 * Phase 9.1: Failure Injection Foundation
 *
 * Provides a server-side only, strongly-typed failure injection definition
 * strictly gated for development and test environments.
 *
 * Failure injection is permanently disabled in production and cannot be
 * triggered by user input, LLM output, or client-provided parameters.
 */

export const FAILURE_SCENARIOS = [
  "RAZORPAY_TIMEOUT",
  "DB_FAILURE_AFTER_RAZORPAY_CREATE",
  "DUPLICATE_EXECUTION",
  "DUPLICATE_APPROVAL",
  "INTEGRITY_MISMATCH",
  "UNAUTHORIZED_EXECUTION",
] as const;

export type FailureScenario = (typeof FAILURE_SCENARIOS)[number];

export interface FailureInjectionConfig {
  scenario: FailureScenario;
  enabled: boolean;
  targetNodeId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Checks whether failure injection is permitted in the current runtime environment.
 * Strictly disallows failure injection in production.
 */
export function isFailureInjectionAllowed(env = process.env.NODE_ENV): boolean {
  return env !== "production";
}

/**
 * Type guard verifying if an unknown value is a recognized FailureScenario.
 */
export function isValidFailureScenario(scenario: unknown): scenario is FailureScenario {
  return typeof scenario === "string" && FAILURE_SCENARIOS.includes(scenario as FailureScenario);
}

// In-memory test harness configuration (isolated to server-side test/dev runtime)
let activeConfig: FailureInjectionConfig | null = null;

/**
 * Sets the active failure injection scenario for test or dev simulation.
 * Returns true if set successfully, false if blocked by production environment or invalid scenario.
 */
export function setFailureInjectionScenario(
  scenario: FailureScenario | null,
  options?: {
    targetNodeId?: string;
    metadata?: Record<string, unknown>;
  },
): boolean {
  if (!isFailureInjectionAllowed()) {
    return false;
  }

  if (scenario === null) {
    activeConfig = null;
    return true;
  }

  if (!isValidFailureScenario(scenario)) {
    return false;
  }

  activeConfig = {
    scenario,
    enabled: true,
    targetNodeId: options?.targetNodeId,
    metadata: options?.metadata,
  };

  return true;
}

/**
 * Retrieves the currently active failure injection configuration, if allowed by environment.
 */
export function getActiveFailureInjection(): FailureInjectionConfig | null {
  if (!isFailureInjectionAllowed()) {
    return null;
  }

  return activeConfig;
}

/**
 * Clears any active failure injection scenario.
 */
export function clearFailureInjection(): void {
  activeConfig = null;
}
