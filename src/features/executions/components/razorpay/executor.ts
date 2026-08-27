import type { NodeExecutor } from "@/features/executions/types";

type RazorpayExecuteData = {
  /** The key in the workflow context that holds the TransactionIntent object. */
  intentKey?: string;
  /** Optional: key under which the Razorpay response will be stored in context. */
  variableName?: string;
};

/**
 * Razorpay Execution Node — skeleton implementation.
 *
 * TODO: Replace the mock response below with real Razorpay SDK calls once
 * credentials management for Razorpay is added (CredentialType.RAZORPAY).
 *
 * Typical implementation steps:
 *  1. Retrieve & decrypt the Razorpay key_id / key_secret from the Credential store.
 *  2. Instantiate the Razorpay client.
 *  3. Create an order via `razorpay.orders.create(...)`.
 *  4. Return the order details into the workflow context.
 */
export const razorpayExecutor: NodeExecutor<RazorpayExecuteData> = async ({
  data,
  context,
  step,
}) => {
  const result = await step.run("razorpay-execute", async () => {
    const variableName = data.variableName ?? "razorpayResult";

    // ── Mock response ─────────────────────────────────────────────────────────
    const mockOrderResponse = {
      id: "order_mock_000000000000",
      entity: "order",
      amount: 0,
      amount_paid: 0,
      amount_due: 0,
      currency: "INR",
      receipt: "receipt_mock",
      status: "created",
      attempts: 0,
      notes: [],
      created_at: Math.floor(Date.now() / 1000),
      _mock: true,
      message: "Mock success — replace with real Razorpay SDK integration.",
    };
    // ─────────────────────────────────────────────────────────────────────────

    return { [variableName]: mockOrderResponse };
  });

  return {
    ...context,
    ...result,
  };
};
