import { channel, topic } from "@inngest/realtime";

export const GOOGLE_FORM_TRIGGER_CHANNEL_NAME = "google-form-trigger-execution";

export const googleFormTriggerChannel = channel((userId?: string) => {
  if (userId === undefined) {
    return GOOGLE_FORM_TRIGGER_CHANNEL_NAME;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${GOOGLE_FORM_TRIGGER_CHANNEL_NAME}:${normalizedUserId}`;
}).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
