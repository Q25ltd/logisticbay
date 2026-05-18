# Open Questions — Company Management

> Staff management, fleet control, working time, holidays, roles and permissions, company settings.
> Answer these before building the settings page, admin panel, or any management features.

---

## Driver and staff management

- [ ] When the owner adds a new driver, what is the minimum required information?
      Name + email? Name + phone? Name only with email optional?

- [ ] How does a new driver receive their login credentials?
      Options: system sends email automatically, owner copies and tells them manually, system sends SMS

- [ ] How does the owner reset a driver's PIN?
      Direct reset in admin panel? Triggers email to driver? Owner sets it and tells them verbally?

- [ ] Can a driver change their own email address?
      Or is email managed only by the owner?

- [ ] Who can see a driver's full personal details (address, date of birth, pay rate)?
      Owner only? Manager too? Planner sees operational data only?

- [ ] What happens when a driver leaves the company?
      Status → inactive. Can they still log in? Are their historical shifts preserved?

- [ ] Can a driver be temporarily suspended (e.g. pending investigation)?
      Different from permanent deactivation?

- [ ] Can the same person (same email) be a driver at two companies simultaneously?
      Agency driver scenario — this is already partially supported, but is it a supported workflow or edge case?

- [ ] What is a "subcontractor driver" vs an "employee driver"?
      Does the system treat them differently for working time, holidays, or payroll?

- [ ] Can an owner assign multiple roles to one person?
      Example: one person is both planner and job creator.
      Current model is one role per membership — does this need to change?

---

## Driver documents and compliance

- [ ] Is driver licence category tracked (C, C+E, etc.)?
      If yes, does the system warn when assigning a job that requires a category the driver doesn't hold?

- [ ] Is CPC qualification tracked with expiry date?
      If yes, who is warned and how many days before expiry?

- [ ] Is digital tachograph card number stored?

- [ ] Is medical fitness certificate expiry tracked?

- [ ] Is driving licence expiry date tracked?

- [ ] When a document is about to expire, who gets the alert — owner only, manager, the driver themselves?

- [ ] Can documents (licence copy, CPC certificate) be uploaded and stored in the system?
      Or is this out of scope and just the expiry dates are tracked?

---

## Fleet management

- [ ] Who can mark a vehicle as VOR (vehicle off road)?
      Driver, manager, owner, fleet manager, any of them?

- [ ] When a vehicle is marked VOR, does the system automatically prevent it being assigned to a job?
      Hard block or warning the planner can override?

- [ ] Who can return a vehicle from VOR back to active?

- [ ] Is MOT expiry date tracked per vehicle?
      Warning how many days before expiry?

- [ ] Is road tax expiry tracked?

- [ ] Is operator licence (O-licence) disc expiry tracked per vehicle?
      UK requirement — each vehicle on the licence must have a valid disc.

- [ ] Is insurance expiry tracked per vehicle or per fleet (blanket policy)?

- [ ] Is there a service/maintenance schedule?
      Mileage-based, time-based, or both? Who enters service records?

- [ ] Who can sign off a defect reported by a driver?
      Must it be a manager? Can the owner sign off? Does a mechanic need to record the repair?

- [ ] Is fuel tracked manually (driver enters litres/cost) or via fuel card integration?

- [ ] Is AdBlue tracked separately from fuel?

- [ ] Can a trailer be used without a truck being allocated to the same job?
      Example: trailer parked at customer site for drop and swap.

- [ ] Who owns each trailer — own fleet, hired/leased, or customer's trailer?
      Does ownership affect how it is tracked?

- [ ] Is trailer service and inspection schedule tracked separately from truck schedule?

---

## Working time

- [ ] 48-hour average over 17 weeks — is this calculated automatically by the system?

- [ ] 60-hour maximum in any single week — is this a hard block (cannot submit shift) or a warning?

- [ ] 11-hour minimum daily rest between shifts — hard block or warning?

- [ ] 9-hour reduced rest (maximum 3 times per week) — is this tracked automatically?

- [ ] Night work limit (maximum 10 hours in any 24-hour period that includes night time 00:00–04:00) — tracked?

- [ ] Has any driver signed a working time opt-out agreement (UK workers can opt out of the 48h average)?
      If yes, is this stored per driver and does it change what the system enforces for that driver?

- [ ] Who receives an alert when a driver is approaching working time limits?
      Owner only? Planner? The driver themselves?

- [ ] Can a manager or owner override a working time warning?
      If yes, is the override logged in the audit trail?

- [ ] Self-employed / subcontractor drivers — do they have different working time rules?
      UK: self-employed are covered by Road Transport WTD but different thresholds apply.

---

## Holidays and leave

- [ ] What is the holiday year — January to December, or a rolling 12 months from employment start?

- [ ] What is the default holiday allowance?
      UK statutory minimum is 28 days including bank holidays, or 20 days + 8 bank holidays.

- [ ] Are bank holidays included in the 28-day allowance or given on top?

- [ ] Are bank holidays applied automatically or does the owner manage them manually per company?

- [ ] What happens to unused holiday at year end?
      Options: lost (use it or lose it), carry over up to X days, paid out

- [ ] Are half-day holidays allowed?

- [ ] Can the owner or manager force-book holidays for a driver?
      Example: Christmas shutdown. Can owner block out a period and assign it as holiday for all drivers?

- [ ] Who approves holiday requests — owner only, or can managers approve too?

- [ ] What is the minimum notice period for a holiday request?
      Is there a configurable minimum (e.g. must request at least 2 weeks in advance)?

- [ ] What happens when two drivers request the same period and company policy allows only one off at a time?
      First come first served? Manager decides? System warns but allows both?

- [ ] What happens if the approver is on holiday themselves?
      Is there a deputy approver?

- [ ] Is sick leave tracked separately from holiday?

- [ ] Is unpaid leave a separate category?

- [ ] Is compassionate leave or other special leave tracked?

---

## Roles and permissions

- [ ] Exact list of what a `planner` can and cannot do on the web.
      Can they: delete a job? Edit a driver's details? See financial data? Approve holidays?

- [ ] Exact list of what a `manager` can and cannot do.
      Can they: delete a driver? Change company settings? See pay rates? Approve expenses?

- [ ] Exact list of what a `job_creator` can and cannot do.
      Can they see the planner board? Can they assign drivers? Can they see shift data?

- [ ] Exact list of what an `accountant` can see.
      Driver hours? Pay rates? Invoice data? Customer rate cards? Job execution details?

- [ ] Can roles be customised per company?
      Or are permissions fixed and the same for all companies on the platform?

- [ ] Can the owner delegate specific owner-level permissions to a manager without making them full owner?

---

## Company settings

- [ ] What are the configurable working hours for pay calculation?
      Example: paid from shift start to shift end, or only driving time, or scheduled hours?

- [ ] Are overtime rates configured per company?
      First 8 hours standard rate, above 8 hours at X multiplier?

- [ ] Are pay rates per driver, per role, or company-wide?

- [ ] Is there a minimum paid hours per shift (e.g. minimum 4 hours even if shift is shorter)?

- [ ] Can the company upload their logo for use on PDF reports?

- [ ] What language is the system in?
      English only for now? Is multi-language on the roadmap?

- [ ] What timezone does the company operate in?
      Is this configurable or always UTC/London?
