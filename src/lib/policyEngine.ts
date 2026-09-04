export interface TransactionIntent {
  action: "catalog.read" | "order.create" | "payment.execute" | "refund.execute";
  amount: number;
  currency: string;
  merchantId: string;
  productTitle: string;
  productDescription?: string;
  productId?: string;
  quantity?: number;
  sourceInstruction?: string;
}

export interface PolicyConfig {
  agent: string;
  version?: string;
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

export type PolicyDecision = "APPROVED" | "ESCALATED" | "DENIED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Phase 14.3: Human Approval TTL Configuration
 * Default TTL is 15 minutes (900,000 ms).
 */
export const DEFAULT_APPROVAL_TTL_MS = 15 * 60 * 1000;

export interface HumanApprovalRecord {
  approved: boolean;
  approvedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
  approverId: string;
  approverName?: string;
  approverEmail?: string;
  decision: "APPROVED_BY_HUMAN" | "REJECTED_BY_HUMAN";
  notes?: string;
}

export interface CreateHumanApprovalParams {
  approved: boolean;
  approverId: string;
  approverName?: string;
  approverEmail?: string;
  notes?: string;
  ttlMs?: number;
  now?: Date | string | number;
}

/**
 * Creates a strongly-typed HumanApprovalRecord with deterministic timestamps and explicit TTL expiration.
 */
export function createHumanApprovalRecord(
  params: CreateHumanApprovalParams,
): HumanApprovalRecord {
  const baseDate = params.now !== undefined
    ? (params.now instanceof Date ? params.now : new Date(params.now))
    : new Date();
  const ttl = params.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;
  const isoTime = baseDate.toISOString();
  const expiresAt = new Date(baseDate.getTime() + ttl).toISOString();

  if (params.approved) {
    return {
      approved: true,
      approvedAt: isoTime,
      expiresAt,
      approverId: params.approverId,
      approverName: params.approverName,
      approverEmail: params.approverEmail,
      decision: "APPROVED_BY_HUMAN",
      notes: params.notes,
    };
  }

  return {
    approved: false,
    rejectedAt: isoTime,
    approverId: params.approverId,
    approverName: params.approverName,
    approverEmail: params.approverEmail,
    decision: "REJECTED_BY_HUMAN",
    notes: params.notes,
  };
}

export interface ApprovalValidationResult {
  valid: boolean;
  expired: boolean;
  reason?: string;
}

/**
 * Validates a HumanApprovalRecord against expiration and integrity checks.
 */
export function validateHumanApproval(
  approval: HumanApprovalRecord | undefined | null,
  now?: Date | string | number,
): ApprovalValidationResult {
  if (!approval || typeof approval !== "object") {
    return {
      valid: false,
      expired: false,
      reason: "No human approval record found",
    };
  }

  if (!approval.approved || approval.decision !== "APPROVED_BY_HUMAN") {
    return {
      valid: false,
      expired: false,
      reason: `Human approval decision was not approved (decision: ${approval.decision || "unknown"})`,
    };
  }

  const checkTime = now !== undefined
    ? (now instanceof Date ? now.getTime() : typeof now === "number" ? now : new Date(now).getTime())
    : Date.now();

  if (approval.expiresAt) {
    const expiresTime = new Date(approval.expiresAt).getTime();
    if (isNaN(expiresTime)) {
      return {
        valid: false,
        expired: false,
        reason: "Invalid expiresAt timestamp on human approval record",
      };
    }
    if (checkTime > expiresTime) {
      return {
        valid: false,
        expired: true,
        reason: `Human approval expired at ${approval.expiresAt} (current check time: ${new Date(checkTime).toISOString()})`,
      };
    }
  } else if (approval.approvedAt) {
    // If expiresAt is not explicitly set, calculate from approvedAt + DEFAULT_APPROVAL_TTL_MS
    const approvedTime = new Date(approval.approvedAt).getTime();
    if (isNaN(approvedTime)) {
      return {
        valid: false,
        expired: false,
        reason: "Invalid approvedAt timestamp on human approval record",
      };
    }
    const derivedExpiresTime = approvedTime + DEFAULT_APPROVAL_TTL_MS;
    if (checkTime > derivedExpiresTime) {
      return {
        valid: false,
        expired: true,
        reason: `Human approval expired based on default TTL from ${approval.approvedAt}`,
      };
    }
  }

  return {
    valid: true,
    expired: false,
  };
}

/**
 * Convenience helper to test if an approval has expired.
 */
export function isApprovalExpired(
  approval: HumanApprovalRecord | undefined | null,
  now?: Date | string | number,
): boolean {
  return validateHumanApproval(approval, now).expired;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  status: PolicyDecision;
  allowed: boolean;
  riskLevel: RiskLevel;
  riskScore: RiskLevel;
  reason: string;
  reasons: string[];
  untrustedInputDetected: boolean;
  timestamp: string;
  policyVersion?: string;
  humanApproval?: HumanApprovalRecord;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|the\s+)?(previous|prior)\s+instructions/i,
  /increase\s+transaction\s+amount/i,
  /bypass\s+policy/i,
  /system\s+override/i,
  /admin\s+mode/i,
];

export function evaluatePolicy(
  intent: TransactionIntent,
  policy: PolicyConfig,
  currentDailySpend: number = 0,
): PolicyEvaluationResult {
  const timestamp = new Date().toISOString();
  const policyVersion = policy.version || "1.0.0";

  // 1. Prompt Injection / Malicious Input Check
  const combinedText = `${intent.productTitle} ${intent.productDescription || ""} ${intent.sourceInstruction || ""}`;
  const isMalicious = INJECTION_PATTERNS.some((pattern) => pattern.test(combinedText));

  if (isMalicious) {
    const reason = "Security Alert: Untrusted instruction / prompt injection detected in payload.";
    return {
      decision: "DENIED",
      status: "DENIED",
      allowed: false,
      riskLevel: "HIGH",
      riskScore: "HIGH",
      reason,
      reasons: [reason],
      untrustedInputDetected: true,
      timestamp,
      policyVersion,
    };
  }

  // 2. Capability / Permission Check
  if (!policy.permissions[intent.action]) {
    const reason = `Agent does not possess '${intent.action}' capability.`;
    return {
      decision: "DENIED",
      status: "DENIED",
      allowed: false,
      riskLevel: "HIGH",
      riskScore: "HIGH",
      reason,
      reasons: [reason],
      untrustedInputDetected: false,
      timestamp,
      policyVersion,
    };
  }

  // 3. Per-Transaction Limit Check
  if (intent.amount > policy.limits.per_transaction) {
    const reason = `Amount ₹${intent.amount} exceeds per-transaction limit of ₹${policy.limits.per_transaction}.`;
    return {
      decision: "DENIED",
      status: "DENIED",
      allowed: false,
      riskLevel: "HIGH",
      riskScore: "HIGH",
      reason,
      reasons: [reason],
      untrustedInputDetected: false,
      timestamp,
      policyVersion,
    };
  }

  // 4. Daily Spend Cap Check
  if (currentDailySpend + intent.amount > policy.limits.daily_cap) {
    const reason = `Transaction exceeds daily spending cap of ₹${policy.limits.daily_cap}.`;
    return {
      decision: "DENIED",
      status: "DENIED",
      allowed: false,
      riskLevel: "HIGH",
      riskScore: "HIGH",
      reason,
      reasons: [reason],
      untrustedInputDetected: false,
      timestamp,
      policyVersion,
    };
  }

  // 5. Human Escalation Threshold
  if (intent.amount > policy.approval.require_human_above) {
    const reason = `Amount ₹${intent.amount} exceeds auto-approval threshold (₹${policy.approval.require_human_above}). Confirmation required.`;
    return {
      decision: "ESCALATED",
      status: "ESCALATED",
      allowed: false, // Automated payment is NOT allowed without human approval
      riskLevel: "MEDIUM",
      riskScore: "MEDIUM",
      reason,
      reasons: [reason],
      untrustedInputDetected: false,
      timestamp,
      policyVersion,
    };
  }

  // 6. Safe & Approved
  const reason = "Transaction within bounds and policy limits.";
  return {
    decision: "APPROVED",
    status: "APPROVED",
    allowed: true,
    riskLevel: "LOW",
    riskScore: "LOW",
    reason,
    reasons: [reason],
    untrustedInputDetected: false,
    timestamp,
    policyVersion,
  };
}
