import { channel, topic } from "@inngest/realtime";

export const HTTP_REQUEST_CHANNEL_NAME = "http-request-execution";

export const httpRequestChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return HTTP_REQUEST_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${HTTP_REQUEST_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
