import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { manualTriggerChannel } from "@/inngest/channels/manual-trigger";

type ManualTriggerData = {
  payload?: string;
};

export const manualTriggerExecutor: NodeExecutor<ManualTriggerData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    manualTriggerChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const result = await step.run(`manual-trigger-${nodeId}`, async () => {
    // If no payload was configured, just pass the existing context through.
    if (!data.payload || data.payload.trim() === "") {
      return context;
    }

    let parsed: Record<string, unknown>;
    try {
      const raw = JSON.parse(data.payload);
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("Payload must be a JSON object, not an array or primitive.");
      }
      parsed = raw as Record<string, unknown>;
    } catch (err) {
      throw new NonRetriableError(
        `Manual Trigger [${nodeId}]: Invalid JSON payload — ${(err as Error).message}`,
      );
    }

    // Spread the parsed payload into the workflow context so all top-level
    // keys (e.g. "transactionIntent") are immediately available to downstream
    // nodes like the Policy Gate.
    return { ...context, ...parsed };
  });

  await publish(
    manualTriggerChannel().status({
      nodeId,
      status: "success",
    }),
  );

  return result;
};
