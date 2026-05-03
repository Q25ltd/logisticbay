-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- AlterTable
ALTER TABLE "PlannedJob"
    ADD COLUMN "customerId" INTEGER,
    ADD COLUMN "customerNameSnapshot" TEXT NOT NULL DEFAULT '';

-- Migrate priority from Int to String
ALTER TABLE "PlannedJob"
    ALTER COLUMN "priority" DROP DEFAULT,
    ALTER COLUMN "priority" TYPE TEXT USING
        CASE
            WHEN "priority" IS NULL THEN 'normal'
            WHEN "priority" <= 1    THEN 'low'
            WHEN "priority" >= 3    THEN 'high'
            ELSE 'normal'
        END,
    ALTER COLUMN "priority" SET NOT NULL,
    ALTER COLUMN "priority" SET DEFAULT 'normal';

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
