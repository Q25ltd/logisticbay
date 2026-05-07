FRONTEND PAGE STRUCTURE RULES — APPLY TO ALL WEB PAGES

PURPOSE

The goal of these rules is:
- predictable frontend structure
- safer refactors
- easier onboarding
- smaller merge conflicts
- reusable patterns
- pages that scale without becoming unmaintainable

GENERAL PRINCIPLES

- Start simple.
- Split only when there is real pressure.
- Never let a page become a junk drawer.
- Prefer small safe refactors over rewrites.
- Keep behaviour unchanged during structural refactors unless explicitly requested.

────────────────────────────────────────────────────────────

1. PAGE RESPONSIBILITY RULE

A Page.tsx file is an orchestration/controller layer.

A page MAY contain:
- page state
- data loading
- permission checks
- loading/error/empty/content states
- API action calls
- routing/navigation
- deciding which child components render

A page MUST NOT contain:
- business calculations
- payload transformation logic
- formatting helpers
- reusable business rules
- repeated JSX blocks (same structure appearing 2+ times)
- components that another page also needs

Size does not define a violation. Responsibility does.
A 600-line page that contains only orchestration is fine.
A 150-line page that mixes logic, UI, and API calls is not.

Exception — large stateful forms:
A page that orchestrates a single multi-section form may stay as one
file even when large, provided all of these hold:
- State is genuinely shared across sections
- All business logic is extracted to utils files
- All payload conversion is extracted to a payload file
- All constants and types are extracted
- No repeated JSX blocks exist

────────────────────────────────────────────────────────────

2. ONE FOLDER PER MAJOR PAGE

Every major page/feature gets its own folder.

Example:

src/pages/drivers/
  DriversPage.tsx
  DriverForm.tsx
  DriverFilters.tsx
  DriverTable.tsx
  PinResetModal.tsx
  driverPageUtils.ts
  driverFormPayload.ts
  driverPageTypes.ts

Small/simple pages may stay as a single file.

Example:

src/pages/settings/
  SettingsPage.tsx

────────────────────────────────────────────────────────────

3. SPLIT RULE

A new page may start as one file.

Do NOT over-engineer small pages on day one.

Split when a responsibility violation appears. In priority order:

1. Extract constants and option arrays first — they have no dependencies
   and their removal always makes the file cleaner.
2. Extract types and interfaces — they document shape, not behaviour.
3. Extract utils and pure functions — no JSX, no side effects, testable alone.
4. Extract payload builders — when form→API conversion becomes non-trivial.
5. Extract components — when a JSX block is reused, or large enough to
   obscure the page's intent.
6. Extract forms and modals — when form state and validation are substantial
   enough to own their own file.
7. Extract tables and lists — when they contain their own local state
   or filtering logic.

When to split — ask these questions, not line counts:

  Does this file have more than one reason to change?
  → Split. Separate the concerns.

  Would a new developer need to read the whole file to understand one part?
  → Split. The unrelated parts are adding noise.

  Could this logic be tested without rendering anything?
  → Extract to a utils file.

  Does this JSX block appear more than once?
  → Extract to a component.

  Does the submit handler do more than call the API?
  → Extract a payload builder.

  Would two developers editing unrelated features touch the same file?
  → Split the file.

Size as a signal (not a rule):
- A file over 400 lines is a signal to check for responsibility violations.
- A file over 800 lines almost certainly has them.
- Size alone never justifies a split. Responsibility violations do.

Do NOT split everything immediately.
Do NOT split to hit a line count.
Do NOT create components that exist only to reduce line count.

────────────────────────────────────────────────────────────

4. COMPONENT PLACEMENT RULE

If a component is used only by one page:
- keep it inside that page folder

Example:

src/pages/drivers/DriverForm.tsx

If a component is reused across multiple pages:
- move it into src/components

Example:

src/components/DateRangePicker.tsx

Do NOT move things to global components too early.
Move on second use, not in anticipation of it.

────────────────────────────────────────────────────────────

5. API LAYER RULE

API calls belong in src/api.

Good:

driversApi.list()
driversApi.update()
jobsApi.complete()

Bad:

api.get("/drivers")
api.patch("/jobs")

scattered across many components.

Pages and components call named API functions, never raw HTTP methods.
API files do not import from pages or components.

────────────────────────────────────────────────────────────

6. BUSINESS LOGIC RULE

Business rules and calculations must live outside JSX.

Move into utility/helper files:
- calculations and derived values
- status mapping and label logic
- date and time formatting
- validation helpers
- permission and policy rules
- any logic that could be unit-tested without rendering

Examples:

driverHolidayPolicy.ts
jobStatusRules.ts
invoiceCalculations.ts

Bad:

{drivers.map(driver => {
  const allowance = driver.daysWorked > 5 ? ...
  const warning = allowance < 2 ? ...
  return (...)
})}

Good:

const summary = calculateDriverHolidaySummary(driver)

The test for this rule: if the logic could be wrong and you want to
test it without rendering a component, it belongs in a utils file.

────────────────────────────────────────────────────────────

7. FORM PAYLOAD RULE

If form submission requires any non-trivial transformation — type
conversion, null handling, enum mapping, date formatting, nested object
construction — move it into a payload builder file.

Example:

driverFormPayload.ts

The form collects raw string/boolean values from inputs.
The payload builder converts them into what the API expects.
The page calls the builder and passes the result to the API.

This separation makes each part independently testable and keeps the
form and API from becoming coupled to each other.

────────────────────────────────────────────────────────────

8. PAGE STATE RULE

Every page must explicitly handle all four states:
- loading
- error
- empty
- content/success

Do not assume API data always exists. Do not skip loading or error states.

────────────────────────────────────────────────────────────

9. REFACTOR SAFETY RULE

Do NOT rewrite working files. Move one piece at a time.

After every extraction:
- run the build
- confirm zero TypeScript errors
- verify the UI behaviour is unchanged before the next step

Preferred sequence:

Step 1: extract constants / types → build
Step 2: extract utils / helpers  → build
Step 3: extract payload builder  → build
Step 4: extract components       → build
Step 5: extract forms / modals   → build

Never do two steps in one commit if they both touch the same file.
Never refactor structure and change behaviour in the same commit.

────────────────────────────────────────────────────────────

10. FILE RESPONSIBILITY DEFINITIONS

Page
- orchestration, data loading, state coordination

Component
- UI rendering, no business logic, no direct API calls

Form
- form state, field validation, submit actions

API file
- server communication only, no UI concerns

Utils file
- pure functions: calculations, formatting, rules, validators

Payload file
- form-state → API-body transformation

Types file
- local feature/page types and interfaces

Constants file
- option arrays, enums, lookup maps, static values

Global component
- shared reusable UI, used by more than one page

────────────────────────────────────────────────────────────

11. DEFAULT PROJECT STRUCTURE

Recommended structure:

src/
  api/
  components/
  hooks/
  layouts/
  pages/
  services/
  theme/
  types/
  utils/

Feature example:

src/pages/jobs/
  JobsPage.tsx
  JobForm.tsx
  JobFilters.tsx
  JobTable.tsx
  JobActionBar.tsx
  jobUtils.ts
  jobPayload.ts
  jobTypes.ts
  jobConstants.ts

────────────────────────────────────────────────────────────

12. STABILITY RULE

Prefer boring, predictable, and maintainable over clever, magical,
or hyper-abstract.

Optimise for:
- a new developer understanding the file in under two minutes
- safe edits that cannot break unrelated features
- long-term maintenance over short-term elegance

Not for:
- shortest possible code
- fancy architecture patterns
- premature abstraction

The right question before any refactor:
Does this make the code easier to understand and change,
or does it just make it look more organised?
If the answer is the latter, do not do it.

────────────────────────────────────────────────────────────

13. FINAL RULE

Start simple.
Split when responsibilities diverge, not when files grow.
Keep each file answerable in one sentence.
Never let one file own everything.
