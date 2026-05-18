# Open Questions — Financial System

> Pricing, invoicing, expenses, payroll, subcontractors, rate cards.
> Answer these before building any financial feature. Wrong decisions here are expensive to fix.

---

## Job pricing

- [ ] How is a job priced?
      Options: fixed price per job, per mile, per tonne, per pallet, per hour, combination

- [ ] Is pricing set at the customer level (rate card) or entered individually per job?

- [ ] Who enters the price — job creator at intake, accountant after the fact, or owner only?

- [ ] Can a planner see the job price?
      Or is pricing hidden from operational staff?

- [ ] Can the price be overridden on a specific job if the rate card exists?
      Who can override?

- [ ] Is there a fuel surcharge?
      Options: fixed percentage, variable linked to fuel price index, none, per-customer setting

- [ ] Is there a waiting time / detention charge?
      How many free minutes before charging starts?
      Who sets this — per customer or company-wide?

- [ ] Are there separate charges for different vehicle types (rigid vs artic vs van)?

- [ ] Is there a night out surcharge on the customer invoice (separate from driver allowance)?

- [ ] Are there toll charges passed through to customer?

- [ ] Is there a minimum charge per job regardless of distance/time?

---

## Customer rate cards

- [ ] What is the structure of a rate card?
      Per lane (origin→destination), per zone, per postcode, or completely custom per customer?

- [ ] Can a rate card have an expiry date?
      What happens when it expires — jobs blocked, warning shown, or old rate continues?

- [ ] Can different rate cards apply to different vehicle types for the same customer?

- [ ] Is there a volume discount structure?
      Example: first 10 jobs per month at rate A, above 10 at rate B.

- [ ] Can a customer have multiple active rate cards at the same time?
      Example: one for standard jobs, one for express/priority jobs.

---

## Invoicing

- [ ] Is invoice generation automatic (triggered on job completion) or manual (accountant reviews and releases)?

- [ ] Can multiple completed jobs be batched into one invoice?
      Weekly invoice, monthly invoice, or per-job?

- [ ] What is the invoice numbering format?
      Sequential per company (INV-001, INV-002)?

- [ ] What information must appear on an invoice?
      Job reference, collection/delivery address, vehicle reg, driver name, quantity, rate?

- [ ] What are the payment terms?
      Default (e.g. 30 days)? Configurable per customer?

- [ ] Is there a credit limit per customer?
      If yes, what happens when it is exceeded — block new jobs, warning only, or ignore?

- [ ] Can an invoice be disputed?
      What is the workflow — mark as disputed, flag for review, block payment chase?

- [ ] Can credit notes be issued?
      If a delivery failed or quantity was short, how is the credit note raised?

- [ ] Is VAT applied?
      UK standard rate (20%)? Is reverse charge relevant for subcontractors?
      Can VAT be configured per company (VAT registered vs not)?

- [ ] What currency?
      GBP only for MVP? Multi-currency later?

- [ ] Is there a PDF invoice template?
      Does it include the company logo?

---

## Expenses

- [ ] What expense categories exist?
      Fuel, parking, tolls, ferry, accommodation, subsistence, other?

- [ ] How does a driver submit an expense?
      Enter amount + category? Upload receipt photo? Both?

- [ ] Is receipt upload mandatory or optional?

- [ ] Who approves expenses?
      Auto-approved under a threshold (e.g. under £20), manual approval above?

- [ ] Is there a per-day or per-trip expense limit?

- [ ] Who can see all company expenses — owner, manager, accountant?

- [ ] Are expenses linked to a specific job or just to the driver/shift?

- [ ] Can a manager reject an expense?
      If rejected, does driver get notified with a reason?

- [ ] Are expenses included in the payroll export or invoiced to customer separately?

---

## Payroll

- [ ] What is the pay calculation basis?
      Hours worked × hourly rate? Fixed weekly wage? Mileage-based?

- [ ] How is overtime defined and calculated?
      Above 8 hours in a day? Above 40 hours in a week? EU 48-hour average?

- [ ] How is night out allowance paid — added to payroll, paid separately, or not tracked in system?

- [ ] Are driver expenses reimbursed through payroll or as a separate payment?

- [ ] What payroll software does the target customer use?
      Sage 50, Sage Payroll, Xero, QuickBooks, BrightPay, Moorepay, or other?
      This determines the export format.

- [ ] What fields are required in the payroll export?
      Employee number, name, PAYE reference, basic hours, overtime hours, expenses, allowances?

- [ ] What period does each payroll export cover?
      Weekly, fortnightly, monthly?

- [ ] Can payroll exports be generated for a custom date range?

---

## Subcontractors and trusted network

- [ ] When carrier A passes a job to trusted partner carrier B, how is the cost recorded?
      Carrier B invoices Carrier A? Carrier A enters the cost manually? System facilitates payment?

- [ ] Is the subcontractor cost visible to the accountant?

- [ ] Does the system calculate margin automatically?
      Customer invoice amount minus subcontractor cost?

- [ ] Is VAT treatment different for subcontractor invoices?
      UK: domestic reverse charge may apply for construction but not transport — confirm.

- [ ] Can a subcontractor driver work directly for Carrier A without being part of Carrier B's company?
      i.e. freelance/self-employed driver attached to a company without a full driver account?

---

## Accountant role access

- [ ] Exact list of what an accountant can see and do:
      - [ ] Driver hours summary? Yes / No
      - [ ] Individual shift details? Yes / No
      - [ ] Pay rates per driver? Yes / No
      - [ ] Customer invoices? Yes / No
      - [ ] Customer rate cards? Yes / No
      - [ ] Expense submissions and approvals? Yes / No
      - [ ] Payroll export? Yes / No
      - [ ] Job details (collection/delivery, addresses)? Yes / No — or summary only?
      - [ ] Driver personal details? Yes / No
