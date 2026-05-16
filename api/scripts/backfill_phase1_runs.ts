/**
 * Phase 1 backfill: create one Run + RunAssignments for every existing PlannedJob.
 *
 * Safe to re-run — checks for existing Run before creating.
 * Run after migration 20260516000000_phase1_run_model has been applied.
 *
 * Status mapping:
 *   pending        → draft
 *   accepted       → assigned
 *   in_progress    → in_progress
 *   arrived_pickup → in_progress
 *   collected      → in_progress
 *   arrived_dropoff→ in_progress
 *   completed      → completed
 *   cancelled      → skipped (no Run created for cancelled jobs)
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

function mapJobStatusToRunStatus(jobStatus: string): string {
  switch (jobStatus) {
    case "pending":         return "draft";
    case "accepted":        return "assigned";
    case "in_progress":     return "in_progress";
    case "arrived_pickup":  return "in_progress";
    case "collected":       return "in_progress";
    case "arrived_dropoff": return "in_progress";
    case "completed":       return "completed";
    default:                return "draft";
  }
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  async function generateRunReference(companyId: number, year: number): Promise<string> {
    const company = await prisma.company.update({
      where: { id: companyId },
      data: { nextRunSequence: { increment: 1 } },
      select: { nextRunSequence: true },
    });
    const seq = (company.nextRunSequence - 1).toString().padStart(6, "0");
    return `RUN-${year}-${seq}`;
  }

  console.log("Phase 1 backfill: PlannedJob → Run + RunAssignments");

  const jobs = await prisma.plannedJob.findMany({
    where: { status: { not: "cancelled" } },
    include: { stops: { orderBy: { sequenceNumber: "asc" } } },
  });

  console.log(`Found ${jobs.length} non-cancelled jobs to process`);

  let created = 0;
  let skipped = 0;

  for (const job of jobs) {
    const existingRun = await prisma.run.findFirst({
      where: { assignments: { some: { jobId: job.id } } },
    });

    if (existingRun) {
      skipped++;
      continue;
    }

    const year = new Date(job.createdAt).getFullYear();
    const runReference = await generateRunReference(job.companyId, year);
    const runStatus = mapJobStatusToRunStatus(job.status);

    await prisma.$transaction(async (tx) => {
      const run = await tx.run.create({
        data: {
          companyId:        job.companyId,
          runReference,
          status:           runStatus,
          assignedDriverId: job.assignedDriverId ?? undefined,
          plannedDate:      job.plannedDate ?? undefined,
          plannerNotes:     job.plannerNotes || undefined,
          createdBy:        job.createdByUserId,
          createdAt:        job.createdAt,
        },
      });

      for (const stop of job.stops) {
        await tx.runAssignment.create({
          data: {
            companyId:        job.companyId,
            runId:            run.id,
            jobPartId:        stop.id,
            jobId:            job.id,
            sequenceNumber:   stop.sequenceNumber,
            quantityAssigned: stop.numPallets ?? 0,
            quantityUnit:     "",
            status:           runStatus === "completed" ? "completed" : "pending",
            addedAt:          job.createdAt,
            addedBy:          job.createdByUserId,
          },
        });
      }
    });

    created++;
    if (created % 50 === 0) {
      console.log(`  ${created} runs created...`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (already had Run): ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
