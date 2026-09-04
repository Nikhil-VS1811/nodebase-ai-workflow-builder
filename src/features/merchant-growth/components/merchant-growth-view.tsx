"use client";

import { useState } from "react";
import {
  TrendingUpIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  PackageIcon,
  DollarSignIcon,
  LayersIcon,
  InfoIcon,
  SearchIcon,
  CheckCircle2Icon,
  TagIcon,
  SlidersIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  PowerIcon,
  AlertTriangleIcon,
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const PRESET_QUERIES = [
  "wireless mouse",
  "mechanical keyboard",
  "docking station",
  "desk mat",
  "noise-cancelling headphones",
  "single monitor arm",
];

export const MerchantGrowthView = () => {
  const [selectedQuery, setSelectedQuery] = useState("wireless mouse");
  const [inputQuery, setInputQuery] = useState("wireless mouse");
  const [togglingKillSwitch, setTogglingKillSwitch] = useState(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const policyQuery = useQuery(trpc.merchantGrowth.getActivePolicy.queryOptions());
  const previewQuery = useQuery(
    trpc.merchantGrowth.getRecommendationPreview.queryOptions({
      query: selectedQuery,
      limit: 5,
    }),
  );

  const setKillSwitchMutation = useMutation(
    trpc.merchantGrowth.setKillSwitch.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.merchantGrowth.getActivePolicy.pathFilter());
        queryClient.invalidateQueries(trpc.merchantGrowth.getRecommendationPreview.pathFilter());
      },
    }),
  );

  const handleToggleKillSwitch = async (checked: boolean) => {
    setTogglingKillSwitch(true);
    try {
      await setKillSwitchMutation.mutateAsync({
        enabled: checked,
        reason: checked ? undefined : "Manual kill-switch override from Merchant Control Center",
      });
    } catch (err) {
      console.error("Failed to toggle kill switch", err);
    } finally {
      setTogglingKillSwitch(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputQuery.trim()) {
      setSelectedQuery(inputQuery.trim());
    }
  };

  const handlePresetClick = (q: string) => {
    setInputQuery(q);
    setSelectedQuery(q);
  };

  const policyData = policyQuery.data;
  const previewData = previewQuery.data;
  const isEnabled = policyData?.isGrowthEnabled ?? true;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <TrendingUpIcon className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Merchant Control Center</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Deterministic growth policy management, strategy decisions, and emergency safety controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 py-1.5 px-3 text-xs flex items-center gap-1.5 font-medium"
          >
            <InfoIcon className="size-3.5" />
            Advisory only — does not authorize or execute payments.
          </Badge>
        </div>
      </div>

      {/* Kill Switch Control Section */}
      <Card
        className={`shadow-none border transition-colors ${
          isEnabled
            ? "border-emerald-500/30 bg-emerald-500/[0.02]"
            : "border-rose-500/40 bg-rose-500/[0.04]"
        }`}
      >
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isEnabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                }`}
              >
                <PowerIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-base">Merchant Growth Kill Switch</h2>
                  <Badge
                    variant="outline"
                    className={`text-xs font-mono font-bold ${
                      isEnabled
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                    }`}
                  >
                    {isEnabled ? "STATUS: ENABLED (ACTIVE)" : "STATUS: DISABLED (PAUSED)"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isEnabled
                    ? "Recommendation engine and commercial proxy weighting are fully active."
                    : "Growth engine is paused. Recommendation generation and growth-driven execution are blocked."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <span className="text-xs font-medium text-muted-foreground">
                {isEnabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                id="merchant-kill-switch"
                checked={isEnabled}
                onCheckedChange={handleToggleKillSwitch}
                disabled={togglingKillSwitch || policyQuery.isLoading}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
          </div>

          {!isEnabled && (
            <div className="mt-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangleIcon className="size-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Merchant Safety Override Active: </span>
                <span>
                  All recommendation calls will return 0 items. Conversational buying turns and execution adapters fail closed with 0 Razorpay calls and 0 PaymentOrders. Policy Gate financial authorization remains unaffected.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 1: Active Merchant Growth Policy & Strategy */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <SlidersIcon className="size-4 text-primary" />
            Active Growth Configuration
          </h2>
          <Badge variant="secondary" className="text-xs font-mono">
            Policy ID: {policyData?.policy.policyId || "mgp_default_balanced"} (v{policyData?.policy.version || "1.0.0"})
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Objective */}
          <Card className="shadow-none border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider">
                Merchant Objective
              </CardDescription>
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span>{policyData?.policy.objective.replace(/_/g, " ") || "BALANCED COMMERCIAL VALUE"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[11px] font-mono">
                {policyData?.policy.objective || "BALANCED_COMMERCIAL_VALUE"}
              </Badge>
            </CardContent>
          </Card>

          {/* Card 2: Strategy */}
          <Card className="shadow-none border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider">
                Strategy Decision
              </CardDescription>
              <CardTitle className="text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <span>{policyData?.strategyDecision.strategy.replace(/_/g, " ") || "BALANCED VALUE"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-mono">
                {policyData?.strategyDecision.strategy || "BALANCED_VALUE"}
              </Badge>
            </CardContent>
          </Card>

          {/* Card 3: Weighting Parameters */}
          <Card className="shadow-none border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider">
                Scoring Weights
              </CardDescription>
              <CardTitle className="text-base font-bold">
                {policyData?.policy.commercialWeight ?? 1.0}x Commercial / {policyData?.policy.availabilityWeight ?? 1.0}x Avail.
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Max Commercial Bonus: +{policyData?.policy.maxCommercialBonus ?? 50} pts
            </CardContent>
          </Card>

          {/* Card 4: Relevance Dominance Guarantee */}
          <Card className="shadow-none border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider">
                Relevance Floor
              </CardDescription>
              <CardTitle className="text-base font-bold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <ShieldCheckIcon className="size-4" />
                Min Score: {policyData?.policy.minRelevanceScore ?? 20}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Relevance strictly dominates commercial score
            </CardContent>
          </Card>
        </div>

        {/* Strategy Rationale Box */}
        {policyData?.strategyDecision.rationale && (
          <div className="p-3.5 rounded-lg bg-muted/50 border border-border/50 text-xs flex items-start gap-2.5">
            <InfoIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <span className="font-semibold text-foreground">Strategy Rationale: </span>
              <span className="text-muted-foreground">{policyData.strategyDecision.rationale}</span>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Recommendation Preview */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <SparklesIcon className="size-4 text-emerald-500" />
              Deterministic Recommendation Preview
            </h2>
            <p className="text-xs text-muted-foreground">
              Live preview evaluated through <code className="text-foreground font-mono">recommendProducts()</code> using trusted catalog and active growth policy.
            </p>
          </div>

          <Badge variant="secondary" className="text-xs self-start sm:self-auto font-mono">
            Active Strategy: {previewData?.activeStrategy || "BALANCED_VALUE"}
          </Badge>
        </div>

        {/* Search Query Bar & Presets */}
        <Card className="shadow-none border-border/60">
          <CardContent className="p-4 space-y-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Enter a shopping query to preview recommendations..."
                  className="pl-9 text-sm"
                  disabled={!isEnabled}
                />
              </div>
              <Button type="submit" size="sm" className="px-4" disabled={!isEnabled}>
                Evaluate
              </Button>
            </form>

            {/* Query Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-[11px] font-medium mr-1">Presets:</span>
              {PRESET_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handlePresetClick(q)}
                  disabled={!isEnabled}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors border ${
                    selectedQuery === q && isEnabled
                      ? "bg-primary text-primary-foreground border-primary font-medium"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/50 disabled:opacity-50"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Results List */}
        {!isEnabled ? (
          <div className="p-8 text-center text-sm text-muted-foreground border border-rose-500/20 bg-rose-500/[0.02] rounded-lg space-y-1.5">
            <AlertTriangleIcon className="size-6 text-rose-500 mx-auto" />
            <p className="font-semibold text-foreground">Recommendations Disabled by Kill Switch</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              The Merchant Growth Kill Switch is currently OFF. Recommendations and automated purchase structuring are paused. Enable the switch above to resume recommendation generation.
            </p>
          </div>
        ) : previewQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg">
            Evaluating recommendation pipeline...
          </div>
        ) : !previewData || previewData.recommendations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg space-y-1">
            <p className="font-medium text-foreground">No recommendations found</p>
            <p className="text-xs">Query "{selectedQuery}" did not match any products in the trusted catalog with minimum relevance score.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground flex items-center justify-between px-1">
              <span>Showing <strong>{previewData.recommendations.length}</strong> deterministic recommendations for "{previewData.query}"</span>
              <span className="font-mono text-[11px]">Tie-break: productId asc</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {previewData.recommendations.map((item, idx) => (
                <Card key={item.productId} className="shadow-none border-border/60 hover:border-border transition-colors">
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-mono bg-muted/30">
                            #{idx + 1}
                          </Badge>
                          <h3 className="font-semibold text-sm sm:text-base text-foreground">
                            {item.name}
                          </h3>
                          <Badge variant="secondary" className="text-[11px]">
                            {item.product.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${
                              item.availability.status === "IN_STOCK"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : item.availability.status === "LOW_STOCK"
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                            }`}
                          >
                            {item.availability.status.replace(/_/g, " ")} ({item.availability.stockCount} left)
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {item.product.description}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-bold text-foreground">
                          ₹{item.price.toLocaleString("en-IN")} {item.currency}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          ID: {item.productId}
                        </div>
                      </div>
                    </div>

                    {/* Score Breakdown Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/40 text-xs">
                      <div className="p-2 rounded bg-muted/30 flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Relevance Score</span>
                        <span className="font-bold text-foreground text-sm">+{item.relevanceScore}</span>
                      </div>
                      <div className="p-2 rounded bg-muted/30 flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Commercial Proxy</span>
                        <span className="font-bold text-foreground text-sm">+{item.commercialScore}</span>
                      </div>
                      <div className="p-2 rounded bg-muted/30 flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Availability Score</span>
                        <span className="font-bold text-foreground text-sm">+{item.availabilityScore}</span>
                      </div>
                      <div className="p-2 rounded bg-primary/5 border border-primary/20 flex flex-col">
                        <span className="text-[10px] text-primary uppercase font-bold">Final Score</span>
                        <span className="font-black text-primary text-sm">{item.finalScore}</span>
                      </div>
                    </div>

                    {/* Transparent Explanations */}
                    <div className="p-3 rounded-md bg-muted/20 border border-border/40 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2Icon className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <span><strong>Relevance:</strong> {item.explanation.relevanceReason}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <PackageIcon className="size-3.5 text-blue-500 mt-0.5 shrink-0" />
                        <span><strong>Availability:</strong> {item.explanation.availabilityReason}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <DollarSignIcon className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span><strong>Commercial:</strong> {item.explanation.commercialReason}</span>
                      </div>
                      <div className="flex items-start gap-1.5 font-medium text-foreground pt-0.5">
                        <ArrowRightIcon className="size-3.5 text-primary mt-0.5 shrink-0" />
                        <span><strong>Ranking Rationale:</strong> {item.explanation.rankingReason}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Safety & Invariant Boundary Verification */}
      <Card className="shadow-none border-border/60 bg-muted/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-emerald-500" />
            Safety & Architectural Boundaries
          </CardTitle>
          <CardDescription className="text-xs">
            Core commerce safety guarantees enforced across the Merchant Control Center and recommendation engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-md border border-border/40 bg-background/60 space-y-1">
            <span className="font-semibold text-foreground block">1. Advisory Only</span>
            <p className="text-muted-foreground text-[11px]">
              Recommendations provide advisory ranking guidance only. They cannot trigger payment orders or call payment gateways.
            </p>
          </div>
          <div className="p-2.5 rounded-md border border-border/40 bg-background/60 space-y-1">
            <span className="font-semibold text-foreground block">2. Invariant Separation</span>
            <p className="text-muted-foreground text-[11px]">
              Recommendation ≠ Growth Strategy ≠ User Acceptance ≠ Authorization ≠ Payment Execution.
            </p>
          </div>
          <div className="p-2.5 rounded-md border border-border/40 bg-background/60 space-y-1">
            <span className="font-semibold text-foreground block">3. Isolated Policy Gate</span>
            <p className="text-muted-foreground text-[11px]">
              Merchant growth policies have zero authority over spending limits, approval thresholds, or transaction execution.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
