-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STOCK_INCONSISTENCY';

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "shortfall_normalized" INTEGER NOT NULL DEFAULT 0;

