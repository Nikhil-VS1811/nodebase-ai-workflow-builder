import type { NodeExecutor } from "@/features/executions/types";
import { stripeTriggerChannel } from "@/inngest/channels/stripe-trigger";

type StripeTriggerData = Record<string, unknown>;

export const stripeTriggerExecutor: NodeExecutor<StripeTriggerData> = async ({
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    stripeTriggerChannel(userId).status({
      nodeId,
      status: "loading",
    }),
  );

  const result = await step.run(`stripe-trigger-${nodeId}`, async () => context);

  await publish(
    stripeTriggerChannel(userId).status({
      nodeId,
      status: "success",
    }),
  );

  return result;
};
