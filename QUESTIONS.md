# LogisticBay — Open Questions

> Every design decision that has not been answered yet lives here.
> When you answer a question, change `[ ]` to `[x]` and write the answer inline.
> Before building any feature, check the relevant section — if questions are unanswered, answer them first.
>
> Key: [x] = answered · [~] = partial answer · [ ] = still open
> Last updated: 2026-05-27

---

## Quick status

| Section | Total | Answered | Remaining |
|---|---|---|---|
| Operations & load movement | 42 | 15 | 27 |
| Company management | 48 | 0 | 48 |
| Financial system | 38 | 0 | 38 |
| Platform & compliance | 32 | 0 | 32 |
| Product & notifications | 36 | 0 | 36 |
| **Total** | **196** | **14** | **182** |

---

## 0a. Data dictionary inconsistency — flagged 2026-05-27

- [x] **`Job.tempControlled` vs `JobPart.temperatureControlled` — two names for the same concept.** **Resolved 2026-05-27:** Renamed `JobPart.temperatureControlled` → `JobPart.tempControlled` and `JobPart.temperatureRange` → `JobPart.tempRange` via migration `20260527000000_rename_jobpart_temperature_fields`. Updated all API reads (`runs.ts`, `planning.ts`, `plannerWorkService.ts`), test mocks, `StructuredJobPartInput`, `buildStopData`, and web `JobPart` type. Both models now use `tempControlled` / `tempRange` consistently.

---

## 0z. Planning page / Load-Movement layer — open design questions (added 2026-06-24, see PLANNING_PAGE_DESIGN.md)

- [ ] **Does `Movement` become a persisted entity, or stay a derived view?** A planning-time object that owns a load's chosen strategy + legs and links to the run(s) that execute them — persist it, or derive it on the fly from Job + Runs + custody? Decision gate before the "persist the Movement/Load-Journey object" step.
- [ ] **Job constraints — hard vs soft.** For `storageAllowed` / `relayAllowed` / `directPreferred` / `timeCritical` / `tramperAllowed` (and existing `canSplitShipment`): which are *hard* (planning must not offer the strategy at all) vs *soft* (offered with a warning)?
- [ ] **Corridor / journey grouping source.** Where does the corridor/load-journey grouping (the structure beyond region/area) get its definition — saved corridors, derived GPS clusters, or both?
- [ ] **Constraint defaults & intake UI.** Confirm the default for each new constraint (proposed: storage/relay/tramper = true, direct/timeCritical = false) and where they're captured in job creation.

## 0. Planning board — open design questions (added 2026-05-26)

- [~] **Tramper overnight rest — next-day run continuity.** When a tramper uses an `overnight_rest` waypoint to record where they parked up, the system does not yet auto-suggest that the next-day run starts from that location. **Current state:** planner manually creates a new run and adds a `depot_start` waypoint at the overnight address. **Open:** should the system detect the overnight rest and pre-fill the next run's start location? If yes, is the connection between runs via `dependsOnRunId` or by matching the `overnight_rest` waypoint location to the following run's `depot_start`?

- [ ] **Day driver multi-day run — publish gate.** Currently a warning banner is shown but does not block publishing. Should publishing be blocked when a day driver is assigned to a multi-day run (same guard as "no stops")? Or is a warning sufficient because some planners intentionally do this and adjust later?

- [ ] **Tramper shift accounting.** When a tramper's run spans multiple days, the shift record (`Shift` model) is one row per calendar day. How do we link an overnight run to two separate shift rows? Does the driver submit one shift per calendar day, or one per run?

- [ ] **Postcode district sidebar — threshold.** If a company has many small jobs spread across 30+ postcode districts, the "By area" sidebar becomes very long. Should there be a minimum count threshold (e.g. show only districts with ≥2 jobs)? Or a "show more" collapse?

- [ ] **Relay cargo state — JobPart link.** When a delivery stop is on a different run from the collection stop (relay), how is the link stored? Is it one `JobPart` with two `RunAssignment` rows? Or two linked `JobPart` rows? Answer determines `getCargoStateForDeliveryStop()` query design.

- [ ] **Trailer swap — simultaneous presence detection.** When building Driver 2's run that has a `trailer_swap` stop, the system needs to check Driver 1's ETA at the same location. How do we identify "Driver 1's run that delivers to this swap point"? Via `LoadTrack.swapPoint` matching? Via `hub_drop` waypoint on Driver 1's run?

- [ ] **PlanningSettings — seed on company creation?** Should default dwell times (trailer swap 90min, live load 45min, etc.) be auto-seeded when a company is created, or created lazily on first use of a planning feature?

- [ ] **GPS break detection — driver consent.** GDPR requires drivers to be informed about GPS location tracking during shifts. Should consent be captured at account creation, first app open, or both? What is the data processing lawful basis (legitimate interest for safety vs explicit consent)?

- [ ] **Driver hours self-report — pre-fill logic.** The popup after collected/delivered pre-fills a time estimate. What is the pre-fill? Options: (a) zero always, (b) legal maximum remaining based on shift start time, (c) previous reported value. Which is least likely to cause drivers to just tap "confirm" without reading?

- [ ] **Tacho integration — which provider?** When onboarding transport companies, ask which tachograph analysis software they use (Tachomaster, Optac3, TachoSafe, etc.). Build integration for the most common answer first. Add to onboarding questionnaire.

- [ ] **Recall run — what does driver see on mobile?** When a planner recalls an ASSIGNED run, the run should disappear from the driver's active runs or show as "recalled". Does the driver app need a separate "recalled runs" history view, or does the run just vanish? What if the driver is mid-execution when recalled?

- [ ] **Delay cause capture — mandatory or optional?** When a driver takes much longer than expected at a stop, the system prompts "what caused the delay?" Should this be mandatory (driver must tap a reason before marking complete) or optional (tap to add context, can skip)? Mandatory = better data, optional = less friction and driver trust.

---

## 1. Operations & load movement

> Job execution, driver actions, load tracking, failures, relay, POD, planning rules.

### Job creation and editing

- [~] Who can edit a job after it has been assigned to a driver?
      **PARTIAL:** Planner can edit at any stage up to `in_progress`. Once a Run is `publishedToDriver`,
      field changes are still possible but trigger a JobAudit entry. Explicit role restriction
      (owner only vs planner too) not yet codified in route guards. Decision needed.

- [~] Who can edit a job after the driver has started executing it?
      **PARTIAL:** Override-close flow (overrideClosed, overrideReason, overrideNotes) handles
      closing with shortfall. Planner can still add plannerNotes. Address/stop changes mid-execution
      are not blocked by code — policy decision needed on whether to hard-block or warn.

- [ ] Who can cancel a job? Options: owner only, manager and owner, planner too.

- [ ] What happens if a job is cancelled while a driver is mid-execution?
      Does the driver get an alert? Can they still complete what they started?

- [x] Can a job be reassigned to a different driver after it has started?
      **YES.** Run.assignedDriverId can be changed by planner. RunAssignment has removedAt/removedBy/
      removalReason for the old assignment. Events recorded by the first driver are preserved in
      JobExecutionEvent and LoadTrack (immutable).

- [x] Can a job be split into two separate jobs after creation?
      **DECISION: Splitting creates more JobParts — NOT more Jobs.** Job.parentJobId self-relation
      allows a child Job if a literal job split is needed, but the standard path is splitting
      into JobParts within the same Job.

- [x] Can two separate jobs be merged into one?
      **NO.** Jobs are not merged. Two separate Jobs can share a single Run (via RunAssignments)
      but remain distinct records. This is by design.

- [x] Is customer reference (`customerRef`) mandatory at job creation or optional?
      **Optional by default.** Job.customerRef is nullable (String?). The custRefRequired Boolean
      flag on Job allows forcing it per-job at creation time.

- [x] Who is responsible for checking data quality before a job goes to planning?
      **Job creator.** The formal gate is the "accept" step (pending_review → ready_to_plan).
      Planner is NOT responsible for fixing bad job data.

- [ ] How far in advance can jobs be planned? Maximum window (e.g. 90 days) or unlimited?

- [~] Can the same vehicle be assigned to two overlapping jobs?
      **PARTIAL / Hard block by design — not yet enforced in code.** Architecture requires
      time-window overlap check at publish time. Run.vehicleCompatible flag exists.
      Implementation of the overlap query is pending.

- [~] Can the same driver be assigned to two overlapping jobs?
      **PARTIAL / Same as vehicle.** Architecture says hard block. Driver overlap query not yet
      implemented in route.

### Stop sequencing and route

- [ ] Can a driver reorder stops on their own?
      RunAssignment.sequenceNumber is set by planner and is the authoritative order.
      No driver-reorder event type exists. Options: block it, allow with notification, allow silently.

- [ ] If driver reorders stops, does planner get notified?

- [ ] If a stop fails (customer not there, access refused), does driver skip to the next stop
      automatically or must they notify the planner first?
      collection_failed / delivery_failed event types exist. No auto-skip logic.

- [ ] Can a driver add an unplanned stop?
      Driver can add a note_added event with context. Formal tracking out of scope for MVP.

- [x] Is route optimisation automatic or always manual planner decision?
      **Always manual.** AI/route suggestions are a future roadmap item, not MVP.

### Collection and delivery execution

- [ ] What happens when a driver cannot collect a load?
      Possible reasons: customer not ready, access refused, load not available, wrong address.
      Define failure reason codes for collection_failed events.

- [ ] After a failed collection, who decides what happens next?
      Driver reports it and waits? Planner calls customer? Job automatically rescheduled?

- [x] Can a driver partially collect?
      **YES.** JobPart.quantityCollected (Decimal) tracks actual vs quantityRequired.
      Driver submits collected quantity in the event. Remainder stays on the job part.

- [ ] If partial collection is allowed, who decides if it is acceptable?
      Driver decides on the spot, or must planner approve before driver leaves site?

- [ ] What happens to the remaining quantity after a partial collection?
      Current behaviour: manual. No auto-follow-up job generation.

- [ ] What happens when a customer is not at the delivery address?
      Driver waits how long? What status is set? Who is notified?

- [ ] What is the workflow when a customer refuses delivery?
      Driver keeps the load? Returns to depot? Planner decides?

- [ ] Can a driver deliver to a different person than the named contact?
      No signed-by field in schema.

### Quantities and discrepancies

- [x] What happens when the delivered quantity does not match the manifest?
      **quantityDelivered on JobPart tracks actual.** If mismatched with quantityRequired,
      the job reaches attention_needed status. Planner resolves via override-close:
      sets overrideClosed=true, overrideQuantityDelivered, overrideQuantityShortfall, overrideReason.

- [ ] What happens when damage is discovered at collection?
      Driver refuses the load? Collects and notes damage? Photos required?
      No damage flag in schema. Driver can note it via note_added event.

- [ ] What happens when damage is discovered at delivery?

- [x] Who resolves a quantity discrepancy — driver on the spot, planner, or owner?
      **Planner.** The override-close workflow requires planner action.
      Job.overrideClosed + overrideReason + overrideNotes fields; closedBy records who resolved it.

- [ ] Is there a maximum acceptable discrepancy before it requires escalation?
      overrideQuantityShortfall is stored but no threshold configured.

### POD (Proof of Delivery)

- [x] Is POD mandatory for every delivery or configurable per job?
      **Configurable per job.** Job.requirePOD Boolean flag. Default is false.

- [x] What counts as valid POD?
      **Configurable per stop.** JobPart.proofRequirements is a Json array.
      Values: `"signature"`, `"photo"`, `"pod_number"`, `"timestamp"`. Any combination.

- [ ] If customer refuses to sign, what does driver do?
      Note the refusal? Photo of goods at door? Job still marked delivered?

- [x] How quickly must POD be available after delivery?
      **Real-time when online.** When offline, events queued in AsyncStorage with clientEventId
      and synced on reconnect (idempotent).

- [ ] Who can see POD — planner only, owner, customer too?

- [ ] Is POD attached to the PDF shift report or kept separately?

- [ ] Is a collection confirmation (COC) required as well as POD at delivery?

### Relay and handover

- [x] When driver A hands load to driver B, how is the handover confirmed?
      **Receiving driver confirms.** LoadTrack records fromCustody (driver_A) → toCustody (driver_B)
      when driver B submits a handover_accepted event.

- [ ] What if driver B refuses the load at handover (damaged, wrong quantity)?

- [x] Does a relay require the load to go through a depot or can it be a direct driver-to-driver transfer?
      **Direct transfer supported.** LoadTrack fromCustody and toCustody can be any driver IDs.

- [x] When load changes hands, who is responsible if something is wrong?
      **LoadTrack answers this.** The entity in toCustody at the time of any event bears
      responsibility. LoadTrack timestamp + GPS provide evidence.

- [~] Can a relay be planned in advance by the planner, or is it always an emergency decision?
      **PARTIAL:** Both are supported. Planner can create a second Run with the same JobPart
      at a later time (planned relay). No explicit "relay type" flag.

### Breakdown and emergencies

- [ ] What is the driver workflow for a breakdown mid-delivery?
      No breakdown event type defined. Only note_added available.

- [ ] If load is transferred to another driver due to breakdown, is it treated the same as a relay?

- [ ] What is the workflow for a load that is lost or stolen?

- [ ] What is the workflow for a road traffic accident?
      No incident event type defined.

### ETA and live tracking

- [~] Is live ETA shown to the planner for jobs in progress?
      **PARTIAL:** GPS coordinates recorded on every JobExecutionEvent.
      No live tracking dashboard or ETA calculation built yet.

- [~] Can a driver report a delay to the planner from the app?
      **PARTIAL:** note_added event with free-text note is available. No structured "delay report."

- [ ] When a driver reports a delay, who is notified and how? Notification system not built.

- [ ] Can the planner see the driver's live GPS location?
      Always on, only during active shift, or driver opt-in?
      GPS on events is historical (point-in-time). No live tracking feed built.

### Night out and breaks

- [x] How is night out triggered?
      **Driver manually marks it.** Shift.nightOut Boolean. Set by driver before or at submission.

- [ ] What is the standard night out allowance amount? Fixed per company or configurable?
      No night-out allowance amount field in Company or Shift schema.

- [~] Is EU/UK break rule (45 min after 4.5 hours driving) tracked?
      **PARTIAL:** Shift.breakMins records break time entered by driver. No automated enforcement.

- [x] Is there a workflow for a driver to record their break time?
      **YES.** Shift.breakMins field — driver enters break minutes as part of shift submission.

---

## 2. Company management

> Staff management, fleet control, working time, holidays, roles and permissions, company settings.

### Driver and staff management

- [ ] When the owner adds a new driver, what is the minimum required information?
      Name + email? Name + phone? Name only with email optional?

- [ ] How does a new driver receive their login credentials?
      System email, owner copies + tells them, or system SMS?

- [ ] How does the owner reset a driver's PIN?
      Direct reset in admin panel? Triggers email? Owner sets it verbally?

- [ ] Can a driver change their own email address, or is email managed only by the owner?

- [ ] Who can see a driver's full personal details (address, date of birth, pay rate)?

- [ ] What happens when a driver leaves the company?
      Status → inactive. Can they still log in? Are historical shifts preserved?

- [ ] Can a driver be temporarily suspended (pending investigation)?

- [ ] Can the same person (same email) be a driver at two companies simultaneously?
      Agency driver scenario — partially supported, but is it a supported workflow or edge case?

- [ ] What is a "subcontractor driver" vs an "employee driver"?
      Does the system treat them differently for working time, holidays, or payroll?

- [ ] Can an owner assign multiple roles to one person (e.g. planner + job creator)?
      Current model is one role per membership.

### Driver documents and compliance

- [ ] Is driver licence category tracked (C, C+E, etc.)?
      If yes, does the system warn when assigning a job requiring a category the driver doesn't hold?

- [ ] Is CPC qualification tracked with expiry date?

- [ ] Is digital tachograph card number stored?

- [ ] Is medical fitness certificate expiry tracked?

- [ ] Is driving licence expiry date tracked?

- [ ] When a document is about to expire, who gets the alert?

- [ ] Can documents (licence copy, CPC certificate) be uploaded and stored? Or just expiry dates?

### Fleet management

- [ ] Who can mark a vehicle as VOR (vehicle off road)?

- [ ] When a vehicle is marked VOR, does the system automatically prevent it being assigned?
      Hard block or warning the planner can override?

- [ ] Who can return a vehicle from VOR back to active?

- [ ] Is MOT expiry date tracked per vehicle?

- [ ] Is road tax expiry tracked?

- [ ] Is operator licence (O-licence) disc expiry tracked per vehicle?

- [ ] Is insurance expiry tracked per vehicle or per fleet (blanket policy)?

- [ ] Is there a service/maintenance schedule? Mileage-based, time-based, or both?

- [ ] Who can sign off a defect reported by a driver?

- [ ] Is fuel tracked manually or via fuel card integration?

- [ ] Is AdBlue tracked separately from fuel?

- [ ] Can a trailer be used without a truck being allocated to the same job?

- [ ] Who owns each trailer — own fleet, hired/leased, or customer's trailer?

- [ ] Is trailer service and inspection schedule tracked separately?

### Working time

- [ ] 48-hour average over 17 weeks — calculated automatically?

- [ ] 60-hour maximum in any single week — hard block or warning?

- [ ] 11-hour minimum daily rest between shifts — hard block or warning?

- [ ] 9-hour reduced rest (maximum 3 times per week) — tracked automatically?

- [ ] Night work limit (maximum 10 hours in any 24-hour period including 00:00–04:00) — tracked?

- [ ] Has any driver signed a working time opt-out agreement? Stored per driver?

- [ ] Who receives an alert when a driver is approaching working time limits?

- [ ] Can a manager or owner override a working time warning? Override logged in audit trail?

- [ ] Self-employed / subcontractor drivers — different working time rules?

### Holidays and leave

- [ ] What is the holiday year — January to December, or rolling 12 months from employment start?

- [ ] What is the default holiday allowance? UK statutory minimum 28 days?

- [ ] Are bank holidays included in the 28-day allowance or given on top?

- [ ] Are bank holidays applied automatically or managed manually per company?

- [ ] What happens to unused holiday at year end? Lost / carry over / paid out?

- [ ] Are half-day holidays allowed?

- [ ] Can the owner or manager force-book holidays for a driver (e.g. Christmas shutdown)?

- [ ] Who approves holiday requests — owner only, or can managers approve too?

- [ ] What is the minimum notice period for a holiday request?

- [ ] What happens when two drivers request the same period?

- [ ] What happens if the approver is on holiday themselves?

- [ ] Is sick leave tracked separately from holiday?

- [ ] Is unpaid leave a separate category?

- [ ] Is compassionate leave or other special leave tracked?

### Roles and permissions

- [ ] Exact list of what a `planner` can and cannot do.
      Can they: delete a job? Edit a driver's details? See financial data? Approve holidays?

- [ ] Exact list of what a `manager` can and cannot do.

- [ ] Exact list of what a `job_creator` can and cannot do.
      Can they see the planner board? Can they assign drivers? Can they see shift data?

- [ ] Exact list of what an `accountant` can see.

- [ ] Can roles be customised per company or are permissions fixed platform-wide?

- [ ] Can the owner delegate specific owner-level permissions to a manager without making them full owner?

### Company settings

- [ ] What are the configurable working hours for pay calculation?

- [ ] Are overtime rates configured per company?

- [ ] Are pay rates per driver, per role, or company-wide?

- [ ] Is there a minimum paid hours per shift?

- [ ] Can the company upload their logo for use on PDF reports?

- [ ] English only for now? Is multi-language on the roadmap?

- [ ] What timezone does the company operate in? Configurable or always UTC/London?

---

## 3. Financial system

> Pricing, invoicing, expenses, payroll, subcontractors, rate cards.
> Answer these before building any financial feature. Wrong decisions here are expensive to fix.

### Job pricing

- [ ] How is a job priced? Fixed price per job, per mile, per tonne, per pallet, per hour, combination?

- [ ] Is pricing set at the customer level (rate card) or entered individually per job?

- [ ] Who enters the price — job creator at intake, accountant after the fact, or owner only?

- [ ] Can a planner see the job price, or is pricing hidden from operational staff?

- [ ] Can the price be overridden on a specific job if the rate card exists? Who can override?

- [ ] Is there a fuel surcharge? Fixed percentage, variable linked to fuel price index, or none?

- [ ] Is there a waiting time / detention charge? How many free minutes? Per customer or company-wide?

- [ ] Are there separate charges for different vehicle types?

- [ ] Is there a night out surcharge on the customer invoice?

- [ ] Are toll charges passed through to customer?

- [ ] Is there a minimum charge per job?

### Customer rate cards

- [ ] What is the structure of a rate card? Per lane, per zone, per postcode, or custom per customer?

- [ ] Can a rate card have an expiry date?

- [ ] Can different rate cards apply to different vehicle types for the same customer?

- [ ] Is there a volume discount structure?

- [ ] Can a customer have multiple active rate cards at the same time?

### Invoicing

- [ ] Is invoice generation automatic (triggered on job completion) or manual?

- [ ] Can multiple completed jobs be batched into one invoice? Weekly / monthly / per-job?

- [ ] What is the invoice numbering format?

- [ ] What information must appear on an invoice?

- [ ] What are the payment terms? Default (e.g. 30 days)? Configurable per customer?

- [ ] Is there a credit limit per customer?

- [ ] Can an invoice be disputed?

- [ ] Can credit notes be issued?

- [ ] Is VAT applied? UK standard rate (20%)? Configurable per company?

- [ ] What currency? GBP only for MVP?

- [ ] Is there a PDF invoice template?

### Expenses

- [ ] What expense categories exist? Fuel, parking, tolls, ferry, accommodation, subsistence, other?

- [ ] How does a driver submit an expense? Enter amount + category? Upload receipt photo? Both?

- [ ] Is receipt upload mandatory or optional?

- [ ] Who approves expenses? Auto-approved under a threshold, manual approval above?

- [ ] Is there a per-day or per-trip expense limit?

- [ ] Who can see all company expenses — owner, manager, accountant?

- [ ] Are expenses linked to a specific job or just to the driver/shift?

- [ ] Can a manager reject an expense? Driver notified with reason?

- [ ] Are expenses included in payroll export or invoiced to customer separately?

### Payroll

- [ ] What is the pay calculation basis? Hours worked × rate? Fixed weekly wage? Mileage-based?

- [ ] How is overtime defined and calculated?

- [ ] How is night out allowance paid — payroll, separate payment, or not tracked?

- [ ] Are driver expenses reimbursed through payroll or as a separate payment?

- [ ] What payroll software does the target customer use?
      Sage 50, Sage Payroll, Xero, QuickBooks, BrightPay, Moorepay, or other?

- [ ] What fields are required in the payroll export?

- [ ] What period does each payroll export cover? Weekly, fortnightly, monthly?

- [ ] Can payroll exports be generated for a custom date range?

### Subcontractors and trusted network

- [ ] When carrier A passes a job to trusted partner carrier B, how is the cost recorded?

- [ ] Is the subcontractor cost visible to the accountant?

- [ ] Does the system calculate margin automatically?

- [ ] Is VAT treatment different for subcontractor invoices?

- [ ] Can a subcontractor driver work directly for Carrier A without being part of Carrier B?

### Accountant role access

Exact list of what an accountant can see and do:
- [ ] Driver hours summary?
- [ ] Individual shift details?
- [ ] Pay rates per driver?
- [ ] Customer invoices?
- [ ] Customer rate cards?
- [ ] Expense submissions and approvals?
- [ ] Payroll export?
- [ ] Job details (collection/delivery, addresses)? Or summary only?
- [ ] Driver personal details?

---

## 4. Platform & compliance

> LogisticBay admin tools, billing, trial period, GDPR, data retention, legal.

### Trial and billing

- [ ] How long is the free trial?

- [ ] What happens when the trial expires? Locked out / read-only / nag banner?

- [ ] What is the pricing model? Per company flat fee? Per driver seat? Per job volume? Tiered?

- [ ] Who sets up pricing — manually per customer or self-serve checkout?

- [ ] What payment method? Stripe / GoCardless / invoice?

- [ ] Can a company upgrade or downgrade their plan themselves?

- [ ] What happens when a company does not pay? Grace period? Read-only? Fully locked?

- [ ] Can a locked company export their data before being deleted?

- [ ] Is there an annual prepay discount?

- [ ] Are there different tiers (Starter / Growth / Enterprise) with feature gates?

### Platform admin panel

- [ ] What does the LogisticBay admin panel need to show?

- [ ] Can you impersonate a company for support? Is this logged in the audit trail?

- [ ] Can you suspend a company? What does the company see?

- [ ] Can you reactivate a suspended company?

- [ ] Can you permanently delete a company and all their data (GDPR)?

- [ ] Do you need usage stats per company?

- [ ] Can you push a platform-wide announcement (maintenance notice)?

- [ ] Do you need feature flags (roll out to selected companies first)?

- [ ] Do you need a support ticket system integrated?

- [ ] What is the process when Railway has downtime? Status page? Company notifications?

### Data retention and GDPR

- [ ] What is the legal basis for processing driver personal data?

- [ ] How long must driver hours and shift records be kept?
      DVSA requires 15 months minimum (EC 561/2006 and UK equivalent).

- [ ] How long are completed job records kept?
      7 years for VAT/financial records? 15 months for tachograph compliance?

- [ ] Right to erasure (GDPR Article 17) — what can be deleted vs what must be retained?
      Working time records (DVSA) and financial records (HMRC) must be kept.
      Anonymise rather than delete?

- [ ] When a company cancels, what happens to their data?
      Deleted immediately? Retained for X days? Exported first?

- [ ] Do you need a Data Processing Agreement (DPA) between LogisticBay and each company?

- [ ] Is LogisticBay registered with the ICO?

- [ ] Cookie consent — does the web app use analytics or tracking cookies?

### Security and access (platform-level)

- [ ] What happens if a company owner loses access and there is no recovery email?

- [ ] Is there a log of all platform admin actions including impersonation?

- [ ] Are there IP restrictions or geo-blocking options for enterprise customers?

- [ ] Is there an option for a company to enforce SSO via their own identity provider?

### DVSA and transport compliance (UK-specific)

- [ ] Does LogisticBay need to produce DVSA-compliant records?

- [ ] Defect reports — must be kept for 15 months. Acceptable format for DVSA audit?

- [ ] Are you targeting standard national operator licence, restricted licence, or both?

- [ ] Is there any requirement to integrate with DVSA's digital systems directly?

### Legal and terms

- [ ] Are the Terms of Service the same for all company types?

- [ ] What jurisdiction governs the terms? England and Wales?

- [ ] Is there a minimum contract term or is it month-to-month?

- [ ] What is the SLA for uptime? 99.9%? Compensation if breached?

- [ ] Who is liable if driver working time data is incorrect due to a system bug and the company is fined by DVSA?

---

## 5. Product, notifications & future phases

> Notifications, mobile app behaviour, customer portal, trusted network, marketplace design.

### Notifications

- [ ] When a driver starts a shift, does the planner get notified?

- [ ] When a driver arrives at a collection point, does the planner get notified?

- [ ] When a driver marks a collection complete, does the planner get notified?

- [ ] When a driver reports a delay, does the planner get notified immediately?

- [ ] When a driver reports a failed collection or delivery, does the planner get notified immediately?

- [ ] When a driver reports a vehicle defect, does the owner get notified immediately?

- [ ] When a driver ends their shift, does anyone get notified?

- [ ] Is there a daily shift summary email sent to the owner? What time? What content?

- [ ] Is there a weekly hours summary email for the owner or accountant?

- [ ] When a driver's document is 30 days from expiry, who gets the alert?

- [ ] When a working time limit is being approached (e.g. 80% of weekly hours used), who gets the alert?

- [ ] When a holiday request is submitted, does the approver get notified?

- [ ] When a holiday is approved or rejected, does the driver get notified?

- [ ] What notification channels are used? In-app only? Email? Push? SMS fallback?

- [ ] Can notification preferences be configured per user?

- [ ] Are there any notifications to customers?

### Mobile app

- [ ] What happens if a driver gets a new phone? Can they log in immediately?

- [ ] Can the driver app be used on a tablet?

- [ ] iOS only, Android only, or both? Which to prioritise for first release?

- [ ] What happens to offline queue if the app is force-closed during sync?

- [ ] What is the maximum offline queue size before the driver gets a warning?

- [ ] Can a driver log out if they have unsynced events?
      SAFETY.md says block logout with unsynced data — confirmed decision?

- [ ] If a driver force-logs-out despite warning, what happens to their unsynced data?

- [ ] What is the minimum supported Android and iOS version?

- [ ] Does the app require GPS permission to work, or is GPS optional?

- [ ] What happens when GPS is denied?

- [ ] Is biometric (Face ID / fingerprint) login mandatory, optional, or not on the roadmap?

- [ ] Is there a driver-facing mobile view for owner/manager?

- [ ] What photo compression settings are used before upload? Max size? JPEG quality?

- [ ] Can multiple photos be attached to a single delivery? Maximum number?

### Customer portal

- [ ] Will customers ever be able to log in and track their own shipments?
      If yes, what can they see? Live status? ETA? POD? Collection/delivery confirmation only?

- [ ] What can customers NOT see? Driver name? Driver phone? Internal notes? Rates?

- [ ] How does a customer get access? Owner sends invite, or self-register with code?

- [ ] Is the customer portal a separate website or part of the main web app?

- [ ] Is this Phase 1, Phase 2, or later?

### Trusted carrier network (Phase 2)

- [ ] How does Carrier A find Carrier B to add as a trusted partner?

- [ ] Is trust bidirectional — must both companies accept?

- [ ] Can trust be revoked? What happens to loads already shared?

- [ ] When Carrier A shares a job with Carrier B, what does Carrier B see?
      Full job details? Anonymised until they accept?

- [ ] Does Carrier B see the rate Carrier A is charging the customer?

- [ ] Is payment between the two carriers handled inside the system?

- [ ] Is there a rating system between trusted partners?

- [ ] Can a trusted partner be a self-employed driver, not just another company?

- [ ] When Carrier B accepts a shared load, does the job appear automatically on their board?

- [ ] Can Carrier A cancel a shared load after Carrier B has accepted?

### Marketplace (Phase 4)

- [ ] Is the marketplace open to carriers who are not yet LogisticBay users?

- [ ] What is the verification process for a new carrier joining the marketplace?

- [ ] Is the marketplace a reverse auction or fixed-price booking?

- [ ] What is LogisticBay's revenue model on marketplace transactions?

- [ ] Does LogisticBay hold funds in escrow, or is payment between sender and carrier directly?

- [ ] What happens if a carrier accepts a marketplace load and then fails to execute?

- [ ] Can a carrier set a capacity calendar?

- [ ] Can a sender post a recurring load?
