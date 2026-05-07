/**
 * Tenant Isolation Integration Test
 *
 * Proves Company A cannot read Company B's data through the API.
 * Runs against the real database. Creates test data with a unique
 * prefix and cleans up after itself regardless of outcome.
 *
 * Run: npm test
 */
import "dotenv/config";
import { test } from "node:test";
import assert   from "node:assert/strict";
import jwt      from "jsonwebtoken";
import { PrismaClient } from "../generated/client.js";
import { PrismaPg }     from "@prisma/adapter-pg";
import { buildApp }     from "../app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

const PREFIX     = "__ITEST__";
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestCompany(label: string) {
  return prisma.company.create({
    data: {
      name: `${PREFIX}${label}`,
      slug: `${PREFIX}${label}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    },
  });
}

async function createTestUser(label: string, companyId: number, role: string) {
  return prisma.user.create({
    data: {
      name:         `${PREFIX}${label}`,
      email:        `${PREFIX}${label}-${Date.now()}@test.invalid`.toLowerCase(),
      passwordHash: "x",
      status:       "active",
      memberships:  { create: { companyId, role, status: "active" } },
    },
  });
}

async function cleanup(ids: {
  companyIds: number[];
  userIds:    number[];
}) {
  for (const cId of ids.companyIds) {
    await prisma.plannedJob.deleteMany({ where: { companyId: cId } });
  }
  for (const uId of ids.userIds) {
    await prisma.companyMembership.deleteMany({ where: { userId: uId } });
    await prisma.user.deleteMany({ where: { id: uId } });
  }
  for (const cId of ids.companyIds) {
    await prisma.company.deleteMany({ where: { id: cId } });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Company A cannot see Company B jobs via GET /jobs", async () => {
  const companyIds: number[] = [];
  const userIds:    number[] = [];

  try {
    const companyA = await createTestCompany("Company_A");
    const companyB = await createTestCompany("Company_B");
    companyIds.push(companyA.id, companyB.id);

    const userA = await createTestUser("User_A", companyA.id, "planner");
    const userB = await createTestUser("User_B", companyB.id, "planner");
    userIds.push(userA.id, userB.id);

    // Create one job for Company B only
    await prisma.plannedJob.create({
      data: {
        companyId:       companyB.id,
        createdByUserId: userB.id,
        customerName:    `${PREFIX}Customer_B`,
        status:          "draft",
      },
    });

    const app = await buildApp(prisma, { silent: true });

    const tokenA = jwt.sign(
      { userId: userA.id, companyId: companyA.id, role: "planner" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await app.inject({
      method:  "GET",
      url:     "/jobs",
      headers: { authorization: `Bearer ${tokenA}` },
    });

    await app.close();

    assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);

    const jobs = (JSON.parse(res.body).data ?? []) as Array<{ companyId: number }>;

    const leaked = jobs.filter(j => j.companyId === companyB.id);
    assert.equal(
      leaked.length,
      0,
      `TENANT ISOLATION BREACH: ${leaked.length} Company B job(s) visible to Company A`
    );
  } finally {
    await cleanup({ companyIds, userIds });
    await prisma.$disconnect();
  }
});

test("Company A token rejected on Company B job detail via GET /jobs/:id", async () => {
  const companyIds: number[] = [];
  const userIds:    number[] = [];

  try {
    const companyA = await createTestCompany("Company_A2");
    const companyB = await createTestCompany("Company_B2");
    companyIds.push(companyA.id, companyB.id);

    const userA = await createTestUser("User_A2", companyA.id, "planner");
    const userB = await createTestUser("User_B2", companyB.id, "planner");
    userIds.push(userA.id, userB.id);

    const jobB = await prisma.plannedJob.create({
      data: {
        companyId:       companyB.id,
        createdByUserId: userB.id,
        customerName:    `${PREFIX}Customer_B2`,
        status:          "draft",
      },
    });

    const app = await buildApp(prisma, { silent: true });

    const tokenA = jwt.sign(
      { userId: userA.id, companyId: companyA.id, role: "planner" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await app.inject({
      method:  "GET",
      url:     `/jobs/${jobB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    await app.close();

    assert.equal(
      res.statusCode,
      404,
      `TENANT ISOLATION BREACH: Company A accessed Company B job ${jobB.id} (status ${res.statusCode})`
    );
  } finally {
    await cleanup({ companyIds, userIds });
    await prisma.$disconnect();
  }
});
