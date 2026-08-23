-- CreateEnum
CREATE TYPE "PaymentMethodKind" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK', 'DEBT', 'OTHER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SALE_COMPLETED';

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PaymentMethodKind" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "sold_by_id" TEXT NOT NULL,
    "device_id" TEXT,
    "total_tzs" INTEGER NOT NULL,
    "change_tzs" INTEGER NOT NULL DEFAULT 0,
    "debt_tzs" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_unit_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_tzs" INTEGER NOT NULL,
    "line_total_tzs" INTEGER NOT NULL,
    "conversion_factor" INTEGER NOT NULL,
    "normalized_quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "payment_method_id" TEXT NOT NULL,
    "method_name" TEXT NOT NULL,
    "method_kind" "PaymentMethodKind" NOT NULL,
    "amount_tzs" INTEGER NOT NULL,
    "cash_received_tzs" INTEGER,
    "change_tzs" INTEGER,
    "debtor_name" TEXT,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_methods_business_id_idx" ON "payment_methods"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_business_id_name_key" ON "payment_methods"("business_id", "name");

-- CreateIndex
CREATE INDEX "sales_business_id_created_at_idx" ON "sales"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_branch_id_created_at_idx" ON "sales"("branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_idempotency_key_key" ON "sales"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_lines_sale_id_idx" ON "sale_lines"("sale_id");

-- CreateIndex
CREATE INDEX "sale_lines_product_id_idx" ON "sale_lines"("product_id");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_payments_sale_id_payment_method_id_key" ON "sale_payments"("sale_id", "payment_method_id");

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_sold_by_id_fkey" FOREIGN KEY ("sold_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill: every business that already exists gets the same default payment
-- methods a new one is created with, so no shop is left unable to check out
-- between this migration and its owner opening the Phase 6 settings screen.
--
-- Safe to run against an empty database: it inserts one row per business, and
-- there are no businesses yet. `ON CONFLICT DO NOTHING` covers a shop that has
-- somehow already been given a method of the same name.
-- ---------------------------------------------------------------------------
INSERT INTO "payment_methods" ("id", "business_id", "name", "kind", "is_active", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), b."id", d."name", d."kind"::"PaymentMethodKind", true, d."sort_order", NOW(), NOW()
FROM "businesses" b
CROSS JOIN (VALUES
    ('Taslimu', 'CASH', 0),
    ('Pesa ya simu', 'MOBILE_MONEY', 1),
    ('Deni', 'DEBT', 2)
) AS d("name", "kind", "sort_order")
ON CONFLICT ("business_id", "name") DO NOTHING;
