# LogisticBay — Product Vision & Roadmap

> What LogisticBay is, what it will become, the phases, the roles, the philosophy.
> Read this to understand the WHY. Read ARCHITECTURE.md for the HOW.
> Last updated: 2026-05-19

---

## What LogisticBay is

LogisticBay is a **human-first logistics execution operating system** — not just planning software, not just a driver app, not just a TMS. It manages the operational reality between "load goes into trailer" and "load comes out of trailer."

Inside that gap: planning, vehicle swaps, driver swaps, traffic, breakdowns, delays, customer mistakes, failed collections, partial collections, relays, overtime, compliance, communication.

**Most systems manage jobs. LogisticBay manages operational reality.**

---

## Core philosophy

**Operational truth philosophy:**
```
Planner defines work → Driver confirms reality → System records truth → Intelligence learns from truth
```

**Human-first:**
- Driver must feel: *I am the professional.*
- Planner must feel: *I control operations.*
- Manager must feel: *I understand my business.*

System quietly supports underneath. Complex underneath, simple on top — like a car.

**Language matters:**

| Avoid | Use instead |
|---|---|
| Report problem | Help fellow drivers |
| System error | Missing information may cause delays |
| Computer replaces humans | Skilled humans supported by better information |

---

## Roles

| Role | Responsible for | Status |
|---|---|---|
| `company_owner` | Everything — has all permissions | ✅ Implemented |
| `planner` | Assign drivers/fleet, route changes, swaps, live execution management | ✅ Implemented |
| `driver` | Execution confirmation on mobile | ✅ Implemented |
| `job_creator` | Entering customer work, addresses, POD requirements, references, time windows | 🔲 Planned Phase 2 — routes currently allow `planner` to do this |
| `manager` | Analytics, approvals, company settings | 🔲 Planned Phase 2 — role string exists, no guards yet |

Small company: one person holds all roles. Large company: roles are separate people. System supports both.

---

## Architecture decisions (locked — do not re-debate)

### 1. Run is the central operational object, not the Job

```
Job A parts ──┐
Job B parts ──┼──► Run 1 — Driver Dave, Truck A, Trailer X
Job C parts ──┘

Job D parts ──► Run 2 — Driver Sarah, Truck B, Trailer Y
```

Job = customer promise (what must be achieved).
Run = execution plan (how it actually happens).
A Run can contain JobParts from multiple different Jobs.

**Planning-layer addendum (2026-06-24 — does NOT re-debate the above).** The Run is
central for *execution*. Above it sits a *planning* layer: the **Movement** (the chosen
strategy for how a load travels) and the **Load Journey** (its custody path, which
already exists at execution time as the `LoadTrack` ledger). The planner thinks in
**Job → Movement → Run**; the Run stays the execution object a Movement is realised as.
LogisticBay is, in full, a **Load Movement Planning System** whose core decision is
*"what is the best way to move this load?"*. See **`PLANNING_PAGE_DESIGN.md`** for the
planning-page design, the movement-strategy catalogue, the job-constraint layer, and
the gated plan.

### 2. Splitting creates more JobParts — not more Jobs

The main Job holds the customer promise. It stays one Job even if execution takes 2, 3, or 10 movements.

### 3. Company → Branch structure (Phase 1 is Company only)

Phase 1: operations at Company level. No Branch model yet — do not add `branchId` to queries.
Long-term: `Organisation → Company → Branch`. Every Company will have one or more Branches.

### 4. Company types — carrier / sender / both (Phase 4)

- **Carrier** — operates trucks and drivers. Current system.
- **Sender/Shipper** — has freight to move, posts loads, sees milestone data only.
- **Both** — freight forwarders operating own fleet AND buying capacity.

`Company.type` defaults to `"carrier"`. No UI change until marketplace launches (Phase 4).

### 5. Coordinates — manual entry, real truck entrance

Coordinates represent the real truck gate/entrance — not the building centre. Manual entry always. Auto-detect is allowed but human can always override. System warns when pin seems far from postcode.

### 6. Route optimisation is always a human decision

System assists planner. System does NOT replace planner. AI suggestions are a future roadmap item.

### 7. Marketplace objects are separate from operational jobs

`MarketplaceLoad` ≠ `OperationalJob`. Tenant isolation is never broken. Sender never sees inside a carrier's tenant.

---

## Trusted carrier network (Phase 2)

Before the public marketplace, carriers share loads with trusted partners (this is how real haulage already works).

```
CompanyPartnership  — two companies trust each other
SharedLoad          — a job offered to a specific trusted partner (or all partners)
```

Flow: Carrier A can't cover a job → shares with trusted partner → Carrier B accepts → job appears on B's planner board → A sees milestones only. A invoices customer, settles with B directly.

`SharedLoad` evolves directly into `MarketplaceLoad` in Phase 4 — same data model, wider visibility.

---

## Build phases

### Phase 1 — Core operational foundation (current)
- ✅ Auth, company, drivers, fleet
- ✅ Structured job intake (CJP + PRF)
- ✅ Job review workflow
- ✅ Run creation and assignment
- ✅ Multi-stop execution (mobile)
- ✅ Offline-first event recording
- 🔶 Load tracking (schema exists, write path not yet wired)
- 🔲 Full execution engine (derived statuses, warning system, recovery)

### Phase 2 — Operational intelligence + trusted network
- Branch structure (`Company → Branch`)
- `job_creator` and `manager` role enforcement
- Trusted carrier network (`CompanyPartnership` + `SharedLoad`)
- Location intelligence (gate history, driver reports)
- Financial basics: driver hours export, basic invoicing
- Execution analytics

### Phase 3 — Network intelligence
- Cross-branch coordination and relay planning
- AI-assisted planning suggestions
- Compliance officer role: working time exports, tachograph analysis
- Fleet manager role: maintenance, VOR, defects dashboard

### Phase 4 — Marketplace ecosystem
- Company type at registration (carrier / sender / both)
- Sender world: post loads, track shipments, invoice carriers
- `SharedLoad` → `MarketplaceLoad` (public visibility)
- Reverse auctions, bidding, carrier scoring
- Commercial role: customer management, rate cards

---

## Full operational chain

```
Customer need appears
→ Job request enters system (PRF or direct)
→ Job intake & validation
→ Structured operational job created
→ Planning & run allocation
→ Driver execution
→ Live operational management
→ Delivery confirmation & POD
→ Financial processing
→ Operational learning & intelligence
→ Future: optimisation & marketplace matching
```
