import { channel, topic } from "@inngest/realtime";

export const STRIPE_TRIGGER_CHANNEL_NAME = "stripe-trigger-execution";

export const stripeTriggerChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return STRIPE_TRIGGER_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${STRIPE_TRIGGER_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
