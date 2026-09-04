import Razorpay from "razorpay";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { razorpayChannel } from "@/inngest/channels/razorpay";
import type { TransactionIntent, PolicyEvaluationResult } from "@/lib/policyEngine";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { recordRazorpayCall, getRazorpayMockHandler } from "@/lib/razorpayInstrumentation";
import { getActiveFailureInjection } from "@/lib/failureInjection";
import {
  getOrCreatePaymentOrder,
  updatePaymentOrderRazorpayId,
  PaymentOrderStatus,
} from "@/lib/paymentOrder";

type RazorpayExecuteData = {
  /** The key in the workflow context that holds the TransactionIntent object. */
  intentKey?: string;
  /** Key under which the Razorpay response will be stored in context. */
  variableName?: string;
  /** Credential ID referencing stored Razorpay key_id:key_secret. */
  credentialId?: string;
};

export const razorpayExecutor: NodeExecutor<RazorpayExecuteData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    razorpayChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const variableName = data.variableName ?? "razorpayResult";

  // 1. Validate TransactionIntent is present in context
  const intentKey = data.intentKey ?? "transactionIntent";
  const rawIntent = context[intentKey];

  if (!rawIntent || typeof rawIntent !== "object") {
    await publish(
      razorpayChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      `Razorpay node [${nodeId}]: No TransactionIntent found at context key "${intentKey}".`,
    );
  }

  const intent = rawIntent as Partial<TransactionIntent>;

  if (typeof intent.amount !== "number" || isNaN(intent.amount) || intent.amount <= 0) {
    await publish(
      razorpayChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      `Razorpay node [${nodeId}]: Invalid transaction amount (${intent.amount}).`,
    );
  }

  // 2. Strict Server-Side Authorization Boundary Check
  const policyEvaluation = context.policyEvaluation as PolicyEvaluationResult | undefined;

  if (!policyEvaluation || typeof policyEvaluation !== "object") {
    await publish(
      razorpayChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      `Razorpay node [${nodeId}]: Unauthorized execution. Missing policy evaluation in workflow context. All payments must pass Policy Gate before execution.`,
    );
  }

  const decision = policyEvaluation.decision || policyEvaluation.status;

  if (decision === "DENIED") {
    await publish(
      razorpayChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      `Razorpay node [${nodeId}]: Unauthorized execution. Policy Gate rejected transaction (DENIED). Reason: ${policyEvaluation.reason}`,
    );
  }

  if (decision === "ESCALATED") {
    const humanApproval = policyEvaluation.humanApproval;
    if (
      !humanApproval ||
      humanApproval.approved !== true ||
      humanApproval.decision !== "APPROVED_BY_HUMAN"
    ) {
      await publish(
        razorpayChannel().status({
          nodeId,
          status: "error",
        }),
      );
      throw new NonRetriableError(
        `Razorpay node [${nodeId}]: Unauthorized execution. Transaction requires human approval (ESCALATED). Reason: ${policyEvaluation.reason}`,
      );
    }
  } else if (decision !== "APPROVED" || policyEvaluation.allowed !== true) {
    await publish(
      razorpayChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      `Razorpay node [${nodeId}]: Unauthorized execution. Invalid or missing APPROVED policy authorization. Decision: ${decision}, Allowed: ${policyEvaluation.allowed}`,
    );
  }

  // 3. Obtain deterministic idempotencyKey & manage PaymentOrder
  const idempotencyKey =
    (context.idempotencyKey as string) ||
    ((intent as any).idempotencyKey as string) ||
    `idem_${(context.rootExecutionId as string) || (context.executionId as string) || "exec"}_${nodeId}`;

  const executionId =
    (context.rootExecutionId as string) ||
    (context.executionId as string) ||
    (context.inngestEventId as string) ||
    "exec_standalone";

  const paymentOrderRecord = await step.run(`payment-order-init-${nodeId}`, async () => {
    const { order } = await getOrCreatePaymentOrder({
      executionId,
      nodeId,
      idempotencyKey,
      amount: intent.amount!,
      currency: intent.currency || "INR",
      status: PaymentOrderStatus.PENDING,
    });
    return order;
  });

  // If PaymentOrder already contains a confirmed razorpayOrderId, reuse it without calling Razorpay
  let orderResult: any;

  if (paymentOrderRecord?.razorpayOrderId) {
    orderResult = {
      id: paymentOrderRecord.razorpayOrderId,
      amount: Math.round(intent.amount! * 100),
      currency: paymentOrderRecord.currency || intent.currency || "INR",
      receipt: `rcpt_${nodeId.slice(0, 8)}_${idempotencyKey.slice(0, 16)}`,
      status: "created",
    };
  } else {
    // 4. Validate Credential
    if (!data.credentialId) {
      await publish(
        razorpayChannel().status({
          nodeId,
          status: "error",
        }),
      );
      throw new NonRetriableError("Razorpay node: Credential is required");
    }

    const credential = await step.run(`get-credential-${nodeId}`, () => {
      return prisma.credential.findUnique({
        where: {
          id: data.credentialId,
          userId,
        },
      });
    });

    if (!credential) {
      await publish(
        razorpayChannel().status({
          nodeId,
          status: "error",
        }),
      );
      throw new NonRetriableError("Razorpay node: Credential not found");
    }

    const decrypted = decrypt(credential.value);
    const [keyId, keySecret] = decrypted.split(":");

    if (!keyId || !keySecret) {
      await publish(
        razorpayChannel().status({
          nodeId,
          status: "error",
        }),
      );
      throw new NonRetriableError(
        "Razorpay node: Invalid credential format. Expected 'key_id:key_secret'.",
      );
    }

    // 5. Execute Payment Order
    try {
      orderResult = await step.run(`razorpay-execute-${nodeId}`, async () => {
        // Convert amount strictly from Rupees to paise
        const amountInPaise = Math.round(intent.amount! * 100);
        const currency = intent.currency || "INR";
        const receipt = `rcpt_${nodeId.slice(0, 8)}_${idempotencyKey.slice(0, 16)}`;

        const notes: Record<string, string> = {};
        if (intent.merchantId) notes.merchantId = String(intent.merchantId);
        if (intent.productTitle) notes.productTitle = String(intent.productTitle);
        if (intent.action) notes.action = String(intent.action);
        if (intent.productId) notes.productId = String(intent.productId);
        if (intent.quantity !== undefined) notes.quantity = String(intent.quantity);

        // Record Razorpay call at the actual execution boundary
        recordRazorpayCall({
          nodeId,
          amount: amountInPaise,
          currency,
          receipt,
          notes,
        });

        // Server-side failure injection (strictly test/development environment only)
        const failureConfig = getActiveFailureInjection();
        if (
          failureConfig?.enabled &&
          failureConfig.scenario === "RAZORPAY_TIMEOUT" &&
          (!failureConfig.targetNodeId || failureConfig.targetNodeId === nodeId)
        ) {
          throw new Error(
            `Razorpay API Timeout (ETIMEDOUT): Connection to api.razorpay.com timed out on node [${nodeId}].`,
          );
        }

        // Test environment mock handler support (never active in production)
        let order: any;
        const mockHandler = getRazorpayMockHandler();
        if (mockHandler) {
          order = await mockHandler({
            amount: amountInPaise,
            currency,
            receipt,
            notes,
          });
        } else {
          const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
          });

          order = await razorpay.orders.create({
            amount: amountInPaise,
            currency,
            receipt,
            notes,
          });
        }

        // Persist confirmed Razorpay order ID to PaymentOrder record
        if (order?.id) {
          await updatePaymentOrderRazorpayId({
            idempotencyKey,
            razorpayOrderId: order.id,
            status: PaymentOrderStatus.CREATED,
          });
        }

        // Server-side failure injection: DB_FAILURE_AFTER_RAZORPAY_CREATE (test/development only)
        if (
          failureConfig?.enabled &&
          failureConfig.scenario === "DB_FAILURE_AFTER_RAZORPAY_CREATE" &&
          (!failureConfig.targetNodeId || failureConfig.targetNodeId === nodeId)
        ) {
          throw new Error(
            `Database Connection Terminated (P2024): Failed to complete application state persistence after Razorpay order creation [${order?.id}] on node [${nodeId}].`,
          );
        }

        return order;
      });
    } catch (error: any) {
      await publish(
        razorpayChannel().status({
          nodeId,
          status: "error",
        }),
      );

      if (error instanceof NonRetriableError) {
        throw error;
      }

      // Check for HTTP 4xx errors from Razorpay SDK/API
      const statusCode = error?.statusCode || error?.status || error?.error?.statusCode;
      if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
        const description = error?.error?.description || error?.message || "Client error";
        throw new NonRetriableError(`Razorpay API Error (${statusCode}): ${description}`);
      }

      // Rethrow 5xx or transient errors for Inngest retries
      throw error;
    }
  }

  await publish(
    razorpayChannel().status({
      nodeId,
      status: "success",
    }),
  );

  return {
    ...context,
    [variableName]: orderResult,
  };
};
