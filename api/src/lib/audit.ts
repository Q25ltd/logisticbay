/**
 * Append-only audit log helper.
 *
 * Usage:
 *   import { writeAudit } from "../lib/audit.js";
 *   await writeAudit(prisma, {
 *     companyId, actorId: request.user!.userId,
 *     entityType: "Driver", entityId: driver.id,
 *     action: "update", field: "status",
 *     oldValue: { status: "active" }, newValue: { status: "inactive" },
 *     request,
 *   });
 *
 * AuditLog rows are never updated or deleted — the DB-level rules enforce this.
 * Never call prisma.auditLog.update() or prisma.auditLog.delete() in code.
 */

import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "../generated/client.js";

export interface AuditParams {
  companyId:  number;
  actorId?:   number | null;
  entityType: string;
  entityId:   number;
  action:     string;
  field?:     string;
  oldValue?:  unknown;
  newValue?:  unknown;
  note?:      string;
  /** Pass the Fastify request to capture IP and User-Agent automatically. */
  request?:   FastifyRequest;
}

/**
 * Write a single audit record.
 * Failures are caught and logged — audit must never break the main request.
 */
export async function writeAudit(
  prisma: PrismaClient,
  params: AuditParams,
): Promise<void> {
  try {
    const ip        = params.request?.ip ?? null;
    const userAgent = params.request?.headers["user-agent"] ?? null;
    const requestId = (params.request as any)?.id ?? null;

    await prisma.auditLog.create({
      data: {
        companyId:  params.companyId,
        actorId:    params.actorId ?? null,
        entityType: params.entityType,
        entityId:   params.entityId,
        action:     params.action,
        field:      params.field ?? "",
        oldValue:   params.oldValue !== undefined ? (params.oldValue as any) : undefined,
        newValue:   params.newValue !== undefined ? (params.newValue as any) : undefined,
        ipAddress:  ip,
        userAgent:  userAgent,
        requestId:  requestId,
        note:       params.note ?? "",
      },
    });
  } catch (err) {
    // Audit failure must never break the main flow — log and continue.
    console.error("[audit] Failed to write audit log", { err, params });
  }
}

/**
 * Write multiple audit records in a single batch.
 * Use when several fields change in one request.
 */
export async function writeAuditBatch(
  prisma: PrismaClient,
  common: Omit<AuditParams, "field" | "oldValue" | "newValue" | "note">,
  changes: Array<{ field: string; oldValue?: unknown; newValue?: unknown; note?: string }>,
): Promise<void> {
  for (const change of changes) {
    await writeAudit(prisma, { ...common, ...change });
  }
}
