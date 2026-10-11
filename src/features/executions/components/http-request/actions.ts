"use server";

import type { Realtime } from "@inngest/realtime";
import { httpRequestChannel } from "@/inngest/channels/http-request";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type HttpRequestToken = Realtime.Token<
  typeof httpRequestChannel,
  ["status"]
>;

export async function fetchHttpRequestRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<HttpRequestToken> {
  return mintRealtimeSubscriptionToken(httpRequestChannel, options);
}
