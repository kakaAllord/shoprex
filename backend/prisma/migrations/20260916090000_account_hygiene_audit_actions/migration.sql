-- Phase 9 — account hygiene.
--
-- Changing a password and switching a person off are both new in this phase,
-- and both are things an owner needs to be able to see after the fact: a reset
-- they did not perform is the first sign something is wrong.
--
-- Additive only. Postgres cannot drop an enum value, which is the usual reason
-- to think twice here — but nothing is being removed, and an existing row
-- cannot suddenly carry a value that did not exist when it was written.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_REACTIVATED';
