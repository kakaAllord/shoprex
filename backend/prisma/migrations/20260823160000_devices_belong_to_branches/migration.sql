-- ---------------------------------------------------------------------------
-- A device belongs to a BRANCH, not to one worker.
--
-- Until now a phone was bound to exactly one worker, and the device *was* the
-- attribution. That is why V1 had no per-worker PIN. It also meant a flat
-- battery stopped a shift: nobody else could sign in on that handset.
--
-- From here a phone is enrolled to a branch, and any worker assigned to that
-- branch signs in on it with their own password. Because the handset no longer
-- identifies anybody, sign-in does — the worker picks their name first.
--
-- Confirmed by the owner on 2026-08-23. Supersedes the rule recorded in
-- PROGRESS.md §2; the reasoning is in §2a.
-- ---------------------------------------------------------------------------

-- Every existing phone is revoked and must be enrolled again. The owner chose
-- this over silently re-pointing handsets at a branch: no device carries a
-- binding from the old model into the new one, and a phone in someone's pocket
-- cannot keep a session that was granted under different rules. A revoked
-- device is refused at the backend on its very next request.
UPDATE "devices"
SET "status" = 'REVOKED', "revoked_at" = NOW()
WHERE "status" = 'ACTIVE';

-- Outstanding codes named a worker, which no longer means anything, and spent
-- ones only record how a now-revoked device came to exist. Both are removed so
-- the new NOT NULL column below has no rows to backfill and no code issued
-- under the old rules can still be redeemed.
DELETE FROM "device_enrollment_tokens";

-- DropForeignKey
ALTER TABLE "device_enrollment_tokens" DROP CONSTRAINT "device_enrollment_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_user_id_fkey";

-- DropIndex
DROP INDEX "device_enrollment_tokens_user_id_idx";

-- DropIndex
DROP INDEX "devices_branch_id_idx";

-- DropIndex
DROP INDEX "devices_user_id_status_idx";

-- AlterTable
ALTER TABLE "device_enrollment_tokens" DROP COLUMN "user_id",
ADD COLUMN     "device_name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "devices" DROP COLUMN "user_id";

-- CreateIndex
CREATE INDEX "device_enrollment_tokens_branch_id_idx" ON "device_enrollment_tokens"("branch_id");

-- CreateIndex
CREATE INDEX "devices_branch_id_status_idx" ON "devices"("branch_id", "status");
