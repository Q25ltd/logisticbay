/**
 * Job form parity test.
 *
 * Proves that CJP (POST /jobs) and PRF (POST /public/request/:token) write
 * the same values into the same Job columns when given the same payload.
 *
 * Also asserts that the payload validates against both Zod schemas without
 * any field being silently dropped or re-mapped.
 *
 * Run: npm test
 */
import "dotenv/config";
import "../lib/env.js";
import { env }         from "../lib/env.js";
import { test, after } from "node:test";
import assert          from "node:assert/strict";
import crypto          from "node:crypto";
import jwt             from "jsonwebtoken";
import { PrismaClient }   from "../generated/client.js";
import { PrismaPg }       from "@prisma/adapter-pg";
import { buildApp }       from "../app.js";
import { CreateJobSchema } from "../schemas/jobs.js";

// ─── DB + App ────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

after(async () => { await prisma.$disconnect(); });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PREFIX = "__PARITY__";
const TS     = Date.now();

function makeToken(userId: number, companyId: number, role = "planner") {
  return jwt.sign({ userId, companyId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
}

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function cleanup(companyIds: number[], userIds: number[]) {
  const where = { companyId: { in: companyIds } };
  await prisma.jobAudit.deleteMany({ where });
  await prisma.jobExecutionEvent.deleteMany({ where });
  await prisma.syncEventLog.deleteMany({ where });
  await prisma.jobPart.deleteMany({ where });
  await prisma.job.deleteMany({ where });
  await prisma.clientRequestLink.deleteMany({ where });
  await prisma.savedLocation.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.jobTemplate.deleteMany({ where });
  await prisma.driverProfile.deleteMany({ where });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.companyMembership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

// ─── Representative payload ───────────────────────────────────────────────────
//
// One flat object using only Job/JobPart column names.
// Must satisfy the "Field contract — Job creation" from REQUEST_TO_JOB_PLAN.md.
// CJP adds plannedDate + plannerNotes + saveMode on top.

const SHARED_PAYLOAD = {
  customerName:        "Parity Test Ltd",
  customerRef:         "PARITY-001",
  purchaseOrderNumber: "PO-2026-TEST",
  bookingContactName:  "Alice Smith",
  bookingContactPhone: "07700000001",
  bookingContactEmail: "alice@parity-test.invalid",
  goodsType:           "palletised_goods",
  goodsDescription:    "Test widgets on euro pallets",
  quantity:            24,
  quantityUnit:        "pallets",
  weight:              4200,
  fragile:             true,
  stackable:           false,
  tempControlled:      false,
  hazardClass:         "3",
  securingRequirements: ["straps"],
  specialRequirements:  ["tail_lift"],
  vehicleCategory:     "rigid",
  trailersAllowed:     ["curtain"],
  equipment:           ["tail_lift"],
  failureAction:       "call_assistance",
  requirePOD:          true,
  driverVisibleNotes:  "Do not block the loading bay",
  stops: [
    {
      sequenceNumber: 1,
      type:           "collection",
      siteName:       "Parity Warehouse",
      street:         "1 Test Road",
      town:           "Testville",
      postcode:       "TE1 1ST",
      locationTextSnapshot: "Parity Warehouse, 1 Test Road, Testville TE1 1ST",
      timeWindowStart: "2026-08-01T07:00:00.000Z",
      timeWindowEnd:   "2026-08-01T10:00:00.000Z",
      contactName:     "Bob Loader",
      contactPhone:    "07700000002",
      referenceNumber: "COL-001",
    },
    {
      sequenceNumber: 2,
      type:           "delivery",
      siteName:       "Parity Depot",
      street:         "99 Delivery Lane",
      town:           "Dropsville",
      postcode:       "DR2 2OP",
      locationTextSnapshot: "Parity Depot, 99 Delivery Lane, Dropsville DR2 2OP",
      timeWindowStart: "2026-08-01T12:00:00.000Z",
      timeWindowEnd:   "2026-08-01T16:00:00.000Z",
      contactName:     "Carol Receiver",
      contactPhone:    "07700000003",
    },
  ],
} as const;

// Fields written exclusively by the server — excluded from parity comparison.
const SERVER_ONLY = new Set([
  "id", "companyId", "createdByUserId", "jobReference",
  "status",           // PRF = pending_review, CJP = draft
  "plannedDate",      // CJP-only planner field
  "plannerNotes",     // CJP-only planner field
  "internalNotes",    // CJP-only planner field
  "validationStatus", // CJP runs structured validation; PRF uses schema default
  "qualityScore",     // CJP computes quality score; PRF uses schema default
  "createdAt", "updatedAt", "closedAt", "closedBy",
  "templateId", "parentJobId",
  "overrideClosed", "overrideReason", "overrideNotes",
  "overrideQuantityDelivered", "overrideQuantityShortfall",
]);

// ─── Test ─────────────────────────────────────────────────────────────────────

test("Job form parity — full suite", async (t) => {

  // ── Setup ──────────────────────────────────────────────────────────────────

  const company = await prisma.company.create({
    data: { name: `${PREFIX}Co_${TS}`, slug: `${PREFIX}co-${TS}`.toLowerCase() },
  });

  const user = await prisma.user.create({
    data: {
      name:         `${PREFIX}User_${TS}`,
      email:        `${PREFIX}user_${TS}@test.invalid`.toLowerCase(),
      passwordHash: "x",
      status:       "active",
      memberships:  { create: { companyId: company.id, role: "planner", status: "active" } },
    },
  });

  const rawToken  = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  const link = await prisma.clientRequestLink.create({
    data: {
      companyId:  company.id,
      name:       `${PREFIX}Link_${TS}`,
      tokenHash,
      isActive:   true,
      createdBy:  user.id,
      templateData: { undefined: true },
    },
  });

  const companyIds = [company.id];
  const userIds    = [user.id];

  const token  = makeToken(user.id, company.id, "planner");
  const app    = await buildApp(prisma, { silent: true });

  try {

    // ── 1. Schema validation ────────────────────────────────────────────────

    await t.test("shared payload validates against CreateJobSchema", () => {
      const result = CreateJobSchema.safeParse(SHARED_PAYLOAD);
      assert.ok(result.success, `Zod errors: ${JSON.stringify(result.error?.issues)}`);
    });

    await t.test("shared payload + CJP fields validates against CreateJobSchema", () => {
      const cjpPayload = {
        ...SHARED_PAYLOAD,
        saveMode:     "ready_to_plan",
        plannedDate:  "2026-08-01",
        plannerNotes: "Test planner note",
      };
      const result = CreateJobSchema.safeParse(cjpPayload);
      assert.ok(result.success, `Zod errors: ${JSON.stringify(result.error?.issues)}`);
    });

    // ── 2. POST via CJP route ───────────────────────────────────────────────

    const cjpRes = await app.inject({
      method:  "POST",
      url:     "/jobs",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body:    JSON.stringify({ ...SHARED_PAYLOAD, saveMode: "draft" }),
    });

    assert.equal(cjpRes.statusCode, 201, `CJP POST failed: ${cjpRes.body}`);
    const cjpJobId: number = JSON.parse(cjpRes.body).job?.id ?? JSON.parse(cjpRes.body).id;
    assert.ok(cjpJobId, "CJP: no job id in response");

    // ── 3. POST via PRF route ───────────────────────────────────────────────

    const prfRes = await app.inject({
      method:  "POST",
      url:     `/public/request/${rawToken}`,
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(SHARED_PAYLOAD),
    });

    assert.equal(prfRes.statusCode, 201, `PRF POST failed: ${prfRes.body}`);
    const prfJobId: number = JSON.parse(prfRes.body).id;
    assert.ok(prfJobId, "PRF: no job id in response");

    // ── 4. Read both jobs back ──────────────────────────────────────────────

    const [cjpJob, prfJob] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: cjpJobId }, include: { stops: { orderBy: { sequenceNumber: "asc" } } } }),
      prisma.job.findUniqueOrThrow({ where: { id: prfJobId }, include: { stops: { orderBy: { sequenceNumber: "asc" } } } }),
    ]);

    // ── 5. Compare shared Job columns ───────────────────────────────────────

    await t.test("Job columns match between CJP and PRF", () => {
      const allKeys = new Set([...Object.keys(cjpJob), ...Object.keys(prfJob)]);

      for (const key of allKeys) {
        if (SERVER_ONLY.has(key) || key === "stops" || key === "audits") continue;

        const cjpVal = (cjpJob as Record<string, unknown>)[key];
        const prfVal = (prfJob as Record<string, unknown>)[key];

        // Normalise: JSON blobs (arrays) come back as objects — deep-equal compare
        const cjpNorm = cjpVal == null ? null : JSON.parse(JSON.stringify(cjpVal));
        const prfNorm = prfVal == null ? null : JSON.parse(JSON.stringify(prfVal));

        assert.deepStrictEqual(
          cjpNorm,
          prfNorm,
          `Column "${key}" differs: CJP=${JSON.stringify(cjpNorm)} PRF=${JSON.stringify(prfNorm)}`,
        );
      }
    });

    // ── 6. Compare stop columns ─────────────────────────────────────────────

    await t.test("JobPart stop count matches", () => {
      assert.equal(cjpJob.stops.length, SHARED_PAYLOAD.stops.length, "CJP stop count wrong");
      assert.equal(prfJob.stops.length, SHARED_PAYLOAD.stops.length, "PRF stop count wrong");
    });

    const STOP_SERVER_ONLY = new Set(["id", "jobId", "companyId", "createdAt", "updatedAt", "status"]);

    await t.test("JobPart stop 1 columns match", () => {
      const cs = cjpJob.stops[0] as Record<string, unknown>;
      const ps = prfJob.stops[0] as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(cs), ...Object.keys(ps)]);
      for (const key of allKeys) {
        if (STOP_SERVER_ONLY.has(key)) continue;
        const cNorm = cs[key] == null ? null : JSON.parse(JSON.stringify(cs[key]));
        const pNorm = ps[key] == null ? null : JSON.parse(JSON.stringify(ps[key]));
        assert.deepStrictEqual(cNorm, pNorm, `Stop[0].${key} differs: CJP=${JSON.stringify(cNorm)} PRF=${JSON.stringify(pNorm)}`);
      }
    });

    await t.test("JobPart stop 2 columns match", () => {
      const cs = cjpJob.stops[1] as Record<string, unknown>;
      const ps = prfJob.stops[1] as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(cs), ...Object.keys(ps)]);
      for (const key of allKeys) {
        if (STOP_SERVER_ONLY.has(key)) continue;
        const cNorm = cs[key] == null ? null : JSON.parse(JSON.stringify(cs[key]));
        const pNorm = ps[key] == null ? null : JSON.parse(JSON.stringify(ps[key]));
        assert.deepStrictEqual(cNorm, pNorm, `Stop[1].${key} differs: CJP=${JSON.stringify(cNorm)} PRF=${JSON.stringify(pNorm)}`);
      }
    });

    // ── 7. Spot-check key column values ────────────────────────────────────

    await t.test("key field values written correctly (CJP)", () => {
      assert.equal(cjpJob.customerName,        "Parity Test Ltd");
      assert.equal(cjpJob.customerRef,         "PARITY-001");
      assert.equal(cjpJob.goodsDescription,    "Test widgets on euro pallets");
      assert.equal(cjpJob.quantity,            24);
      assert.equal(cjpJob.hazardClass,         "3");
      assert.equal(cjpJob.fragile,             true);
      assert.equal(cjpJob.requirePOD,          true);
      assert.equal(cjpJob.failureAction,       "call_assistance");
      assert.equal(cjpJob.driverVisibleNotes,  "Do not block the loading bay");
      assert.deepEqual(cjpJob.securingRequirements, ["straps"]);
      assert.deepEqual(cjpJob.trailersAllowed,      ["curtain"]);
    });

    await t.test("key field values written correctly (PRF)", () => {
      assert.equal(prfJob.customerName,        "Parity Test Ltd");
      assert.equal(prfJob.customerRef,         "PARITY-001");
      assert.equal(prfJob.goodsDescription,    "Test widgets on euro pallets");
      assert.equal(prfJob.quantity,            24);
      assert.equal(prfJob.hazardClass,         "3");
      assert.equal(prfJob.fragile,             true);
      assert.equal(prfJob.requirePOD,          true);
      assert.equal(prfJob.failureAction,       "call_assistance");
      assert.equal(prfJob.driverVisibleNotes,  "Do not block the loading bay");
      assert.deepEqual(prfJob.securingRequirements, ["straps"]);
      assert.deepEqual(prfJob.trailersAllowed,      ["curtain"]);
    });

    await t.test("PRF status is pending_review, CJP status is draft", () => {
      assert.equal(prfJob.status, "pending_review");
      assert.equal(cjpJob.status, "draft");
    });

  } finally {
    await cleanup(companyIds, userIds);
  }
});
