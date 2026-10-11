import { channel, topic } from "@inngest/realtime";

export const GEMINI_CHANNEL_NAME = "gemini-execution";

export const geminiChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return GEMINI_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${GEMINI_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
