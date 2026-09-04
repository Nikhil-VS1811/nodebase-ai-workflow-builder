import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import { ExecutionStatus, Prisma } from "@/generated/prisma";
import { TRPCError } from "@trpc/server";
import { sendWorkflowExecution } from "@/inngest/utils";
import {
  type HumanApprovalRecord,
  type PolicyEvaluationResult,
  createHumanApprovalRecord,
} from "@/lib/policyEngine";
import { buildDecisionReceipt, verifyReceiptIntegrity } from "@/lib/decisionReceipt";

export const executionsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return prisma.execution.findUniqueOrThrow({
        where: { 
          id: input.id, 
          workflow: { 
            userId: ctx.auth.user.id,
          },
        },
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
          decisionReceipt: true,
        },
      });
    }),

  getReceipt: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const receipt = await prisma.decisionReceipt.findFirst({
        where: {
          executionId: input.executionId,
          workflow: {
            userId: ctx.auth.user.id,
          },
        },
      });

      if (!receipt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Decision receipt not found for this execution.",
        });
      }

      const verification = verifyReceiptIntegrity({
        payload: receipt.payload,
        integrityHash: receipt.integrityHash,
      });

      return {
        ...receipt,
        verification,
      };
    }),

  getMany: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize } = input;

      const [items, totalCount] = await Promise.all([
        prisma.execution.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: { 
            workflow: {
              userId: ctx.auth.user.id,
            },
          },
          orderBy: {
            startedAt: "desc",
          },
          include: {
            workflow: {
              select: {
                id: true,
                name: true,
              },
            },
            decisionReceipt: true,
          },
        }),
        prisma.execution.count({
          where: {
            workflow: {
              userId: ctx.auth.user.id,
            },
          },
        }),
      ]);

      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    }),

  approve: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const execution = await prisma.execution.findUniqueOrThrow({
        where: {
          id: input.id,
          workflow: {
            userId: ctx.auth.user.id,
          },
        },
      });

      if (execution.status !== ExecutionStatus.PENDING_APPROVAL) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Execution is in '${execution.status}' state and cannot be approved.`,
        });
      }

      const existingContext = (execution.output as Record<string, unknown>) || {};
      const policyEvaluation = existingContext.policyEvaluation as PolicyEvaluationResult | undefined;

      if (!policyEvaluation || policyEvaluation.decision !== "ESCALATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Execution does not contain an escalated policy evaluation requiring human approval.",
        });
      }

      // Check double-approval
      if (policyEvaluation.humanApproval?.approved === true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This transaction has already been approved.",
        });
      }

      const humanApproval = createHumanApprovalRecord({
        approved: true,
        approverId: ctx.auth.user.id,
        approverName: ctx.auth.user.name || undefined,
        approverEmail: ctx.auth.user.email,
        notes: input.notes,
      });

      const updatedContext: Record<string, unknown> = {
        ...existingContext,
        __pendingApproval: false,
        rootExecutionId: execution.id,
        policyEvaluation: {
          ...policyEvaluation,
          allowed: true, // Server-verified approval
          humanApproval,
        },
      };

      // Atomic update to transition status and prevent concurrent double-approvals
      const updateCount = await prisma.execution.updateMany({
        where: {
          id: input.id,
          workflow: {
            userId: ctx.auth.user.id,
          },
          status: ExecutionStatus.PENDING_APPROVAL,
        },
        data: {
          status: ExecutionStatus.RUNNING,
          output: updatedContext as Prisma.InputJsonValue,
        },
      });

      if (updateCount.count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Execution approval state was modified concurrently.",
        });
      }

      // Resume workflow with approved context
      await sendWorkflowExecution({
        workflowId: execution.workflowId,
        initialData: updatedContext,
      });

      return prisma.execution.findUniqueOrThrow({
        where: { id: input.id },
        include: { decisionReceipt: true },
      });
    }),

  reject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const execution = await prisma.execution.findUniqueOrThrow({
        where: {
          id: input.id,
          workflow: {
            userId: ctx.auth.user.id,
          },
        },
      });

      if (execution.status !== ExecutionStatus.PENDING_APPROVAL) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Execution is in '${execution.status}' state and cannot be rejected.`,
        });
      }

      const existingContext = (execution.output as Record<string, unknown>) || {};
      const policyEvaluation = existingContext.policyEvaluation as PolicyEvaluationResult | undefined;

      const humanApproval = createHumanApprovalRecord({
        approved: false,
        approverId: ctx.auth.user.id,
        approverName: ctx.auth.user.name || undefined,
        approverEmail: ctx.auth.user.email,
        notes: input.reason,
      });

      const updatedPolicy = policyEvaluation
        ? {
            ...policyEvaluation,
            allowed: false,
            humanApproval,
          }
        : undefined;

      const rejectionReason = input.reason || "Transaction rejected by human approver.";

      const updatedContext: Record<string, unknown> = {
        ...existingContext,
        __pendingApproval: false,
        policyEvaluation: updatedPolicy,
      };

      const rejectedReceipt = buildDecisionReceipt({
        executionId: execution.id,
        workflowId: execution.workflowId,
        context: updatedContext,
        finalOutcome: {
          status: "REJECTED",
          reason: rejectionReason,
          completedAt: new Date().toISOString(),
        },
      });

      updatedContext.decisionReceipt = rejectedReceipt;

      await prisma.decisionReceipt.upsert({
        where: { executionId: execution.id },
        create: {
          executionId: execution.id,
          workflowId: execution.workflowId,
          receiptVersion: rejectedReceipt.receiptVersion,
          integrityHash: rejectedReceipt.integrityHash,
          payload: rejectedReceipt.payload as unknown as Prisma.InputJsonValue,
        },
        update: {
          integrityHash: rejectedReceipt.integrityHash,
          payload: rejectedReceipt.payload as unknown as Prisma.InputJsonValue,
        },
      });

      // Atomic update to mark FAILED and stop permanently
      const updateCount = await prisma.execution.updateMany({
        where: {
          id: input.id,
          workflow: {
            userId: ctx.auth.user.id,
          },
          status: ExecutionStatus.PENDING_APPROVAL,
        },
        data: {
          status: ExecutionStatus.FAILED,
          error: rejectionReason,
          completedAt: new Date(),
          output: updatedContext as Prisma.InputJsonValue,
        },
      });

      if (updateCount.count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Execution state was modified concurrently.",
        });
      }

      return prisma.execution.findUniqueOrThrow({
        where: { id: input.id },
        include: { decisionReceipt: true },
      });
    }),
});
