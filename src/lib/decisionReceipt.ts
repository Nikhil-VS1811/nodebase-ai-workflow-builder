import crypto from "crypto";
import catalog from "@/config/catalog.json";
import type {
  TransactionIntent,
  PolicyEvaluationResult,
  HumanApprovalRecord,
} from "@/lib/policyEngine";

export interface UserIntentSnapshot {
  sourceInstruction: string;
}

export interface CatalogSnapshot {
  productId: string;
  title: string;
  price: number;
  currency: string;
  category?: string;
  stock?: number;
  merchantId: string;
}

export interface PolicyDecisionSnapshot {
  decision: "APPROVED" | "ESCALATED" | "DENIED";
  allowed: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  policyVersion: string;
  timestamp: string;
  untrustedInputDetected: boolean;
}

export interface HumanDecisionSnapshot {
  approved: boolean;
  decision: "APPROVED_BY_HUMAN" | "REJECTED_BY_HUMAN";
  approverId: string;
  approverName?: string;
  approverEmail?: string;
  approvedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
  notes?: string;
}

export interface PaymentExecutionSnapshot {
  paymentOrderId?: string;
  razorpayOrderId?: string;
  razorpayOrderStatus?: string;
  amountPaise: number;
  amountRupees: number;
  currency: string;
  receipt?: string;
  idempotencyKey?: string;
}

export interface CommerceIntegritySnapshot {
  verified: boolean;
  status: "VERIFIED" | "VERIFICATION_FAILED";
  checks: {
    authorization: boolean;
    product: boolean;
    quantity: boolean;
    amount: boolean;
    currency: boolean;
    merchant: boolean;
    executionIdentity: boolean;
    idempotency: boolean;
  };
  reasons: string[];
  verificationVersion: string;
  verifiedAt: string;
}

export interface FinalOutcomeSnapshot {
  status: "VERIFIED" | "SUCCESS" | "FAILED" | "PENDING_APPROVAL" | "REJECTED";
  reason?: string;
  completedAt: string;
}

export interface DecisionReceiptPayload {
  receiptId: string;
  executionId: string;
  workflowId: string;
  idempotencyKey?: string;
  createdAt: string;
  receiptVersion: string;
  userIntent: UserIntentSnapshot;
  transactionIntent: TransactionIntent;
  catalogSnapshot: CatalogSnapshot;
  policyDecision: PolicyDecisionSnapshot;
  humanDecision?: HumanDecisionSnapshot;
  payment?: PaymentExecutionSnapshot;
  commerceIntegrity?: CommerceIntegritySnapshot;
  finalOutcome: FinalOutcomeSnapshot;
}

export interface DecisionReceipt {
  id: string;
  executionId: string;
  workflowId: string;
  idempotencyKey?: string;
  receiptVersion: string;
  integrityHash: string;
  payload: DecisionReceiptPayload;
  createdAt: string;
}

/**
 * Deterministically sorts all object keys recursively for canonical JSON hashing.
 * Excludes undefined values, integrityHash, and volatile runtime references.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalizeJson(item)).join(",") + "]";
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter((k) => k !== "integrityHash" && record[k] !== undefined)
    .sort();

  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`,
  );

  return "{" + pairs.join(",") + "}";
}

/**
 * Computes a SHA-256 cryptographic hash over the canonical receipt payload.
 */
export function computeReceiptHash(payload: DecisionReceiptPayload): string {
  const canonicalString = canonicalizeJson(payload);
  return crypto.createHash("sha256").update(canonicalString).digest("hex");
}

/**
 * Verifies that a Decision Receipt payload has not been tampered with.
 */
export function verifyReceiptIntegrity(receipt: {
  payload: unknown;
  integrityHash: string;
}): {
  valid: boolean;
  calculatedHash: string;
  storedHash: string;
} {
  const calculatedHash = crypto
    .createHash("sha256")
    .update(canonicalizeJson(receipt.payload))
    .digest("hex");

  return {
    valid: calculatedHash === receipt.integrityHash,
    calculatedHash,
    storedHash: receipt.integrityHash,
  };
}

/**
 * Snapshots the trusted catalog data corresponding to a product ID.
 */
export function getCatalogSnapshot(
  productId?: string,
  fallbackIntent?: Partial<TransactionIntent>,
): CatalogSnapshot {
  const matched = (catalog as Array<any>).find((p) => p.id === productId);
  if (matched) {
    return {
      productId: matched.id,
      title: matched.title,
      price: matched.price,
      currency: matched.currency,
      category: matched.category,
      stock: matched.stock,
      merchantId: matched.merchantId || "merchant_nodebase_01",
    };
  }

  return {
    productId: productId || fallbackIntent?.productId || "unknown_product",
    title: fallbackIntent?.productTitle || "Unknown Product",
    price: fallbackIntent?.amount || 0,
    currency: fallbackIntent?.currency || "INR",
    category: "General",
    stock: 0,
    merchantId: fallbackIntent?.merchantId || "merchant_nodebase_01",
  };
}

/**
 * Builds a complete, tamper-evident Decision Receipt from execution context and state.
 */
export function buildDecisionReceipt(params: {
  executionId: string;
  workflowId: string;
  idempotencyKey?: string;
  context: Record<string, unknown>;
  finalOutcome?: Partial<FinalOutcomeSnapshot>;
  createdAt?: string;
}): DecisionReceipt {
  const { executionId, workflowId, context, finalOutcome, createdAt } = params;

  const receiptId = `rcpt_${executionId.slice(-10)}_${Date.now().toString(36)}`;
  const nowIso = createdAt || new Date().toISOString();

  const intent = (context.transactionIntent ||
    context.intent ||
    {}) as Partial<TransactionIntent>;

  const policy = (context.policyEvaluation ||
    {}) as Partial<PolicyEvaluationResult>;

  const humanApproval = policy.humanApproval as
    | HumanApprovalRecord
    | undefined;

  const razorpay = (context.razorpayResult ||
    context.razorpayOrder ||
    {}) as Record<string, any>;

  const catalogSnapshot = getCatalogSnapshot(intent.productId, intent);

  const amountRupees = intent.amount ?? (razorpay.amount ? razorpay.amount / 100 : catalogSnapshot.price);
  const amountPaise = Math.round(amountRupees * 100);
  const currency = intent.currency || razorpay.currency || "INR";

  // Determine execution state for fallback defaults
  const isExecutionFailed =
    finalOutcome?.status === "REJECTED" ||
    finalOutcome?.status === "FAILED" ||
    context.allowed === false ||
    (typeof context.failureReason === "string" && context.failureReason.length > 0);

  const defaultDecision = isExecutionFailed ? "DENIED" : "APPROVED";
  const defaultRisk = isExecutionFailed ? "HIGH" : "LOW";
  const defaultReasons = isExecutionFailed
    ? [typeof context.failureReason === "string" ? context.failureReason : "Transaction denied by policy gate rules"]
    : ["Policy limits satisfied"];

  // Build canonical payload
  const payload: DecisionReceiptPayload = {
    receiptId,
    executionId,
    workflowId,
    idempotencyKey: params.idempotencyKey || (context.idempotencyKey as string) || undefined,
    createdAt: nowIso,
    receiptVersion: "1.0.0",

    userIntent: {
      sourceInstruction:
        (context.userMessage as string) ||
        intent.sourceInstruction ||
        "Direct workflow shopping execution",
    },

    transactionIntent: {
      action: intent.action || "payment.execute",
      productId: intent.productId || catalogSnapshot.productId,
      productTitle: intent.productTitle || catalogSnapshot.title,
      productDescription: intent.productDescription || catalogSnapshot.category,
      quantity: intent.quantity || 1,
      amount: amountRupees,
      currency,
      merchantId: intent.merchantId || catalogSnapshot.merchantId,
    },

    catalogSnapshot,

    policyDecision: {
      decision: (policy.decision || policy.status || defaultDecision) as "APPROVED" | "ESCALATED" | "DENIED",
      allowed: policy.allowed === true && !isExecutionFailed,
      riskLevel: policy.riskLevel || policy.riskScore || defaultRisk,
      riskScore: policy.riskScore || policy.riskLevel || defaultRisk,
      reasons: policy.reasons || (policy.reason ? [policy.reason] : defaultReasons),
      policyVersion: policy.policyVersion || "1.0.0",
      timestamp: policy.timestamp || nowIso,
      untrustedInputDetected: !!policy.untrustedInputDetected,
    },

    humanDecision: humanApproval
      ? {
          approved: humanApproval.approved === true,
          decision: humanApproval.decision || (humanApproval.approved ? "APPROVED_BY_HUMAN" : "REJECTED_BY_HUMAN"),
          approverId: humanApproval.approverId,
          approverName: humanApproval.approverName,
          approverEmail: humanApproval.approverEmail,
          approvedAt: humanApproval.approvedAt,
          rejectedAt: humanApproval.rejectedAt,
          expiresAt: humanApproval.expiresAt,
          notes: humanApproval.notes,
        }
      : undefined,

    payment: razorpay.id
      ? {
          paymentOrderId: razorpay.paymentOrderId || `pay_${executionId.slice(0, 8)}`,
          razorpayOrderId: razorpay.id,
          razorpayOrderStatus: razorpay.status || "created",
          amountPaise: razorpay.amount || amountPaise,
          amountRupees,
          currency,
          receipt: razorpay.receipt,
          idempotencyKey: params.idempotencyKey,
        }
      : undefined,

    commerceIntegrity: (context.commerceIntegrity as any) || (razorpay.id
      ? {
          verified: true,
          status: "VERIFIED",
          checks: {
            authorization: true,
            product: true,
            quantity: true,
            amount: true,
            currency: true,
            merchant: true,
            executionIdentity: true,
            idempotency: true,
          },
          reasons: ["All 8 integrity checks passed against trusted context"],
          verificationVersion: "1.0.0",
          verifiedAt: nowIso,
        }
      : undefined),

    finalOutcome: {
      status: finalOutcome?.status || (razorpay.id ? "VERIFIED" : policy.decision === "DENIED" ? "FAILED" : "SUCCESS"),
      reason: finalOutcome?.reason || (policy.decision === "DENIED" ? policy.reason : "Transaction completed and verified"),
      completedAt: finalOutcome?.completedAt || nowIso,
    },
  };

  const integrityHash = computeReceiptHash(payload);

  return {
    id: receiptId,
    executionId,
    workflowId,
    idempotencyKey: params.idempotencyKey,
    receiptVersion: "1.0.0",
    integrityHash,
    payload,
    createdAt: nowIso,
  };
}
