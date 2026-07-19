# LogisticBay — Data Dictionary

> Last updated: 2026-07-15 (doc-integrity pass: removed dead JobRequest sections + plannedDate; form mapping unified to Job/JobPart; missing scalars documented). Source of truth: `api/prisma/schema.prisma` — verified by `npm run check:docs`.

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
| type | String | Yes | `carrier` \| `sender` \| `both`, default `carrier` | Company type — `carrier` operates vehicles, `sender` creates jobs for others to carry, `both` does both |
| depotLocationId | Int? | No | FK → SavedLocation.id | Default depot / home yard; used as the default start waypoint when building runs |
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
| failedLoginAttempts | Int | Yes | Default: 0 | Consecutive failed login attempts since last successful login — used to trigger account lockout |
| lockedUntil | DateTime? | No | ISO 8601 | When set, the account is locked until this datetime (set automatically after repeated login failures) |
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
| driverType | String | Yes | `permanent` \| `agency` \| `subcontractor`, default `permanent` | Employment classification — not the same as `workPattern` |
| workPattern | String? | No | `day_driver` \| `night_driver` \| `tramper` | Operational work pattern. `day_driver` = starts and finishes at the same place each day; `night_driver` = works nights but still returns to base; `tramper` = away for extended shifts (weekly/monthly), sleeps at different locations, returns to base only at end of shift period. Separate from `driverType` (employment) and `nightsOutAllowed` (payment allowance). |
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
| baseLocation | String | Yes | Free text, default `""` | Driver's usual depot or starting location (legacy free-text field) |
| basePostcode | String? | No | Royal Mail postcode | Driver's home / base postcode. Geocoded client-side via postcodes.io on save; result stored in `baseLat` / `baseLng`. Used to calculate return-to-base drive time warnings on the planning board. |
| baseLat | Float? | No | Decimal degrees | Latitude of the driver's base postcode centroid (geocoded from `basePostcode`) |
| baseLng | Float? | No | Decimal degrees | Longitude of the driver's base postcode centroid (geocoded from `basePostcode`) |
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
| heightM | Float? | No | Metres | Overall vehicle height in metres (cab + body) — used for bridge / height restriction checks in ORS routing |
| widthM | Float? | No | Metres | Overall vehicle width in metres — used for width restriction checks |
| lengthM | Float? | No | Metres | Overall vehicle length in metres (cab only, excluding trailer) — used for length restriction checks |
| axleLoadT | Float? | No | Tonnes | Maximum axle load in tonnes — used for weight restriction checks |
| status | String | Yes | `available` \| `in_use` \| `off_road` \| `disposed`, default `available` | Current operational status |
| motExpiryDate | DateTime? | No | ISO 8601 date | MOT / annual test expiry — feeds the readiness `mot_inspection` check (expired = hard fail, ≤30 days = warn, missing = honest unknown) |
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
| heightM | Float? | No | Metres | Overall trailer height in metres (when loaded) — used for bridge / height restriction checks |
| widthM | Float? | No | Metres | Overall trailer width in metres |
| lengthM | Float? | No | Metres | Trailer length in metres (numeric form of `trailerLength`) |
| axleLoadT | Float? | No | Tonnes | Maximum axle load in tonnes |
| status | String | Yes | `available` \| `in_use` \| `off_road` \| `disposed`, default `available` | Current operational status |
| motExpiryDate | DateTime? | No | ISO 8601 date | Annual test expiry — feeds the readiness `mot_inspection` check (expired = hard fail, ≤30 days = warn, missing = honest unknown) |
| notes | String? | No | Free text | Maintenance notes or other remarks |
| attachedUnitId | Int? | No | FK → FleetUnit.id | Tractor unit this trailer is currently attached to |
| linkedJobId | Int? | No | FK → Job.id | Job this trailer is currently allocated to |
| yardLocation | String? | No | Free text | Current yard or bay location |
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
| siteName | String? | No | Free text | Full site or company name at this address |
| unitName | String? | No | Free text | Unit, building, or floor designation within the site |
| locationTextSnapshot | String? | No | Free text | Single-line human-readable address snapshot |
| street | String? | No | Free text | Street address line |
| town | String? | No | Free text | Town or city |
| postcode | String? | No | Postcode string | Royal Mail postcode |
| lat | Float? | No | Decimal degrees | Geographical latitude of the site (building centroid or entrance) |
| lng | Float? | No | Decimal degrees | Geographical longitude of the site |
| contactName | String? | No | Free text | Name of the on-site contact |
| contactPhone | String? | No | Phone string | Phone number for the on-site contact |
| instructions | String? | No | Free text | Gate codes, access instructions shown to the driver |
| internalNotes | String? | No | Free text | Internal planner notes — not shown to drivers |
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

## Job

Table: `Job`

> **TypeScript alias:** `web/src/types/index.ts` exports `export type PlannedJob = Job` for backward compatibility. All new code should use `Job` directly.

The internal `CreateJobPage` (CJP) form writes directly to `Job`. The public `PublicRequestForm` (PRF) also writes to `Job` (with `status = pending_review`). Fields below reflect the actual database columns.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| customerId | Int? | No | FK → Customer.id | Customer this job is for |
| templateId | Int? | No | FK → JobTemplate.id | Template this job was created from (if any) |
| createdByUserId | Int | Yes | FK → User.id | User who created the job |
| parentJobId | Int? | No | FK → Job.id (self) | Set when this job was split from a parent job |
| jobReference | String? | No | Unique per company, e.g. `LB-2026-001` | Human-readable sequential job reference (generated server-side) |
| status | String | Yes | `draft` \| `pending_review` \| `ready_to_plan` \| `in_planning` \| `planned` \| `in_progress` \| `completed` \| `cancelled`, default `draft` | Current job status. `pending_review` = PRF submission awaiting planner accept; `ready_to_plan` = accepted / confirmed, ready for run building; `in_planning` = run being built; `planned` = assigned to a run; `in_progress` = driver has started; `completed` = all stops done; `cancelled` = voided |
| priority | String | Yes | `low` \| `normal` \| `high` \| `urgent`, default `normal` | Job planning priority |
| jobTitle | String? | No | Free text | Optional short human-readable job title shown in lists and notifications |
| serviceType | String? | No | `delivery` \| `collection` \| `collection_delivery` \| `transfer` \| `trunking` \| `sameday` \| `next_day` \| `economy` \| `last_mile` \| `first_mile` \| `drayage` \| `container_haulage` \| `intermodal` \| `cross_dock` \| `warehousing` \| `returns` \| `abnormal` \| `removals` \| `courier` | Service classification (see `vehicleTaxonomy.ts` SERVICE_TYPES) |
| jobType | String? | No | `ftl` \| `ltl` \| `groupage` \| `multi_drop` \| `multi_collection` \| `milk_run` \| `return_load` \| `trunking` \| `shunt` \| `pallet_network` \| `fcl` \| `lcl` \| `sameday_express` \| `abnormal` \| `subcontracted` | Load / service type classification (see `vehicleTaxonomy.ts` JOB_TYPES) |
| canSplitShipment | String | Yes | `must_stay_together` \| `can_split_partially` \| `can_split_freely`, default `must_stay_together` | Whether the shipment can be split across multiple vehicles |
| customerName | String? | No | Free text | Denormalised customer name (snapshot at job creation) |
| customerRef | String? | No | Free text | Customer's own reference number |
| purchaseOrderNumber | String? | No | Free text | Customer's purchase order number |
| billingReference | String? | No | Free text | Customer's billing reference or cost centre code |
| declaredGoodsValue | String? | No | Numeric string (GBP) | Declared value of the goods for insurance purposes |
| billingNotes | String? | No | Free text | Notes relevant to invoicing |
| bookingContactName | String? | No | Free text | Name of the contact for booking queries |
| bookingContactPhone | String? | No | Phone string | Phone for booking queries |
| bookingContactEmail | String? | No | Email string | Email for booking queries |
| custRefRequired | Boolean | Yes | Default: `false` | Whether a customer reference must be captured before completion |
| poRequired | Boolean | Yes | Default: `false` | Whether a PO number must be captured before completion |
| plannerNotes | String? | No | Free text | Internal notes visible to the planner only |
| internalNotes | String? | No | Free text | Internal notes not visible to the driver |
| driverNoteChips | Json? | No | String array — see allowed values | Quick-select instruction chips shown to the driver. Values: `call_before_arrival` \| `report_to_security` \| `use_rear_entrance` \| `ppe_required` \| `bring_straps` \| `bring_pump_truck` \| `do_not_arrive_early` |
| driverVisibleNotes | String? | No | Free text | Free-text instructions the driver must read before the job |
| safetyInstructions | String? | No | Free text | Safety information (COSHH, hazard warnings, PPE requirements) |
| goodsType | String? | No | `pallets` \| `roll_cages` \| `machinery` \| `building_materials` \| `food_refrigerated` \| `bulk_material` \| `liquid_bulk` \| `steel_long` \| `vehicles` \| `containers` \| `general` \| `other` | High-level goods category |
| goodsDescription | String? | No | Free text | Detailed description of what is being transported |
| quantity | Float? | No | Positive number | Total quantity of goods |
| quantityUnit | String? | No | Free text | Unit of measure for quantity |
| weight | Float? | No | Decimal (kg) | Total load weight in kilograms |
| volume | Float? | No | Decimal (m³) | Total load volume in cubic metres |
| dimensions | String? | No | Free text (e.g. `4.5m × 2.2m × 3.1m`) | Overall load dimensions |
| fragile | Boolean | Yes | Default: `false` | Whether the load is fragile |
| stackable | Boolean | Yes | Default: `false` | Whether items can be stacked |
| tempControlled | Boolean | Yes | Default: `false` | Whether temperature control is required for this job's load |
| tempRange | String? | No | Free text (e.g. `2°C – 8°C`) | Required temperature range |
| hazardClass | String? | No | ADR class string | ADR hazard class if applicable |
| tunnelCode | String? | No | `B` \| `C` \| `C/D` \| `C/E` \| `D` \| `D/E` \| `E` | ADR tunnel restriction code — restricts which tunnel categories the vehicle may use |
| photosRequired | Boolean | Yes | Default: `false` | Whether photographic proof is required |
| weighbridgeRequired | Boolean | Yes | Default: `false` | Whether a weighbridge ticket must be obtained |
| securingRequirements | Json? | No | String array | Load securing equipment or methods required |
| specialRequirements | Json? | No | String array | Special requirement flags (e.g. `fragile`, `high_value`, `oversized`, `dangerous_goods`) |
| loadData | Json? | No | See **Job — loadData blob** below | Type-specific goods sub-fields (palletLines, cageCount, container details, etc.). Written directly by both intake forms. |
| vehicleCategory | String? | No | `van` \| `luton_van` \| `pickup` \| `rigid` \| `tractor` \| `drawbar` \| `heavy_haulage` \| `spmt` \| `plant` | Required vehicle body category — matches `FleetUnit.bodyCategory` |
| bodyTypes | Json? | No | String array — values match `FleetUnit.bodyType` | Required body type(s) — array because a job may accept multiple |
| minGvwClass | String? | No | `3.5t` \| `7.5t` \| `12t` \| `18t` \| `26t` \| `32t` \| `44t` | Minimum GVW class required — matches `FleetUnit.gvwClass` |
| equipment | Json? | No | String array — values match `FleetUnit.onboardEquipment` | Required onboard equipment (e.g. `tail_lift`, `hiab_crane`) |
| trailersAllowed | Json? | No | String array — values match `FleetTrailer.bodyType` | Trailer body types permitted for this job |
| vehicleAccessNotes | String? | No | Free text | General vehicle access notes |
| failureAction | String | Yes | `call_assistance` \| `return_to_depot` \| `wait` \| `other`, default `call_assistance` | What the driver should do if the job cannot be completed |
| assistancePhone | String? | No | Phone string | Phone number to call for assistance on failure |
| assistanceNote | String? | No | Free text | Instructions to include when calling for assistance |
| approvalContactName | String? | No | Free text | Name of the person to call for approval before leaving on rejection |
| approvalContactPhone | String? | No | Phone string | Phone of the approval contact |
| alternativeReturnAddress | String? | No | Free text | Street address of the alternative delivery location on rejection |
| alternativeReturnPostcode | String? | No | Postcode string | Postcode of the alternative delivery address |
| alternativeReturnContactName | String? | No | Free text | Contact name at the alternative address |
| alternativeReturnContactPhone | String? | No | Phone string | Contact phone at the alternative address |
| alternativeReturnSiteName | String? | No | Free text | Site name at the alternative address |
| alternativeReturnAddressLine2 | String? | No | Free text | Second address line at alternative address |
| alternativeReturnTown | String? | No | Free text | Town of the alternative address |
| alternativeReturnCounty | String? | No | Free text | County of the alternative address |
| alternativeReturnCountry | String? | No | Free text | Country of the alternative address |
| alternativeReturnLat | Float? | No | Decimal degrees | Latitude of the alternative address |
| alternativeReturnLng | Float? | No | Decimal degrees | Longitude of the alternative address |
| alternativeReturnNavigationInstructions | String? | No | Free text | Navigation instructions for the alternative address |
| photosRequiredOnRejection | Boolean | Yes | Default: `false` | Whether the driver must take photos if delivery is rejected |
| rejectionSignatureRequired | Boolean | Yes | Default: `false` | Whether the driver must obtain a signature from the refusing party |
| rejectionNotes | String? | No | Free text | Additional instructions for rejection / return situations |
| requirePOD | Boolean | Yes | Default: `false` | Whether a proof-of-delivery must be captured |
| validationStatus | String | Yes | `draft` \| `ready_for_planner` \| `validated` \| `issues_found`, default `draft` | Planner-side validation state |
| qualityScore | Int | Yes | 0–100, default 0 | Automated completeness / quality score |
| overrideClosed | Boolean | Yes | Default: `false` | Set by planner to confirm a quantity mismatch and force-close the job |
| overrideReason | String? | No | Free text | Reason given by planner for the quantity override |
| overrideNotes | String? | No | Free text | Additional notes on the override decision |
| overrideQuantityDelivered | Decimal? | No | Positive number | Planner-confirmed quantity actually delivered (set on override close) |
| overrideQuantityShortfall | Decimal? | No | Positive number | Planner-confirmed quantity shortfall (set on override close) |
| closedAt | DateTime? | No | ISO 8601 | Timestamp when the job was force-closed via override |
| closedBy | Int? | No | FK → User.id | User who performed the override close |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## Job — loadData blob

Stored in `Job.loadData` (Json?). Written directly by both intake forms (CJP and PRF share the builder). Contains type-specific sub-details (palletLines, cage count, container details, machinery specs, etc.).

> **Note:** Top-level load fields (`goodsType`, `goodsDescription`, `quantity`, `quantityUnit`, `weight`, `tempControlled`, `hazardClass`, etc.) are **direct columns on Job**, not stored inside this blob. `loadData` only holds the goods-type-specific repeater / sub-detail fields.

---

## JobPart (stops)

Table: `JobPart` (previously named `JobStop` — all references to `JobStop` are stale)

One row per physical piece of work on a job (collection, delivery, etc.). Multiple `JobPart` rows belong to a single `Job`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| jobId | Int | Yes | FK → Job.id | Parent job |
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
| timeWindowStart | DateTime? | No | ISO 8601 datetime | Earliest acceptable arrival datetime |
| timeWindowEnd | DateTime? | No | ISO 8601 datetime | Latest acceptable arrival datetime |
| bookedTime | DateTime? | No | ISO 8601 datetime | Exact booked appointment time |
| earliestArrivalMinutes | Int? | No | Minutes from shift start | Earliest arrival expressed as minutes from shift start |
| unloadingAllowanceMinutes | Int? | No | Minutes | Estimated time allowed for loading/unloading at this stop |
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
| heightRestriction | String | Yes | Free text (e.g. `4.2m`), default `""` | Height restriction at this specific stop |
| weightRestriction | String | Yes | Free text (e.g. `7.5t`), default `""` | Weight restriction at this specific stop |
| lengthRestriction | String | Yes | Free text (e.g. `18m`), default `""` | Length restriction at this specific stop (maximum vehicle length) |
| internalNotes | String | Yes | Free text, default `""` | Internal notes not shown to the driver |
| stopNotes | String | Yes | Free text, default `""` | Notes specific to this stop visible to the driver (e.g. partial loads, bay numbers, wait instructions) |
| status | String | Yes | `pending` \| `arrived` \| `completed` \| `skipped`, default `pending` | Execution status of this stop |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## ~~LoadDetails~~ (REMOVED — merged into Job)

> ⚠️ **This model no longer exists in the database schema.** The `LoadDetails` table was removed and all its fields were merged directly into the `Job` model. Any code referencing a `LoadDetails` table or a `loadDetails` relation is stale.
>
> **Field mapping** — if you see an old reference like `LoadDetails.goodsType`, the canonical field is now `Job.goodsType`. Full mapping:
>
> | Old `LoadDetails` field | Now on `Job` |
> |---|---|
> | `goodsType` | `Job.goodsType` |
> | `materialType` | `Job.goodsDescription` |
> | `quantity` | `Job.quantity` |
> | `unit` | `Job.quantityUnit` |
> | `weight` | `Job.weight` |
> | `volume` | `Job.volume` |
> | `dimensions` | `Job.dimensions` |
> | `fragile` | `Job.fragile` |
> | `stackable` | `Job.stackable` |
> | `tempControlled` | `Job.tempControlled` |
> | `tempRange` | `Job.tempRange` |
> | `hazardClass` | `Job.hazardClass` |
> | `notes` | `Job.internalNotes` |
> | `securingRequirements` | `Job.securingRequirements` |
> | `specialRequirements` | `Job.specialRequirements` |
> | `photosRequired` | `Job.photosRequired` |
> | `weighbridgeRequired` | `Job.weighbridgeRequired` |
> | Type-specific sub-fields | `Job.loadData` (Json blob) |

---

## Run

Table: `Run`

Execution container for a driver's day. Independent of individual jobs — jobs are linked via `RunAssignment`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| runReference | String | Yes | Unique per company (e.g. `RUN-2026-001`) | Human-readable sequential run reference |
| status | String | Yes | `draft` \| `assigned` \| `in_progress` \| `completed` \| `cancelled`, default `draft` | Current run status. `draft` = being built; `assigned` = published to driver; `in_progress` = driver started; `completed` = finished; `cancelled` = voided |
| runType | String? | No | `direct` \| `relay` \| `split` \| `consolidation` | Classification of the run structure. `direct` = single driver A-to-B; `relay` = one driver hands off to another; `split` = single job split across multiple vehicles; `consolidation` = multiple collections merged into one delivery |
| dependsOnRunId | Int? | No | FK → Run.id (self) | For relay runs: this run cannot start until the referenced run completes |
| assignedDriverId | Int? | No | FK → DriverProfile.id | Driver assigned to this run |
| assignedTruckId | Int? | No | FK → FleetUnit.id | Truck assigned to this run |
| assignedTrailerId | Int? | No | FK → FleetTrailer.id | Trailer assigned to this run |
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
| jobId | Int | Yes | FK → Job.id | Parent job of the stop (denormalised for query efficiency) |
| sequenceNumber | Int | Yes | Positive integer, unique per run | Order of this stop within the run's route |
| quantityAssigned | Decimal | Yes | Default: 0 | Quantity allocated for this stop on this run |
| quantityUnit | String | Yes | Free text, default `""` | Unit of measure for the assigned quantity |
| status | String | Yes | **enum** `EXECUTION_STATES` (loadVocab.ts): `not_started` (default) \| `en_route_pickup` \| `at_pickup` \| `loaded` \| `en_route_dropoff` \| `at_dropoff` \| `delivered` \| `exception` | Per-assignment execution state, advanced by driver events via `applyJobEvent` (Step 1). Migrated from the former `pending`/`arrived`/`completed`/`skipped`. |
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
| jobId | Int | Yes | FK → Job.id | Job this track entry belongs to |
| jobPartId | Int | Yes | FK → JobPart.id | Specific stop this track entry relates to |
| runId | Int? | No | FK → Run.id | Run during which this movement occurred |
| runAssignmentId | Int? | No | FK → RunAssignment.id | Run assignment for this movement |
| eventId | Int | Yes | FK → JobExecutionEvent.id | Execution event that triggered this entry |
| transactionType | String | Yes | **enum** — `TRANSACTION_TYPES` in `loadVocab.ts` | Type of custody transaction (see Load-movement vocabulary below) |
| quantity | Decimal | Yes | Positive number | Quantity moved in this transaction |
| unit | String | Yes | Free text, default `""` | Unit of measure |
| fromCustody | String | Yes | **enum** — `<base>` or `<base>:<ref>`, base ∈ `CUSTODY_BASES` in `loadVocab.ts` | Custody location before this transaction (see below) |
| toCustody | String | Yes | **enum** — `<base>` or `<base>:<ref>`, base ∈ `CUSTODY_BASES` in `loadVocab.ts` | Custody location after this transaction (see below) |
| driverId | Int? | No | FK → User.id | Driver who performed the movement |
| trailerId | String | Yes | Registration string, default `""` | Trailer on which the load was moved |
| timestamp | DateTime | Yes | ISO 8601 | Client-reported timestamp of the movement |
| serverReceivedAt | DateTime | Yes | ISO 8601, default now | Time the server received the event |
| gpsLat | Float? | No | Decimal degrees | GPS latitude at the time of the movement |
| gpsLng | Float? | No | Decimal degrees | GPS longitude at the time of the movement |
| notes | String? | No | Free text | Notes attached to this transaction |

---
| deletedAt | DateTime? | No | ISO 8601 | Soft-delete timestamp (custody rows are never hard-deleted — SAFETY §7) |

## Load-movement vocabulary

Canonical registry: **`loadVocab.ts`** (byte-identical in `shared/`, `api/src/constants/`, `web/src/constants/`; soft-mirrored in `mobile/src/constants/`; hash-gated by `npm run check:vocab`). Full model in **LOAD_MOVEMENT_PLAN.md** §A3–A5. These values are the single source of truth — do not introduce status/custody/transaction strings outside this registry.

**Job planning status** (`Job.status`, dimension 1 — planner/reconciler only): `draft`, `pending_review`, `ready_to_plan`, `in_planning`, `planned`, `in_execution`*, `partially_collected`*, `collected`*, `partially_delivered`*, `completed`*, `attention_needed`*, `cancelled`.  *= reconciler-derived only (`DERIVED_JOB_STATUSES`); the rest are planner-set (`PLANNER_SET_JOB_STATUSES`).

**Execution state** (per `RunAssignment`, dimension 2 — driver events only): `not_started`, `en_route_pickup`, `at_pickup`, `loaded`, `en_route_dropoff`, `at_dropoff`, `delivered`, `exception`.

**Custody bases** (`CUSTODY_BASES`, dimension 3): `customer_origin`, `on_vehicle`, `yard`, `customer_dest`, `returned`, `written_off`. Stored as `<base>` or `<base>:<ref>` (e.g. `on_vehicle:TR12`, `yard:7`, `customer_dest:341`). Terminal bases: `customer_dest`, `written_off`.

**Transaction types** (`TRANSACTION_TYPES`) and their custody transition (`TRANSACTION_CUSTODY_MAP`):

| transactionType | from base → to base |
|---|---|
| collect | customer_origin → on_vehicle |
| drop_at_yard | on_vehicle → yard |
| pick_from_yard | yard → on_vehicle |
| trailer_swap | on_vehicle → yard |
| handover | on_vehicle → on_vehicle |
| deliver | on_vehicle → customer_dest |
| split | (context) → (context) |
| consolidate | (context) → on_vehicle |
| refuse_return | on_vehicle → returned |
| damage_writeoff | (any) → written_off |

> Migration note: prior free-text custody values (`customer`, `driver:<id>`, `depot`) are superseded by this registry. They predate the LoadTrack write path (see STATUS.md for what is live), so no production data needed migrating; `plannerWorkService.ts`'s custody reader uses the registry bases.

---

## JobExecutionEvent

Table: `JobExecutionEvent`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| jobId | Int | Yes | FK → Job.id | Job the event relates to |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverId | Int | Yes | FK → User.id | Driver who raised the event |
| eventType | String | Yes | `started` \| `arrived_pickup` \| `collected` \| `arrived_dropoff` \| `completed` \| `drop_at_yard` \| `pick_from_yard` \| `trailer_swap` \| `handover_offered` \| `handover_accepted` \| `delay_reported` \| `breakdown` \| `delivery_refused` \| `damage_reported` \| `damage_writeoff` \| `cancelled` \| `note_added` | Type of execution event. Driver-triggerable set = `EVENT_DEFINITIONS` keys (sync.constants.ts); `drop_at_yard`/`pick_from_yard` added in Step 6 (yard relay); `trailer_swap` added in Step 7 (B4 — wire payload carries `yardRef` + `newTrailerReg`); `handover_offered`/`handover_accepted` added in Step 8 (B3 — the accept authors the single `handover` custody row); the exception events added in Step 11 (B8/B9/B11/B13 — `delay_reported`/`damage_reported` are state-preserving + needsReview, the others set the assignment to `exception`); `cancelled` is planner-only. |
| note | String | Yes | Free text, default `""` | Optional driver note attached to the event |
| clientEventId | String | Yes | Unique per company; UUID / device-generated | Idempotency key from the driver's device |
| clientTimestamp | DateTime | Yes | ISO 8601 | Timestamp recorded on the driver's device |
| serverReceivedAt | DateTime | Yes | ISO 8601, default now | Time the server received the event |
| appVersion | String? | No | Semver string | Mobile app version that raised the event |
| gpsLat | Float? | No | Decimal degrees | GPS latitude at the time of the event |
| gpsLng | Float? | No | Decimal degrees | GPS longitude at the time of the event |
| needsReview | Boolean | Yes | Default: `false` | Flagged for planner review (e.g. suspicious GPS, timing anomaly) |
| reviewReason | String? | No | Free text | Reason why the event was flagged for review |
| reviewedAt | DateTime? | No | ISO 8601 | S15: when a planner resolved this item from the needs-review queue (`POST /live/needs-review/:id/resolve`); `null` = still open |
| reviewedBy | Int? | No | FK → User.id | S15: the planner who resolved it |
| runId | Int? | No | FK → Run.id | Run during which this event occurred (null for pre-Run historical events) |
| runAssignmentId | Int? | No | FK → RunAssignment.id | Assignment this event relates to (null for historical events) |
| jobPartId | Int? | No | FK → JobPart.id | Stop this event relates to (null for historical events) |
| quantityConfirmed | Decimal? | No | Positive number | Quantity confirmed by the driver at this event |
| fromCustody | String? | No | **enum** — base ∈ `CUSTODY_BASES` in `loadVocab.ts` | Custody location before this event (for load transfer events) |
| toCustody | String? | No | **enum** — base ∈ `CUSTODY_BASES` in `loadVocab.ts` | Custody location after this event (for load transfer events) |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |

---
| actorUserId | Int? | No | FK → User.id | User who recorded the event (planner actions) |
| driverProfileId | Int? | No | FK → DriverProfile.id | Driver the event belongs to |

## JobAudit

Table: `JobAudit`

Job-specific append-only audit log. For all other entity types use `AuditLog`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| jobId | Int | Yes | FK → Job.id | Job this audit entry belongs to |
| changedBy | Int? | No | FK → User.id | User who made the change (null = system) |
| action | String | Yes | `created` \| `updated` \| `deleted` \| `status_change` | Type of change |
| field | String | Yes | Column or field name, default `""` | Specific field name for update events; empty for whole-record actions |
| oldValue | Json? | No | Any | Previous value before the change |
| newValue | Json? | No | Any | New value after the change |
| createdAt | DateTime | Yes | ISO 8601 | Timestamp of the action |

---
| field | String | Yes | Field name, default `""` | Specific field the audit entry refers to (empty = whole-record action) |

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
| trailerOwnership | String? | No | `company` \| `contractor` \| `third_party` \| `unregistered` (fleetVocab.ts) | Server matches trailerReg against FleetTrailer: `company` when it's ours; the driver may claim `contractor`/`third_party` for a non-fleet trailer; `unregistered` = unknown reg, no claim — flagged to the planner |
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

## ShiftPreference

Table: `ShiftPreference`

Driver-submitted preference for a specific calendar date. Created by the driver app when they want to flag a short day, overtime availability, or GPS location. One row per driver per date.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverProfileId | Int | Yes | FK → DriverProfile.id | Driver this preference belongs to |
| shiftDate | DateTime | Yes | ISO 8601 date | The specific date the preference applies to |
| preferenceType | String | Yes | `normal` \| `short_day` \| `overtime` \| `unavailable`, default `normal` | What kind of day the driver is requesting |
| requestedHours | Float? | No | Decimal hours | Requested hours for short-day requests |
| finishByTime | String? | No | `HH:MM` | Requested finish time for short-day requests |
| shortDayReason | String | Yes | Free text, default `""` | Reason given by driver for requesting a short day |
| shortDayNote | String | Yes | Free text, default `""` | Additional note from driver |
| overtimeHours | Float? | No | Decimal hours | Extra hours available for overtime requests |
| gpsLat | Float? | No | Decimal degrees | GPS latitude when preference was submitted |
| gpsLng | Float? | No | Decimal degrees | GPS longitude when preference was submitted |
| status | String | Yes | `pending` \| `approved` \| `rejected`, default `pending` | Planner review status |
| plannerNote | String | Yes | Free text, default `""` | Planner's note on their decision |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## DriverWorkingTimeSummary

Table: `DriverWorkingTimeSummary`

Aggregated weekly hours summary per driver. One row per driver per week. Updated when shifts are approved. Used for Working Time Directive compliance checks.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverProfileId | Int | Yes | FK → DriverProfile.id | Driver this summary covers |
| weekStartDate | DateTime | Yes | ISO 8601 date (Monday) | Monday of the working week |
| totalHours | Float | Yes | Decimal hours, default 0 | Total hours worked in the week (sum of approved shifts) |
| shiftCount | Int | Yes | Default: 0 | Number of approved shifts in the week |
| reducedRestUsed | Int | Yes | Default: 0 | Number of times reduced daily rest was used (EC 561/2006 limit check) |
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
| tokenHash | String | Yes | Unique SHA-256 hex | SHA-256 hash of the raw URL token — used for fast lookups |
| rawToken | String? | No | URL-safe token string | The raw token stored so it can always be shown again in the admin UI. Nullable to preserve existing rows migrated before this field was added. |
| isActive | Boolean | Yes | Default: `true` | Whether the link can currently accept new submissions |
| isMain | Boolean | Yes | Default: `false` | Whether this is the one auto-created company-wide default link. Each company has at most one `isMain = true` link. |
| expiresAt | DateTime? | No | ISO 8601 | Optional expiry date/time after which the link is rejected |
| lastUsedAt | DateTime? | No | ISO 8601 | Timestamp of the most recent successful submission |
| usageCount | Int | Yes | Default: 0 | Total number of successful submissions via this link |
| createdBy | Int | Yes | FK → User.id | User who created the link |
| templateData | Json? | No | Arbitrary key-value object | Pre-fill values injected into matching fields on the public intake form when this link is used. Common keys: `customerRef`, `goodsType`, `goodsDescription`, `unit`, `quantity`, `estimatedWeight`, `declaredGoodsValue`. Managed in the Intake Links admin page. |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## ~~JobRequest~~ (REMOVED — PRF writes directly to Job + JobPart)

The staging `JobRequest` model (top-level columns + requesterData / stops /
loadData / specialRequirementsData / transportRequirementsData / billingData /
notesData / exceptionPolicyData blobs) was **removed** in the PlannedJob → Job
schema refactor. The public request form (PRF) now validates with the SAME
`CreateJobSchema` as the internal form (CJP) and writes directly to `Job` +
`JobPart` with `status = pending_review`. Accepting a request only flips the
status and adds planner fields — nothing is copied between models.
See the **Job** and **JobPart** sections and the form-field mapping below.

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
| field | String | Yes | Field name, default `""` | Specific field name for updates (empty = whole-record action) |

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

> **Both forms write to the same place.** The internal form (`CreateJobPage`) and the
> public form (`PublicRequestForm`) submit through the same `CreateJobSchema` and write
> directly to `Job` + `JobPart` — the PRF simply lands with `status = pending_review`.
> (The former `JobRequest` staging model and the `LoadDetails` table are both removed;
> any old `JobRequest.*` / `LoadDetails.*` reference maps to `Job` / `JobPart`.)

| UI Section | Form field label | Database location (both forms) |
|---|---|---|
| **Your details** | Company / organisation name | `Job.customerName` (via customerId lookup or free text) |
| **Your details** | Contact name | `Job.bookingContactName` |
| **Your details** | Contact phone | `Job.bookingContactPhone` |
| **Your details** | Contact email | `Job.bookingContactEmail` |
| **Your details** | Your internal reference / order number | `Job.customerRef` |
| **Your details (optional)** | Notes for the planner | `Job.plannerNotes` |
| **Stops (per stop)** | Stop type | `JobPart.type` |
| **Stops (per stop)** | Collection / delivery reference | `JobPart.referenceNumber` |
| **Stops (per stop)** | Quantity at this stop | `JobPart.quantityRequired` |
| **Stops (per stop)** | Unit (per-stop quantity) | `JobPart.quantityUnit` |
| **Stops (per stop)** | Site name | `JobPart.siteName` |
| **Stops (per stop)** | Address line 1 | `JobPart.street` |
| **Stops (per stop)** | Address line 2 | `JobPart.addressLine2` |
| **Stops (per stop)** | Town / city | `JobPart.town` |
| **Stops (per stop)** | County / region | `JobPart.countyRegion` |
| **Stops (per stop)** | Postcode | `JobPart.postcode` |
| **Stops (per stop)** | Country | `JobPart.country` |
| **Stops (per stop)** | Collection / delivery date | `JobPart.timeWindowStart` (date component) |
| **Stops (per stop)** | Earliest arrival | `JobPart.timeWindowStart` or `JobPart.earliestArrivalMinutes` |
| **Stops (per stop)** | Latest arrival | `JobPart.timeWindowEnd` |
| **Stops (per stop)** | Fixed appointment time | `JobPart.bookedTime` |
| **Stops (per stop)** | Estimated loading / unloading time | `JobPart.unloadingAllowanceMinutes` |
| **Stops (per stop)** | Latitude (entrance pin) | `JobPart.lat` |
| **Stops (per stop)** | Longitude (entrance pin) | `JobPart.lng` |
| **Stops (per stop)** | Entrance instructions | `JobPart.navigationInstructions` |
| **Stops (per stop)** | How will this be loaded / unloaded? | `JobPart.handlingMethods` |
| **Stops (per stop)** | Other handling method — describe | `JobPart.handlingMethods` (serialised as `other: <text>`) |
| **Stops (per stop)** | Site access requirements | `JobPart.accessRequirements` |
| **Stops (per stop)** | Height restriction value | `JobPart.heightRestriction` |
| **Stops (per stop)** | Weight restriction value | `JobPart.weightRestriction` |
| **Stops (per stop)** | Length restriction value | `JobPart.lengthRestriction` |
| **Stops (per stop)** | Will the load be ready? | `JobPart.loadReadiness` |
| **Stops (per stop)** | Stop notes | `JobPart.stopNotes` |
| **Stops (per stop)** | Equipment exchange — Drop (full) | `JobPart.exchangeDropQty` |
| **Stops (per stop)** | Equipment exchange — Collect empties | `JobPart.exchangeCollectQty` |
| **Stops (per stop)** | Equipment exchange — Unit | `JobPart.exchangeUnit` |
| **Stops (per stop — optional)** | Proof required at this stop | `JobPart.proofRequirements` |
| **Stops (per stop — optional)** | Site contact name | `JobPart.contactName` |
| **Stops (per stop — optional)** | Site contact phone | `JobPart.contactPhone` |
| **Stops (per stop — optional)** | Site contact email | `JobPart.contactEmail` |
| **Stops (per stop — optional)** | Booking required before arrival | `JobPart.bookingRequired` |
| **Stops (per stop — optional)** | Booking reference | `JobPart.bookingRef` |
| **Stops (per stop — optional)** | Opening hours | `JobPart.openingHours` |
| **Load details** | What are you moving? (goods type) | `Job.goodsType` |
| **Load details** | Other goods type — describe | `Job.goodsType` (as free text) |
| **Load details** | Description of goods | `Job.goodsDescription` |
| **Load details** | Quantity | `Job.quantity` |
| **Load details** | Unit | `Job.quantityUnit` |
| **Load details** | Estimated total weight (kg) | `Job.weight` |
| **Load details** | Pallet types (multi-line repeater) | n/a |
| **Load details** | Weight per pallet (kg) | n/a |
| **Load details** | ISPM-15 certified wood packaging required | n/a |
| **Load details** | Pallets are stackable | `Job.stackable` |
| **Load details** | Number of cages | n/a |
| **Load details** | Cages are folded / nested | n/a |
| **Load details** | Overall load height (m) | n/a |
| **Load details** | Dimensions (L × W × H) | `Job.dimensions` |
| **Load details** | Material type (building materials) | n/a |
| **Load details** | Load is palletised (building materials) | n/a |
| **Load details** | Longest single item (m) | n/a |
| **Load details** | Weather sensitive / needs sheeting | n/a |
| **Load details** | Product description (liquid / tanker) | n/a |
| **Load details** | Food-grade product | n/a |
| **Load details** | Packaging type (general goods) | n/a |
| **Load details** | Total number of pieces (general goods) | n/a |
| **Load details** | Individual piece weight (kg) | n/a |
| **Load details** | Machine has lifting points | n/a |
| **Load details** | Machine is skid-mounted | n/a |
| **Load details** | Crane required on site | `Job.loadData` (sub-field `craneRequired`) |
| **Load details** | Number of pieces (steel) | n/a |
| **Load details** | Width of widest piece (m) | n/a |
| **Load details** | Tipping required at delivery | n/a |
| **Load details** | Wet or dry / Chilled, frozen or ambient? | n/a |
| **Load details** | Required temperature range | `Job.tempRange` |
| **Load details** | Number of vehicles | n/a |
| **Load details** | Make and model | n/a |
| **Load details** | Keys will be with the vehicle | n/a |
| **Load details** | Vehicles are driveable (RORO) | n/a |
| **Load details** | Container size | n/a |
| **Load details** | Other container size — describe | n/a |
| **Load details** | Loaded or empty? | n/a |
| **Load details** | Container number | n/a |
| **Load details** | Container ISO type | n/a |
| **Load details** | Port booking reference / release number | n/a |
| **Load details** | Terminal / port name | n/a |
| **Load details** | Port cut-off date & time | n/a |
| **Load details** | Seal number | n/a |
| **Load details** | Can this shipment be split? | `Job.canSplitShipment` |
| **Load details** | Load securing requirements | `Job.securingRequirements` |
| **Load details** | Additional load notes | `Job.internalNotes` |
| **Load details** | These goods are classified as waste | n/a |
| **Load details** | EWC code (European Waste Catalogue) | n/a |
| **Load details** | Waste Transfer Note number | n/a |
| **Load details (food)** | Temperature data logger required | n/a |
| **Load details (food)** | Clean vehicle declaration required | n/a |
| **Load details (food)** | HACCP compliance required | n/a |
| **Load details (food)** | Allergen-free vehicle required | n/a |
| **Load details** | Load is fragile | `Job.fragile` |
| **Load details** | Temperature controlled | `Job.tempControlled` |
| **Load details** | Special requirements (multi-check) | `Job.specialRequirements` |
| **Special requirements** | ADR class | `Job.hazardClass` |
| **Special requirements** | UN number | n/a |
| **Special requirements** | Packing group | n/a |
| **Special requirements** | Hazardous goods quantity (kg) | n/a |
| **Special requirements** | Hazardous paperwork available | n/a |
| **Special requirements** | Proper shipping name (ADR) | n/a |
| **Special requirements** | Subsidiary risk class | n/a |
| **Special requirements** | Flash point (°C) | n/a |
| **Special requirements** | EMS code | n/a |
| **Special requirements** | 24-hour emergency contact | n/a |
| **Special requirements** | Oversized load width (m) | n/a |
| **Special requirements** | Oversized load height (m) | n/a |
| **Special requirements** | Oversized load length (m) | n/a |
| **Special requirements** | STGO category | n/a |
| **Special requirements** | Movement order number | n/a |
| **Transport requirements** | Let the planner choose (toggle) | n/a (planner always specifies directly) |
| **Transport requirements** | Vehicle body category | `Job.vehicleCategory` |
| **Transport requirements** | Body types (multi-select) | `Job.bodyTypes` (Json array) |
| **Transport requirements** | Equipment required | `Job.equipment` |
| **Transport requirements** | Trailer types allowed | `Job.trailersAllowed` |
| **Transport requirements** | Can this job be subcontracted? | n/a |
| **Transport requirements** | CSCS card required | n/a |
| **Transport requirements** | BS7858 security vetting required | n/a |
| **Transport requirements** | DBS check level | n/a |
| **International** | Shipper EORI number | n/a |
| **International** | Consignee EORI number | n/a |
| **International** | Commodity / HS code | n/a |
| **International** | Customs movement type | n/a |
| **International** | Incoterms | n/a |
| **International** | Sea or tunnel crossing required | n/a |
| **International** | Crossing route | n/a |
| **International** | Crossing booking reference | n/a |
| **Billing** | Declared value of goods (£) | n/a (internal form does not collect) |
| **Billing** | Purchase order number | `Job.purchaseOrderNumber` |
| **Billing** | Billing reference / cost code | `Job.billingReference` |
| **Billing** | VAT registered | n/a |
| **Billing** | VAT number | n/a |
| **Driver instructions** | Driver note chips | `Job.driverNoteChips` (direct column) |
| **Driver instructions** | Driver visible notes | `Job.driverVisibleNotes` (direct column) |
| **Driver instructions** | Safety instructions | `Job.safetyInstructions` (direct column) |
| **Exception / return policy** | If delivery is rejected — what should driver do? | `Job.failureAction` / `Job.rejectionNotes` |
| **Exception / return policy** | Alternative delivery address | `Job.alternativeReturnAddress` |
| **Exception / return policy** | Alternative delivery postcode | `Job.alternativeReturnPostcode` |
| **Exception / return policy** | Contact name at alternative address | `Job.alternativeReturnContactName` |
| **Exception / return policy** | Contact phone (alternative address) | `Job.alternativeReturnContactPhone` |
| **Exception / return policy** | Approval contact name | `Job.approvalContactName` |
| **Exception / return policy** | Approval contact phone | `Job.approvalContactPhone` |
| **Exception / return policy** | Photos required on rejection | `Job.photosRequiredOnRejection` |
| **Exception / return policy** | Rejection signature required | `Job.rejectionSignatureRequired` |
| **Exception / return policy** | Additional rejection / return notes | `Job.rejectionNotes` |
| **Server-computed (not on form)** | Distance from postcode to entrance pin | n/a |
| **Server-computed (not on form)** | Entrance pin warning level | n/a |

---

## RunWaypoint

Table: `RunWaypoint`

Non-job stops on a run (depot start, yard transfer, overnight rest, return to base, custom). Ordered by `sequenceNumber` alongside `RunAssignment` rows to produce the full route sequence.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| runId | Int | Yes | FK → Run.id | Run this waypoint belongs to |
| sequenceNumber | Int | Yes | Positive integer, unique per run | Position of the waypoint in the combined route order (shared namespace with `RunAssignment.sequenceNumber`) |
| waypointType | String | Yes | `depot_start` \| `yard_pickup` \| `hub_drop` \| `return_to_base` \| `overnight_rest` \| `custom` | Type of non-job stop. `depot_start` = start of day at depot (seq ≈ 0); `yard_pickup` = collect a pre-staged trailer or unit at a yard; `hub_drop` = drop trailer at a hub / relay point; `return_to_base` = end of run (seq = 999999); `overnight_rest` = tramper overnight rest location; `custom` = generic stop |
| locationId | Int? | No | FK → SavedLocation.id | Link to a saved location (optional) |
| locationText | String? | No | Free text | One-line location description (name or address) |
| postcode | String? | No | Postcode string | Postcode of the waypoint (copied from SavedLocation if locationId given) |
| lat | Float? | No | Decimal degrees | Latitude (copied from SavedLocation if locationId given) |
| lng | Float? | No | Decimal degrees | Longitude (copied from SavedLocation if locationId given) |
| scheduledTime | String? | No | HH:MM | Planned time at this waypoint |
| notes | String? | No | Free text | Instructions or notes for this waypoint |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |

---

## DeviceToken

Table: `DeviceToken`

Expo push token for a signed-in device (S14 notifications). Write path: `POST /devices` — the driver app registers its token at login / app start. `token` is globally unique; a device that changes hands is re-pointed at the new user on re-register (upsert by token).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Company the device's user was signed into at registration |
| userId | Int | Yes | FK → User.id | User this device currently belongs to |
| token | String | Yes | Expo push token (`ExponentPushToken[...]`), unique | Transport address for push delivery |
| platform | String? | No | `ios` \| `android` | Device platform, as reported by the app |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last re-registration timestamp |

---

## Notification

Table: `Notification`

In-app notification queue row (S14). This row is the durable record the web/mobile clients read (`GET /notifications`); Expo push delivery is best-effort on top and never blocks the business transaction. `type` values come from `NOTIFICATION_TYPES` (`api/src/constants/notificationVocab.ts`): `run_published` \| `run_recalled` \| `delay_reported` \| `breakdown` \| `delivery_refused` \| `damage_reported` \| `damage_writeoff`.

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| recipientUserId | Int | Yes | FK → User.id | User this notification is for |
| type | String | Yes | `NOTIFICATION_TYPES` value (see above) | What happened |
| title | String | Yes | Short human text | Notification title (also the push title) |
| body | String | Yes | Human text | Notification body (also the push body) |
| data | Json? | No | `{ runId?, jobId?, eventType? }` | Deep-link payload for the client |
| readAt | DateTime? | No | ISO 8601 | When the recipient marked it read (`PATCH /notifications/:id/read`) |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| deletedAt | DateTime? | No | ISO 8601 | Soft delete (standard convention) |

---

## Planning API — Response types

These are API-layer response shapes, not database models. They are computed and returned by planning endpoints.

### PlanningDriver

Returned by `GET /planning/drivers?date=YYYY-MM-DD`. One row per active driver available to be assigned to runs on that date.

| Field | Type | Description |
|---|---|---|
| id | Int | DriverProfile ID |
| displayName | String | Driver's display name |
| status | String | `active` \| `inactive` |
| nightsOutAllowed | Boolean | Whether the driver is approved for overnight stays away from base (payment allowance field — independent of workPattern) |
| workPattern | String? | `day_driver` \| `night_driver` \| `tramper` — operational classification. Shown as icon in the driver dropdown on the planning board. |
| baseLat | Float? | Latitude of the driver's base postcode — used for return-to-base drive time warnings |
| baseLng | Float? | Longitude of the driver's base postcode — used for return-to-base drive time warnings |
| basePostcode | String? | Driver's base postcode (raw string) |
| user | Object? | `{ id, name, email }` — linked user account if one exists |

---

### PlannerWorkItem

Returned by `GET /planning/work-items`. One row per `JobPart` that still needs planning — nothing assigned, or only part of the quantity assigned (the remainder stays visible). Sorted and grouped by priority so planners can build runs in the right order.

| Field | Type | Description |
|---|---|---|
| jobId | Int | Parent job ID |
| jobPartId | Int | JobPart ID (the specific stop) |
| jobReference | String? | Human-readable job reference (e.g. `LB-2026-001`) |
| customerName | String? | Customer display name |
| nextAction | String | Plain-English description of what needs to happen (e.g. `Collect from Acme Leeds`) |
| currentLocation | String? | Where the load currently is (collection address or last known custody location) |
| currentPostcode | String? | Postcode of the current location |
| finalDestination | String? | Where the load is ultimately going (delivery address) |
| finalPostcode | String? | Postcode of the final destination |
| timeWindowStart | String? | ISO 8601 — earliest arrival datetime |
| timeWindowEnd | String? | ISO 8601 — latest arrival datetime |
| bookedTime | String? | ISO 8601 — fixed appointment time |
| vehicleCategory | String? | Required vehicle category (e.g. `artic`, `rigid`) |
| goodsType | String? | Goods type code (e.g. `pallets`, `food_refrigerated`) |
| goodsDescription | String? | Free-text description of goods |
| weight | Float? | Total load weight in kg |
| quantity | Float? | Quantity of goods |
| quantityUnit | String? | Unit of measure |
| assignedQuantity | Float | Quantity of this stop already on active runs (split / multi-trip shares) |
| remainingQuantity | Float? | Quantity still to plan — a partially assigned stop stays on the board showing "N of total remaining" |
| hasHazardous | Boolean | Whether any stop on this job has hazardous goods |
| hasTempControl | Boolean | Whether the load requires temperature control |
| riskLevel | `"high"` \| `"medium"` \| `"low"` \| `"none"` | Overall risk level for this work item |
| warnings | String[] | Array of plain-English warning messages for this item |
| sortScore | Float | Internal sort priority (lower = more urgent). Not displayed directly. |
| groupKey | String | Sidebar group this item belongs to. See values below. |
| postcodeDistrict | String? | UK outward code extracted from the stop's own postcode (e.g. `LS27`, `M1`, `SW1A`). Used by the sidebar "By area" filter. Null if no postcode is available. |

**groupKey values:**

| Value | Meaning |
|---|---|
| `needs_attention` | High-risk item — urgent action required |
| `in_custody` | Load has been collected and is in custody awaiting delivery |
| `today` | Has a time window or booking today |
| `vehicle_van` / `vehicle_rigid` / `vehicle_artic_curtainsider` / `vehicle_artic_fridge` / `vehicle_flatbed` / `vehicle_taillift` / `vehicle_hiab` / `vehicle_adr` | Grouped by required vehicle type |
| `direction_london` / `direction_midlands` / `direction_north` / `direction_east` / `direction_west_wales` / `direction_scotland` / `direction_local` | Broad UK geographic region (based on delivery postcode area) |
| `future` | No time window today; planned for a future date |

---

## Soft-Delete Conventions — per model

> TASK 4.4 / C.6 — one authoritative table so queries never miss the filter.
>
> Rule: every list/get query that returns operational records **must** filter by
> the appropriate deleted marker. Hard delete is only permitted for GDPR
> right-to-erasure (not yet implemented).

| Model | Delete mechanism | Field | Filter in queries |
|---|---|---|---|
| `Shift` | `status = 'deleted'` | `Shift.status` | `where: { status: { not: 'deleted' } }` |
| `FleetUnit` | `status = 'deleted'` | `FleetUnit.status` | `where: { status: { not: 'deleted' } }` |
| `HolidayRequest` | `status = 'deleted'` | `HolidayRequest.status` | `where: { status: { not: 'deleted' } }` |
| `RunAssignment` | timestamp (grandfathered) | `RunAssignment.removedAt` | `where: { removedAt: null }` |
| `LoadTrack` | timestamp (added TASK 4.3) | `LoadTrack.deletedAt` | `where: { deletedAt: null }` |
| `Run` | `status = 'cancelled'` | `Run.status` | `where: { status: { notIn: ['cancelled'] } }` |
| `Job` | `status = 'cancelled'` | `Job.status` | varies — see `Job.status` lifecycle |
| `User` | no soft delete | — | only `status = 'active'` filter |
| `DriverProfile` | `status = 'active'/'inactive'` | `DriverProfile.status` | `where: { status: 'active' }` |
| `Customer` | `status = 'active'` | `Customer.status` | `where: { status: 'active' }` |
| `ClientRequestLink` | `isActive = false` | `ClientRequestLink.isActive` | `where: { isActive: true }` |

**Convention going forward (new models):** use `deletedAt DateTime?` as the preferred soft-delete mechanism. `status`-based and `removedAt`-based approaches are grandfathered for existing models but must not be copied to new ones.

---

## Planning API — Endpoints

Key planning-specific API endpoints (supplement to the standard CRUD routes).

| Method | Path | Description |
|---|---|---|
| `GET` | `/planning/unplanned?date=YYYY-MM-DD` | Returns clustered unplanned stops for the given date. Clustering: haversine 5km radius with postcode-area fallback. |
| `GET` | `/planning/work-items?dateFrom=…&dateTo=…` | Returns sorted, grouped `PlannerWorkItem` list for the planner sidebar. |
| `GET` | `/planning/runs?date=YYYY-MM-DD` | Returns all runs (with full assignments and waypoints) for the given date. |
| `POST` | `/planning/runs` | Create a new run for a date. |
| `PATCH` | `/planning/runs/:id` | Update run fields (driver, truck, trailer, status, notes, start time). |
| `POST` | `/planning/runs/:id/assignments` | Add a job stop to a run. Body: `{ jobPartId, quantityAssigned? }`. |
| `DELETE` | `/planning/runs/:id/assignments/:assignmentId` | Remove a stop from a run (sets `removedAt`, does not hard-delete). |
| `PATCH` | `/planning/runs/:id/assignments/reorder` | Reorder stops within a run. Body: `{ assignmentIds: number[] }` — array of active RunAssignment IDs in the desired sequence. Server renumbers to 1000/2000/3000… preserving depot_start (seq=0) and return_to_base (seq=999999) waypoints. |
| `POST` | `/planning/runs/:id/publish` | Publish a run to the driver. Sets `status = assigned`, `publishedToDriver = true`. |
| `POST` | `/planning/runs/:id/waypoints` | Add a non-job waypoint to a run (depot start, yard pickup, hub drop, overnight rest, return to base, custom). |
| `DELETE` | `/planning/runs/:id/waypoints/:waypointId` | Remove a waypoint from a run. |
| `GET` | `/planning/fleet` | Returns `{ trailers, trucks, depot }` for the planner's fleet picker. |
| `GET` | `/planning/drivers?date=YYYY-MM-DD` | Returns available drivers for the given date (see `PlanningDriver` type above). |
| `POST` | `/ai/check-run` | Deterministic planning check (NOT AI). Returns `confidence`, `buffer`, `compatibility`, `geometry`, `coverage` (Q4), `capacity` (Q5a). Route loads the company's available-trailer profile and injects it for the fleet-aware capacity check. |
| `GET` | `/planning/propose-runs?date=YYYY-MM-DD` | Candidate run proposals (greedy corridor clustering + compatibility split). Each candidate is scored by `/ai/check-run` logic with the same fleet profile injected. |

---

## Planning feasibility — derived terms (in-memory, non-schema)

Computed by the planning check (`checkRunService` + `loadCapacity`); **not** persisted columns. Canonical names — do not alias.

| Term | Meaning |
|---|---|
| `confidence` | 0–100 score for a run plan; explainable deductions. `null` when coords are missing. |
| `legal` (Q3b) | `{ drivingMin, drivingBreakCount, workingMin, dutyMin, usesExtension }` — drivers'-hours summary (EC 561/2006 + WTD). |
| `drivingMin` | Total raw driving time (ORS, or haversine ×1.25 ÷ 60 km/h fallback). |
| `drivingBreakCount` | 45-min breaks required = `max(0, ceil(drivingMin / 270) − 1)` — one per 4.5h driving, leg-independent. |
| `workingMin` | Driving + loading/unloading work (30 min/stop). |
| `dutyMin` | Whole-run span: buffered drive + dwell + breaks. Compared to ~13h (`MAX_DUTY_MIN=780`) / ~11h (`LONG_DUTY_MIN=660`). |
| `usesExtension` | True when driving is in the 9–10h band (relies on the 10-hour extension, ≤2×/week). >10h is a hard fail, not an extension. |
| `coverage` (Q4) | `{ ok, uncovered[] }` — a delivery is *covered* only if its load is sourced (matching collection/pickup for the same `jobId`, a yard/depot pickup waypoint, or a feeding relay run via `hasFeederRun`). |
| `capacity` (Q5a) | `{ ok, footprint, maxSpaces, splitInto, reason }` — does the load fit the company's fleet? |
| `vehicleSuitability` (Q5b) | `{ ok, requiredClass, assignedClass, conflicts[] }` — do the run's loads agree on a vehicle class, and (when allocated) does the vehicle suit them? |
| `requiredClass` / `assignedClass` | Vehicle category (`van`/`luton_van`/`rigid`/`tractor`/`drawbar`) the loads need / the allocated vehicle is. Derived in `lib/vehicleClass.ts` (`categoryFromWeight`, `classRank`, `classCanCarry`). |
| `RunStop.reqVehicleCategory` / `reqMinGvwClass` / `reqBodyTypes` / `reqEquipment` | A job's DECLARED vehicle requirement (Job.`vehicleCategory`/`minGvwClass`/`bodyTypes`/`equipment`), threaded per stop for the suitability check. Declared takes priority; weight/pallets derive a class as fallback. |
| `assignedVehicle` | Check-run input `{ category, payloadKg?, bodyType?, equipment? }` for the allocated vehicle. A substitute passes if it meets-or-exceeds the requirement (bigger is fine). |
| `footprint` | Floor pallet spaces a load needs = `stackable ? ceil(pallets/2) : pallets`. Summed over a run's **collection** stops (peak load). |
| `maxPalletSpaces` / `maxSpaces` | Largest floor-pallet capacity among the company's **available** trailers (`buildFleetCapacityProfile`). `null` = no trailers registered. |
| `splitInto` | Recommended number of loads when `footprint > maxSpaces` = `ceil(footprint / maxSpaces)`. |
| `hasDoubleDeck` | True if any available trailer has `decks ≥ 2`. |
| `FleetCapacityProfile` | `{ maxPalletSpaces, hasDoubleDeck, trailerCount }` — derived from `FleetTrailer` (`trailerLength`/`lengthM` × `decks`; 13.6 m single deck = 26 spaces). |

`RunStop` (check-run input) carries `pallets` + `stackable` per stop. `pallets` comes from JobPart `quantityRequired`/`numPallets` when the unit is pallets; `stackable` is the Job-level flag.

`PlannerWorkItem` gains `custodyLocation` (the load's current custody ref, e.g. `yard:7`) and `inCustodySince` (ISO timestamp it entered custody) — used by the date-independent **At yard / In custody** pool so a yard-stored load (relay/DC/swap) shows every day with its age until its onward leg is delivered.

## Runs readiness — derived terms (Runs screen B1; `GET /runs/:id/readiness`)

Computed by `runReadinessService` (deterministic). **Resource** half of the Runs Readiness model — separate from Planning's `confidence`. Planning asks *is this a good movement?*; Runs asks *is this movement ready to execute?*

| Term | Meaning |
|---|---|
| `ready` | **Gate** — true only when the run has stops and every *hard* check passes. Not a percentage. |
| `blockers` | Human-readable hard failures (the reasons publish is blocked). |
| `resources.checks` | `{ key, label, status, hard, reason, source }[]` — driver assigned/available/licence/ADR/trailer-capability, trailer assigned/compatible/available, vehicle assigned/compatible, equipment, mot_inspection, vor_defects, driver_hours. `source` (`allocation` \| `driver` \| `fleet` \| `job`) names where the information is fixed (four intake gates + this screen). |
| `driver_hours` (check) | REAL since 2026-07-18: estimated run duty (drive + dwell + legal breaks + window waits, `checkRun` offline mode — haversine, no network) vs the driver's day: `ShiftPreference.requestedHours` for that date, else `DriverProfile.minHoursPerDay`. Driving >10h or duty >~13h = hard fail; longer than the driver's day, the 9–10h extension band, or availability-plan "unavailable" = warn; stops without map pins = honest unknown pointing at the job form. |
| `CheckStatus` | `pass` / `warn` / `fail` / `unknown` / `na`. `unknown` = data not captured (MOT/VOR/tacho) — never a fake tick, never blocks alone. |
| `hard` (per check) | A hard `fail` blocks publish; soft and `unknown` never block on their own. |
| `trailerCompatible` / `vehicleCompatible` (on Run, from S5) | **Carried** into readiness — Runs does NOT recompute compatibility. |
