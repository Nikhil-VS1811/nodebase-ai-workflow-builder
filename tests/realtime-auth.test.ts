import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { googleFormTriggerExecutor } from "../src/features/triggers/components/google-form-trigger/executor";
import { manualTriggerExecutor } from "../src/features/triggers/components/manual-trigger/executor";
import { stripeTriggerExecutor } from "../src/features/triggers/components/stripe-trigger/executor";
import {
  ANTHROPIC_CHANNEL_NAME,
  anthropicChannel,
} from "../src/inngest/channels/anthropic";
import {
  DISCORD_CHANNEL_NAME,
  discordChannel,
} from "../src/inngest/channels/discord";
import {
  GEMINI_CHANNEL_NAME,
  geminiChannel,
} from "../src/inngest/channels/gemini";
import {
  GOOGLE_FORM_TRIGGER_CHANNEL_NAME,
  googleFormTriggerChannel,
} from "../src/inngest/channels/google-form-trigger";
import {
  HTTP_REQUEST_CHANNEL_NAME,
  httpRequestChannel,
} from "../src/inngest/channels/http-request";
import {
  MANUAL_TRIGGER_CHANNEL_NAME,
  manualTriggerChannel,
} from "../src/inngest/channels/manual-trigger";
import {
  OPENAI_CHANNEL_NAME,
  openAiChannel,
} from "../src/inngest/channels/openai";
import {
  SLACK_CHANNEL_NAME,
  slackChannel,
} from "../src/inngest/channels/slack";
import {
  STRIPE_TRIGGER_CHANNEL_NAME,
  stripeTriggerChannel,
} from "../src/inngest/channels/stripe-trigger";
import {
  authorizeRealtimeSubscription,
  buildUserScopedChannelId,
  matchesRealtimeChannel,
  mintRealtimeSubscriptionToken,
  type RealtimeAuthDependencies,
} from "../src/inngest/realtime-auth";

const allRealtimeChannels = [
  { name: OPENAI_CHANNEL_NAME, def: openAiChannel },
  { name: GEMINI_CHANNEL_NAME, def: geminiChannel },
  { name: ANTHROPIC_CHANNEL_NAME, def: anthropicChannel },
  { name: HTTP_REQUEST_CHANNEL_NAME, def: httpRequestChannel },
  { name: SLACK_CHANNEL_NAME, def: slackChannel },
  { name: DISCORD_CHANNEL_NAME, def: discordChannel },
  { name: MANUAL_TRIGGER_CHANNEL_NAME, def: manualTriggerChannel },
  { name: GOOGLE_FORM_TRIGGER_CHANNEL_NAME, def: googleFormTriggerChannel },
  { name: STRIPE_TRIGGER_CHANNEL_NAME, def: stripeTriggerChannel },
] as const;

describe("Realtime Server Action Authentication & Channel Isolation", () => {
  describe("Unauthenticated Access Rejection", () => {
    test("rejects unauthenticated callers across all 9 realtime channels without minting tokens", async () => {
      let mintCalled = false;

      const unauthDeps: RealtimeAuthDependencies = {
        getSession: async () => null,
        mintToken: async ({ channel, topics }) => {
          mintCalled = true;
          return { channel, topics, key: "should-not-be-issued" };
        },
      };

      for (const { def } of allRealtimeChannels) {
        await assert.rejects(
          () =>
            mintRealtimeSubscriptionToken(
              def,
              { nodeId: "node-1" },
              unauthDeps,
            ),
          /Unauthorized: Authentication required/,
        );
      }

      assert.equal(mintCalled, false);
    });

    test("rejects sessions with blank user ID", async () => {
      await assert.rejects(
        () =>
          authorizeRealtimeSubscription(
            { nodeId: "node-1" },
            {
              getSession: async () => ({ user: { id: "   " } }),
            },
          ),
        /Unauthorized: Authentication required/,
      );
    });
  });

  describe("Cross-User Workflow and Node Ownership Enforcement", () => {
    const userADeps: RealtimeAuthDependencies = {
      getSession: async () => ({ user: { id: "user-a" } }),
      findWorkflowById: async (workflowId) => {
        if (workflowId === "wf-user-a") {
          return { id: "wf-user-a", userId: "user-a" };
        }
        if (workflowId === "wf-user-b") {
          return { id: "wf-user-b", userId: "user-b" };
        }
        return null;
      },
      findNodeById: async (nodeId) => {
        if (nodeId === "node-user-a") {
          return {
            id: "node-user-a",
            workflowId: "wf-user-a",
            workflow: { userId: "user-a" },
          };
        }
        if (nodeId === "node-user-b") {
          return {
            id: "node-user-b",
            workflowId: "wf-user-b",
            workflow: { userId: "user-b" },
          };
        }
        return null;
      },
      mintToken: async ({ channel, topics }) => ({
        channel,
        topics,
        key: `token-for-${channel.name}`,
      }),
    };

    test("prevents authenticated user from subscribing to another user's workflowId", async () => {
      await assert.rejects(
        () =>
          mintRealtimeSubscriptionToken(
            openAiChannel,
            { workflowId: "wf-user-b" },
            userADeps,
          ),
        /Forbidden: You do not have access to this workflow/,
      );
    });

    test("prevents authenticated user from subscribing to a nonexistent workflowId", async () => {
      await assert.rejects(
        () =>
          mintRealtimeSubscriptionToken(
            openAiChannel,
            { workflowId: "wf-does-not-exist" },
            userADeps,
          ),
        /Forbidden: You do not have access to this workflow/,
      );
    });

    test("prevents authenticated user from subscribing to another user's persisted nodeId", async () => {
      for (const { def } of allRealtimeChannels) {
        await assert.rejects(
          () =>
            mintRealtimeSubscriptionToken(
              def,
              { nodeId: "node-user-b" },
              userADeps,
            ),
          /Forbidden: You do not have access to this workflow node/,
        );
      }
    });

    test("rejects mismatched workflowId and nodeId even when both belong to caller", async () => {
      const depsWithSecondWorkflow: RealtimeAuthDependencies = {
        ...userADeps,
        findWorkflowById: async (workflowId) => ({
          id: workflowId,
          userId: "user-a",
        }),
      };

      await assert.rejects(
        () =>
          mintRealtimeSubscriptionToken(
            openAiChannel,
            { workflowId: "wf-user-a-other", nodeId: "node-user-a" },
            depsWithSecondWorkflow,
          ),
        /Forbidden: Node does not belong to the specified workflow/,
      );
    });

    test("rejects empty workflowId or nodeId strings", async () => {
      await assert.rejects(
        () =>
          mintRealtimeSubscriptionToken(
            openAiChannel,
            { workflowId: "   " },
            userADeps,
          ),
        /Bad Request: workflowId cannot be empty/,
      );

      await assert.rejects(
        () =>
          mintRealtimeSubscriptionToken(
            openAiChannel,
            { nodeId: "" },
            userADeps,
          ),
        /Bad Request: nodeId cannot be empty/,
      );
    });
  });

  describe("Authorized Realtime Subscription & User-Scoped Channel Isolation", () => {
    test("mints user-scoped tokens for authorized persisted nodes across all 9 channels", async () => {
      const deps: RealtimeAuthDependencies = {
        getSession: async () => ({ user: { id: "user-a" } }),
        findWorkflowById: async () => ({ id: "wf-user-a", userId: "user-a" }),
        findNodeById: async () => ({
          id: "node-user-a",
          workflowId: "wf-user-a",
          workflow: { userId: "user-a" },
        }),
        mintToken: async ({ channel, topics }) => ({
          channel,
          topics,
          key: `signed-${channel.name}`,
        }),
      };

      for (const { name, def } of allRealtimeChannels) {
        const token = await mintRealtimeSubscriptionToken(
          def,
          { nodeId: "node-user-a", workflowId: "wf-user-a" },
          deps,
        );

        assert.equal(token.channel.name, `${name}:user-a`);
        assert.deepEqual(token.topics, ["status"]);
        assert.equal(token.key, `signed-${name}:user-a`);
      }
    });

    test("allows newly added unsaved canvas nodes while still isolating channel to authenticated userId", async () => {
      const deps: RealtimeAuthDependencies = {
        getSession: async () => ({ user: { id: "user-a" } }),
        findNodeById: async () => null, // Node just added in React Flow, not saved yet
        mintToken: async ({ channel, topics }) => ({
          channel,
          topics,
          key: `signed-${channel.name}`,
        }),
      };

      const token = await mintRealtimeSubscriptionToken(
        openAiChannel,
        { nodeId: "unsaved-cuid-node" },
        deps,
      );

      assert.equal(token.channel.name, "openai-execution:user-a");
      assert.notEqual(String(token.channel.name), "openai-execution:user-b");
    });

    test("executors publish status events strictly to the workflow owner's user-scoped channel", async () => {
      const publishedMessages: Array<{
        channel: string;
        topic: string;
        data: { nodeId: string; status: string };
      }> = [];

      const mockPublish = (async (
        msgPromise: Promise<{
          channel: string;
          topic: string;
          data: { nodeId: string; status: string };
        }>,
      ) => {
        const msg = await msgPromise;
        publishedMessages.push(msg);
        return msg.data;
      }) as unknown as Parameters<typeof manualTriggerExecutor>[0]["publish"];

      const mockStep = {
        run: async <T>(_id: string, fn: () => Promise<T> | T) => await fn(),
      } as unknown as Parameters<typeof manualTriggerExecutor>[0]["step"];

      await manualTriggerExecutor({
        data: {},
        nodeId: "node-m1",
        userId: "user-owner-123",
        context: {},
        step: mockStep,
        publish: mockPublish,
      });

      await googleFormTriggerExecutor({
        data: {},
        nodeId: "node-gf1",
        userId: "user-owner-123",
        context: {},
        step: mockStep,
        publish: mockPublish,
      });

      await stripeTriggerExecutor({
        data: {},
        nodeId: "node-s1",
        userId: "user-owner-123",
        context: {},
        step: mockStep,
        publish: mockPublish,
      });

      assert.equal(publishedMessages.length, 6);
      assert.equal(
        publishedMessages[0].channel,
        "manual-trigger-execution:user-owner-123",
      );
      assert.equal(
        publishedMessages[2].channel,
        "google-form-trigger-execution:user-owner-123",
      );
      assert.equal(
        publishedMessages[4].channel,
        "stripe-trigger-execution:user-owner-123",
      );
    });

    test("matchesRealtimeChannel matches base and user-scoped channels while rejecting other channels", () => {
      assert.equal(
        matchesRealtimeChannel(
          buildUserScopedChannelId(OPENAI_CHANNEL_NAME, "user-1"),
          OPENAI_CHANNEL_NAME,
        ),
        true,
      );
      assert.equal(
        matchesRealtimeChannel(OPENAI_CHANNEL_NAME, OPENAI_CHANNEL_NAME),
        true,
      );
      assert.equal(
        matchesRealtimeChannel("gemini-execution:user-1", OPENAI_CHANNEL_NAME),
        false,
      );
      assert.equal(
        matchesRealtimeChannel(undefined, OPENAI_CHANNEL_NAME),
        false,
      );
    });

    test("channel definitions reject empty or whitespace userId strings instead of falling back to global channel", () => {
      for (const { def } of allRealtimeChannels) {
        assert.throws(
          () => def(""),
          /Realtime channel requires a non-empty userId/,
        );
        assert.throws(
          () => def("   "),
          /Realtime channel requires a non-empty userId/,
        );
      }

      assert.throws(
        () => buildUserScopedChannelId(OPENAI_CHANNEL_NAME, ""),
        /Realtime channel requires a non-empty userId/,
      );
    });
  });
});
