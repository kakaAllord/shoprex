-- Phase 8 — a retried delivery must not receive the same crate twice.
--
-- Nullable on purpose, unlike sales.idempotency_key. PostgreSQL treats NULLs
-- as distinct in a unique index, so every receipt recorded before this column
-- existed keeps working and no two of them collide. A client that sends a key
-- gets the sale-style guarantee; one that does not behaves exactly as before.
ALTER TABLE "stock_receipts" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_business_id_idempotency_key_key" ON "stock_receipts"("business_id", "idempotency_key");
