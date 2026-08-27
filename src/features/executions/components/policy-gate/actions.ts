"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { policyGateChannel } from "@/inngest/channels/policy-gate";
import { inngest } from "@/inngest/client";

export type PolicyGateToken = Realtime.Token<
  typeof policyGateChannel,
  ["status"]
>;

export async function fetchPolicyGateRealtimeToken(): Promise<PolicyGateToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: policyGateChannel(),
    topics: ["status"],
  });

  return token;
}
