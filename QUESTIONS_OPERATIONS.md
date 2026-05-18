# Open Questions — Operations & Load Movement

> Job execution, driver actions, load tracking, failures, relay, POD, planning rules.
> Answer these before building driver app flows, job status logic, or planner tools.

---

## Job creation and editing

- [ ] Who can edit a job after it has been assigned to a driver?
      Options: only owner/manager, planner too, nobody once driver starts

- [ ] Who can edit a job after the driver has started executing it?
      A driver is mid-collection. Planner realises the wrong address was entered.

- [ ] Who can cancel a job?
      Options: owner only, manager and owner, planner too

- [ ] What happens if a job is cancelled while a driver is mid-execution?
      Does the driver get an alert? Can they still complete what they started?

- [ ] Can a job be reassigned to a different driver after it has started?
      If yes, what happens to the events already recorded by the first driver?

- [ ] Can a job be split into two separate jobs after creation?
      Example: 52 pallets London→Leeds gets split into 26→Leeds and 26→Manchester

- [ ] Can two separate jobs be merged into one?

- [ ] Is customer reference (`customerRef`) mandatory at job creation or optional?

- [ ] Who is responsible for checking data quality before a job goes to planning?
      Is there a formal "job review" step or does it go straight from creation to planning?

- [ ] How far in advance can jobs be planned?
      Is there a maximum window (e.g. 90 days) or unlimited?

- [ ] Can the same vehicle be assigned to two overlapping jobs?
      Hard block or warning the planner can override?

- [ ] Can the same driver be assigned to two overlapping jobs?
      Hard block or warning?

---

## Stop sequencing and route

- [ ] Can a driver reorder stops on their own?
      Example: planner set Leeds first then Manchester, driver wants to do Manchester first.

- [ ] If driver reorders stops, does planner get notified?

- [ ] If a stop is failed (customer not there, access refused), does driver skip to the next stop automatically or must they notify the planner first?

- [ ] Can a driver add an unplanned stop?
      Example: driver needs fuel, stops at services. Is this recorded?

- [ ] Is route optimisation automatic (system suggests order) or always manual planner decision?

---

## Collection and delivery execution

- [ ] What happens when a driver cannot collect a load?
      Possible reasons: customer not ready, access refused, load not available, wrong address.
      Does each reason have a separate status or one generic "failed collection"?

- [ ] After a failed collection, who decides what happens next?
      Driver reports it and waits? Planner calls customer? Job automatically rescheduled?

- [ ] Can a driver partially collect?
      Example: manifest says 52 pallets but only 40 are ready.
      Can driver confirm 40 and leave 12 for another day?

- [ ] If partial collection is allowed, who decides if it is acceptable?
      Driver decides on the spot, or must planner approve before driver leaves site?

- [ ] What happens to the remaining quantity after a partial collection?
      Does the system automatically create a follow-up job, or does planner do it manually?

- [ ] What happens when a customer is not at the delivery address?
      Driver waits how long? What status is set? Who is notified?

- [ ] What is the workflow when a customer refuses delivery?
      Driver keeps the load? Returns to depot? Planner decides?

- [ ] Can a driver deliver to a different person than the named contact?
      Example: contact is "John Smith" but receptionist "Sarah Jones" signs.

---

## Quantities and discrepancies

- [ ] What happens when the delivered quantity does not match the manifest?
      Example: manifest says 50 but customer only accepts 48.
      Who records this? What status? Does it trigger anything?

- [ ] What happens when damage is discovered at collection?
      Driver refuses the load? Collects and notes damage? Photos required?

- [ ] What happens when damage is discovered at delivery?
      Customer signs with notation? Driver photographs? Who is notified?

- [ ] Who resolves a quantity discrepancy — driver on the spot, planner, or owner?

- [ ] Is there a maximum acceptable discrepancy before it requires escalation?
      Example: up to 2% variance is acceptable, above that requires manager sign-off.

---

## POD (Proof of Delivery)

- [ ] Is POD mandatory for every delivery or configurable per job?

- [ ] What counts as valid POD?
      Options: electronic signature, photo of signed document, photo of goods delivered, all three, any one of them

- [ ] If customer refuses to sign, what does driver do?
      Note the refusal? Photo of goods at door? Job still marked delivered?

- [ ] How quickly must POD be available after delivery?
      Real-time (as driver submits) or end of shift batch?

- [ ] Who can see POD — planner only, owner, customer too?

- [ ] Is POD attached to the PDF shift report or kept separately?

- [ ] For collection: is a collection confirmation (COC) required as well as POD at delivery?

---

## Relay and handover

- [ ] When driver A hands load to driver B, how is the handover confirmed?
      Both drivers must confirm? Only receiving driver? Planner confirms?

- [ ] What if driver B refuses the load at handover (damaged, wrong quantity)?

- [ ] Does a relay require the load to go through a depot or can it be a direct driver-to-driver transfer?

- [ ] When load changes hands, who is responsible if something is wrong between handover and delivery?

- [ ] Can a relay be planned in advance by the planner, or is it always an emergency decision?

---

## Breakdown and emergencies

- [ ] What is the driver workflow for a breakdown mid-delivery?
      Record the event, call who, load stays on truck or transferred?

- [ ] If load is transferred to another driver due to breakdown, is it treated the same as a relay?

- [ ] What is the workflow for a load that is lost or stolen?

- [ ] What is the workflow for a road traffic accident?
      Does system have an "incident" event type?

---

## ETA and live tracking

- [ ] Is live ETA shown to the planner for jobs in progress?
      If yes, is it GPS-based or manually entered by driver?

- [ ] Can a driver report a delay to the planner from the app?
      Free text note, estimated delay time, or both?

- [ ] When a driver reports a delay, who is notified and how?

- [ ] Can the planner see the driver's live GPS location?
      Always on, only during active shift, or driver opt-in?

---

## Night out and breaks

- [ ] How is night out triggered?
      Options: driver manually marks it, automatic based on shift duration, automatic based on distance from home depot

- [ ] What is the standard night out allowance amount?
      Is it fixed per company or configurable?

- [ ] Is EU/UK break rule (45 min after 4.5 hours driving) tracked by the system?
      If yes, is it a warning or a hard block?

- [ ] Is there a workflow for a driver to record their break time?
