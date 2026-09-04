import {
  recommendProducts,
  acceptRecommendation,
  getAgentReadableProduct,
  type ProductRecommendationItem,
  type RecommendationExplanation,
  type RecommendationAcceptance,
} from "@/lib/commerceCatalog";
import type { TransactionIntent, HumanApprovalRecord } from "@/lib/policyEngine";
import { executeCommercePipeline, type CommercePipelineResult } from "@/lib/commercePipeline";
import { getRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import { isMerchantGrowthEnabled } from "@/lib/merchantGrowthPolicy";

/**
 * Phase 13.6, 13.7, 14.2 & 15.3: Conversational Buyer Recommendation Loop & Confidence-Gated Clarification
 *
 * Provides a typed conversational decision layer guiding a user from product
 * discovery to explainable recommendations, confidence-gated clarification, and
 * explicit purchase intent.
 *
 * CRITICAL SAFETY INVARIANTS:
 * RECOMMENDATION ≠ CLARIFICATION ≠ USER ACCEPTANCE ≠ AUTHORIZATION ≠ PAYMENT EXECUTION
 *
 * 1. runBuyerConversation() STOPS strictly at creation of the trusted TransactionIntent.
 * 2. Clarification states produce ZERO TransactionIntent objects and ZERO provider calls.
 * 3. It does NOT authorize payments, create PaymentOrders, or call Razorpay.
 * 4. executeBuyerTransaction() is an explicit, separate caller boundary delegating
 *    the trusted TransactionIntent directly to executeCommercePipeline().
 * 5. Buyer acceptance ("yes, buy") is strictly distinct from system human approval (APPROVED_BY_HUMAN).
 * 6. Reuses existing deterministic catalog, recommendation, acceptance, and execution boundaries.
 * 7. Respects Merchant Growth Kill Switch fail-closed states.
 */

export type BuyerConversationStateType =
  | "CLARIFICATION_REQUIRED"
  | "WAITING_FOR_CONFIRMATION"
  | "ACCEPTED"
  | "REJECTED"
  | "NO_MATCH";

export interface BuyerClarificationCandidate {
  readonly productId: string;
  readonly name: string;
  readonly price: number;
  readonly currency: string;
  readonly merchantId: string;
  readonly relevanceScore: number;
  readonly finalScore: number;
}

export interface BuyerClarificationData {
  readonly clarificationRequired: true;
  readonly reason: string;
  readonly candidateProducts: readonly Readonly<BuyerClarificationCandidate>[];
  readonly suggestedQuestion: string;
}

export interface BuyerConversationState {
  readonly state: BuyerConversationStateType;
  readonly message: string;
  readonly query: string;
  readonly quantity?: number;
  readonly recommendations?: readonly Readonly<ProductRecommendationItem>[];
  readonly primaryRecommendation?: Readonly<ProductRecommendationItem>;
  readonly selectedProductId?: string;
  readonly explanation?: Readonly<RecommendationExplanation>;
  readonly acceptance?: Readonly<RecommendationAcceptance>;
  readonly transactionIntent?: Readonly<TransactionIntent>;
  readonly rejectionReason?: string;
  readonly clarification?: Readonly<BuyerClarificationData>;
}

export interface BuyerConversationInput {
  userMessage: string;
  previousState?: BuyerConversationState;
  pendingProductId?: string;
  quantity?: number;
}

export interface ExecuteBuyerTransactionParams {
  transactionIntent: TransactionIntent | Readonly<TransactionIntent>;
  userId?: string;
  humanApproval?: HumanApprovalRecord;
  idempotencyKey?: string;
  credentialId?: string;
  workflowId?: string;
  executionId?: string;
  step?: any;
  publish?: any;
}

/**
 * Checks whether recommendation results are ambiguous and warrant clarification.
 * Deterministic threshold:
 * 1. Multiple candidates exist (>= 2).
 * 2. Top 2 candidates have identical relevance score OR difference in relevance is < 20 while top score is < 80.
 */
function isClarificationRequired(
  recommendations: readonly ProductRecommendationItem[],
): boolean {
  if (recommendations.length < 2) {
    return false;
  }

  const top1 = recommendations[0];
  const top2 = recommendations[1];

  // Exact relevance tie
  if (top1.relevanceScore === top2.relevanceScore) {
    return true;
  }

  // Near-tie with moderate relevance
  if (top1.relevanceScore - top2.relevanceScore < 20 && top1.relevanceScore < 80) {
    return true;
  }

  return false;
}

/**
 * Deterministically extracts requested integer quantity from natural language shopping messages.
 */
export function extractQuantityFromShoppingMessage(message: string): number | undefined {
  if (!message || typeof message !== "string") return undefined;
  const clean = message.toLowerCase();

  // Pattern 1: explicit quantity / qty prefixes (e.g. "qty 3", "quantity: 2", "buy 5", "order 999", "purchase 10")
  const prefixMatch = clean.match(
    /(?:quantity\s*[:=]?\s*|qty\s*[:=]?\s*|\bbuy\s+|\border\s+|\bget\s+|\bneed\s+|\bwant\s+|\bpurchase\s+)(\d+)\b/i,
  );
  if (prefixMatch?.[1]) {
    const val = parseInt(prefixMatch[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Pattern 2: count before units or product name (e.g. "999 wireless precision mice", "3 units", "2x")
  const countMatch = clean.match(/\b(\d+)\s+(?:units?|pieces?|items?|x\s+)?(?:of\s+)?[a-z]/i);
  if (countMatch?.[1]) {
    const val = parseInt(countMatch[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Pattern 3: leading number (e.g. "999 mice")
  const leadingMatch = clean.match(/^(\d+)\s+/);
  if (leadingMatch?.[1]) {
    const val = parseInt(leadingMatch[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return undefined;
}

/**
 * Resolves a user's clarification response against previously offered candidates.
 */
function resolveClarifiedProduct(
  userResponse: string,
  candidates: readonly Readonly<BuyerClarificationCandidate>[],
): string | null {
  const clean = userResponse.trim().toLowerCase();

  // Check ordinal / numeric selection (e.g. "1", "first", "2", "second")
  if (clean === "1" || clean === "first" || clean.startsWith("1.") || clean.startsWith("#1")) {
    return candidates[0]?.productId || null;
  }
  if (clean === "2" || clean === "second" || clean.startsWith("2.") || clean.startsWith("#2")) {
    return candidates[1]?.productId || null;
  }
  if (clean === "3" || clean === "third" || clean.startsWith("3.") || clean.startsWith("#3")) {
    return candidates[2]?.productId || null;
  }

  // Direct ID match
  for (const c of candidates) {
    if (clean === c.productId.toLowerCase()) {
      return c.productId;
    }
  }

  // Substring or token match on candidate names
  for (const c of candidates) {
    const candidateNameLower = c.name.toLowerCase();
    if (clean.includes(candidateNameLower) || candidateNameLower.includes(clean)) {
      return c.productId;
    }
  }

  return null;
}

/**
 * Evaluates a conversational shopping turn and advances the buyer state machine.
 * STOPS strictly at TransactionIntent creation without executing payments.
 */
export function runBuyerConversation(
  input: BuyerConversationInput,
): Readonly<BuyerConversationState> {
  if (!input || typeof input !== "object" || !input.userMessage || !input.userMessage.trim()) {
    return Object.freeze({
      state: "NO_MATCH",
      message: "Please provide a product search query or shopping request.",
      query: "",
    });
  }

  const cleanMessage = input.userMessage.trim();

  // Enforce Kill Switch
  if (!isMerchantGrowthEnabled()) {
    return Object.freeze({
      state: "NO_MATCH",
      message: "Merchant Growth recommendations are currently disabled by merchant kill switch.",
      query: cleanMessage,
    });
  }

  // 1. Check if user is responding to a CLARIFICATION_REQUIRED state
  if (
    input.previousState &&
    input.previousState.state === "CLARIFICATION_REQUIRED" &&
    input.previousState.clarification
  ) {
    const matchedProductId = resolveClarifiedProduct(
      cleanMessage,
      input.previousState.clarification.candidateProducts,
    );

    if (matchedProductId) {
      const product = getAgentReadableProduct(matchedProductId);
      if (product) {
        const requestedQuantity =
          input.quantity ??
          input.previousState.quantity ??
          extractQuantityFromShoppingMessage(input.previousState.query) ??
          extractQuantityFromShoppingMessage(cleanMessage) ??
          1;

        const totalAmount = product.price * requestedQuantity;
        const formattedPrice = `₹${totalAmount.toLocaleString("en-IN")} ${product.currency}`;
        const messageLines = [
          `You selected **${product.name}**${requestedQuantity > 1 ? ` (Qty: ${requestedQuantity})` : ""} for ${formattedPrice}.`,
          `*Authoritative catalog item verified.*`,
          ``,
          `Would you like to confirm this purchase? (Reply "yes" to proceed)`,
        ];

        return Object.freeze({
          state: "WAITING_FOR_CONFIRMATION",
          message: messageLines.join("\n"),
          query: cleanMessage,
          quantity: requestedQuantity,
          selectedProductId: product.productId,
          primaryRecommendation: Object.freeze({
            productId: product.productId,
            name: product.name,
            price: product.price,
            currency: product.currency,
            merchantId: product.merchantId,
            availability: product.availability,
            reason: `Direct selection following clarification for ${product.name}.`,
            relevanceScore: 100,
            availabilityScore: 50,
            commercialScore: 20,
            finalScore: 170,
            product,
            explanation: Object.freeze({
              relevanceReason: `Selected by user following clarification.`,
              availabilityReason: `In stock in trusted catalog.`,
              commercialReason: `Standard catalog price proxy.`,
              rankingReason: `Confirmed user selection.`,
            }),
          }),
        });
      }
    }
    // Fall through to standard discovery if direct candidate selection was not parsed
  }

  // 2. Check if the user is responding to a pending confirmation
  const targetProductId =
    input.pendingProductId ||
    (input.previousState && input.previousState.state === "WAITING_FOR_CONFIRMATION"
      ? input.previousState.selectedProductId
      : undefined);

  if (targetProductId) {
    const resolvedQuantity =
      input.quantity ??
      input.previousState?.quantity ??
      (input.previousState?.query ? extractQuantityFromShoppingMessage(input.previousState.query) : undefined) ??
      extractQuantityFromShoppingMessage(cleanMessage) ??
      1;

    const acceptance = acceptRecommendation({
      productId: targetProductId,
      userConfirmation: cleanMessage,
      quantity: resolvedQuantity,
      originalInstruction: input.previousState?.query || cleanMessage,
    });

    if (acceptance.accepted && acceptance.transactionIntent) {
      const product = getAgentReadableProduct(targetProductId);
      const productName = product ? product.name : targetProductId;
      const totalAmount = (product ? product.price : 0) * resolvedQuantity;
      const formattedPrice = product
        ? `₹${totalAmount.toLocaleString("en-IN")} ${product.currency}`
        : "";

      return Object.freeze({
        state: "ACCEPTED",
        message: `Great! I've structured your purchase intent for ${resolvedQuantity > 1 ? `${resolvedQuantity}x ` : ""}${productName} (${formattedPrice}). Ready to proceed through security & authorization.`,
        query: cleanMessage,
        quantity: resolvedQuantity,
        selectedProductId: targetProductId,
        acceptance,
        transactionIntent: acceptance.transactionIntent,
      });
    }

    if (acceptance.status === "REJECTED_NON_AFFIRMATIVE") {
      return Object.freeze({
        state: "REJECTED",
        message: `Understood. I will not proceed with this recommendation. Let me know if you would like to look for something else.`,
        query: cleanMessage,
        quantity: resolvedQuantity,
        selectedProductId: targetProductId,
        acceptance,
        rejectionReason: acceptance.rejectionReason,
      });
    }

    return Object.freeze({
      state: "REJECTED",
      message: `Unable to accept recommendation: ${acceptance.rejectionReason || "Unavailable"}.`,
      query: cleanMessage,
      quantity: resolvedQuantity,
      selectedProductId: targetProductId,
      acceptance,
      rejectionReason: acceptance.rejectionReason,
    });
  }

  // 3. Otherwise evaluate as a product search / discovery turn
  const recResult = recommendProducts(cleanMessage);

  if (recResult.recommendations.length === 0) {
    return Object.freeze({
      state: "NO_MATCH",
      message: `I couldn't find any products in the merchant catalog matching "${cleanMessage}". Could you try another search?`,
      query: cleanMessage,
    });
  }

  // 4. Check for Ambiguity / Clarification Requirement
  if (isClarificationRequired(recResult.recommendations)) {
    const topCandidates = recResult.recommendations.slice(0, 3);
    const candidateList = topCandidates.map((r) =>
      Object.freeze({
        productId: r.productId,
        name: r.name,
        price: r.price,
        currency: r.currency,
        merchantId: r.merchantId,
        relevanceScore: r.relevanceScore,
        finalScore: r.finalScore,
      }),
    );

    const questionLines = [
      `I found multiple matching products in the merchant catalog:`,
      ...topCandidates.map(
        (r, idx) => `${idx + 1}. **${r.name}** (₹${r.price.toLocaleString("en-IN")} ${r.currency})`,
      ),
      ``,
      `Which product would you like to choose? (Please reply with the product name or number)`,
    ];

    const clarificationData: BuyerClarificationData = Object.freeze({
      clarificationRequired: true,
      reason: `Multiple products match your query with similar relevance (${topCandidates.map((c) => c.name).join(" vs ")}).`,
      candidateProducts: Object.freeze(candidateList),
      suggestedQuestion: questionLines.join("\n"),
    });

    const requestedQuantity =
      input.quantity ??
      input.previousState?.quantity ??
      extractQuantityFromShoppingMessage(cleanMessage);

    return Object.freeze({
      state: "CLARIFICATION_REQUIRED",
      message: questionLines.join("\n"),
      query: cleanMessage,
      quantity: requestedQuantity,
      recommendations: recResult.recommendations,
      clarification: clarificationData,
    });
  }

  // 5. High-confidence recommendation proceeds to confirmation
  const requestedQuantity =
    input.quantity ??
    input.previousState?.quantity ??
    extractQuantityFromShoppingMessage(cleanMessage);

  const primary = recResult.recommendations[0];
  const qtyMultiplier = requestedQuantity && requestedQuantity > 1 ? requestedQuantity : 1;
  const totalAmount = primary.price * qtyMultiplier;
  const formattedPrice = `₹${totalAmount.toLocaleString("en-IN")} ${primary.currency}`;

  const messageLines = [
    `I recommend the **${primary.name}**${qtyMultiplier > 1 ? ` (Qty: ${qtyMultiplier})` : ""} for ${formattedPrice}.`,
    `*${primary.reason}*`,
    ``,
    `Would you like to confirm this purchase? (Reply "yes" to proceed)`,
  ];

  return Object.freeze({
    state: "WAITING_FOR_CONFIRMATION",
    message: messageLines.join("\n"),
    query: cleanMessage,
    quantity: requestedQuantity,
    recommendations: recResult.recommendations,
    primaryRecommendation: primary,
    selectedProductId: primary.productId,
    explanation: primary.explanation,
  });
}

/**
 * Explicit execution adapter taking a trusted TransactionIntent produced by the
 * conversational buyer and delegating into the ONE canonical commerce execution pipeline.
 */
export async function executeBuyerTransaction(
  params: ExecuteBuyerTransactionParams,
): Promise<CommercePipelineResult> {
  const {
    transactionIntent,
    userId = "user_buyer_transaction",
    humanApproval,
    idempotencyKey,
    credentialId,
    workflowId,
    executionId,
    step,
    publish,
  } = params;

  // 0. Enforce Merchant Growth Kill Switch
  if (!isMerchantGrowthEnabled()) {
    return {
      status: "DENIED",
      policyDecision: "DENIED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Merchant Growth transactions are currently disabled by merchant kill switch",
      context: {},
    };
  }

  // 1. Validate TransactionIntent structure
  if (!transactionIntent || typeof transactionIntent !== "object" || !transactionIntent.productId) {
    return {
      status: "FAILED",
      policyDecision: "DENIED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Invalid or missing TransactionIntent provided to executeBuyerTransaction",
      context: {},
    };
  }

  // 2. Strict Re-verification against trusted catalog facts
  const catalogProduct = getAgentReadableProduct(transactionIntent.productId);
  if (!catalogProduct) {
    return {
      status: "DENIED",
      policyDecision: "DENIED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: `Product ${transactionIntent.productId} does not exist in trusted catalog`,
      context: {},
    };
  }

  const expectedAmount = catalogProduct.price * (transactionIntent.quantity ?? 1);
  if (
    transactionIntent.amount !== expectedAmount ||
    transactionIntent.merchantId !== catalogProduct.merchantId ||
    transactionIntent.currency !== catalogProduct.currency
  ) {
    return {
      status: "DENIED",
      policyDecision: "DENIED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Tampered or inconsistent transaction intent detected before execution",
      context: {},
    };
  }

  // 3. Delegate directly into the one canonical commerce execution pipeline
  return executeCommercePipeline({
    transactionIntent,
    userId,
    humanApproval,
    idempotencyKey,
    credentialId,
    workflowId,
    executionId,
    step,
    publish,
  });
}
