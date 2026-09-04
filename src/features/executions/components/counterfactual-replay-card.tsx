"use client";

import { useState, useMemo } from "react";
import {
  FlaskConicalIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  AlertTriangleIcon,
  XCircleIcon,
  CheckCircle2Icon,
  InfoIcon,
  ArrowRightIcon,
  SlidersIcon,
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
import { Button } from "@/components/ui/button";
import {
  replayCounterfactualPolicy,
  PREDEFINED_SCENARIOS,
  type CounterfactualScenarioKey,
} from "@/lib/counterfactualReplay";
import type { PolicyDecision } from "@/lib/policyEngine";
import type { DecisionReceipt } from "@/lib/decisionReceipt";

interface CounterfactualReplayCardProps {
  context: Record<string, unknown>;
  receipt?: DecisionReceipt | null;
  status: string;
}

export const CounterfactualReplayCard = ({
  context,
  receipt,
  status,
}: CounterfactualReplayCardProps) => {
  const [selectedScenario, setSelectedScenario] = useState<CounterfactualScenarioKey>("STRICT_THRESHOLD_1000");

  const intent = (context.transactionIntent ||
    context.intent ||
    receipt?.payload.transactionIntent ||
    {}) as Record<string, any>;

  const actualPolicyDecision: PolicyDecision | null =
    (context.policyEvaluation as any)?.decision ||
    receipt?.payload.policyDecision.decision ||
    (status === "PENDING_APPROVAL" ? "ESCALATED" : status === "SUCCESS" ? "APPROVED" : "DENIED");

  const simulationResult = useMemo(() => {
    return replayCounterfactualPolicy({
      transactionIntent: intent,
      scenarioKey: selectedScenario,
      originalDecision: actualPolicyDecision,
    });
  }, [intent, selectedScenario, actualPolicyDecision]);

  const actualVariant =
    actualPolicyDecision === "APPROVED"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      : actualPolicyDecision === "ESCALATED"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-rose-500/10 text-rose-600 border-rose-500/30";

  const counterfactualVariant =
    simulationResult.counterfactualDecision === "APPROVED"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      : simulationResult.counterfactualDecision === "ESCALATED"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-rose-500/10 text-rose-600 border-rose-500/30";

  const hasDecisionChanged = actualPolicyDecision !== simulationResult.counterfactualDecision;

  return (
    <Card className="border-indigo-500/30 bg-gradient-to-b from-indigo-50/20 to-background shadow-xs overflow-hidden">
      {/* Header */}
      <CardHeader className="bg-indigo-50/40 border-b border-indigo-500/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
              <FlaskConicalIcon className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Counterfactual Policy Replay
                <Badge variant="outline" className="text-xs font-mono border-indigo-400 bg-white dark:bg-background">
                  SIMULATION ONLY
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Simulate what the Policy Gate decision would be under different governance thresholds.
              </CardDescription>
            </div>
          </div>

          <Badge variant="outline" className="text-xs font-mono self-start sm:self-auto bg-background/80">
            Amount: ₹{simulationResult.simulatedTransaction.amount.toLocaleString("en-IN")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5 text-sm">
        {/* Mandatory Simulation Disclaimer */}
        <div className="p-3 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-800 dark:text-indigo-300 flex items-start gap-2">
          <InfoIcon className="size-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Pure Simulation Notice: </span>
            <span>
              Simulation only — does not authorize, approve, or execute payments. Does not modify the active production policy or original transaction receipt.
            </span>
          </div>
        </div>

        {/* Scenario Selector Chips */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
            Select Governance Scenario:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PREDEFINED_SCENARIOS.map((scenario) => {
              const isSelected = selectedScenario === scenario.key;
              return (
                <button
                  key={scenario.key}
                  type="button"
                  onClick={() => setSelectedScenario(scenario.key)}
                  className={`text-left p-2.5 rounded-lg border transition-all text-xs space-y-1 ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs font-medium"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>{scenario.name}</span>
                    {isSelected && <Badge variant="secondary" className="text-[10px] py-0">Active</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {scenario.deltaSummary}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Comparison Board */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Actual Decision Card */}
          <div className="p-4 rounded-lg border bg-card/60 space-y-2 text-xs">
            <span className="text-muted-foreground uppercase text-[11px] font-semibold block">
              1. Actual Production Decision
            </span>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className={`font-mono text-sm font-bold px-3 py-1 ${actualVariant}`}>
                {actualPolicyDecision || "UNKNOWN"}
              </Badge>
              <span className="text-muted-foreground text-[11px]">
                Threshold: ₹2,000 / tx
              </span>
            </div>
            <p className="text-muted-foreground text-[11px] pt-1">
              Historical outcome recorded in tamper-evident Decision Receipt.
            </p>
          </div>

          {/* Counterfactual Simulated Decision Card */}
          <div className="p-4 rounded-lg border bg-card/60 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground uppercase text-[11px] font-semibold block">
                2. Counterfactual Simulation Decision
              </span>
              {hasDecisionChanged ? (
                <Badge variant="secondary" className="text-[10px] text-primary font-semibold">
                  OUTCOME CHANGED
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  UNCHANGED
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className={`font-mono text-sm font-bold px-3 py-1 ${counterfactualVariant}`}>
                {simulationResult.counterfactualDecision}
              </Badge>
              <span className="text-muted-foreground text-[11px]">
                Threshold: ₹{simulationResult.appliedPolicyConfig.approval.require_human_above.toLocaleString("en-IN")}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px] pt-1">
              Simulated under: <strong>{simulationResult.scenarioName}</strong>
            </p>
          </div>
        </div>

        {/* "What Changed" Analysis Box */}
        <div className="p-3.5 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <ArrowRightIcon className="size-3.5 text-primary shrink-0" />
            What Changed? (Comparative Analysis)
          </div>
          <p className="text-muted-foreground font-mono text-[11px] leading-relaxed">
            {simulationResult.whatChanged}
          </p>
        </div>

        {/* Policy Threshold Breakdown */}
        <div className="p-3 rounded-lg border bg-card/40 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
          <div>
            <span className="text-[10px] uppercase block font-medium">Auto-Approve Below:</span>
            <strong className="text-foreground">₹{simulationResult.appliedPolicyConfig.approval.auto_approve_below.toLocaleString("en-IN")}</strong>
          </div>
          <div>
            <span className="text-[10px] uppercase block font-medium">Require Human Above:</span>
            <strong className="text-foreground">₹{simulationResult.appliedPolicyConfig.approval.require_human_above.toLocaleString("en-IN")}</strong>
          </div>
          <div>
            <span className="text-[10px] uppercase block font-medium">Per-Tx Max Limit:</span>
            <strong className="text-foreground">₹{simulationResult.appliedPolicyConfig.limits.per_transaction.toLocaleString("en-IN")}</strong>
          </div>
          <div>
            <span className="text-[10px] uppercase block font-medium">Daily Spend Cap:</span>
            <strong className="text-foreground">₹{simulationResult.appliedPolicyConfig.limits.daily_cap.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
