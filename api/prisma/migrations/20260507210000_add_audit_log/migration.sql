-- Migration: create append-only AuditLog table
-- Every sensitive create/update/delete/status_change action is recorded here.
-- Rows are NEVER updated or deleted — only appended.

CREATE TABLE "AuditLog" (
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

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent updates and deletes to keep the log append-only
CREATE OR REPLACE RULE "AuditLog_no_update" AS
  ON UPDATE TO "AuditLog" DO INSTEAD NOTHING;

CREATE OR REPLACE RULE "AuditLog_no_delete" AS
  ON DELETE TO "AuditLog" DO INSTEAD NOTHING;

-- Indexes for common query patterns
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");
CREATE INDEX "AuditLog_companyId_actorId_idx"             ON "AuditLog"("companyId", "actorId");
CREATE INDEX "AuditLog_companyId_createdAt_idx"           ON "AuditLog"("companyId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx"                     ON "AuditLog"("createdAt");
