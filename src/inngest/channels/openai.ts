import { channel, topic } from "@inngest/realtime";

export const OPENAI_CHANNEL_NAME = "openai-execution";

export const openAiChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return OPENAI_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${OPENAI_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
