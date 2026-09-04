import { describe, it } from "node:test";
import assert from "node:assert";
import { NonRetriableError } from "inngest";
import {
  interpretShoppingRequest,
  resolveTransactionIntentFromCatalog,
  aiBuyerExecutor,
  catalog,
} from "../executor";
import type { NodeExecutorParams } from "@/features/executions/types";

describe("AI Buyer Node", () => {
  it("1. Valid product selection: matches exact and natural language requests to catalog products", () => {
    // Exact ID
    const intent1 = interpretShoppingRequest("I want to buy prod_keyboard_01");
    assert.strictEqual(intent1.productId, "prod_keyboard_01");
    assert.strictEqual(intent1.quantity, 1);

    // Product Title
    const intent2 = interpretShoppingRequest("Please order a Wireless Precision Mouse");
    assert.strictEqual(intent2.productId, "prod_mouse_02");
    assert.strictEqual(intent2.quantity, 1);

    // Natural language keyword & quantity
    const intent3 = interpretShoppingRequest("Buy 2 mechanical keyboards for the office");
    assert.strictEqual(intent3.productId, "prod_keyboard_01");
    assert.strictEqual(intent3.quantity, 2);

    const resolved = resolveTransactionIntentFromCatalog(intent3);
    assert.strictEqual(resolved.productId, "prod_keyboard_01");
    assert.strictEqual(resolved.quantity, 2);
    assert.strictEqual(resolved.amount, 4999 * 2);
    assert.strictEqual(resolved.currency, "INR");
    assert.strictEqual(resolved.action, "payment.execute");
  });

  it("2. Nonexistent product rejection: throws NonRetriableError when product is not in catalog", () => {
    // Unresolvable natural language query
    assert.throws(
      () => {
        interpretShoppingRequest("Buy me a spaceship with photon torpedoes");
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("Could not resolve shopping request"));
        return true;
      },
    );

    // Nonexistent productId in structured intent
    assert.throws(
      () => {
        resolveTransactionIntentFromCatalog({
          productId: "non_existent_sku_999",
          quantity: 1,
        });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("does not exist in the trusted catalog"));
        return true;
      },
    );
  });

  it("3. Catalog price cannot be overridden by LLM output: enforces trusted catalog price", () => {
    // An adversarial LLM output tries to set price to 10 INR for a 4999 INR keyboard
    const adversarialAiOutput = {
      productId: "prod_keyboard_01",
      quantity: 1,
      price: 10,
      amount: 10,
      currency: "USD",
    };

    const validatedRawIntent = interpretShoppingRequest(
      "adversarial prompt",
      adversarialAiOutput,
    );

    const trustedIntent = resolveTransactionIntentFromCatalog(validatedRawIntent);

    // The price & currency MUST come from the trusted catalog (4999 INR), not the AI output (10 USD)
    assert.strictEqual(trustedIntent.productId, "prod_keyboard_01");
    assert.strictEqual(trustedIntent.amount, 4999);
    assert.strictEqual(trustedIntent.currency, "INR");
    assert.strictEqual(trustedIntent.productTitle, "Ergonomic Mechanical Keyboard");
    assert.notStrictEqual(trustedIntent.amount, 10);
  });

  it("4. Malformed AI output rejection: rejects invalid intent structure with NonRetriableError", () => {
    // Missing productId
    assert.throws(
      () => {
        interpretShoppingRequest("test", { quantity: 2 });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("Malformed intent output"));
        return true;
      },
    );

    // Invalid quantity (negative or non-integer)
    assert.throws(
      () => {
        interpretShoppingRequest("test", {
          productId: "prod_keyboard_01",
          quantity: -5,
        });
      },
      (err: Error) => {
        assert(err instanceof NonRetriableError);
        assert(err.message.includes("Malformed intent output"));
        return true;
      },
    );
  });

  it("5. Correct TransactionIntent creation: derives all canonical fields accurately", () => {
    const rawIntent = interpretShoppingRequest("Order 3 USB-C docking stations");
    const result = resolveTransactionIntentFromCatalog(rawIntent, "Order 3 USB-C docking stations");

    const expectedProduct = catalog.find((p) => p.id === "prod_usb_dock_05")!;
    assert.ok(expectedProduct);

    assert.strictEqual(result.action, "payment.execute");
    assert.strictEqual(result.productId, "prod_usb_dock_05");
    assert.strictEqual(result.productTitle, expectedProduct.title);
    assert.strictEqual(result.productDescription, expectedProduct.description);
    assert.strictEqual(result.quantity, 3);
    assert.strictEqual(result.amount, expectedProduct.price * 3);
    assert.strictEqual(result.currency, "INR");
    assert.strictEqual(result.merchantId, expectedProduct.merchantId);
    assert.strictEqual(result.sourceInstruction, "Order 3 USB-C docking stations");
  });

  it("6. Context preservation: full executor run preserves existing workflow context and attaches transactionIntent", async () => {
    const publishedEvents: any[] = [];
    const mockPublish = async (event: any) => {
      publishedEvents.push(event);
    };

    const mockStep = {
      run: async (_name: string, fn: () => Promise<any>) => fn(),
    } as any;

    const initialContext = {
      userSessionId: "session_12345",
      userMessage: "I need 2 desk mats please",
      authProfile: { name: "Alice", role: "shopper" },
      priorStepResult: { ok: true },
    };

    const params: NodeExecutorParams<any> = {
      data: {
        inputKey: "userMessage",
        outputKey: "transactionIntent",
      },
      nodeId: "ai_buyer_node_01",
      userId: "user_test_99",
      context: initialContext,
      step: mockStep,
      publish: mockPublish,
    };

    const newContext = await aiBuyerExecutor(params);

    // Verify all prior context keys are preserved intact
    assert.strictEqual(newContext.userSessionId, "session_12345");
    assert.strictEqual(newContext.userMessage, "I need 2 desk mats please");
    assert.deepStrictEqual(newContext.authProfile, { name: "Alice", role: "shopper" });
    assert.deepStrictEqual(newContext.priorStepResult, { ok: true });

    // Verify outputKey is attached with correct TransactionIntent
    const intent = newContext.transactionIntent as any;
    assert.ok(intent);
    assert.strictEqual(intent.action, "payment.execute");
    assert.strictEqual(intent.productId, "prod_desk_mat_06");
    assert.strictEqual(intent.quantity, 2);
    assert.strictEqual(intent.amount, 899 * 2);
    assert.strictEqual(intent.currency, "INR");

    // Verify status publishing occurred
    assert.ok(publishedEvents.length >= 2);
  });
});
