"use server";

import type { Realtime } from "@inngest/realtime";
import { manualTriggerChannel } from "@/inngest/channels/manual-trigger";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type ManualTriggerToken = Realtime.Token<
  typeof manualTriggerChannel,
  ["status"]
>;

export async function fetchManualTriggerRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<ManualTriggerToken> {
  return mintRealtimeSubscriptionToken(manualTriggerChannel, options);
}
