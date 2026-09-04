"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BotIcon,
  HelpCircleIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  Loader2Icon,
  RefreshCwIcon,
  SendIcon,
  ExternalLinkIcon,
  CheckIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { BuyerConversationState } from "@/lib/conversationalBuyer";
import type { CommercePipelineResult } from "@/lib/commercePipeline";
import {
  loadBuyerSession,
  saveBuyerSession,
  clearBuyerSession,
  type StoredChatMessage,
} from "@/features/ai-buyer/lib/sessionStorage";

type ChatMessage = StoredChatMessage;

export const AiBuyerView = () => {
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentState, setCurrentState] = useState<BuyerConversationState | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const trpc = useTRPC();
  const { data: presets } = useQuery(trpc.aiBuyer.getPresets.queryOptions());
  const interactMutation = useMutation(trpc.aiBuyer.interact.mutationOptions());
  const executeMutation = useMutation(trpc.aiBuyer.executeTransaction.mutationOptions());

  // Hydrate conversation session from sessionStorage on mount
  useEffect(() => {
    const saved = loadBuyerSession();
    if (saved && saved.messages.length > 0) {
      setMessages(saved.messages);
      setCurrentState(saved.currentState);
    }
    setIsHydrated(true);
  }, []);

  // Persist conversation session to sessionStorage on state updates
  useEffect(() => {
    if (!isHydrated) return;
    if (messages.length > 0) {
      saveBuyerSession({ messages, currentState });
    }
  }, [messages, currentState, isHydrated]);

  const handleSendMessage = async (textToSend?: string) => {
    const message = (textToSend || inputMessage).trim();
    if (!message) return;

    const userMsgId = `user_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: message,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");

    try {
      const response = await interactMutation.mutateAsync({
        message,
        state: currentState || undefined,
      });

      const nextState = response.state;
      setCurrentState(nextState);

      const assistantMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: "assistant",
        text: nextState.message,
        timestamp: new Date().toLocaleTimeString(),
        state: nextState,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: "assistant",
        text: `Error processing request: ${err.message || "Unknown error"}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleSelectCandidate = async (candidateName: string) => {
    await handleSendMessage(candidateName);
  };

  const handleConfirmPurchase = async () => {
    await handleSendMessage("yes");
  };

  const handleExecuteTransaction = async (state: BuyerConversationState) => {
    if (!state.transactionIntent) return;
    setIsExecuting(true);

    try {
      const result = await executeMutation.mutateAsync({
        transactionIntent: state.transactionIntent,
      });

      const execMessage: ChatMessage = {
        id: `exec_${Date.now()}`,
        sender: "assistant",
        text: `Execution completed with status: ${result.status}`,
        timestamp: new Date().toLocaleTimeString(),
        executionResult: result,
      };

      setMessages((prev) => [...prev, execMessage]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_exec_${Date.now()}`,
        sender: "assistant",
        text: `Execution error: ${err.message || "Failed to execute"}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReset = () => {
    clearBuyerSession();
    setMessages([]);
    setCurrentState(null);
    setInputMessage("");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <BotIcon className="size-7 text-primary" />
            AI Conversational Buyer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deterministic product recommendations, confidence-gated clarification, explicit confirmation, and safe Policy Gate execution.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="self-start md:self-auto gap-1.5">
          <RefreshCwIcon className="size-3.5" />
          Reset Conversation
        </Button>
      </div>

      {/* Safety Invariants Callout */}
      <div className="p-3.5 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono font-medium text-foreground">
          <ShieldCheckIcon className="size-4 text-emerald-600 shrink-0" />
          RECOMMENDATION ≠ CLARIFICATION ≠ ACCEPTANCE ≠ AUTHORIZATION ≠ PAYMENT EXECUTION
        </div>
        <Badge variant="outline" className="text-[10px] font-mono border-primary/30">
          STRICT SEPARATION ENFORCED
        </Badge>
      </div>

      {/* Demo Presets Grid */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Demo Scenarios for Judges
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets?.map((preset: { id: string; title: string; prompt: string; description: string }) => (
            <Card
              key={preset.id}
              className="cursor-pointer hover:border-primary/50 transition-colors shadow-none bg-card/60 hover:bg-card"
              onClick={() => handleSendMessage(preset.prompt)}
            >
              <CardHeader className="p-3.5 pb-2">
                <CardTitle className="text-xs font-bold flex items-center justify-between">
                  {preset.title}
                  <ArrowRightIcon className="size-3 text-muted-foreground" />
                </CardTitle>
                <CardDescription className="text-[11px] line-clamp-2 mt-0.5">
                  {preset.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3.5 pt-0">
                <code className="text-[10px] bg-muted/70 px-1.5 py-0.5 rounded text-foreground font-mono block truncate">
                  "{preset.prompt}"
                </code>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Main Chat Interface */}
      <Card className="shadow-xs overflow-hidden border-border/80">
        <CardHeader className="bg-muted/20 border-b border-border/60 py-3.5 px-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold font-mono">AI BUYER SESSION (IN-POLICY CATALOG)</span>
          </div>
          {currentState && (
            <Badge variant="outline" className="text-[11px] font-mono">
              STATE: {currentState.state}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-4 space-y-4 min-h-[350px] max-h-[550px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-muted-foreground space-y-2">
              <BotIcon className="size-10 text-muted-foreground/40 stroke-1" />
              <p className="text-sm font-medium">Ask the AI Buyer what you want to purchase</p>
              <p className="text-xs max-w-sm">
                Click one of the demo presets above or type a natural language shopping request below.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"} space-y-2`}
              >
                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted/70 border border-border text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                  <span className="text-[10px] opacity-60 block mt-1 text-right">
                    {msg.timestamp}
                  </span>
                </div>

                {/* State Card: CLARIFICATION_REQUIRED */}
                {msg.state?.state === "CLARIFICATION_REQUIRED" && msg.state.clarification && (
                  <Card className="w-full max-w-[85%] border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/20 shadow-none">
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-xs">
                        <HelpCircleIcon className="size-4 shrink-0" />
                        Clarification required before purchase confirmation.
                      </div>
                      <CardDescription className="text-[11px] text-muted-foreground">
                        {msg.state.clarification.reason}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-2">
                      <div className="text-[11px] font-medium text-foreground">Select a candidate product:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.state.clarification.candidateProducts.map((cand, idx) => (
                          <Button
                            key={cand.productId}
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectCandidate(cand.name)}
                            className="text-left justify-between h-auto py-2 px-3 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          >
                            <div>
                              <div className="font-semibold">{idx + 1}. {cand.name}</div>
                              <div className="text-[10px] text-muted-foreground">₹{cand.price.toLocaleString("en-IN")} {cand.currency}</div>
                            </div>
                            <ArrowRightIcon className="size-3 text-muted-foreground" />
                          </Button>
                        ))}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground pt-1">
                        0 Razorpay calls · 0 PaymentOrders · 0 Human Approvals
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* State Card: WAITING_FOR_CONFIRMATION */}
                {msg.state?.state === "WAITING_FOR_CONFIRMATION" && msg.state.primaryRecommendation && (
                  <Card className="w-full max-w-[85%] border-blue-500/30 bg-blue-50/15 dark:bg-blue-950/15 shadow-none">
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] font-mono border-blue-400 bg-white dark:bg-background">
                          Recommendation — Advisory Only
                        </Badge>
                        <span className="text-xs font-bold text-foreground">
                          ₹{msg.state.primaryRecommendation.price.toLocaleString("en-IN")} {msg.state.primaryRecommendation.currency}
                        </span>
                      </div>
                      <CardTitle className="text-sm font-bold mt-1">
                        {msg.state.primaryRecommendation.name}
                      </CardTitle>
                      <CardDescription className="text-[11px] text-muted-foreground">
                        Merchant: {msg.state.primaryRecommendation.merchantId} · Verified Catalog Item
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-3">
                      {msg.state.explanation && (
                        <div className="p-2 rounded bg-muted/60 text-[10.5px] space-y-1">
                          <div className="font-semibold text-foreground">Recommendation Rationale:</div>
                          <div className="text-muted-foreground">Relevance: {msg.state.explanation.relevanceReason}</div>
                          <div className="text-muted-foreground">Commercial Proxy: {msg.state.explanation.commercialReason}</div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={handleConfirmPurchase}
                          className="bg-primary text-primary-foreground text-xs gap-1.5"
                        >
                          <CheckIcon className="size-3.5" />
                          Confirm Purchase (Reply "yes")
                        </Button>
                        <span className="text-[10px] text-muted-foreground">
                          Requires explicit user acceptance
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* State Card: ACCEPTED */}
                {msg.state?.state === "ACCEPTED" && msg.state.transactionIntent && (
                  <Card className="w-full max-w-[85%] border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-none">
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          Buyer Intent Confirmed
                        </Badge>
                        <span className="text-[10.5px] font-mono text-muted-foreground">
                          Amount: ₹{msg.state.transactionIntent.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <CardDescription className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium mt-1">
                        Buyer acceptance is not financial authorization.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-2">
                      <div className="text-[11px] text-muted-foreground">
                        Policy Gate is the authorization boundary. Ready to evaluate and execute via canonical commerce pipeline.
                      </div>
                      <Button
                        size="sm"
                        disabled={isExecuting}
                        onClick={() => handleExecuteTransaction(msg.state!)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2Icon className="size-3.5 animate-spin" />
                            Evaluating Policy Gate & Executing Pipeline...
                          </>
                        ) : (
                          <>
                            <ShieldCheckIcon className="size-3.5" />
                            Execute via Canonical Pipeline
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Execution Result Banner */}
                {msg.executionResult && (
                  <Card className={`w-full max-w-[85%] shadow-none ${
                    msg.executionResult.status === "SUCCESS"
                      ? "border-emerald-500/40 bg-emerald-50/15"
                      : msg.executionResult.status === "PENDING_APPROVAL"
                        ? "border-amber-500/40 bg-amber-50/15"
                        : "border-rose-500/40 bg-rose-50/15"
                  }`}>
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <Badge className={`text-xs font-bold ${
                          msg.executionResult.status === "SUCCESS"
                            ? "bg-emerald-600 text-white"
                            : msg.executionResult.status === "PENDING_APPROVAL"
                              ? "bg-amber-600 text-white"
                              : "bg-rose-600 text-white"
                        }`}>
                          POLICY DECISION: {msg.executionResult.policyDecision || msg.executionResult.status}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Provider Calls: {msg.executionResult.razorpayCallCount}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-2 text-xs">
                      {msg.executionResult.status === "SUCCESS" && (
                        <div className="space-y-1">
                          <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                            Razorpay Order Created
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Razorpay order CREATED is not payment completion.
                          </p>
                        </div>
                      )}

                      {msg.executionResult.status === "PENDING_APPROVAL" && (
                        <div className="space-y-1">
                          <div className="font-semibold text-amber-800 dark:text-amber-300">
                            Human Approval Required (Safety TTL: 15 Minutes)
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Transaction exceeds auto-approval threshold. Execution paused at Policy Gate boundary (0 provider calls).
                          </p>
                        </div>
                      )}

                      {msg.executionResult.status === "DENIED" && (
                        <div className="space-y-1">
                          <div className="font-semibold text-rose-800 dark:text-rose-300">
                            Transaction Blocked by Policy Gate
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {msg.executionResult.failureReason || "Denied by security policy. Exactly 0 provider calls made."}
                          </p>
                        </div>
                      )}

                      <div className="pt-2 flex items-center gap-2">
                        <Link href={msg.executionResult.executionId ? `/executions/${msg.executionResult.executionId}` : "/executions"}>
                          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
                            <ExternalLinkIcon className="size-3.5" />
                            View Execution Detail & Decision Receipt
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ))
          )}
        </CardContent>

        {/* Chat Input Bar */}
        <div className="p-3 bg-card border-t border-border flex items-center gap-2">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Type shopping request (e.g. 'Buy one wireless precision mouse')..."
            className="text-xs h-9"
          />
          <Button
            size="sm"
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || interactMutation.isPending}
            className="h-9 px-3 gap-1.5"
          >
            {interactMutation.isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SendIcon className="size-3.5" />
            )}
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
};
