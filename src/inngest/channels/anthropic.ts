import { channel, topic } from "@inngest/realtime";

export const ANTHROPIC_CHANNEL_NAME = "anthropic-execution";

export const anthropicChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return ANTHROPIC_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${ANTHROPIC_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
