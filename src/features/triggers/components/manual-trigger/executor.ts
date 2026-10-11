import type { NodeExecutor } from "@/features/executions/types";
import { manualTriggerChannel } from "@/inngest/channels/manual-trigger";

type ManualTriggerData = Record<string, unknown>;

export const manualTriggerExecutor: NodeExecutor<ManualTriggerData> = async ({
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    manualTriggerChannel(userId).status({
      nodeId,
      status: "loading",
    }),
  );

  const result = await step.run(`manual-trigger-${nodeId}`, async () => context);

  await publish(
    manualTriggerChannel(userId).status({
      nodeId,
      status: "success",
    }),
  );

  return result;
};
