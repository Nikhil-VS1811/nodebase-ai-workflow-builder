"use server";

import type { Realtime } from "@inngest/realtime";
import { googleFormTriggerChannel } from "@/inngest/channels/google-form-trigger";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type GoogleFormTriggerToken = Realtime.Token<
  typeof googleFormTriggerChannel,
  ["status"]
>;

export async function fetchGoogleFormTriggerRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<GoogleFormTriggerToken> {
  return mintRealtimeSubscriptionToken(googleFormTriggerChannel, options);
}
