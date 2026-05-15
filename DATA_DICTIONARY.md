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
| contactName | String | Yes | Free text, default `""` | Primary contact person at the customer |
| contactPhone | String | Yes | Phone string, default `""` | Primary contact phone number |
| contactEmail | String | Yes | Email string, default `""` | Primary contact email address |
| notes | String | Yes | Free text, default `""` | Internal notes about the customer |
| status | String | Yes | `active` \| `inactive` | Whether the customer is active |
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
| driverType | String | Yes | `permanent` \| `agency` \| `subcontractor` | Employment classification |
| licenceClass | String | Yes | `""` \| `B` \| `C1` \| `C` \| `CE` \| `D` etc. | Highest held driving licence category |
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
| status | String | Yes | `active` \| `inactive` \| `suspended` | Driver profile status |
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
| bodyCategory | String | Yes | `tractor` \| `rigid` \| `van` \| `other`, default `""` | High-level body category |
| gvwClass | String | Yes | Free text, default `""` | Gross vehicle weight class (e.g. `7.5t`, `18t`, `44t`) |
| bodyType | String | Yes | `curtainsider` \| `flatbed` \| `box` \| `tipper` \| `fridge` \| `tanker` \| `mixer` \| `other`, default `""` | Specific body type |
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
| addressText | String | Yes | Free text, default `""` | Single-line human-readable address snapshot |
| street | String | Yes | Free text, default `""` | Street address line |
| town | String | Yes | Free text, default `""` | Town or city |
| postcode | String | Yes | Postcode string, default `""` | Royal Mail postcode |
| latitude | Float? | No | Decimal degrees | Geographical latitude of the site (building centroid or entrance) |
| longitude | Float? | No | Decimal degrees | Geographical longitude of the site |
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

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| companyId | Int | Yes | FK → Company.id | Owning company |
| customerId | Int? | No | FK → Customer.id | Customer this job is for |
| customerName | String | Yes | Free text, default `""` | Denormalised customer name (snapshot at job creation) |
| templateId | Int? | No | FK → JobTemplate.id | Template this job was created from (if any) |
| assignedDriverId | Int? | No | FK → DriverProfile.id | Driver assigned to execute this job |
| createdByUserId | Int | Yes | FK → User.id | User who created the job |
| plannedDate | DateTime? | No | ISO 8601 date | Date the job is planned for |
| sequence | Int | Yes | Default: 0 | Display order within a day's run list |
| pickupLocationId | Int? | No | FK → SavedLocation.id | Collection location (top-level, for simple 2-stop jobs) |
| dropoffLocationId | Int? | No | FK → SavedLocation.id | Delivery location (top-level, for simple 2-stop jobs) |
| pickupTextSnapshot | String | Yes | Free text, default `""` | Cached text of the pickup location |
| dropoffTextSnapshot | String | Yes | Free text, default `""` | Cached text of the dropoff location |
| jobReference | String? | No | Unique per company, e.g. `LB-2026-001` | Human-readable sequential job reference |
| referenceNumber | String | Yes | Free text, default `""` | Customer-facing reference / booking number |
| materialType | String | Yes | Free text, default `""` | Short description of the goods being transported |
| quantityExpected | String | Yes | Free text, default `""` | Expected quantity of goods |
| quantityUnit | String | Yes | Free text, default `""` | Unit for the expected quantity |
| plannerNotes | String | Yes | Free text, default `""` | Internal notes visible to the planner |
| assignedTruck | String | Yes | Registration string, default `""` | Truck registration allocated to the job |
| assignedTrailer | String | Yes | Registration string, default `""` | Trailer registration allocated to the job |
| vehicleClass | String | Yes | Free text, default `""` | Vehicle class being used on the job |
| vehicleClassRequired | String | Yes | Free text, default `""` | Minimum vehicle class required (legacy field) |
| reqBodyCategory | String | Yes | `tractor` \| `rigid` \| `van` \| `other`, default `""` | Required vehicle body category |
| reqGvwMin | String | Yes | Free text (e.g. `7.5t`), default `""` | Minimum GVW required |
| reqBodyType | String | Yes | `curtainsider` \| `flatbed` \| `box` \| `tipper` \| `fridge` \| `tanker` \| `mixer` \| `other`, default `""` | Required body type |
| reqEquipment | Json? | No | String array | Required onboard equipment (e.g. `tail_lift`, `hiab_crane`) |
| reqLicenceClass | String | Yes | Licence category string, default `""` | Minimum driver licence class required |
| trailerTypesAllowed | Json? | No | String array | Trailer types permitted for this job |
| priority | String | Yes | `low` \| `normal` \| `high` \| `urgent`, default `normal` | Job planning priority |
| serviceType | String | Yes | Free text, default `""` | Service classification (e.g. `delivery`, `collection`, `multi-drop`) |
| jobType | String | Yes | Free text, default `""` | Job type category |
| jobTitle | String | Yes | Free text, default `""` | Human-readable job title shown in lists |
| customerRef | String | Yes | Free text, default `""` | Customer's own reference number |
| purchaseOrderNumber | String | Yes | Free text, default `""` | Customer's purchase order number |
| bookingContactName | String | Yes | Free text, default `""` | Name of the contact for booking queries |
| bookingContactPhone | String | Yes | Phone string, default `""` | Phone for booking queries |
| bookingContactEmail | String | Yes | Email string, default `""` | Email for booking queries |
| billingNotes | String | Yes | Free text, default `""` | Notes relevant to invoicing |
| customerInstructions | String | Yes | Free text, default `""` | Instructions passed directly from the customer |
| custRefRequired | Boolean | Yes | Default: `false` | Whether a customer reference must be captured before completion |
| poRequired | Boolean | Yes | Default: `false` | Whether a PO number must be captured before completion |
| minVehicleSize | String | Yes | Free text, default `""` | Minimum vehicle size description |
| trailerTypesForbidden | Json? | No | String array | Trailer types that may NOT be used for this job |
| equipmentRequired | Json? | No | String array | Equipment required (structured version of reqEquipment) |
| driverQualificationsReq | Json? | No | String array | Driver certifications required (e.g. `adr`, `hiab`) |
| heightRestriction | String | Yes | Free text (e.g. `4.2m`), default `""` | Height restriction applying to this job |
| weightRestriction | String | Yes | Free text (e.g. `7.5t`), default `""` | Weight restriction applying to this job |
| lengthRestriction | String | Yes | Free text (e.g. `18m`), default `""` | Length restriction applying to this job |
| vehicleAccessNotes | String | Yes | Free text, default `""` | General vehicle access notes |
| failureAction | String | Yes | `call_assistance` \| `return_to_depot` \| `wait` \| `other`, default `call_assistance` | What the driver should do if the job cannot be completed |
| assistancePhone | String | Yes | Phone string, default `""` | Phone number to call for assistance on failure |
| assistanceNote | String | Yes | Free text, default `""` | Instructions to include when calling for assistance |
| returnDestination | String | Yes | Free text, default `""` | Where to return the load if delivery fails |
| altAddress | Json? | No | Address object | Alternative delivery address (structured) |
| internalNotes | String | Yes | Free text, default `""` | Internal notes not visible to the driver |
| validationStatus | String | Yes | `draft` \| `ready_for_planner` \| `validated` \| `issues_found`, default `draft` | Planner-side validation state |
| qualityScore | Int | Yes | 0–100, default 0 | Automated completeness / quality score |
| status | String | Yes | `pending` \| `in_progress` \| `completed` \| `cancelled`, default `pending` | Current execution status |
| actualQuantity | String | Yes | Free text, default `""` | Actual quantity recorded on completion |
| actualUnit | String | Yes | Free text, default `""` | Unit for the actual quantity |
| podNumber | String | Yes | Free text, default `""` | Proof-of-delivery document number |
| collectionNote | String | Yes | Free text, default `""` | Notes from the collection event |
| deliveryNote | String | Yes | Free text, default `""` | Notes from the delivery event |
| requireCollection | Boolean | Yes | Default: `false` | Whether a collection confirmation is required |
| requirePOD | Boolean | Yes | Default: `false` | Whether a proof-of-delivery must be captured |
| requireDeliveryQty | Boolean | Yes | Default: `false` | Whether the driver must enter the delivered quantity |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## JobStop

Table: `JobStop`

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
| timeWindowStart | DateTime? | No | ISO 8601 datetime | Earliest acceptable arrival datetime |
| timeWindowEnd | DateTime? | No | ISO 8601 datetime | Latest acceptable arrival datetime |
| bookedTime | DateTime? | No | ISO 8601 datetime | Exact booked appointment time |
| earliestArrivalMinutes | Int? | No | Minutes | Earliest arrival expressed as minutes from shift start |
| unloadingAllowanceMinutes | Int? | No | Minutes | Estimated time allowed for loading/unloading at this stop |
| standingChargeNote | String | Yes | Free text, default `""` | Note relating to any standing charge at this stop |
| contactName | String | Yes | Free text, default `""` | On-site contact name |
| contactPhone | String | Yes | Phone string, default `""` | On-site contact phone |
| contactEmail | String | Yes | Email string, default `""` | On-site contact email |
| referenceNumber | String | Yes | Free text, default `""` | Collection or delivery reference number the driver presents |
| instructions | String | Yes | Free text, default `""` | General instructions for the driver at this stop |
| bookingRequired | Boolean | Yes | Default: `false` | Whether a booking must be made before arriving |
| bookingRef | String | Yes | Free text, default `""` | Booking reference if bookingRequired is true |
| openingHours | String | Yes | Free text (e.g. `Mon–Fri 06:00–18:00`), default `""` | Site opening hours |
| locationType | String | Yes | Free text, default `""` | Type of site (e.g. warehouse, port, residential) |
| navigationInstructions | String | Yes | Free text, default `""` | Entrance / navigation instructions shown to driver |
| numPallets | Int? | No | Integer | Number of pallets at this stop |
| internalNotes | String | Yes | Free text, default `""` | Internal notes not shown to the driver |
| status | String | Yes | `pending` \| `arrived` \| `completed` \| `skipped`, default `pending` | Execution status of this stop |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

---

## LoadDetails

Table: `LoadDetails`

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

## JobExecutionEvent

Table: `JobExecutionEvent`

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| id | Int | Yes (auto) | Auto-increment PK | Surrogate primary key |
| jobId | Int | Yes | FK → PlannedJob.id | Job the event relates to |
| companyId | Int | Yes | FK → Company.id | Owning company |
| driverId | Int | Yes | FK → User.id | Driver who raised the event |
| eventType | String | Yes | `started` \| `arrived_pickup` \| `collected` \| `arrived_dropoff` \| `completed` \| `cancelled` | Type of execution event |
| note | String | Yes | Free text, default `""` | Optional driver note attached to the event |
| clientEventId | String | Yes | Unique per company; UUID / device-generated | Idempotency key from the driver's device |
| clientTimestamp | DateTime | Yes | ISO 8601 | Timestamp recorded on the driver's device |
| serverReceivedAt | DateTime | Yes | ISO 8601, default now | Time the server received the event |
| appVersion | String? | No | Semver string | Mobile app version that raised the event |
| gpsLat | Float? | No | Decimal degrees | GPS latitude at the time of the event |
| gpsLng | Float? | No | Decimal degrees | GPS longitude at the time of the event |
| needsReview | Boolean | Yes | Default: `false` | Flagged for planner review (e.g. suspicious GPS, timing anomaly) |
| reviewReason | String? | No | Free text | Reason why the event was flagged for review |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |

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
| monPref–sunPref | String | Yes each | `normal` \| `early` \| `late` \| `unavailable`, defaults vary (weekdays `normal`, weekend `unavailable`) | Availability preference for each day of the week |
| monNote–sunNote | String | Yes each | Free text, default `""` | Optional note for each day |
| status | String | Yes | `draft` \| `submitted` \| `approved`, default `draft` | Submission status |
| submittedAt | DateTime? | No | ISO 8601 | When the driver submitted this week's availability |
| approvedAt | DateTime? | No | ISO 8601 | When the planner approved it |
| createdAt | DateTime | Yes | ISO 8601 | Record creation timestamp |
| updatedAt | DateTime | Yes | ISO 8601 | Last update timestamp |

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
| pricingType | String | Yes | `quote_required` \| `agreed_rate_exists` \| `contract_rate_exists` \| `to_be_confirmed`, default `quote_required` | Pricing arrangement (server-forced to `quote_required` on public form) |
| internalOfficeNotes | String? | No | Free text | Internal notes added by office staff; never exposed on the public form |
| reviewedAt | DateTime? | No | ISO 8601 | Timestamp of the accept/reject decision |
| reviewedBy | Int? | No | FK → User.id | User who reviewed the request |
| rejectionReason | String? | No | `no_capacity` \| `outside_service_area` \| `incomplete_information` \| `pricing_issue` \| `duplicate_request` \| `other` | Reason code for rejection |
| reviewNotes | String? | No | Free text | Planner's free-text notes on their decision |
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
| country | String? | No | ISO 3166-1 alpha-2 code, default `GB`. Supported: `GB` (United Kingdom), `AT` `BE` `BG` `HR` `CY` `CZ` `DK` `EE` `FI` `FR` `DE` `GR` `HU` `IE` `IT` `LV` `LT` `LU` `MT` `NL` `PL` `PT` `RO` `SK` `SI` `ES` `SE` | Country — stored as ISO code, displayed as full name in UI |
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
| handlingMethods | String[]? | No | `forklift` \| `loading_bay` \| `hiab` \| `moffett` \| `tail_lift` \| `pump_truck` \| `handball` \| `site_crane` \| `side_loading` \| `roro` \| `tipper_discharge` \| `grab` \| `pump_discharge` \| `walking_floor` \| `conveyor` \| `other` (or `other: <description>` when free-text is provided) | Methods used to load or unload the vehicle at this stop. When "other" is selected with a description, the value is serialised as `other: <free text>` |
| handlingMethodOther | String? | No | Free text | Description of the handling method when `other` is selected in handlingMethods. Substituted into the array as `other: <value>` on submission |
| proofRequirements | String[]? | No | `signature_required` \| `photos_required` \| `pod_required` \| `weighbridge_ticket_required` \| `seal_number_required` \| `name_required` | Proof documents or signatures required at this stop |
| accessRequirements | String[]? | No | `narrow_road` \| `height_restriction` \| `weight_restriction` \| `length_restriction` \| `no_artic_access` \| `no_trailer_access` \| `residential_area` \| `security_checkin` \| `ppe_required` \| `driver_id_required` \| `do_not_arrive_early` \| `holding_area_required` \| `port_access` \| `airport_access` | Site access constraints the driver needs to know |
| loadReadiness | String? | No | `ready_now` \| `ready_at_booked_time` \| `still_being_prepared` \| `unsure` | Whether the load will be ready when the driver arrives (collection stops only) |
| heightRestrictionValue | String? | No | Free text (e.g. `4.2m`) | Numeric or descriptive height restriction value (only present when `height_restriction` is in accessRequirements) |
| weightRestrictionValue | String? | No | Free text (e.g. `7.5t`) | Numeric or descriptive weight restriction value (only present when `weight_restriction` is in accessRequirements) |
| lengthRestrictionValue | String? | No | Free text (e.g. `18m`) | Numeric or descriptive length restriction value (only present when `length_restriction` is in accessRequirements) |
| entranceDistanceFromPostcode | Number? | Set server-side | Decimal miles or `null` | Distance in miles between the submitted entrance pin and the centroid of the given postcode (calculated on submission) |
| entranceWarningLevel | String? | Set server-side | `ok` \| `warn` \| `danger` | Server-computed flag: `warn` if pin is >1 mile from postcode; `danger` if >3 miles |

---

## JobRequest — loadData blob

Stored in `JobRequest.loadData` (Json column, default `{}`).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| goodsType | String | Yes | `pallets` \| `roll_cages` \| `machinery` \| `building_materials` \| `food_refrigerated` \| `bulk_material` \| `steel_long` \| `vehicles` \| `containers` \| `general` \| `other` | High-level category of goods being transported |
| goodsTypeOther | String? | No | Free text | Description of goods when goodsType = `other` |
| goodsDescription | String | Yes | Free text, min 15 characters | Detailed description of what is being transported |
| quantity | Number | Yes | Positive number | Quantity of goods |
| unit | String | Yes | `pallets` \| `tonnes` \| `kg` \| `bags` \| `items` \| `loads` \| `litres` \| `cubic_metres` \| `other` (or custom string when `other` selected) | Unit of measure for the quantity |
| estimatedWeight | Number? | Yes (validated) | Positive number (kg) | Estimated total weight of the load in kilograms |
| palletCount | Number? | No | Positive integer | Number of pallets (only when goodsType = `pallets`) |
| palletType | String? | No | `euro` \| `uk` \| `half` \| `chep` \| `other` | Type of pallets (only when goodsType = `pallets`) |
| palletTypeOther | String? | No | Free text | Description of pallet type when palletType = `other` |
| stackable | Boolean? | No | `true` \| `false` | Whether pallets can be stacked (only when goodsType = `pallets`) |
| cageCount | Number? | No | Positive integer | Number of roll cages / yorks (only when goodsType = `roll_cages`; may differ from total quantity if cages are nested/folded) |
| cageFolded | Boolean? | No | `true` \| `false` | Whether the cages are folded / nested rather than assembled (only when goodsType = `roll_cages`) |
| dimensions | String? | No | Free text (e.g. `4.5m × 2.2m × 3.1m`) | Physical dimensions — longest item length for `steel_long`; L×W×H for `machinery` |
| machineryPieceWeight | Number? | No | Positive number (kg) | Weight of one individual piece of machinery — critical for crane and HIAB capacity planning (only when goodsType = `machinery`) |
| machineryLiftingPoints | Boolean? | No | `true` \| `false` | Whether the machine has lifting points / lifting eyes (only when goodsType = `machinery`) |
| machinerySkidMounted | Boolean? | No | `true` \| `false` | Whether the machine is skid-mounted (only when goodsType = `machinery`) |
| craneRequired | Boolean? | No | `true` \| `false` | Whether a crane is needed on site (only when goodsType = `machinery`) |
| steelPieceCount | Number? | No | Positive integer | Number of individual steel pieces (only when goodsType = `steel_long`) |
| steelWidth | String? | No | Free text in metres (e.g. `2.4`) | Width of the widest piece in metres — values > 2.9 m may require an abnormal load permit (only when goodsType = `steel_long`) |
| tippingRequired | Boolean? | No | `true` \| `false` | Whether tipping is required at delivery (only when goodsType = `bulk_material`) |
| temperatureRange | String? | No | Free text (e.g. `2°C – 8°C`) | Required temperature range (only when goodsType = `food_refrigerated`) |
| chilledFrozenAmbient | String? | No | `chilled` \| `frozen` \| `ambient` \| `dry` \| `wet` | Temperature / moisture classification of the load |
| vehicleCount | Number? | No | Positive integer | Number of vehicles to be transported (only when goodsType = `vehicles`) |
| vehicleMakeModel | String? | No | Free text (e.g. `2019 Ford Transit Custom`) | Year, make and model of the vehicle(s) being transported — helps select the right transporter (only when goodsType = `vehicles`) |
| vehicleKeysWithVehicle | Boolean? | No | `true` \| `false` | Whether keys will be with the vehicle (only when goodsType = `vehicles`) |
| driveable | Boolean? | No | `true` \| `false` | Whether transported vehicles are driveable RORO (only when goodsType = `vehicles`) |
| containerSize | String? | No | `20ft` \| `40ft` \| `45ft` \| `other` | Container size (only when goodsType = `containers`) |
| containerSizeOther | String? | No | Free text | Description of container size when containerSize = `other` |
| loadedOrEmpty | String? | No | `loaded` \| `empty` | Whether the container is loaded or empty (only when goodsType = `containers`) |
| containerNumber | String? | No | Free text (e.g. `MSCU1234567`) | Container identification number |
| loadNotes | String? | No | Free text | Additional load-specific notes for the driver and planner |
| canSplitShipment | String? | No | `must_stay_together` \| `can_split_partially` \| `can_split_freely` | Whether the shipment can be split across multiple vehicles |
| securingRequirements | String[]? | No | `straps_required` \| `chains_required` \| `edge_protection_required` \| `sheets_required` \| `curtains_must_not_touch_load` \| `uprights_required` \| `temperature_monitoring_required` | Load securing equipment or methods required |

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

Stored in `JobRequest.billingData` (Json column, default `{}`).

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

Stored in `JobRequest.notesData` (Json column, default `{}`).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| driverNoteChips | String[]? | No | `call_before_arrival` \| `report_to_security` \| `use_rear_entrance` \| `ppe_required` \| `bring_straps` \| `bring_pump_truck` \| `do_not_arrive_early` | Quick-select instructions for the driver |
| driverVisibleNotes | String? | No | Free text | Free-text instructions the driver must read before the job |
| safetyInstructions | String? | No | Free text | Safety information (COSHH, hazard warnings, PPE requirements) |
| customerNotes | String? | No | Free text | Notes from the customer for the office — not shown to drivers |

---

## JobRequest — exceptionPolicyData blob

Stored in `JobRequest.exceptionPolicyData` (Json column, default `{}`).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| rejectionAction | String? | No | `call_office_before_leaving` \| `return_to_collection_point` \| `deliver_to_alternative_address` \| `wait_for_further_instruction` \| `do_not_return_without_approval` \| `other` | What the driver should do if the delivery is refused at the door |
| alternativeReturnAddress | String? | No | Free text | Street address of the alternative delivery location (only when rejectionAction = `deliver_to_alternative_address`) |
| alternativeReturnPostcode | String? | No | Postcode string | Postcode of the alternative delivery address |
| alternativeReturnContactName | String? | No | Free text | Contact name at the alternative address |
| alternativeReturnContactPhone | String? | No | Phone string | Contact phone at the alternative address |
| approvalContactName | String? | No | Free text | Name of the person to call for approval before leaving (only when rejectionAction = `call_office_before_leaving` or `do_not_return_without_approval`) |
| approvalContactPhone | String? | No | Phone string | Phone of the approval contact |
| photosRequiredOnRejection | Boolean? | No | `true` \| `false` | Whether the driver must take photos if rejected |
| rejectionSignatureRequired | Boolean? | No | `true` \| `false` | Whether the driver must obtain a signature from the refusing party |
| rejectionNotes | String? | No | Free text | Additional instructions for rejection / return situations |

---

## JobRequest — reviewData blob

Stored in `JobRequest.reviewData` (Json?, null until reviewed).

| Field | Type | Required | Values / Format | Description |
|---|---|---|---|---|
| plannerNotes | String | Yes (when present) | Free text | Planner's notes recorded when accepting the request and converting it to a PlannedJob |

---

## AuditLog

Table: `AuditLog`

Append-only. Rows are never updated or deleted.

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

The following table maps every labelled UI form field in the public `PublicRequestForm.tsx` to the database column or JSON blob path where it is stored.

| UI Section | Form field label | Database location |
|---|---|---|
| **1 — Your details** | Company / organisation name | `JobRequest.requesterData.customerCompanyName` (also denormalised to `JobRequest.customerName`) |
| **1 — Your details** | Contact name | `JobRequest.requesterData.contactName` (also denormalised to `JobRequest.contactName`) |
| **1 — Your details** | Contact phone | `JobRequest.requesterData.contactPhone` (also denormalised to `JobRequest.contactPhone`) |
| **1 — Your details** | Contact email | `JobRequest.requesterData.contactEmail` (also denormalised to `JobRequest.contactEmail`) |
| **1 — Your details** | Your internal reference / order number | `JobRequest.requesterData.customerRef` |
| **2 — Stops (per stop)** | Stop type | `JobRequest.stops[n].type` |
| **2 — Stops (per stop)** | Collection reference / Delivery reference | `JobRequest.stops[n].referenceNumber` |
| **2 — Stops (per stop)** | Quantity at this stop | `JobRequest.stops[n].stopQuantity` |
| **2 — Stops (per stop)** | Unit (per-stop quantity) | `JobRequest.stops[n].stopQuantityUnit` |
| **2 — Stops (per stop)** | Site name | `JobRequest.stops[n].siteName` |
| **2 — Stops (per stop)** | Address line 1 | `JobRequest.stops[n].street` |
| **2 — Stops (per stop)** | Town / city | `JobRequest.stops[n].town` |
| **2 — Stops (per stop)** | Postcode | `JobRequest.stops[n].postcode` |
| **2 — Stops (per stop)** | Country (dropdown, ISO alpha-2, default GB) | `JobRequest.stops[n].country` |
| **2 — Stops (per stop)** | Collection date / Delivery date | `JobRequest.stops[n].date` |
| **2 — Stops (per stop)** | Earliest arrival | `JobRequest.stops[n].earliestArrivalTime` |
| **2 — Stops (per stop)** | Collection time / Delivery time (fixed appointment only) | `JobRequest.stops[n].bookedTime` |
| **2 — Stops (per stop)** | Latest arrival | `JobRequest.stops[n].latestArrivalTime` |
| **2 — Stops (per stop)** | Estimated loading / unloading time (hours + minutes inputs) | `JobRequest.stops[n].unloadingAllowanceMinutes` |
| **2 — Stops (per stop)** | Latitude (entrance pin) | `JobRequest.stops[n].lat` |
| **2 — Stops (per stop)** | Longitude (entrance pin) | `JobRequest.stops[n].lng` |
| **2 — Stops (per stop)** | Entrance instructions | `JobRequest.stops[n].navigationInstructions` |
| **2 — Stops (per stop)** | How will this be loaded? / unloaded? (handling methods) | `JobRequest.stops[n].handlingMethods[]` |
| **2 — Stops (per stop)** | Other handling method — describe (shown when "Other" selected) | `JobRequest.stops[n].handlingMethodOther` → serialised into `handlingMethods[]` as `other: <text>` |
| **2 — Stops (per stop)** | Site access requirements | `JobRequest.stops[n].accessRequirements[]` |
| **2 — Stops (per stop)** | Height restriction value | `JobRequest.stops[n].heightRestrictionValue` |
| **2 — Stops (per stop)** | Weight restriction value | `JobRequest.stops[n].weightRestrictionValue` |
| **2 — Stops (per stop)** | Length restriction value | `JobRequest.stops[n].lengthRestrictionValue` |
| **2 — Stops (per stop)** | Will the load be ready? (load readiness) | `JobRequest.stops[n].loadReadiness` |
| **2 — Stops (per stop)** | Stop notes | `JobRequest.stops[n].stopNotes` |
| **2 — Stops (per stop)** | Equipment exchange — Drop (full) | `JobRequest.stops[n].exchangeDropQty` |
| **2 — Stops (per stop)** | Equipment exchange — Collect empties | `JobRequest.stops[n].exchangeCollectQty` |
| **2 — Stops (per stop)** | Equipment exchange — Unit | `JobRequest.stops[n].exchangeUnit` |
| **2 — Stops (per stop, always visible)** | Address line 2 | `JobRequest.stops[n].addressLine2` |
| **2 — Stops (per stop, always visible)** | County / region | `JobRequest.stops[n].countyRegion` |
| **2 — Stops (per stop — optional)** | Site contact name | `JobRequest.stops[n].contactName` |
| **2 — Stops (per stop — optional)** | Site contact phone | `JobRequest.stops[n].contactPhone` |
| **2 — Stops (per stop — optional)** | Site contact email | `JobRequest.stops[n].contactEmail` |
| **2 — Stops (per stop — optional)** | Booking required before arrival | `JobRequest.stops[n].bookingRequired` |
| **2 — Stops (per stop — optional)** | Booking reference | `JobRequest.stops[n].bookingRef` |
| **2 — Stops (per stop — optional)** | Opening hours | `JobRequest.stops[n].openingHours` |
| **2 — Stops (per stop — optional)** | Proof required at this stop | `JobRequest.stops[n].proofRequirements[]` |
| **3 — Load details** | What are you moving? (goods type) | `JobRequest.loadData.goodsType` |
| **3 — Load details** | Other goods type — describe (shown when "Other" selected) | `JobRequest.loadData.goodsTypeOther` |
| **3 — Load details** | Number of cages (roll cages / yorks) | `JobRequest.loadData.cageCount` |
| **3 — Load details** | Cages are folded / nested | `JobRequest.loadData.cageFolded` |
| **3 — Load details** | Description of goods (min 15 chars, live counter) | `JobRequest.loadData.goodsDescription` |
| **3 — Load details** | Quantity | `JobRequest.loadData.quantity` |
| **3 — Load details** | Unit | `JobRequest.loadData.unit` |
| **3 — Load details** | Estimated total weight (kg) | `JobRequest.loadData.estimatedWeight` |
| **3 — Load details** | Pallet count | `JobRequest.loadData.palletCount` |
| **3 — Load details** | Pallet type | `JobRequest.loadData.palletType` |
| **3 — Load details** | Other pallet type — describe (shown when "Other" selected) | `JobRequest.loadData.palletTypeOther` |
| **3 — Load details** | Pallets are stackable | `JobRequest.loadData.stackable` |
| **3 — Load details** | Dimensions (L × W × H) / Longest item length | `JobRequest.loadData.dimensions` |
| **3 — Load details** | Individual piece weight (kg) | `JobRequest.loadData.machineryPieceWeight` |
| **3 — Load details** | Machine has lifting points / lifting eyes | `JobRequest.loadData.machineryLiftingPoints` |
| **3 — Load details** | Machine is skid-mounted | `JobRequest.loadData.machinerySkidMounted` |
| **3 — Load details** | Crane required on site | `JobRequest.loadData.craneRequired` |
| **3 — Load details** | Number of pieces (steel) | `JobRequest.loadData.steelPieceCount` |
| **3 — Load details** | Width of widest piece (m) | `JobRequest.loadData.steelWidth` |
| **3 — Load details** | Tipping required at delivery | `JobRequest.loadData.tippingRequired` |
| **3 — Load details** | Wet or dry | `JobRequest.loadData.chilledFrozenAmbient` |
| **3 — Load details** | Chilled, frozen or ambient? | `JobRequest.loadData.chilledFrozenAmbient` |
| **3 — Load details** | Required temperature range (load section) | `JobRequest.loadData.temperatureRange` |
| **3 — Load details** | Number of vehicles | `JobRequest.loadData.vehicleCount` |
| **3 — Load details** | Make and model | `JobRequest.loadData.vehicleMakeModel` |
| **3 — Load details** | Keys will be with the vehicle | `JobRequest.loadData.vehicleKeysWithVehicle` |
| **3 — Load details** | Vehicles are driveable (RORO) | `JobRequest.loadData.driveable` |
| **3 — Load details** | Container size | `JobRequest.loadData.containerSize` |
| **3 — Load details** | Other container size — describe (shown when "Other" selected) | `JobRequest.loadData.containerSizeOther` |
| **3 — Load details** | Loaded or empty? | `JobRequest.loadData.loadedOrEmpty` |
| **3 — Load details** | Container number | `JobRequest.loadData.containerNumber` |
| **3 — Load details** | Can this shipment be split? | `JobRequest.loadData.canSplitShipment` |
| **3 — Load details** | Load securing requirements | `JobRequest.loadData.securingRequirements[]` |
| **3 — Load details** | Additional load notes | `JobRequest.loadData.loadNotes` |
| **4 — Special requirements** | Special requirement flags (multi-check) | `JobRequest.specialRequirementsData.items[]` |
| **4 — Special requirements** | ADR class | `JobRequest.specialRequirementsData.adrClass` |
| **4 — Special requirements** | UN number | `JobRequest.specialRequirementsData.unNumber` |
| **4 — Special requirements** | Packing group | `JobRequest.specialRequirementsData.packingGroup` |
| **4 — Special requirements** | Hazardous paperwork available | `JobRequest.specialRequirementsData.hazardousPaperworkAvailable` |
| **4 — Special requirements** | Required temperature range (special section) | `JobRequest.specialRequirementsData.temperatureRange` |
| **5 — Transport requirements** | Let the planner choose (toggle) | `JobRequest.transportRequirementsData.plannerDecides` |
| **5 — Transport requirements** | Vehicle body category | `JobRequest.transportRequirementsData.reqBodyCategory` |
| **5 — Transport requirements** | Body type | `JobRequest.transportRequirementsData.reqBodyType` |
| **6 — Billing & insurance** | Pricing arrangement | `JobRequest.billingData.pricingType` (note: overridden server-side to `quote_required`) |
| **6 — Billing & insurance** | Purchase order number | `JobRequest.billingData.purchaseOrderNumber` |
| **6 — Billing & insurance** | Billing reference / cost code | `JobRequest.billingData.billingReference` |
| **6 — Billing & insurance** | Declared value of goods (£) | `JobRequest.billingData.declaredGoodsValue` |
| **6 — Billing & insurance** | We are VAT registered (toggle) | `JobRequest.billingData.vatRegistered` |
| **6 — Billing & insurance** | VAT number | `JobRequest.billingData.vatNumber` |
| **7 — Notes for driver** | Quick instructions (driver chips) | `JobRequest.notesData.driverNoteChips[]` |
| **7 — Notes for driver** | Additional driver notes | `JobRequest.notesData.driverVisibleNotes` |
| **7 — Notes for driver** | Safety instructions | `JobRequest.notesData.safetyInstructions` |
| **7 — Notes for driver** | Notes for the office | `JobRequest.notesData.customerNotes` |
| **7 — Notes / Exception policy** | If delivery is rejected — what should driver do? | `JobRequest.exceptionPolicyData.rejectionAction` |
| **7 — Notes / Exception policy** | Alternative return address | `JobRequest.exceptionPolicyData.alternativeReturnAddress` |
| **7 — Notes / Exception policy** | Alternative return postcode | `JobRequest.exceptionPolicyData.alternativeReturnPostcode` |
| **7 — Notes / Exception policy** | Contact name at alternative address | `JobRequest.exceptionPolicyData.alternativeReturnContactName` |
| **7 — Notes / Exception policy** | Contact phone (alternative address) | `JobRequest.exceptionPolicyData.alternativeReturnContactPhone` |
| **7 — Notes / Exception policy** | Approval contact name | `JobRequest.exceptionPolicyData.approvalContactName` |
| **7 — Notes / Exception policy** | Approval contact phone | `JobRequest.exceptionPolicyData.approvalContactPhone` |
| **7 — Notes / Exception policy** | Photos required on rejection | `JobRequest.exceptionPolicyData.photosRequiredOnRejection` |
| **7 — Notes / Exception policy** | Rejection signature required | `JobRequest.exceptionPolicyData.rejectionSignatureRequired` |
| **7 — Notes / Exception policy** | Additional rejection / return notes | `JobRequest.exceptionPolicyData.rejectionNotes` |
| **Server-computed (not on form)** | Distance from postcode to entrance pin | `JobRequest.stops[n].entranceDistanceFromPostcode` |
| **Server-computed (not on form)** | Entrance pin warning level | `JobRequest.stops[n].entranceWarningLevel` |
