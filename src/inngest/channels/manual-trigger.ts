import { channel, topic } from "@inngest/realtime";

export const MANUAL_TRIGGER_CHANNEL_NAME = "manual-trigger-execution";

export const manualTriggerChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return MANUAL_TRIGGER_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${MANUAL_TRIGGER_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
