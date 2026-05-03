-- Add GPS coordinates to JobExecutionEvent
ALTER TABLE "JobExecutionEvent" ADD COLUMN "gpsLat" DOUBLE PRECISION;
ALTER TABLE "JobExecutionEvent" ADD COLUMN "gpsLng" DOUBLE PRECISION;
