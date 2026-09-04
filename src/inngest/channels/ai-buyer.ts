import { channel, topic } from "@inngest/realtime";

export const AI_BUYER_CHANNEL_NAME = "ai-buyer-execution";

export const aiBuyerChannel = channel(AI_BUYER_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
