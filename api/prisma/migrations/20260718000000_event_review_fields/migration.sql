-- S15 reconciliation surface: planner review stamps on execution events
ALTER TABLE "JobExecutionEvent" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "JobExecutionEvent" ADD COLUMN "reviewedBy" INTEGER;
