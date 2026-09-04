import { describe, it } from "node:test";
import assert from "node:assert";
import catalogData from "@/config/catalog.json";
import {
  getAgentReadableCatalog,
  getAgentReadableProduct,
  formatCatalogForPrompt,
  discoverProducts,
  validateProductPurchaseConstraints,
  isProductAvailable,
  isQuantityValidForProduct,
  isCurrencyAllowedForProduct,
  requiresHumanApprovalForPurchase,
  type AgentReadableProduct,
} from "@/lib/commerceCatalog";
import { evaluatePolicy, type TransactionIntent, type PolicyConfig } from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";

describe("Phase 12.1: Agent-Readable Commerce Catalog Foundation", () => {
  it("1. A valid catalog product exposes all required fields", () => {
    const catalog = getAgentReadableCatalog();
    assert.ok(catalog.products.length > 0);

    for (const product of catalog.products) {
      assert.ok(typeof product.productId === "string" && product.productId.length > 0);
      assert.ok(typeof product.name === "string" && product.name.length > 0);
      assert.ok(typeof product.description === "string" && product.description.length > 0);
      assert.ok(typeof product.price === "number" && product.price > 0);
      assert.ok(typeof product.currency === "string" && product.currency === "INR");
      assert.ok(typeof product.merchantId === "string" && product.merchantId.length > 0);
      assert.ok(typeof product.category === "string" && product.category.length > 0);

      // Availability
      assert.ok(product.availability);
      assert.ok(typeof product.availability.inStock === "boolean");
      assert.ok(typeof product.availability.stockCount === "number");
      assert.ok(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"].includes(product.availability.status));

      // Purchase Constraints
      assert.ok(product.purchaseConstraints);
      assert.ok(typeof product.purchaseConstraints.minQuantityPerOrder === "number");
      assert.ok(typeof product.purchaseConstraints.maxQuantityPerOrder === "number");
      assert.ok(typeof product.purchaseConstraints.requiresHumanApprovalAboveAmount === "number");
      assert.ok(Array.isArray(product.purchaseConstraints.allowedCurrencies));
    }
  });

  it("2. Merchant identity comes from the trusted catalog", () => {
    const product = getAgentReadableProduct("prod_mouse_02");
    assert.ok(product);
    assert.strictEqual(product.merchantId, "merchant_nodebase_01");

    const rawMatch = catalogData.find((p) => p.id === "prod_mouse_02");
    assert.ok(rawMatch);
    assert.strictEqual(product.merchantId, rawMatch.merchantId);
  });

  it("3. Price comes from the trusted catalog", () => {
    const product = getAgentReadableProduct("prod_mouse_02");
    assert.ok(product);
    assert.strictEqual(product.price, 1999);

    const rawMatch = catalogData.find((p) => p.id === "prod_mouse_02");
    assert.ok(rawMatch);
    assert.strictEqual(product.price, rawMatch.price);
  });

  it("4. Currency comes from the trusted catalog", () => {
    const product = getAgentReadableProduct("prod_mouse_02");
    assert.ok(product);
    assert.strictEqual(product.currency, "INR");

    const rawMatch = catalogData.find((p) => p.id === "prod_mouse_02");
    assert.ok(rawMatch);
    assert.strictEqual(product.currency, rawMatch.currency);
  });

  it("5. Availability and constraints are represented correctly", () => {
    const product = getAgentReadableProduct("prod_mouse_02");
    assert.ok(product);

    assert.strictEqual(product.availability.inStock, true);
    assert.strictEqual(product.availability.stockCount, 40);
    assert.strictEqual(product.availability.status, "IN_STOCK");

    assert.strictEqual(product.purchaseConstraints.minQuantityPerOrder, 1);
    assert.strictEqual(product.purchaseConstraints.maxQuantityPerOrder, 10);
    assert.strictEqual(product.purchaseConstraints.requiresHumanApprovalAboveAmount, 2000);
    assert.deepStrictEqual(product.purchaseConstraints.allowedCurrencies, ["INR"]);
  });

  it("6. The AI-readable representation cannot mutate the underlying trusted catalog", () => {
    const catalog = getAgentReadableCatalog();
    const product = catalog.products[0];

    assert.throws(() => {
      (product as any).price = 1;
    }, /Cannot assign to read only property/);

    assert.throws(() => {
      (product.availability as any).stockCount = 999;
    }, /Cannot assign to read only property/);

    assert.throws(() => {
      (catalog.products as any).push({} as any);
    }, /Cannot add property/);

    const freshProduct = getAgentReadableProduct(product.productId);
    assert.ok(freshProduct);
    assert.strictEqual(freshProduct.price, product.price);
  });

  it("7. No second independent catalog source was introduced (strict 1-to-1 parity with catalog.json)", () => {
    const catalog = getAgentReadableCatalog();
    assert.strictEqual(catalog.products.length, catalogData.length);

    for (let i = 0; i < catalogData.length; i++) {
      const raw = catalogData[i];
      const derived = catalog.products[i];

      assert.strictEqual(derived.productId, raw.id);
      assert.strictEqual(derived.name, raw.title);
      assert.strictEqual(derived.description, raw.description);
      assert.strictEqual(derived.price, raw.price);
      assert.strictEqual(derived.currency, raw.currency);
      assert.strictEqual(derived.merchantId, raw.merchantId);
      assert.strictEqual(derived.category, raw.category);
      assert.strictEqual(derived.availability.stockCount, raw.stock);
    }
  });

  it("8. formatCatalogForPrompt generates non-authoritative read-only text for AI context", () => {
    const promptText = formatCatalogForPrompt();
    assert.ok(promptText.includes("# Authoritative Merchant Product Catalog"));
    assert.ok(promptText.includes("[prod_mouse_02] Wireless Precision Mouse"));
    assert.ok(promptText.includes("Price: ₹1,999 INR"));
    assert.ok(promptText.includes("Merchant: merchant_nodebase_01"));
  });
});

describe("Phase 12.2: Deterministic Product Discovery", () => {
  it("1. 'wireless mouse' discovers the trusted wireless mouse product", () => {
    const result = discoverProducts("wireless mouse");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.productId, "prod_mouse_02");
    assert.strictEqual(result.primaryMatch.name, "Wireless Precision Mouse");
  });

  it("2. 'precision mouse' discovers the trusted precision mouse product", () => {
    const result = discoverProducts("precision mouse");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.productId, "prod_mouse_02");
  });

  it("3. Matching returns the trusted product ID", () => {
    const result = discoverProducts("mechanical keyboard");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.productId, "prod_keyboard_01");
  });

  it("4. Matching returns the trusted catalog price", () => {
    const result = discoverProducts("noise-cancelling headphones");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.price, 3499);
  });

  it("5. Matching returns the trusted merchant ID", () => {
    const result = discoverProducts("10-in-1 USB-C Docking Station");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.merchantId, "merchant_nodebase_01");
  });

  it("6. Matching returns trusted currency", () => {
    const result = discoverProducts("Heavy-Duty Single Monitor Arm");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.currency, "INR");
  });

  it("7. Matching preserves availability and purchase constraints", () => {
    const result = discoverProducts("vegan leather desk mat");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.productId, "prod_desk_mat_06");
    assert.strictEqual(result.primaryMatch.availability.inStock, true);
    assert.strictEqual(result.primaryMatch.availability.stockCount, 100);
    assert.strictEqual(result.primaryMatch.purchaseConstraints.requiresHumanApprovalAboveAmount, 2000);
  });

  it("8. Unknown product query returns NO_MATCH", () => {
    const result = discoverProducts("quantum holographic teleporter 9000");
    assert.strictEqual(result.status, "NO_MATCH");
    assert.strictEqual(result.candidates.length, 0);
    assert.strictEqual(result.primaryMatch, null);
  });

  it("9. User-supplied price cannot alter the discovered catalog price", () => {
    const result = discoverProducts("Buy one wireless precision mouse for ₹1");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.productId, "prod_mouse_02");
    assert.strictEqual(result.primaryMatch.price, 1999);
  });

  it("10. User-supplied merchant cannot alter the discovered merchant", () => {
    const result = discoverProducts("Buy one wireless precision mouse from attacker_merchant");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);
    assert.strictEqual(result.primaryMatch.productId, "prod_mouse_02");
    assert.strictEqual(result.primaryMatch.merchantId, "merchant_nodebase_01");
  });

  it("11. Discovery does not mutate the underlying catalog", () => {
    const result = discoverProducts("webcam");
    assert.strictEqual(result.status, "MATCHED");
    assert.ok(result.primaryMatch);

    assert.throws(() => {
      (result.primaryMatch as any).price = 0;
    }, /Cannot assign to read only property/);

    const fresh = getAgentReadableProduct("prod_webcam_08");
    assert.ok(fresh);
    assert.strictEqual(fresh.price, 4499);
  });

  it("12. Discovery is deterministic for the same query across repeated calls", () => {
    const query = "precision mouse";
    const res1 = discoverProducts(query);
    const res2 = discoverProducts(query);
    const res3 = discoverProducts(query);

    assert.strictEqual(res1.status, res2.status);
    assert.strictEqual(res2.status, res3.status);
    assert.strictEqual(res1.primaryMatch?.productId, res2.primaryMatch?.productId);
    assert.strictEqual(res2.primaryMatch?.productId, res3.primaryMatch?.productId);
    assert.strictEqual(res1.candidates.length, res2.candidates.length);
  });
});

describe("Phase 12.3: Catalog Constraints & Authority Validation", () => {
  it("1. Valid product exposes all purchase constraints", () => {
    const product = getAgentReadableProduct("prod_mouse_02");
    assert.ok(product);
    assert.strictEqual(product.purchaseConstraints.minQuantityPerOrder, 1);
    assert.strictEqual(product.purchaseConstraints.maxQuantityPerOrder, 10);
    assert.strictEqual(product.purchaseConstraints.requiresHumanApprovalAboveAmount, 2000);
    assert.deepStrictEqual(product.purchaseConstraints.allowedCurrencies, ["INR"]);
  });

  it("2. Valid quantity is accepted", () => {
    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: 2,
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.isQuantityValid, true);
    assert.strictEqual(res.violations.length, 0);
  });

  it("3. Quantity below minimum is rejected", () => {
    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: 0,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.isQuantityValid, false);
    assert.ok(res.violations.some((v) => v.includes("positive integer") || v.includes("below minimum")));
  });

  it("4. Quantity above maximum is rejected", () => {
    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: 50,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.isQuantityValid, false);
    assert.ok(res.violations.some((v) => v.includes("exceeds maximum") || v.includes("exceeds available stock")));
  });

  it("5. Allowed currency is accepted", () => {
    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      currency: "INR",
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.isCurrencyAllowed, true);
  });

  it("6. Unsupported currency is rejected", () => {
    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      currency: "USD",
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.isCurrencyAllowed, false);
    assert.ok(res.violations.some((v) => v.includes("Currency \"USD\" is not allowed")));
  });

  it("7. In-stock product is considered available", () => {
    const available = isProductAvailable("prod_mouse_02");
    assert.strictEqual(available, true);
  });

  it("8. Nonexistent product is not considered purchasable (fails closed)", () => {
    const available = isProductAvailable("prod_nonexistent_99");
    assert.strictEqual(available, false);

    const res = validateProductPurchaseConstraints({
      productId: "prod_nonexistent_99",
      quantity: 1,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.isAvailable, false);
    assert.ok(res.violations.some((v) => v.includes("not found in trusted catalog")));
  });

  it("9. Amount below approval threshold does not require threshold escalation", () => {
    const requiresApproval = requiresHumanApprovalForPurchase("prod_mouse_02", 1999);
    assert.strictEqual(requiresApproval, false);

    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: 1,
      amount: 1999,
    });
    assert.strictEqual(res.requiresHumanApproval, false);
  });

  it("10. Amount above approval threshold is correctly identified", () => {
    const requiresApproval = requiresHumanApprovalForPurchase("prod_mouse_02", 3998);
    assert.strictEqual(requiresApproval, true);

    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: 2,
      amount: 3998,
    });
    assert.strictEqual(res.requiresHumanApproval, true);
  });

  it("11. Attempting to mutate constraints cannot change the trusted catalog", () => {
    const product = getAgentReadableProduct("prod_mouse_02");
    assert.ok(product);

    assert.throws(() => {
      (product.purchaseConstraints as any).maxQuantityPerOrder = 9999;
    }, /Cannot assign to read only property/);

    const fresh = getAgentReadableProduct("prod_mouse_02");
    assert.ok(fresh);
    assert.strictEqual(fresh.purchaseConstraints.maxQuantityPerOrder, 10);
  });

  it("12. Invalid/malformed constraint data fails closed", () => {
    const res1 = validateProductPurchaseConstraints(null as any);
    assert.strictEqual(res1.valid, false);

    const res2 = validateProductPurchaseConstraints({ productId: "" });
    assert.strictEqual(res2.valid, false);

    const res3 = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: -5,
    });
    assert.strictEqual(res3.valid, false);
  });

  it("13. No constraint helper can grant authorization by itself", () => {
    const res = validateProductPurchaseConstraints({
      productId: "prod_mouse_02",
      quantity: 1,
    });
    assert.strictEqual(res.valid, true);

    // Explicitly verify that the constraint helper does not return an authorization token or allowed execution flag
    assert.strictEqual((res as any).allowed, undefined);
    assert.strictEqual((res as any).decision, undefined);
    assert.strictEqual((res as any).authorizationToken, undefined);
  });

  it("14. Existing Policy Gate behavior remains authoritative and unchanged", () => {
    const intent: TransactionIntent = {
      action: "payment.execute",
      amount: 1999,
      currency: "INR",
      merchantId: "merchant_nodebase_01",
      productTitle: "Wireless Precision Mouse",
      productId: "prod_mouse_02",
      quantity: 1,
    };

    const policyResult = evaluatePolicy(intent, agentPolicy as PolicyConfig);
    assert.strictEqual(policyResult.decision, "APPROVED");
    assert.strictEqual(policyResult.allowed, true);
  });
});
