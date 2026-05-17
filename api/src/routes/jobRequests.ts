/**
 * Job Request Intake routes — STUB
 *
 * The JobRequest staging table has been removed. The public request form now
 * writes directly to the Job model (and its related JobPart rows) in a single
 * transaction. This file is kept as a no-op so that existing imports in app.ts
 * continue to compile without changes.
 *
 * TODO: re-implement the public intake form (/public/request/:token) and the
 * associated request-link management routes against the new Job model.
 */

import type { FastifyInstance } from "fastify";
import { PrismaClient }         from "../generated/client.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function jobRequestRoutes(_app: FastifyInstance, _prisma: PrismaClient): Promise<void> {
  // No-op: JobRequest model deleted — PRF now writes directly to Job.
}
