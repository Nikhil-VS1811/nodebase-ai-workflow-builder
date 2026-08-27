"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { razorpayChannel } from "@/inngest/channels/razorpay";
import { inngest } from "@/inngest/client";

export type RazorpayToken = Realtime.Token<
  typeof razorpayChannel,
  ["status"]
>;

export async function fetchRazorpayRealtimeToken(): Promise<RazorpayToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: razorpayChannel(),
    topics: ["status"],
  });

  return token;
}
