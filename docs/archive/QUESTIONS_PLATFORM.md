# Open Questions — Platform Control & Compliance

> LogisticBay admin tools, billing, trial period, GDPR, data retention, legal.
> Answer these before taking a single paying customer.

---

## Trial and billing

- [ ] How long is the free trial?
      14 days? 30 days? Unlimited until first customer volume threshold?

- [ ] What happens when the trial expires?
      Options: account locked out completely, read-only mode, full access with a nag banner

- [ ] What is the pricing model?
      Per company flat monthly fee? Per driver seat per month? Per job volume? Tiered plans?

- [ ] Who sets up the pricing — you manually per customer, or self-serve checkout?

- [ ] What payment method?
      Credit/debit card (Stripe)? Direct debit (GoCardless)? Invoice on 30 days?

- [ ] Can a company upgrade or downgrade their plan themselves?
      Or do they contact you?

- [ ] What happens when a company does not pay?
      Grace period (how many days)? Then read-only? Then fully locked?

- [ ] Can a locked company export their data before being deleted?

- [ ] Is there an annual prepay discount?

- [ ] Are there different tiers (e.g. Starter / Growth / Enterprise)?
      What features are gated per tier?

---

## Platform admin panel

- [ ] What does the LogisticBay admin panel need to show?
      List of all companies, their status (trial/active/suspended/cancelled), driver count, job count, last active date

- [ ] Can you impersonate a company for support?
      Log in as that company to see what they see and debug issues.
      If yes, is this logged in the audit trail?

- [ ] Can you suspend a company?
      What does the company see when suspended — generic message or specific reason?

- [ ] Can you reactivate a suspended company?

- [ ] Can you permanently delete a company and all their data?
      GDPR: you may need to do this on request. What cascades?

- [ ] Do you need usage stats per company?
      Jobs created per month, shifts per month, active drivers, storage used?

- [ ] Can you push a platform-wide announcement (maintenance notice, new feature)?
      Banner visible to all users on all companies?

- [ ] Do you need feature flags?
      Roll out a new feature to selected companies before everyone?

- [ ] Do you need a support ticket system integrated, or external (e.g. Intercom, Freshdesk)?

- [ ] What is the process when Railway has downtime?
      Is there a status page? How do you notify all companies?

---

## Data retention and GDPR

- [ ] What is the legal basis for processing driver personal data?
      UK GDPR lawful basis: legitimate interests (operational necessity)? Contract? Consent?

- [ ] How long must driver hours and shift records be kept?
      DVSA requires driver records for 15 months minimum (EC 561/2006 and UK equivalent).
      Does LogisticBay store data longer than the minimum, and is that a problem?

- [ ] How long are completed job records kept?
      Operational jobs: 7 years for VAT/financial records? 15 months for tachograph compliance?
      These may conflict — which takes priority?

- [ ] Right to erasure (GDPR Article 17) — when a driver leaves and requests deletion:
      What can be deleted? (Personal details, contact info)
      What must be retained? (Working time records for DVSA, financial records for HMRC)
      How is the conflict handled — anonymise rather than delete?

- [ ] When a company cancels their account, what happens to their data?
      Deleted immediately? Retained for X days then deleted? Exported first?

- [ ] Do you need a Data Processing Agreement (DPA) between LogisticBay and each company?
      LogisticBay processes personal data (driver details) on behalf of the company.
      UK GDPR Article 28 requires a written DPA. Is this in the terms of service or a separate document?

- [ ] Is LogisticBay registered with the ICO (Information Commissioner's Office)?
      Required if processing personal data of UK residents.

- [ ] Cookie consent — does the web app use analytics or tracking cookies?
      If yes, PECR requires consent banner.

---

## Security and access

- [ ] What happens if a company owner loses access to their account and there is no recovery email?
      Escalation to LogisticBay support? Manual identity verification?

- [ ] Is there a log of all platform admin actions?
      If you impersonate a company, is that recorded?

- [ ] Are there IP restrictions or geo-blocking options for enterprise customers?

- [ ] Is there an option for a company to enforce SSO (Single Sign-On) via their own identity provider?
      Enterprise feature — probably Phase 4 but worth deciding now if it affects the auth model.

---

## DVSA and transport compliance (UK-specific)

- [ ] Does LogisticBay need to produce DVSA-compliant records?
      Operators must keep: driver hours, defect reports, vehicle inspection records.
      Does the system need to produce these in a specific format for DVSA audit?

- [ ] Defect reports — must be kept for 15 months.
      Is a defect recorded in the system sufficient, or does it need a specific document format?

- [ ] Are you targeting operators with a standard national operator licence, restricted licence, or both?
      Different record-keeping requirements apply.

- [ ] Is there any requirement to integrate with DVSA's digital systems directly?
      Or is export to PDF/CSV sufficient for audit purposes?

---

## Legal and terms

- [ ] Are the Terms of Service the same for all company types (carrier, sender)?
      Or do carriers and senders need separate terms?

- [ ] What jurisdiction governs the terms?
      England and Wales?

- [ ] Is there a minimum contract term or is it month-to-month?

- [ ] What is the SLA for uptime?
      99.9%? What is the compensation if SLA is breached?

- [ ] Who is liable if a driver's working time data is incorrect due to a system bug and the company is fined by DVSA?
