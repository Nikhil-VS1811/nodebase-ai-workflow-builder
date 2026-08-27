export interface TransactionIntent {
  action: "catalog.read" | "order.create" | "payment.execute" | "refund.execute";
  amount: number;
  currency: string;
  merchantId: string;
  productTitle: string;
  productDescription: string;
  sourceInstruction?: string;
}

export interface PolicyConfig {
  agent: string;
  permissions: Record<string, boolean>;
  limits: {
    per_transaction: number;
    daily_cap: number;
  };
  approval: {
    auto_approve_below: number;
    require_human_above: number;
  };
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  status: "APPROVED" | "DENIED" | "ESCALATED";
  reason: string;
  riskScore: "LOW" | "MEDIUM" | "HIGH";
  untrustedInputDetected: boolean;
  timestamp: string;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /increase\s+transaction\s+amount/i,
  /bypass\s+policy/i,
  /system\s+override/i,
  /admin\s+mode/i,
];

export function evaluatePolicy(
  intent: TransactionIntent,
  policy: PolicyConfig,
  currentDailySpend: number = 0
): PolicyEvaluationResult {
  const timestamp = new Date().toISOString();

  // 1. Prompt Injection / Malicious Input Check
  const combinedText = `${intent.productTitle} ${intent.productDescription} ${intent.sourceInstruction || ""}`;
  const isMalicious = INJECTION_PATTERNS.some((pattern) => pattern.test(combinedText));

  if (isMalicious) {
    return {
      allowed: false,
      status: "DENIED",
      reason: "Security Alert: Untrusted instruction / prompt injection detected in payload.",
      riskScore: "HIGH",
      untrustedInputDetected: true,
      timestamp,
    };
  }

  // 2. Capability / Permission Check
  if (!policy.permissions[intent.action]) {
    return {
      allowed: false,
      status: "DENIED",
      reason: `Agent does not possess '${intent.action}' capability.`,
      riskScore: "HIGH",
      untrustedInputDetected: false,
      timestamp,
    };
  }

  // 3. Per-Transaction Limit Check
  if (intent.amount > policy.limits.per_transaction) {
    return {
      allowed: false,
      status: "DENIED",
      reason: `Amount ₹${intent.amount} exceeds per-transaction limit of ₹${policy.limits.per_transaction}.`,
      riskScore: "HIGH",
      untrustedInputDetected: false,
      timestamp,
    };
  }

  // 4. Daily Spend Cap Check
  if (currentDailySpend + intent.amount > policy.limits.daily_cap) {
    return {
      allowed: false,
      status: "DENIED",
      reason: `Transaction exceeds daily spending cap of ₹${policy.limits.daily_cap}.`,
      riskScore: "HIGH",
      untrustedInputDetected: false,
      timestamp,
    };
  }

  // 5. Human Escalation Threshold
  if (intent.amount > policy.approval.require_human_above) {
    return {
      allowed: true,
      status: "ESCALATED",
      reason: `Amount ₹${intent.amount} exceeds auto-approval threshold (₹${policy.approval.require_human_above}). Confirmation required.`,
      riskScore: "MEDIUM",
      untrustedInputDetected: false,
      timestamp,
    };
  }

  // 6. Safe & Approved
  return {
    allowed: true,
    status: "APPROVED",
    reason: "Transaction within bounds and policy limits.",
    riskScore: "LOW",
    untrustedInputDetected: false,
    timestamp,
  };
}
