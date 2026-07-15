/**
 * plannerWorkService.test.ts
 *
 * Unit tests for getPlannerWorkItems using node:test (project's test runner).
 * All Prisma calls are mocked — no real database is touched.
 *
 * Run directly:
 *   node --import tsx/esm --test --test-force-exit src/services/plannerWorkService.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getPlannerWorkItems, type PlannerWorkItem } from "./plannerWorkService.js";

// ── Minimal Prisma mock factory ───────────────────────────────────────────────

type MockFindMany = (args?: unknown) => Promise<unknown[]>;

function makePrisma(overrides: {
  jobPartFindMany?: MockFindMany | MockFindMany[];
  loadTrackFindMany?: MockFindMany;
} = {}) {
  // Support an array of sequential responses for jobPart.findMany.
  // The service issues two queries via Promise.all (timeWindowStart range, then
  // bookedTime range); extra resolvers are harmless and ignored.
  let callCount = 0;
  const jpResponses = Array.isArray(overrides.jobPartFindMany)
    ? overrides.jobPartFindMany
    : [overrides.jobPartFindMany ?? (() => Promise.resolve([])),
       () => Promise.resolve([]),
       () => Promise.resolve([])];

  return {
    jobPart: {
      findMany: (_args?: unknown) => {
        const fn = jpResponses[callCount] ?? (() => Promise.resolve([]));
        callCount++;
        return Promise.resolve(fn(_args) as unknown) as Promise<unknown[]>;
      },
    },
    loadTrack: {
      findMany: overrides.loadTrackFindMany ?? (() => Promise.resolve([])),
    },
  } as unknown as import("../generated/client.js").PrismaClient;
}

// ── Shared builders ───────────────────────────────────────────────────────────

const TODAY = new Date();
const TOMORROW = new Date(TODAY);
TOMORROW.setDate(TOMORROW.getDate() + 1);
const YESTERDAY = new Date(TODAY);
YESTERDAY.setDate(YESTERDAY.getDate() - 1);
const IN_1_HOUR = new Date(TODAY.getTime() + 60 * 60 * 1000);

function makeJobPart(overrides: Partial<{
  id: number;
  jobId: number;
  companyId: number;
  type: string;
  sequenceNumber: number;
  street: string | null;
  town: string | null;
  postcode: string | null;
  locationTextSnapshot: string | null;
  siteName: string | null;
  lat: number | null;
  lng: number | null;
  timeWindowStart: Date | null;
  timeWindowEnd: Date | null;
  bookedTime: Date | null;
  status: string;
  quantityRequired: number | null;
  runAssignments: { quantityAssigned: number }[];
  job: Record<string, unknown>;
}> = {}) {
  return {
    id:                   overrides.id ?? 1,
    jobId:                overrides.jobId ?? 10,
    companyId:            overrides.companyId ?? 1,
    type:                 overrides.type ?? "collection",
    sequenceNumber:       overrides.sequenceNumber ?? 1,
    street:               overrides.street ?? "1 Test Lane",
    town:                 overrides.town ?? "London",
    postcode:             overrides.postcode ?? "E1 1AA",
    locationTextSnapshot: overrides.locationTextSnapshot ?? null,
    siteName:             overrides.siteName ?? null,
    lat:                  overrides.lat ?? null,
    lng:                  overrides.lng ?? null,
    timeWindowStart:      overrides.timeWindowStart ?? null,
    timeWindowEnd:        overrides.timeWindowEnd ?? null,
    bookedTime:           overrides.bookedTime ?? null,
    status:               overrides.status ?? "pending",
    quantityRequired:     overrides.quantityRequired ?? null,
    // mirrors the real partInclude: active assignments' shares (quantity ledger)
    runAssignments:       overrides.runAssignments ?? [],
    job: overrides.job ?? {
      id: overrides.jobId ?? 10,
      jobReference:    "LB-2026-001",
      customerName:    "Test Customer",
      goodsType:       "pallets",
      goodsDescription: "Assorted pallets",
      quantity:        10,
      quantityUnit:    "pallets",
      weight:          5000,
      vehicleCategory: "rigid",
      tempControlled:  false,
      hazardClass:     null,
      plannedDate:     TODAY,
    },
  };
}

function makeLoadTrack(overrides: Partial<{
  id: number;
  jobId: number;
  jobPartId: number;
  runId: number | null;
  toCustody: string;
  fromCustody: string;
  trailerId: string;
  timestamp: Date;
  transactionType: string;
}> = {}) {
  return {
    id:              overrides.id ?? 100,
    jobId:           overrides.jobId ?? 10,
    jobPartId:       overrides.jobPartId ?? 1,
    runId:           overrides.runId ?? null,
    toCustody:       overrides.toCustody ?? "driver:1",
    fromCustody:     overrides.fromCustody ?? "customer",
    trailerId:       overrides.trailerId ?? "",
    timestamp:       overrides.timestamp ?? new Date(),
    transactionType: overrides.transactionType ?? "collect",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getPlannerWorkItems", () => {

  // Test 1: Normal collection → delivery job
  test("normal collection→delivery job: appears in today or future group, no warnings", async () => {
    // Use a future booking time (4 hours from now) to avoid "past" warnings
    const futureBook = new Date(TODAY.getTime() + 4 * 60 * 60 * 1000);
    const collectionPart = makeJobPart({
      id: 1, jobId: 10, type: "collection", sequenceNumber: 1,
      bookedTime: futureBook,
    });
    const deliveryPart = makeJobPart({
      id: 2, jobId: 10, type: "delivery", sequenceNumber: 2,
      postcode: "LS1 1AB",
      bookedTime: futureBook,
    });

    // First call returns collection, second/third return delivery or empty
    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([collectionPart, deliveryPart]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([]),
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    assert.ok(items.length >= 1, "should return at least one item");
    const collItem = items.find(i => i.jobPartId === 1);
    assert.ok(collItem, "collection part should be in results");
    assert.ok(
      collItem.groupKey === "today" || collItem.groupKey === "future" || collItem.groupKey.startsWith("direction_") || collItem.groupKey.startsWith("vehicle_"),
      `groupKey should not be needs_attention, got: ${collItem.groupKey}`,
    );

    // Collection part has no delivery warning since there IS a delivery part
    const deliveryWarning = collItem.warnings.find(w => w.includes("Load not yet collected"));
    assert.equal(deliveryWarning, undefined, "should not warn about load not collected on collection part");
  });

  // Test 2: Load collected, sitting at depot, no delivery stop planned
  test("load collected with no delivery: in_custody group, warning about no delivery", async () => {
    const collectionPart = makeJobPart({
      id: 3, jobId: 20, type: "collection",
      job: {
        id: 20, jobReference: "LB-2026-002", customerName: "Depot Customer",
        goodsType: "pallets", goodsDescription: null, quantity: 5,
        quantityUnit: "pallets", weight: 2000,
        vehicleCategory: "rigid", tempControlled: false, hazardClass: null,
        plannedDate: TODAY,
      },
    });

    const loadTrack = makeLoadTrack({
      jobId: 20, jobPartId: 3,
      // Custody is base-prefixed (loadVocab): a load on a vehicle is on_vehicle:<ref>.
      toCustody: "on_vehicle:5", fromCustody: "customer_origin",
      trailerId: "",
    });

    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([collectionPart]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([loadTrack]),
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    const item = items.find(i => i.jobPartId === 3);
    assert.ok(item, "should find the item");
    assert.equal(item.groupKey, "in_custody", `expected in_custody group, got ${item.groupKey}`);
    const noDeliveryWarning = item.warnings.find(w => w.includes("no delivery stop has been planned"));
    assert.ok(noDeliveryWarning, "should warn about no delivery stop");
  });

  // Test 3: Delivery before collection — delivery part exists but no LoadTrack
  test("delivery part with no LoadTrack: warns load not yet collected", async () => {
    const deliveryPart = makeJobPart({
      id: 5, jobId: 30, type: "delivery", sequenceNumber: 2,
      postcode: "M1 1AA",
      job: {
        id: 30, jobReference: "LB-2026-003", customerName: "Delivery Customer",
        goodsType: "machinery", goodsDescription: "Heavy machinery",
        quantity: 1, quantityUnit: "items", weight: 8000,
        vehicleCategory: "artic", tempControlled: false, hazardClass: null,
        plannedDate: TODAY,
      },
    });

    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([deliveryPart]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([]),
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    const item = items.find(i => i.jobPartId === 5);
    assert.ok(item, "should find the delivery item");

    const warning = item.warnings.find(w => w.includes("Load not yet collected"));
    assert.ok(warning, "should warn that load has not yet been collected");
    assert.equal(item.riskLevel, "high", "delivery with no load should be high risk");
  });

  // Test 4: Urgent job — booking time within 2 hours → sortScore < 200
  test("booking time within 2 hours: sortScore < 200", async () => {
    const urgentPart = makeJobPart({
      id: 7, jobId: 40, type: "collection",
      bookedTime: IN_1_HOUR,
    });

    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([urgentPart]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([]),
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    const item = items.find(i => i.jobPartId === 7);
    assert.ok(item, "should find the urgent item");
    assert.ok(item.sortScore < 200, `sortScore should be < 200 for urgent booking, got ${item.sortScore}`);
    const urgentWarning = item.warnings.find(w => w.includes("within the next 2 hours"));
    assert.ok(urgentWarning, "should have urgent time window warning");
  });

  // Test 5: Vehicle requirement grouping — artic + refrigerated
  test("artic vehicle + refrigerated goods → vehicle_artic_fridge group", async () => {
    const part = makeJobPart({
      id: 9, jobId: 50, type: "collection",
      postcode: "B1 1AA",
      timeWindowStart: TOMORROW,   // scheduled tomorrow → matched by the timeWindow query
      job: {
        id: 50, jobReference: "LB-2026-005", customerName: "Fridge Co",
        goodsType: "food_refrigerated", goodsDescription: "Chilled food",
        quantity: 20, quantityUnit: "pallets", weight: 10000,
        vehicleCategory: "artic", tempControlled: true, hazardClass: null,
        plannedDate: TOMORROW,
      },
    });

    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([part]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([]),
    });

    const tomorrowStr = TOMORROW.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, tomorrowStr, tomorrowStr);

    const item = items.find(i => i.jobPartId === 9);
    assert.ok(item, "should find the fridge item");
    assert.equal(item.groupKey, "vehicle_artic_fridge", `expected vehicle_artic_fridge, got ${item.groupKey}`);
  });

  // Test 6: Standing trailer with no run assigned → riskLevel = high
  test("load on standing trailer with no run: riskLevel high", async () => {
    const collectionPart = makeJobPart({
      id: 11, jobId: 60, type: "collection",
    });

    // LoadTrack with a trailerId but no runId
    const standingTrailerTrack = makeLoadTrack({
      jobId: 60, jobPartId: 11,
      toCustody: "driver:2",
      trailerId: "TR-001",
      runId: null,
    });

    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([collectionPart]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([standingTrailerTrack]),
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    const item = items.find(i => i.jobPartId === 11);
    assert.ok(item, "should find the standing trailer item");
    assert.equal(item.riskLevel, "high", `expected high risk for standing trailer, got ${item.riskLevel}`);
    const standingWarning = item.warnings.find(w => w.includes("standing trailer"));
    assert.ok(standingWarning, "should warn about standing trailer");
  });

  // Test 7: Empty date range → returns empty array
  test("no matching job parts: returns empty array", async () => {
    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    assert.deepEqual(items, []);
  });

  // Test 8: Missing vehicle category → high risk
  test("missing vehicle category: riskLevel high, warning about vehicle type", async () => {
    const part = makeJobPart({
      id: 13, jobId: 70, type: "collection",
      job: {
        id: 70, jobReference: "LB-2026-007", customerName: "No Vehicle Customer",
        goodsType: "pallets", goodsDescription: null,
        quantity: 5, quantityUnit: "pallets", weight: 2000,
        vehicleCategory: null, tempControlled: false, hazardClass: null,
        plannedDate: TODAY,
      },
    });

    const prisma = makePrisma({
      jobPartFindMany: [
        () => Promise.resolve([part]),
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ],
      loadTrackFindMany: () => Promise.resolve([]),
    });

    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    const item = items.find(i => i.jobPartId === 13);
    assert.ok(item, "should find the item");
    assert.equal(item.riskLevel, "high", `expected high risk for missing vehicle, got ${item.riskLevel}`);
    const vehicleWarning = item.warnings.find(w => w.includes("vehicle"));
    assert.ok(vehicleWarning, "should warn about missing vehicle type");
    assert.equal(item.groupKey, "needs_attention", `expected needs_attention, got ${item.groupKey}`);
  });

  // Test 9: a load parked at a yard surfaces DATE-INDEPENDENTLY (the "don't forget it" pool)
  test("yard-stored load: appears even with no date match, in_custody + custody location/age", async () => {
    const twoDaysAgo = new Date(TODAY.getTime() - 2 * 86_400_000);
    // Only the onward DELIVERY leg exists in the work list; collection is long done.
    const deliveryPart = makeJobPart({
      id: 21, jobId: 80, type: "delivery", postcode: "M1 1AA",
      job: {
        id: 80, jobReference: "LB-2026-009", customerName: "Yard Stored Co",
        goodsType: "pallets", quantity: 12, quantityUnit: "pallets", weight: 6000,
        vehicleCategory: "rigid", tempControlled: false, hazardClass: null, status: "collected",
      },
    });
    const yardTrack = makeLoadTrack({
      jobId: 80, jobPartId: 21, toCustody: "yard:7", fromCustody: "on_vehicle:3",
      timestamp: twoDaysAgo, transactionType: "drop_at_yard", trailerId: "",
    });

    const prisma = makePrisma({
      // date-scoped queries return nothing; the 3rd resolver is the custody fetch.
      jobPartFindMany: [
        () => Promise.resolve([]),
        () => Promise.resolve([]),
        () => Promise.resolve([deliveryPart]),
      ],
      loadTrackFindMany: () => Promise.resolve([yardTrack]),
    });

    // Look at TODAY — the load's legs are NOT in range, yet it must still surface.
    const dateStr = TODAY.toISOString().split("T")[0]!;
    const items = await getPlannerWorkItems(prisma, 1, dateStr, dateStr);

    const item = items.find(i => i.jobId === 80);
    assert.ok(item, "yard-stored load must appear regardless of date");
    assert.equal(item.groupKey, "in_custody", `expected in_custody, got ${item.groupKey}`);
    assert.equal(item.custodyLocation, "yard:7", `expected yard:7, got ${item.custodyLocation}`);
    assert.ok(item.inCustodySince, "should carry an in-custody timestamp for age");
  });
});
