# Open Questions — Operations & Load Movement

> Job execution, driver actions, load tracking, failures, relay, POD, planning rules.
> Answer these before building driver app flows, job status logic, or planner tools.
>
> Key: [x] = answered  [~] = partial answer  [ ] = still open

---

## Job creation and editing

- [~] Who can edit a job after it has been assigned to a driver?
      **PARTIAL:** Planner can edit at any stage up to `in_progress`. Once a Run is `publishedToDriver`, 
      field changes are still possible but trigger a JobAudit entry. Explicit role restriction 
      (owner only vs planner too) not yet codified in route guards. Decision needed.

- [~] Who can edit a job after the driver has started executing it?
      **PARTIAL:** Override-close flow (overrideClosed, overrideReason, overrideNotes) handles 
      closing with shortfall. Planner can still add plannerNotes. Address/stop changes mid-execution 
      are not blocked by code — policy decision needed on whether to hard-block or warn.

- [ ] Who can cancel a job?
      Options: owner only, manager and owner, planner too

- [ ] What happens if a job is cancelled while a driver is mid-execution?
      Does the driver get an alert? Can they still complete what they started?

- [x] Can a job be reassigned to a different driver after it has started?
      **YES.** Run.assignedDriverId can be changed by planner. RunAssignment has removedAt/removedBy/
      removalReason for the old assignment. Events already recorded by the first driver are preserved 
      in JobExecutionEvent and LoadTrack (immutable). PHASE1_DATA_MODEL section "Handover / driver swap."

- [x] Can a job be split into two separate jobs after creation?
      **DECISION: Splitting creates more JobParts — NOT more Jobs.** Job.parentJobId self-relation 
      allows a child Job if a literal job split is needed, but the standard path is splitting 
      into JobParts within the same Job. See PHASE1_DATA_MODEL section 15.

- [x] Can two separate jobs be merged into one?
      **NO.** Jobs are not merged. Two separate Jobs can share a single Run (via RunAssignments) 
      but remain distinct records. This is by design.

- [x] Is customer reference (`customerRef`) mandatory at job creation or optional?
      **Optional by default.** Job.customerRef is nullable (String?). The custRefRequired Boolean 
      flag on Job allows forcing it per-job at creation time. Job creator decides.

- [x] Who is responsible for checking data quality before a job goes to planning?
      **Job creator.** The formal gate is the "accept" step (status: pending_review → ready_to_plan). 
      Planner is NOT responsible for fixing bad job data — that's the job creator's domain. 
      See MASTER_BLUEPRINT section 6 "Job Creator vs Planner."

- [ ] How far in advance can jobs be planned?
      Is there a maximum window (e.g. 90 days) or unlimited?

- [~] Can the same vehicle be assigned to two overlapping jobs?
      **PARTIAL / Hard block by design — not yet enforced in code.** Architecture (MASTER_BLUEPRINT 
      section 15 "Run validity — four things must fit") requires time-window overlap check at 
      publish time. Run.vehicleCompatible flag exists. Implementation of the overlap query is pending.

- [~] Can the same driver be assigned to two overlapping jobs?
      **PARTIAL / Same as vehicle.** Architecture says hard block. Driver overlap query not yet 
      implemented in route. Run.trailerCompatible + vehicleCompatible flags exist for publish-time checks.

---

## Stop sequencing and route

- [ ] Can a driver reorder stops on their own?
      Example: planner set Leeds first then Manchester, driver wants to do Manchester first.
      **Decision needed:** RunAssignment.sequenceNumber is set by planner and is the authoritative order.
      No driver-reorder event type exists. Options: block it, allow with planner notification, allow silently.

- [ ] If driver reorders stops, does planner get notified?
      Depends on decision above. Notification system not built.

- [ ] If a stop is failed (customer not there, access refused), does driver skip to the next stop automatically or must they notify the planner first?
      collection_failed / delivery_failed event types exist. No auto-skip logic. Decision needed.

- [ ] Can a driver add an unplanned stop?
      Example: driver needs fuel, stops at services. Is this recorded?
      No unplanned-stop model. Driver can add a note_added event with context. Formal tracking out of scope for MVP.

- [x] Is route optimisation automatic (system suggests order) or always manual planner decision?
      **Always manual.** MASTER_BLUEPRINT section 9: "System assists planner. System does NOT replace 
      planner." AI/route suggestions are a future roadmap item, not MVP.

---

## Collection and delivery execution

- [ ] What happens when a driver cannot collect a load?
      Possible reasons: customer not ready, access refused, load not available, wrong address.
      Does each reason have a separate status or one generic "failed collection"?
      **Decision needed:** define failure reason codes for collection_failed events.

- [ ] After a failed collection, who decides what happens next?
      Driver reports it and waits? Planner calls customer? Job automatically rescheduled?

- [x] Can a driver partially collect?
      **YES.** JobPart.quantityCollected (Decimal) tracks actual vs quantityRequired. 
      Driver submits collected quantity in the event. Remainder stays on the job part.

- [ ] If partial collection is allowed, who decides if it is acceptable?
      Driver decides on the spot, or must planner approve before driver leaves site?

- [ ] What happens to the remaining quantity after a partial collection?
      Does the system automatically create a follow-up job, or does planner do it manually?
      **Current behaviour: manual.** No auto-follow-up job generation. Planner must create a new job 
      or re-assign the remainder. Decision: is this acceptable for MVP?

- [ ] What happens when a customer is not at the delivery address?
      Driver waits how long? What status is set? Who is notified?

- [ ] What is the workflow when a customer refuses delivery?
      Driver keeps the load? Returns to depot? Planner decides?

- [ ] Can a driver deliver to a different person than the named contact?
      Example: contact is "John Smith" but receptionist "Sarah Jones" signs.
      **No signed-by field in schema.** Would need to add deliveredToName to event or JobPart.

---

## Quantities and discrepancies

- [x] What happens when the delivered quantity does not match the manifest?
      **quantityDelivered on JobPart tracks actual.** If mismatched with quantityRequired, 
      the job reaches attention_needed status. Planner resolves via override-close: 
      sets overrideClosed=true, overrideQuantityDelivered, overrideQuantityShortfall, overrideReason.

- [ ] What happens when damage is discovered at collection?
      Driver refuses the load? Collects and notes damage? Photos required?
      **No damage flag in schema.** Driver can note it via note_added event. Formal damage workflow not built.

- [ ] What happens when damage is discovered at delivery?
      Customer signs with notation? Driver photographs? Who is notified?

- [x] Who resolves a quantity discrepancy — driver on the spot, planner, or owner?
      **Planner.** The override-close workflow requires planner action. 
      Job.overrideClosed + overrideReason + overrideNotes fields; closedBy records who resolved it.

- [ ] Is there a maximum acceptable discrepancy before it requires escalation?
      Example: up to 2% variance is acceptable, above that requires manager sign-off.
      overrideQuantityShortfall is stored but no threshold configured.

---

## POD (Proof of Delivery)

- [x] Is POD mandatory for every delivery or configurable per job?
      **Configurable per job.** Job.requirePOD Boolean flag. Default is false (set at job creation).

- [x] What counts as valid POD?
      **Configurable per stop.** JobPart.proofRequirements is a Json array. 
      Values: `"signature"`, `"photo"`, `"pod_number"`, `"timestamp"`. 
      Can require any combination. If empty, any confirmation counts.

- [ ] If customer refuses to sign, what does driver do?
      Note the refusal? Photo of goods at door? Job still marked delivered?

- [x] How quickly must POD be available after delivery?
      **Real-time when online.** Events sync immediately via API. When offline, events are queued 
      in AsyncStorage with clientEventId and synced on reconnect (idempotent — no duplicates).

- [ ] Who can see POD — planner only, owner, customer too?
      No POD display route built yet. Decision needed before building POD viewer.

- [ ] Is POD attached to the PDF shift report or kept separately?
      No PDF generation built yet.

- [ ] For collection: is a collection confirmation (COC) required as well as POD at delivery?
      No COC concept in current schema.

---

## Relay and handover

- [x] When driver A hands load to driver B, how is the handover confirmed?
      **Receiving driver confirms.** LoadTrack records fromCustody (driver_A) → toCustody (driver_B) 
      when driver B submits a handover_accepted event. Both custody states are tracked on 
      JobExecutionEvent.fromCustody / toCustody. See PHASE1_DATA_MODEL "Handover / driver swap."

- [ ] What if driver B refuses the load at handover (damaged, wrong quantity)?

- [x] Does a relay require the load to go through a depot or can it be a direct driver-to-driver transfer?
      **Direct transfer supported.** LoadTrack.fromCustody and toCustody can be any driver IDs. 
      Depot is just another custody state (e.g. "depot_base"). No depot requirement.

- [x] When load changes hands, who is responsible if something is wrong between handover and delivery?
      **LoadTrack answers this.** The custody ledger is append-only and immutable. The entity in 
      toCustody at the time of any event bears responsibility. LoadTrack timestamp + GPS provide evidence.

- [~] Can a relay be planned in advance by the planner, or is it always an emergency decision?
      **PARTIAL:** Architecture supports both. Planner can create a second Run with the same JobPart 
      at a later time (planned relay). Emergency relay = planner creates a new Run mid-execution. 
      No explicit "relay type" flag — just two RunAssignments on the same JobPart.

---

## Breakdown and emergencies

- [ ] What is the driver workflow for a breakdown mid-delivery?
      Record the event, call who, load stays on truck or transferred?
      **No breakdown event type defined.** Only note_added available. Decision needed.

- [ ] If load is transferred to another driver due to breakdown, is it treated the same as a relay?

- [ ] What is the workflow for a load that is lost or stolen?

- [ ] What is the workflow for a road traffic accident?
      Does system have an "incident" event type?
      **No incident event type defined.** Needs design before mobile app event flow is built.

---

## ETA and live tracking

- [~] Is live ETA shown to the planner for jobs in progress?
      **PARTIAL:** Run.estimatedStartTime / estimatedEndTime are stored. GPS coordinates are recorded 
      on every JobExecutionEvent. No live tracking dashboard or ETA calculation built yet.

- [~] Can a driver report a delay to the planner from the app?
      **PARTIAL:** note_added event with free-text note is available now. 
      No structured "delay report" with estimated minutes. Decision: is free text enough for MVP?

- [ ] When a driver reports a delay, who is notified and how?
      Notification system not built.

- [ ] Can the planner see the driver's live GPS location?
      Always on, only during active shift, or driver opt-in?
      GPS on events is historical (point-in-time). No live tracking feed built.

---

## Night out and breaks

- [x] How is night out triggered?
      **Driver manually marks it.** Shift.nightOut Boolean. Driver sets this on the shift record 
      before or at submission.

- [ ] What is the standard night out allowance amount?
      Is it fixed per company or configurable?
      No night-out allowance amount field in Company or Shift schema. Needs adding.

- [~] Is EU/UK break rule (45 min after 4.5 hours driving) tracked by the system?
      **PARTIAL:** Shift.breakMins records break time entered by driver. No automated enforcement 
      of the 4.5h driving → 45min break rule. Decision: warn on shift submission if breakMins 
      < 45 and total hours > 4.5? Or out of scope for MVP?

- [x] Is there a workflow for a driver to record their break time?
      **YES.** Shift.breakMins field — driver enters break minutes as part of shift submission.
