-- CreateTable
CREATE TABLE IF NOT EXISTS "DecisionReceipt" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "receiptVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "integrityHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DecisionReceipt_executionId_key" ON "DecisionReceipt"("executionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DecisionReceipt_workflowId_idx" ON "DecisionReceipt"("workflowId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DecisionReceipt_executionId_idx" ON "DecisionReceipt"("executionId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DecisionReceipt_executionId_fkey'
  ) THEN
    ALTER TABLE "DecisionReceipt" ADD CONSTRAINT "DecisionReceipt_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DecisionReceipt_workflowId_fkey'
  ) THEN
    ALTER TABLE "DecisionReceipt" ADD CONSTRAINT "DecisionReceipt_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
