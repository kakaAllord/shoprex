-- Shoprex V1 initial migration.
-- Creates only the instance metadata table used by the readiness health check.
-- Business tables arrive in Phase 1.

CREATE TABLE "app_metadata" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_metadata_pkey" PRIMARY KEY ("key")
);

INSERT INTO "app_metadata" ("key", "value", "updated_at")
VALUES ('schema_version', '0.1.0-foundation', CURRENT_TIMESTAMP);
