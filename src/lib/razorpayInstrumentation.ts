/**
 * Phase 9.2: Razorpay Call Instrumentation
 *
 * Provides a server-side, test/development-only instrumentation mechanism
 * to observe and verify the exact number of times the Razorpay execution boundary
 * was reached for a transaction.
 *
 * This instrumentation is strictly disabled in production and cannot be
 * manipulated by clients, browser inputs, or LLM outputs.
 */

export interface RazorpayCallRecord {
  nodeId: string;
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
  timestamp: string;
}

export type RazorpayMockHandler = (params: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}) => Promise<{
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  notes: Record<string, string>;
  created_at: number;
}>;

let callCount = 0;
let callHistory: RazorpayCallRecord[] = [];
let customMockHandler: RazorpayMockHandler | null = null;

/**
 * Checks whether Razorpay instrumentation and mocking are permitted.
 * Strictly false in production.
 */
export function isInstrumentationEnabled(env = process.env.NODE_ENV): boolean {
  return env !== "production";
}

/**
 * Records an invocation of the Razorpay execution boundary.
 * Only increments when instrumentation is enabled (non-production).
 */
export function recordRazorpayCall(details: {
  nodeId: string;
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
}): void {
  if (!isInstrumentationEnabled()) {
    return;
  }

  callCount += 1;
  callHistory.push({
    ...details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Returns the number of times the Razorpay execution boundary was reached.
 */
export function getRazorpayCallCount(): number {
  return callCount;
}

/**
 * Returns an immutable copy of all recorded Razorpay call records.
 */
export function getRazorpayCallHistory(): RazorpayCallRecord[] {
  return [...callHistory];
}

/**
 * Resets the instrumentation counter and call history (for tests).
 */
export function resetRazorpayCallCount(): void {
  callCount = 0;
  callHistory = [];
}

/**
 * Configures an optional mock handler for Razorpay order creation in test mode.
 * Strictly blocked in production.
 */
export function setRazorpayMockHandler(handler: RazorpayMockHandler | null): boolean {
  if (!isInstrumentationEnabled()) {
    return false;
  }

  customMockHandler = handler;
  return true;
}

/**
 * Retrieves the currently active test mock handler, if allowed by environment.
 */
export function getRazorpayMockHandler(): RazorpayMockHandler | null {
  if (!isInstrumentationEnabled()) {
    return null;
  }

  return customMockHandler;
}
