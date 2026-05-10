-- CreateTable
CREATE TABLE "RefreshToken" (
    "id"         SERIAL NOT NULL,
    "userId"     INTEGER NOT NULL,
    "companyId"  INTEGER NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "familyId"   TEXT NOT NULL,
    "userAgent"  TEXT NOT NULL DEFAULT '',
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    "revokedAt"  TIMESTAMPTZ,
    "lastUsedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
