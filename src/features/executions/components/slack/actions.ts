"use server";

import type { Realtime } from "@inngest/realtime";
import { slackChannel } from "@/inngest/channels/slack";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type SlackToken = Realtime.Token<typeof slackChannel, ["status"]>;

export async function fetchSlackRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<SlackToken> {
  return mintRealtimeSubscriptionToken(slackChannel, options);
}
