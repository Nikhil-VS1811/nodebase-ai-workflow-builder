"use server";

import type { Realtime } from "@inngest/realtime";
import { geminiChannel } from "@/inngest/channels/gemini";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type GeminiToken = Realtime.Token<typeof geminiChannel, ["status"]>;

export async function fetchGeminiRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<GeminiToken> {
  return mintRealtimeSubscriptionToken(geminiChannel, options);
}
