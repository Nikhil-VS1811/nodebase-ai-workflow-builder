"use server";

import type { Realtime } from "@inngest/realtime";
import { discordChannel } from "@/inngest/channels/discord";
import {
  mintRealtimeSubscriptionToken,
  type RealtimeTokenRequestOptions,
} from "@/inngest/realtime-auth";

export type DiscordToken = Realtime.Token<typeof discordChannel, ["status"]>;

export async function fetchDiscordRealtimeToken(
  options?: RealtimeTokenRequestOptions,
): Promise<DiscordToken> {
  return mintRealtimeSubscriptionToken(discordChannel, options);
}
