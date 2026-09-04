import catalogData from "@/config/catalog.json";
import type {
  TransactionIntent,
  HumanApprovalRecord,
} from "@/lib/policyEngine";
import { getRazorpayCallCount } from "@/lib/razorpayInstrumentation";
import type { DecisionReceipt } from "@/lib/decisionReceipt";
import {
  getEffectiveMerchantGrowthPolicy,
  decideMerchantGrowthStrategy,
  isMerchantGrowthEnabled,
  getMerchantGrowthKillSwitchState,
  type MerchantGrowthPolicy,
  type GrowthStrategy,
  type GrowthStrategyDecision,
} from "@/lib/merchantGrowthPolicy";

/**
 * Phase 12 & 13: Agent-Readable Commerce Catalog, Discovery, Constraints, Recommendations & Explicit Acceptance
 *
 * Exposes a structured, strongly-typed, immutable representation of the trusted
 * merchant catalog, deterministic discovery, constraint validation, deterministic
 * revenue-aware product recommendations with explainable decision structures,
 * merchant growth policy controls, and explicit user acceptance boundaries.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * RECOMMENDATION ≠ GROWTH STRATEGY ≠ USER ACCEPTANCE ≠ AUTHORIZATION ≠ PAYMENT EXECUTION
 *
 * 1. Recommendations and growth strategies are advisory only.
 * 2. Revenue-aware ranking uses deterministic catalog attributes (commercial value proxy)
 *    and NEVER overwhelms basic query relevance.
 * 3. Merchant Growth Strategy influences recommendation ranking only; it cannot authorize payments.
 * 4. User acceptance creates a structured purchase intent with re-resolved catalog facts.
 * 5. User acceptance DOES NOT authorize payments, call providers, or bypass the Policy Gate.
 * 6. Accepted intents run through the ONE canonical commerce execution pipeline.
 */

export interface ProductAvailability {
  inStock: boolean;
  stockCount: number;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
}

export interface PurchaseConstraints {
  minQuantityPerOrder: number;
  maxQuantityPerOrder: number;
  requiresHumanApprovalAboveAmount: number;
  allowedCurrencies: readonly string[];
}

export interface AgentReadableProduct {
  readonly productId: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly currency: string;
  readonly merchantId: string;
  readonly category: string;
  readonly availability: Readonly<ProductAvailability>;
  readonly purchaseConstraints: Readonly<PurchaseConstraints>;
}

export interface AgentReadableCatalog {
  readonly version: string;
  readonly products: readonly AgentReadableProduct[];
}

export interface RawCatalogItem {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  stock: number;
  merchantId: string;
}

export type DiscoveryStatus = "MATCHED" | "NO_MATCH";

export interface ProductDiscoveryResult {
  readonly status: DiscoveryStatus;
  readonly query: string;
  readonly candidates: readonly Readonly<AgentReadableProduct>[];
  readonly primaryMatch: Readonly<AgentReadableProduct> | null;
}

export interface PurchaseIntentCheckParams {
  productId: string;
  quantity?: number;
  currency?: string;
  amount?: number;
}

export interface ConstraintValidationResult {
  readonly valid: boolean;
  readonly isAvailable: boolean;
  readonly isQuantityValid: boolean;
  readonly isCurrencyAllowed: boolean;
  readonly requiresHumanApproval: boolean;
  readonly violations: readonly string[];
  readonly evaluatedProduct: Readonly<AgentReadableProduct> | null;
}

export interface RecommendationExplanation {
  readonly relevanceReason: string;
  readonly availabilityReason: string;
  readonly commercialReason: string;
  readonly rankingReason: string;
}

export interface ProductRecommendationItem {
  readonly product: Readonly<AgentReadableProduct>;
  readonly productId: string;
  readonly name: string;
  readonly price: number;
  readonly currency: string;
  readonly merchantId: string;
  readonly availability: Readonly<ProductAvailability>;
  readonly reason: string;
  readonly explanation: Readonly<RecommendationExplanation>;
  readonly relevanceScore: number;
  readonly availabilityScore: number;
  readonly commercialScore: number;
  readonly finalScore: number;
}

export interface RecommendationOptions {
  readonly limit?: number;
  readonly category?: string;
  readonly inStockOnly?: boolean;
  readonly merchantGrowthPolicy?: Readonly<MerchantGrowthPolicy>;
}

export interface ProductRecommendationResult {
  readonly query: string;
  readonly recommendations: readonly Readonly<ProductRecommendationItem>[];
  readonly totalRecommendations: number;
  readonly activePolicyId: string;
  readonly activeStrategy: GrowthStrategy;
  readonly strategyDecision: Readonly<GrowthStrategyDecision>;
  readonly killSwitchStatus?: "ENABLED" | "DISABLED";
  readonly disabledReason?: string;
}

export type AcceptanceStatus =
  | "ACCEPTED"
  | "REJECTED_UNAVAILABLE"
  | "REJECTED_UNKNOWN_PRODUCT"
  | "REJECTED_INVALID_INPUT"
  | "REJECTED_NON_AFFIRMATIVE"
  | "REJECTED_DISABLED_BY_KILL_SWITCH";

export interface RecommendationAcceptance {
  readonly accepted: boolean;
  readonly status: AcceptanceStatus;
  readonly productId: string;
  readonly catalogVersion: string;
  readonly timestamp: string;
  readonly transactionIntent: Readonly<TransactionIntent> | null;
  readonly rejectionReason?: string;
}

export interface AcceptRecommendationParams {
  productId: string;
  quantity?: number;
  userConfirmation?: string | boolean;
  originalInstruction?: string;
  clientSuppliedPrice?: unknown; // Explicitly discarded
  clientSuppliedMerchant?: unknown; // Explicitly discarded
  clientSuppliedCurrency?: unknown; // Explicitly discarded
}

export interface ExecuteAcceptedRecommendationParams {
  acceptance: RecommendationAcceptance;
  userId?: string;
  step?: any;
  publish?: any;
  humanApproval?: HumanApprovalRecord;
  idempotencyKey?: string;
}

export interface ExecutedRecommendationResult {
  status: "SUCCESS" | "PENDING_APPROVAL" | "DENIED" | "REJECTED_UNACCEPTED" | "FAILED";
  policyDecision?: "APPROVED" | "ESCALATED" | "DENIED";
  allowed?: boolean;
  razorpayCallCount: number;
  razorpayOrder?: any;
  decisionReceipt?: DecisionReceipt | null;
  failureReason?: string;
}

/**
 * Builds an immutable, agent-readable product from a trusted raw catalog item.
 */
function buildAgentReadableProduct(item: RawCatalogItem): Readonly<AgentReadableProduct> {
  const inStock = item.stock > 0;
  const status: ProductAvailability["status"] =
    item.stock > 10 ? "IN_STOCK" : item.stock > 0 ? "LOW_STOCK" : "OUT_OF_STOCK";

  const availability: ProductAvailability = {
    inStock,
    stockCount: item.stock,
    status,
  };

  const purchaseConstraints: PurchaseConstraints = {
    minQuantityPerOrder: 1,
    maxQuantityPerOrder: Math.min(item.stock, 10),
    requiresHumanApprovalAboveAmount: 2000,
    allowedCurrencies: Object.freeze(["INR"]),
  };

  return Object.freeze({
    productId: item.id,
    name: item.title,
    description: item.description,
    price: item.price,
    currency: item.currency,
    merchantId: item.merchantId,
    category: item.category,
    availability: Object.freeze(availability),
    purchaseConstraints: Object.freeze(purchaseConstraints),
  });
}

/**
 * Returns the authoritative, immutable agent-readable catalog.
 * Derived directly and deterministically from src/config/catalog.json.
 */
export function getAgentReadableCatalog(): Readonly<AgentReadableCatalog> {
  const rawItems = catalogData as RawCatalogItem[];
  const products = Object.freeze(rawItems.map(buildAgentReadableProduct));

  return Object.freeze({
    version: "1.0.0",
    products,
  });
}

/**
 * Retrieves a single agent-readable product by ID.
 */
export function getAgentReadableProduct(productId: string): Readonly<AgentReadableProduct> | null {
  if (!productId || typeof productId !== "string") {
    return null;
  }
  const catalog = getAgentReadableCatalog();
  const found = catalog.products.find((p) => p.productId === productId);
  return found || null;
}

/**
 * Formats the agent-readable catalog into a structured markdown prompt context
 * for AI Buyer consumption.
 */
export function formatCatalogForPrompt(): string {
  const catalog = getAgentReadableCatalog();
  const lines: string[] = ["# Authoritative Merchant Product Catalog"];

  for (const p of catalog.products) {
    lines.push(
      `- [${p.productId}] ${p.name} | Price: ₹${p.price.toLocaleString("en-IN")} ${p.currency} | Merchant: ${p.merchantId} | Stock: ${p.availability.stockCount} (${p.availability.status}) | Category: ${p.category}`,
    );
  }

  return lines.join("\n");
}

const PRODUCT_DISTINCTIVE_KEYWORDS: Record<string, string[]> = {
  prod_keyboard_01: ["mechanical keyboard", "ergonomic keyboard", "keyboard", "switches", "rgb keyboard"],
  prod_mouse_02: [
    "wireless mouse",
    "precision mouse",
    "mouse",
    "mice",
    "optical mouse",
    "wireless precision mouse",
    "bluetooth mouse",
  ],
  prod_headphones_03: [
    "noise-cancelling",
    "noise cancelling",
    "headphones",
    "headphone",
    "headset",
    "wireless headphones",
    "bluetooth headphones",
  ],
  prod_monitor_arm_04: [
    "monitor arm",
    "single monitor arm",
    "desk mount",
    "monitor stand",
    "gas spring",
    "monitor mount",
  ],
  prod_usb_dock_05: [
    "docking station",
    "usb-c dock",
    "usb dock",
    "multiport adapter",
    "multiport dock",
    "usb-c hub",
    "hub",
  ],
  prod_desk_mat_06: ["desk mat", "desk pad", "leather mat", "vegan leather desk mat", "desk blotter"],
  prod_cable_organizer_07: [
    "cable organizer",
    "cable management",
    "cable clips",
    "magnetic cable clips",
    "wire management",
  ],
  prod_webcam_08: ["webcam", "streaming camera", "4k webcam", "camera", "hd webcam", "usb webcam"],
};

/**
 * Deterministically resolves a natural-language shopping query to product candidates
 * exclusively from the trusted catalog.
 */
export function discoverProducts(query: string): Readonly<ProductDiscoveryResult> {
  if (!query || typeof query !== "string" || !query.trim()) {
    return Object.freeze({
      status: "NO_MATCH",
      query: query || "",
      candidates: Object.freeze([]),
      primaryMatch: null,
    });
  }

  const cleanQuery = query.toLowerCase().trim();
  const catalog = getAgentReadableCatalog();
  const scoredProducts: Array<{ product: Readonly<AgentReadableProduct>; score: number }> = [];

  for (const product of catalog.products) {
    let score = 0;
    const pIdLower = product.productId.toLowerCase();
    const pNameLower = product.name.toLowerCase();
    const pDescLower = product.description.toLowerCase();

    // 1. Exact or substring productId match
    if (cleanQuery.includes(pIdLower)) {
      score += 1000;
    }

    // 2. Exact product name match
    if (cleanQuery === pNameLower) {
      score += 800;
    } else if (cleanQuery.includes(pNameLower)) {
      score += 600;
    } else if (pNameLower.includes(cleanQuery)) {
      score += 400;
    }

    // 3. Keyword / distinctive term match
    const keywords = PRODUCT_DISTINCTIVE_KEYWORDS[product.productId] || [];
    for (const kw of keywords) {
      if (cleanQuery.includes(kw)) {
        score += 300;
      }
    }

    // 4. Token overlap scoring against name and description
    const queryTokens = cleanQuery.split(/[\s,._\-:;!?/]+/).filter((t) => t.length > 2);
    for (const token of queryTokens) {
      if (pNameLower.includes(token)) {
        score += 50;
      } else if (pDescLower.includes(token)) {
        score += 20;
      }
    }

    if (score > 0) {
      scoredProducts.push({ product, score });
    }
  }

  // Stable deterministic sorting
  scoredProducts.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.product.productId.localeCompare(b.product.productId);
  });

  if (scoredProducts.length === 0) {
    return Object.freeze({
      status: "NO_MATCH",
      query,
      candidates: Object.freeze([]),
      primaryMatch: null,
    });
  }

  const candidates = Object.freeze(scoredProducts.map((sp) => sp.product));

  return Object.freeze({
    status: "MATCHED",
    query,
    candidates,
    primaryMatch: candidates[0] || null,
  });
}

// -----------------------------------------------------------------------------
// Phase 12.3: Catalog Constraint Validation & Authority Helpers
// -----------------------------------------------------------------------------

/**
 * Validates purchase intent parameters against explicit catalog constraints.
 */
export function validateProductPurchaseConstraints(
  params: PurchaseIntentCheckParams,
): Readonly<ConstraintValidationResult> {
  const violations: string[] = [];

  if (!params || typeof params !== "object" || !params.productId) {
    return Object.freeze({
      valid: false,
      isAvailable: false,
      isQuantityValid: false,
      isCurrencyAllowed: false,
      requiresHumanApproval: false,
      violations: Object.freeze(["Missing or invalid product ID"]),
      evaluatedProduct: null,
    });
  }

  const product = getAgentReadableProduct(params.productId);
  if (!product) {
    return Object.freeze({
      valid: false,
      isAvailable: false,
      isQuantityValid: false,
      isCurrencyAllowed: false,
      requiresHumanApproval: false,
      violations: Object.freeze([`Product "${params.productId}" not found in trusted catalog`]),
      evaluatedProduct: null,
    });
  }

  // 1. Availability check
  const isAvailable = product.availability.inStock && product.availability.stockCount > 0;
  if (!isAvailable) {
    violations.push(`Product "${product.name}" is currently out of stock`);
  }

  // 2. Quantity constraint check
  const quantity = params.quantity ?? 1;
  let isQuantityValid = false;

  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    violations.push(`Quantity must be a positive integer, got ${quantity}`);
  } else if (quantity < product.purchaseConstraints.minQuantityPerOrder) {
    violations.push(
      `Quantity ${quantity} is below minimum allowed (${product.purchaseConstraints.minQuantityPerOrder})`,
    );
  } else if (quantity > product.purchaseConstraints.maxQuantityPerOrder) {
    violations.push(
      `Quantity ${quantity} exceeds maximum allowed (${product.purchaseConstraints.maxQuantityPerOrder})`,
    );
  } else if (quantity > product.availability.stockCount) {
    violations.push(
      `Requested quantity ${quantity} exceeds available stock (${product.availability.stockCount})`,
    );
  } else {
    isQuantityValid = true;
  }

  // 3. Currency check
  const requestedCurrency = (params.currency || product.currency || "").toUpperCase();
  const isCurrencyAllowed =
    typeof requestedCurrency === "string" &&
    product.purchaseConstraints.allowedCurrencies.includes(requestedCurrency);

  if (!isCurrencyAllowed) {
    violations.push(
      `Currency "${requestedCurrency}" is not allowed. Supported currencies: ${product.purchaseConstraints.allowedCurrencies.join(", ")}`,
    );
  }

  // 4. Approval threshold check
  const calculatedTotal =
    params.amount ?? (product.price * (Number.isInteger(quantity) && quantity > 0 ? quantity : 1));
  const requiresHumanApproval =
    calculatedTotal > product.purchaseConstraints.requiresHumanApprovalAboveAmount;

  const valid = isAvailable && isQuantityValid && isCurrencyAllowed && violations.length === 0;

  return Object.freeze({
    valid,
    isAvailable,
    isQuantityValid,
    isCurrencyAllowed,
    requiresHumanApproval,
    violations: Object.freeze(violations),
    evaluatedProduct: product,
  });
}

/**
 * Checks if a specific product is currently available in stock.
 */
export function isProductAvailable(productId: string): boolean {
  const product = getAgentReadableProduct(productId);
  return !!product && product.availability.inStock && product.availability.stockCount > 0;
}

/**
 * Checks if a requested quantity satisfies the product's catalog constraints.
 */
export function isQuantityValidForProduct(productId: string, quantity: number): boolean {
  const product = getAgentReadableProduct(productId);
  if (!product) return false;
  return (
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity >= product.purchaseConstraints.minQuantityPerOrder &&
    quantity <= product.purchaseConstraints.maxQuantityPerOrder &&
    quantity <= product.availability.stockCount
  );
}

/**
 * Checks if a currency is supported for a product.
 */
export function isCurrencyAllowedForProduct(productId: string, currency: string): boolean {
  const product = getAgentReadableProduct(productId);
  if (!product || typeof currency !== "string") return false;
  return product.purchaseConstraints.allowedCurrencies.includes(currency.toUpperCase());
}

/**
 * Checks if a purchase amount exceeds the catalog's human approval threshold.
 */
export function requiresHumanApprovalForPurchase(productId: string, amount: number): boolean {
  const product = getAgentReadableProduct(productId);
  if (!product) return true; // Fail-closed
  return amount > product.purchaseConstraints.requiresHumanApprovalAboveAmount;
}

// -----------------------------------------------------------------------------
// Phase 13.1, 13.4, 13.5, 13.8 & 13.9: Deterministic Merchant Policy & Strategy Recommendations
// -----------------------------------------------------------------------------

/**
 * Produces deterministic, advisory product recommendations from the trusted catalog,
 * governed by the active Merchant Growth Policy and Strategy decision model:
 *
 * finalScore = relevanceScore + availabilityScore + commercialScore
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. Advisory only — does NOT create orders, authorize payments, or modify policies.
 * 2. Relevance strictly dominates commercial score (an expensive irrelevant product
 *    can never outrank a relevant product).
 * 3. Enforces policy.minRelevanceScore to filter out irrelevant candidates.
 * 4. Every candidate exposes a structured, typed, transparent explanation breakdown.
 * 5. Returns a structured GrowthStrategyDecision reflecting the applied merchant strategy.
 * 6. Stable and deterministic for identical inputs.
 * 7. Discards untrusted client prices or merchants.
 */
export function recommendProducts(
  query: string,
  options?: RecommendationOptions,
): Readonly<ProductRecommendationResult> {
  const strategyDecision = decideMerchantGrowthStrategy({
    query,
    policy: options?.merchantGrowthPolicy,
  });
  const policy = strategyDecision.appliedPolicy;

  if (!isMerchantGrowthEnabled()) {
    return Object.freeze({
      query: query || "",
      recommendations: Object.freeze([]),
      totalRecommendations: 0,
      activePolicyId: strategyDecision.policyId,
      activeStrategy: strategyDecision.strategy,
      strategyDecision,
      killSwitchStatus: "DISABLED",
      disabledReason: getMerchantGrowthKillSwitchState().disabledReason || "Merchant Growth disabled by kill switch",
    });
  }

  if (!query || typeof query !== "string" || !query.trim()) {
    return Object.freeze({
      query: query || "",
      recommendations: Object.freeze([]),
      totalRecommendations: 0,
      activePolicyId: strategyDecision.policyId,
      activeStrategy: strategyDecision.strategy,
      strategyDecision,
      killSwitchStatus: "ENABLED",
    });
  }

  const cleanQuery = query.toLowerCase().trim();
  const catalog = getAgentReadableCatalog();
  const limit = options?.limit ?? 5;
  const inStockOnly = options?.inStockOnly ?? true;
  const targetCategory = options?.category?.toLowerCase();

  const candidates: ProductRecommendationItem[] = [];

  for (const product of catalog.products) {
    if (inStockOnly && !product.availability.inStock) {
      continue;
    }

    if (targetCategory && product.category.toLowerCase() !== targetCategory) {
      continue;
    }

    // Policy category filtering
    if (policy.allowedCategories && policy.allowedCategories.length > 0) {
      if (!policy.allowedCategories.includes(product.category)) {
        continue;
      }
    }
    if (policy.excludedCategories && policy.excludedCategories.includes(product.category)) {
      continue;
    }

    let relevanceScore = 0;
    let baseReason = "";

    const pIdLower = product.productId.toLowerCase();
    const pNameLower = product.name.toLowerCase();
    const pDescLower = product.description.toLowerCase();
    const pCategoryLower = product.category.toLowerCase();

    // 1. Direct ID match
    if (cleanQuery.includes(pIdLower)) {
      relevanceScore += 1000;
      baseReason = `Direct match for catalog product ID "${product.productId}".`;
    }
    // 2. Exact Title match
    else if (cleanQuery === pNameLower) {
      relevanceScore += 800;
      baseReason = `Exact match for requested product "${product.name}".`;
    }
    // 3. Title Substring match
    else if (cleanQuery.includes(pNameLower)) {
      relevanceScore += 600;
      baseReason = `Matches requested catalog product "${product.name}".`;
    } else if (pNameLower.includes(cleanQuery)) {
      relevanceScore += 400;
      baseReason = `Matches search query for "${product.name}".`;
    }

    // 4. Keyword matches
    const keywords = PRODUCT_DISTINCTIVE_KEYWORDS[product.productId] || [];
    const matchedKeywords: string[] = [];
    for (const kw of keywords) {
      if (cleanQuery.includes(kw)) {
        relevanceScore += 300;
        matchedKeywords.push(kw);
      }
    }
    if (matchedKeywords.length > 0 && !baseReason) {
      baseReason = `Matches product keywords (${matchedKeywords.join(", ")}) for ${product.name}.`;
    }

    // 5. Category token match
    if (cleanQuery.includes(pCategoryLower)) {
      relevanceScore += 150;
      if (!baseReason) {
        baseReason = `Matches the requested "${product.category}" category.`;
      }
    }

    // 6. Token overlap against description
    const queryTokens = cleanQuery.split(/[\s,._\-:;!?/]+/).filter((t) => t.length > 2);
    let tokenHits = 0;
    for (const token of queryTokens) {
      if (pNameLower.includes(token)) {
        relevanceScore += 50;
        tokenHits++;
      } else if (pDescLower.includes(token)) {
        relevanceScore += 20;
        tokenHits++;
      }
    }
    if (tokenHits > 0 && !baseReason) {
      baseReason = `Relevant product features match your description for ${product.name}.`;
    }

    // Enforce strict relevance minimum from Merchant Growth Policy
    if (relevanceScore >= policy.minRelevanceScore) {
      // Availability bonus with policy weighting
      const baseAvailability =
        product.availability.status === "IN_STOCK"
          ? 50
          : product.availability.status === "LOW_STOCK"
            ? 25
            : 0;
      const availabilityScore = Math.round(baseAvailability * policy.availabilityWeight);

      // Commercial score with policy weighting and objective rules
      const rawCommercial =
        policy.objective === "RELEVANCE_ONLY"
          ? 0
          : Math.min(
              Math.round((product.price / 100) * policy.commercialWeight),
              policy.maxCommercialBonus,
            );
      const commercialScore = rawCommercial;

      const finalScore = relevanceScore + availabilityScore + commercialScore;

      let reason = baseReason || `Recommended based on query match for ${product.name}.`;
      if (commercialScore >= 35) {
        reason += ` (High basket-value candidate, ₹${product.price}).`;
      } else if (availabilityScore >= 50) {
        reason += ` (In-stock, commercial value proxy: ₹${product.price}).`;
      }

      // Phase 13.5 & 13.8: Structured, transparent, explainable decision breakdown
      const explanation: RecommendationExplanation = Object.freeze({
        relevanceReason: `${baseReason || `Matched user query terms for ${product.name}`} (Relevance score: ${relevanceScore}).`,
        availabilityReason:
          product.availability.status === "IN_STOCK"
            ? `Product is currently in stock (${product.availability.stockCount} units available) with full fulfillment priority (score: +${availabilityScore}).`
            : product.availability.status === "LOW_STOCK"
              ? `Product has limited stock (${product.availability.stockCount} units remaining) (score: +${availabilityScore}).`
              : `Product is currently out of stock (score: 0).`,
        commercialReason: `Commercial value proxy of ₹${product.price.toLocaleString("en-IN")} ${product.currency} (score: +${commercialScore} / max ${policy.maxCommercialBonus}, policy objective: ${policy.objective}). Note: Represents catalog price bracket proxy, not actual merchant revenue, profit, or conversion probability.`,
        rankingReason: `Ranked with total score ${finalScore} (Relevance: ${relevanceScore} + Availability: ${availabilityScore} + Commercial Proxy: ${commercialScore}). Relevance strictly dominates commercial weighting (Policy: ${policy.policyId}).`,
      });

      candidates.push(
        Object.freeze({
          product,
          productId: product.productId,
          name: product.name,
          price: product.price,
          currency: product.currency,
          merchantId: product.merchantId,
          availability: product.availability,
          reason,
          explanation,
          relevanceScore,
          availabilityScore,
          commercialScore,
          finalScore,
        }),
      );
    }
  }

  // Stable deterministic sorting: finalScore descending, then productId ascending
  candidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) {
      return b.finalScore - a.finalScore;
    }
    return a.productId.localeCompare(b.productId);
  });

  const sliced = Object.freeze(candidates.slice(0, limit));

  return Object.freeze({
    query,
    recommendations: sliced,
    totalRecommendations: sliced.length,
    activePolicyId: strategyDecision.policyId,
    activeStrategy: strategyDecision.strategy,
    strategyDecision,
    killSwitchStatus: "ENABLED",
  });
}

// -----------------------------------------------------------------------------
// Phase 13.2: Explicit User Acceptance Boundary
// -----------------------------------------------------------------------------

const AFFIRMATIVE_TERMS = [
  "yes",
  "accept",
  "confirm",
  "buy",
  "purchase",
  "agree",
  "proceed",
  "i accept",
  "approve",
  "go ahead",
  "order",
];

const NON_AFFIRMATIVE_TERMS = [
  "maybe",
  "sounds good",
  "interesting",
  "tell me more",
  "what else",
  "no",
  "not yet",
  "cancel",
  "show details",
  "show more",
];

/**
 * Checks whether user input qualifies as an explicit affirmative confirmation.
 */
function isAffirmativeConfirmation(confirmation: string | boolean | undefined): boolean {
  if (typeof confirmation === "boolean") {
    return confirmation === true;
  }
  if (typeof confirmation === "string") {
    const clean = confirmation.toLowerCase().trim();
    if (NON_AFFIRMATIVE_TERMS.some((na) => clean === na || clean.startsWith(na))) {
      return false;
    }
    return AFFIRMATIVE_TERMS.some((aff) => clean === aff || clean.includes(aff));
  }
  return true; // If omitted in a dedicated accept call, default to explicit invocation intent
}

/**
 * Processes explicit user acceptance of a recommended product.
 *
 * ARCHITECTURAL SAFETY GUARANTEES:
 * 1. Re-resolves product identity, price, merchant, currency, and constraints from the trusted catalog.
 * 2. Strictly discards any client-supplied prices, merchants, or currencies.
 * 3. Does NOT authorize payment, create a Razorpay order, create a PaymentOrder, or bypass Policy Gate.
 * 4. Produces a typed TransactionIntent ready for downstream Policy Gate evaluation.
 */
export function acceptRecommendation(
  input: string | AcceptRecommendationParams,
): Readonly<RecommendationAcceptance> {
  const timestamp = new Date().toISOString();
  const params: AcceptRecommendationParams =
    typeof input === "string" ? { productId: input } : input;

  // 0. Enforce Merchant Growth Kill Switch
  if (!isMerchantGrowthEnabled()) {
    return Object.freeze({
      accepted: false,
      status: "REJECTED_DISABLED_BY_KILL_SWITCH",
      productId: params?.productId || "",
      catalogVersion: "1.0.0",
      timestamp,
      transactionIntent: null,
      rejectionReason: "Merchant Growth recommendations and acceptance are disabled by merchant kill switch",
    });
  }

  if (!params || typeof params !== "object" || !params.productId || typeof params.productId !== "string") {
    return Object.freeze({
      accepted: false,
      status: "REJECTED_INVALID_INPUT",
      productId: "",
      catalogVersion: "1.0.0",
      timestamp,
      transactionIntent: null,
      rejectionReason: "Missing or invalid product ID for recommendation acceptance",
    });
  }

  // 1. Verify affirmative user intent if text confirmation was supplied
  if (params.userConfirmation !== undefined && !isAffirmativeConfirmation(params.userConfirmation)) {
    return Object.freeze({
      accepted: false,
      status: "REJECTED_NON_AFFIRMATIVE",
      productId: params.productId,
      catalogVersion: "1.0.0",
      timestamp,
      transactionIntent: null,
      rejectionReason: `Non-affirmative confirmation provided ("${params.userConfirmation}"). Explicit user purchase acceptance required.`,
    });
  }

  // 2. Re-resolve product from the trusted catalog (disregarding any client-supplied fields)
  const product = getAgentReadableProduct(params.productId);
  if (!product) {
    return Object.freeze({
      accepted: false,
      status: "REJECTED_UNKNOWN_PRODUCT",
      productId: params.productId,
      catalogVersion: "1.0.0",
      timestamp,
      transactionIntent: null,
      rejectionReason: `Product "${params.productId}" no longer exists in trusted catalog`,
    });
  }

  // 3. Re-validate availability and constraints
  const quantity = params.quantity ?? 1;
  const constraintCheck = validateProductPurchaseConstraints({
    productId: product.productId,
    quantity,
  });

  if (!constraintCheck.valid) {
    return Object.freeze({
      accepted: false,
      status: "REJECTED_UNAVAILABLE",
      productId: product.productId,
      catalogVersion: "1.0.0",
      timestamp,
      transactionIntent: null,
      rejectionReason: constraintCheck.violations.join("; "),
    });
  }

  // 4. Construct trusted transaction intent (strictly catalog-authoritative)
  const transactionIntent: TransactionIntent = Object.freeze({
    action: "payment.execute",
    amount: product.price * quantity, // Current trusted catalog price * quantity
    currency: product.currency, // Trusted catalog currency
    merchantId: product.merchantId, // Trusted catalog merchant
    productTitle: product.name,
    productDescription: product.description,
    productId: product.productId,
    quantity,
    sourceInstruction: params.originalInstruction || `Explicit user acceptance for ${product.name} (Qty: ${quantity})`,
  });

  return Object.freeze({
    accepted: true,
    status: "ACCEPTED",
    productId: product.productId,
    catalogVersion: "1.0.0",
    timestamp,
    transactionIntent,
  });
}

// -----------------------------------------------------------------------------
// Phase 13.3: Delegation to Canonical Commerce Execution Pipeline
// -----------------------------------------------------------------------------

/**
 * Validates recommendation acceptance and delegates directly into the ONE
 * canonical commerce execution pipeline (executeCommercePipeline).
 *
 * CRITICAL INVARIANT:
 * Zero duplicated orchestration. Accepted recommendations flow through the
 * identical Policy Gate, human approval, Razorpay executor, and receipt generator.
 */
export async function executeAcceptedRecommendation(
  params: ExecuteAcceptedRecommendationParams,
): Promise<ExecutedRecommendationResult> {
  const { acceptance, userId = "user_rec_exec", step, publish, humanApproval, idempotencyKey } = params;

  // 0. Enforce Merchant Growth Kill Switch
  if (!isMerchantGrowthEnabled()) {
    return {
      status: "DENIED",
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Merchant Growth transactions are currently disabled by merchant kill switch",
    };
  }

  // 1. Enforce that recommendation was explicitly accepted
  if (!acceptance || !acceptance.accepted || !acceptance.transactionIntent) {
    return {
      status: "REJECTED_UNACCEPTED",
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Cannot execute unaccepted recommendation",
    };
  }

  // 2. Strict Re-verification against trusted catalog facts
  const catalogProduct = getAgentReadableProduct(acceptance.productId);
  if (!catalogProduct) {
    return {
      status: "DENIED",
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: `Product ${acceptance.productId} no longer exists in trusted catalog`,
    };
  }

  const expectedAmount = catalogProduct.price * (acceptance.transactionIntent.quantity ?? 1);
  if (
    acceptance.transactionIntent.amount !== expectedAmount ||
    acceptance.transactionIntent.merchantId !== catalogProduct.merchantId ||
    acceptance.transactionIntent.currency !== catalogProduct.currency
  ) {
    return {
      status: "DENIED",
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Tampered or inconsistent transaction intent detected before Policy Gate",
    };
  }

  // 3. Delegate to the ONE canonical commerce execution pipeline
  const { executeCommercePipeline } = await import("@/lib/commercePipeline");
  const pipelineResult = await executeCommercePipeline({
    transactionIntent: acceptance.transactionIntent,
    userId,
    humanApproval,
    idempotencyKey: idempotencyKey || `idem_rec_${acceptance.productId}`,
    executionId: `exec_rec_${acceptance.productId}`,
    workflowId: "wf_recommendation_exec",
    step,
    publish,
  });

  return {
    status: pipelineResult.status as ExecutedRecommendationResult["status"],
    policyDecision: pipelineResult.policyDecision,
    allowed: pipelineResult.allowed,
    razorpayCallCount: pipelineResult.razorpayCallCount,
    razorpayOrder: pipelineResult.razorpayOrder,
    decisionReceipt: pipelineResult.decisionReceipt,
    failureReason: pipelineResult.failureReason,
  };
}
