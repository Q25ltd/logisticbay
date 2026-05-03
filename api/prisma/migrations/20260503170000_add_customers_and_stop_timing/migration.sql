-- AlterTable: add timing fields to JobStop
ALTER TABLE "JobStop"
    ADD COLUMN "bookedTime"                TIMESTAMP(3),
    ADD COLUMN "earliestArrivalMinutes"    INTEGER,
    ADD COLUMN "standingChargeNote"        TEXT NOT NULL DEFAULT '',
    ADD COLUMN "unloadingAllowanceMinutes" INTEGER;

-- AlterTable: add customer reference to PlannedJob
ALTER TABLE "PlannedJob"
    ADD COLUMN "customerId"   INTEGER,
    ADD COLUMN "customerName" TEXT NOT NULL DEFAULT '';

-- CreateTable: Customer
CREATE TABLE "Customer" (
    "id"           SERIAL NOT NULL,
    "companyId"    INTEGER NOT NULL,
    "name"         TEXT NOT NULL,
    "contactName"  TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "notes"        TEXT NOT NULL DEFAULT '',
    "status"       TEXT NOT NULL DEFAULT 'active',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_name_key" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE INDEX "Customer_companyId_status_idx" ON "Customer"("companyId", "status");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedJob" ADD CONSTRAINT "PlannedJob_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
