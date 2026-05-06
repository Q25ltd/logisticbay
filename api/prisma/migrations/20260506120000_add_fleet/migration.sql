-- CreateTable
CREATE TABLE "FleetUnit" (
    "id"               SERIAL       NOT NULL,
    "companyId"        INTEGER      NOT NULL,
    "registration"     TEXT         NOT NULL,
    "vehicleClass"     TEXT         NOT NULL,
    "status"           TEXT         NOT NULL DEFAULT 'available',
    "notes"            TEXT,
    "assignedDriverId" INTEGER,
    "currentTrailerId" INTEGER,
    "yardLocation"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetTrailer" (
    "id"             SERIAL       NOT NULL,
    "companyId"      INTEGER      NOT NULL,
    "registration"   TEXT         NOT NULL,
    "trailerType"    TEXT         NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'available',
    "notes"          TEXT,
    "attachedUnitId" INTEGER,
    "linkedJobId"    INTEGER,
    "yardLocation"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetTrailer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FleetUnit_companyId_idx" ON "FleetUnit"("companyId");

-- CreateIndex
CREATE INDEX "FleetTrailer_companyId_idx" ON "FleetTrailer"("companyId");

-- AddForeignKey
ALTER TABLE "FleetUnit" ADD CONSTRAINT "FleetUnit_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetTrailer" ADD CONSTRAINT "FleetTrailer_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
