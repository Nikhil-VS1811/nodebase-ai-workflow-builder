import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { manualTriggerExecutor } from "../src/features/triggers/components/manual-trigger/executor";
import { googleFormTriggerExecutor } from "../src/features/triggers/components/google-form-trigger/executor";
import { stripeTriggerExecutor } from "../src/features/triggers/components/stripe-trigger/executor";

describe("Inngest Step ID Scoping & Determinism", () => {
  function createMockStepRecorder() {
    const recordedStepIds: string[] = [];
    const mockStep = {
      run: async (stepId: string, fn: () => any) => {
        recordedStepIds.push(stepId);
        return await fn();
      },
    };
    return { mockStep, recordedStepIds };
  }

  const mockPublish = async () => {};

  test("manualTriggerExecutor uses nodeId in step ID and is deterministic", async () => {
    const { mockStep, recordedStepIds } = createMockStepRecorder();

    await manualTriggerExecutor({
      data: {},
      nodeId: "trigger-abc-123",
      userId: "user-1",
      context: {},
      step: mockStep as any,
      publish: mockPublish as any,
    });

    assert.equal(recordedStepIds.length, 1);
    assert.equal(recordedStepIds[0], "manual-trigger-trigger-abc-123");

    // Retry test: same nodeId produces identical step ID
    await manualTriggerExecutor({
      data: {},
      nodeId: "trigger-abc-123",
      userId: "user-1",
      context: {},
      step: mockStep as any,
      publish: mockPublish as any,
    });
    assert.equal(recordedStepIds[1], "manual-trigger-trigger-abc-123");
  });

  test("googleFormTriggerExecutor produces distinct step IDs for different nodes", async () => {
    const { mockStep, recordedStepIds } = createMockStepRecorder();

    await googleFormTriggerExecutor({
      data: {},
      nodeId: "gf-node-1",
      userId: "user-1",
      context: { googleForm: { formId: "123" } },
      step: mockStep as any,
      publish: mockPublish as any,
    });

    await googleFormTriggerExecutor({
      data: {},
      nodeId: "gf-node-2",
      userId: "user-1",
      context: { googleForm: { formId: "456" } },
      step: mockStep as any,
      publish: mockPublish as any,
    });

    assert.deepEqual(recordedStepIds, [
      "google-form-trigger-gf-node-1",
      "google-form-trigger-gf-node-2",
    ]);
  });

  test("stripeTriggerExecutor produces distinct step IDs for different nodes", async () => {
    const { mockStep, recordedStepIds } = createMockStepRecorder();

    await stripeTriggerExecutor({
      data: {},
      nodeId: "stripe-node-A",
      userId: "user-1",
      context: { stripe: { eventId: "evt_1" } },
      step: mockStep as any,
      publish: mockPublish as any,
    });

    await stripeTriggerExecutor({
      data: {},
      nodeId: "stripe-node-B",
      userId: "user-1",
      context: { stripe: { eventId: "evt_2" } },
      step: mockStep as any,
      publish: mockPublish as any,
    });

    assert.deepEqual(recordedStepIds, [
      "stripe-trigger-stripe-node-A",
      "stripe-trigger-stripe-node-B",
    ]);
  });
});
