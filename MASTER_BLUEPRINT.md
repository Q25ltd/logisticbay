# LOGISTICBAY — MASTER BLUEPRINT v1
> Full Product Vision, Operational Philosophy & System Architecture
> Last updated: 2026-05-16
> Read this before starting any product, design, or architecture work.

---

## ARCHITECTURE DECISIONS (agreed 2026-05-16)

These are locked decisions. Do not re-debate without a strong reason.

### 1. Roles — permissions, not separate systems
Job Creator and Planner are separate operational permissions, not necessarily separate people.
A user may hold one, several, or all roles depending on company size.

| Role | Responsible for |
|---|---|
| `job_creator` | entering customer work, addresses, POD requirements, references, time windows, gate instructions |
| `planner` | assigning drivers/fleet, route changes, swaps, delays, live execution management |
| `manager` | analytics, approvals, company settings |
| `driver` | execution confirmation on mobile |
| `company_owner` | all of the above |

Small company: one person holds all roles.
Large company: roles are held by different people.
The system must support both realities.

### 2. Organisation structure — Company → Branch
Phase 1: `Company → Branch`
Long-term: `Organisation → Company → Branch`

Every Company has at least one Branch (auto-created as "Main" on registration).
Fleet, drivers, and planners belong to a Branch, not directly to Company.
Cross-branch cooperation is possible but Branch is the operational unit.

DO NOT assume one company = one isolated operation forever. That becomes a disaster at scale.

### 3. Marketplace objects are separate from operational jobs
`MarketplaceLoad` ≠ `OperationalJob`

Flow:
1. Sender creates a `MarketplaceLoad` (public/shared marketplace object)
2. Carrier wins/accepts the load
3. System creates an `OperationalJob` inside the carrier's tenant
4. Sender sees milestones, POD, ETA — NOT internal planner notes, payroll, or driver data

Tenant isolation is never broken. Commercial relationship ≠ internal operational systems.

### 3A. Company type — one platform, two worlds (decided 2026-05-18)

Every company on the platform has a type: `carrier`, `sender`, or `both`.

- **Carrier** — operates trucks and drivers. Current system. Planner board, fleet, shifts, jobs.
- **Sender/Shipper** — has freight to move. Posts loads, tracks shipments, sees milestone data only. Phase 4.
- **Both** — freight forwarders who operate their own fleet AND buy capacity from other carriers.

**Rules:**
- `Company.type` defaults to `"carrier"`. All existing companies are carriers automatically.
- Registration does NOT ask for type until marketplace launches. No UI change before Phase 4.
- When marketplace launches, new registrations choose their world at signup.
- Existing carriers can opt into sender mode via settings — their carrier operations are untouched.
- The web app loads a completely different navigation and feature set based on `companyType` in the JWT.
- A `"both"` company gets a toggle in the nav to switch between their carrier and sender dashboards.
- Tenant isolation rules apply equally to both worlds. A sender never sees inside a carrier's tenant.

**Infrastructure decision:**
Same PostgreSQL database. Same API codebase. Same auth system. Domain boundary enforced in code, not infrastructure. Extracting marketplace to a separate service is deferred until actual scaling requires it.

### 3B. Trusted carrier network — pre-marketplace load sharing (decided 2026-05-18)

Before the public marketplace exists, carriers need to share loads with trusted partner companies. This is how real haulage already works — companies call friendly operators when they can't cover a job.

**Phase 2 feature (after operational core is stable):**

```
CompanyPartnership  — two companies trust each other (bidirectional after both accept)
  companyId         — who sent the request
  partnerId         — who they invited
  status            — "pending" | "active" | "declined"

SharedLoad          — a job offered to a trusted partner
  ownerCompanyId    — company that cannot cover the job
  partnerCompanyId  — specific partner offered to (null = all trusted partners)
  jobId             — the job being shared
  status            — "offered" | "accepted" | "declined" | "cancelled"
  note              — message to partner
```

**Flow:**
1. Carrier A cannot cover a job → clicks "Share with partner" on the job
2. Picks from their trusted network list
3. Carrier B receives the offer → sees job details → accepts or declines
4. If accepted → job appears on Carrier B's planner board as a normal job
5. Carrier A sees milestone progress only (collected / in transit / delivered / POD)
6. Carrier A invoices the customer, settles with Carrier B directly

**Why this before full marketplace:**
- Solves a real operational pain carriers have right now
- No bidding, scoring, or insurance complexity needed
- `SharedLoad` directly evolves into `MarketplaceLoad` in Phase 4 — same data model, wider visibility
- Builds early network effects before the public marketplace opens

### 4. Coordinates — auto-detect with mandatory manual override
- Auto-detect is allowed and helpful
- Human must always be able to override
- Stored coordinates represent the real truck entrance/gate — not the building centre
- System warns when pin seems far from postcode

### 5. Availability vs Compliance — different layers
| Layer | Meaning | Enforcement |
|---|---|---|
| Availability | Driver preference / operational guidance | Planner can override |
| Compliance | Legal/safety rules (driving hours, rest periods) | Hard block or warning — cannot be ignored |

### 6. Run is the central operational object — NOT the job
The planner board is built around Runs, not Jobs.

**Job** = customer requirement (what must be achieved)
**Run** = execution plan (how it actually happens)

Critical rule: **A run can contain job parts from multiple different jobs.**
If a driver is going to Leeds, the planner may put work from two different customer jobs into the same run. The run is not a child of one job — it is its own entity that job parts are assigned to.

```
Job A (52 pallets London→Leeds)     Job B (12 pallets Sheffield→Leeds)
  └── Job Part: Collect London          └── Job Part: Collect Sheffield
  └── Job Part: Deliver Leeds           └── Job Part: Deliver Leeds
                    ↘                           ↙
                         RUN 1 — Driver Dave
                         ├── Collect London (Job A)
                         ├── Collect Sheffield (Job B)
                         └── Deliver Leeds (Jobs A + B combined)
```

This means the correct relationship is:
```
Job Part → assigned to → Run    (many job parts from many jobs can share one run)
Run → one driver, one truck, one trailer, one period
```

NOT: Job → owns → Runs → contains → Job Parts

---

---

## 1. WHAT LOGISTICBAY IS

LogisticBay is a:
- logistics execution operating system
- operational intelligence platform
- planning and execution network
- future logistics marketplace ecosystem

It is NOT:
- only a route optimizer
- only a driver app
- only a planner board
- only a transport management system
- only a load marketplace

LogisticBay exists to manage the real-world operational gap between:

```
load goes into trailer
↓
real-world chaos happens
↓
load comes out of trailer
```

Inside that gap exists:
- planning, branch coordination, trailer allocation
- vehicle swaps, driver swaps
- traffic, breakdowns, delays
- customer mistakes, incorrect addresses, missing information
- failed collections, partial collections, relays
- overtime, driver availability, compliance
- communication, operational intelligence

Most systems manage jobs.
**LogisticBay manages operational reality.**

---

## 2. CORE PHILOSOPHY

### Human-first system

System must NEVER feel like: `computer replaces humans`

It must feel like: `skilled humans are supported by better information`

- Driver must feel: **I am the professional.**
- Planner must feel: **I control operations.**
- Manager must feel: **I understand my business.**

The system quietly supports underneath.

### Complexity philosophy

The system underneath may be extremely advanced.
But user experience must remain: simple, fast, clear, low-friction, psychologically comfortable.

Like a car: very complex underneath. Simple controls on top.

### Operational truth philosophy

```
Planner defines work.
Driver confirms reality.
System records truth.
Future intelligence learns from truth.
```

---

## 3. LONG-TERM PRODUCT VISION

Long-term LogisticBay becomes: **Operational logistics intelligence network**

Where:
- jobs are structured correctly
- execution truth is captured continuously
- planners orchestrate networks instead of chaos
- branches cooperate dynamically
- AI assists operational decisions
- marketplace becomes execution-aware
- operational knowledge compounds over years

---

## 4. FULL OPERATIONAL CHAIN

```
Customer need appears
↓
Job request enters system
↓
Job intake & validation
↓
Structured operational job created
↓
Planning & allocation
↓
Vehicle/trailer assignment
↓
Driver execution
↓
Live operational management
↓
Delivery confirmation
↓
Financial processing
↓
Operational learning & intelligence
↓
Future optimization & marketplace matching
```

---

## 5. PRE-MARKETPLACE JOB INTAKE SYSTEM

Before marketplace scale, companies still need structured work entry.
This is one of the most important foundations of LogisticBay.

**Core realization:** Most logistics problems begin BEFORE planning. They begin during job intake.

Bad job information creates:
- failed deliveries, driver confusion, planner stress
- incorrect allocations, delays, endless phone calls, operational chaos

---

## 6. JOB CREATION SYSTEM

### Purpose
Convert messy customer communication into structured operational work.

### Job Creator vs Planner — distinct roles

**Job creator focuses on:**
- data quality
- location quality
- operational clarity
- stop structure
- instructions
- access limitations

**Planner focuses on:**
- allocation
- execution
- operations
- solving live problems

Planner should NOT waste time fixing bad job data.

### Job creation principles

Job creation must be: strict, structured, validation-heavy, operationally focused.

System should discourage: lazy free text, incomplete information, missing coordinates, unclear stops, vague instructions.

### Job structure

Jobs are NOT flat objects. Jobs are: **multi-stop operational chains**

```
Pickup → Dropoff
Pickup → Pickup → Dropoff
Pickup → Yard → Relay → Dropoff
Depot → Pickup → Multiple deliveries
```

### Required job data

**Job header:**
- customer/client
- execution date
- vehicle type required
- compatible trailer types
- service type
- priority

**Cargo section:**
- quantity, unit, material type
- weight, volume
- hazard class
- cargo notes

**Stop structure — every stop contains:**
- stop type
- address
- latitude / longitude
- contact
- reference
- instructions
- time windows

### Coordinate philosophy

Coordinates are entered manually.
Coordinates represent: **real truck gate / entrance / loading point**

Reason:
- automation unreliable
- customers often wrong
- real-world access matters more than building centre

System teaches users how to get coordinates from Google Maps manually.

### Location intelligence system

Every location becomes smarter over time. System stores:
- gate points, access restrictions, yard difficulty
- narrow turns, loading rules
- driver reports, issue history
- yard images, operational warnings

Drivers help future drivers.
NOT: `report problem`
But: `help fellow drivers`

Psychology matters.

---

## 7. CUSTOMER SYSTEM

Customers may have: multiple sites, recurring work, recurring templates, recurring problems, different access rules per location.

Customer profiles store:
- billing information, contacts
- preferred vehicle types, known restrictions
- operational history, templates, performance history

---

## 8. TEMPLATE SYSTEM

Templates reduce repetitive data entry. Templates may store:
- recurring stops, recurring instructions
- recurring cargo, vehicle requirements, operational notes

Variable fields remain editable: references, delivery times, quantities, special notes.

---

## 9. PLANNING SYSTEM

### Planner role

Planner controls:
- driver allocation, vehicle allocation, trailer allocation
- execution sequencing, reallocation, swaps, live problem solving

### Planning philosophy

System assists planner. System does NOT replace planner.
AI suggestions may exist later. Final decision remains human.

### Planning inputs

Planner sees:
- driver availability, branch proximity, nearby drivers
- remaining work time, vehicle compatibility, trailer compatibility
- route progress, future driver availability
- planner workload balancing

### Planner fairness philosophy

System should reduce: `why he gets good jobs and I get bad ones`

System balances:
- planner workload
- operational complexity
- nearby availability
- future execution load

---

## 10. BRANCH SYSTEM

Companies may contain:
- multiple depots
- multiple driver pools
- multiple planners
- multiple fleet groups

### Branch philosophy

Local execution. Central operational intelligence.

### Branch cooperation

System supports:
- cross-branch drivers, relay planning
- shared resources, central planning offices

Example:
```
Liverpool driver near London
↓
London planner can allocate nearby return work
↓
reduced empty miles
```

---

## 11. DRIVER SYSTEM

### Driver app philosophy

Driver app must be: simple, fast, low-friction, large-button oriented, operationally focused, offline safe.

Driver should rarely type. Mostly: confirm, continue, complete, issue, delay, call planner.

---

## 12. DRIVER AVAILABILITY SYSTEM

Drivers can declare:
- preferred start times, preferred working hours
- overtime willingness, short-day requests
- availability, holidays

This acts as: **operational guidance. NOT hard enforcement.**

---

## 13. SHIFT SYSTEM

### Shift flow

```
Start shift
↓
Vehicle allocation
↓
Truck checks
↓
Trailer checks
↓
Job execution
↓
Vehicle/trailer swaps if needed
↓
End shift
↓
Review & sync
```

### Important operational reality

Driver may begin shift WITHOUT vehicle.
Because: spare drivers exist, trucks change, operations are fluid.
System must support real operations.

---

## 14. VEHICLE & TRAILER SYSTEM

System tracks:
- trucks, trailers, classes, compatibility
- defects, VOR, fuel, adblue, odometer
- maintenance, availability

### Vehicle change support

Must support:
- mid-shift truck changes, trailer swaps
- breakdown reassignment, relay transfer

System records operational truth continuously.

---

## 15. LOAD MOVEMENT SYSTEM

### The five core objects

```
Main Job    = what must be achieved (the customer promise)
Job Part    = physical work (collect, deliver, move, reload, transfer, return)
Run         = how the planner executes it (one driver, one vehicle, one period)
Load Track  = where the load physically is at all times
Event       = what actually happened (immutable, timestamped)
```

### Main job is the promise

The main job holds the full required movement. It stays one job even if the operation becomes 2, 3, or 10 separate movements.

**Splitting creates more job parts — not more main jobs.**

### Job parts are the physical work

```
Collect 52 pallets from London
Deliver 26 pallets to Leeds
Deliver 26 pallets to Manchester
Move 20 pallets from depot to delivery site
```

### Runs are planner containers

One driver / vehicle / trailer plan for a period of work.
Planner puts job parts into runs.

Both runs still belong to the same main job.

### Quantity tracking — always

System must always know:
```
How much should be collected
How much was actually collected
How much remains uncollected
How much is on each trailer
How much is at depot
How much was delivered
How much remains undelivered
```

### Load possession rule

A driver cannot deliver a load they do not have.

If Dave has the load on Trailer X, Sarah cannot deliver it unless:
- load is transferred to Sarah
- Sarah collects another part
- delivery is reassigned to Dave

Driver swaps must check load possession.

### Delivery depends on collection

A delivery is only logically valid if the load exists somewhere usable:
- on the same run
- on the same trailer
- at depot ready to reload
- transferred to that driver

System must warn: `This delivery cannot happen unless the load is transferred or reassigned.`

### Splitting logic

**No split:** whole load stays together.
**Partial split:** part of load moves separately (Dave 20, Sarah 32).
**Full split:** load divided into separate operational movements (Run 1 Leeds, Run 2 Manchester, Run 3 Birmingham).

All parts still belong to the same main job.

### Merge logic

Planner can merge split parts back together if:
- same destination or compatible route
- same load rules
- vehicle/trailer capacity allows
- time windows still work
- load is physically available to combine

### Run validity — four things must fit

1. **Location** — do not send one driver to opposite corners of the country without reason
2. **Time** — collection and delivery windows must make sense
3. **Load availability** — driver must have the load or be able to collect it before delivery
4. **Equipment** — vehicle/trailer must be suitable for the load and site

---

## 16. EXECUTION SYSTEM

Jobs execute through stop-by-stop operational progression:

```
Pending
↓
Arrived pickup
↓
Collected
↓
Arrived dropoff
↓
Delivered
```

### Execution truth collection

System records: timestamps, GPS, arrival times, delays, stop completion, operational issues, route execution reality.

### Driver execution steps

```
start run
arrive collection
start loading
collected quantity
leave site
arrive delivery
delivered quantity
failed delivery
finish run
```

System records time and location automatically where possible.
Driver reports truth. Planner decides what to do next.

---

## 17. STATUS SYSTEM

Main job status comes from real work — never from manual button pressing.

```
Nothing started         → Planned
Some collection started → In progress
Some quantity collected → Partially collected
Some quantity delivered → Partially delivered
All required delivered  → Completed
Problem exists          → Attention needed
```

Main job is complete only when the required work is complete.

---

## 18. WARNING SYSTEM

System warns — does not block everything.

| Warning | Severity |
|---|---|
| Remaining quantity not collected | High |
| Delivery assigned but load not on this run | High |
| Load on trailer but no delivery planned | High |
| Delivery planned before collection possible | High |
| Quantities do not balance | High |
| Run route does not make sense | Medium |
| Time window at risk | Medium |
| Wrong vehicle/trailer type | Medium |
| Driver delayed | Medium |
| Collection completed but delivery not planned | Medium |
| Load at depot but no onward run | Medium |

Planner can override some warnings. Impossible states require confirmation.

---

## 19. RECOVERY SYSTEM

When something goes wrong, system asks:
1. What happened?
2. What is affected?
3. Where is the load?
4. What is still possible?
5. What are the next best options?

Example:
```
Driver stuck at delivery.
Next collection at risk.
Nearby driver empty.
System suggests: transfer collection to nearby driver.
Planner confirms.
```

Recovery never assigns a driver to a load they do not physically have access to.

---

## 20. OFFLINE-FIRST ARCHITECTURE

Critical rule: **operations must continue even if internet fails**

```
save locally first
↓
sync later
↓
delete local only after server confirmation
```

Protects: operational continuity, timestamps, compliance, execution truth.
Customer should NEVER feel backend failures.

---

## 21. RELAY & SWAP SYSTEM

One of the core future differentiators.

Supports:
- driver relays
- trailer swaps
- cross-branch handovers
- long-distance split execution

Example:
```
Livingston → Dover
↓
split between branches/drivers
↓
minimum empty miles
```

---

## 22. COMMUNICATION SYSTEM

Drivers should NEVER ask: `who do I call?`

Every operational object includes:
- assigned planner
- branch contact
- emergency contact

One-tap communication.

---

## 23. JOB CREATION PATHS

Both paths produce the same object: a structured job. Same information, different entry point.

**External (customer):**
```
request comes in → office reviews → accepts/rejects → accepted request becomes main job
```

**Internal (planner):**
```
planner creates main job directly
```

Same logic. Different entry path.

---

## 24. DATA QUALITY RULES

```
Information is structured. Operations are flexible.
```

- Forms must not allow messy garbage to drive logic
- Free text is only for notes
- Core decisions come from: controlled choices, timestamps, locations, quantities, statuses, events

---

## 25. MARKETPLACE SYSTEM (FUTURE — Phase 4)

Marketplace is NOT only load posting. Marketplace becomes: **execution-aware logistics network**

Features:
- load posting, reverse auctions, subcontracting
- carrier onboarding, trust scoring, insurance validation
- execution quality scoring, operational history, smart matching

### Reverse auction system

Jobs may enter network through reverse operational auctions where:
- carriers compete
- system evaluates execution quality (not only lowest price)
- operational reliability matters

Evaluation includes: previous delivery success, delay history, equipment suitability, operational performance, location familiarity.

---

## 26. AI & INTELLIGENCE LAYER

### AI philosophy

AI assists. AI does NOT replace: planners, drivers, operational judgment.

### AI functions (future)

AI may:
- suggest nearby drivers, predict delays
- identify risky jobs, suggest swaps
- improve templates, optimize relays
- predict operational problems, learn recurring patterns

Human always controls final decision.

---

## 27. FINANCIAL SYSTEM (FUTURE)

Long-term financial layer includes:
- invoicing, POD billing, detention charging
- subcontractor payments, payroll exports
- customer rate cards, fuel surcharge systems
- dispute handling, multi-currency support

---

## 28. REPORTING & ANALYTICS

System tracks:
- planner performance, driver efficiency, branch efficiency
- customer profitability, empty miles, failed deliveries
- recurring delays, operational bottlenecks, fleet utilization

---

## 29. PSYCHOLOGICAL DESIGN PRINCIPLES

Language matters.

| Avoid | Prefer |
|---|---|
| report problem | help fellow drivers |
| system error | missing information may cause delays |
| computer replaces humans | skilled humans supported by better information |

System should feel: supportive, operational, human, cooperative.
NOT: corporate, robotic, controlling.

---

## 30. SAFETY & RELIABILITY PRINCIPLES

System must survive: internet failures, sync failures, planner mistakes, mobile crashes, server outages, duplicate requests.

Core protections: offline queues, idempotency, retries, audit logs, transactions, rollback protection, soft deletes, tenant isolation.

Operations must continue during failures.

---

## 31. SCALING VISION

```
Single local operator
↓
Multi-branch operational network
↓
Cross-company logistics intelligence ecosystem
```

---

## 32. FINAL PRODUCT IDENTITY

LogisticBay is:

> A human-first logistics execution operating system built around operational truth, real-world logistics behaviour, and long-term network intelligence.

NOT: just planning software / just routing software / just a driver app / just a marketplace.

BUT: the connected operational layer between jobs, planners, drivers, vehicles, branches, and future logistics networks.

---

## 33. MVP STRATEGY VS FINAL VISION

Final vision is large. Everything should NOT be built at once.

```
Build stable operational core first
↓
Prove real-world usage
↓
Expand gradually
```

### Phase 1 — Core operational foundation (NOW)
- company system, driver app, planner board
- structured jobs (Job / Job Part / Run model)
- multi-stop execution
- vehicle/trailer handling
- offline execution
- operational event recording
- auth security (lockout, email verification, password reset)
- role-based permissions on web (owner, manager, planner, job_creator, driver)

### Phase 2 — Operational intelligence + trusted network
- branch coordination
- smarter planning, location intelligence
- recurring templates, execution analytics
- **trusted carrier network**: CompanyPartnership + SharedLoad (load sharing between friendly companies)
- financial basics: driver hours export, basic invoicing, accountant role access

### Phase 3 — Network intelligence
- relays, cross-branch optimization
- AI assistance, operational predictions
- compliance officer role: working time exports, tachograph analysis
- fleet manager role: maintenance, VOR, defects dashboard

### Phase 4 — Marketplace ecosystem
- company type choice at registration (carrier / sender / both)
- sender world: post loads, track shipments, invoice carriers
- SharedLoad evolves into MarketplaceLoad (public visibility)
- reverse auctions, bidding, carrier scoring
- subcontracting, execution-aware carrier matching
- commercial role: customer management, rate cards, marketplace commercial ops
- network optimization

### Final stage
LogisticBay becomes: **operational intelligence infrastructure for logistics execution**
