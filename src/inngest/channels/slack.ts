import { channel, topic } from "@inngest/realtime";

export const SLACK_CHANNEL_NAME = "slack-execution";

export const slackChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return SLACK_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${SLACK_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
