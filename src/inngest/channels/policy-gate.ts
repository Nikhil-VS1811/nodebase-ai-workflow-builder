import { channel, topic } from "@inngest/realtime";

export const POLICY_GATE_CHANNEL_NAME = "policy-gate-execution";

export const policyGateChannel = channel(POLICY_GATE_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
