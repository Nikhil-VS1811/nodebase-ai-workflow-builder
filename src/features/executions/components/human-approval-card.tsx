"use client";

import { useState } from "react";
import {
  ShieldAlertIcon,
  ShieldCheckIcon,
  XCircleIcon,
  Loader2Icon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveExecution,
  useRejectExecution,
} from "../hooks/use-executions";
import type { TransactionIntent, PolicyEvaluationResult } from "@/lib/policyEngine";
import { formatDeterministicTime } from "@/lib/agenticCommerceContract";

interface HumanApprovalCardProps {
  executionId: string;
  context: Record<string, unknown>;
}

export const HumanApprovalCard = ({
  executionId,
  context,
}: HumanApprovalCardProps) => {
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const approveMutation = useApproveExecution();
  const rejectMutation = useRejectExecution();

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const intent = (context.transactionIntent || context.intent || {}) as Partial<TransactionIntent>;
  const policy = (context.policyEvaluation || {}) as Partial<PolicyEvaluationResult>;

  const handleApprove = () => {
    approveMutation.mutate({
      id: executionId,
      notes: notes.trim() || undefined,
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({
      id: executionId,
      reason: notes.trim() || "Transaction rejected by human reviewer.",
    });
  };

  const riskLevel = policy.riskLevel || policy.riskScore || "MEDIUM";
  const riskScore = policy.riskScore || policy.riskLevel || "MEDIUM";

  const riskBadgeVariant =
    riskLevel === "HIGH"
      ? "destructive"
      : riskLevel === "MEDIUM"
        ? "secondary"
        : "outline";

  const approvalStatus = policy.humanApproval
    ? policy.humanApproval.approved
      ? "Approved"
      : "Rejected"
    : "Pending Human Approval";

  return (
    <Card className="border-amber-400 bg-amber-50/40 shadow-sm mt-6">
      <CardHeader className="pb-3 border-b border-amber-200 bg-amber-100/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlertIcon className="size-5 text-amber-600" />
            <div>
              <CardTitle className="text-base text-amber-950 font-semibold flex items-center gap-2">
                Human Approval Required
                <Badge variant={riskBadgeVariant} className="text-xs">
                  {riskLevel} Risk (Score: {riskScore})
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-amber-800">
                This transaction exceeded automated policy limits and requires human authorization before financial execution.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900 font-mono text-xs">
              Policy v{policy.policyVersion || "1.0.0"}
            </Badge>
            <Badge
              className={
                policy.humanApproval?.approved
                  ? "bg-emerald-600 text-white"
                  : policy.humanApproval
                    ? "bg-destructive text-white"
                    : "bg-amber-600 text-white"
              }
            >
              {approvalStatus}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Transaction Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3.5 bg-white/80 rounded-md border border-amber-200/80 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Product</span>
            <span className="font-medium text-foreground">
              {intent.productTitle || "Unknown Product"}
            </span>
            {intent.productId && (
              <span className="text-xs text-muted-foreground font-mono block">
                ID: {intent.productId}
              </span>
            )}
          </div>

          <div>
            <span className="text-xs text-muted-foreground block">Quantity</span>
            <span className="font-medium text-foreground">
              {intent.quantity || 1} units
            </span>
          </div>

          <div>
            <span className="text-xs text-muted-foreground block">Total Amount</span>
            <span className="font-semibold text-base text-primary">
              ₹{intent.amount?.toLocaleString("en-IN") || 0}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {intent.currency || "INR"}
              </span>
            </span>
          </div>

          <div>
            <span className="text-xs text-muted-foreground block">Merchant</span>
            <span className="font-mono text-xs text-foreground">
              {intent.merchantId || "merchant_nodebase_01"}
            </span>
          </div>
        </div>

        {/* Risk & Policy Reasons */}
        <div className="space-y-1.5 p-3.5 bg-amber-100/50 rounded-md border border-amber-200 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <AlertTriangleIcon className="size-3.5" />
              Policy Escalation Reason(s):
            </div>
            <span className="text-xs text-amber-800">
              Risk Level: <strong>{riskLevel}</strong> | Risk Score: <strong>{riskScore}</strong>
            </span>
          </div>
          {policy.reasons && policy.reasons.length > 0 ? (
            <ul className="list-disc list-inside text-xs text-amber-900 space-y-1 font-mono">
              {policy.reasons.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-amber-900 font-mono">
              {policy.reason || "Transaction exceeds auto-approval spending threshold."}
            </p>
          )}
        </div>

        {/* Safety TTL Indicator */}
        <div className="p-2.5 rounded bg-amber-100/40 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <ClockIcon className="size-3.5 text-amber-700" />
            Approval Safety Window (TTL)
          </span>
          <span className="font-mono text-[11px] text-amber-800">
            {policy.humanApproval?.expiresAt
              ? `Expires at ${formatDeterministicTime(policy.humanApproval.expiresAt)}`
              : "15-minute bounded window upon approval"}
          </span>
        </div>

        {/* Optional Reviewer Notes */}
        {!policy.humanApproval && (
          showNotes ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Reviewer Notes (Optional)
              </label>
              <Textarea
                placeholder="Add authorization remarks or justification..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs font-mono min-h-[60px]"
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setShowNotes(true)}
              className="text-xs text-muted-foreground p-0 h-auto"
            >
              + Add reviewer note
            </Button>
          )
        )}
      </CardContent>

      <CardFooter className="pt-2 pb-4 flex items-center justify-between border-t border-amber-200/60 bg-amber-50/60">
        <div className="text-xs text-muted-foreground">
          {policy.humanApproval
            ? `Decided by ${policy.humanApproval.approverName || policy.humanApproval.approverEmail || "Authorized Approver"}${policy.humanApproval.expiresAt ? ` (Expires ${formatDeterministicTime(policy.humanApproval.expiresAt)})` : ""}`
            : "Approving will immediately resume the workflow and create a Razorpay payment order."}
        </div>
        {!policy.humanApproval && (
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleReject}
              disabled={isPending}
              className="gap-1.5"
            >
              {rejectMutation.isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <XCircleIcon className="size-3.5" />
              )}
              Reject Transaction
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
            >
              {approveMutation.isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheckIcon className="size-3.5" />
              )}
              Approve & Execute
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
};
