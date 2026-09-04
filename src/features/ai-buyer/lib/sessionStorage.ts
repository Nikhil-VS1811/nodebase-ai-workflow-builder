import type { BuyerConversationState } from "@/lib/conversationalBuyer";
import type { CommercePipelineResult } from "@/lib/commercePipeline";

export const AI_BUYER_SESSION_KEY = "nodebase:ai-buyer-session";

export interface StoredChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  state?: BuyerConversationState;
  executionResult?: CommercePipelineResult;
}

export interface StoredAiBuyerSession {
  messages: StoredChatMessage[];
  currentState: BuyerConversationState | null;
}

/**
 * Safely loads and parses the AI Buyer conversation session from window.sessionStorage.
 * Returns null if storage is not available, empty, or contains malformed data.
 */
export function loadBuyerSession(storage?: Storage): StoredAiBuyerSession | null {
  try {
    const s = storage || (typeof window !== "undefined" ? window.sessionStorage : undefined);
    if (!s) return null;

    const raw = s.getItem(AI_BUYER_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    if (!Array.isArray(parsed.messages)) return null;

    return {
      messages: parsed.messages,
      currentState: parsed.currentState ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Safely serializes the AI Buyer conversation session to window.sessionStorage.
 */
export function saveBuyerSession(session: StoredAiBuyerSession, storage?: Storage): void {
  try {
    const s = storage || (typeof window !== "undefined" ? window.sessionStorage : undefined);
    if (!s) return;

    s.setItem(
      AI_BUYER_SESSION_KEY,
      JSON.stringify({
        messages: session.messages,
        currentState: session.currentState ?? null,
      }),
    );
  } catch {
    // Ignore storage quota or serialization errors
  }
}

/**
 * Removes the AI Buyer conversation session from window.sessionStorage.
 */
export function clearBuyerSession(storage?: Storage): void {
  try {
    const s = storage || (typeof window !== "undefined" ? window.sessionStorage : undefined);
    if (!s) return;

    s.removeItem(AI_BUYER_SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
}
