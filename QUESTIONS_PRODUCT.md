# Open Questions — Product, Notifications, Mobile, Marketplace

> Notifications, mobile app behaviour, customer portal, trusted network, marketplace design.

---

## Notifications

- [ ] When a driver starts a shift, does the planner get notified?

- [ ] When a driver arrives at a collection point, does the planner get notified?

- [ ] When a driver marks a collection complete, does the planner get notified?

- [ ] When a driver reports a delay, does the planner get notified immediately?

- [ ] When a driver reports a failed collection or delivery, does the planner get notified immediately?

- [ ] When a driver reports a vehicle defect, does the owner get notified immediately?

- [ ] When a driver ends their shift, does anyone get notified?

- [ ] Is there a daily shift summary email sent to the owner?
      If yes, what time? What does it contain?

- [ ] Is there a weekly hours summary email for the owner or accountant?

- [ ] When a driver's document (licence, CPC) is 30 days from expiry, who gets the alert?
      Driver, owner, or both?

- [ ] When a working time limit is being approached (e.g. 80% of weekly hours used), who gets the alert?

- [ ] When a holiday request is submitted, does the approver get notified?

- [ ] When a holiday is approved or rejected, does the driver get notified?

- [ ] What notification channels are used?
      In-app only? Email? Push notification on mobile? SMS fallback?

- [ ] Can notification preferences be configured per user?
      Example: owner wants email for defects but not for every shift start.

- [ ] Are there any notifications to customers?
      Example: "your load has been collected", "your delivery is arriving in 1 hour"
      Or is that a future customer portal feature?

---

## Mobile app

- [ ] What happens if a driver gets a new phone?
      Can they log in on the new phone immediately? Do they need to transfer data?

- [ ] Can the driver app be used on a tablet?

- [ ] Is the driver app iOS only, Android only, or both?
      Currently Expo so both — but is there a preference for which to prioritise for first release?

- [ ] What happens to offline queue if the app is force-closed during sync?
      Is the queue preserved or lost?

- [ ] What is the maximum amount of data that can sit in the offline queue before the driver gets a warning?
      Example: warn at 50 unsynced events.

- [ ] Can a driver log out if they have unsynced events?
      SAFETY.md says block logout with unsynced data — confirmed decision?

- [ ] If a driver force-logs-out despite warning, what happens to their unsynced data?
      Lost? Kept locally for next login? Flagged for manual reconciliation?

- [ ] What is the minimum supported Android and iOS version?

- [ ] Does the app require GPS permission to work, or is GPS optional?

- [ ] What happens when GPS is denied — can the driver still use the app?

- [ ] Is biometric (Face ID / fingerprint) login mandatory, optional, or not on the roadmap?

- [ ] Is there a driver-facing mobile view for owner/manager?
      Can an owner see a summary of their operation on mobile or is mobile strictly driver-only?

- [ ] What photo compression settings are used before upload?
      Max size per photo? JPEG quality? Driver should not wait 30 seconds to upload a POD photo.

- [ ] Can multiple photos be attached to a single delivery?
      If yes, is there a maximum number?

---

## Customer portal

- [ ] Will customers ever be able to log in and track their own shipments?
      If yes, what can they see?
      Options: live status, ETA, POD document, collection and delivery confirmation only

- [ ] What can customers NOT see?
      Driver name? Driver phone? Internal planner notes? Rates? Vehicle registration?

- [ ] How does a customer get access?
      Owner sends them an invite, or self-register with a customer code?

- [ ] Is the customer portal a separate website or part of the main web app?

- [ ] Is this Phase 1, Phase 2, or later?

---

## Trusted carrier network (Phase 2)

- [ ] How does Carrier A find Carrier B to add as a trusted partner?
      Options: search by company name, search by company code, invite by email

- [ ] Is trust bidirectional — must both companies accept before either can share loads?

- [ ] Can trust be revoked?
      What happens to loads that were already shared and are pending?

- [ ] When Carrier A shares a job with Carrier B, what does Carrier B see?
      Full job details including customer name and address?
      Or anonymised until they accept?

- [ ] Does Carrier B see the rate Carrier A is charging the customer?
      Or only the rate Carrier A is offering to pay Carrier B?

- [ ] Is payment between the two carriers handled inside the system?
      Or do they settle outside and just use the system for operational data?

- [ ] Is there a rating system between trusted partners?
      After a job is completed, can Carrier A rate Carrier B's execution?

- [ ] Can a trusted partner be a subcontractor driver (self-employed), not just another company?

- [ ] When Carrier B accepts a shared load, does the job appear on their planner board automatically?
      Or does their planner need to confirm and assign it?

- [ ] Can Carrier A cancel a shared load after Carrier B has accepted?
      What is the workflow and who gets notified?

---

## Marketplace (Phase 4)

- [ ] Is the marketplace open to carriers who are not yet LogisticBay users?
      Or only existing LogisticBay carrier companies?

- [ ] What is the verification process for a new carrier joining the marketplace?
      Operator licence check? Insurance verification? Manual review by LogisticBay?

- [ ] Is the marketplace a reverse auction (senders post, carriers bid) or fixed-price booking?

- [ ] What is LogisticBay's revenue model on marketplace transactions?
      Commission per job? Subscription for marketplace access? Separate tier?

- [ ] Does LogisticBay hold funds in escrow, or is payment between sender and carrier directly?

- [ ] What happens if a carrier accepts a marketplace load and then fails to execute?
      Penalty? Rating impact? Compensation to sender?

- [ ] Can a carrier set a capacity calendar?
      Example: "I have an empty truck leaving Manchester every Monday — available for loads"

- [ ] Can a sender post a recurring load?
      Example: "every Tuesday, 10 pallets London→Leeds"
