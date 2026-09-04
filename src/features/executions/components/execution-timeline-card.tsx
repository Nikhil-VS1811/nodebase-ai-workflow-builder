"use client";

import { useMemo } from "react";
import {
  HistoryIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  XCircleIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  CreditCardIcon,
  LockIcon,
  CpuIcon,
  ShoppingCartIcon,
  FileTextIcon,
  ArrowDownIcon,
  CheckIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildExecutionTimeline,
  type TimelineEvent,
  type TimelineStageType,
  type TimelineEventStatus,
} from "@/lib/executionTimeline";
import { formatDeterministicTime } from "@/lib/agenticCommerceContract";
import type { DecisionReceipt } from "@/lib/decisionReceipt";

interface ExecutionTimelineCardProps {
  executionId: string;
  workflowId?: string;
  status: string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  error?: string | null;
  context: Record<string, unknown>;
  receipt?: DecisionReceipt | null;
}

const getStageIcon = (stage: TimelineStageType, status: TimelineEventStatus) => {
  if (status === "FAILED" || status === "DENIED" || status === "REJECTED") {
    return <XCircleIcon className="size-4 text-rose-600" />;
  }
  if (status === "PENDING" || status === "ESCALATED") {
    return <AlertTriangleIcon className="size-4 text-amber-600" />;
  }

  switch (stage) {
    case "USER_INTENT":
      return <CpuIcon className="size-4 text-blue-600 dark:text-blue-400" />;
    case "AI_BUYER_INTENT":
      return <ShoppingCartIcon className="size-4 text-indigo-600 dark:text-indigo-400" />;
    case "CATALOG_RESOLUTION":
      return <LockIcon className="size-4 text-cyan-600 dark:text-cyan-400" />;
    case "POLICY_EVALUATION":
      return <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />;
    case "HUMAN_APPROVAL_REQUIRED":
    case "HUMAN_APPROVAL_DECISION":
      return <UserCheckIcon className="size-4 text-amber-600 dark:text-amber-400" />;
    case "PAYMENT_ORDER":
    case "RAZORPAY_ORDER_CREATED":
      return <CreditCardIcon className="size-4 text-purple-600 dark:text-purple-400" />;
    case "DECISION_RECEIPT":
    case "INTEGRITY_VERIFICATION":
      return <FileTextIcon className="size-4 text-emerald-600 dark:text-emerald-400" />;
    case "FINAL_OUTCOME":
      return <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />;
    default:
      return <CheckIcon className="size-4 text-primary" />;
  }
};

const getStatusBadge = (status: TimelineEventStatus) => {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono font-semibold">
          {status}
        </Badge>
      );
    case "PENDING":
    case "ESCALATED":
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-mono font-semibold">
          {status}
        </Badge>
      );
    case "DENIED":
    case "REJECTED":
    case "FAILED":
      return (
        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-mono font-semibold">
          {status}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[10px] font-mono">
          {status}
        </Badge>
      );
  }
};

export const ExecutionTimelineCard = ({
  executionId,
  workflowId,
  status,
  startedAt,
  completedAt,
  error,
  context,
  receipt,
}: ExecutionTimelineCardProps) => {
  const timeline = useMemo(() => {
    return buildExecutionTimeline({
      executionId,
      workflowId,
      status,
      startedAt,
      completedAt,
      error,
      context,
      receipt,
    });
  }, [executionId, workflowId, status, startedAt, completedAt, error, context, receipt]);

  return (
    <Card className="border-border/70 shadow-xs overflow-hidden">
      {/* Timeline Header */}
      <CardHeader className="bg-muted/20 border-b border-border/50 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <HistoryIcon className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Execution Timeline
                <Badge variant="secondary" className="text-xs font-mono font-normal">
                  {timeline.events.length} Stages
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Chronological lifecycle progression of this commerce transaction.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              Execution ID: {executionId.slice(0, 12)}...
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 pb-6">
        <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
          {timeline.events.map((event, idx) => {
            const isLast = idx === timeline.events.length - 1;

            return (
              <div key={event.id} className="relative group">
                {/* Node Icon on Vertical Track */}
                <div className="absolute -left-[27px] top-0 size-6 rounded-full bg-background border border-border flex items-center justify-center shadow-xs">
                  {getStageIcon(event.stage, event.status)}
                </div>

                {/* Event Content Box */}
                <div className="p-3.5 rounded-lg border bg-card/60 hover:bg-card transition-colors space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-foreground">
                        {idx + 1}. {event.title}
                      </span>
                      {getStatusBadge(event.status)}
                    </div>

                    {/* Timestamp (ONLY rendered if genuine timestamp exists in real data) */}
                    {event.timestamp && (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                        <ClockIcon className="size-3 text-muted-foreground" />
                        <span>{formatDeterministicTime(event.timestamp)}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {event.description}
                  </p>

                  {/* Bulleted Specific Details if present */}
                  {event.details && event.details.length > 0 && (
                    <div className="pt-1 border-t border-border/40 mt-1.5 space-y-0.5">
                      <ul className="list-disc list-inside text-[11px] text-muted-foreground font-mono space-y-0.5">
                        {event.details.map((detail, dIdx) => (
                          <li key={dIdx}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
