"use server";

import type { Realtime } from "@inngest/realtime";
import { anthropicChannel } from "@/inngest/channels/anthropic";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type AnthropicToken = Realtime.Token<
  typeof anthropicChannel,
  ["status"]
>;

export async function fetchAnthropicRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<AnthropicToken> {
  return mintRealtimeSubscriptionToken(anthropicChannel, options);
}
