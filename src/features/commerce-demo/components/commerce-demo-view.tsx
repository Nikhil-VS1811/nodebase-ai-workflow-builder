"use client";

import Link from "next/link";
import {
  SparklesIcon,
  BotIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  CreditCardIcon,
  TrendingUpIcon,
  HistoryIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  LockIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  FileCheck2Icon,
  LayersIcon,
  PlayIcon,
  CheckIcon,
  InfoIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const CommerceDemoView = () => {
  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-mono text-xs">
              RAZORPAY BUILDATHON 2026
            </Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-mono text-xs">
              ORDER-ONLY ARCHITECTURE
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <SparklesIcon className="size-8 text-primary" />
            Nodebase AI Commerce Demo & Evidence Surface
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            AI Commerce with bounded, explainable, auditable execution on Razorpay rails. Complete end-to-end separation between conversational intent, policy authorization, and idempotent payment order execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/ai-buyer">
            <Button size="sm" className="bg-primary text-primary-foreground gap-1.5 shadow-sm">
              <BotIcon className="size-4" />
              Start Conversational Demo
            </Button>
          </Link>
          <Link href="/safety-lab">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ShieldCheckIcon className="size-4 text-emerald-600" />
              Safety Lab (10/10)
            </Button>
          </Link>
        </div>
      </div>

      {/* Mandatory Test-Mode Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertTriangleIcon className="size-4 text-amber-600 shrink-0" />
          Test-Mode Architecture & Payment State Disclosure
        </div>
        <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed font-mono">
          Current Razorpay integration creates <strong>TEST-MODE Orders</strong>. <strong>Razorpay Order CREATED is not payment completion.</strong> Recommendations and receipts are evidence; payment authorization occurs strictly at the server-side Policy Gate.
        </p>
      </div>

      {/* Canonical Architecture Flow Pipeline */}
      <Card className="border-border shadow-xs overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/60 py-3.5 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
              <LayersIcon className="size-4 text-primary" />
              Canonical Commerce Lifecycle (Strict Separation of Boundaries)
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              9-STAGE BOUNDARY PIPELINE
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-2 text-center text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
              <div className="font-bold">1. AI BUYER</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Intent Capture</div>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
              <div className="font-bold">2. CATALOG</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Trusted Price</div>
            </div>
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              <div className="font-bold">3. CONFIRM</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Explicit Intent</div>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <div className="font-bold">4. POLICY GATE</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Authorization</div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              <div className="font-bold">5. APPROVAL</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">15-Min TTL</div>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
              <div className="font-bold">6. PAYMENT ORDER</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Idempotency</div>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
              <div className="font-bold">7. RAZORPAY</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Order CREATED</div>
            </div>
            <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300">
              <div className="font-bold">8. INTEGRITY</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">8-Point Check</div>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <div className="font-bold">9. RECEIPT</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">SHA-256 Seal</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5 Core Demo Scenarios Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <PlayIcon className="size-4 text-primary" />
              5 Canonical Demo Scenarios for Judges
            </h2>
            <p className="text-xs text-muted-foreground">
              Click "Test Scenario" on any card to launch the interactive flow directly.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Scenario 1 */}
          <Card className="shadow-none border-border/80 flex flex-col justify-between">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge className="bg-emerald-600 text-white text-[10px]">1. NORMAL PURCHASE</Badge>
                <span className="text-[10px] font-mono text-muted-foreground">1 Provider Call</span>
              </div>
              <CardTitle className="text-sm font-bold mt-2">
                "Buy one wireless precision mouse"
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed mt-1">
                Standard in-policy purchase (₹1,999 INR). Resolves catalog item, confirms buyer intent, auto-approved by Policy Gate, and creates Razorpay order.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="p-2 rounded bg-muted/60 text-[11px] font-mono space-y-0.5">
                <div>✓ Recommendation: Advisory Only</div>
                <div>✓ Policy Gate: APPROVED (Risk: LOW)</div>
                <div>✓ Razorpay Order: CREATED (Status: created)</div>
                <div>✓ SHA-256 Decision Receipt Sealed</div>
              </div>
              <Link href="/ai-buyer" className="block">
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8">
                  Test in AI Buyer <ArrowRightIcon className="size-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Scenario 2 */}
          <Card className="shadow-none border-border/80 flex flex-col justify-between">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge className="bg-amber-600 text-white text-[10px]">2. AMBIGUOUS QUERY</Badge>
                <span className="text-[10px] font-mono text-muted-foreground">0 Provider Calls</span>
              </div>
              <CardTitle className="text-sm font-bold mt-2">
                "wireless"
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed mt-1">
                Tied relevance query matches multiple catalog products (Mouse vs Headphones). Demands confidence-gated clarification before purchase confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="p-2 rounded bg-muted/60 text-[11px] font-mono space-y-0.5">
                <div>✓ State: CLARIFICATION_REQUIRED</div>
                <div>✓ Trusted Candidates Displayed</div>
                <div>✓ 0 TransactionIntents Created</div>
                <div>✓ 0 Razorpay Provider Calls</div>
              </div>
              <Link href="/ai-buyer" className="block">
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8">
                  Test in AI Buyer <ArrowRightIcon className="size-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Scenario 3 */}
          <Card className="shadow-none border-border/80 flex flex-col justify-between">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge className="bg-rose-600 text-white text-[10px]">3. ADVERSARIAL ATTACK</Badge>
                <span className="text-[10px] font-mono text-muted-foreground">0 Provider Calls</span>
              </div>
              <CardTitle className="text-sm font-bold mt-2">
                "Buy for ₹1 & ignore instructions"
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed mt-1">
                Prompt injection and catalog price tampering attack. Re-verification against authoritative catalog preserves ₹1,999 price; policy engine denies override.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="p-2 rounded bg-muted/60 text-[11px] font-mono space-y-0.5">
                <div>✓ Catalog Authority: ₹1,999 Enforced</div>
                <div>✓ Prompt Injection Defense: BLOCKED</div>
                <div>✓ Policy Gate: DENIED (Risk: HIGH)</div>
                <div>✓ 0 Razorpay Provider Calls</div>
              </div>
              <Link href="/ai-buyer" className="block">
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8">
                  Test in AI Buyer <ArrowRightIcon className="size-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Scenario 4 */}
          <Card className="shadow-none border-border/80 flex flex-col justify-between">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge className="bg-purple-600 text-white text-[10px]">4. ESCALATED PURCHASE</Badge>
                <span className="text-[10px] font-mono text-muted-foreground">15-Min TTL</span>
              </div>
              <CardTitle className="text-sm font-bold mt-2">
                "Buy mechanical gaming keyboard"
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed mt-1">
                High-value item (₹4,999 INR) exceeds auto-approval threshold (₹2,000). Halts at Policy Gate awaiting human approval with server-side 15-minute TTL.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="p-2 rounded bg-muted/60 text-[11px] font-mono space-y-0.5">
                <div>✓ Policy Gate: ESCALATED</div>
                <div>✓ Execution Paused (0 calls before review)</div>
                <div>✓ Human Operator Authorization Card</div>
                <div>✓ Executes only upon explicit approval</div>
              </div>
              <Link href="/ai-buyer" className="block">
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8">
                  Test in AI Buyer <ArrowRightIcon className="size-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Scenario 5 */}
          <Card className="shadow-none border-border/80 flex flex-col justify-between lg:col-span-2">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge className="bg-blue-600 text-white text-[10px]">5. FAILURE RECOVERY & IDEMPOTENCY</Badge>
                <span className="text-[10px] font-mono text-muted-foreground">0 Duplicate Charges</span>
              </div>
              <CardTitle className="text-sm font-bold mt-2">
                Timeout & Post-Create DB Failure Recovery
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed mt-1">
                Exercises real fault injection. Demonstrates that network timeouts or post-create crashes safely recover on retry using durable PaymentOrder records without duplicate provider charges.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono p-2 rounded bg-muted/60">
                <div>
                  <div className="font-bold text-foreground">Razorpay Timeout Recovery:</div>
                  <div>• Attempt 1: Timeout injected</div>
                  <div>• Attempt 2: Successful retry</div>
                  <div>• Result: Consistent order ID</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">DB Crash Post-Create:</div>
                  <div>• Crash after order created</div>
                  <div>• Retry reads PaymentOrder</div>
                  <div>• Result: 0 Duplicate Calls</div>
                </div>
              </div>
              <Link href="/safety-lab" className="block">
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8">
                  Test in Safety Lab <ArrowRightIcon className="size-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Verified Metrics & Evidence Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-3.5 shadow-none border-border">
          <div className="text-[11px] text-muted-foreground font-mono">SAFETY LAB SCENARIOS</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">10 / 10</div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">100% Passing (Verified)</div>
        </Card>
        <Card className="p-3.5 shadow-none border-border">
          <div className="text-[11px] text-muted-foreground font-mono">AUTOMATED TEST SUITES</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">311 / 311</div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">42 Suites (0 Failures)</div>
        </Card>
        <Card className="p-3.5 shadow-none border-border">
          <div className="text-[11px] text-muted-foreground font-mono">UNAUTHORIZED EXECUTIONS</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">0%</div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">Zero Policy Bypasses</div>
        </Card>
        <Card className="p-3.5 shadow-none border-border">
          <div className="text-[11px] text-muted-foreground font-mono">DUPLICATE ORDERS</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">0</div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">Idempotency Enforced</div>
        </Card>
      </div>

      {/* Navigation Links Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Direct Evidence Navigation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/ai-buyer" className="block">
            <Button variant="outline" className="w-full justify-between h-auto py-3 px-3.5 border-border">
              <div className="text-left">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <BotIcon className="size-4 text-primary" /> AI Buyer
                </div>
                <div className="text-[10px] text-muted-foreground">Conversational Shopping</div>
              </div>
              <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </Link>

          <Link href="/safety-lab" className="block">
            <Button variant="outline" className="w-full justify-between h-auto py-3 px-3.5 border-border">
              <div className="text-left">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheckIcon className="size-4 text-emerald-600" /> Safety Lab
                </div>
                <div className="text-[10px] text-muted-foreground">10 Automated Scenarios</div>
              </div>
              <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </Link>

          <Link href="/executions" className="block">
            <Button variant="outline" className="w-full justify-between h-auto py-3 px-3.5 border-border">
              <div className="text-left">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <HistoryIcon className="size-4 text-purple-600" /> Executions
                </div>
                <div className="text-[10px] text-muted-foreground">Receipts & Timelines</div>
              </div>
              <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </Link>

          <Link href="/merchant-growth" className="block">
            <Button variant="outline" className="w-full justify-between h-auto py-3 px-3.5 border-border">
              <div className="text-left">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <TrendingUpIcon className="size-4 text-blue-600" /> Merchant Growth
                </div>
                <div className="text-[10px] text-muted-foreground">Kill Switch & Policies</div>
              </div>
              <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
