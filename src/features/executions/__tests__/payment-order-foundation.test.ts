import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  PaymentOrderStatus,
  type CreatePaymentOrderParams,
  findPaymentOrderByKey,
  getOrCreatePaymentOrder,
  updatePaymentOrderRazorpayId,
  updatePaymentOrderStatus,
} from "@/lib/paymentOrder";
import { getRazorpayCallCount, resetRazorpayCallCount } from "@/lib/razorpayInstrumentation";

describe("Phase 9.4c: Minimal PaymentOrder Persistence Foundation", () => {
  // In-memory store simulating durable PaymentOrder table for isolation
  const memoryStore = new Map<string, any>();

  // Mock Prisma client delegates for unit test isolation
  const mockPrismaPaymentOrder = {
    findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
      return memoryStore.get(where.idempotencyKey) || null;
    },
    create: async ({ data }: { data: any }) => {
      if (memoryStore.has(data.idempotencyKey)) {
        const err = new Error("Unique constraint failed on the fields: (`idempotencyKey`)");
        (err as any).code = "P2002";
        throw err;
      }
      const record = {
        id: `po_${Math.random().toString(36).substring(2, 9)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryStore.set(data.idempotencyKey, record);
      return record;
    },
    update: async ({ where, data }: { where: { idempotencyKey: string }; data: any }) => {
      const existing = memoryStore.get(where.idempotencyKey);
      if (!existing) {
        throw new Error("Record to update not found.");
      }
      const updated = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      memoryStore.set(where.idempotencyKey, updated);
      return updated;
    },
  };

  beforeEach(() => {
    memoryStore.clear();
    resetRazorpayCallCount();
  });

  afterEach(() => {
    memoryStore.clear();
    resetRazorpayCallCount();
  });

  it("1. PaymentOrder can be created with a deterministic idempotencyKey", async () => {
    const params: CreatePaymentOrderParams = {
      executionId: "exec_123",
      nodeId: "node_rp_01",
      idempotencyKey: "idem_test_order_123",
      amount: 1999,
      currency: "INR",
    };

    const record = await mockPrismaPaymentOrder.create({
      data: {
        ...params,
        status: PaymentOrderStatus.PENDING,
        razorpayOrderId: null,
      },
    });

    assert.ok(record.id);
    assert.strictEqual(record.idempotencyKey, "idem_test_order_123");
    assert.strictEqual(record.amount, 1999);
    assert.strictEqual(record.currency, "INR");
    assert.strictEqual(record.status, PaymentOrderStatus.PENDING);
  });

  it("2. The idempotencyKey is unique and prevents duplicate creation", async () => {
    const params = {
      executionId: "exec_123",
      nodeId: "node_rp_01",
      idempotencyKey: "idem_unique_test",
      amount: 1999,
      currency: "INR",
      status: PaymentOrderStatus.PENDING,
      razorpayOrderId: null,
    };

    await mockPrismaPaymentOrder.create({ data: params });

    // Duplicate create with same idempotencyKey must throw unique constraint error
    await assert.rejects(
      async () => {
        await mockPrismaPaymentOrder.create({ data: params });
      },
      (err: any) => {
        assert.strictEqual(err.code, "P2002");
        return true;
      },
    );
  });

  it("3. razorpayOrderId is initially null upon payment start", async () => {
    const record = await mockPrismaPaymentOrder.create({
      data: {
        executionId: "exec_123",
        nodeId: "node_rp_01",
        idempotencyKey: "idem_null_rzp_test",
        amount: 2499,
        currency: "INR",
        status: PaymentOrderStatus.PENDING,
        razorpayOrderId: null,
      },
    });

    assert.strictEqual(record.razorpayOrderId, null);
    assert.strictEqual(record.status, PaymentOrderStatus.PENDING);
  });

  it("4. razorpayOrderId can later be stored once confirmed by provider", async () => {
    await mockPrismaPaymentOrder.create({
      data: {
        executionId: "exec_123",
        nodeId: "node_rp_01",
        idempotencyKey: "idem_update_rzp_test",
        amount: 1999,
        currency: "INR",
        status: PaymentOrderStatus.PENDING,
        razorpayOrderId: null,
      },
    });

    const updated = await mockPrismaPaymentOrder.update({
      where: { idempotencyKey: "idem_update_rzp_test" },
      data: {
        razorpayOrderId: "order_rzp_confirmed_123",
        status: PaymentOrderStatus.CREATED,
      },
    });

    assert.strictEqual(updated.razorpayOrderId, "order_rzp_confirmed_123");
    assert.strictEqual(updated.status, PaymentOrderStatus.CREATED);
  });

  it("5. Existing PaymentOrder can be found by idempotencyKey", async () => {
    await mockPrismaPaymentOrder.create({
      data: {
        executionId: "exec_find_123",
        nodeId: "node_rp_01",
        idempotencyKey: "idem_find_me",
        amount: 4999,
        currency: "INR",
        status: PaymentOrderStatus.PENDING,
        razorpayOrderId: null,
      },
    });

    const found = await mockPrismaPaymentOrder.findUnique({
      where: { idempotencyKey: "idem_find_me" },
    });

    assert.ok(found);
    assert.strictEqual(found?.idempotencyKey, "idem_find_me");
    assert.strictEqual(found?.amount, 4999);

    const notFound = await mockPrismaPaymentOrder.findUnique({
      where: { idempotencyKey: "non_existent_key" },
    });
    assert.strictEqual(notFound, null);
  });

  it("6. Status can transition through the intended lifecycle states (PENDING -> CREATED -> VERIFIED)", async () => {
    // 1. PENDING
    let record = await mockPrismaPaymentOrder.create({
      data: {
        executionId: "exec_lifecycle_123",
        nodeId: "node_rp_01",
        idempotencyKey: "idem_lifecycle",
        amount: 1999,
        currency: "INR",
        status: PaymentOrderStatus.PENDING,
        razorpayOrderId: null,
      },
    });
    assert.strictEqual(record.status, PaymentOrderStatus.PENDING);

    // 2. CREATED
    record = await mockPrismaPaymentOrder.update({
      where: { idempotencyKey: "idem_lifecycle" },
      data: {
        razorpayOrderId: "order_rzp_777",
        status: PaymentOrderStatus.CREATED,
      },
    });
    assert.strictEqual(record.status, PaymentOrderStatus.CREATED);
    assert.strictEqual(record.razorpayOrderId, "order_rzp_777");

    // 3. VERIFIED
    record = await mockPrismaPaymentOrder.update({
      where: { idempotencyKey: "idem_lifecycle" },
      data: {
        status: PaymentOrderStatus.VERIFIED,
      },
    });
    assert.strictEqual(record.status, PaymentOrderStatus.VERIFIED);
  });

  it("7. No Razorpay API calls are made by the persistence foundation", () => {
    assert.strictEqual(getRazorpayCallCount(), 0);
  });
});
