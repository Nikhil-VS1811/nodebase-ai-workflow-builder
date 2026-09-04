import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  AI_BUYER_SESSION_KEY,
  loadBuyerSession,
  saveBuyerSession,
  clearBuyerSession,
  type StoredAiBuyerSession,
} from "@/features/ai-buyer/lib/sessionStorage";
import type { BuyerConversationState } from "@/lib/conversationalBuyer";
import type { CommercePipelineResult } from "@/lib/commercePipeline";
import { executeBuyerTransaction } from "@/lib/conversationalBuyer";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

// In-memory Storage mock for testing
class MockSessionStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

describe("Phase 18: AI Buyer Session Persistence & Boundary Security", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = new MockSessionStorage();
    resetRazorpayCallCount();
  });

  it("1. Serializes and restores full conversation state across route navigation", () => {
    const sampleState: BuyerConversationState = {
      state: "ACCEPTED",
      message: "Great! I've structured your purchase intent for Wireless Precision Mouse (₹1,999 INR).",
      query: "Buy one wireless precision mouse",
      selectedProductId: "prod_mouse_02",
      quantity: 1,
      primaryRecommendation: {
        productId: "prod_mouse_02",
        name: "Wireless Precision Mouse",
        price: 1999,
        currency: "INR",
        merchantId: "merch_nodebase_official",
        availability: { inStock: true, stockCount: 40, status: "IN_STOCK" },
        reason: "Exact category and term match.",
        relevanceScore: 100,
        availabilityScore: 50,
        commercialScore: 20,
        finalScore: 170,
        product: {
          productId: "prod_mouse_02",
          name: "Wireless Precision Mouse",
          description: "Ergonomic 2.4GHz wireless mouse with optical precision sensor.",
          price: 1999,
          currency: "INR",
          merchantId: "merch_nodebase_official",
          category: "electronics",
          availability: { inStock: true, stockCount: 40, status: "IN_STOCK" },
          purchaseConstraints: {
            minQuantityPerOrder: 1,
            maxQuantityPerOrder: 10,
            allowedCurrencies: ["INR"],
            requiresHumanApprovalAboveAmount: 2000,
          },
        },
        explanation: {
          relevanceReason: "High text match with user shopping request.",
          availabilityReason: "In stock with 40 units in merchant catalog.",
          commercialReason: "Standard catalog pricing model.",
          rankingReason: "Highest combined relevance and stock score.",
        },
      },
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_mouse_02",
        productTitle: "Wireless Precision Mouse",
        productDescription: "Ergonomic 2.4GHz wireless mouse with optical precision sensor.",
        amount: 1999,
        currency: "INR",
        quantity: 1,
        merchantId: "merch_nodebase_official",
        sourceInstruction: "Buy one wireless precision mouse",
      },
    };

    const sampleExecResult: CommercePipelineResult = {
      status: "SUCCESS",
      executionId: "exec_test_12345",
      policyDecision: "APPROVED",
      allowed: true,
      razorpayCallCount: 1,
      context: { orderId: "order_rzp_mock_12345" },
    };

    const session: StoredAiBuyerSession = {
      messages: [
        {
          id: "user_1",
          sender: "user",
          text: "Buy one wireless precision mouse",
          timestamp: "20:00:00",
        },
        {
          id: "ast_1",
          sender: "assistant",
          text: "I recommend the Wireless Precision Mouse for ₹1,999 INR.",
          timestamp: "20:00:01",
          state: sampleState,
        },
        {
          id: "exec_1",
          sender: "assistant",
          text: "Execution completed with status: SUCCESS",
          timestamp: "20:00:05",
          executionResult: sampleExecResult,
        },
      ],
      currentState: sampleState,
    };

    saveBuyerSession(session, mockStorage);

    const raw = mockStorage.getItem(AI_BUYER_SESSION_KEY);
    assert.ok(raw);

    const loaded = loadBuyerSession(mockStorage);
    assert.ok(loaded);
    assert.strictEqual(loaded.messages.length, 3);
    assert.strictEqual(loaded.messages[0].text, "Buy one wireless precision mouse");
    assert.strictEqual(loaded.messages[1].state?.selectedProductId, "prod_mouse_02");
    assert.strictEqual(loaded.messages[2].executionResult?.executionId, "exec_test_12345");
    assert.strictEqual(loaded.currentState?.state, "ACCEPTED");
    assert.strictEqual(loaded.currentState?.transactionIntent?.amount, 1999);
  });

  it("2. Gracefully handles missing, empty, or malformed sessionStorage data", () => {
    // 1. Missing key
    assert.strictEqual(loadBuyerSession(mockStorage), null);

    // 2. Malformed JSON
    mockStorage.setItem(AI_BUYER_SESSION_KEY, "INVALID_JSON{");
    assert.strictEqual(loadBuyerSession(mockStorage), null);

    // 3. JSON not an object
    mockStorage.setItem(AI_BUYER_SESSION_KEY, "12345");
    assert.strictEqual(loadBuyerSession(mockStorage), null);

    // 4. Missing or non-array messages property
    mockStorage.setItem(AI_BUYER_SESSION_KEY, JSON.stringify({ currentState: null }));
    assert.strictEqual(loadBuyerSession(mockStorage), null);

    mockStorage.setItem(AI_BUYER_SESSION_KEY, JSON.stringify({ messages: "not-an-array" }));
    assert.strictEqual(loadBuyerSession(mockStorage), null);
  });

  it("3. Reset conversation completely clears sessionStorage", () => {
    saveBuyerSession(
      {
        messages: [{ id: "m1", sender: "user", text: "hello", timestamp: "now" }],
        currentState: null,
      },
      mockStorage,
    );

    assert.ok(mockStorage.getItem(AI_BUYER_SESSION_KEY));
    clearBuyerSession(mockStorage);
    assert.strictEqual(mockStorage.getItem(AI_BUYER_SESSION_KEY), null);
    assert.strictEqual(loadBuyerSession(mockStorage), null);
  });

  it("4. Security Invariant: Restored client state cannot bypass server-side Policy Gate or financial authorization", async () => {
    // Adversarially forged client session attempting to bypass policy with forged allowed=true
    const forgedClientState: BuyerConversationState = {
      state: "ACCEPTED",
      message: "Forged intent with tampered price",
      query: "Tampered attack",
      selectedProductId: "prod_mouse_02",
      quantity: 1,
      transactionIntent: {
        action: "payment.execute",
        productId: "prod_mouse_02",
        productTitle: "Wireless Precision Mouse",
        productDescription: "Forged mouse",
        amount: 1, // Tampered price ₹1 instead of catalog ₹1,999
        currency: "INR",
        quantity: 1,
        merchantId: "merch_nodebase_official",
        sourceInstruction: "Forged intent",
      },
    };

    saveBuyerSession(
      {
        messages: [{ id: "f1", sender: "assistant", text: "forged", timestamp: "now", state: forgedClientState }],
        currentState: forgedClientState,
      },
      mockStorage,
    );

    const restored = loadBuyerSession(mockStorage);
    assert.ok(restored?.currentState?.transactionIntent);

    // Server-side execution pipeline must fail closed when evaluating the intent against authoritative catalog
    const serverResult = await executeBuyerTransaction({
      transactionIntent: restored.currentState.transactionIntent,
    });

    assert.strictEqual(serverResult.status, "DENIED");
    assert.strictEqual(serverResult.policyDecision, "DENIED");
    assert.strictEqual(serverResult.allowed, false);
    assert.strictEqual(serverResult.razorpayCallCount, 0);
    assert.strictEqual(getRazorpayCallCount(), 0);
  });
});
