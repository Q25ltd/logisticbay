-- AddColumn: depotLocationId on Company
ALTER TABLE "Company" ADD COLUMN "depotLocationId" INTEGER;

-- AddForeignKey: Company.depotLocationId -> SavedLocation.id
ALTER TABLE "Company" ADD CONSTRAINT "Company_depotLocationId_fkey"
  FOREIGN KEY ("depotLocationId") REFERENCES "SavedLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
