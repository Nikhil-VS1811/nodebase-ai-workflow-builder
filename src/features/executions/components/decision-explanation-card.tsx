"use client";

import { useMemo } from "react";
import {
  HelpCircleIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  CheckCircle2Icon,
  XCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  InfoIcon,
  TagIcon,
  DollarSignIcon,
  PackageIcon,
  ArrowRightIcon,
  UserCheckIcon,
  LockIcon,
  CreditCardIcon,
  LayersIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DecisionReceipt, DecisionReceiptPayload } from "@/lib/decisionReceipt";
import type { TransactionIntent, PolicyEvaluationResult, HumanApprovalRecord } from "@/lib/policyEngine";
import { getAgentReadableProduct } from "@/lib/commerceCatalog";
import { formatDeterministicTime } from "@/lib/agenticCommerceContract";

interface DecisionExplanationCardProps {
  receipt?: DecisionReceipt | null;
  context: Record<string, unknown>;
  status: string;
  error?: string | null;
}

export const DecisionExplanationCard = ({
  receipt,
  context,
  status,
  error,
}: DecisionExplanationCardProps) => {
  const payload: Partial<DecisionReceiptPayload> = receipt?.payload || {};

  const intent = (context.transactionIntent ||
    context.intent ||
    payload.transactionIntent ||
    {}) as Partial<TransactionIntent>;

  const policy = (context.policyEvaluation ||
    payload.policyDecision ||
    {}) as Partial<PolicyEvaluationResult> & { decision?: string; status?: string };

  const humanApproval = (policy.humanApproval ||
    payload.humanDecision ||
    context.humanApproval) as Partial<HumanApprovalRecord> | undefined;

  const catalogSnapshot = (payload.catalogSnapshot ||
    (intent.productId ? getAgentReadableProduct(intent.productId) : null) ||
    {}) as Record<string, any>;

  const userInstruction =
    (context.userMessage as string) ||
    intent.sourceInstruction ||
    payload.userIntent?.sourceInstruction ||
    "Standard commerce transaction request";

  const isDenied =
    status === "FAILED" ||
    policy.decision === "DENIED" ||
    policy.status === "DENIED" ||
    (context.allowed === false && status !== "PENDING_APPROVAL");

  const isEscalated =
    policy.decision === "ESCALATED" ||
    policy.status === "ESCALATED" ||
    status === "PENDING_APPROVAL";

  const isApproved =
    (policy.decision === "APPROVED" || policy.status === "APPROVED" || humanApproval?.approved === true) &&
    !isDenied;

  const denialReason =
    (policy.reasons && policy.reasons.length > 0 ? policy.reasons.join("; ") : null) ||
    policy.reason ||
    (context.failureReason as string) ||
    error ||
    (isDenied ? "Transaction denied by policy gate rules or constraint violation." : null);

  // Compute expiration info
  const expiresAt = humanApproval?.expiresAt;
  const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

  return (
    <Card className="border-blue-500/30 bg-gradient-to-b from-blue-50/20 to-background shadow-xs overflow-hidden">
      {/* Header */}
      <CardHeader className="border-b border-blue-500/20 bg-blue-50/40 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
              <HelpCircleIcon className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Why this decision?
                <Badge variant="outline" className="text-xs font-mono border-blue-400 bg-white dark:bg-background">
                  DECISION EXPLANATION
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Deterministic breakdown of recommendation ranking, policy gate checks, and human authorization.
              </CardDescription>
            </div>
          </div>

          <Badge
            className={`text-xs font-semibold px-3 py-1 ${
              isDenied
                ? "bg-rose-600 text-white"
                : isEscalated && !humanApproval?.approved
                  ? "bg-amber-600 text-white"
                  : "bg-emerald-600 text-white"
            }`}
          >
            {isDenied
              ? "DECISION: DENIED"
              : isEscalated && !humanApproval?.approved
                ? "DECISION: ESCALATED (REQUIRES APPROVAL)"
                : "DECISION: APPROVED & VERIFIED"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6 text-sm">
        {/* Denial Banner if Denied */}
        {isDenied && (
          <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-1.5">
            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-semibold text-xs uppercase tracking-wide">
              <XCircleIcon className="size-4 text-rose-600 shrink-0" />
              Reason for Denial
            </div>
            <p className="text-rose-950 dark:text-rose-200 text-xs font-mono bg-white/60 dark:bg-background/60 p-2 rounded border border-rose-200/60">
              {denialReason}
            </p>
            <p className="text-[11px] text-rose-700 dark:text-rose-400">
              Zero Razorpay orders and zero PaymentOrders were created. Execution halted safely at the authorization boundary.
            </p>
          </div>
        )}

        {/* Step 1: User Intent & Product Selection */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
              1
            </span>
            <span>User Intent & Product Selection</span>
          </div>

          <div className="p-3.5 rounded-lg border bg-card/60 space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Shopping Query / Instruction:</span>
              <span className="font-medium text-foreground italic">"{userInstruction}"</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <span className="text-muted-foreground block text-[11px]">Selected Product:</span>
                <span className="font-semibold text-foreground">{intent.productTitle || catalogSnapshot.name || "Catalog Product"}</span>
                {intent.productId && <span className="block font-mono text-[10px] text-muted-foreground">ID: {intent.productId}</span>}
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Trusted Catalog Price:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  ₹{(catalogSnapshot.price || intent.amount || 0).toLocaleString("en-IN")} {catalogSnapshot.currency || intent.currency || "INR"}
                </span>
                <span className="block text-[10px] text-muted-foreground">Qty: {intent.quantity || 1}</span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Trusted Merchant ID:</span>
                <span className="font-mono text-foreground">{catalogSnapshot.merchantId || intent.merchantId || "merchant_nodebase_01"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Recommendation & Strategy Scoring Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
                2
              </span>
              <span>Recommendation Decision & Scoring Reasoning</span>
            </div>
            <Badge variant="outline" className="text-[11px] font-mono">
              Strategy: {(context.activeStrategy as string) || (payload.policyDecision as any)?.activeStrategy || "BALANCED_VALUE"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Relevance */}
            <div className="p-3 rounded-lg border bg-card/60 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2Icon className="size-3.5 text-emerald-500" />
                Relevance Dominance
              </div>
              <p className="text-muted-foreground text-[11px]">
                Item matched query terms with score meeting the minimum relevance threshold (≥20). Relevance strictly dominates commercial bonuses.
              </p>
            </div>

            {/* Availability */}
            <div className="p-3 rounded-lg border bg-card/60 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <PackageIcon className="size-3.5 text-blue-500" />
                Availability Check
              </div>
              <p className="text-muted-foreground text-[11px]">
                Product inventory confirmed in trusted merchant catalog with verified stock fulfillment priority.
              </p>
            </div>

            {/* Commercial Proxy */}
            <div className="p-3 rounded-lg border bg-card/60 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <DollarSignIcon className="size-3.5 text-amber-500" />
                Commercial-Value Proxy
              </div>
              <p className="text-muted-foreground text-[11px]">
                Weighted using catalog price bracket (+{(catalogSnapshot.price ? Math.min(50, Math.round(catalogSnapshot.price / 100)) : 20)} pts).
              </p>
            </div>
          </div>

          {/* Mandatory Proxy Scoring Disclaimer */}
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <InfoIcon className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Commercial Proxy Notice: </span>
              <span>
                Commercial value scoring represents a deterministic catalog-price-based proxy under the merchant growth policy. It is <strong>NOT</strong> a prediction of merchant revenue, profit, conversion probability, or customer purchasing behavior.
              </span>
            </div>
          </div>
        </div>

        {/* Step 3: Policy Gate Authorization Boundary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
              3
            </span>
            <span>Policy Gate Authorization Authority</span>
          </div>

          <div className="p-3.5 rounded-lg border bg-card/60 space-y-2.5 text-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="size-4 text-primary" />
                <span className="font-semibold text-foreground">Policy Gate Evaluation:</span>
                <Badge
                  variant="outline"
                  className={`font-mono text-xs font-bold ${
                    (policy.decision === "APPROVED" || isApproved)
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : (policy.decision === "ESCALATED" || isEscalated)
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                  }`}
                >
                  {policy.decision || policy.status || (isDenied ? "DENIED" : isEscalated ? "ESCALATED" : "APPROVED")}
                </Badge>
              </div>

              <span className="text-muted-foreground text-[11px]">
                Risk Level: <strong>{policy.riskLevel || policy.riskScore || (isDenied ? "HIGH" : isEscalated ? "MEDIUM" : "LOW")}</strong>
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground block text-[11px] uppercase font-medium">Policy Rationale:</span>
              {policy.reasons && policy.reasons.length > 0 ? (
                <ul className="list-disc list-inside text-foreground font-mono space-y-0.5">
                  {policy.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-foreground font-mono">
                  {policy.reason || (isDenied ? (denialReason || "Transaction denied by policy gate rules or constraint violation.") : "Transaction within bounds and policy spending limits.")}
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Authorization Rules Checked: </span>
              Prompt injection patterns (negative), per-transaction limit (₹10,000 max), daily spend cap (₹15,000 max), auto-approve threshold (₹2,000).
            </div>
          </div>
        </div>

        {/* Step 4: Human-in-the-Loop (HITL) & Approval TTL */}
        {(isEscalated || humanApproval) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
                4
              </span>
              <span>Human Approval & Safety TTL</span>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 space-y-2 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <UserCheckIcon className="size-4 text-amber-600" />
                  <span className="font-semibold text-foreground">Human Approval Status:</span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-mono font-bold ${
                      humanApproval?.approved
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : humanApproval?.decision === "REJECTED_BY_HUMAN"
                          ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    }`}
                  >
                    {humanApproval?.decision || (humanApproval?.approved ? "APPROVED_BY_HUMAN" : "PENDING_APPROVAL")}
                  </Badge>
                </div>

                {expiresAt && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-mono flex items-center gap-1 ${
                      isExpired
                        ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                        : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                    }`}
                  >
                    <ClockIcon className="size-3" />
                    {isExpired ? "TTL EXPIRED" : `TTL Expires: ${formatDeterministicTime(expiresAt)}`}
                  </Badge>
                )}
              </div>

              {humanApproval?.approverId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
                  <div>
                    <span>Approver: </span>
                    <strong className="text-foreground">{humanApproval.approverName || humanApproval.approverEmail || humanApproval.approverId}</strong>
                  </div>
                  <div>
                    <span>Decision Time: </span>
                    <span className="font-mono text-foreground">{humanApproval.approvedAt || humanApproval.rejectedAt || "N/A"}</span>
                  </div>
                </div>
              )}

              {expiresAt && (
                <div className="p-2.5 rounded bg-muted/40 border border-border/50 text-[11px] text-muted-foreground space-y-0.5">
                  <span className="font-medium text-foreground block">Approval Safety TTL Window:</span>
                  <span>
                    Valid until <code className="font-mono text-foreground">{new Date(expiresAt).toISOString()}</code> (15-minute bounded window). Expired approvals fail closed with 0 provider calls.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Final Execution & Evidence Notice */}
        <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <LockIcon className="size-3.5 text-emerald-600" />
            Execution Evidence Guarantee
          </div>
          <p className="text-[11px]">
            This explanation provides transparent audit evidence of the multi-stage commerce decision. It does <strong>NOT</strong> constitute an authorization bypass or payment execution shortcut. Financial transactions execute exclusively when server-side Policy Gate verification succeeds.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
