"use server";

import type { Realtime } from "@inngest/realtime";
import { stripeTriggerChannel } from "@/inngest/channels/stripe-trigger";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type StripeTriggerToken = Realtime.Token<
  typeof stripeTriggerChannel,
  ["status"]
>;

export async function fetchStripeTriggerRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<StripeTriggerToken> {
  return mintRealtimeSubscriptionToken(stripeTriggerChannel, options);
}
