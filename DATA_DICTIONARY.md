# LogisticBay — Data Dictionary

This document is the authoritative reference for every field that LogisticBay collects, stores, or processes. Fields are grouped by database model or logical data group. For each field the table shows: its column/key name, data type, whether it is required, the allowed values or format, and a plain-English description. JSON blob sub-fields are expanded into individual rows. Enum values list every known option. Multi-select chip arrays list every choosable value.

---

## Company

Table: `Company`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| name | String | Yes | Free text | Company display name |
| slug | String | Yes | Unique, URL-safe string | URL-safe identifier for the company |
| ticker | String? | No | Unique, short code | Optional short ticker symbol (e.g. for job references) |
| nextJobSequence | Int | Yes | Default: 1 | Counter used to generate the next sequential job reference number |
| jobSequenceYear | Int | Yes | Default: 2026 | Year component in job reference generation; resets counter when year changes |
| nextRunSequence | Int | Yes | Default: 1 | Counter used to generate the next sequential run reference number |
| runSequenceYear | Int | Yes | Default: 2026 | Year component in run reference generation; resets counter when year changes |
| status | String | Yes | `trial` \| `active` \| `suspended` | Current subscription / account status |
| reportEmail | String? | No | Valid email address | Address to receive automated reports |
| reportEmailEnabled | Boolean | Yes | Default: `true` | Whether automated report emails are sent |
| maxHolidaysPerDay | Int | Yes | Default: 2 | Maximum number of drivers that can be on holiday on the same day |
| holidayYearResetMonth | Int | Yes | 1–12, Default: 1 | Month (1 = January) when the holiday year resets |
| holidayYearResetDay | Int | Yes | 1–31, Default: 1 | Day of month when the holiday year resets |
| holidayWarnDaysBefore | Int | Yes | Default: 30 | Days in advance to warn a driver that their holiday allowance is running out |
| holidayCarryOverAllowed | Boolean | Yes | Default: `false` | Whether unused holiday days can be carried over to the next year |
| holidayCarryOverMaxDays | Int | Yes | Default: 0 | Maximum number of days that can be carried over |
| baseHolidayAllowanceDays | Int | Yes | Default: 28 | Standard annual holiday entitlement in days |
| holidaySeniorityEnabled | Boolean | Yes | Default: `true` | Whether extra holiday is awarded for length of service |
| holidaySeniorityYears | Int | Yes | Default: 5 | Number of years of service required to trigger the seniority bonus |
| holidaySeniorityExtraDays | Int | Yes | Default: 1 | Extra days awarded per seniority threshold |
| holidaySeniorityMaxExtraDays | Int | Yes | Default: 5 | Cap on total seniority bonus days |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## User / CompanyMembership

### User

Table: `User`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| name | String | Yes | Free text | User's display name |
| email | String | Yes | Unique, valid email | Login email address |
| passwordHash | String | Yes | bcrypt hash | Hashed password — never stored in plaintext |
| status | String | Yes | `active` \| `inactive` \| `suspended` | Account status |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

### CompanyMembership

Table: `CompanyMembership`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Company this membership belongs to |
| userId | Int | Yes | FK → User.id | User this membership belongs to |
| role | String | Yes | `company_owner` \| `planner` \| `driver` | Access role granted to the user within this company |
| status | String | Yes | `active` \| `inactive` | Whether the membership is currently active |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## Customer

Table: `Customer`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| name | String | Yes | Free text, unique per company | Customer / client company name |
| contactName | String? | No | Free text | Primary contact person at the customer |
| contactPhone | String? | No | Phone string | Primary contact phone number |
| contactEmail | String? | No | Email string | Primary contact email address |
| notes | String? | No | Free text | Internal notes about the customer |
| status | String | Yes | `active` \| `inactive`, default `active` | Whether the customer is active |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## DriverProfile

Table: `DriverProfile`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| userId | Int? | No | FK → User.id (unique) | Linked user account (optional; a profile can exist without a login) |
| displayName | String | Yes | Free text | Driver's display name used in planning views |
| employeeNumber | String? | No | Free text | Employee / payroll number |
| phoneNumber | String? | No | Phone string | Driver's personal mobile number |
| employmentStartDate | DateTime? | No | ISO 8601 date | Date the driver started employment |
| contactEmail | String? | No | Email string | Driver's contact email |
| contactPhone | String? | No | Phone string | Driver's direct contact phone (may differ from phoneNumber) |
| driverType | String | Yes | `permanent` \| `agency` \| `subcontractor`, default `permanent` | Employment classification |
| licenceClass | String | Yes | `""` \| `B` \| `C1` \| `C` \| `CE` \| `D` etc., default `""` | Highest held driving licence category |
| endorsements | Json? | No | String array | Licence endorsement codes held by the driver |
| canDriveCategories | Json? | No | String array | Additional vehicle categories the driver is approved for |
| canUseTrailer | Boolean | Yes | Default: `false` | Whether the driver is approved to operate a trailer |
| trailerTypesAllowed | Json? | No | String array | Specific trailer types the driver may use |
| adrAllowed | Boolean | Yes | Default: `false` | Whether the driver holds an ADR (dangerous goods) certificate |
| hiabAllowed | Boolean | Yes | Default: `false` | Whether the driver is certified to operate a HIAB crane |
| moffettAllowed | Boolean | Yes | Default: `false` | Whether the driver is certified to operate a Moffett forklift |
| manualHandlingAllowed | Boolean | Yes | Default: `false` | Whether the driver is approved for manual handling tasks |
| preferredStartTime | String | Yes | HH:MM, default `""` | Driver's preferred shift start time |
| earliestStartTime | String | Yes | HH:MM, default `""` | Earliest time the driver is available to start |
| latestFinishTime | String | Yes | HH:MM, default `""` | Latest time the driver may finish |
| preferredShiftHours | Float? | No | Decimal hours | Preferred number of working hours per shift |
| normalWorkingDays | Json? | No | Array of `mon`\|`tue`\|`wed`\|`thu`\|`fri`\|`sat`\|`sun` | Days the driver normally works |
| weekendAvailable | Boolean | Yes | Default: `false` | Whether the driver is available for weekend work |
| nightWorkAllowed | Boolean | Yes | Default: `false` | Whether the driver may be allocated night shifts |
| nightsOutAllowed | Boolean | Yes | Default: `false` | Whether the driver may work away overnight |
| overtimeAllowed | Boolean | Yes | Default: `false` | Whether the driver may work overtime |
| baseLocation | String | Yes | Free text, default `""` | Driver's usual depot or starting location |
| operatingArea | String | Yes | Free text, default `""` | Geographic area the driver normally covers |
| avoidAreas | String | Yes | Free text, default `""` | Areas or routes the driver should not be sent to |
| plannerNotes | String | Yes | Free text, default `""` | Internal planner notes about the driver |
| minHoursPerDay | Float | Yes | Default: 8 | Minimum contracted hours per working day |
| holidayAllowance | Int | Yes | Default: 28 | Annual holiday entitlement in days (may be overridden from company base) |
| holidayUsed | Int | Yes | Default: 0 | Days of holiday taken in the current holiday year |
| defaultTruckReg | String | Yes | Registration string, default `""` | Default truck registration assigned to this driver |
| defaultTruckClass | String | Yes | Free text, default `""` | Vehicle class of the default truck |
| defaultTrailerReg | String | Yes | Registration string, default `""` | Default trailer registration |
| defaultTrailerClass | String | Yes | Free text, default `""` | Trailer type of the default trailer |
| status | String | Yes | `active` \| `inactive` \| `suspended`, default `active` | Driver profile status |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## FleetUnit (trucks)

Table: `FleetUnit`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| registration | String | Yes | Vehicle registration plate | Vehicle registration number |
| vehicleClass | String | Yes | Free text (structured) | Canonical vehicle class (e.g. `CE`, `C`, `B`) |
| vehicleClassLegacy | String | Yes | Free text, default `""` | Legacy vehicle class string migrated from older data |
| bodyCategory | String | Yes | `van` \| `luton_van` \| `pickup` \| `rigid` \| `tractor` \| `drawbar` \| `heavy_haulage` \| `spmt` \| `plant`, default `""` | High-level body category (see `vehicleTaxonomy.ts` BODY_CATEGORIES) |
| gvwClass | String | Yes | `3.5t` \| `7.5t` \| `12t` \| `18t` \| `26t` \| `32t` \| `44t`, default `""` | Gross vehicle weight class |
| bodyType | String | Yes | `curtain_sider` \| `double_deck_curtain` \| `box` \| `double_deck_box` \| `panel` \| `luton` \| `sliding_tarp` \| `flatbed` \| `dropside` \| `extending_flat` \| `step_frame` \| `beavertail` \| `tipper` \| `bulk_tipper` \| `walking_floor` \| `ejector_trailer` \| `powder_tanker` \| `blower_tanker` \| `tanker_food` \| `tanker_fuel` \| `tanker_chemical` \| `tanker_water` \| `tanker_vacuum` \| `tanker_bitumen` \| `tanker_other` \| `fridge` \| `fridge_multi_temp` \| `fridge_pharma` \| `insulated` \| `skeletal_20` \| `skeletal_40` \| `skeletal_45` \| `skeletal_extending` \| `swap_body` \| `low_loader` \| `low_loader_extending` \| `modular_heavy` \| `girder_frame` \| `mixer` \| `concrete_pump` \| `hooklift` \| `skip_loader` \| `roro_lorry` \| `refuse` \| `other`, default `""` | Specific body type (see `vehicleTaxonomy.ts` BODY_TYPES) |
| onboardEquipment | Json? | No | String array | Equipment fitted to this unit (e.g. `tail_lift`, `hiab_crane`) |
| status | String | Yes | `available` \| `in_use` \| `off_road` \| `disposed`, default `available` | Current operational status |
| notes | String? | No | Free text | Maintenance notes or other remarks |
| assignedDriverId | Int? | No | FK → DriverProfile.id | Driver currently assigned to this unit |
| currentTrailerId | Int? | No | FK → FleetTrailer.id | Trailer currently coupled to this unit |
| yardLocation | String? | No | Free text | Current yard or bay location |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## FleetTrailer

Table: `FleetTrailer`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| registration | String | Yes | Vehicle registration plate | Trailer registration number |
| trailerType | String | Yes | Free text (structured) | Trailer type classification (e.g. `curtainsider`, `flatbed`, `fridge`) |
| bodyType | String | Yes | Free text, default `""` | Further body sub-type |
| trailerLength | String | Yes | Free text (e.g. `13.6m`), default `""` | Overall trailer length |
| decks | Int | Yes | Default: 1 | Number of load decks (1 = single deck, 2 = double deck / mega) |
| compartments | Int? | No | Integer | Number of separate compartments (tankers, fridges) |
| onboardEquipment | Json? | No | String array | Equipment on the trailer (e.g. `fridge_unit`, `load_straps`) |
| status | String | Yes | `available` \| `in_use` \| `off_road` \| `disposed`, default `available` | Current operational status |
| notes | String? | No | Free text | Maintenance notes or other remarks |
| attachedUnitId | Int? | No | FK → FleetUnit.id | Tractor unit this trailer is currently attached to |
| linkedJobId | Int? | No | FK → PlannedJob.id | Job this trailer is currently allocated to |
| yardLocation | String? | No | Free text | Current yard or bay location |
| loadStatus | String | Yes | `empty` \| `loaded_standing` \| `loaded_with_driver`, default `empty` | Standing load state — updated by execution events, never set manually |
| standingNote | String? | No | Free text | Note about what load the trailer is carrying while standing |
| standingRunId | Int? | No | FK → Run.id | Run that left the load standing on this trailer |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## SavedLocation

Table: `SavedLocation`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| name | String | Yes | Free text | Short internal identifier for the location (e.g. "Acme — Depot A") |
| siteName | String | Yes | Free text, default `""` | Full site or company name at this address |
| unitName | String | Yes | Free text, default `""` | Unit, building, or floor designation within the site |
| locationTextSnapshot | String | Yes | Free text, default `""` | Single-line human-readable address snapshot |
| street | String | Yes | Free text, default `""` | Street address line |
| town | String | Yes | Free text, default `""` | Town or city |
| postcode | String | Yes | Postcode string, default `""` | Royal Mail postcode |
| lat | Float? | No | Decimal degrees | Geographical latitude of the site (building centroid or entrance) |
| lng | Float? | No | Decimal degrees | Geographical longitude of the site |
| gateLat | Float? | No | Decimal degrees | Latitude of the specific truck gate / entrance point |
| gateLng | Float? | No | Decimal degrees | Longitude of the specific truck gate / entrance point |
| contactName | String | Yes | Free text, default `""` | Name of the on-site contact |
| contactPhone | String | Yes | Phone string, default `""` | Phone number for the on-site contact |
| instructions | String | Yes | Free text, default `""` | Gate codes, access instructions shown to the driver |
| internalNotes | String | Yes | Free text, default `""` | Internal planner notes — not shown to drivers |
| accessType | String | Yes | `unknown` \| `open` \| `restricted` \| `appointment_only`, default `unknown` | How vehicle access to the site is controlled |
| accessConfidence | String | Yes | `low` \| `medium` \| `high`, default `low` | Confidence level of the stored access information |
| driverReportCount | Int | Yes | Default: 0 | Count of driver-submitted reports about this location |
| issueFlags | Json? | No | Object of flag booleans | Known issues at the site (e.g. height restriction, difficult access) |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## JobTemplate

Table: `JobTemplate`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| name | String | Yes | Free text | Template name used in the planner UI |
| pickupLocationId | Int? | No | FK → SavedLocation.id | Default collection location |
| dropoffLocationId | Int? | No | FK → SavedLocation.id | Default delivery location |
| pickupTextSnapshot | String | Yes | Free text, default `""` | Cached one-line text of the pickup location |
| dropoffTextSnapshot | String | Yes | Free text, default `""` | Cached one-line text of the dropoff location |
| defaultReference | String | Yes | Free text, default `""` | Default job reference prefix or value |
| defaultNotes | String | Yes | Free text, default `""` | Notes pre-populated when a job is created from this template |
| defaultMaterialType | String | Yes | Free text, default `""` | Default material description |
| trailerTypesAllowed | Json? | No | String array | Trailer types permitted for jobs based on this template |
| defaultStops | Json? | No | Array of stop objects | Default stop configuration for the template |
| defaultLoadDetails | Json? | No | LoadDetails object | Default load details for the template |
| defaultJobData | Json? | No | Arbitrary job field overrides | Miscellaneous default field values for the job |
| qualityScore | Int | Yes | 0–100, default 0 | Automated completeness / quality score for the template |
| status | String | Yes | `active` \| `archived`, default `active` | Template status |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## PlannedJob

Table: `PlannedJob`

The internal `CreateJobPage` form writes all columns marked "Yes (form)" below. Columns marked "form-hidden" are still in the DB for historical / migration data but are no longer set by the internal job creation form.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| customerId | Int? | No | FK → Customer.id | Customer this job is for |
| customerName | String | Yes | Free text, default `""` | Denormalised customer name (snapshot at job creation) |
| templateId | Int? | No | FK → JobTemplate.id | Template this job was created from (if any) |
| createdByUserId | Int | Yes | FK → User.id | User who created the job |
| plannedDate | DateTime? | No | ISO 8601 date | Date the job is planned for |
| jobReference | String? | No | Unique per company, e.g. `LB-2026-001` | Human-readable sequential job reference (generated server-side) |
| materialType | String | Yes | Free text, default `""` | Short description of the goods being transported (denormalised from LoadDetails) |
| quantityExpected | String | Yes | Free text, default `""` | Expected quantity of goods (denormalised from LoadDetails) |
| quantityUnit | String | Yes | Free text, default `""` | Unit for the expected quantity (denormalised from LoadDetails) |
| plannerNotes | String | Yes | Free text, default `""` | Internal notes visible to the planner only |
| jobType | String | Yes | `ftl` \| `ltl` \| `groupage` \| `multi_drop` \| `multi_collection` \| `milk_run` \| `return_load` \| `trunking` \| `shunt` \| `pallet_network` \| `fcl` \| `lcl` \| `sameday_express` \| `abnormal` \| `subcontracted`, default `""` | Load / service type classification (see `vehicleTaxonomy.ts` JOB_TYPES) |
| jobTitle | String | Yes | Free text, default `""` | Optional short human-readable job title shown in lists and notifications |
| reqBodyCategory | String | Yes | `van` \| `luton_van` \| `pickup` \| `rigid` \| `tractor` \| `drawbar` \| `heavy_haulage` \| `spmt` \| `plant`, default `""` | Required vehicle body category (same canonical values as `FleetUnit.bodyCategory`) |
| reqGvwMin | String | Yes | `3.5t` \| `7.5t` \| `12t` \| `18t` \| `26t` \| `32t` \| `44t`, default `""` | Minimum GVW required |
| reqBodyType | String | Yes | Same canonical values as `FleetUnit.bodyType` — see above | Required body type |
| reqEquipment | Json? | No | String array | Required onboard equipment (e.g. `tail_lift`, `hiab_crane`) |
| reqLicenceClass | String | Yes | Licence category string, default `""` | Minimum driver licence class required |
| trailerTypesAllowed | Json? | No | String array | Trailer types permitted for this job |
| priority | String | Yes | `low` \| `normal` \| `high` \| `urgent`, default `normal` | Job planning priority |
| serviceType | String | Yes | `delivery` \| `collection` \| `collection_delivery` \| `transfer` \| `trunking` \| `sameday` \| `next_day` \| `economy` \| `last_mile` \| `first_mile` \| `drayage` \| `container_haulage` \| `intermodal` \| `cross_dock` \| `warehousing` \| `returns` \| `abnormal` \| `removals` \| `courier`, default `""` | Service classification (see `vehicleTaxonomy.ts` SERVICE_TYPES) |
| customerRef | String | Yes | Free text, default `""` | Customer's own reference number |
| purchaseOrderNumber | String | Yes | Free text, default `""` | Customer's purchase order number |
| billingNotes | String | Yes | Free text, default `""` | Notes relevant to invoicing |
| customerInstructions | String | Yes | Free text, default `""` | Instructions passed directly from the customer |
| bookingContactName | String | Yes | Free text, default `""` | Name of the contact for booking queries |
| bookingContactPhone | String | Yes | Phone string, default `""` | Phone for booking queries |
| bookingContactEmail | String | Yes | Email string, default `""` | Email for booking queries |
| custRefRequired | Boolean | Yes | Default: `false` | Whether a customer reference must be captured before completion |
| poRequired | Boolean | Yes | Default: `false` | Whether a PO number must be captured before completion |
| minVehicleSize | String | Yes | Free text, default `""` | Minimum vehicle size description |
| trailerTypesForbidden | Json? | No | String array | Trailer types that may NOT be used for this job |
| equipmentRequired | Json? | No | String array | Equipment required (structured version — supplements reqEquipment) |
| driverQualificationsReq | Json? | No | String array | Driver certifications required (e.g. `adr`, `hiab`) |
| lengthRestriction | String | Yes | Free text (e.g. `18m`), default `""` | Length restriction applying to this job |
| vehicleAccessNotes | String | Yes | Free text, default `""` | General vehicle access notes |
| failureAction | String | Yes | `call_assistance` \| `return_to_depot` \| `wait` \| `other`, default `call_assistance` | What the driver should do if the job cannot be completed |
| assistancePhone | String | Yes | Phone string, default `""` | Phone number to call for assistance on failure |
| assistanceNote | String | Yes | Free text, default `""` | Instructions to include when calling for assistance |
| internalNotes | String | Yes | Free text, default `""` | Internal notes not visible to the driver |
| notesData | Json? | No | See **PlannedJob — notesData blob** below | Driver-facing notes blob. Set by the internal `CreateJobPage` form and also pre-populated on accept from `JobRequest.notesData`. |
| exceptionPolicyData | Json? | No | See **PlannedJob — exceptionPolicyData blob** below | Rejection and return policy blob. Set by the internal `CreateJobPage` form and also pre-populated on accept from `JobRequest.exceptionPolicyData`. |
| loadData | Json? | No | See **PlannedJob — loadData blob** below | Type-specific goods sub-fields (pallet type/count, cage count, etc.). Populated on accept from `JobRequest.loadData`. Not set by the internal `CreateJobPage` form (form-hidden). |
| billingData | Json? | No | See **PlannedJob — billingData blob** below | Billing fields (declared value, billing reference, VAT). Populated on accept from `JobRequest.billingData`. Not set by the internal `CreateJobPage` form (form-hidden). |
| validationStatus | String | Yes | `draft` \| `ready_for_planner` \| `validated` \| `issues_found`, default `draft` | Planner-side validation state |
| qualityScore | Int | Yes | 0–100, default 0 | Automated completeness / quality score |
| status | String | Yes | `draft` \| `in_progress` \| `completed` \| `cancelled`, default `draft` | Current execution status |
| requirePOD | Boolean | Yes | Default: `false` | Whether a proof-of-delivery must be captured |
| canSplitShipment | String | Yes | `must_stay_together` \| `can_split_partially` \| `can_split_freely`, default `must_stay_together` | Whether the shipment can be split across multiple vehicles |
| overrideClosed | Boolean | Yes | Default: `false` | Set by planner to confirm a quantity mismatch and force-close the job |
| overrideReason | String? | No | Free text | Reason given by planner for the quantity override |
| overrideNotes | String? | No | Free text | Additional notes on the override decision |
| overrideQuantityDelivered | Decimal? | No | Positive number | Planner-confirmed quantity actually delivered (set on override close) |
| overrideQuantityShortfall | Decimal? | No | Positive number | Planner-confirmed quantity shortfall (set on override close) |
| closedAt | DateTime? | No | ISO 8601 | Timestamp when the job was force-closed via override |
| closedBy | Int? | No | FK → User.id | User who performed the override close |
| vehicleRequirementSource | String | Yes | `not_specified` \| `customer_specified` \| `derived` \| `planner_override`, default `not_specified` | How the vehicle requirement was determined |
| trailerRequirementSource | String | Yes | `not_specified` \| `customer_specified` \| `derived` \| `planner_override`, default `not_specified` | How the trailer requirement was determined |
| customerVehicleType | String? | No | Free text | Vehicle type as specified by the customer (raw) |
| customerTrailerTypes | Json? | No | String array | Trailer types as specified by the customer (raw) |
| derivedVehicleType | String? | No | Free text | Vehicle type derived automatically from load data |
| derivedTrailerTypes | Json? | No | String array | Trailer types derived automatically from load data |
| finalVehicleType | String? | No | Free text | Final resolved vehicle type used for planning |
| finalTrailerTypes | Json? | No | String array | Final resolved trailer types used for planning |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## PlannedJob — notesData blob

Stored in `PlannedJob.notesData` (Json?). Set by the internal `CreateJobPage` form and pre-populated when a `JobRequest` is accepted.

> Note: `driverNoteChips`, `driverVisibleNotes`, and `safetyInstructions` are written by the internal `CreateJobPage` form. These fields are **not** on the public `PublicRequestForm` — they come to `PlannedJob` only via accept from `JobRequest.notesData` (where the planner adds them during review).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| driverNoteChips | String[]? | No | `call_before_arrival` \| `report_to_security` \| `use_rear_entrance` \| `ppe_required` \| `bring_straps` \| `bring_pump_truck` \| `do_not_arrive_early` | Quick-select instruction chips shown to the driver |
| driverVisibleNotes | String? | No | Free text | Free-text instructions the driver must read before the job |
| safetyInstructions | String? | No | Free text | Safety information (COSHH, hazard warnings, PPE requirements) |

---

## PlannedJob — exceptionPolicyData blob

Stored in `PlannedJob.exceptionPolicyData` (Json?). Set by the internal `CreateJobPage` form (rejection policy section) and pre-populated when a `JobRequest` is accepted.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| rejectionAction | String? | No | `call_office_before_leaving` \| `return_to_collection_point` \| `deliver_to_alternative_address` \| `wait_for_further_instruction` \| `do_not_return_without_approval` \| `other` | What the driver should do if the delivery is refused at the door |
| alternativeReturnAddress | String? | No | Free text | Street address of the alternative delivery location (only when rejectionAction = `deliver_to_alternative_address`) |
| alternativeReturnPostcode | String? | No | Postcode string | Postcode of the alternative delivery address |
| alternativeReturnContactName | String? | No | Free text | Contact name at the alternative address |
| alternativeReturnContactPhone | String? | No | Phone string | Contact phone at the alternative address |
| approvalContactName | String? | No | Free text | Name of the person to call for approval before leaving |
| approvalContactPhone | String? | No | Phone string | Phone of the approval contact |
| photosRequiredOnRejection | Boolean? | No | `true` \| `false` | Whether the driver must take photos if rejected |
| rejectionSignatureRequired | Boolean? | No | `true` \| `false` | Whether the driver must obtain a signature from the refusing party |
| rejectionNotes | String? | No | Free text | Additional instructions for rejection / return situations |

---

## PlannedJob — loadData blob

Stored in `PlannedJob.loadData` (Json?). Populated on accept from `JobRequest.loadData`. **Not** set by the internal `CreateJobPage` form (that form writes to the separate `LoadDetails` table instead). Sub-field shape is identical to `JobRequest.loadData` — see that section for full field documentation.

| Field | Type | Values / Format | Description |
|---|---|---|---|
| goodsType | String? | `pallets` \| `roll_cages` \| `machinery` \| `building_materials` \| `food_refrigerated` \| `bulk_material` \| `liquid_bulk` \| `steel_long` \| `vehicles` \| `containers` \| `general` \| `other` | High-level category of goods |
| goodsDescription | String? | Free text | Detailed description of what is being transported |
| quantity | Number? | Positive number | Quantity of goods |
| unit | String? | `pallets` \| `tonnes` \| `kg` \| `bags` \| `items` \| `loads` \| `litres` \| `cubic_metres` \| `other` | Unit of measure |
| estimatedWeight | Number? | Positive number (kg) | Estimated total weight |
| canSplitShipment | String? | `must_stay_together` \| `can_split_partially` \| `can_split_freely` | Whether the shipment can be split |
| securingRequirements | String[]? | See `JobRequest.loadData.securingRequirements` | Load securing equipment or methods required |
| *(all other sub-fields)* | | | All remaining sub-fields are identical to `JobRequest.loadData` — refer to that section |

---

## PlannedJob — billingData blob

Stored in `PlannedJob.billingData` (Json?). Populated on accept from `JobRequest.billingData`. **Not** set by the internal `CreateJobPage` form. Sub-field shape is identical to `JobRequest.billingData` — see that section for full field documentation.

| Field | Type | Values / Format | Description |
|---|---|---|---|
| declaredGoodsValue | Number? | Positive number (GBP) | Declared value of the goods for insurance / risk purposes |
| currency | String? | ISO 4217 code (e.g. `GBP`) | Currency of the declared value |
| purchaseOrderNumber | String? | Free text | Customer's purchase order number |
| billingReference | String? | Free text | Customer's billing reference or cost centre code |
| vatRegistered | Boolean? | `true` \| `false` | Whether the customer is VAT registered |
| vatNumber | String? | Free text | Customer's VAT registration number |

---

## JobPart (stops)

Table: `JobPart` (previously named `JobStop` — all references to `JobStop` are stale)

One row per physical piece of work on a job (collection, delivery, etc.). Multiple `JobPart` rows belong to a single `PlannedJob`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| jobId | Int | Yes | FK → PlannedJob.id | Parent job |
| sequenceNumber | Int | Yes | Positive integer, unique per job | Order of this stop within the job's route |
| type | String | Yes | `collection` \| `delivery` \| `reload` \| `return` \| `waypoint` \| `other` | Stop category |
| savedLocationId | Int? | No | FK → SavedLocation.id | Link to a saved location record (optional) |
| siteName | String | Yes | Free text, default `""` | Site or company name at this stop |
| unitName | String | Yes | Free text, default `""` | Unit or building name within the site |
| street | String | Yes | Free text, default `""` | Street address line |
| town | String | Yes | Free text, default `""` | Town or city |
| postcode | String | Yes | Postcode string, default `""` | Royal Mail postcode |
| addressLine2 | String | Yes | Free text, default `""` | Second address line |
| countyRegion | String | Yes | Free text, default `""` | County or region |
| country | String | Yes | Default: `United Kingdom` | Country |
| locationTextSnapshot | String | Yes | Free text, default `""` | Single-line address snapshot for display |
| lat | Float? | No | Decimal degrees | Latitude of the stop entrance |
| lng | Float? | No | Decimal degrees | Longitude of the stop entrance |
| gateLat | Float? | No | Decimal degrees | Gate-specific latitude |
| gateLng | Float? | No | Decimal degrees | Gate-specific longitude |
| coordinateVerified | Boolean | Yes | Default: `false` | Whether the coordinates have been manually verified by a planner |
| timeWindowStart | DateTime? | No | ISO 8601 datetime | Earliest acceptable arrival datetime |
| timeWindowEnd | DateTime? | No | ISO 8601 datetime | Latest acceptable arrival datetime |
| bookedTime | DateTime? | No | ISO 8601 datetime | Exact booked appointment time |
| earliestArrivalMinutes | Int? | No | Minutes from shift start | Earliest arrival expressed as minutes from shift start |
| unloadingAllowanceMinutes | Int? | No | Minutes | Estimated time allowed for loading/unloading at this stop |
| standingChargeNote | String | Yes | Free text, default `""` | Note relating to any standing charge at this stop |
| contactName | String | Yes | Free text, default `""` | On-site contact name |
| contactPhone | String | Yes | Phone string, default `""` | On-site contact phone |
| contactEmail | String | Yes | Email string, default `""` | On-site contact email |
| referenceNumber | String | Yes | Free text, default `""` | Collection or delivery reference number the driver presents |
| bookingRequired | Boolean | Yes | Default: `false` | Whether a booking must be made before arriving |
| bookingRef | String | Yes | Free text, default `""` | Booking reference if bookingRequired is true |
| openingHours | String | Yes | Free text (e.g. `Mon–Fri 06:00–18:00`), default `""` | Site opening hours |
| instructions | String | Yes | Free text, default `""` | General instructions for the driver at this stop |
| navigationInstructions | String | Yes | Free text, default `""` | Entrance / navigation instructions shown to driver |
| locationType | String | Yes | `warehouse` \| `depot` \| `site` \| `retail` \| `residential` \| `port` \| `airport` \| `other`, default `""` | Type of site |
| numPallets | Int? | No | Integer | **Legacy field** — pallet count at this stop. Kept for mobile app compatibility; new submissions use `quantityRequired` instead |
| quantityRequired | Decimal? | No | Positive number | Quantity required at this stop (replaces legacy `numPallets`) |
| quantityUnit | String | Yes | Free text, default `""` | Unit of measure for `quantityRequired` |
| quantityCollected | Decimal | Yes | Default: 0 | Quantity confirmed as collected at this stop (updated by execution events) |
| quantityDelivered | Decimal | Yes | Default: 0 | Quantity confirmed as delivered at this stop (updated by execution events) |
| proofRequirements | Json? | No | `signature_required` \| `photos_required` \| `pod_required` \| `weighbridge_ticket_required` \| `seal_number_required` \| `name_required` | Proof documents or signatures required at this stop |
| accessRequirements | Json? | No | `narrow_road` \| `height_restriction` \| `weight_restriction` \| `length_restriction` \| `no_artic_access` \| `no_trailer_access` \| `residential_area` \| `security_checkin` \| `ppe_required` \| `ppe_safety_boots` \| `ppe_hi_vis` \| `ppe_hard_hat` \| `ppe_gloves` \| `ppe_glasses` \| `driver_id_required` \| `do_not_arrive_early` \| `holding_area_required` \| `port_access` \| `airport_access` | Site access constraints. `ppe_required` is the top-level flag; the `ppe_*` sub-items record which specific PPE is needed. |
| handlingMethods | Json? | No | `forklift` \| `loading_bay` \| `hiab` \| `moffett` \| `tail_lift` \| `pump_truck` \| `handball` \| `overhead_crane` \| `magnetic_crane` \| `side_loading` \| `roro` \| `tipper_discharge` \| `grab` \| `pump_discharge` \| `walking_floor` \| `conveyor` \| `other` (or `other: <description>` when free-text is provided) | Methods used to load or unload the vehicle at this stop |
| exchangeDropQty | Decimal? | No | Positive number | Number of full units to drop at this stop as part of an equipment exchange |
| exchangeCollectQty | Decimal? | No | Positive number | Number of empty units to collect back as part of an equipment exchange |
| exchangeUnit | String | Yes | `pallets` \| `roll_cages` \| `stillages` \| `ibc_tanks` \| `other`, default `""` | Type of equipment being exchanged |
| loadReadiness | String | Yes | `ready_now` \| `ready_at_booked_time` \| `still_being_prepared` \| `unsure`, default `""` | Whether the load will be ready when the driver arrives (collection stops) |
| stopGoodsType | String? | No | Free text | Type of goods being handled at this specific stop (drives trailer compatibility checks) |
| stopWeight | Decimal? | No | Positive number (kg) | Weight of the goods at this specific stop |
| temperatureControlled | Boolean | Yes | Default: `false` | Whether the goods at this stop require temperature control |
| temperatureRange | String? | No | Free text (e.g. `2°C – 8°C`) | Required temperature range if temperature-controlled |
| hazardous | Boolean | Yes | Default: `false` | Whether the goods at this stop are hazardous |
| hazardClass | String? | No | ADR class string (e.g. `Class 3`) | ADR hazard class for the goods at this stop |
| oversized | Boolean | Yes | Default: `false` | Whether the load at this stop is oversized |
| heightRestriction | String | Yes | Free text (e.g. `4.2m`), default `""` | Height restriction at this specific stop |
| weightRestriction | String | Yes | Free text (e.g. `7.5t`), default `""` | Weight restriction at this specific stop |
| internalNotes | String | Yes | Free text, default `""` | Internal notes not shown to the driver |
| stopNotes | String | Yes | Free text, default `""` | Notes specific to this stop visible to the driver (e.g. partial loads, bay numbers, wait instructions) |
| status | String | Yes | `pending` \| `arrived` \| `completed` \| `skipped`, default `pending` | Execution status of this stop |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## LoadDetails

Table: `LoadDetails`

One-to-one with `PlannedJob`. Written by the internal `CreateJobPage` form. Separate from `PlannedJob.loadData` — the internal form writes this table, while `loadData` is a blob copied from `JobRequest.loadData` on accept.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| jobId | Int | Yes | FK → PlannedJob.id (unique) | Parent job (one-to-one) |
| quantity | Float? | No | Decimal | Number of items / units |
| unit | String | Yes | Free text, default `""` | Unit of measure (e.g. pallets, tonnes) |
| weight | Float? | No | Decimal (kg) | Total load weight in kilograms |
| volume | Float? | No | Decimal (m³) | Total load volume in cubic metres |
| materialType | String | Yes | Free text, default `""` | Description of the goods / material |
| hazardClass | String | Yes | ADR class string, default `""` | ADR hazard class if applicable |
| notes | String | Yes | Free text, default `""` | Load-specific notes |
| dimensions | String | Yes | Free text (e.g. `4.5m × 2.2m × 3.1m`), default `""` | Overall load dimensions |
| fragile | Boolean | Yes | Default: `false` | Whether the load is fragile |
| stackable | Boolean | Yes | Default: `false` | Whether items can be stacked |
| tempControlled | Boolean | Yes | Default: `false` | Whether temperature control is required |
| tempRange | String | Yes | Free text (e.g. `2°C – 8°C`), default `""` | Required temperature range |
| goodsType | String | Yes | Free text (e.g. `pallets`, `general`, `machinery`), default `""` | High-level goods category — mirrors `JobRequest.loadData.goodsType` |
| securingRequirements | Json? | No | String array | Load securing equipment or methods required (e.g. `straps_required`, `chains_required`) |
| specialRequirements | Json? | No | String array | Special requirement flags (e.g. `fragile`, `high_value`, `oversized`, `dangerous_goods`) |
| photosRequired | Boolean | Yes | Default: `false` | Whether photographic proof is required |
| weighbridgeRequired | Boolean | Yes | Default: `false` | Whether a weighbridge ticket must be obtained |
| forkliftRequired | Boolean | Yes | Default: `false` | Whether a forklift is needed |
| tailLiftRequired | Boolean | Yes | Default: `false` | Whether a tail lift is needed |
| craneRequired | Boolean | Yes | Default: `false` | Whether a crane is required |
| loadingMethod | String | Yes | Free text, default `""` | How the load will be loaded |
| unloadingMethod | String | Yes | Free text, default `""` | How the load will be unloaded |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## Run

Table: `Run`

Execution container for a driver's day. Independent of individual jobs — jobs are linked via `RunAssignment`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| runReference | String | Yes | Unique per company (e.g. `RUN-2026-001`) | Human-readable sequential run reference |
| status | String | Yes | `draft` \| `published` \| `in_progress` \| `completed` \| `cancelled`, default `draft` | Current run status |
| assignedDriverId | Int? | No | FK → DriverProfile.id | Driver assigned to this run |
| assignedTruckId | Int? | No | FK → FleetUnit.id | Truck assigned to this run |
| assignedTrailerId | Int? | No | FK → FleetTrailer.id | Trailer assigned to this run |
| plannedDate | DateTime? | No | ISO 8601 date | Date the run is planned for |
| estimatedStartTime | String? | No | HH:MM | Estimated start time |
| estimatedEndTime | String? | No | HH:MM | Estimated end time |
| actualStartTime | DateTime? | No | ISO 8601 | Actual start time recorded by driver |
| actualEndTime | DateTime? | No | ISO 8601 | Actual end time recorded by driver |
| publishedToDriver | Boolean | Yes | Default: `false` | Whether this run has been published to the driver's app |
| plannerNotes | String? | No | Free text | Internal planner notes for this run |
| endInstruction | String? | No | `drop_trailer_at_base` \| `stay_with_trailer` \| `none` | What to do with the trailer at the end of the run |
| endInstructionNote | String? | No | Free text | Additional note for the end instruction |
| returnToBase | Boolean | Yes | Default: `false` | Whether the driver is expected to return to base after the run |
| returnToBaseNote | String? | No | Free text | Instructions for returning to base |
| returningAt | DateTime? | No | ISO 8601 | Estimated time the driver will arrive back at base |
| arrivedBaseAt | DateTime? | No | ISO 8601 | Actual time the driver arrived back at base |
| requiredTrailerType | String? | No | Free text | Trailer type required — derived from the jobs on this run |
| requiredEquipment | Json? | No | String array | Equipment required — derived from the jobs on this run |
| maxLoadWeight | Decimal? | No | Positive number (kg) | Maximum load weight across all job stops on this run |
| hasHazardous | Boolean | Yes | Default: `false` | Whether any job stop on this run has hazardous goods |
| hasTemperatureLoad | Boolean | Yes | Default: `false` | Whether any job stop on this run requires temperature control |
| hasOversized | Boolean | Yes | Default: `false` | Whether any job stop on this run has an oversized load |
| trailerCompatible | Boolean | Yes | Default: `true` | Whether the assigned trailer is compatible with all jobs on this run |
| vehicleCompatible | Boolean | Yes | Default: `true` | Whether the assigned vehicle is compatible with all jobs on this run |
| compatibilityOverridden | Boolean | Yes | Default: `false` | Whether a compatibility warning has been manually overridden by a planner |
| compatibilityOverrideReason | String? | No | Free text | Reason provided by the planner for overriding a compatibility warning |
| createdBy | Int | Yes | FK → User.id | User who created this run |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## RunAssignment

Table: `RunAssignment`

Bridge between a `JobPart` (stop) and a `Run`. A job stop can be assigned to one active run at a time; removing an assignment sets `removedAt`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| runId | Int | Yes | FK → Run.id | Run this assignment belongs to |
| jobPartId | Int | Yes | FK → JobPart.id | The specific job stop assigned to the run |
| jobId | Int | Yes | FK → PlannedJob.id | Parent job of the stop (denormalised for query efficiency) |
| sequenceNumber | Int | Yes | Positive integer, unique per run | Order of this stop within the run's route |
| quantityAssigned | Decimal | Yes | Default: 0 | Quantity allocated for this stop on this run |
| quantityUnit | String | Yes | Free text, default `""` | Unit of measure for the assigned quantity |
| status | String | Yes | `pending` \| `arrived` \| `completed` \| `skipped`, default `pending` | Execution status of this assignment |
| addedAt | DateTime | Yes | ISO 8601, default now | When this stop was added to the run |
| addedBy | Int | Yes | FK → User.id | User who added the stop to the run |
| removedAt | DateTime? | No | ISO 8601 | When this stop was removed from the run (null = still active) |
| removedBy | Int? | No | FK → User.id | User who removed the stop from the run |
| removalReason | String? | No | Free text | Reason for removing the stop |
| notes | String? | No | Free text | Assignment-level notes |

---

## LoadTrack

Table: `LoadTrack`

Append-only immutable custody ledger. Every load movement (collect, deliver, transfer) creates one row. Rows are **never** updated or deleted.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| jobId | Int | Yes | FK → PlannedJob.id | Job this track entry belongs to |
| jobPartId | Int | Yes | FK → JobPart.id | Specific stop this track entry relates to |
| runId | Int? | No | FK → Run.id | Run during which this movement occurred |
| runAssignmentId | Int? | No | FK → RunAssignment.id | Run assignment for this movement |
| eventId | Int | Yes | FK → JobExecutionEvent.id | Execution event that triggered this entry |
| transactionType | String | Yes | Free text (e.g. `collect`, `deliver`, `transfer`) | Type of custody transaction |
| quantity | Decimal | Yes | Positive number | Quantity moved in this transaction |
| unit | String | Yes | Free text, default `""` | Unit of measure |
| fromCustody | String | Yes | Free text (e.g. `customer`, `driver:<id>`, `depot`) | Custody holder before this transaction |
| toCustody | String | Yes | Free text | Custody holder after this transaction |
| driverId | Int? | No | FK → User.id | Driver who performed the movement |
| trailerId | String | Yes | Registration string, default `""` | Trailer on which the load was moved |
| timestamp | DateTime | Yes | ISO 8601 | Client-reported timestamp of the movement |
| serverReceivedAt | DateTime | Yes | ISO 8601, default now | Time the server received the event |
| gpsLat | Float? | No | Decimal degrees | GPS latitude at the time of the movement |
| gpsLng | Float? | No | Decimal degrees | GPS longitude at the time of the movement |
| notes | String? | No | Free text | Notes attached to this transaction |

---

## JobExecutionEvent

Table: `JobExecutionEvent`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| jobId | Int | Yes | FK → PlannedJob.id | Job the event relates to |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverId | Int | Yes | FK → User.id | Driver who raised the event |
| eventType | String | Yes | `started` \| `arrived_pickup` \| `collected` \| `arrived_dropoff` \| `completed` \| `cancelled` \| `note_added` | Type of execution event |
| note | String | Yes | Free text, default `""` | Optional driver note attached to the event |
| clientEventId | String | Yes | Unique per company; UUID / device-generated | Idempotency key from the driver's device |
| clientTimestamp | DateTime | Yes | ISO 8601 | Timestamp recorded on the driver's device |
| serverReceivedAt | DateTime | Yes | ISO 8601, default now | Time the server received the event |
| appVersion | String? | No | Semver string | Mobile app version that raised the event |
| gpsLat | Float? | No | Decimal degrees | GPS latitude at the time of the event |
| gpsLng | Float? | No | Decimal degrees | GPS longitude at the time of the event |
| needsReview | Boolean | Yes | Default: `false` | Flagged for planner review (e.g. suspicious GPS, timing anomaly) |
| reviewReason | String? | No | Free text | Reason why the event was flagged for review |
| runId | Int? | No | FK → Run.id | Run during which this event occurred (null for pre-Run historical events) |
| runAssignmentId | Int? | No | FK → RunAssignment.id | Assignment this event relates to (null for historical events) |
| jobPartId | Int? | No | FK → JobPart.id | Stop this event relates to (null for historical events) |
| quantityConfirmed | Decimal? | No | Positive number | Quantity confirmed by the driver at this event |
| fromCustody | String? | No | Free text | Custody holder before this event (for load transfer events) |
| toCustody | String? | No | Free text | Custody holder after this event (for load transfer events) |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |

---

## JobAudit

Table: `JobAudit`

Job-specific append-only audit log. For all other entity types use `AuditLog`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| jobId | Int | Yes | FK → PlannedJob.id | Job this audit entry belongs to |
| changedBy | Int? | No | FK → User.id | User who made the change (null = system) |
| action | String | Yes | `created` \| `updated` \| `deleted` \| `status_change` | Type of change |
| field | String | Yes | Column or field name, default `""` | Specific field name for update events; empty for whole-record actions |
| oldValue | Json? | No | Any | Previous value before the change |
| newValue | Json? | No | Any | New value after the change |
| createdAt | DateTime | Yes | ISO 8601 | Timestamp of the action |

---

## Shift / ShiftSegment / DeliveryTask

### Shift

Table: `Shift`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverId | Int | Yes | FK → User.id | Driver this shift belongs to |
| driverName | String | Yes | Free text | Snapshot of driver name at shift creation |
| shiftDate | DateTime | Yes | ISO 8601 date, default now | Date of the shift |
| oilWaterChecked | Boolean | Yes | Default: `false` | Whether daily oil/water checks were completed |
| fuelDrawn | String | Yes | Free text (litres or amount), default `""` | Fuel drawn at start of shift |
| adBlueDrawn | String | Yes | Free text, default `""` | AdBlue drawn at start of shift |
| startTime | String | Yes | HH:MM, default `""` | Shift start time |
| endTime | String | Yes | HH:MM, default `""` | Shift end time |
| totalHours | String | Yes | Decimal hours as string, default `""` | Total hours worked |
| breakMins | String | Yes | Minutes as string, default `""` | Total break time in minutes |
| poaMins | String | Yes | Minutes as string, default `""` | Total POA (period of availability) minutes |
| nightOut | Boolean | Yes | Default: `false` | Whether the driver stayed overnight away from base |
| expenses | String | Yes | Free text / amount, default `""` | Expenses claimed during the shift |
| delaysNote | String | Yes | Free text, default `""` | Notes about delays encountered |
| defectsNote | String | Yes | Free text, default `""` | Notes about vehicle defects found |
| status | String | Yes | `draft` \| `submitted` \| `approved` \| `rejected`, default `draft` | Shift record status |
| submittedAt | DateTime? | No | ISO 8601 | Timestamp when the driver submitted the shift |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

### ShiftSegment

Table: `ShiftSegment`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| shiftId | Int | Yes | FK → Shift.id | Parent shift |
| segmentNumber | Int | Yes | Positive integer | Order of this segment within the shift |
| vehicleClass | String | Yes | `tractor` \| `rigid` \| `van` \| other, default `tractor` | Class of vehicle used in this segment |
| truckReg | String | Yes | Registration string | Truck registration for this segment |
| trailerReg | String? | No | Registration string | Trailer registration for this segment |
| odometerStart | Int | Yes | Kilometres or miles (integer) | Odometer reading at segment start |
| odometerEnd | Int? | No | Kilometres or miles (integer) | Odometer reading at segment end |
| startTime | DateTime | Yes | ISO 8601 | Segment start time |
| endTime | DateTime? | No | ISO 8601 | Segment end time |
| needsTruckCheck | Boolean | Yes | Default: `true` | Whether a truck safety check was required |
| needsTrailerCheck | Boolean | Yes | Default: `true` | Whether a trailer safety check was required |
| truckChecks | Json | Yes | Object of check item results | Results of the truck walkaround check |
| trailerChecks | Json? | No | Object of check item results | Results of the trailer walkaround check |
| notes | String | Yes | Free text, default `""` | Segment-level notes |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

### DeliveryTask

Table: `DeliveryTask`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| shiftId | Int | Yes | FK → Shift.id | Parent shift |
| segmentId | Int | Yes | FK → ShiftSegment.id | Parent segment |
| materials | String | Yes | Free text, default `""` | Description of the materials transported |
| collectFrom | String | Yes | Free text, default `""` | Collection location description |
| deliverTo | String | Yes | Free text, default `""` | Delivery location description |
| ticketNo | String | Yes | Free text, default `""` | Weighbridge ticket, delivery note, or job ticket number |
| startTime | String | Yes | HH:MM or free text, default `""` | Task start time |
| finishTime | String | Yes | HH:MM or free text, default `""` | Task finish time |
| hours | String | Yes | Decimal hours as string, default `""` | Hours taken for this task |
| loadType | String | Yes | `weight` \| `pallets` \| `other`, default `weight` | How the load quantity is measured |
| pallets | String | Yes | Integer as string, default `""` | Number of pallets (when loadType = pallets) |
| mileage | String | Yes | Miles/km as string, default `""` | Distance driven for this task |
| tonnes | String | Yes | Decimal as string, default `""` | Weight in tonnes |
| kgs | String | Yes | Decimal as string, default `""` | Weight in kilograms |
| notes | String | Yes | Free text, default `""` | Task-level notes |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## HolidayRequest / DriverAvailability

### HolidayRequest

Table: `HolidayRequest`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverProfileId | Int | Yes | FK → DriverProfile.id | Driver making the request |
| startDate | DateTime | Yes | ISO 8601 date | First day of the requested holiday |
| endDate | DateTime | Yes | ISO 8601 date | Last day of the requested holiday |
| totalDays | Int | Yes | Positive integer | Number of holiday days requested (excluding non-working days) |
| reason | String | Yes | Free text, default `""` | Driver's stated reason for the holiday |
| note | String | Yes | Free text, default `""` | Additional note from the driver |
| status | String | Yes | `pending` \| `approved` \| `rejected` \| `cancelled`, default `pending` | Request status |
| plannerNote | String | Yes | Free text, default `""` | Planner's note on their decision |
| approvedById | Int? | No | FK → User.id | User who approved or rejected the request |
| approvedAt | DateTime? | No | ISO 8601 | Timestamp of the approval/rejection decision |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

### DriverAvailability

Table: `DriverAvailability`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverProfileId | Int | Yes | FK → DriverProfile.id | Driver this record belongs to |
| weekStartDate | DateTime | Yes | ISO 8601 date (Monday) | Monday of the week this availability covers |
| monPref–sunPref | String | Yes each | `normal` \| `early` \| `late` \| `unavailable` (weekdays default `normal`, weekend default `unavailable`) | Availability preference for each day of the week |
| monNote–sunNote | String | Yes each | Free text, default `""` | Optional note for each day |
| status | String | Yes | `draft` \| `submitted` \| `approved`, default `draft` | Submission status |
| submittedAt | DateTime? | No | ISO 8601 | When the driver submitted this week's availability |
| approvedAt | DateTime? | No | ISO 8601 | When the planner approved it |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## SyncEventLog

Table: `SyncEventLog`

Records every inbound event from the mobile sync API, including failures, for debugging and replay.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| clientEventId | String | Yes | UUID / device-generated | Device-side idempotency key |
| eventType | String | Yes | Free text | Type of sync event |
| status | String | Yes | `ok` \| `failed` \| `duplicate` | Processing outcome |
| failureReason | String? | No | Free text | Reason for failure if status = `failed` |
| rawPayload | Json | Yes | Arbitrary JSON | Raw request payload as received from the device |
| receivedAt | DateTime | Yes | ISO 8601, default now | When the server received the event |

---

## ClientRequestLink

Table: `ClientRequestLink`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Company that owns this intake link |
| customerId | Int? | No | FK → Customer.id | Customer pre-associated with this link (optional) |
| name | String | Yes | Free text | Human label for the link (e.g. "Acme standing request link") |
| tokenHash | String | Yes | Unique SHA-256 hex | SHA-256 hash of the raw URL token — raw token is never stored |
| isActive | Boolean | Yes | Default: `true` | Whether the link can currently accept new submissions |
| expiresAt | DateTime? | No | ISO 8601 | Optional expiry date/time after which the link is rejected |
| lastUsedAt | DateTime? | No | ISO 8601 | Timestamp of the most recent successful submission |
| usageCount | Int | Yes | Default: 0 | Total number of successful submissions via this link |
| createdBy | Int | Yes | FK → User.id | User who created the link |
| templateData | Json? | No | Arbitrary key-value object | Pre-fill values injected into matching fields on the public intake form when this link is used. Common keys: `customerRef`, `goodsType`, `goodsDescription`, `unit`, `quantity`, `estimatedWeight`, `declaredGoodsValue`. Managed in the Intake Links admin page. |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## JobRequest — Top-level fields (denormalized columns)

Table: `JobRequest`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Company that received the request |
| requestLinkId | Int? | No | FK → ClientRequestLink.id | Link used to submit the request |
| customerId | Int? | No | FK → Customer.id | Customer matched / linked after planner review |
| source | String | Yes | `internal_manual` \| `client_request_link`, default `client_request_link` | How the request entered the system |
| status | String | Yes | `pending_review` \| `accepted` \| `rejected` \| `cancelled`, default `pending_review` | Current review status |
| customerName | String | Yes | Free text, default `""` | Denormalised customer company name (from requesterData) |
| contactName | String | Yes | Free text, default `""` | Denormalised contact name (from requesterData) |
| contactPhone | String | Yes | Phone string, default `""` | Denormalised contact phone (from requesterData) |
| contactEmail | String | Yes | Email string, default `""` | Denormalised contact email (from requesterData) |
| pricingType | String | Yes | `quote_required` \| `agreed_rate_exists` \| `contract_rate_exists` \| `to_be_confirmed`, default `quote_required` | Pricing arrangement (server always forces `quote_required` for public form submissions) |
| internalOfficeNotes | String? | No | Free text | Internal notes added by office staff; never exposed on the public form |
| reviewedAt | DateTime? | No | ISO 8601 | Timestamp of the accept/reject decision |
| reviewedBy | Int? | No | FK → User.id | User who reviewed the request |
| rejectionReason | String? | No | `no_capacity` \| `outside_service_area` \| `incomplete_information` \| `pricing_issue` \| `duplicate_request` \| `other` | Reason code for rejection |
| reviewNotes | String? | No | Free text | Planner's free-text notes on their decision |
| reviewData | Json? | No | `{ plannerNotes: string }` | Populated when reviewed: planner notes recorded at accept time |
| convertedJobId | Int? | No | FK → PlannedJob.id (unique) | PlannedJob created when the request was accepted |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## JobRequest — requesterData blob

Stored in `JobRequest.requesterData` (Json column, default `{}`).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| customerCompanyName | String | Yes | Free text | Customer's company or organisation name |
| contactName | String | Yes | Free text | Full name of the person submitting the request |
| contactPhone | String | Yes | Phone string | Phone number for the submitting contact |
| contactEmail | String | Yes | Email string | Email address for the submitting contact |
| customerRef | String? | No | Free text | Customer's own internal reference / order number for the job |

---

## JobRequest — stops blob (per stop — every field)

Stored in `JobRequest.stops` (Json column, default `[]`). Each element in the array is a stop object with the following fields.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| type | String | Yes | `collection` \| `delivery` \| `reload` \| `return` \| `waypoint` \| `other` | Category of this stop |
| sequence | Number | Yes | Positive integer | 1-based position of the stop in the route |
| siteName | String | Yes | Free text | Name of the company or site at this address |
| street | String | Yes | Free text | First line of the street address |
| addressLine2 | String? | No | Free text | Second line of the address (unit, building, etc.) |
| town | String | Yes | Free text | Town or city |
| countyRegion | String? | No | Free text | County or region |
| postcode | String | Yes | Postcode string | Royal Mail postcode |
| country | String? | No | ISO 3166-1 alpha-2 code, default `GB`. Supported: `GB` `AT` `BE` `BG` `HR` `CY` `CZ` `DK` `EE` `FI` `FR` `DE` `GR` `HU` `IE` `IT` `LV` `LT` `LU` `MT` `NL` `PL` `PT` `RO` `SK` `SI` `ES` `SE` | Country — stored as ISO code, displayed as full name in UI |
| lat | Number | Yes | Decimal degrees | Latitude of the exact truck entrance / gate |
| lng | Number | Yes | Decimal degrees | Longitude of the exact truck entrance / gate |
| navigationInstructions | String | Yes | Free text | Gate codes, barrier procedures, which entrance to use |
| referenceNumber | String? | Required for `collection` and `delivery` | Free text | Warehouse release number (collection) or goods-in booking number (delivery) |
| contactName | String? | No | Free text | On-site contact person |
| contactPhone | String? | No | Phone string | On-site contact phone number |
| contactEmail | String? | No | Email string | On-site contact email address |
| bookingRequired | Boolean? | No | `true` \| `false` | Whether advance booking is required before the driver arrives |
| bookingRef | String? | No | Free text | Pre-arranged booking reference number |
| openingHours | String? | No | Free text (e.g. `Mon–Fri 06:00–18:00`) | Site opening hours |
| siteRestrictions | String[]? | No | Free text array | Legacy field for site restrictions (use accessRequirements in new submissions) |
| date | String | Yes | `YYYY-MM-DD` | Date of the collection or delivery |
| earliestArrivalTime | String | Yes | `HH:MM` | Earliest acceptable arrival time |
| latestArrivalTime | String | Yes | `HH:MM` | Latest acceptable arrival time |
| bookedTime | String? | No | `HH:MM` | Fixed appointment time if the site gave one |
| unloadingAllowanceMinutes | Number | Yes | Positive integer (minutes) | Estimated time needed for loading or unloading |
| stopQuantity | Number? | No | Positive integer | Number of items/units being collected or delivered at this specific stop (not the total job quantity) |
| stopQuantityUnit | String? | No | `pallets` \| `tonnes` \| `kg` \| `bags` \| `items` \| `loads` \| `litres` \| `cubic_metres` \| `other` | Unit of measure for the per-stop quantity |
| stopNotes | String? | No | Free text | Free-text notes specific to this stop — anything not covered by other fields (e.g. partial loads, bay numbers, wait instructions) |
| exchangeDropQty | Number? | No | Positive integer | Number of full units (pallets, cages, etc.) to drop at this stop as part of an exchange |
| exchangeCollectQty | Number? | No | Positive integer | Number of empty units to collect back from this stop as part of an exchange |
| exchangeUnit | String? | No | `pallets` \| `roll_cages` \| `stillages` \| `ibc_tanks` \| `other` | Type of equipment being exchanged (only present when exchangeDropQty or exchangeCollectQty is set) |
| handlingMethods | String[]? | No | `forklift` \| `loading_bay` \| `hiab` \| `moffett` \| `tail_lift` \| `pump_truck` \| `handball` \| `overhead_crane` \| `magnetic_crane` \| `side_loading` \| `roro` \| `tipper_discharge` \| `grab` \| `pump_discharge` \| `walking_floor` \| `conveyor` \| `other` (or `other: <description>` when free-text is provided) | Methods used to load or unload the vehicle at this stop. When "other" is selected with a description, the value is serialised as `other: <free text>` |
| handlingMethodOther | String? | No | Free text | Description of the handling method when `other` is selected in handlingMethods. Substituted into the array as `other: <value>` on submission |
| proofRequirements | String[]? | No | `signature_required` \| `photos_required` \| `pod_required` \| `weighbridge_ticket_required` \| `seal_number_required` \| `name_required` | Proof documents or signatures required at this stop |
| accessRequirements | String[]? | No | `narrow_road` \| `height_restriction` \| `weight_restriction` \| `length_restriction` \| `no_artic_access` \| `no_trailer_access` \| `residential_area` \| `security_checkin` \| `ppe_required` \| `ppe_safety_boots` \| `ppe_hi_vis` \| `ppe_hard_hat` \| `ppe_gloves` \| `ppe_glasses` \| `driver_id_required` \| `do_not_arrive_early` \| `holding_area_required` \| `port_access` \| `airport_access` | Site access constraints. `ppe_required` is the top-level flag; `ppe_*` sub-items record specific PPE needed. |
| loadReadiness | String? | No | `ready_now` \| `ready_at_booked_time` \| `still_being_prepared` \| `unsure` | Whether the load will be ready when the driver arrives (collection stops only) |
| heightRestrictionValue | String? | No | Free text (e.g. `4.2m`) | Numeric or descriptive height restriction value (only present when `height_restriction` is in accessRequirements) |
| weightRestrictionValue | String? | No | Free text (e.g. `7.5t`) | Numeric or descriptive weight restriction value (only present when `weight_restriction` is in accessRequirements) |
| lengthRestrictionValue | String? | No | Free text (e.g. `18m`) | Numeric or descriptive length restriction value (only present when `length_restriction` is in accessRequirements) |
| entranceDistanceFromPostcode | Number? | Set server-side | Decimal miles or `null` | Distance in miles between the submitted entrance pin and the centroid of the given postcode (calculated on submission) |
| entranceWarningLevel | String? | Set server-side | `ok` \| `warn` \| `danger` | Server-computed flag: `warn` if pin is >1 mile from postcode; `danger` if >3 miles |

---

## JobRequest — loadData blob

Stored in `JobRequest.loadData` (Json column, default `{}`). Copied verbatim to `PlannedJob.loadData` on accept.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| goodsType | String | Yes | `pallets` \| `roll_cages` \| `machinery` \| `building_materials` \| `food_refrigerated` \| `bulk_material` \| `liquid_bulk` \| `steel_long` \| `vehicles` \| `containers` \| `general` \| `other` | High-level category of goods being transported |
| goodsTypeOther | String? | No | Free text | Description of goods when goodsType = `other` |
| goodsDescription | String | Yes | Free text, min 15 characters | Detailed description of what is being transported |
| quantity | Number | Yes | Positive number | Quantity of goods |
| unit | String | Yes | `pallets` \| `tonnes` \| `kg` \| `bags` \| `items` \| `loads` \| `litres` \| `cubic_metres` \| `other` (or custom string when `other` selected) | Unit of measure for the quantity |
| estimatedWeight | Number? | Yes (validated) | Positive number (kg) | Estimated total weight of the load in kilograms |
| palletCount | Number? | No | Positive integer | Number of pallets (only when goodsType = `pallets`) |
| palletType | String? | No | `euro` \| `uk` \| `half` \| `chep` \| `other` | Type of pallets (only when goodsType = `pallets`) |
| palletTypeOther | String? | No | Free text | Description of pallet type when palletType = `other` |
| stackable | Boolean? | No | `true` \| `false` | Whether pallets can be stacked (only when goodsType = `pallets`) |
| cageCount | Number? | No | Positive integer | Number of roll cages / yorks (only when goodsType = `roll_cages`) |
| cageFolded | Boolean? | No | `true` \| `false` | Whether the cages are folded / nested (only when goodsType = `roll_cages`) |
| buildingMaterialType | String? | No | `bricks_blocks` \| `timber` \| `aggregates` \| `plasterboard` \| `roofing` \| `glass` \| `insulation` \| `pipes_ducting` \| `other` | Sub-type of building material (only when goodsType = `building_materials`) |
| buildingMaterialPalletised | Boolean? | No | `true` \| `false` | Whether the building materials are palletised rather than loose |
| buildingMaterialLongestItem | String? | No | Free text in metres (e.g. `6`) | Length of the longest single item (only when goodsType = `building_materials`) |
| buildingMaterialWeatherSensitive | Boolean? | No | `true` \| `false` | Whether the load must be kept dry / covered during transit |
| liquidProductType | String? | No | Free text (e.g. `Vegetable oil`) | Description of the liquid product (only when goodsType = `liquid_bulk`) |
| liquidFoodGrade | Boolean? | No | `true` \| `false` | Whether the product requires a food-grade tanker (only when goodsType = `liquid_bulk`) |
| generalPackagingType | String? | No | `palletised` \| `boxed` \| `loose` \| `shrink_wrapped` \| `other` | How the general goods are packaged (only when goodsType = `general`) |
| generalPieceCount | Number? | No | Positive integer | Total number of individual pieces (only when goodsType = `general`) |
| loadHeight | String? | No | Free text in metres (e.g. `2.4`) | Overall height of the loaded goods — applies to all goodsType values |
| dimensions | String? | No | Free text (e.g. `4.5m × 2.2m × 3.1m`) | Physical dimensions — longest item length for `steel_long`; L×W×H for `machinery` |
| machineryPieceWeight | Number? | No | Positive number (kg) | Weight of one individual piece of machinery (only when goodsType = `machinery`) |
| machineryLiftingPoints | Boolean? | No | `true` \| `false` | Whether the machine has lifting points / lifting eyes |
| machinerySkidMounted | Boolean? | No | `true` \| `false` | Whether the machine is skid-mounted |
| craneRequired | Boolean? | No | `true` \| `false` | Whether a crane is needed on site (only when goodsType = `machinery`) |
| steelPieceCount | Number? | No | Positive integer | Number of individual steel pieces (only when goodsType = `steel_long`) |
| steelWidth | String? | No | Free text in metres (e.g. `2.4`) | Width of the widest piece (only when goodsType = `steel_long`) |
| tippingRequired | Boolean? | No | `true` \| `false` | Whether tipping is required at delivery (only when goodsType = `bulk_material`) |
| temperatureRange | String? | No | Free text (e.g. `2°C – 8°C`) | Required temperature range (only when goodsType = `food_refrigerated`) |
| chilledFrozenAmbient | String? | No | `chilled` \| `frozen` \| `ambient` \| `dry` \| `wet` | Temperature / moisture classification of the load |
| vehicleCount | Number? | No | Positive integer | Number of vehicles to be transported (only when goodsType = `vehicles`) |
| vehicleMakeModel | String? | No | Free text (e.g. `2019 Ford Transit Custom`) | Year, make and model of the vehicle(s) being transported |
| vehicleKeysWithVehicle | Boolean? | No | `true` \| `false` | Whether keys will be with the vehicle (only when goodsType = `vehicles`) |
| driveable | Boolean? | No | `true` \| `false` | Whether transported vehicles are driveable RORO (only when goodsType = `vehicles`) |
| containerSize | String? | No | `20ft` \| `40ft` \| `45ft` \| `other` | Container size (only when goodsType = `containers`) |
| containerSizeOther | String? | No | Free text | Description of container size when containerSize = `other` |
| loadedOrEmpty | String? | No | `loaded` \| `empty` | Whether the container is loaded or empty (only when goodsType = `containers`) |
| containerNumber | String? | No | Free text (e.g. `MSCU1234567`) | Container identification number |
| loadNotes | String? | No | Free text | Additional load-specific notes for the driver and planner |
| canSplitShipment | String? | No | `must_stay_together` \| `can_split_partially` \| `can_split_freely` | Whether the shipment can be split across multiple vehicles |
| securingRequirements | String[]? | No | `straps_required` \| `chains_required` \| `edge_protection_required` \| `sheets_required` \| `curtains_must_not_touch_load` \| `stanchions_required` \| `temperature_monitoring_required` | Load securing equipment or methods required |

---

## JobRequest — specialRequirementsData blob

Stored in `JobRequest.specialRequirementsData` (Json column, default `{}`).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| items | String[]? | No | `dangerous_goods` \| `temperature_controlled` \| `fragile` \| `high_value` \| `oversized` \| `secure_transport_required` \| `escort_required` \| `temperature_monitored` | Special requirement flags checked by the customer |
| adrClass | String? | No | Free text (e.g. `Class 3 — Flammable liquids`) | ADR hazard class description (only when `dangerous_goods` selected) |
| unNumber | String? | No | Free text (e.g. `UN 1993`) | UN dangerous goods number (only when `dangerous_goods` selected) |
| packingGroup | String? | No | `I` \| `II` \| `III` | ADR packing group (only when `dangerous_goods` selected) |
| hazardousPaperworkAvailable | Boolean? | No | `true` \| `false` | Whether the customer will provide hazardous goods documentation |
| temperatureRange | String? | No | Free text (e.g. `2°C – 8°C`) | Required temperature range (only when `temperature_controlled` selected) |

---

## JobRequest — transportRequirementsData blob

Stored in `JobRequest.transportRequirementsData` (Json column, default `{}`).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| plannerDecides | Boolean? | No | `true` \| `false`, default `true` | When `true` the planner selects the vehicle; when `false` the customer specifies requirements |
| reqBodyCategory | String? | No | `tractor` \| `rigid` \| `van` \| `other` | Customer-requested vehicle body category (only when plannerDecides = `false`) |
| reqBodyType | String? | No | `curtainsider` \| `flatbed` \| `box` \| `tipper` \| `fridge` \| `tanker` \| `other` | Customer-requested body type (only when plannerDecides = `false`) |
| reqEquipment | String[]? | No | Equipment code strings (e.g. `tail_lift`, `hiab_crane`) | Specific equipment the customer requires on the vehicle |
| trailerTypesAllowed | String[]? | No | Trailer type code strings | Trailer types the customer permits |

---

## JobRequest — billingData blob

Stored in `JobRequest.billingData` (Json column, default `{}`). Copied verbatim to `PlannedJob.billingData` on accept.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| pricingType | String? | No | `quote_required` \| `agreed_rate_exists` \| `contract_rate_exists` \| `to_be_confirmed` | Pricing arrangement selected by the customer (note: server always overrides to `quote_required` for public form submissions) |
| declaredGoodsValue | Number? | Yes (validated) | Positive number (GBP) | Declared value of the goods for insurance / risk purposes |
| currency | String? | No | ISO 4217 currency code (e.g. `GBP`) | Currency of the declared value |
| purchaseOrderNumber | String? | No | Free text (e.g. `PO-2026-12345`) | Customer's purchase order number for their finance team |
| billingReference | String? | No | Free text (e.g. `COST-CENTRE-123`) | Customer's billing reference or cost centre code |
| vatRegistered | Boolean? | No | `true` \| `false` | Whether the customer is VAT registered |
| vatNumber | String? | No | Free text (e.g. `GB 123 4567 89`) | Customer's VAT registration number |

---

## JobRequest — notesData blob

Stored in `JobRequest.notesData` (Json column, default `{}`). Copied verbatim to `PlannedJob.notesData` on accept.

The "Notes for driver" section was removed from the public intake form. Only `customerNotes` is collected from the customer (in the Section 1 optional block). Driver-specific fields are planner-managed only.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| customerNotes | String? | No | Free text | Notes from the customer for the planner — collected in Section 1 (optional). Not shown to drivers. |
| driverNoteChips | String[]? | No | `call_before_arrival` \| `report_to_security` \| `use_rear_entrance` \| `ppe_required` \| `bring_straps` \| `bring_pump_truck` \| `do_not_arrive_early` | Quick-select instructions for the driver — planner-managed only, not on public form |
| driverVisibleNotes | String? | No | Free text | Free-text instructions the driver must read before the job — planner-managed only |
| safetyInstructions | String? | No | Free text | Safety information (COSHH, hazard warnings, PPE requirements) — planner-managed only |

---

## JobRequest — exceptionPolicyData blob

Stored in `JobRequest.exceptionPolicyData` (Json column, default `{}`). Copied verbatim to `PlannedJob.exceptionPolicyData` on accept. Sub-field shape is identical to the `PlannedJob.exceptionPolicyData` blob — refer to that section for field descriptions.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| rejectionAction | String? | No | `call_office_before_leaving` \| `return_to_collection_point` \| `deliver_to_alternative_address` \| `wait_for_further_instruction` \| `do_not_return_without_approval` \| `other` | What the driver should do if the delivery is refused |
| alternativeReturnAddress | String? | No | Free text | Street address of the alternative delivery location |
| alternativeReturnPostcode | String? | No | Postcode string | Postcode of the alternative delivery address |
| alternativeReturnContactName | String? | No | Free text | Contact name at the alternative address |
| alternativeReturnContactPhone | String? | No | Phone string | Contact phone at the alternative address |
| approvalContactName | String? | No | Free text | Name of the person to call for approval before leaving |
| approvalContactPhone | String? | No | Phone string | Phone of the approval contact |
| photosRequiredOnRejection | Boolean? | No | `true` \| `false` | Whether the driver must take photos if rejected |
| rejectionSignatureRequired | Boolean? | No | `true` \| `false` | Whether the driver must obtain a signature from the refusing party |
| rejectionNotes | String? | No | Free text | Additional instructions for rejection / return situations |

---

## AuditLog

Table: `AuditLog`

Append-only. Covers all entity types except jobs (which use `JobAudit`). Rows are never updated or deleted.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Company context for the action |
| actorId | Int? | No | FK → User.id | User who performed the action; `null` = system-initiated |
| entityType | String | Yes | `Driver` \| `FleetUnit` \| `FleetTrailer` \| `HolidayRequest` \| `Shift` \| `Job` \| etc. | The type of entity that was affected |
| entityId | Int | Yes | Primary key of the affected row | Row identifier of the affected entity |
| action | String | Yes | `create` \| `update` \| `delete` \| `status_change` \| `read_sensitive` | The operation that was performed |
| field | String | Yes | Column or field name, default `""` | Specific field name for update events; empty for whole-record actions |
| oldValue | Json? | No | Any | Previous value before the change |
| newValue | Json? | No | Any | New value after the change |
| ipAddress | String? | No | IPv4 / IPv6 string | Client IP address that made the request |
| userAgent | String? | No | HTTP User-Agent string | Browser or app user-agent |
| requestId | String? | No | UUID / trace ID | HTTP request ID for correlation with server logs |
| note | String | Yes | Free text, default `""` | Human-readable summary of what changed and why |
| createdAt | DateTime | Yes | ISO 8601 | Timestamp of the action |

---

## RefreshToken

Table: `RefreshToken`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| userId | Int | Yes | FK → User.id | User this token belongs to |
| companyId | Int | Yes | FK → Company.id | Company context for the session |
| tokenHash | String | Yes | Unique SHA-256 hex | SHA-256 hash of the raw refresh token — raw token is never stored |
| familyId | String | Yes | UUID | Token family identifier used for rotation and reuse detection |
| userAgent | String | Yes | HTTP User-Agent string, default `""` | Browser or app that created the session |
| expiresAt | DateTime | Yes | ISO 8601 | Expiry date/time of the token |
| revokedAt | DateTime? | No | ISO 8601 | Timestamp of revocation; `null` means the token is still valid |
| lastUsedAt | DateTime | Yes | ISO 8601, default now | Timestamp of the most recent successful use |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |

---

## Form field → database mapping

Both the internal `CreateJobPage` form and the public `PublicRequestForm` now share identical stop and load structures. The table below maps every labelled UI field to its database location. Where the two forms write to different locations, the destination column is noted.

> **Internal form** (`CreateJobPage`) writes directly to `PlannedJob` + `JobPart` + `LoadDetails`.
> **Public form** (`PublicRequestForm`) writes to `JobRequest` blobs. On accept, the accept handler copies blob data to `PlannedJob` and creates `JobPart` rows.

| UI Section | Form field label | Internal form (CreateJobPage) | Public form (PublicRequestForm) |
|---|---|---|---|
| **Your details** | Company / organisation name | `PlannedJob.customerName` (via customerId lookup or free text) | `JobRequest.requesterData.customerCompanyName` → also `JobRequest.customerName` |
| **Your details** | Contact name | `PlannedJob.bookingContactName` | `JobRequest.requesterData.contactName` → also `JobRequest.contactName` |
| **Your details** | Contact phone | `PlannedJob.bookingContactPhone` | `JobRequest.requesterData.contactPhone` → also `JobRequest.contactPhone` |
| **Your details** | Contact email | `PlannedJob.bookingContactEmail` | `JobRequest.requesterData.contactEmail` → also `JobRequest.contactEmail` |
| **Your details** | Your internal reference / order number | `PlannedJob.customerRef` | `JobRequest.requesterData.customerRef` |
| **Your details (optional)** | Notes for the planner | `PlannedJob.plannerNotes` | `JobRequest.notesData.customerNotes` |
| **Stops (per stop)** | Stop type | `JobPart.type` | `JobRequest.stops[n].type` |
| **Stops (per stop)** | Collection / delivery reference | `JobPart.referenceNumber` | `JobRequest.stops[n].referenceNumber` |
| **Stops (per stop)** | Quantity at this stop | `JobPart.quantityRequired` | `JobRequest.stops[n].stopQuantity` |
| **Stops (per stop)** | Unit (per-stop quantity) | `JobPart.quantityUnit` | `JobRequest.stops[n].stopQuantityUnit` |
| **Stops (per stop)** | Site name | `JobPart.siteName` | `JobRequest.stops[n].siteName` |
| **Stops (per stop)** | Address line 1 | `JobPart.street` | `JobRequest.stops[n].street` |
| **Stops (per stop)** | Address line 2 | `JobPart.addressLine2` | `JobRequest.stops[n].addressLine2` |
| **Stops (per stop)** | Town / city | `JobPart.town` | `JobRequest.stops[n].town` |
| **Stops (per stop)** | County / region | `JobPart.countyRegion` | `JobRequest.stops[n].countyRegion` |
| **Stops (per stop)** | Postcode | `JobPart.postcode` | `JobRequest.stops[n].postcode` |
| **Stops (per stop)** | Country | `JobPart.country` | `JobRequest.stops[n].country` |
| **Stops (per stop)** | Collection / delivery date | `JobPart.timeWindowStart` (date component) | `JobRequest.stops[n].date` |
| **Stops (per stop)** | Earliest arrival | `JobPart.timeWindowStart` or `JobPart.earliestArrivalMinutes` | `JobRequest.stops[n].earliestArrivalTime` |
| **Stops (per stop)** | Latest arrival | `JobPart.timeWindowEnd` | `JobRequest.stops[n].latestArrivalTime` |
| **Stops (per stop)** | Fixed appointment time | `JobPart.bookedTime` | `JobRequest.stops[n].bookedTime` |
| **Stops (per stop)** | Estimated loading / unloading time | `JobPart.unloadingAllowanceMinutes` | `JobRequest.stops[n].unloadingAllowanceMinutes` |
| **Stops (per stop)** | Latitude (entrance pin) | `JobPart.lat` | `JobRequest.stops[n].lat` |
| **Stops (per stop)** | Longitude (entrance pin) | `JobPart.lng` | `JobRequest.stops[n].lng` |
| **Stops (per stop)** | Entrance instructions | `JobPart.navigationInstructions` | `JobRequest.stops[n].navigationInstructions` |
| **Stops (per stop)** | How will this be loaded / unloaded? | `JobPart.handlingMethods` | `JobRequest.stops[n].handlingMethods[]` |
| **Stops (per stop)** | Other handling method — describe | `JobPart.handlingMethods` (serialised as `other: <text>`) | `JobRequest.stops[n].handlingMethodOther` → serialised into `handlingMethods[]` |
| **Stops (per stop)** | Site access requirements | `JobPart.accessRequirements` | `JobRequest.stops[n].accessRequirements[]` |
| **Stops (per stop)** | Height restriction value | `JobPart.heightRestriction` | `JobRequest.stops[n].heightRestrictionValue` |
| **Stops (per stop)** | Weight restriction value | `JobPart.weightRestriction` | `JobRequest.stops[n].weightRestrictionValue` |
| **Stops (per stop)** | Length restriction value | n/a (not on internal stop form) | `JobRequest.stops[n].lengthRestrictionValue` |
| **Stops (per stop)** | Will the load be ready? | `JobPart.loadReadiness` | `JobRequest.stops[n].loadReadiness` |
| **Stops (per stop)** | Stop notes | `JobPart.stopNotes` | `JobRequest.stops[n].stopNotes` |
| **Stops (per stop)** | Equipment exchange — Drop (full) | `JobPart.exchangeDropQty` | `JobRequest.stops[n].exchangeDropQty` |
| **Stops (per stop)** | Equipment exchange — Collect empties | `JobPart.exchangeCollectQty` | `JobRequest.stops[n].exchangeCollectQty` |
| **Stops (per stop)** | Equipment exchange — Unit | `JobPart.exchangeUnit` | `JobRequest.stops[n].exchangeUnit` |
| **Stops (per stop — optional)** | Proof required at this stop | `JobPart.proofRequirements` | `JobRequest.stops[n].proofRequirements[]` |
| **Stops (per stop — optional)** | Site contact name | `JobPart.contactName` | `JobRequest.stops[n].contactName` |
| **Stops (per stop — optional)** | Site contact phone | `JobPart.contactPhone` | `JobRequest.stops[n].contactPhone` |
| **Stops (per stop — optional)** | Site contact email | `JobPart.contactEmail` | `JobRequest.stops[n].contactEmail` |
| **Stops (per stop — optional)** | Booking required before arrival | `JobPart.bookingRequired` | `JobRequest.stops[n].bookingRequired` |
| **Stops (per stop — optional)** | Booking reference | `JobPart.bookingRef` | `JobRequest.stops[n].bookingRef` |
| **Stops (per stop — optional)** | Opening hours | `JobPart.openingHours` | `JobRequest.stops[n].openingHours` |
| **Load details** | What are you moving? (goods type) | `LoadDetails.goodsType` | `JobRequest.loadData.goodsType` |
| **Load details** | Other goods type — describe | `LoadDetails.goodsType` (as free text) | `JobRequest.loadData.goodsTypeOther` |
| **Load details** | Description of goods | `LoadDetails.materialType` | `JobRequest.loadData.goodsDescription` |
| **Load details** | Quantity | `LoadDetails.quantity` | `JobRequest.loadData.quantity` |
| **Load details** | Unit | `LoadDetails.unit` | `JobRequest.loadData.unit` |
| **Load details** | Estimated total weight (kg) | `LoadDetails.weight` | `JobRequest.loadData.estimatedWeight` |
| **Load details** | Pallet count | n/a (internal form uses quantity field) | `JobRequest.loadData.palletCount` |
| **Load details** | Pallet type | n/a | `JobRequest.loadData.palletType` |
| **Load details** | Pallets are stackable | `LoadDetails.stackable` | `JobRequest.loadData.stackable` |
| **Load details** | Number of cages | n/a | `JobRequest.loadData.cageCount` |
| **Load details** | Cages are folded / nested | n/a | `JobRequest.loadData.cageFolded` |
| **Load details** | Overall load height (m) | n/a | `JobRequest.loadData.loadHeight` |
| **Load details** | Dimensions (L × W × H) | `LoadDetails.dimensions` | `JobRequest.loadData.dimensions` |
| **Load details** | Material type (building materials) | n/a | `JobRequest.loadData.buildingMaterialType` |
| **Load details** | Load is palletised (building materials) | n/a | `JobRequest.loadData.buildingMaterialPalletised` |
| **Load details** | Longest single item (m) | n/a | `JobRequest.loadData.buildingMaterialLongestItem` |
| **Load details** | Weather sensitive / needs sheeting | n/a | `JobRequest.loadData.buildingMaterialWeatherSensitive` |
| **Load details** | Product description (liquid / tanker) | n/a | `JobRequest.loadData.liquidProductType` |
| **Load details** | Food-grade product | n/a | `JobRequest.loadData.liquidFoodGrade` |
| **Load details** | Packaging type (general goods) | n/a | `JobRequest.loadData.generalPackagingType` |
| **Load details** | Total number of pieces (general goods) | n/a | `JobRequest.loadData.generalPieceCount` |
| **Load details** | Individual piece weight (kg) | n/a | `JobRequest.loadData.machineryPieceWeight` |
| **Load details** | Machine has lifting points | n/a | `JobRequest.loadData.machineryLiftingPoints` |
| **Load details** | Machine is skid-mounted | n/a | `JobRequest.loadData.machinerySkidMounted` |
| **Load details** | Crane required on site | `LoadDetails.craneRequired` | `JobRequest.loadData.craneRequired` |
| **Load details** | Number of pieces (steel) | n/a | `JobRequest.loadData.steelPieceCount` |
| **Load details** | Width of widest piece (m) | n/a | `JobRequest.loadData.steelWidth` |
| **Load details** | Tipping required at delivery | n/a | `JobRequest.loadData.tippingRequired` |
| **Load details** | Wet or dry / Chilled, frozen or ambient? | n/a | `JobRequest.loadData.chilledFrozenAmbient` |
| **Load details** | Required temperature range | `LoadDetails.tempRange` | `JobRequest.loadData.temperatureRange` |
| **Load details** | Number of vehicles | n/a | `JobRequest.loadData.vehicleCount` |
| **Load details** | Make and model | n/a | `JobRequest.loadData.vehicleMakeModel` |
| **Load details** | Keys will be with the vehicle | n/a | `JobRequest.loadData.vehicleKeysWithVehicle` |
| **Load details** | Vehicles are driveable (RORO) | n/a | `JobRequest.loadData.driveable` |
| **Load details** | Container size | n/a | `JobRequest.loadData.containerSize` |
| **Load details** | Other container size — describe | n/a | `JobRequest.loadData.containerSizeOther` |
| **Load details** | Loaded or empty? | n/a | `JobRequest.loadData.loadedOrEmpty` |
| **Load details** | Container number | n/a | `JobRequest.loadData.containerNumber` |
| **Load details** | Can this shipment be split? | `PlannedJob.canSplitShipment` | `JobRequest.loadData.canSplitShipment` |
| **Load details** | Load securing requirements | `LoadDetails.securingRequirements` | `JobRequest.loadData.securingRequirements[]` |
| **Load details** | Additional load notes | `LoadDetails.notes` | `JobRequest.loadData.loadNotes` |
| **Load details** | Load is fragile | `LoadDetails.fragile` | via `JobRequest.specialRequirementsData.items[]` |
| **Load details** | Temperature controlled | `LoadDetails.tempControlled` | via `JobRequest.specialRequirementsData.items[]` |
| **Load details** | Special requirements (multi-check) | `LoadDetails.specialRequirements` | `JobRequest.specialRequirementsData.items[]` |
| **Special requirements** | ADR class | `LoadDetails.hazardClass` | `JobRequest.specialRequirementsData.adrClass` |
| **Special requirements** | UN number | n/a | `JobRequest.specialRequirementsData.unNumber` |
| **Special requirements** | Packing group | n/a | `JobRequest.specialRequirementsData.packingGroup` |
| **Special requirements** | Hazardous paperwork available | n/a | `JobRequest.specialRequirementsData.hazardousPaperworkAvailable` |
| **Transport requirements** | Let the planner choose (toggle) | n/a (planner always specifies directly) | `JobRequest.transportRequirementsData.plannerDecides` |
| **Transport requirements** | Vehicle body category | `PlannedJob.reqBodyCategory` | `JobRequest.transportRequirementsData.reqBodyCategory` |
| **Transport requirements** | Body types (multi-select) | `PlannedJob.reqBodyType` | `JobRequest.transportRequirementsData.reqBodyType` |
| **Transport requirements** | Equipment required | `PlannedJob.reqEquipment` | `JobRequest.transportRequirementsData.reqEquipment` |
| **Transport requirements** | Trailer types allowed | `PlannedJob.trailerTypesAllowed` | `JobRequest.transportRequirementsData.trailerTypesAllowed` |
| **Billing** | Declared value of goods (£) | n/a (internal form does not collect) | `JobRequest.billingData.declaredGoodsValue` |
| **Billing** | Purchase order number | `PlannedJob.purchaseOrderNumber` | `JobRequest.billingData.purchaseOrderNumber` |
| **Billing** | Billing reference / cost code | `PlannedJob.customerRef` | `JobRequest.billingData.billingReference` |
| **Billing** | VAT registered | n/a | `JobRequest.billingData.vatRegistered` |
| **Billing** | VAT number | n/a | `JobRequest.billingData.vatNumber` |
| **Driver instructions** | Driver note chips | `PlannedJob.notesData.driverNoteChips` | not on public form |
| **Driver instructions** | Driver visible notes | `PlannedJob.notesData.driverVisibleNotes` | not on public form |
| **Driver instructions** | Safety instructions | `PlannedJob.notesData.safetyInstructions` | not on public form |
| **Exception / return policy** | If delivery is rejected — what should driver do? | `PlannedJob.exceptionPolicyData.rejectionAction` | `JobRequest.exceptionPolicyData.rejectionAction` |
| **Exception / return policy** | Alternative delivery address | `PlannedJob.exceptionPolicyData.alternativeReturnAddress` | `JobRequest.exceptionPolicyData.alternativeReturnAddress` |
| **Exception / return policy** | Alternative delivery postcode | `PlannedJob.exceptionPolicyData.alternativeReturnPostcode` | `JobRequest.exceptionPolicyData.alternativeReturnPostcode` |
| **Exception / return policy** | Contact name at alternative address | `PlannedJob.exceptionPolicyData.alternativeReturnContactName` | `JobRequest.exceptionPolicyData.alternativeReturnContactName` |
| **Exception / return policy** | Contact phone (alternative address) | `PlannedJob.exceptionPolicyData.alternativeReturnContactPhone` | `JobRequest.exceptionPolicyData.alternativeReturnContactPhone` |
| **Exception / return policy** | Approval contact name | `PlannedJob.exceptionPolicyData.approvalContactName` | `JobRequest.exceptionPolicyData.approvalContactName` |
| **Exception / return policy** | Approval contact phone | `PlannedJob.exceptionPolicyData.approvalContactPhone` | `JobRequest.exceptionPolicyData.approvalContactPhone` |
| **Exception / return policy** | Photos required on rejection | `PlannedJob.exceptionPolicyData.photosRequiredOnRejection` | `JobRequest.exceptionPolicyData.photosRequiredOnRejection` |
| **Exception / return policy** | Rejection signature required | `PlannedJob.exceptionPolicyData.rejectionSignatureRequired` | `JobRequest.exceptionPolicyData.rejectionSignatureRequired` |
| **Exception / return policy** | Additional rejection / return notes | `PlannedJob.exceptionPolicyData.rejectionNotes` | `JobRequest.exceptionPolicyData.rejectionNotes` |
| **Server-computed (not on form)** | Distance from postcode to entrance pin | n/a | `JobRequest.stops[n].entranceDistanceFromPostcode` |
| **Server-computed (not on form)** | Entrance pin warning level | n/a | `JobRequest.stops[n].entranceWarningLevel` |
