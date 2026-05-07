-- Migration: create append-only AuditLog table
-- Idempotent: uses IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"          SERIAL PRIMARY KEY,
  "companyId"   INTEGER       NOT NULL,
  "actorId"     INTEGER,
  "entityType"  TEXT          NOT NULL,
  "entityId"    INTEGER       NOT NULL,
  "action"      TEXT          NOT NULL,
  "field"       TEXT          NOT NULL DEFAULT '',
  "oldValue"    JSONB,
  "newValue"    JSONB,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "requestId"   TEXT,
  "note"        TEXT          NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_companyId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actorId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Prevent updates and deletes to keep the log append-only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules WHERE rulename = 'AuditLog_no_update' AND tablename = 'AuditLog'
  ) THEN
    EXECUTE $rule$
      CREATE RULE "AuditLog_no_update" AS ON UPDATE TO "AuditLog" DO INSTEAD NOTHING
    $rule$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules WHERE rulename = 'AuditLog_no_delete' AND tablename = 'AuditLog'
  ) THEN
    EXECUTE $rule$
      CREATE RULE "AuditLog_no_delete" AS ON DELETE TO "AuditLog" DO INSTEAD NOTHING
    $rule$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_actorId_idx"             ON "AuditLog"("companyId", "actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_createdAt_idx"           ON "AuditLog"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"                     ON "AuditLog"("createdAt");
