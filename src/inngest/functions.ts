import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import prisma from "@/lib/db";
import { topologicalSort } from "./utils";
import { ExecutionStatus, NodeType, Prisma } from "@/generated/prisma";
import { getExecutor } from "@/features/executions/lib/executor-registry";
import { httpRequestChannel } from "./channels/http-request";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { stripeTriggerChannel } from "./channels/stripe-trigger";
import { geminiChannel } from "./channels/gemini";
import { openAiChannel } from "./channels/openai";
import { anthropicChannel } from "./channels/anthropic";
import { discordChannel } from "./channels/discord";
import { slackChannel } from "./channels/slack";
import { policyGateChannel } from "./channels/policy-gate";
import { razorpayChannel } from "./channels/razorpay";
import { aiBuyerChannel } from "./channels/ai-buyer";
import { buildDecisionReceipt } from "@/lib/decisionReceipt";

export const executeWorkflow = inngest.createFunction(
  { 
    id: "execute-workflow",
    retries: process.env.NODE_ENV === "production" ? 3 : 0,
    onFailure: async ({ event }) => {
      const inngestEventId = event.data.event.id;
      const execution = await prisma.execution.findUnique({
        where: { inngestEventId },
      });

      if (execution) {
        const existingContext = (execution.output as Record<string, unknown>) || {};
        const failureReceipt = buildDecisionReceipt({
          executionId: execution.id,
          workflowId: execution.workflowId,
          context: existingContext,
          finalOutcome: {
            status: "FAILED",
            reason: event.data.error.message,
            completedAt: new Date().toISOString(),
          },
        });

        const updatedContext = {
          ...existingContext,
          decisionReceipt: failureReceipt,
        };

        await prisma.decisionReceipt.upsert({
          where: { executionId: execution.id },
          create: {
            executionId: execution.id,
            workflowId: execution.workflowId,
            receiptVersion: failureReceipt.receiptVersion,
            integrityHash: failureReceipt.integrityHash,
            payload: failureReceipt.payload as unknown as Prisma.InputJsonValue,
          },
          update: {
            integrityHash: failureReceipt.integrityHash,
            payload: failureReceipt.payload as unknown as Prisma.InputJsonValue,
          },
        });

        return prisma.execution.update({
          where: { inngestEventId },
          data: {
            status: ExecutionStatus.FAILED,
            error: event.data.error.message,
            errorStack: event.data.error.stack,
            output: updatedContext as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
      }

      return prisma.execution.update({
        where: { inngestEventId },
        data: {
          status: ExecutionStatus.FAILED,
          error: event.data.error.message,
          errorStack: event.data.error.stack,
        },
      });
    },
  },
  { 
    event: "workflows/execute.workflow",
    channels: [
      httpRequestChannel(),
      manualTriggerChannel(),
      googleFormTriggerChannel(),
      stripeTriggerChannel(),
      geminiChannel(),
      openAiChannel(),
      anthropicChannel(),
      discordChannel(),
      slackChannel(),
      policyGateChannel(),
      razorpayChannel(),
      aiBuyerChannel(),
    ],
  },
  async ({ event, step, publish }) => {
    const inngestEventId = event.id;
    const workflowId = event.data.workflowId;

    if (!inngestEventId || !workflowId) {
      throw new NonRetriableError("Event ID or workflow ID is missing");
    }

    const execution = await step.run("create-execution", async () => {
      return prisma.execution.create({
        data: {
          workflowId,
          inngestEventId,
        },
      });
    });

    const sortedNodes = await step.run("prepare-workflow", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: {
          nodes: true,
          connections: true,
        },
      });

      return topologicalSort(workflow.nodes, workflow.connections);
    });

    const userId = await step.run("find-user-id", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        select: {
          userId: true,
        },
      });

      return workflow.userId;
    });

    // Initialize context with any initial data from the trigger
    let context = event.data.initialData || {};

    // Execute each node
    for (const node of sortedNodes) {
      const executor = getExecutor(node.type as NodeType);
      context = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        userId,
        context,
        step,
        publish,
      });

      // If a node flagged pending human approval (e.g. Policy Gate escalation), halt execution before downstream nodes
      if (context.__pendingApproval === true) {
        await step.run("set-pending-approval", async () => {
          const pendingReceipt = buildDecisionReceipt({
            executionId: execution.id,
            workflowId,
            context,
            finalOutcome: {
              status: "PENDING_APPROVAL",
              reason: "Transaction exceeded automated limits. Human confirmation required.",
              completedAt: new Date().toISOString(),
            },
          });

          const contextWithReceipt = {
            ...context,
            decisionReceipt: pendingReceipt,
          };

          await prisma.decisionReceipt.upsert({
            where: { executionId: execution.id },
            create: {
              executionId: execution.id,
              workflowId,
              receiptVersion: pendingReceipt.receiptVersion,
              integrityHash: pendingReceipt.integrityHash,
              payload: pendingReceipt.payload as unknown as Prisma.InputJsonValue,
            },
            update: {
              integrityHash: pendingReceipt.integrityHash,
              payload: pendingReceipt.payload as unknown as Prisma.InputJsonValue,
            },
          });

          return prisma.execution.update({
            where: { inngestEventId, workflowId },
            data: {
              status: ExecutionStatus.PENDING_APPROVAL,
              output: contextWithReceipt as unknown as Prisma.InputJsonValue,
            },
          });
        });

        return {
          workflowId,
          status: ExecutionStatus.PENDING_APPROVAL,
          result: context,
        };
      }
    }

    await step.run("update-execution", async () => {
      const finalReceipt = buildDecisionReceipt({
        executionId: execution.id,
        workflowId,
        context,
        finalOutcome: {
          status: "VERIFIED",
          reason: "Commerce transaction executed and verified successfully",
          completedAt: new Date().toISOString(),
        },
      });

      const finalContext = {
        ...context,
        decisionReceipt: finalReceipt,
      };

      await prisma.decisionReceipt.upsert({
        where: { executionId: execution.id },
        create: {
          executionId: execution.id,
          workflowId,
          receiptVersion: finalReceipt.receiptVersion,
          integrityHash: finalReceipt.integrityHash,
          payload: finalReceipt.payload as unknown as Prisma.InputJsonValue,
        },
        update: {
          integrityHash: finalReceipt.integrityHash,
          payload: finalReceipt.payload as unknown as Prisma.InputJsonValue,
        },
      });

      return prisma.execution.update({
        where: { inngestEventId, workflowId },
        data: {
          status: ExecutionStatus.SUCCESS,
          completedAt: new Date(),
          output: finalContext as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return {
      workflowId,
      result: context,
    };
  },
);
