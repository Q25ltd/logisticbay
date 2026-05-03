-- AlterTable
ALTER TABLE "JobStop" ADD COLUMN     "bookedTime" TIMESTAMP(3),
ADD COLUMN     "earliestArrivalMinutes" INTEGER,
ADD COLUMN     "standingChargeNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "unloadingAllowanceMinutes" INTEGER;

-- AlterTable
ALTER TABLE "PlannedJob" ADD COLUMN     "customerId" INTEGER,
ADD COLUMN     "customerName" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_companyId_status_idx" ON "Customer"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_name_key" ON "Customer"("companyId", "name");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
