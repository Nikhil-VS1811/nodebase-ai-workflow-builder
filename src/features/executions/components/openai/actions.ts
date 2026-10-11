"use server";

import type { Realtime } from "@inngest/realtime";
import { openAiChannel } from "@/inngest/channels/openai";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type OpenAiToken = Realtime.Token<typeof openAiChannel, ["status"]>;

export async function fetchOpenAiRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<OpenAiToken> {
  return mintRealtimeSubscriptionToken(openAiChannel, options);
}
