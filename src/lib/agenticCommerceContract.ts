import crypto from "crypto";
import type {
  ProductRecommendationItem,
  RecommendationExplanation,
  RecommendationAcceptance,
} from "@/lib/commerceCatalog";
import type {
  TransactionIntent,
  PolicyEvaluationResult,
  PolicyDecision,
  HumanApprovalRecord,
} from "@/lib/policyEngine";
import type { DecisionReceipt, DecisionReceiptPayload, CommerceIntegritySnapshot } from "@/lib/decisionReceipt";
import type { BuyerClarificationData } from "@/lib/conversationalBuyer";

/**
 * Phase 16.1: Internal Agentic Commerce Action Contract
 *
 * Defines a strongly-typed internal lifecycle contract that makes the AI Commerce
 * progression explicit, auditable, and transparent without changing authorization
 * or payment behavior.
 *
 * CONCEPTUAL STAGES:
 * 1. DISCOVER:  Product candidate discovery and ranking (Strictly Advisory).
 * 2. CLARIFY:   Confidence-gated disambiguation (No authorization, No payment).
 * 3. ACCEPT:    Explicit user acceptance producing trusted TransactionIntent (Buyer intent only, NOT authorization).
 * 4. AUTHORIZE: Server-side Policy Gate & Human Approval evaluation (Enforces spending limits & security).
 * 5. EXECUTE:   Canonical commerce execution pipeline & Razorpay provider call (Protected by durable PaymentOrder).
 * 6. VERIFY:    Multi-point cryptographic commerce integrity verification.
 * 7. RECEIPT:   Tamper-evident SHA-256 Decision Receipt (Audit evidence only, NOT an authorization token).
 *
 * CRITICAL ARCHITECTURAL SAFETY GUARANTEES:
 * - ZERO EXTERNAL PROTOCOL DEPENDENCIES: Pure internal contract representation.
 * - PURE & SIDE-EFFECT FREE: Contract creation performs zero network calls, zero Razorpay calls, and zero DB writes.
 * - ZERO SECRETS/CREDENTIALS: Strictly excludes API keys, credentials, session tokens, or private signing keys.
 * - READ-ONLY AUDITABILITY: Contract objects cannot be used as execution tokens.
 */

export type CommerceActionStage =
  | "DISCOVER"
  | "CLARIFY"
  | "ACCEPT"
  | "AUTHORIZE"
  | "EXECUTE"
  | "VERIFY"
  | "RECEIPT";

export interface BaseCommerceAction {
  readonly stage: CommerceActionStage;
  readonly actionId: string;
  readonly timestamp: string;
}

export interface DiscoverAction extends BaseCommerceAction {
  readonly stage: "DISCOVER";
  readonly query: string;
  readonly recommendations: readonly Readonly<ProductRecommendationItem>[];
  readonly topCandidate?: Readonly<ProductRecommendationItem>;
  readonly isAdvisory: true;
}

export interface ClarifyAction extends BaseCommerceAction {
  readonly stage: "CLARIFY";
  readonly query: string;
  readonly clarification: Readonly<BuyerClarificationData>;
  readonly isAdvisory: true;
  readonly hasExecutableIntent: false;
}

export interface AcceptAction extends BaseCommerceAction {
  readonly stage: "ACCEPT";
  readonly productId: string;
  readonly userConfirmation: string;
  readonly accepted: boolean;
  readonly transactionIntent: Readonly<TransactionIntent> | null;
  readonly isBuyerIntentOnly: true;
  readonly isAuthorized: false;
}

export interface AuthorizeAction extends BaseCommerceAction {
  readonly stage: "AUTHORIZE";
  readonly decision: PolicyDecision;
  readonly allowed: boolean;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH";
  readonly reasons: readonly string[];
  readonly humanApproval?: Readonly<HumanApprovalRecord>;
  readonly policyVersion: string;
  readonly isPolicyGateEvaluation: true;
}

export interface ExecuteAction extends BaseCommerceAction {
  readonly stage: "EXECUTE";
  readonly status: "SUCCESS" | "PENDING_APPROVAL" | "DENIED" | "FAILED";
  readonly paymentOrderId?: string;
  readonly razorpayOrderId?: string;
  readonly razorpayOrderStatus?: string;
  readonly amountRupees: number;
  readonly currency: string;
  readonly isProviderExecution: true;
}

export interface VerifyAction extends BaseCommerceAction {
  readonly stage: "VERIFY";
  readonly verified: boolean;
  readonly status: "VERIFIED" | "VERIFICATION_FAILED";
  readonly checks: Readonly<{
    authorization: boolean;
    product: boolean;
    quantity: boolean;
    amount: boolean;
    currency: boolean;
    merchant: boolean;
    executionIdentity: boolean;
    idempotency: boolean;
  }>;
  readonly isIntegrityVerification: true;
}

export interface ReceiptAction extends BaseCommerceAction {
  readonly stage: "RECEIPT";
  readonly receiptId: string;
  readonly integrityHash: string;
  readonly receiptVersion: string;
  readonly isAuditEvidenceOnly: true;
  readonly isAuthorizationToken: false;
}

export type AgenticCommerceAction =
  | DiscoverAction
  | ClarifyAction
  | AcceptAction
  | AuthorizeAction
  | ExecuteAction
  | VerifyAction
  | ReceiptAction;

export interface AgenticCommerceContract {
  readonly contractId: string;
  readonly createdAt: string;
  readonly currentStage: CommerceActionStage;
  readonly actions: readonly AgenticCommerceAction[];
  readonly isComplete: boolean;
  readonly isAdvisoryOnly: boolean;
}

function generateActionId(prefix: string): string {
  return `act_${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * 1. Creates a typed DISCOVER action (strictly advisory).
 */
export function createDiscoveryAction(params: {
  query: string;
  recommendations: readonly ProductRecommendationItem[];
  timestamp?: string;
}): Readonly<DiscoverAction> {
  const topCandidate = params.recommendations.length > 0 ? params.recommendations[0] : undefined;
  return Object.freeze({
    stage: "DISCOVER",
    actionId: generateActionId("disc"),
    timestamp: params.timestamp || new Date().toISOString(),
    query: params.query,
    recommendations: Object.freeze([...params.recommendations]),
    topCandidate,
    isAdvisory: true,
  });
}

/**
 * 2. Creates a typed CLARIFY action (advisory only, no executable intent).
 */
export function createClarificationAction(params: {
  query: string;
  clarification: BuyerClarificationData;
  timestamp?: string;
}): Readonly<ClarifyAction> {
  return Object.freeze({
    stage: "CLARIFY",
    actionId: generateActionId("clar"),
    timestamp: params.timestamp || new Date().toISOString(),
    query: params.query,
    clarification: Object.freeze({
      ...params.clarification,
      candidateProducts: Object.freeze([...params.clarification.candidateProducts]),
    }),
    isAdvisory: true,
    hasExecutableIntent: false,
  });
}

/**
 * 3. Creates a typed ACCEPT action (buyer intent only, NOT authorization).
 */
export function createAcceptanceAction(params: {
  productId: string;
  userConfirmation: string;
  acceptance: RecommendationAcceptance;
  timestamp?: string;
}): Readonly<AcceptAction> {
  return Object.freeze({
    stage: "ACCEPT",
    actionId: generateActionId("acc"),
    timestamp: params.timestamp || new Date().toISOString(),
    productId: params.productId,
    userConfirmation: params.userConfirmation,
    accepted: params.acceptance.accepted,
    transactionIntent: params.acceptance.transactionIntent || null,
    isBuyerIntentOnly: true,
    isAuthorized: false,
  });
}

/**
 * 4. Creates a typed AUTHORIZE action (Policy Gate evaluation result).
 */
export function createAuthorizationAction(params: {
  policyEvaluation: PolicyEvaluationResult;
  timestamp?: string;
}): Readonly<AuthorizeAction> {
  return Object.freeze({
    stage: "AUTHORIZE",
    actionId: generateActionId("auth"),
    timestamp: params.timestamp || params.policyEvaluation.timestamp || new Date().toISOString(),
    decision: params.policyEvaluation.decision,
    allowed: params.policyEvaluation.allowed,
    riskLevel: params.policyEvaluation.riskLevel,
    reasons: Object.freeze([...params.policyEvaluation.reasons]),
    humanApproval: params.policyEvaluation.humanApproval,
    policyVersion: params.policyEvaluation.policyVersion || "1.0.0",
    isPolicyGateEvaluation: true,
  });
}

/**
 * 5. Creates a typed EXECUTE action (canonical pipeline execution result).
 */
export function createExecutionAction(params: {
  status: "SUCCESS" | "PENDING_APPROVAL" | "DENIED" | "FAILED";
  paymentOrderId?: string;
  razorpayOrderId?: string;
  razorpayOrderStatus?: string;
  amountRupees: number;
  currency?: string;
  timestamp?: string;
}): Readonly<ExecuteAction> {
  return Object.freeze({
    stage: "EXECUTE",
    actionId: generateActionId("exec"),
    timestamp: params.timestamp || new Date().toISOString(),
    status: params.status,
    paymentOrderId: params.paymentOrderId,
    razorpayOrderId: params.razorpayOrderId,
    razorpayOrderStatus: params.razorpayOrderStatus || (params.razorpayOrderId ? "created" : undefined),
    amountRupees: params.amountRupees,
    currency: params.currency || "INR",
    isProviderExecution: true,
  });
}

/**
 * 6. Creates a typed VERIFY action (cryptographic integrity result).
 */
export function createVerificationAction(params: {
  integrity: CommerceIntegritySnapshot;
  timestamp?: string;
}): Readonly<VerifyAction> {
  return Object.freeze({
    stage: "VERIFY",
    actionId: generateActionId("ver"),
    timestamp: params.timestamp || params.integrity.verifiedAt || new Date().toISOString(),
    verified: params.integrity.verified,
    status: params.integrity.status,
    checks: Object.freeze({ ...params.integrity.checks }),
    isIntegrityVerification: true,
  });
}

/**
 * 7. Creates a typed RECEIPT action (tamper-evident audit evidence).
 */
export function createReceiptAction(params: {
  receipt: DecisionReceipt;
  timestamp?: string;
}): Readonly<ReceiptAction> {
  return Object.freeze({
    stage: "RECEIPT",
    actionId: generateActionId("rcpt"),
    timestamp: params.timestamp || (params.receipt.createdAt ? new Date(params.receipt.createdAt).toISOString() : new Date().toISOString()),
    receiptId: params.receipt.id,
    integrityHash: params.receipt.integrityHash,
    receiptVersion: params.receipt.receiptVersion,
    isAuditEvidenceOnly: true,
    isAuthorizationToken: false,
  });
}

/**
 * Constructs a comprehensive immutable AgenticCommerceContract summarizing a commerce lifecycle.
 */
export function buildCommerceContract(params: {
  contractId?: string;
  actions: readonly AgenticCommerceAction[];
  createdAt?: string;
}): Readonly<AgenticCommerceContract> {
  const actions = Object.freeze([...params.actions]);
  const currentStage: CommerceActionStage = actions.length > 0 ? actions[actions.length - 1].stage : "DISCOVER";
  const isComplete = currentStage === "RECEIPT" || (currentStage === "EXECUTE" && actions[actions.length - 1].stage === "EXECUTE");
  const isAdvisoryOnly = actions.every((a) => a.stage === "DISCOVER" || a.stage === "CLARIFY");

  return Object.freeze({
    contractId: params.contractId || `cntr_${crypto.randomBytes(8).toString("hex")}`,
    createdAt: params.createdAt || new Date().toISOString(),
    currentStage,
    actions,
    isComplete,
    isAdvisoryOnly,
  });
}

/**
 * Phase 16.2: Agentic Commerce Lifecycle View Types
 */
export type LifecycleStageStatus =
  | "COMPLETED"
  | "REQUIRED"
  | "PASSED"
  | "CONFIRMED"
  | "APPROVED"
  | "ESCALATED"
  | "DENIED"
  | "BLOCKED"
  | "NOT_REACHED"
  | "VERIFIED"
  | "SEALED";

export interface LifecycleStageView {
  readonly stage: CommerceActionStage;
  readonly title: string;
  readonly status: LifecycleStageStatus;
  readonly statusLabel: string;
  readonly description: string;
  readonly details?: readonly string[];
  readonly timestamp?: string;
  readonly isAdvisoryOnly?: boolean;
}

export interface AgenticCommerceLifecycleView {
  readonly executionId: string;
  readonly stages: readonly LifecycleStageView[];
  readonly currentStage: CommerceActionStage;
  readonly overallStatus: string;
  readonly isDenied: boolean;
  readonly isEscalated: boolean;
  readonly isExecuted: boolean;
  readonly safetyNotes: readonly string[];
}

export interface DeriveLifecycleParams {
  executionId: string;
  status: string;
  context?: Record<string, unknown>;
  receipt?: DecisionReceipt | null;
  error?: string | null;
}

/**
 * Derives a pure, read-only 7-stage Agentic Commerce Lifecycle view from real execution data.
 */
/**
 * Formats timestamps deterministically using a fixed 24-hour format (HH:mm:ss) across SSR and client hydration.
 */
export function formatDeterministicTime(timestamp: string | number | Date): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function deriveCommerceLifecycle(
  params: DeriveLifecycleParams,
): Readonly<AgenticCommerceLifecycleView> {
  const { executionId, status, context = {}, receipt, error } = params;
  const payload: Partial<DecisionReceiptPayload> = receipt?.payload || {};

  const intent = (context.transactionIntent ||
    context.intent ||
    payload.transactionIntent) as Partial<TransactionIntent> | undefined;

  const policy = (context.policyEvaluation ||
    payload.policyDecision) as Partial<PolicyEvaluationResult> | undefined;

  const humanApproval = (policy?.humanApproval ||
    payload.humanDecision ||
    context.humanApproval) as Partial<HumanApprovalRecord> | undefined;

  const payment = (context.razorpayResult ||
    context.razorpayOrder ||
    context.payment ||
    payload.payment) as Record<string, any> | undefined;

  const paymentOrder = (context.paymentOrder ||
    context.paymentOrders ||
    (Array.isArray(context.paymentOrders) ? context.paymentOrders[0] : undefined) ||
    payload.payment) as Record<string, any> | undefined;

  const isDenied =
    status === "FAILED" ||
    policy?.decision === "DENIED" ||
    (policy?.allowed === false && policy?.decision !== "ESCALATED" && status !== "PENDING_APPROVAL") ||
    (context.allowed === false && status !== "PENDING_APPROVAL" && policy?.decision !== "ESCALATED");

  const isEscalated =
    policy?.decision === "ESCALATED" ||
    status === "PENDING_APPROVAL";

  const isExecuted =
    (status === "SUCCESS" && Boolean(payment?.id || payment?.razorpayOrderId || payload.payment?.razorpayOrderId)) ||
    (status === "SUCCESS" && Boolean(payload.finalOutcome?.status === "VERIFIED" || payload.finalOutcome?.status === "SUCCESS"));

  // 1. DISCOVER
  const productTitle =
    intent?.productTitle ||
    payload.catalogSnapshot?.title ||
    "Catalog Product";
  const unitPrice =
    payload.catalogSnapshot?.price || intent?.amount || 0;
  const currency =
    payload.catalogSnapshot?.currency || intent?.currency || "INR";
  const merchantId =
    payload.catalogSnapshot?.merchantId || intent?.merchantId || "merchant_nodebase_01";

  const discoverStage: LifecycleStageView = Object.freeze({
    stage: "DISCOVER",
    title: "1. DISCOVER",
    status: "COMPLETED",
    statusLabel: "Product Discovered",
    description: `Authoritative catalog product resolved: "${productTitle}" (₹${unitPrice.toLocaleString("en-IN")} ${currency}).`,
    details: Object.freeze([
      `Merchant: ${merchantId}`,
      `Advisory Only — Does not authorize payment`,
    ]),
    isAdvisoryOnly: true,
  });

  // 2. CLARIFY
  const isClarificationRequired = Boolean(context.clarification || context.clarificationRequired);
  const clarifyStage: LifecycleStageView = Object.freeze({
    stage: "CLARIFY",
    title: "2. CLARIFY",
    status: isClarificationRequired ? "REQUIRED" : "PASSED",
    statusLabel: isClarificationRequired ? "Clarification Required" : "High Confidence (Not Required)",
    description: isClarificationRequired
      ? "Ambiguous query detected; candidate products offered for user disambiguation."
      : "Single high-confidence match; clarification not required before confirmation.",
    details: isClarificationRequired
      ? Object.freeze(["Clarification required before purchase confirmation", "0 Provider Calls"])
      : undefined,
    isAdvisoryOnly: true,
  });

  // 3. ACCEPT
  const hasIntent = Boolean(intent && (intent.productId || intent.productTitle));
  const acceptStage: LifecycleStageView = Object.freeze({
    stage: "ACCEPT",
    title: "3. ACCEPT",
    status: hasIntent ? "CONFIRMED" : "NOT_REACHED",
    statusLabel: hasIntent ? "Buyer Intent Confirmed" : "Awaiting Confirmation",
    description: hasIntent
      ? `Explicit user purchase confirmation received for ${productTitle} (Qty: ${intent?.quantity || 1}).`
      : "No explicit buyer confirmation recorded.",
    details: hasIntent
      ? Object.freeze(["Buyer Acceptance ≠ Financial Authorization", "Produces Trusted TransactionIntent"])
      : undefined,
  });

  // 4. AUTHORIZE
  let authStatus: LifecycleStageStatus = "APPROVED";
  let authLabel = "Policy Gate Approved";
  let authDesc = "Auto-approved within spending limits and capability bounds (Risk: LOW).";

  if (isDenied) {
    authStatus = "DENIED";
    authLabel = "Policy Gate Denied";
    authDesc = `Transaction DENIED by Policy Gate: ${policy?.reason || policy?.reasons?.join("; ") || error || "Policy violation"}.`;
  } else if (isEscalated) {
    if (humanApproval?.approved) {
      authStatus = "APPROVED";
      authLabel = "Human Authorized";
      authDesc = `Escalated transaction authorized by human reviewer (${humanApproval.approverName || humanApproval.approverId}).`;
    } else {
      authStatus = "ESCALATED";
      authLabel = "Requires Human Approval";
      authDesc = `Transaction exceeds auto-approval limit; awaiting human authorization.`;
    }
  }

  const authDetails: string[] = [];
  if (policy?.policyVersion) authDetails.push(`Policy Version: v${policy.policyVersion}`);
  if (humanApproval?.expiresAt) authDetails.push(`Safety TTL Expires: ${formatDeterministicTime(humanApproval.expiresAt)}`);

  const authorizeStage: LifecycleStageView = Object.freeze({
    stage: "AUTHORIZE",
    title: "4. AUTHORIZE",
    status: authStatus,
    statusLabel: authLabel,
    description: authDesc,
    details: authDetails.length > 0 ? Object.freeze(authDetails) : undefined,
    timestamp: policy?.timestamp || humanApproval?.approvedAt,
  });

  // 5. EXECUTE
  let execStatus: LifecycleStageStatus = "COMPLETED";
  let execLabel = "Razorpay Order Created";
  let execDesc = `Canonical commerce pipeline created Razorpay order "${payment?.id || payment?.razorpayOrderId || payload.payment?.razorpayOrderId || "order_created"}" for ₹${unitPrice.toLocaleString("en-IN")}.`;

  if (isDenied) {
    execStatus = "BLOCKED";
    execLabel = "Execution Blocked (0 Provider Calls)";
    execDesc = "Payment execution blocked due to Policy Gate denial. Exactly 0 provider calls made.";
  } else if (isEscalated && !humanApproval?.approved && status !== "SUCCESS") {
    execStatus = "BLOCKED";
    execLabel = "Execution Paused (0 Provider Calls)";
    execDesc = "Execution paused at Policy Gate authorization boundary. Exactly 0 provider calls made.";
  } else if (!isExecuted && status !== "SUCCESS") {
    execStatus = "NOT_REACHED";
    execLabel = "Not Executed";
    execDesc = "Provider execution not reached.";
  }

  const execDetails: string[] = [];
  if (paymentOrder?.id || payload.payment?.paymentOrderId) {
    execDetails.push(`PaymentOrder ID: ${paymentOrder?.id || payload.payment?.paymentOrderId}`);
  }
  if (isExecuted) {
    execDetails.push("Razorpay Order CREATED (Note: Razorpay order CREATED is not payment completion)");
  }

  const executeStage: LifecycleStageView = Object.freeze({
    stage: "EXECUTE",
    title: "5. EXECUTE",
    status: execStatus,
    statusLabel: execLabel,
    description: execDesc,
    details: execDetails.length > 0 ? Object.freeze(execDetails) : undefined,
  });

  // 6. VERIFY
  const isVerified = Boolean(
    receipt?.payload?.commerceIntegrity?.verified === true ||
    (context.commerceIntegrity as any)?.verified === true ||
    (status === "SUCCESS" && payload.finalOutcome?.status === "VERIFIED" && !isDenied)
  );
  const verifyStage: LifecycleStageView = Object.freeze({
    stage: "VERIFY",
    title: "6. VERIFY",
    status: isVerified ? "VERIFIED" : "NOT_REACHED",
    statusLabel: isVerified
      ? "Commerce Integrity Verified"
      : isDenied
        ? "Not Reached (Execution Blocked)"
        : "Not Verified",
    description: isVerified
      ? "Cryptographic verification passed across authorization, catalog price, merchant identity, and idempotency."
      : isDenied
        ? "Commerce-integrity verification was skipped because execution was blocked."
        : "Commerce integrity verification skipped due to incomplete execution.",
    timestamp: receipt?.payload?.commerceIntegrity?.verifiedAt || (isVerified ? payload.finalOutcome?.completedAt : undefined),
  });

  // 7. RECEIPT
  const hasReceipt = Boolean(receipt?.id || payload.receiptId);
  const isPendingReceipt = hasReceipt && (status === "PENDING_APPROVAL" || (isEscalated && !humanApproval?.approved && status !== "SUCCESS"));

  let receiptStatus: LifecycleStageStatus = "NOT_REACHED";
  let receiptLabel = "Not Generated";
  let receiptDesc = "No decision receipt generated for unexecuted transaction.";

  if (hasReceipt) {
    if (isPendingReceipt) {
      receiptStatus = "PASSED";
      receiptLabel = "Decision Receipt Active (Pending Final Seal)";
      receiptDesc = `Audit receipt initialized with SHA-256 pre-authorization hash (${(receipt?.integrityHash || "sha256_active").slice(0, 16)}...); final seal recorded upon terminal decision.`;
    } else {
      receiptStatus = "SEALED";
      receiptLabel = "Decision Receipt Sealed";
      receiptDesc = `Tamper-evident audit receipt generated with SHA-256 seal (${(receipt?.integrityHash || "sha256_sealed").slice(0, 16)}...).`;
    }
  }

  const receiptStage: LifecycleStageView = Object.freeze({
    stage: "RECEIPT",
    title: "7. RECEIPT",
    status: receiptStatus,
    statusLabel: receiptLabel,
    description: receiptDesc,
    details: hasReceipt
      ? Object.freeze(["Audit Evidence Only — Not Authorization Token", `Receipt ID: ${payload.receiptId || receipt?.id}`])
      : undefined,
    timestamp: receipt?.createdAt ? new Date(receipt.createdAt).toISOString() : payload.createdAt,
  });

  const stages = Object.freeze([
    discoverStage,
    clarifyStage,
    acceptStage,
    authorizeStage,
    executeStage,
    verifyStage,
    receiptStage,
  ]);

  const currentStage: CommerceActionStage =
    hasReceipt && !isPendingReceipt ? "RECEIPT" : isExecuted ? "EXECUTE" : isDenied || isEscalated ? "AUTHORIZE" : "DISCOVER";

  return Object.freeze({
    executionId,
    stages,
    currentStage,
    overallStatus: status,
    isDenied,
    isEscalated,
    isExecuted,
    safetyNotes: Object.freeze([
      "Recommendations and receipts are evidence; payment authorization occurs only at the protected Policy Gate / execution boundary.",
      "Razorpay order CREATED is not payment completion.",
    ]),
  });
}

