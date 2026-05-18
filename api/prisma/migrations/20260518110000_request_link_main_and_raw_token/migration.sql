-- Store raw token for re-copy
ALTER TABLE "ClientRequestLink" ADD COLUMN IF NOT EXISTS "rawToken" TEXT;

-- Flag the one permanent company-wide "main" link
ALTER TABLE "ClientRequestLink" ADD COLUMN IF NOT EXISTS "isMain" BOOLEAN NOT NULL DEFAULT false;

-- At most one main link per company
CREATE UNIQUE INDEX IF NOT EXISTS "ClientRequestLink_companyId_isMain_key"
  ON "ClientRequestLink"("companyId")
  WHERE "isMain" = true;
