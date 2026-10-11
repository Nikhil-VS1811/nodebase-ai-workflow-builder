import { channel, topic } from "@inngest/realtime";

export const DISCORD_CHANNEL_NAME = "discord-execution";

export const discordChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return DISCORD_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${DISCORD_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
