"use client";

import { ExecutionStatus } from "@/generated/prisma";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSuspenseExecution } from "@/features/executions/hooks/use-executions";
import { HumanApprovalCard } from "./human-approval-card";
import { DecisionReceiptCard } from "./decision-receipt-card";
import { DecisionExplanationCard } from "./decision-explanation-card";
import { ExecutionTimelineCard } from "./execution-timeline-card";
import { CounterfactualReplayCard } from "./counterfactual-replay-card";
import { AgenticCommerceLifecycleCard } from "./agentic-commerce-lifecycle-card";
import { buildDecisionReceipt, type DecisionReceipt, type DecisionReceiptPayload } from "@/lib/decisionReceipt";

const getStatusIcon = (status: ExecutionStatus) => {
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return <CheckCircle2Icon className="size-5 text-green-600" />;
    case ExecutionStatus.FAILED:
      return <XCircleIcon className="size-5 text-red-600" />;
    case ExecutionStatus.RUNNING:
      return <Loader2Icon className="size-5 text-blue-600 animate-spin" />;
    case ExecutionStatus.PENDING_APPROVAL:
      return <AlertTriangleIcon className="size-5 text-amber-600" />;
    default:
      return <ClockIcon className="size-5 text-muted-foreground" />;
  }
};

const formatStatus = (status: ExecutionStatus) => {
  if (status === ExecutionStatus.PENDING_APPROVAL) {
    return "Pending Approval";
  }
  return status.charAt(0) + status.slice(1).toLowerCase();
};

export const ExecutionView = ({
  executionId,
}: { 
  executionId: string;
}) => {
  const { data: execution } = useSuspenseExecution(executionId);
  const [showStackTrace, setShowStackTrace] = useState(false);

  const duration = execution.completedAt
    ? Math.round(
        (new Date(execution.completedAt).getTime() -
          new Date(execution.startedAt).getTime()) /
          1000,
      )
    : null;

  // Robust context parsing from JSON string or object
  const parseContext = (raw: unknown): Record<string, unknown> => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    if (typeof raw === "object" && raw !== null) {
      return raw as Record<string, unknown>;
    }
    return {};
  };

  const executionContext = parseContext(execution.output);

  const isPendingApproval =
    execution.status === ExecutionStatus.PENDING_APPROVAL ||
    (execution.status as string) === "PENDING_APPROVAL" ||
    executionContext.__pendingApproval === true ||
    ((executionContext.policyEvaluation as any)?.decision === "ESCALATED" &&
      !(executionContext.policyEvaluation as any)?.humanApproval?.approved);

  const hasCommerceData =
    Boolean((execution as any).decisionReceipt) ||
    Boolean(executionContext.decisionReceipt) ||
    Boolean(executionContext.transactionIntent) ||
    Boolean(executionContext.policyEvaluation);

  const rawReceipt =
    ((execution as any).decisionReceipt as DecisionReceipt) ||
    ((executionContext.decisionReceipt as any) as DecisionReceipt);

  const effectiveReceipt: DecisionReceipt | null =
    rawReceipt
      ? {
          ...rawReceipt,
          id: (rawReceipt.payload as any)?.receiptId || rawReceipt.id,
          payload: (typeof rawReceipt.payload === "string" ? JSON.parse(rawReceipt.payload) : rawReceipt.payload) as DecisionReceiptPayload,
        }
      : hasCommerceData
        ? buildDecisionReceipt({
            executionId: execution.id,
            workflowId: execution.workflowId,
            context: executionContext,
            finalOutcome: {
              status: execution.status as any,
              completedAt: execution.completedAt ? new Date(execution.completedAt).toISOString() : new Date().toISOString(),
            },
          })
        : null;

  return (
    <div className="space-y-6">
      {/* Prominent Human Approval Interface when transaction is escalated */}
      {isPendingApproval && (
        <HumanApprovalCard
          executionId={execution.id}
          context={executionContext}
        />
      )}

      {/* Tamper-Evident Commerce Decision Receipt */}
      {hasCommerceData && (
        <>
          <AgenticCommerceLifecycleCard
            executionId={execution.id}
            status={execution.status}
            context={executionContext}
            receipt={effectiveReceipt}
            error={execution.error}
          />
          <DecisionExplanationCard
            receipt={effectiveReceipt}
            context={executionContext}
            status={execution.status}
            error={execution.error}
          />
          <DecisionReceiptCard
            receipt={effectiveReceipt}
            context={executionContext}
            executionId={execution.id}
            workflowId={execution.workflowId}
            status={execution.status}
            completedAt={execution.completedAt}
          />
          <ExecutionTimelineCard
            executionId={execution.id}
            workflowId={execution.workflowId}
            status={execution.status}
            startedAt={execution.startedAt}
            completedAt={execution.completedAt}
            error={execution.error}
            context={executionContext}
            receipt={effectiveReceipt}
          />
          <CounterfactualReplayCard
            context={executionContext}
            receipt={effectiveReceipt}
            status={execution.status}
          />
        </>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <div className="flex items-center gap-3">
            {getStatusIcon(execution.status)}
            <div>
              <CardTitle>{formatStatus(execution.status)}</CardTitle>
              <CardDescription>
                Execution for {execution.workflow.name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Workflow
              </p>
              <Link
                prefetch
                className="text-sm hover:underline text-primary"
                href={`/workflows/${execution.workflowId}`}
              >
                {execution.workflow.name}
              </Link>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="text-sm">{formatStatus(execution.status)}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Started</p>
              <p className="text-sm">
                {formatDistanceToNow(execution.startedAt, { addSuffix: true })}
              </p>
            </div>

            {execution.completedAt ? (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Completed
                </p>
                <p className="text-sm">
                  {formatDistanceToNow(execution.completedAt, {
                    addSuffix: true,
                  })}
                </p>
              </div>
            ) : null}

            {duration !== null ? (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Duration
                </p>
                <p className="text-sm">{duration}s</p>
              </div>
            ) : null}

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Event ID
              </p>
              <p className="text-sm">{execution.inngestEventId}</p>
            </div>
          </div>

          {execution.error && (
            <div className="mt-6 p-4 bg-red-50 rounded-md space-y-3">
              <div>
                <p className="text-sm font-medium text-red-900 mb-2">Error</p>
                <p className="text-sm text-red-800 font-mono">
                  {execution.error}
                </p>
              </div>

              {execution.errorStack && (
                <Collapsible
                  open={showStackTrace}
                  onOpenChange={setShowStackTrace}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-900 hover:bg-red-100"
                    >
                      {showStackTrace ? "Hide stack trace" : "Show stack trace"}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="text-xs font-mono text-red-800 overflow-auto mt-2 p-2 bg-red-100">
                      {execution.errorStack}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {execution.output && (
            <div className="mt-6 p-4 bg-muted rounded-md">
              <p className="text-sm font-medium mb-2">Output</p>
              <pre className="text-xs font-mono overflow-auto">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
