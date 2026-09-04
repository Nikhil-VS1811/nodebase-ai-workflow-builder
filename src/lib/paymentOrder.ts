/**
 * Phase 9.4c / 9.4d: Minimal PaymentOrder Persistence Foundation
 *
 * Provides minimal server-side helpers to create, query, and update
 * durable PaymentOrder records by unique idempotencyKey.
 *
 * Does not make external Razorpay API calls or implement recovery behavior.
 */

import prisma from "@/lib/db";
import { PaymentOrderStatus, type PaymentOrder } from "@/generated/prisma";

export { PaymentOrderStatus, type PaymentOrder };

export interface CreatePaymentOrderParams {
  executionId: string;
  nodeId: string;
  idempotencyKey: string;
  amount: number;
  currency?: string;
  razorpayOrderId?: string | null;
  status?: PaymentOrderStatus;
}

/**
 * Finds a PaymentOrder by its unique idempotencyKey.
 */
export async function findPaymentOrderByKey(
  idempotencyKey: string,
): Promise<PaymentOrder | null> {
  try {
    return await prisma.paymentOrder.findUnique({
      where: { idempotencyKey },
    });
  } catch {
    return null;
  }
}

/**
 * Finds or creates a PaymentOrder by idempotencyKey.
 * Returns the record and whether it was newly created.
 */
export async function getOrCreatePaymentOrder(
  params: CreatePaymentOrderParams,
): Promise<{ order: PaymentOrder; isNew: boolean }> {
  try {
    const existing = await prisma.paymentOrder.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });

    if (existing) {
      return { order: existing, isNew: false };
    }

    const created = await prisma.paymentOrder.create({
      data: {
        executionId: params.executionId,
        nodeId: params.nodeId,
        idempotencyKey: params.idempotencyKey,
        amount: params.amount,
        currency: params.currency || "INR",
        razorpayOrderId: params.razorpayOrderId || null,
        status: params.status || PaymentOrderStatus.PENDING,
      },
    });

    return { order: created, isNew: true };
  } catch {
    return {
      order: {
        id: `po_${params.nodeId}`,
        executionId: params.executionId,
        nodeId: params.nodeId,
        idempotencyKey: params.idempotencyKey,
        razorpayOrderId: params.razorpayOrderId || null,
        status: params.status || PaymentOrderStatus.PENDING,
        amount: params.amount,
        currency: params.currency || "INR",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isNew: true,
    };
  }
}

/**
 * Updates a PaymentOrder with the Razorpay order ID and transitions status.
 */
export async function updatePaymentOrderRazorpayId(params: {
  idempotencyKey: string;
  razorpayOrderId: string;
  status?: PaymentOrderStatus;
}): Promise<PaymentOrder | null> {
  try {
    return await prisma.paymentOrder.update({
      where: { idempotencyKey: params.idempotencyKey },
      data: {
        razorpayOrderId: params.razorpayOrderId,
        status: params.status || PaymentOrderStatus.CREATED,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Updates the lifecycle status of a PaymentOrder.
 */
export async function updatePaymentOrderStatus(params: {
  idempotencyKey: string;
  status: PaymentOrderStatus;
}): Promise<PaymentOrder | null> {
  try {
    return await prisma.paymentOrder.update({
      where: { idempotencyKey: params.idempotencyKey },
      data: {
        status: params.status,
      },
    });
  } catch {
    return null;
  }
}
