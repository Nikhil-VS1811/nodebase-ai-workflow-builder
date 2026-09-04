"use client";

import { useMemo } from "react";
import {
  SparklesIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  UserCheckIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  FileCheck2Icon,
  FileTextIcon,
  XCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  LockIcon,
  ArrowRightIcon,
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
  deriveCommerceLifecycle,
  type CommerceActionStage,
  type LifecycleStageStatus,
} from "@/lib/agenticCommerceContract";
import type { DecisionReceipt } from "@/lib/decisionReceipt";

interface AgenticCommerceLifecycleCardProps {
  executionId: string;
  status: string;
  context: Record<string, unknown>;
  receipt?: DecisionReceipt | null;
  error?: string | null;
}

const getStageIcon = (stage: CommerceActionStage, status: LifecycleStageStatus) => {
  if (status === "DENIED" || status === "BLOCKED") {
    return <XCircleIcon className="size-4 text-rose-600" />;
  }
  if (status === "ESCALATED" || status === "REQUIRED") {
    return <AlertTriangleIcon className="size-4 text-amber-600" />;
  }
  if (status === "NOT_REACHED") {
    return <div className="size-2 rounded-full bg-muted-foreground/40" />;
  }

  switch (stage) {
    case "DISCOVER":
      return <SparklesIcon className="size-4 text-blue-600 dark:text-blue-400" />;
    case "CLARIFY":
      return <HelpCircleIcon className="size-4 text-indigo-600 dark:text-indigo-400" />;
    case "ACCEPT":
      return <UserCheckIcon className="size-4 text-cyan-600 dark:text-cyan-400" />;
    case "AUTHORIZE":
      return <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />;
    case "EXECUTE":
      return <CreditCardIcon className="size-4 text-purple-600 dark:text-purple-400" />;
    case "VERIFY":
      return <FileCheck2Icon className="size-4 text-teal-600 dark:text-teal-400" />;
    case "RECEIPT":
      return <FileTextIcon className="size-4 text-emerald-600 dark:text-emerald-400" />;
    default:
      return <CheckCircle2Icon className="size-4 text-primary" />;
  }
};

const getStatusBadge = (status: LifecycleStageStatus, label: string) => {
  switch (status) {
    case "COMPLETED":
    case "CONFIRMED":
    case "APPROVED":
    case "VERIFIED":
    case "SEALED":
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono font-semibold">
          {label}
        </Badge>
      );
    case "PASSED":
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-mono">
          {label}
        </Badge>
      );
    case "REQUIRED":
    case "ESCALATED":
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-mono font-semibold">
          {label}
        </Badge>
      );
    case "DENIED":
    case "BLOCKED":
      return (
        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-mono font-semibold">
          {label}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[10px] font-mono text-muted-foreground">
          {label}
        </Badge>
      );
  }
};

export const AgenticCommerceLifecycleCard = ({
  executionId,
  status,
  context,
  receipt,
  error,
}: AgenticCommerceLifecycleCardProps) => {
  const lifecycle = useMemo(() => {
    return deriveCommerceLifecycle({
      executionId,
      status,
      context,
      receipt,
      error,
    });
  }, [executionId, status, context, receipt, error]);

  const isPendingEscalation =
    status === "PENDING_APPROVAL" ||
    (lifecycle.isEscalated && !lifecycle.isExecuted && !lifecycle.isDenied && status !== "SUCCESS");

  return (
    <Card className="border-teal-500/30 bg-gradient-to-b from-teal-50/15 to-background shadow-xs overflow-hidden">
      {/* Header */}
      <CardHeader className="bg-teal-50/30 dark:bg-teal-950/20 border-b border-teal-500/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700">
              <LockIcon className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Agentic Commerce Lifecycle
                <Badge variant="outline" className="text-xs font-mono border-teal-400 bg-white dark:bg-background">
                  7-STAGE CONTRACT
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                DISCOVER → CLARIFY → ACCEPT → AUTHORIZE → EXECUTE → VERIFY → RECEIPT
              </CardDescription>
            </div>
          </div>

          <Badge
            className={`text-xs font-semibold px-3 py-1 ${
              lifecycle.isDenied
                ? "bg-rose-600 text-white"
                : isPendingEscalation
                  ? "bg-amber-600 text-white"
                  : "bg-emerald-600 text-white"
            }`}
          >
            {lifecycle.isDenied
              ? "LIFECYCLE: DENIED"
              : isPendingEscalation
                ? "LIFECYCLE: ESCALATED"
                : "LIFECYCLE: COMPLETE"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6 text-sm">
        {/* Horizontal Mini-Stepper Bar */}
        <div className="grid grid-cols-7 gap-1 bg-muted/40 p-1.5 rounded-lg border border-border/50 text-[10px] font-mono text-center">
          {lifecycle.stages.map((st) => (
            <div
              key={st.stage}
              className={`py-1 rounded px-1 truncate transition-colors ${
                st.status === "COMPLETED" || st.status === "APPROVED" || st.status === "CONFIRMED" || st.status === "VERIFIED" || st.status === "SEALED" || st.status === "PASSED"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                  : st.status === "ESCALATED" || st.status === "REQUIRED"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                    : st.status === "DENIED" || st.status === "BLOCKED"
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold"
                      : "text-muted-foreground opacity-60"
              }`}
            >
              {st.stage}
            </div>
          ))}
        </div>

        {/* Vertical Detailed Stages */}
        <div className="relative pl-6 space-y-5 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
          {lifecycle.stages.map((stageItem) => (
            <div key={stageItem.stage} className="relative group">
              {/* Stage Node Icon */}
              <div className="absolute -left-[27px] top-0 size-6 rounded-full bg-background border border-border flex items-center justify-center shadow-xs">
                {getStageIcon(stageItem.stage, stageItem.status)}
              </div>

              {/* Stage Content Card */}
              <div className="p-3 rounded-lg border bg-card/60 hover:bg-card transition-colors space-y-1 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {stageItem.title}
                  </span>
                  {getStatusBadge(stageItem.status, stageItem.statusLabel)}
                </div>

                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  {stageItem.description}
                </p>

                {stageItem.details && stageItem.details.length > 0 && (
                  <div className="pt-1 border-t border-border/40 mt-1 space-y-0.5">
                    <ul className="list-disc list-inside text-[10px] text-muted-foreground font-mono space-y-0.5">
                      {stageItem.details.map((detail, dIdx) => (
                        <li key={dIdx}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Mandatory Safety Boundary Disclaimers */}
        <div className="p-3.5 rounded-lg bg-muted/40 border border-border/50 text-[11px] text-muted-foreground space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
            <InfoIcon className="size-3.5 text-primary shrink-0" />
            Safety Boundary Invariants
          </div>
          <ul className="list-disc list-inside space-y-1 font-mono text-[10.5px]">
            {lifecycle.safetyNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
