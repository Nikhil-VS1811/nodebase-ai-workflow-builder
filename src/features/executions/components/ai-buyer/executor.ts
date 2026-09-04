import { NonRetriableError } from "inngest";
import z from "zod";
import type { NodeExecutor } from "@/features/executions/types";
import { aiBuyerChannel } from "@/inngest/channels/ai-buyer";
import type { TransactionIntent } from "@/lib/policyEngine";
import catalogData from "@/config/catalog.json";

export interface CatalogProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  stock: number;
  merchantId: string;
}

export const catalog: CatalogProduct[] = catalogData as CatalogProduct[];

export const RawAiIntentSchema = z.object({
  productId: z.string().min(1, { message: "Product ID is required" }),
  quantity: z.number().int().positive().default(1),
  sourceInstruction: z.string().optional(),
  // Discard any untrusted price/amount injected by LLM or user
  amount: z.unknown().optional(),
  price: z.unknown().optional(),
  currency: z.unknown().optional(),
});

export type RawAiIntent = z.infer<typeof RawAiIntentSchema>;

export type AiBuyerData = {
  inputKey?: string;
  outputKey?: string;
  credentialId?: string;
};

/**
 * Extracts shopping request string from arbitrary context value
 */
export function extractUserMessage(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim()) {
      return record.text.trim();
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.userMessage === "string" && record.userMessage.trim()) {
      return record.userMessage.trim();
    }
    if (typeof record.query === "string" && record.query.trim()) {
      return record.query.trim();
    }
    if (typeof record.content === "string" && record.content.trim()) {
      return record.content.trim();
    }
  }
  return "";
}

/**
 * Deterministically interprets a natural language shopping query against the catalog.
 * Supports exact IDs, product titles, partial keyword matching, and quantity extraction.
 */
export function interpretShoppingRequest(
  message: string,
  rawAiOutput?: unknown,
): RawAiIntent {
  // If structured AI output was provided, validate it strictly with Zod
  if (rawAiOutput && typeof rawAiOutput === "object") {
    const parsed = RawAiIntentSchema.safeParse(rawAiOutput);
    if (!parsed.success) {
      throw new NonRetriableError(
        `AI Buyer: Malformed intent output - ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    return parsed.data;
  }

  const cleanMessage = message.toLowerCase();

  // Extract quantity if specified (e.g., "2 keyboards", "buy 3 of prod_mouse_02", "need 2 desk mats", "quantity: 2")
  let quantity = 1;
  const qtyMatch =
    cleanMessage.match(/(?:quantity\s*[:=]?\s*|qty\s*[:=]?\s*|buy\s+|order\s+|get\s+|need\s+|want\s+|purchase\s+)(\d+)/i) ||
    cleanMessage.match(/\b(\d+)\s+(?:units?|pieces?|items?|x\s+)?(?:of\s+)?[a-z]/i) ||
    cleanMessage.match(/^(\d+)\s+/);
  if (qtyMatch?.[1]) {
    const parsedQty = parseInt(qtyMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty > 0) {
      quantity = parsedQty;
    }
  }

  // 1. Match by exact productId in message
  for (const product of catalog) {
    if (cleanMessage.includes(product.id.toLowerCase())) {
      return {
        productId: product.id,
        quantity,
        sourceInstruction: message,
      };
    }
  }

  // 2. Match by full product title
  for (const product of catalog) {
    if (cleanMessage.includes(product.title.toLowerCase())) {
      return {
        productId: product.id,
        quantity,
        sourceInstruction: message,
      };
    }
  }

  // 3. Match by key distinctive keywords from catalog items
  const keywordMappings: Array<{ keywords: string[]; productId: string }> = [
    { keywords: ["mechanical keyboard", "ergonomic keyboard", "keyboard"], productId: "prod_keyboard_01" },
    { keywords: ["wireless mouse", "precision mouse", "mouse"], productId: "prod_mouse_02" },
    { keywords: ["noise-cancelling", "headphones", "headphone", "headset"], productId: "prod_headphones_03" },
    { keywords: ["monitor arm", "desk mount", "monitor stand"], productId: "prod_monitor_arm_04" },
    { keywords: ["docking station", "usb-c dock", "usb dock", "multiport adapter"], productId: "prod_usb_dock_05" },
    { keywords: ["desk mat", "desk pad", "leather mat"], productId: "prod_desk_mat_06" },
    { keywords: ["cable organizer", "cable management", "cable clips"], productId: "prod_cable_organizer_07" },
    { keywords: ["webcam", "streaming camera", "4k webcam"], productId: "prod_webcam_08" },
  ];

  for (const mapping of keywordMappings) {
    for (const kw of mapping.keywords) {
      if (cleanMessage.includes(kw)) {
        return {
          productId: mapping.productId,
          quantity,
          sourceInstruction: message,
        };
      }
    }
  }

  throw new NonRetriableError(
    `AI Buyer: Could not resolve shopping request "${message}" to any product in the catalog.`,
  );
}

/**
 * Validates the raw intent against the trusted catalog and derives all financial fields.
 * LLM-provided prices/amounts are strictly discarded.
 */
export function resolveTransactionIntentFromCatalog(
  rawIntent: RawAiIntent,
  sourceInstruction?: string,
): TransactionIntent {
  const product = catalog.find((p) => p.id === rawIntent.productId);

  if (!product) {
    throw new NonRetriableError(
      `AI Buyer: Product ID "${rawIntent.productId}" does not exist in the trusted catalog.`,
    );
  }

  const quantity = rawIntent.quantity || 1;

  if (product.stock < quantity) {
    throw new NonRetriableError(
      `AI Buyer: Insufficient stock for "${product.title}". Requested: ${quantity}, Available: ${product.stock}.`,
    );
  }

  // Trusted calculation: amount strictly computed from catalog price * quantity
  const totalAmount = product.price * quantity;

  return {
    action: "payment.execute",
    productId: product.id,
    productTitle: product.title,
    productDescription: product.description,
    amount: totalAmount,
    currency: product.currency,
    merchantId: product.merchantId || "merchant_nodebase_01",
    quantity: quantity,
    sourceInstruction: sourceInstruction || rawIntent.sourceInstruction,
  };
}

export const aiBuyerExecutor: NodeExecutor<AiBuyerData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    aiBuyerChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const inputKey = data.inputKey ?? "userMessage";
  const outputKey = data.outputKey ?? "transactionIntent";

  const rawInput = context[inputKey];
  const userMessage = extractUserMessage(rawInput);

  if (!userMessage) {
    await publish(
      aiBuyerChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      `AI Buyer [${nodeId}]: No user shopping request found at context key "${inputKey}".`,
    );
  }

  try {
    const transactionIntent = await step.run(
      `ai-buyer-interpret-${nodeId}`,
      async () => {
        // Interpret intent from user message
        const rawIntent = interpretShoppingRequest(userMessage);

        // Derive trusted transaction intent from catalog
        return resolveTransactionIntentFromCatalog(rawIntent, userMessage);
      },
    );

    await publish(
      aiBuyerChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      [outputKey]: transactionIntent,
    };
  } catch (error) {
    await publish(
      aiBuyerChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
