/**
 * Accept flow — driver-facing notes are added by the PLANNER at accept time.
 *
 * Design (2026-07-14): the CJP deliberately has no driver-notes section —
 * customers may suggest driverVisibleNotes/safetyInstructions on the PRF, and
 * the planner reviews/edits them in the accept drawer. This test proves the
 * accept endpoint stores the planner's values on the job.
 */

import "dotenv/config";
import "../lib/env.js";
import { env } from "../lib/env.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "../app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

after(async () => { await prisma.$disconnect(); });

const PREFIX = "__ACCEPTNOTES__";
const TS     = Date.now();

test("accepting a request stores planner-edited driver notes", async () => {
  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });
  const planner = await prisma.user.create({
    data: {
      name: `${PREFIX}P`, email: `${PREFIX}p_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x", status: "active",
      memberships: { create: { companyId: company.id, role: "planner", status: "active" } },
    },
  });
  const token = jwt.sign({ userId: planner.id, companyId: company.id, role: "planner" }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
  const app = await buildApp(prisma, { silent: true });

  try {
    // A PRF-shaped pending_review job: customer suggested a driver note.
    const job = await prisma.job.create({
      data: {
        companyId: company.id, createdByUserId: planner.id,
        customerName: `${PREFIX}Cust`, status: "pending_review",
        vehicleCategory: "rigid", goodsType: "pallets", quantity: 4,
        quantityUnit: "pallets", goodsDescription: "Palletised parts",
        driverVisibleNotes: "Customer said: use rear entrance",
        stops: {
          create: [
            {
              companyId: company.id, sequenceNumber: 1, type: "collection",
              locationTextSnapshot: "Depot A, 1 Test St, Leeds, LS1 1AA",
              contactName: "Al", contactPhone: "07000000001",
              timeWindowStart: new Date("2026-08-01T08:00:00Z"),
              timeWindowEnd:   new Date("2026-08-01T10:00:00Z"),
            },
            {
              companyId: company.id, sequenceNumber: 2, type: "delivery",
              locationTextSnapshot: "Site B, 2 Test Rd, York, YO1 1AA",
              contactName: "Bo", contactPhone: "07000000002",
              timeWindowStart: new Date("2026-08-01T12:00:00Z"),
              timeWindowEnd:   new Date("2026-08-01T14:00:00Z"),
            },
          ],
        },
      },
    });

    const res = await app.inject({
      method: "POST", url: `/job-requests/${job.id}/accept`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        plannerNotes:       "North route",
        driverVisibleNotes: "Ring site office on arrival. Rear entrance, bay 4.",
        safetyInstructions: "Hi-vis and hard hat required.",
      },
    });
    assert.strictEqual(res.statusCode, 200, res.body);

    const updated = await prisma.job.findUnique({ where: { id: job.id } });
    assert.strictEqual(updated?.status, "ready_to_plan");
    assert.strictEqual(updated?.driverVisibleNotes, "Ring site office on arrival. Rear entrance, bay 4.");
    assert.strictEqual(updated?.safetyInstructions, "Hi-vis and hard hat required.");
  } finally {
    await app.close();
    await prisma.jobAudit.deleteMany({ where: { companyId: company.id } });
    await prisma.jobPart.deleteMany({ where: { companyId: company.id } });
    await prisma.job.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMembership.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { id: planner.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  }
});
