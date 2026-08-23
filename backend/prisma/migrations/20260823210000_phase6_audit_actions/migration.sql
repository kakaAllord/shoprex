-- Phase 6 — the owner's management console.
--
-- Additive only: five new AuditAction values, no table touched and no existing
-- row rewritten. Each answers a question the owner will actually ask of their
-- own audit log — why did this price change, who attached this barcode, who
-- switched Deni off — which is why they are audited when suspending a whole
-- shop account is not: that is a platform-administrator action, and nothing in
-- V1 reads the audit log on a platform administrator's behalf.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_PRICE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BARCODE_ATTACHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_METHOD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_METHOD_UPDATED';
