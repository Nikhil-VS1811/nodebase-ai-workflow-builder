"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { aiBuyerChannel } from "@/inngest/channels/ai-buyer";
import { inngest } from "@/inngest/client";

export type AiBuyerToken = Realtime.Token<
  typeof aiBuyerChannel,
  ["status"]
>;

export async function fetchAiBuyerRealtimeToken(): Promise<AiBuyerToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: aiBuyerChannel(),
    topics: ["status"],
  });

  return token;
}
