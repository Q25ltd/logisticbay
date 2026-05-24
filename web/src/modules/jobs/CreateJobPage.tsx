/**
 * Internal job creation page — mirrors the 7-section structure of PublicRequestForm.
 * Sections: Customer details → Stops → Load details → Special requirements →
 *           Transport requirements → Billing → Rejection & return policy
 *
 * Planner-only fields (driver assignment, agreed rate, planner notes) go in a separate view.
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { jobsApi } from "../../api/jobs";
import { customersApi } from "../../api/customers";
import { api } from "../../api/client";
import type { Customer, PlannedJob, SavedLocation } from "../../types";
import ParseRequestPanel from "./ParseRequestPanel";
import { aiApi } from "../../api/ai";
import type { ParsedJobData } from "../../api/ai";

import {
  GOODS_TYPES, SECURING_REQUIREMENTS, SPECIAL_REQUIREMENTS_OPTS,
  REJECTION_ACTIONS,
  COUNTRIES, POSTCODE_META,
} from "./createJobConstants";
import { today } from "./createJobUtils";
import SharedStopCard, {
  type SharedStopState,
  blankSharedStop,
  sharedStopComplete,
  sharedStopMissingFields,
  jobPartToSharedStopState,
} from "./SharedStopCard";
import {
  FieldLabel, SectionHeader, SectionFooter,
  OptionalToggle, Toggle, MultiCheck, TextField,
} from "./CreateJobFormComponents";
import CustomerSearch from "./CustomerSearch";
import {
  BODY_CATEGORIES,
  BODY_TYPES,
  bodyCategoryNeedsTrailer,
  TRAILER_BODY_TYPE_VALUES as TRAILER_BODY_TYPE_VALUES_FULL,
  BODY_TYPES_BY_CATEGORY as BODY_TYPES_BY_CATEGORY_FULL,
  type BodyCategory,
} from "../../constants/vehicleTaxonomy";

// ── Validation helpers ────────────────────────────────────────────────────────

function validatePhone(value: string, country = "GB"): string {
  const v = value.trim();
  if (!v) return "";
  try {
    if (v.startsWith("+")) return isValidPhoneNumber(v) ? "" : "Phone number doesn't look valid — check the number and country code";
    return isValidPhoneNumber(v, country as CountryCode)
      ? ""
      : "Phone number doesn't look valid for this country — include country code (+44…) if calling from abroad";
  } catch { return "Phone number doesn't look valid"; }
}

function validateEmail(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Email address doesn't look valid";
}

// ── Local constants ────────────────────────────────────────────────────────────

const LOAD_TYPES: [string, string][] = GOODS_TYPES;

const LOAD_UNITS: [string, string][] = [
  ["pallets",      "Pallets"],
  ["roll_cages",   "Roll cages / yorks"],
  ["ldm",          "Loading metres (ldm)"],
  ["tonnes",       "Tonnes"],
  ["kg",           "Kilograms"],
  ["bags",         "Bags"],
  ["items",        "Items"],
  ["loads",        "Loads"],
  ["litres",       "Litres"],
  ["cubic_metres", "Cubic metres"],
  ["other",        "Other"],
];

const SPLIT_OPTIONS: [string, string][] = [
  ["must_stay_together",  "Must stay together"],
  ["can_split_partially", "Can split partially"],
  ["can_split_freely",    "Can split freely"],
];

const BUILDING_MATERIAL_TYPES: [string, string][] = [
  ["bricks_blocks",  "Bricks / blocks"],
  ["timber",         "Timber"],
  ["aggregates",     "Aggregates / gravel / sand"],
  ["plasterboard",   "Plasterboard / drywall"],
  ["roofing",        "Roofing materials"],
  ["glass",          "Glass / glazing"],
  ["insulation",     "Insulation"],
  ["pipes_ducting",  "Pipes / ducting"],
  ["other",          "Other"],
];

const GENERAL_PACKAGING: [string, string][] = [
  ["palletised",    "Palletised"],
  ["boxed",         "Boxed / cartons"],
  ["loose",         "Loose"],
  ["shrink_wrapped","Shrink-wrapped"],
  ["other",         "Other"],
];

const TEMP_TYPE_OPTIONS: [string, string][] = [
  ["chilled", "Chilled"],
  ["frozen",  "Frozen"],
  ["ambient", "Ambient"],
];

const WET_DRY_OPTIONS: [string, string][] = [
  ["dry", "Dry"],
  ["wet", "Wet"],
];

const LOADED_EMPTY_OPTIONS: [string, string][] = [
  ["loaded", "Loaded"],
  ["empty",  "Empty"],
];

const BODY_TYPE_GROUP_LABELS: Record<string, string> = {
  general:    "General / enclosed",
  flat:       "Flat / open",
  bulk:       "Bulk & tipping",
  tanker:     "Tanker",
  temp:       "Temperature controlled",
  container:  "Container / skeletal",
  heavy:      "Heavy haulage",
  specialist: "Specialist",
  other:      "Other",
};

const REQ_BODY_TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  van:           BODY_TYPES_BY_CATEGORY_FULL.van          ?? [],
  luton_van:     BODY_TYPES_BY_CATEGORY_FULL.luton_van    ?? [],
  pickup:        BODY_TYPES_BY_CATEGORY_FULL.pickup       ?? [],
  rigid:         BODY_TYPES_BY_CATEGORY_FULL.rigid        ?? [],
  tractor:       TRAILER_BODY_TYPE_VALUES_FULL,
  drawbar:       TRAILER_BODY_TYPE_VALUES_FULL,
  heavy_haulage: ["low_loader", "low_loader_extending", "modular_heavy", "girder_frame", "other"],
  spmt:          BODY_TYPES_BY_CATEGORY_FULL.spmt         ?? [],
  plant:         ["other"],
};

const CONTAINER_ISO_TYPES: [string, string][] = [
  ["gp",    "GP — General purpose (dry)"],
  ["hc",    "HC — High cube"],
  ["rf",    "RF — Reefer / refrigerated"],
  ["ot",    "OT — Open top"],
  ["fr",    "FR — Flat rack"],
  ["tk",    "TK — Tank container"],
  ["other", "Other"],
];

const STGO_CATEGORIES: [string, string][] = [
  ["cat1", "Category 1 (up to 44t)"],
  ["cat2", "Category 2 (up to 80t)"],
  ["cat3", "Category 3 (up to 150t)"],
  ["so",   "Special Order (SO — over 150t or non-standard)"],
];

const INCOTERMS: [string, string][] = [
  ["exw", "EXW — Ex Works"],
  ["fca", "FCA — Free Carrier"],
  ["cpt", "CPT — Carriage Paid To"],
  ["cip", "CIP — Carriage & Insurance Paid"],
  ["dap", "DAP — Delivered at Place"],
  ["dpu", "DPU — Delivered at Place Unloaded"],
  ["ddp", "DDP — Delivered Duty Paid"],
  ["fas", "FAS — Free Alongside Ship"],
  ["fob", "FOB — Free on Board"],
  ["cfr", "CFR — Cost & Freight"],
  ["cif", "CIF — Cost, Insurance & Freight"],
];

const CUSTOMS_MOVEMENT_TYPES: [string, string][] = [
  ["t1",       "T1 — External Community Transit"],
  ["t2",       "T2 — Internal Community Transit"],
  ["t2f",      "T2F — Internal Transit (special territories)"],
  ["national", "National movement only"],
  ["unsure",   "Not sure — planner to advise"],
];

const CROSSING_TYPES: [string, string][] = [
  ["eurotunnel",       "Channel Tunnel (Eurotunnel Le Shuttle)"],
  ["dover_calais",     "Dover–Calais ferry"],
  ["dover_dunkirk",    "Dover–Dunkirk (DFDS)"],
  ["harwich_hook",     "Harwich–Hook of Holland"],
  ["hull_rotterdam",   "Hull–Rotterdam / Zeebrugge"],
  ["roscoff_plymouth", "Plymouth–Roscoff"],
  ["other",            "Other ferry / RoRo route"],
];

// ── Inline chip button (single-select) ────────────────────────────────────────

function Chips({ options, value, onChange }: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(value === v ? "" : v)}
          className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
            (value === v
              ? "bg-accent text-white border-accent"
              : "bg-white text-muted border-border hover:border-gray-400")}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const navigate = useNavigate();
  const { id: jobIdParam } = useParams<{ id?: string }>();
  const editJobId = jobIdParam ? parseInt(jobIdParam, 10) : null;
  const isEditMode = !!editJobId;

  const [saving, setSaving] = useState<"draft" | "ready" | null>(null);
  const [error, setError] = useState("");
  const [loadingJob, setLoadingJob] = useState(isEditMode);
  const [triedSave, setTriedSave] = useState(false);
  const [showStopErrors, setShowStopErrors] = useState(false);
  const [s1Attempted, setS1Attempted] = useState(false);
  const [s3Attempted, setS3Attempted] = useState(false);
  const [s6Attempted, setS6Attempted] = useState(false);

  // Saved locations (loaded once for stop address autocomplete)
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [companyTicker, setCompanyTicker] = useState<string | null>(null);
  const [jobReference, setJobReference] = useState<string | null>(null);

  useEffect(() => {
    jobsApi.locations().then(r => setLocations(r.data)).catch(() => {});
    api.get<{ ticker?: string | null }>("/company").then(c => setCompanyTicker(c.ticker ?? null)).catch(() => {});
  }, []);

  // ── Section collapse state ───────────────────────────────────────────────────
  const [s1, setS1] = useState(true);
  const [s2, setS2] = useState(true);
  const [s3, setS3] = useState(true);
  const [s4, setS4] = useState(true);
  const [s5, setS5] = useState(true);
  const [s6, setS6] = useState(true);

  // ── Section 01 — Customer details ───────────────────────────────────────────
  const [customerName,    setCustomerName]    = useState("");
  const [customerId,      setCustomerId]      = useState<number | null>(null);
  const [plannedDate,     setPlannedDate]     = useState(today());
  const [bookingContactName,  setBookingContactName]  = useState("");
  const [bookingContactPhone, setBookingContactPhone] = useState("");
  const [bookingContactEmail, setBookingContactEmail] = useState("");
  const [bookingContactPhoneError, setBookingContactPhoneError] = useState("");
  const [bookingContactEmailError, setBookingContactEmailError] = useState("");
  const [customerRef,     setCustomerRef]     = useState("");

  function handleCustomerChange(name: string, id: number | null, customer?: Customer) {
    setCustomerName(name);
    setCustomerId(id);
    if (customer) {
      setBookingContactName(customer.contactName   || "");
      setBookingContactPhone(customer.contactPhone || "");
      setBookingContactEmail(customer.contactEmail || "");
    }
  }

  // ── Section 02 — Stops ──────────────────────────────────────────────────────
  const [stops, setStops] = useState<SharedStopState[]>([blankSharedStop("collection"), blankSharedStop("delivery")]);

  function updateStop(id: string, patch: Partial<SharedStopState>) {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }
  function addStop() { setStops(prev => [...prev, blankSharedStop("delivery")]); }
  function removeStop(id: string) { setStops(prev => prev.filter(s => s.id !== id)); }

  const hasInternationalStop = stops.some(s => s.country && s.country !== "GB");

  useEffect(() => {
    if (hasInternationalStop) setSIntl(false);
  }, [hasInternationalStop]);

  // ── Section 03 — Load details ────────────────────────────────────────────────
  const [goodsType,         setGoodsType]        = useState("");
  const [goodsTypeOther,    setGoodsTypeOther]   = useState("");
  const [goodsDesc,         setGoodsDesc]        = useState("");
  const [quantity,          setQuantity]         = useState("");
  const [unit,              setUnit]             = useState("pallets");
  const [otherUnit,         setOtherUnit]        = useState("");
  const [estWeight,         setEstWeight]        = useState("");
  const [loadHeight,        setLoadHeight]       = useState("");
  const [canSplitShipment,  setCanSplitShipment] = useState("must_stay_together");
  const [securingRequirements, setSecuringRequirements] = useState<string[]>([]);
  const [loadNotes,         setLoadNotes]        = useState("");

  // Pallets — multi-type repeater
  interface PalletLine { id: string; type: string; typeOther: string; count: string; dimL: string; dimW: string; }
  const blankPalletLine = (): PalletLine => ({ id: `pl${Date.now()}${Math.random()}`, type: "", typeOther: "", count: "", dimL: "", dimW: "" });
  const [palletLines,       setPalletLines]      = useState<PalletLine[]>([blankPalletLine()]);
  const [stackable,         setStackable]        = useState(false);
  // Roll cages
  const [cageCount,         setCageCount]        = useState("");
  const [cageFolded,        setCageFolded]       = useState(false);
  // Machinery
  const [dimensions,        setDimensions]       = useState("");
  const [machineryPieceWeight, setMachineryPieceWeight] = useState("");
  const [machineryLiftingPoints, setMachineryLiftingPoints] = useState(false);
  const [machinerySkidMounted,  setMachinerySkidMounted]  = useState(false);
  const [craneRequired,     setCraneRequired]    = useState(false);
  // Building materials
  const [buildingMaterialType,            setBuildingMaterialType]            = useState("");
  const [buildingMaterialPalletised,      setBuildingMaterialPalletised]      = useState(false);
  const [buildingMaterialLongestItem,     setBuildingMaterialLongestItem]     = useState("");
  const [buildingMaterialWeatherSensitive, setBuildingMaterialWeatherSensitive] = useState(false);
  // Food / refrigerated
  const [tempType,          setTempType]         = useState("");
  const [tempRange,         setTempRange]        = useState("");
  const [foodPreCooled,     setFoodPreCooled]    = useState(false);
  // Bulk material
  const [tippingReq,        setTippingReq]       = useState(false);
  const [wetDry,            setWetDry]           = useState("");
  // Liquid / tanker
  const [liquidProductType, setLiquidProductType] = useState("");
  const [liquidVolumeLitres, setLiquidVolumeLitres] = useState("");
  const [liquidFoodGrade,   setLiquidFoodGrade]  = useState(false);
  // Steel / long loads
  const [steelPieceCount,   setSteelPieceCount]  = useState("");
  const [steelWidth,        setSteelWidth]       = useState("");
  // Vehicles
  const [vehicleCount,      setVehicleCount]     = useState("");
  const [vehicleMakeModel,  setVehicleMakeModel] = useState("");
  const [vehicleKeysWithVehicle, setVehicleKeysWithVehicle] = useState(false);
  const [vehicleDriveable,  setVehicleDriveable] = useState(false);
  // Containers
  const [containerSize,     setContainerSize]    = useState("");
  const [containerSizeOther, setContainerSizeOther] = useState("");
  const [loadedOrEmpty,     setLoadedOrEmpty]    = useState("");
  const [containerNum,      setContainerNum]     = useState("");
  // General
  const [generalPackagingType, setGeneralPackagingType] = useState("");
  const [generalPieceCount, setGeneralPieceCount] = useState("");

  // Pallets extra
  const [weightPerUnit,    setWeightPerUnit]    = useState("");
  const [ispm15Required,   setIspm15Required]   = useState(false);
  // Waste
  const [isWaste,          setIsWaste]          = useState(false);
  const [ewcCode,          setEwcCode]          = useState("");
  const [wasteTrnNumber,   setWasteTrnNumber]   = useState("");
  // Container extras
  const [containerIsoType,     setContainerIsoType]     = useState("");
  const [containerBookingRef,  setContainerBookingRef]  = useState("");
  const [containerTerminal,    setContainerTerminal]    = useState("");
  const [containerCutOff,      setContainerCutOff]      = useState("");
  const [containerSealNumber,  setContainerSealNumber]  = useState("");
  // Food extras
  const [foodCleanVehicle,   setFoodCleanVehicle]   = useState(false);
  const [foodHaccp,          setFoodHaccp]          = useState(false);
  const [foodAllergenFree,   setFoodAllergenFree]   = useState(false);
  const [foodTempLogger,     setFoodTempLogger]     = useState(false);

  // ── Section 04 — Special requirements ───────────────────────────────────────
  const [specialItems,       setSpecialItems]      = useState<string[]>([]);
  const [hazardClass,        setHazardClass]        = useState("");
  const [tunnelCode,         setTunnelCode]         = useState("");
  const [unNumber,           setUnNumber]          = useState("");
  const [packingGroup,       setPackingGroup]      = useState("");
  const [hazardousQtyKg,     setHazardousQtyKg]    = useState("");
  const [hazardousPaperwork, setHazardousPaperwork] = useState(false);
  const [oversizedWidth,     setOversizedWidth]    = useState("");
  const [oversizedHeight,    setOversizedHeight]   = useState("");
  const [oversizedLength,    setOversizedLength]   = useState("");
  // ADR extras
  const [adrSubsidiaryRisk,      setAdrSubsidiaryRisk]      = useState("");
  const [adrProperShippingName,  setAdrProperShippingName]  = useState("");
  const [adrFlashPoint,          setAdrFlashPoint]          = useState("");
  const [adrEmsCode,             setAdrEmsCode]             = useState("");
  const [adrEmergencyContact,    setAdrEmergencyContact]    = useState("");
  // Oversized extras
  const [stgoCategory,         setStgoCategory]         = useState("");
  const [movementOrderNumber,  setMovementOrderNumber]  = useState("");

  // ── Section 05 — Transport requirements ─────────────────────────────────────
  const [plannerDecides,     setPlannerDecides]    = useState(true);
  const [vehicleCategory,    setVehicleCategory]   = useState("");
  const [bodyTypes,          setBodyTypes]         = useState<string[]>([]);
  const [equipment,          setEquipment]         = useState<string[]>([]);
  const [trailersAllowed,    setTrailersAllowed]   = useState<string[]>([]);
  // Transport extras
  const [subcontractingAllowed, setSubcontractingAllowed] = useState("");
  const [cscsRequired,          setCscsRequired]          = useState(false);
  const [bs7858Required,        setBs7858Required]        = useState(false);
  const [dbsLevel,              setDbsLevel]              = useState("");
  // Cross-border / international
  const [sIntl, setSIntl] = useState(true);
  const [shipperEori,         setShipperEori]         = useState("");
  const [consigneeEori,       setConsigneeEori]       = useState("");
  const [hsCode,              setHsCode]              = useState("");
  const [customsMovementType, setCustomsMovementType] = useState("");
  const [incoterms,           setIncoterms]           = useState("");
  const [crossingRequired,    setCrossingRequired]    = useState(false);
  const [crossingType,        setCrossingType]        = useState("");
  const [crossingBookingRef,  setCrossingBookingRef]  = useState("");

  // AI vehicle suggestion
  const [vehicleSuggestBusy,       setVehicleSuggestBusy]       = useState(false);
  const [vehicleSuggestion,        setVehicleSuggestion]        = useState<{ vehicleCategory: string; reasoning: string; confidence: string } | null>(null);
  const [vehicleSuggestError,      setVehicleSuggestError]      = useState("");

  // ── Section 06 — Billing ─────────────────────────────────────────────────────
  const [declaredValue,       setDeclaredValue]      = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [billingRef,          setBillingRef]          = useState("");
  const [plannerNotes,        setPlannerNotes]        = useState("");
  // ── Section 07 — Rejection & return policy ───────────────────────────────────
  const [showExceptionPolicy, setShowExceptionPolicy] = useState(false);
  const [failureAction,                setFailureAction]                = useState("");
  const [altReturnSiteName,            setAltReturnSiteName]            = useState("");
  const [altReturnAddress,             setAltReturnAddress]             = useState("");
  const [altReturnAddressLine2,        setAltReturnAddressLine2]        = useState("");
  const [altReturnTown,                setAltReturnTown]                = useState("");
  const [altReturnCounty,              setAltReturnCounty]              = useState("");
  const [altReturnPostcode,            setAltReturnPostcode]            = useState("");
  const [altReturnCountry,             setAltReturnCountry]             = useState("GB");
  const [altReturnLat,                 setAltReturnLat]                 = useState("");
  const [altReturnLng,                 setAltReturnLng]                 = useState("");
  const [altReturnNavInstructions,     setAltReturnNavInstructions]     = useState("");
  const [altReturnContactName,         setAltReturnContactName]         = useState("");
  const [altReturnContactPhone,        setAltReturnContactPhone]        = useState("");
  const [approvalContactName,          setApprovalContactName]          = useState("");
  const [approvalContactPhone,         setApprovalContactPhone]         = useState("");
  const [photosOnRejection,            setPhotosOnRejection]            = useState(false);
  const [signatureOnRejection,         setSignatureOnRejection]         = useState(false);
  const [rejectionNotes,               setRejectionNotes]               = useState("");

  // ── Completeness ──────────────────────────────────────────────────────────────
  const sec1Complete = !!(customerName.trim() && bookingContactName.trim() && bookingContactPhone.trim() && bookingContactEmail.trim() && !bookingContactPhoneError && !bookingContactEmailError);
  const sec2Complete = stops.length > 0 && stops.every(sharedStopComplete) &&
    stops.some(s => s.type === "collection") && stops.some(s => s.type === "delivery");
  const sec3Complete = !!(goodsType && goodsDesc.trim().length >= 15 && quantity && unit && parseFloat(estWeight) > 0);
  const sec6Complete = !!(parseFloat(declaredValue) > 0);

  const sec1Started = !!(customerName || bookingContactName);
  const sec2Started = stops.some(s => s.siteName || s.street);
  const sec3Started = !!(goodsType || goodsDesc);
  const sec4Started = specialItems.length > 0;
  const sec5Started = !!(vehicleCategory || bodyTypes.length);
  const sec6Started = !!(declaredValue || purchaseOrderNumber);
  const hasStarted  = sec1Started || sec2Started || sec3Started || sec4Started || sec5Started || sec6Started;

  const collectionCount = stops.filter(s => s.type === "collection").length;
  const deliveryCount   = stops.filter(s => s.type === "delivery").length;
  const sec2Summary = [
    collectionCount > 0 && `${collectionCount} collection${collectionCount > 1 ? "s" : ""}`,
    deliveryCount   > 0 && `${deliveryCount} deliver${deliveryCount > 1 ? "ies" : "y"}`,
  ].filter(Boolean).join(", ");

  const sec2Missing: string[] = stops.flatMap((s, i) =>
    sharedStopMissingFields(s).map(f => `Stop ${i + 1} (${s.type}) — ${f}`)
  );

  const sec1Missing: string[] = [
    !customerName.trim()              ? "customer"        : "",
    !bookingContactName.trim()        ? "contact name"    : "",
    !bookingContactPhone.trim()       ? "contact phone"   : "",
    !bookingContactEmail.trim()       ? "contact email"   : "",
    bookingContactPhoneError          ? `phone: ${bookingContactPhoneError}` : "",
    bookingContactEmailError          ? `email: ${bookingContactEmailError}` : "",
  ].filter(Boolean) as string[];

  const sec3Missing: string[] = [
    !goodsType                    ? "goods type"                            : "",
    goodsDesc.trim().length < 15  ? "goods description (min 15 chars)"      : "",
    !quantity                     ? "quantity"                               : "",
    !unit                         ? "unit"                                   : "",
    !(parseFloat(estWeight) > 0)  ? "estimated weight"                       : "",
  ].filter(Boolean) as string[];

  const sec6Missing: string[] = [
    !(parseFloat(declaredValue) > 0) ? "declared goods value" : "",
  ].filter(Boolean) as string[];

  const MISSING: string[] = [
    !sec1Complete && "Customer details",
    !sec2Complete && "Stops",
    !sec3Complete && "Load details",
    !sec6Complete && "Billing",
  ].filter(Boolean) as string[];

  // ── Template apply ───────────────────────────────────────────────────────────
  // ── AI parse — apply extracted data to form ──────────────────────────────────
  async function applyParsedData(d: ParsedJobData) {
    // Section 1 — customer & contact
    if (d.customerName) {
      // Try to match against existing customers in the database
      try {
        const result = await customersApi.list(d.customerName);
        const matches = result.data ?? [];
        // Exact name match (case-insensitive), or the only result returned
        const match =
          matches.find(c => c.name.toLowerCase() === d.customerName!.toLowerCase()) ??
          (matches.length === 1 ? matches[0] : null);
        if (match) {
          setCustomerName(match.name);
          setCustomerId(match.id);
          // Fill contact fields from customer record if AI didn't extract them
          if (!d.bookingContactName  && match.contactName)  setBookingContactName(match.contactName);
          if (!d.bookingContactPhone && match.contactPhone) setBookingContactPhone(match.contactPhone);
          if (!d.bookingContactEmail && match.contactEmail) setBookingContactEmail(match.contactEmail);
        } else {
          setCustomerName(d.customerName);
        }
      } catch {
        setCustomerName(d.customerName);
      }
    }
    if (d.bookingContactName)  setBookingContactName(d.bookingContactName);
    if (d.bookingContactPhone) setBookingContactPhone(d.bookingContactPhone);
    if (d.bookingContactEmail) setBookingContactEmail(d.bookingContactEmail);
    if (d.customerRef)         setCustomerRef(d.customerRef);

    // Section 2 — stops
    if (d.stops && d.stops.length > 0) {
      setStops(d.stops.map(s => ({
        ...blankSharedStop(s.type),
        collapsed:        false,
        savedLocationId:  s.savedLocationId ?? null,
        siteName:         s.siteName         ?? "",
        street:           s.street           ?? "",
        addressLine2:     s.addressLine2      ?? "",
        town:             s.town             ?? "",
        postcode:         s.postcode         ?? "",
        country:          s.country          ?? "GB",
        date:             s.date             ?? "",
        earliestArrivalTime: s.earliestArrivalTime ?? "",
        latestArrivalTime:   s.latestArrivalTime   ?? "",
        bookedTime:          s.bookedTime          ?? "",
        contactName:      s.contactName  ?? "",
        contactPhone:     s.contactPhone ?? "",
        contactEmail:     s.contactEmail ?? "",
        referenceNumber:  s.referenceNumber ?? "",
        bookingRequired:  s.bookingRequired ?? false,
        bookingRef:       s.bookingRef ?? "",
        stopNotes:        s.stopNotes ?? "",
        locationQuery:    s.siteName ?? "",
      })));
    }

    // Section 3 — load
    if (d.goodsType)        setGoodsType(d.goodsType);
    if (d.goodsDescription) setGoodsDesc(d.goodsDescription);
    if (d.quantity != null) setQuantity(String(d.quantity));
    if (d.quantityUnit)     setUnit(d.quantityUnit);
    if (d.weight != null)   setEstWeight(String(d.weight));
    if (d.tempControlled)   setTempType("chilled"); // flag temp controlled; planner picks exact type

    // Section 4 — special requirements
    if (d.specialRequirements?.length) setSpecialItems(prev => [...new Set([...prev, ...d.specialRequirements!])]);
    if (d.hazardClass) setHazardClass(d.hazardClass);

    // Section 5 — transport (only if Claude is confident about vehicle)
    if (d.vehicleCategory) {
      setVehicleCategory(d.vehicleCategory);
      setPlannerDecides(false);
    }

    // Expand all sections so planner sees what was filled
    setS1(true); setS2(true); setS3(true); setS4(true); setS5(true); setS6(true);
  }

  // ── AI vehicle suggestion ────────────────────────────────────────────────────
  async function handleSuggestVehicle() {
    setVehicleSuggestBusy(true);
    setVehicleSuggestion(null);
    setVehicleSuggestError("");
    try {
      const suggestion = await aiApi.suggestVehicle({
        weight:              parseFloat(estWeight) > 0 ? parseFloat(estWeight) : undefined,
        quantity:            parseFloat(quantity)  > 0 ? parseFloat(quantity)  : undefined,
        quantityUnit:        unit || undefined,
        goodsType:           goodsType || undefined,
        goodsDescription:    goodsDesc || undefined,
        tempControlled:      !!tempType,
        hazardClass:         hazardClass || undefined,
        specialRequirements: specialItems.length ? specialItems : undefined,
        stopCount:           stops.length || undefined,
      });
      setVehicleSuggestion(suggestion);
    } catch (e: unknown) {
      setVehicleSuggestError((e as Error).message ?? "Could not get suggestion — try again");
    } finally {
      setVehicleSuggestBusy(false);
    }
  }

  function acceptVehicleSuggestion() {
    if (!vehicleSuggestion) return;
    setVehicleCategory(vehicleSuggestion.vehicleCategory);
    setPlannerDecides(false);
    setBodyTypes([]);
    setVehicleSuggestion(null);
  }

  // ── Edit mode: load job and populate all state ───────────────────────────────
  useEffect(() => {
    if (!editJobId) return;
    setLoadingJob(true);
    jobsApi.get(editJobId).then((job: PlannedJob) => {
      setCustomerName(job.customerName || job.customer?.name || "");
      setCustomerId(job.customerId ?? null);
      setPlannedDate(job.plannedDate ? job.plannedDate.slice(0, 10) : today());
      setJobReference(job.jobReference ?? null);
      setBookingContactName(job.bookingContactName || "");
      setBookingContactPhone(job.bookingContactPhone || "");
      setBookingContactEmail(job.bookingContactEmail || "");
      setCustomerRef(job.customerRef || "");
      setPurchaseOrderNumber(job.purchaseOrderNumber || "");
      if (job.plannerNotes) setPlannerNotes(job.plannerNotes);

      if (job.stops && job.stops.length > 0) {
        setStops([...job.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(jobPartToSharedStopState));
      }

      setGoodsDesc(job.goodsDescription || job.goodsType || "");
      setQuantity(job.quantity != null ? String(job.quantity) : "");
      setUnit(job.quantityUnit || "pallets");
      setEstWeight(job.weight != null ? String(job.weight) : "");
      if (job.goodsType) setGoodsType(job.goodsType);
      if (Array.isArray(job.securingRequirements)) setSecuringRequirements(job.securingRequirements as string[]);
      if (Array.isArray(job.specialRequirements))  setSpecialItems(job.specialRequirements as string[]);

      // Restore loadData blob (type-specific sub-fields)
      const ldb = (job as any).loadData as Record<string, unknown> | null;
      if (ldb) {
        // Restore pallet lines — support new palletLines array and old single-type format
        if (Array.isArray(ldb.palletLines) && (ldb.palletLines as unknown[]).length > 0) {
          setPalletLines((ldb.palletLines as { type?: string; typeOther?: string; count?: number; dimL?: number; dimW?: number }[]).map(pl => ({
            id: `pl${Date.now()}${Math.random()}`,
            type:      pl.type      ?? "",
            typeOther: pl.typeOther ?? "",
            count:     pl.count != null ? String(pl.count) : "",
            dimL:      pl.dimL  != null ? String(pl.dimL)  : "",
            dimW:      pl.dimW  != null ? String(pl.dimW)  : "",
          })));
        } else if (ldb.palletType) {
          // Legacy single-type format
          setPalletLines([{
            id: `pl${Date.now()}`,
            type:      String(ldb.palletType),
            typeOther: ldb.palletTypeOther ? String(ldb.palletTypeOther) : "",
            count:     ldb.palletCount  ? String(ldb.palletCount)  : "",
            dimL:      ldb.palletDimL   ? String(ldb.palletDimL)   : "",
            dimW:      ldb.palletDimW   ? String(ldb.palletDimW)   : "",
          }]);
        }
        if (ldb.stackable  !== undefined)   setStackable(Boolean(ldb.stackable));
        if (ldb.cageCount)                  setCageCount(String(ldb.cageCount));
        if (ldb.cageFolded !== undefined)   setCageFolded(Boolean(ldb.cageFolded));
        if (ldb.dimensions)                 setDimensions(String(ldb.dimensions));
        if (ldb.machineryPieceWeight)       setMachineryPieceWeight(String(ldb.machineryPieceWeight));
        if (ldb.liftingPoints !== undefined) setMachineryLiftingPoints(Boolean(ldb.liftingPoints));
        if (ldb.skidMounted !== undefined)  setMachinerySkidMounted(Boolean(ldb.skidMounted));
        if (ldb.craneRequired !== undefined) setCraneRequired(Boolean(ldb.craneRequired));
        if (ldb.buildingMaterialType)       setBuildingMaterialType(String(ldb.buildingMaterialType));
        if (ldb.buildingPalletised !== undefined) setBuildingMaterialPalletised(Boolean(ldb.buildingPalletised));
        if (ldb.longestItem)               setBuildingMaterialLongestItem(String(ldb.longestItem));
        if (ldb.weatherSensitive !== undefined) setBuildingMaterialWeatherSensitive(Boolean(ldb.weatherSensitive));
        if (ldb.chilledFrozenAmbient)      setTempType(String(ldb.chilledFrozenAmbient));
        if (ldb.temperatureRange)          setTempRange(String(ldb.temperatureRange));
        if (ldb.foodPreCooled !== undefined) setFoodPreCooled(Boolean(ldb.foodPreCooled));
        if (ldb.tippingRequired !== undefined) setTippingReq(Boolean(ldb.tippingRequired));
        if (ldb.wetDry)                    setWetDry(String(ldb.wetDry));
        if (ldb.liquidProductType)         setLiquidProductType(String(ldb.liquidProductType));
        if (ldb.liquidVolumeLitres)        setLiquidVolumeLitres(String(ldb.liquidVolumeLitres));
        if (ldb.liquidFoodGrade !== undefined) setLiquidFoodGrade(Boolean(ldb.liquidFoodGrade));
        if (ldb.steelPieceCount)           setSteelPieceCount(String(ldb.steelPieceCount));
        if (ldb.steelWidth)               setSteelWidth(String(ldb.steelWidth));
        if (ldb.vehicleCount)             setVehicleCount(String(ldb.vehicleCount));
        if (ldb.vehicleMakeModel)         setVehicleMakeModel(String(ldb.vehicleMakeModel));
        if (ldb.vehicleKeysWithVehicle !== undefined) setVehicleKeysWithVehicle(Boolean(ldb.vehicleKeysWithVehicle));
        if (ldb.vehicleDriveable !== undefined) setVehicleDriveable(Boolean(ldb.vehicleDriveable));
        if (ldb.containerSize)            setContainerSize(String(ldb.containerSize));
        if (ldb.containerSizeOther)       setContainerSizeOther(String(ldb.containerSizeOther));
        if (ldb.loadedOrEmpty)            setLoadedOrEmpty(String(ldb.loadedOrEmpty));
        if (ldb.containerNum)             setContainerNum(String(ldb.containerNum));
        if (ldb.generalPackagingType)     setGeneralPackagingType(String(ldb.generalPackagingType));
        if (ldb.generalPieceCount)        setGeneralPieceCount(String(ldb.generalPieceCount));
        if (ldb.loadHeight)               setLoadHeight(String(ldb.loadHeight));
        if (ldb.canSplitShipment)         setCanSplitShipment(String(ldb.canSplitShipment));
        if (ldb.loadNotes)       setLoadNotes(String(ldb.loadNotes));
        if (ldb.unNumber)        setUnNumber(String(ldb.unNumber));
        if (ldb.packingGroup)    setPackingGroup(String(ldb.packingGroup));
        if (ldb.hazardousPaperworkAvailable !== undefined) setHazardousPaperwork(Boolean(ldb.hazardousPaperworkAvailable));
        if (ldb.oversizedWidth)  setOversizedWidth(String(ldb.oversizedWidth));
        if (ldb.oversizedHeight) setOversizedHeight(String(ldb.oversizedHeight));
        if (ldb.oversizedLength) setOversizedLength(String(ldb.oversizedLength));
        // New fields
        if (ldb.weightPerUnit)       setWeightPerUnit(String(ldb.weightPerUnit));
        if (ldb.ispm15Required)      setIspm15Required(Boolean(ldb.ispm15Required));
        if (ldb.isWaste)             setIsWaste(Boolean(ldb.isWaste));
        if (ldb.ewcCode)             setEwcCode(String(ldb.ewcCode));
        if (ldb.wasteTrnNumber)      setWasteTrnNumber(String(ldb.wasteTrnNumber));
        if (ldb.containerIsoType)    setContainerIsoType(String(ldb.containerIsoType));
        if (ldb.containerBookingRef) setContainerBookingRef(String(ldb.containerBookingRef));
        if (ldb.containerTerminal)   setContainerTerminal(String(ldb.containerTerminal));
        if (ldb.containerCutOff)     setContainerCutOff(String(ldb.containerCutOff));
        if (ldb.containerSealNumber) setContainerSealNumber(String(ldb.containerSealNumber));
        if (ldb.foodCleanVehicle)    setFoodCleanVehicle(Boolean(ldb.foodCleanVehicle));
        if (ldb.foodHaccp)           setFoodHaccp(Boolean(ldb.foodHaccp));
        if (ldb.foodAllergenFree)    setFoodAllergenFree(Boolean(ldb.foodAllergenFree));
        if (ldb.foodTempLogger)      setFoodTempLogger(Boolean(ldb.foodTempLogger));
        if (ldb.adrProperShippingName) setAdrProperShippingName(String(ldb.adrProperShippingName));
        if (ldb.adrSubsidiaryRisk)   setAdrSubsidiaryRisk(String(ldb.adrSubsidiaryRisk));
        if (ldb.adrFlashPoint)       setAdrFlashPoint(String(ldb.adrFlashPoint));
        if (ldb.adrEmsCode)          setAdrEmsCode(String(ldb.adrEmsCode));
        if (ldb.adrEmergencyContact) setAdrEmergencyContact(String(ldb.adrEmergencyContact));
        if (ldb.stgoCategory)        setStgoCategory(String(ldb.stgoCategory));
        if (ldb.movementOrderNumber) setMovementOrderNumber(String(ldb.movementOrderNumber));
        if (ldb.subcontractingAllowed) setSubcontractingAllowed(String(ldb.subcontractingAllowed));
        const cbd = ldb.crossBorderData as Record<string, unknown> | undefined;
        if (cbd) {
          if (cbd.shipperEori)         setShipperEori(String(cbd.shipperEori));
          if (cbd.consigneeEori)       setConsigneeEori(String(cbd.consigneeEori));
          if (cbd.hsCode)              setHsCode(String(cbd.hsCode));
          if (cbd.customsMovementType) setCustomsMovementType(String(cbd.customsMovementType));
          if (cbd.incoterms)           setIncoterms(String(cbd.incoterms));
          if (cbd.crossingRequired)    setCrossingRequired(Boolean(cbd.crossingRequired));
          if (cbd.crossingType)        setCrossingType(String(cbd.crossingType));
          if (cbd.crossingBookingRef)  setCrossingBookingRef(String(cbd.crossingBookingRef));
        }
        const dq = ldb.driverQualifications as Record<string, unknown> | undefined;
        if (dq) {
          if (dq.cscsRequired)   setCscsRequired(Boolean(dq.cscsRequired));
          if (dq.bs7858Required) setBs7858Required(Boolean(dq.bs7858Required));
          if (dq.dbsLevel)       setDbsLevel(String(dq.dbsLevel));
        }
      }

      if (job.declaredGoodsValue) setDeclaredValue(String(job.declaredGoodsValue));
      if (job.billingReference)   setBillingRef(String(job.billingReference));
      if (job.purchaseOrderNumber) setPurchaseOrderNumber(job.purchaseOrderNumber);

      // Transport requirements
      if (job.vehicleCategory) setVehicleCategory(job.vehicleCategory);
      if (Array.isArray(job.trailersAllowed)) setTrailersAllowed(job.trailersAllowed as string[]);
      if (Array.isArray((job as any).bodyTypes)) setBodyTypes((job as any).bodyTypes as string[]);

      // Rejection / exception policy — flat Job columns (not a blob)
      if (job.failureAction && job.failureAction !== "call_assistance") setFailureAction(job.failureAction);
      if (job.alternativeReturnAddress)      setAltReturnAddress(job.alternativeReturnAddress);
      if (job.alternativeReturnPostcode)     setAltReturnPostcode(job.alternativeReturnPostcode);
      if (job.alternativeReturnContactName)  setAltReturnContactName(job.alternativeReturnContactName);
      if (job.alternativeReturnContactPhone) setAltReturnContactPhone(job.alternativeReturnContactPhone);
      if ((job as any).alternativeReturnSiteName)              setAltReturnSiteName((job as any).alternativeReturnSiteName);
      if ((job as any).alternativeReturnAddressLine2)          setAltReturnAddressLine2((job as any).alternativeReturnAddressLine2);
      if ((job as any).alternativeReturnTown)                  setAltReturnTown((job as any).alternativeReturnTown);
      if ((job as any).alternativeReturnCounty)                setAltReturnCounty((job as any).alternativeReturnCounty);
      if ((job as any).alternativeReturnCountry)               setAltReturnCountry((job as any).alternativeReturnCountry);
      if ((job as any).alternativeReturnLat != null)           setAltReturnLat(String((job as any).alternativeReturnLat));
      if ((job as any).alternativeReturnLng != null)           setAltReturnLng(String((job as any).alternativeReturnLng));
      if ((job as any).alternativeReturnNavigationInstructions) setAltReturnNavInstructions((job as any).alternativeReturnNavigationInstructions);
      if (job.approvalContactName)  setApprovalContactName(job.approvalContactName);
      if (job.approvalContactPhone) setApprovalContactPhone(job.approvalContactPhone);
      if ((job as any).photosRequiredOnRejection)  setPhotosOnRejection(true);
      if ((job as any).rejectionSignatureRequired) setSignatureOnRejection(true);
      if ((job as any).rejectionNotes)             setRejectionNotes((job as any).rejectionNotes);
      const hasEp = job.failureAction !== "call_assistance" || !!job.alternativeReturnAddress || !!job.approvalContactName;
      if (hasEp) setShowExceptionPolicy(true);

      setS1(false); setS2(false); setS3(false);
      setS4(false); setS5(false); setS6(false);
    }).catch(() => {
      setError("Could not load job for editing.");
    }).finally(() => {
      setLoadingJob(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editJobId]);

  // ── Build payload ────────────────────────────────────────────────────────────
  function buildPayload(saveMode: "draft" | "ready_to_plan"): Record<string, unknown> {
    const effectiveUnit = unit === "other" ? otherUnit : unit;

    // loadData blob: goods-type sub-details only (kept as blob per plan)
    const loadData: Record<string, unknown> = {
      goodsType,
      goodsTypeOther:    goodsType === "other" ? goodsTypeOther || undefined : undefined,
      loadHeight:        loadHeight || undefined,
      canSplitShipment,
      // pallets — multi-type
      palletLines: (() => {
        const lines = palletLines.filter(l => l.type || l.count).map(l => ({
          type:      l.type      || undefined,
          typeOther: l.type === "other" ? (l.typeOther.trim() || undefined) : undefined,
          count:     l.count ? parseInt(l.count, 10) : undefined,
          dimL:      l.type === "other" && l.dimL ? parseInt(l.dimL, 10) : undefined,
          dimW:      l.type === "other" && l.dimW ? parseInt(l.dimW, 10) : undefined,
        }));
        return lines.length > 0 ? lines : undefined;
      })(),
      stackable:         stackable    || undefined,
      // roll_cages
      cageCount:         cageCount    ? parseInt(cageCount, 10)    : undefined,
      cageFolded:        cageFolded   || undefined,
      // machinery (dimensions is a flat Job column, sent separately)
      machineryPieceWeight: machineryPieceWeight ? parseFloat(machineryPieceWeight) : undefined,
      liftingPoints:     machineryLiftingPoints  || undefined,
      skidMounted:       machinerySkidMounted    || undefined,
      craneRequired:     craneRequired           || undefined,
      // building_materials
      buildingMaterialType:       buildingMaterialType       || undefined,
      buildingPalletised:         buildingMaterialPalletised || undefined,
      longestItem:                buildingMaterialLongestItem || undefined,
      weatherSensitive:           buildingMaterialWeatherSensitive || undefined,
      // food_refrigerated
      chilledFrozenAmbient:       tempType    || undefined,
      temperatureRange:           tempRange   || undefined,
      foodPreCooled:              foodPreCooled || undefined,
      // bulk_material
      tippingRequired:            tippingReq  || undefined,
      wetDry:                     wetDry      || undefined,
      // liquid_bulk
      liquidProductType:          liquidProductType || undefined,
      liquidVolumeLitres:         liquidVolumeLitres ? parseFloat(liquidVolumeLitres) : undefined,
      liquidFoodGrade:            liquidFoodGrade   || undefined,
      // steel_long
      steelPieceCount:            steelPieceCount ? parseInt(steelPieceCount, 10) : undefined,
      steelWidth:                 steelWidth || undefined,
      // vehicles
      vehicleCount:               vehicleCount ? parseInt(vehicleCount, 10) : undefined,
      vehicleMakeModel:           vehicleMakeModel || undefined,
      vehicleKeysWithVehicle:     vehicleKeysWithVehicle || undefined,
      vehicleDriveable:           vehicleDriveable || undefined,
      // containers
      containerSize:              containerSize     || undefined,
      containerSizeOther:         containerSize === "other" ? containerSizeOther || undefined : undefined,
      loadedOrEmpty:              loadedOrEmpty     || undefined,
      containerNum:               containerNum      || undefined,
      // general
      generalPackagingType:       generalPackagingType || undefined,
      generalPieceCount:          generalPieceCount ? parseInt(generalPieceCount, 10) : undefined,
      loadNotes:  loadNotes.trim() || undefined,
      // hazmat
      unNumber:   unNumber.trim() || undefined,
      packingGroup: packingGroup.trim() || undefined,
      hazardousPaperworkAvailable: hazardousPaperwork || undefined,
      // oversized dimensions
      oversizedWidth:  oversizedWidth.trim() || undefined,
      oversizedHeight: oversizedHeight.trim() || undefined,
      oversizedLength: oversizedLength.trim() || undefined,
      // ADR extras
      adrProperShippingName: adrProperShippingName.trim() || undefined,
      adrSubsidiaryRisk:     adrSubsidiaryRisk.trim()     || undefined,
      adrFlashPoint:         adrFlashPoint.trim()         || undefined,
      adrEmsCode:            adrEmsCode.trim()            || undefined,
      adrEmergencyContact:   adrEmergencyContact.trim()   || undefined,
      // Oversized / STGO
      stgoCategory:          stgoCategory        || undefined,
      movementOrderNumber:   movementOrderNumber.trim() || undefined,
      // Pallets extra
      weightPerUnit:         weightPerUnit ? parseFloat(weightPerUnit) : undefined,
      ispm15Required:        ispm15Required || undefined,
      // Waste
      isWaste:               isWaste || undefined,
      ewcCode:               isWaste ? (ewcCode.trim() || undefined) : undefined,
      wasteTrnNumber:        isWaste ? (wasteTrnNumber.trim() || undefined) : undefined,
      // Container extras
      containerIsoType:      containerIsoType     || undefined,
      containerBookingRef:   containerBookingRef.trim() || undefined,
      containerTerminal:     containerTerminal.trim()   || undefined,
      containerCutOff:       containerCutOff      || undefined,
      containerSealNumber:   containerSealNumber.trim() || undefined,
      // Food extras
      foodCleanVehicle:      foodCleanVehicle  || undefined,
      foodHaccp:             foodHaccp         || undefined,
      foodAllergenFree:      foodAllergenFree  || undefined,
      foodTempLogger:        foodTempLogger    || undefined,
      // Transport extras
      subcontractingAllowed: subcontractingAllowed || undefined,
      driverQualifications:  (cscsRequired || bs7858Required || dbsLevel) ? {
        cscsRequired:   cscsRequired   || undefined,
        bs7858Required: bs7858Required || undefined,
        dbsLevel:       dbsLevel       || undefined,
      } : undefined,
      // Cross-border
      crossBorderData: hasInternationalStop ? {
        shipperEori:         shipperEori.trim()   || undefined,
        consigneeEori:       consigneeEori.trim() || undefined,
        hsCode:              hsCode.trim()        || undefined,
        customsMovementType: customsMovementType  || undefined,
        incoterms:           incoterms            || undefined,
        crossingRequired:    crossingRequired     || undefined,
        crossingType:        crossingType         || undefined,
        crossingBookingRef:  crossingBookingRef.trim() || undefined,
      } : undefined,
    };

    const toISO = (date: string, time: string) =>
      (date && time) ? `${date}T${time}:00.000Z` : null;

    const mappedStops = stops.map((stop, i) => {
      const customMin = Math.max(0, parseInt(stop.serviceTimeCustom, 10) || 0);
      const svcMins = stop.serviceTime === "custom" ? (customMin > 0 ? customMin : 30) : parseInt(stop.serviceTime, 10);
      return {
        sequenceNumber:          i + 1,
        type:                    stop.type,
        savedLocationId:         stop.savedLocationId,
        siteName:                stop.siteName,
        unitName:                stop.unitName || undefined,
        street:                  stop.street,
        town:                    stop.town,
        postcode:                stop.postcode,
        country:                 stop.country || undefined,
        addressLine2:            stop.addressLine2 || undefined,
        countyRegion:            stop.countyRegion || undefined,
        locationTextSnapshot:    [stop.siteName, stop.street, stop.town, stop.postcode].filter(Boolean).join(", "),
        lat:                     stop.lat ? parseFloat(stop.lat) : null,
        lng:                     stop.lng ? parseFloat(stop.lng) : null,
        navigationInstructions:  stop.navigationInstructions,
        referenceNumber:         stop.referenceNumber || undefined,
        contactName:             stop.contactName || undefined,
        contactPhone:            stop.contactPhone || undefined,
        contactEmail:            stop.contactEmail || undefined,
        bookingRequired:         stop.bookingRequired || undefined,
        bookingRef:              stop.bookingRef || undefined,
        openingHours:            stop.openingHours || undefined,
        locationType:            stop.locationType || undefined,
        instructions:            stop.instructions || undefined,
        internalNotes:           stop.internalNotes || undefined,
        // Timing: date + HH:MM → ISO datetime strings
        timeWindowStart:         toISO(stop.date, stop.earliestArrivalTime),
        timeWindowEnd:           toISO(stop.date, stop.latestArrivalTime),
        bookedTime:              toISO(stop.date, stop.bookedTime),
        unloadingAllowanceMinutes: svcMins,
        // Parity fields
        quantityRequired:        stop.quantityRequired ? parseFloat(stop.quantityRequired) : null,
        quantityUnit:            stop.quantityRequired ? stop.quantityUnit : undefined,
        exchangeDropQty:         stop.exchangeDropQty    ? parseFloat(stop.exchangeDropQty)    : null,
        exchangeCollectQty:      stop.exchangeCollectQty ? parseFloat(stop.exchangeCollectQty) : null,
        exchangeUnit:            (stop.exchangeDropQty || stop.exchangeCollectQty) ? stop.exchangeUnit : undefined,
        handlingMethods:         stop.handlingMethods.length
          ? stop.handlingMethods.map(m => m === "other" && stop.handlingMethodOther?.trim() ? `other: ${stop.handlingMethodOther.trim()}` : m)
          : null,
        accessRequirements:      [...stop.accessRequirements, ...stop.ppeItems].length
          ? [...stop.accessRequirements, ...stop.ppeItems]
          : null,
        heightRestriction:       stop.heightRestriction || undefined,
        weightRestriction:       stop.weightRestriction || undefined,
        lengthRestriction:       stop.lengthRestriction || undefined,
        proofRequirements:       stop.proofRequirements.length ? stop.proofRequirements : null,
        loadReadiness:           stop.loadReadiness || undefined,
        stopNotes:               stop.stopNotes || undefined,
      };
    });

    return {
      saveMode,
      customerId,
      customerName,
      plannedDate:              plannedDate || undefined,
      bookingContactName,
      bookingContactPhone,
      bookingContactEmail,
      customerRef,
      purchaseOrderNumber:      purchaseOrderNumber.trim() || undefined,
      serviceType:              stops.some(s => s.type === "collection") && stops.some(s => s.type === "delivery") ? "multi_drop" : stops.some(s => s.type === "collection") ? "collection" : "delivery",
      priority:                 "normal" as const,
      requirePOD:               false,
      // Load fields — flat canonical names
      goodsDescription:         goodsDesc.trim() || undefined,
      goodsType:                goodsType || undefined,
      quantity:                 quantity ? parseFloat(quantity) : undefined,
      quantityUnit:             effectiveUnit || undefined,
      weight:                   estWeight ? parseFloat(estWeight) : undefined,
      dimensions:               dimensions.trim() || undefined,
      fragile:                  specialItems.includes("fragile"),
      stackable,
      tempControlled:           !!tempType,
      tempRange:                tempRange.trim() || undefined,
      securingRequirements:     securingRequirements.length ? securingRequirements : undefined,
      canSplitShipment,
      // Special requirements — flat canonical names
      specialRequirements:      specialItems.length ? specialItems : undefined,
      hazardClass:              hazardClass.trim()  || undefined,
      tunnelCode:               tunnelCode.trim()   || undefined,
      // Transport requirements — flat canonical names
      vehicleCategory:          plannerDecides ? undefined : vehicleCategory || undefined,
      bodyTypes:                plannerDecides ? undefined : bodyTypes.length ? bodyTypes : undefined,
      equipment:                plannerDecides ? undefined : equipment.length ? equipment : undefined,
      trailersAllowed:          plannerDecides ? undefined : trailersAllowed.length ? trailersAllowed : undefined,
      // Billing — flat canonical names (schema expects strings for monetary fields)
      declaredGoodsValue:       declaredValue.trim() || undefined,
      billingReference:         billingRef.trim() || undefined,
      // Rejection / exception policy — flat canonical names
      failureAction:            failureAction || undefined,
      alternativeReturnAddress: altReturnAddress.trim() || undefined,
      alternativeReturnPostcode: altReturnPostcode.trim() || undefined,
      alternativeReturnContactName: altReturnContactName.trim() || undefined,
      alternativeReturnContactPhone: altReturnContactPhone.trim() || undefined,
      alternativeReturnSiteName:              altReturnSiteName.trim()              || undefined,
      alternativeReturnAddressLine2:          altReturnAddressLine2.trim()          || undefined,
      alternativeReturnTown:                  altReturnTown.trim()                  || undefined,
      alternativeReturnCounty:                altReturnCounty.trim()                || undefined,
      alternativeReturnCountry:               altReturnCountry !== "GB" ? altReturnCountry : undefined,
      alternativeReturnLat:                   altReturnLat ? parseFloat(altReturnLat) : undefined,
      alternativeReturnLng:                   altReturnLng ? parseFloat(altReturnLng) : undefined,
      alternativeReturnNavigationInstructions: altReturnNavInstructions.trim() || undefined,
      approvalContactName:      approvalContactName.trim() || undefined,
      approvalContactPhone:     approvalContactPhone.trim() || undefined,
      photosRequiredOnRejection: photosOnRejection,
      rejectionSignatureRequired: signatureOnRejection,
      rejectionNotes:             rejectionNotes.trim() || undefined,
      // loadData blob: goods-type sub-details (loadNotes, hazmat, oversized + all type sub-fields)
      loadData,
      stops:                    mappedStops,
      plannerNotes:             plannerNotes.trim() || undefined,
    };
  }

  // ── Save handlers ────────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    setShowStopErrors(true);
    setSaving("draft");
    setError("");
    try {
      const body = buildPayload("draft");
      if (editJobId) {
        const updated = await jobsApi.update(editJobId, body);
        navigate(`/app/jobs/${updated.id}`);
      } else {
        const newJob = await jobsApi.create(body);
        navigate(`/app/jobs/${newJob.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveReady() {
    setTriedSave(true);
    setShowStopErrors(true);
    setS1Attempted(true); setS3Attempted(true); setS6Attempted(true);

    // Validate phone/email synchronously — don't rely on setState having flushed yet
    const phoneErr = validatePhone(bookingContactPhone);
    const emailErr = validateEmail(bookingContactEmail);
    if (phoneErr) setBookingContactPhoneError(phoneErr);
    if (emailErr) setBookingContactEmailError(emailErr);

    // Re-compute sec1 with the fresh validation result (not stale state)
    const sec1OK = !!(
      customerName.trim() && bookingContactName.trim() &&
      bookingContactPhone.trim() && bookingContactEmail.trim() &&
      !phoneErr && !emailErr
    );

    const missingNow = [
      !sec1OK       && "Customer details",
      !sec2Complete && "Stops",
      !sec3Complete && "Load details",
      !sec6Complete && "Billing",
    ].filter(Boolean) as string[];

    if (missingNow.length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const stopKeys = stops.map(s => `${s.postcode.trim().toUpperCase()}|${s.date}`);
    const dupIdx = stopKeys.findIndex((k, i) => k !== "|" && stopKeys.indexOf(k) !== i);
    if (dupIdx !== -1) {
      const dup = stops[dupIdx];
      setError(`Stop ${dupIdx + 1} has the same postcode (${dup.postcode.toUpperCase()}) and date as another stop — is this a duplicate?`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving("ready");
    setError("");
    try {
      const body = buildPayload("ready_to_plan");
      if (editJobId) {
        const updated = await jobsApi.update(editJobId, body);
        navigate(`/app/jobs/${updated.id}`);
      } else {
        const newJob = await jobsApi.create(body);
        navigate(`/app/jobs/${newJob.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save job");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  if (loadingJob) {
    return <div className="flex h-64 items-center justify-center text-muted">Loading job…</div>;
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface pb-40">

      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5" style={{boxShadow: '0 1px 4px rgba(15,23,42,0.06)'}}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-muted hover:text-primary hover:border-slate-300 hover:bg-slate-50 transition-all flex-shrink-0" title="Back">←</button>
          <div>
            <h1 className="text-xl font-black text-primary">
              {isEditMode ? "Edit Job" : "New Job"}
            </h1>
            <p className="text-sm text-muted mt-0.5">
              {isEditMode
                ? "Update the fields below — changes won't be lost until you save"
                : "Fill in the sections below — save as draft any time"}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="px-4 sm:px-6 pt-4"><div className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">{error}</div></div>}

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Missing required fields indicator */}
        {triedSave && MISSING.length > 0 && (
          <div className="card border-red-300 bg-red-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-black">!</span>
              <span className="font-bold text-red-800 text-sm">
                {MISSING.length} thing{MISSING.length !== 1 ? "s" : ""} still need{MISSING.length === 1 ? "s" : ""} attention:
              </span>
            </div>
            <ul className="ml-7 space-y-1">
              {MISSING.map((e, i) => (
                <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                  <span className="flex-shrink-0 mt-0.5">•</span><span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── AI parse panel ────────────────────────────────────────────────── */}
        {!isEditMode && <ParseRequestPanel onParsed={applyParsedData} />}

        {/* ── Sec 1: Customer details ───────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={1} icon="🏢" title="Customer details" subtitle="Customer account, contact name, phone and email" active
            collapsed={s1} onToggle={() => { if (!s1 && !sec1Complete) setS1Attempted(true); setS1(o => !o); }}
            complete={sec1Complete} started={sec1Started}
            summary={customerName || bookingContactName}
            missingCount={sec1Missing.length} />
          {!s1 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div>
                <FieldLabel required>Customer</FieldLabel>
                <CustomerSearch value={customerName} linkedId={customerId} onChange={handleCustomerChange} />
                {(s1Attempted || triedSave) && !customerName.trim() && (
                  <p className="text-xs text-red-600 mt-1">Required</p>
                )}
              </div>
              <div>
                <FieldLabel required>Planned date</FieldLabel>
                <input type="date" className="input mt-1" value={plannedDate}
                  onChange={e => setPlannedDate(e.target.value)} />
              </div>
              {jobReference && (
                <div className="flex items-center gap-3 py-2 px-3 rounded-xl border bg-slate-50">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">Job Reference</div>
                    <div className="font-mono font-bold text-green-700 text-base">{jobReference}</div>
                  </div>
                  <div className="text-green-600 text-lg">✓</div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Contact name" required value={bookingContactName} onChange={setBookingContactName}
                  placeholder="Jane Smith" caseRule="proper_name"
                  error={(s1Attempted || triedSave) && !bookingContactName.trim() ? "Required" : undefined} />
                <TextField label="Contact phone" required type="tel" value={bookingContactPhone}
                  error={bookingContactPhoneError || ((s1Attempted || triedSave) && !bookingContactPhone.trim() ? "Required" : undefined)}
                  onChange={v => { setBookingContactPhone(v); setBookingContactPhoneError(""); }}
                  onBlur={v => setBookingContactPhoneError(validatePhone(v))}
                  placeholder="+44 7700 900123" />
              </div>
              <TextField label="Contact email" required type="email" value={bookingContactEmail}
                error={bookingContactEmailError || ((s1Attempted || triedSave) && !bookingContactEmail.trim() ? "Required" : undefined)}
                onChange={v => { setBookingContactEmail(v); setBookingContactEmailError(""); }}
                onBlur={v => setBookingContactEmailError(validateEmail(v))}
                placeholder="jane@acme.com" caseRule="lower" />
              <TextField label="Customer reference / order number" value={customerRef}
                onChange={setCustomerRef} placeholder="ORD-2026-1234"
                hint="Your internal reference for this job, if you have one." />
              <div>
                <FieldLabel>Notes for planner</FieldLabel>
                <textarea className="input mt-1 w-full" rows={3}
                  value={plannerNotes} onChange={e => setPlannerNotes(e.target.value)}
                  placeholder="Any context the planning team needs — constraints, customer preferences, special arrangements." />
                <div className="text-xs text-muted mt-1">Internal only — not shown to the driver or customer.</div>
              </div>
              <SectionFooter complete={sec1Complete} label="Customer details" onCollapse={() => { if (!sec1Complete) setS1Attempted(true); setS1(true); }} missing={sec1Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 2: Stops ─────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={2} icon="🗺️"
            title={sec2Summary ? `Stops — ${sec2Summary}` : "Collection & delivery stops"}
            subtitle="Where to collect from and deliver to" active
            collapsed={s2} onToggle={() => { if (!s2 && !sec2Complete) setShowStopErrors(true); setS2(o => !o); }}
            complete={sec2Complete} started={sec2Started}
            summary={sec2Summary || undefined}
            missingCount={sec2Missing.length} />
          {!s2 && (
            <div className="p-4 space-y-3">
              {stops.map((stop, idx) => {
                const typeCount = stop.type === "collection" ? collectionCount : deliveryCount;
                return (
                  <SharedStopCard key={stop.id} stop={stop} index={idx} total={stops.length}
                    savedLocations={locations}
                    onChange={patch => updateStop(stop.id, patch)}
                    onRemove={typeCount > 1 ? () => removeStop(stop.id) : undefined}
                    highlightErrors={showStopErrors} />
                );
              })}
              {/* Cross-stop time conflict warnings */}
              {(() => {
                const collections = stops.filter(s => s.type === "collection" && s.date && s.latestArrivalTime);
                const deliveries  = stops.filter(s => s.type === "delivery"   && s.date && s.earliestArrivalTime);
                const conflicts: string[] = [];
                for (const d of deliveries) {
                  for (const c of collections) {
                    if (d.date !== c.date) continue;
                    // Delivery window start is before collection window end on the same day
                    if (d.earliestArrivalTime && c.latestArrivalTime && d.earliestArrivalTime < c.latestArrivalTime) {
                      const dLabel = d.siteName?.trim() || `Delivery stop ${stops.indexOf(d) + 1}`;
                      const cLabel = c.siteName?.trim() || `Collection stop ${stops.indexOf(c) + 1}`;
                      conflicts.push(
                        `${dLabel} (delivery from ${d.earliestArrivalTime}) is before ${cLabel} (collection until ${c.latestArrivalTime}) on ${d.date} — the goods won't have been collected yet.`
                      );
                    }
                  }
                }
                if (!conflicts.length) return null;
                return (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-red-700">⚠ Time conflict — check your stop times</p>
                    {conflicts.map((msg, i) => (
                      <p key={i} className="text-xs text-red-700">{msg}</p>
                    ))}
                  </div>
                );
              })()}
              <button type="button" onClick={addStop}
                className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted hover:border-accent hover:text-accent transition-colors">
                + Add another stop
              </button>
              {!sec2Complete && sec2Started && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {!stops.some(s => s.type === "collection") && "⚠ Add at least one collection stop. "}
                  {!stops.some(s => s.type === "delivery")   && "⚠ Add at least one delivery stop."}
                </div>
              )}
              <SectionFooter complete={sec2Complete} label="Stops" onCollapse={() => { if (!sec2Complete) setShowStopErrors(true); setS2(true); }} missing={sec2Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 3: Load details ───────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={3} icon="🏗️" title="Load details" subtitle="What is being transported" active
            collapsed={s3} onToggle={() => { if (!s3 && !sec3Complete) setS3Attempted(true); setS3(o => !o); }}
            complete={sec3Complete} started={sec3Started}
            summary={goodsType
              ? `${LOAD_TYPES.find(([v]) => v === goodsType)?.[1] ?? goodsType}${goodsDesc ? ` · ${goodsDesc.slice(0, 30)}` : ""}`
              : undefined}
            missingCount={sec3Missing.length} />
          {!s3 && (
            <div className="px-5 pt-5 pb-4 space-y-5">

              {/* Goods type */}
              <div>
                <FieldLabel required>What are you moving?</FieldLabel>
                <div className={`flex flex-wrap gap-2 mt-1 ${(s3Attempted || triedSave) && !goodsType ? "p-2 rounded-xl border border-red-400" : ""}`}>
                  {LOAD_TYPES.map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => setGoodsType(goodsType === v ? "" : v)}
                      className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                        (goodsType === v
                          ? "bg-accent text-white border-accent"
                          : "bg-white text-muted border-border hover:border-gray-400")}>
                      {l}
                    </button>
                  ))}
                </div>
                {(s3Attempted || triedSave) && !goodsType && <p className="text-xs text-red-600 mt-1">Required — select a goods type</p>}
                {goodsType === "other" && (
                  <input className="input mt-2 w-full" type="text"
                    placeholder="Describe what you are moving"
                    value={goodsTypeOther} onChange={e => setGoodsTypeOther(e.target.value)} />
                )}
              </div>

              {/* Goods description */}
              <div>
                <FieldLabel required>Description of goods</FieldLabel>
                <textarea className={`input mt-1 w-full ${(s3Attempted || triedSave) && goodsDesc.trim().length < 15 ? "border-red-400 focus:border-red-500" : goodsDesc.trim().length >= 15 ? "border-green-400 focus:border-green-500" : ""}`} rows={2}
                  value={goodsDesc} onChange={e => setGoodsDesc(e.target.value)}
                  placeholder="Describe exactly what is being transported — be specific" />
                <div className={`text-xs mt-1 ${goodsDesc.trim().length >= 15 ? "text-muted" : (s3Attempted || triedSave) ? "text-red-600 font-medium" : "text-amber-600 font-medium"}`}>
                  {goodsDesc.trim().length} / 15 characters minimum
                </div>
              </div>

              {/* Quantity + unit */}
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Quantity" required type="number" min="0" step="1" value={quantity}
                  onChange={setQuantity} placeholder="24"
                  error={(s3Attempted || triedSave) && !quantity ? "Required" : undefined} />
                <div>
                  <FieldLabel required>Unit</FieldLabel>
                  <select className="input mt-1 w-full" value={unit} onChange={e => setUnit(e.target.value)}>
                    {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              {unit === "other" && (
                <TextField label="Describe unit" value={otherUnit} onChange={setOtherUnit} placeholder="e.g. rolls" />
              )}

              {/* Estimated weight */}
              <TextField label="Estimated total weight (kg)" required type="number" min="0" step="1"
                value={estWeight} onChange={setEstWeight} placeholder="14000"
                hint="Approximate is fine, but do not leave blank."
                error={(s3Attempted || triedSave) && !(parseFloat(estWeight) > 0) ? "Required" : undefined} />

              {/* Overall load height */}
              <TextField label="Overall load height (m)" type="number" min="0"
                value={loadHeight} onChange={setLoadHeight} placeholder="2.4"
                hint="Helps the planner choose the right trailer. Leave blank if unsure." />

              {/* ── Pallets ── */}
              {(goodsType === "pallets" || unit === "pallets") && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Pallet types on this load</FieldLabel>
                    <div className="text-xs text-muted mb-2">Add a line for each different pallet type — e.g. 10 Euro + 5 UK.</div>
                    <div className="space-y-2">
                      {palletLines.map((line, idx) => (
                        <div key={line.id} className="space-y-2">
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              {idx === 0 && <FieldLabel>Type</FieldLabel>}
                              <select className="input w-full mt-1" value={line.type}
                                onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, type: e.target.value, typeOther: "", dimL: "", dimW: "" } : l))}>
                                <option value="">Not specified</option>
                                <option value="euro">Euro (800×1200mm)</option>
                                <option value="uk">UK (1000×1200mm)</option>
                                <option value="half">Half pallets</option>
                                <option value="chep">CHEP</option>
                                <option value="other">Other / custom</option>
                              </select>
                            </div>
                            <div className="w-28 flex-shrink-0">
                              {idx === 0 && <FieldLabel>Count</FieldLabel>}
                              <input className="input w-full mt-1 font-mono" type="number" min="0" step="1"
                                placeholder="0"
                                value={line.count}
                                onKeyDown={e => { if (["e","E","-","."].includes(e.key)) e.preventDefault(); }}
                                onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, count: e.target.value } : l))} />
                            </div>
                            {palletLines.length > 1 && (
                              <button type="button"
                                className="text-xs text-red-400 hover:text-red-600 transition-colors pb-2 flex-shrink-0"
                                onClick={() => setPalletLines(prev => prev.filter(l => l.id !== line.id))}>
                                Remove
                              </button>
                            )}
                          </div>
                          {line.type === "other" && (
                            <div className="pl-2 border-l-2 border-slate-200 space-y-2">
                              <input className="input w-full" type="text"
                                placeholder="Describe pallet type (e.g. custom timber pallet)"
                                value={line.typeOther}
                                onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, typeOther: e.target.value } : l))} />
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <FieldLabel>Length (mm)</FieldLabel>
                                  <input className="input mt-1 w-full font-mono" type="number" min="0" step="1"
                                    placeholder="1200" value={line.dimL}
                                    onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, dimL: e.target.value } : l))} />
                                </div>
                                <div>
                                  <FieldLabel>Width (mm)</FieldLabel>
                                  <input className="input mt-1 w-full font-mono" type="number" min="0" step="1"
                                    placeholder="800" value={line.dimW}
                                    onChange={e => setPalletLines(prev => prev.map(l => l.id === line.id ? { ...l, dimW: e.target.value } : l))} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button"
                      className="mt-2 text-xs font-semibold text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
                      onClick={() => setPalletLines(prev => [...prev, blankPalletLine()])}>
                      + Add another pallet type
                    </button>
                  </div>
                  <Toggle value={stackable} onChange={setStackable} label="Pallets are stackable" />
                  <TextField label="Weight per pallet (kg)" type="number" min="0" step="1"
                    value={weightPerUnit} onChange={setWeightPerUnit} placeholder="500"
                    hint="Gross weight per individual pallet including packaging. Needed for tail lift and fork truck safety." />
                  {hasInternationalStop && (
                    <Toggle value={ispm15Required} onChange={setIspm15Required}
                      label="ISPM-15 certified wood packaging required (international moves)" />
                  )}
                </div>
              )}

              {/* ── Roll cages ── */}
              {goodsType === "roll_cages" && (
                <div className="space-y-4 pt-1">
                  <TextField label="Number of cages" type="number" min="0" step="1"
                    value={cageCount} onChange={setCageCount} placeholder="48" />
                  <Toggle value={cageFolded} onChange={setCageFolded}
                    label="Cages are folded / nested (not assembled)" />
                </div>
              )}

              {/* ── Building materials ── */}
              {goodsType === "building_materials" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Material type</FieldLabel>
                    <div className="mt-1">
                      <Chips options={BUILDING_MATERIAL_TYPES} value={buildingMaterialType}
                        onChange={setBuildingMaterialType} />
                    </div>
                  </div>
                  <Toggle value={buildingMaterialPalletised} onChange={setBuildingMaterialPalletised}
                    label="Load is palletised (not loose)" />
                  <TextField label="Longest single item (m)" type="number" min="0"
                    value={buildingMaterialLongestItem} onChange={setBuildingMaterialLongestItem} placeholder="6"
                    hint="Timber, pipes and sheet materials may overhang — enter the longest piece." />
                  <Toggle value={buildingMaterialWeatherSensitive} onChange={setBuildingMaterialWeatherSensitive}
                    label="Load is weather sensitive (needs sheeting / covered vehicle)" />
                </div>
              )}

              {/* ── Food / refrigerated ── */}
              {goodsType === "food_refrigerated" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Chilled, frozen or ambient?</FieldLabel>
                    <div className="mt-1">
                      <Chips options={TEMP_TYPE_OPTIONS} value={tempType} onChange={setTempType} />
                    </div>
                  </div>
                  <TextField label="Required temperature range" value={tempRange}
                    onChange={setTempRange} placeholder="2°C – 8°C" />
                  <Toggle value={foodPreCooled} onChange={setFoodPreCooled}
                    label="Vehicle must be pre-cooled before arrival at collection" />
                  <Toggle value={foodTempLogger} onChange={setFoodTempLogger}
                    label="Temperature data logger required (continuous record)" />
                  <Toggle value={foodCleanVehicle} onChange={setFoodCleanVehicle}
                    label="Clean vehicle declaration required" />
                  <Toggle value={foodHaccp} onChange={setFoodHaccp}
                    label="HACCP compliance required" />
                  <Toggle value={foodAllergenFree} onChange={setFoodAllergenFree}
                    label="Allergen cross-contamination concern — nut-free / allergen-free vehicle required" />
                </div>
              )}

              {/* ── Bulk material ── */}
              {goodsType === "bulk_material" && (
                <div className="space-y-4 pt-1">
                  <Toggle value={tippingReq} onChange={setTippingReq} label="Tipping required at delivery" />
                  <div>
                    <FieldLabel>Wet or dry</FieldLabel>
                    <div className="mt-1">
                      <Chips options={WET_DRY_OPTIONS} value={wetDry} onChange={setWetDry} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Liquid / tanker ── */}
              {goodsType === "liquid_bulk" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <TextField label="Product" value={liquidProductType} onChange={setLiquidProductType}
                        placeholder="Vegetable oil, diesel, milk, wastewater…"
                        hint="Be specific — determines tanker certification and any ADR requirements." />
                    </div>
                    <TextField label="Volume (litres)" type="number" min="0" step="1"
                      value={liquidVolumeLitres} onChange={setLiquidVolumeLitres} placeholder="24000" />
                  </div>
                  <Toggle value={liquidFoodGrade} onChange={setLiquidFoodGrade}
                    label="Food-grade product (requires food-safe tanker)" />
                </div>
              )}

              {/* ── Machinery ── */}
              {goodsType === "machinery" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField label="Dimensions (L × W × H)" value={dimensions}
                      onChange={setDimensions} placeholder="4.5m × 2.2m × 3.1m" />
                    <TextField label="Piece weight (kg)" type="number" min="0" step="1"
                      value={machineryPieceWeight} onChange={setMachineryPieceWeight} placeholder="4200"
                      hint="Weight of one item — for crane and HIAB planning." />
                  </div>
                  <Toggle value={machineryLiftingPoints} onChange={setMachineryLiftingPoints}
                    label="Machine has lifting points / lifting eyes" />
                  <Toggle value={machinerySkidMounted} onChange={setMachinerySkidMounted}
                    label="Machine is skid-mounted" />
                  <Toggle value={craneRequired} onChange={setCraneRequired} label="Crane required on site" />
                </div>
              )}

              {/* ── Steel / long loads ── */}
              {goodsType === "steel_long" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Longest item (m)" type="number" min="0"
                      value={dimensions} onChange={setDimensions} placeholder="25" />
                    <TextField label="Number of pieces" type="number" min="0" step="1"
                      value={steelPieceCount} onChange={setSteelPieceCount} placeholder="6" />
                  </div>
                  <div>
                    <TextField label="Width of widest piece (m)" value={steelWidth}
                      onChange={setSteelWidth} placeholder="2.4" />
                    {steelWidth && parseFloat(steelWidth) > 2.9 && (
                      <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                        <span className="text-amber-500 flex-shrink-0">⚠</span>
                        <p className="text-xs font-semibold text-amber-800">Over 2.9m — this may require an abnormal load permit.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Vehicles ── */}
              {goodsType === "vehicles" && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <TextField label="Number of vehicles" type="number" min="0" step="1"
                      value={vehicleCount} onChange={setVehicleCount} placeholder="2" />
                    <div className="sm:col-span-2">
                      <TextField label="Make and model" value={vehicleMakeModel}
                        onChange={setVehicleMakeModel} placeholder="2019 Ford Transit Custom"
                        hint="Year, make and model helps us select the right transporter." />
                    </div>
                  </div>
                  <Toggle value={vehicleDriveable} onChange={setVehicleDriveable} label="Vehicles are driveable (RORO)" />
                  <Toggle value={vehicleKeysWithVehicle} onChange={setVehicleKeysWithVehicle}
                    label="Keys will be with the vehicle" />
                </div>
              )}

              {/* ── Containers ── */}
              {goodsType === "containers" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Container size</FieldLabel>
                    <div className="flex gap-2 mt-1">
                      {[["20ft","20ft"],["40ft","40ft"],["45ft","45ft"],["other","Other"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setContainerSize(v)}
                          className={"px-3 py-2 rounded-full border text-sm font-medium transition-colors " +
                            (containerSize === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {containerSize === "other" && (
                      <input className="input mt-2 w-full" type="text" placeholder="Describe container size"
                        value={containerSizeOther} onChange={e => setContainerSizeOther(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <FieldLabel>Loaded or empty?</FieldLabel>
                    <div className="mt-1">
                      <Chips options={LOADED_EMPTY_OPTIONS} value={loadedOrEmpty} onChange={setLoadedOrEmpty} />
                    </div>
                  </div>
                  <TextField label="Container number (optional)" value={containerNum}
                    onChange={setContainerNum} placeholder="MSCU1234567" />
                  <div>
                    <FieldLabel>Container ISO type</FieldLabel>
                    <select className="input mt-1 w-full" value={containerIsoType} onChange={e => setContainerIsoType(e.target.value)}>
                      <option value="">Not specified</option>
                      {CONTAINER_ISO_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <TextField label="Port booking reference / release number" value={containerBookingRef}
                    onChange={setContainerBookingRef} placeholder="MSKU1234567"
                    hint="Required to collect the container from port. Without this the driver cannot uplift." />
                  <TextField label="Terminal / port name" value={containerTerminal}
                    onChange={setContainerTerminal} placeholder="DP World London Gateway — Berth 3" />
                  <div>
                    <FieldLabel>Port cut-off date &amp; time</FieldLabel>
                    <input className="input mt-1 w-full" type="datetime-local" value={containerCutOff}
                      onChange={e => setContainerCutOff(e.target.value)} />
                    <div className="text-xs text-muted mt-1">Container must arrive at port before this time or it misses the sailing.</div>
                  </div>
                  <TextField label="Seal number" value={containerSealNumber}
                    onChange={setContainerSealNumber} placeholder="ML-12345678"
                    hint="Seal attached at collection — recorded for customs." />
                </div>
              )}

              {/* ── General goods ── */}
              {goodsType === "general" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <FieldLabel>Packaging type</FieldLabel>
                    <div className="mt-1">
                      <Chips options={GENERAL_PACKAGING} value={generalPackagingType}
                        onChange={setGeneralPackagingType} />
                    </div>
                  </div>
                  <TextField label="Total number of pieces" type="number" min="0" step="1"
                    value={generalPieceCount} onChange={setGeneralPieceCount} placeholder="48"
                    hint="Used for manifest and driver count verification on delivery." />
                </div>
              )}

              {/* Can split */}
              <div>
                <FieldLabel>Can this shipment be split between vehicles?</FieldLabel>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SPLIT_OPTIONS.map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setCanSplitShipment(v)}
                      className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                        (canSplitShipment === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Securing requirements */}
              <div>
                <FieldLabel>Load securing requirements</FieldLabel>
                <div className="mt-1">
                  <MultiCheck options={SECURING_REQUIREMENTS} value={securingRequirements}
                    onChange={setSecuringRequirements} />
                </div>
              </div>

              {/* Waste transport */}
              <div>
                <Toggle value={isWaste} onChange={v => { setIsWaste(v); if (!v) { setEwcCode(""); setWasteTrnNumber(""); } }}
                  label="These goods are classified as waste" />
                {isWaste && (
                  <div className="mt-3 space-y-3 border-l-2 border-orange-200 pl-4">
                    <div className="px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800 font-medium">
                      ⚠ Carrying waste requires a valid Waste Carrier Licence. A Waste Transfer Note (WTN) must accompany the load.
                    </div>
                    <TextField label="EWC code (European Waste Catalogue)" value={ewcCode} onChange={setEwcCode}
                      placeholder="e.g. 15 01 01" hint="6-digit code identifying the waste type." />
                    <TextField label="Waste Transfer Note number" value={wasteTrnNumber} onChange={setWasteTrnNumber}
                      placeholder="WTN-2026-001" hint="Document reference — must travel with the load." />
                  </div>
                )}
              </div>

              {/* Load notes */}
              <div>
                <FieldLabel>Additional load notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={loadNotes} onChange={e => setLoadNotes(e.target.value)}
                  placeholder="Stacked 3 high. Do not tip. Handle with care near top." />
              </div>

              <SectionFooter complete={sec3Complete} label="Load details" onCollapse={() => { if (!sec3Complete) setS3Attempted(true); setS3(true); }} missing={sec3Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 4: Special requirements ───────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={4} icon="⚠️" iconTitle="Review carefully — select any that apply. Undeclared ADR or oversized loads can result in refused collection or legal liability." title="Special requirements" subtitle="ADR, fragile, high value, oversized, secure transport" active
            collapsed={s4} onToggle={() => setS4(o => !o)}
            complete optional
            summary={specialItems.length > 0
              ? specialItems.map(i => SPECIAL_REQUIREMENTS_OPTS.find(([v]) => v === i)?.[1]?.replace(/^.+\s/, "") ?? i).join(", ")
              : undefined} />
          {!s4 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <MultiCheck options={SPECIAL_REQUIREMENTS_OPTS} value={specialItems} onChange={setSpecialItems} />

              {specialItems.includes("dangerous_goods") && (
                <div className="space-y-3 border-l-2 border-red-200 pl-4">
                  <TextField label="ADR class" value={hazardClass} onChange={setHazardClass}
                    placeholder="Class 3 — Flammable liquids" />
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-muted">ADR tunnel restriction code</label>
                    <select value={tunnelCode} onChange={e => setTunnelCode(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Not specified</option>
                      <option value="B">B — Most restricted (explosives etc.)</option>
                      <option value="C">C</option>
                      <option value="C/D">C/D</option>
                      <option value="C/E">C/E</option>
                      <option value="D">D</option>
                      <option value="D/E">D/E</option>
                      <option value="E">E — Least restricted</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="UN number" value={unNumber} onChange={setUnNumber} placeholder="UN 1993" />
                    <TextField label="Packing group" value={packingGroup} onChange={setPackingGroup} placeholder="I, II or III" />
                  </div>
                  <TextField label="Total hazardous quantity (kg or litres)" type="number" min="0"
                    value={hazardousQtyKg} onChange={setHazardousQtyKg} placeholder="500"
                    hint="Used to determine LQ / EQ exemption thresholds." />
                  <Toggle value={hazardousPaperwork} onChange={setHazardousPaperwork}
                    label="Hazardous paperwork available / will be provided" />
                  <TextField label="Proper shipping name" value={adrProperShippingName}
                    onChange={setAdrProperShippingName}
                    placeholder="e.g. FLAMMABLE LIQUID, N.O.S."
                    hint="Official ADR proper shipping name as it must appear on documents." />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Subsidiary risk (if any)" value={adrSubsidiaryRisk}
                      onChange={setAdrSubsidiaryRisk} placeholder="e.g. 8" />
                    <TextField label="Flash point (°C)" type="number" value={adrFlashPoint}
                      onChange={setAdrFlashPoint} placeholder="e.g. 23"
                      hint="Required for Class 3 flammables." />
                  </div>
                  <TextField label="EMS code" value={adrEmsCode}
                    onChange={setAdrEmsCode} placeholder="e.g. F-E, S-E"
                    hint="Emergency Schedule code (required for sea/multimodal moves)." />
                  <TextField label="Emergency contact (24hr)" value={adrEmergencyContact}
                    onChange={setAdrEmergencyContact} placeholder="CHEMTREC: +1-800-424-9300"
                    hint="24-hour emergency response number to appear on transport documents." />
                </div>
              )}

              {specialItems.includes("oversized") && (
                <div className="space-y-3 border-l-2 border-amber-300 pl-4">
                  <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Overall dimensions including the load on the vehicle — not just the item itself.
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <TextField label="Overall width (m)" type="number" min="0"
                      value={oversizedWidth} onChange={setOversizedWidth} placeholder="3.2" />
                    <TextField label="Overall height (m)" type="number" min="0"
                      value={oversizedHeight} onChange={setOversizedHeight} placeholder="4.8" />
                    <TextField label="Overall length (m)" type="number" min="0"
                      value={oversizedLength} onChange={setOversizedLength} placeholder="18.5" />
                  </div>
                  {oversizedWidth && parseFloat(oversizedWidth) > 2.5 && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                      <span className="text-amber-500 flex-shrink-0">⚠</span>
                      <p className="text-xs font-semibold text-amber-800">Over 2.5m wide — likely requires an abnormal load permit.</p>
                    </div>
                  )}
                  <div>
                    <FieldLabel>STGO category</FieldLabel>
                    <select className="input mt-1 w-full" value={stgoCategory} onChange={e => setStgoCategory(e.target.value)}>
                      <option value="">Not yet determined</option>
                      {STGO_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <div className="text-xs text-muted mt-1">Special Types General Order category — affects notifications and speed limits.</div>
                  </div>
                  <TextField label="Movement order number" value={movementOrderNumber}
                    onChange={setMovementOrderNumber} placeholder="MO-2026-00123"
                    hint="Issued by the relevant highways authority. Required before movement." />
                </div>
              )}

              <SectionFooter complete label="Special requirements" onCollapse={() => setS4(true)} />
            </div>
          )}
        </div>

        {/* ── Sec 5: Transport requirements ─────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={5} icon="🚛" title="Transport requirements" subtitle="Vehicle and trailer preferences" active
            collapsed={s5} onToggle={() => setS5(o => !o)}
            complete optional
            summary={plannerDecides ? "Planner will decide" : (
              [
                BODY_CATEGORIES.find(c => c.value === vehicleCategory)?.label,
                bodyTypes.map(t => BODY_TYPES.find(b => b.value === t)?.label).filter(Boolean).join(", "),
              ].filter(Boolean).join(" · ") || undefined
            )} />
          {!s5 && (
            <div className="px-5 pt-5 pb-4 space-y-4">

              {/* ── AI vehicle suggestion ── */}
              {!isEditMode && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✨</span>
                      <span className="text-sm font-semibold text-violet-800">AI vehicle suggestion</span>
                      <span className="text-xs text-violet-500 hidden sm:inline">— based on load details above</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSuggestVehicle}
                      disabled={vehicleSuggestBusy || !(goodsType || parseFloat(estWeight) > 0)}
                      className="px-4 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg
                                 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed
                                 transition-colors flex items-center gap-1.5"
                    >
                      {vehicleSuggestBusy ? (
                        <>
                          <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                          Thinking…
                        </>
                      ) : "Suggest vehicle"}
                    </button>
                  </div>

                  {vehicleSuggestError && (
                    <p className="text-xs text-red-700">{vehicleSuggestError}</p>
                  )}

                  {vehicleSuggestion && (
                    <div className="bg-white rounded-lg border border-violet-200 px-3 py-2.5 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-0.5">✓</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-slate-800">
                            {BODY_CATEGORIES.find(c => c.value === vehicleSuggestion.vehicleCategory)?.label ?? vehicleSuggestion.vehicleCategory}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">recommended</span>
                          <p className="text-xs text-slate-600 mt-0.5">{vehicleSuggestion.reasoning}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={acceptVehicleSuggestion}
                          className="px-3 py-1 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
                        >
                          Use this
                        </button>
                        <button
                          type="button"
                          onClick={() => setVehicleSuggestion(null)}
                          className="px-3 py-1 text-xs text-violet-600 border border-violet-200 rounded-lg hover:border-violet-400 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Toggle value={plannerDecides} onChange={v => { setPlannerDecides(v); }}
                label="Let the planner choose the best transport for this load" />

              {!plannerDecides && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <div className="text-xs text-muted bg-blue-50 rounded-lg px-3 py-2">
                    Only fill this in if you know exactly what transport you need.
                  </div>

                  <div>
                    <FieldLabel>Vehicle body category</FieldLabel>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {BODY_CATEGORIES.map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => { setVehicleCategory(value); setBodyTypes([]); }}
                          className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                            (vehicleCategory === value
                              ? "bg-accent text-white border-accent"
                              : "bg-white text-muted border-border hover:border-gray-400")}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {vehicleCategory && (() => {
                    const allowed = new Set(REQ_BODY_TYPES_BY_CATEGORY[vehicleCategory] ?? []);
                    const grouped: Record<string, { value: string; label: string }[]> = {};
                    BODY_TYPES.forEach(bt => {
                      if (!allowed.has(bt.value)) return;
                      if (!grouped[bt.group]) grouped[bt.group] = [];
                      grouped[bt.group].push({ value: bt.value, label: bt.label });
                    });
                    const groups = Object.keys(grouped);
                    function toggleType(v: string) {
                      setBodyTypes(prev =>
                        prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
                      );
                    }
                    return (
                      <div className="space-y-3">
                        <FieldLabel>{["tractor", "drawbar", "heavy_haulage"].includes(vehicleCategory) ? "Trailer type — select all that work" : "Body type — select all that work"}</FieldLabel>
                        {groups.map(g => (
                          <div key={g}>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                              {BODY_TYPE_GROUP_LABELS[g] ?? g}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {grouped[g].map(bt => {
                                const on = bodyTypes.includes(bt.value);
                                return (
                                  <button key={bt.value} type="button" onClick={() => toggleType(bt.value)}
                                    className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors min-h-[40px] " +
                                      (on ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
                                    {bt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Subcontracting */}
              <div>
                <FieldLabel>Can this job be subcontracted?</FieldLabel>
                <div className="text-xs text-muted mb-2">Whether the carrier can pass this job to another operator or use a spot market.</div>
                <Chips
                  options={[["yes","Yes — freely"],["with_approval","With prior approval only"],["no","No — must stay in-house"]]}
                  value={subcontractingAllowed}
                  onChange={setSubcontractingAllowed} />
              </div>

              {/* Driver qualifications */}
              <div>
                <FieldLabel>Additional driver requirements</FieldLabel>
                <div className="text-xs text-muted mb-2">Site access or customer requirements beyond standard licence and CPC.</div>
                <div className="space-y-2">
                  <Toggle value={cscsRequired} onChange={setCscsRequired}
                    label="CSCS card required (construction sites)" />
                  <Toggle value={bs7858Required} onChange={setBs7858Required}
                    label="BS7858 security vetting required (airports, data centres, MOD)" />
                  <div>
                    <FieldLabel>DBS check required</FieldLabel>
                    <select className="input mt-1 w-full max-w-xs" value={dbsLevel} onChange={e => setDbsLevel(e.target.value)}>
                      <option value="">Not required</option>
                      <option value="basic">Basic DBS check</option>
                      <option value="enhanced">Enhanced DBS check</option>
                    </select>
                  </div>
                </div>
              </div>

              <SectionFooter complete label="Transport requirements" onCollapse={() => setS5(true)} />
            </div>
          )}
        </div>

        {/* ── International / cross-border section ──────────────────────────── */}
        {hasInternationalStop && (
          <div className="card overflow-hidden">
            <SectionHeader num={7} icon="🌍" title="International / cross-border"
              subtitle="Customs, crossing and trade documents"
              active collapsed={sIntl} onToggle={() => setSIntl(o => !o)}
              complete={false} optional
              summary={customsMovementType ? CUSTOMS_MOVEMENT_TYPES.find(([v]) => v === customsMovementType)?.[1] : undefined} />
            {!sIntl && (
              <div className="px-5 pt-5 pb-4 space-y-5">
                <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 font-medium">
                  One or more stops are outside the UK. Please fill in the cross-border details below to avoid customs delays.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField label="Shipper EORI number" value={shipperEori} onChange={setShipperEori}
                    placeholder="GB123456789000" hint="Exporter's Economic Operator Registration number." />
                  <TextField label="Consignee EORI number" value={consigneeEori} onChange={setConsigneeEori}
                    placeholder="DE987654321000" hint="Importer's EORI number." />
                </div>

                <TextField label="Commodity / HS code" value={hsCode} onChange={setHsCode}
                  placeholder="8703 23 19 00" hint="Harmonised System tariff code. At least 6 digits. Used for customs declarations and tariff preference." />

                <div>
                  <FieldLabel>Customs movement type</FieldLabel>
                  <select className="input mt-1 w-full" value={customsMovementType} onChange={e => setCustomsMovementType(e.target.value)}>
                    <option value="">Not specified</option>
                    {CUSTOMS_MOVEMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>

                <div>
                  <FieldLabel>Incoterms</FieldLabel>
                  <select className="input mt-1 w-full" value={incoterms} onChange={e => setIncoterms(e.target.value)}>
                    <option value="">Not specified</option>
                    {INCOTERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div className="text-xs text-muted mt-1">Trade term defining who pays for freight, insurance, and where risk transfers.</div>
                </div>

                {/* Crossing */}
                <div>
                  <Toggle value={crossingRequired} onChange={v => { setCrossingRequired(v); if (!v) { setCrossingType(""); setCrossingBookingRef(""); } }}
                    label="Sea or tunnel crossing required" />
                  {crossingRequired && (
                    <div className="mt-3 space-y-3 border-l-2 border-blue-100 pl-4">
                      <div>
                        <FieldLabel>Crossing route</FieldLabel>
                        <select className="input mt-1 w-full" value={crossingType} onChange={e => setCrossingType(e.target.value)}>
                          <option value="">Select route</option>
                          {CROSSING_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <TextField label="Crossing booking reference" value={crossingBookingRef}
                        onChange={setCrossingBookingRef} placeholder="EU123456789"
                        hint="If the crossing is pre-booked by the customer. Leave blank if the carrier books it." />
                    </div>
                  )}
                </div>

                <SectionFooter complete={false} label="International details" onCollapse={() => setSIntl(true)} missing={[]} />
              </div>
            )}
          </div>
        )}

        {/* ── Sec 6: Billing ────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={6} icon="📄" title="Billing" subtitle="Declared goods value and reference numbers" active
            collapsed={s6} onToggle={() => { if (!s6 && !sec6Complete) setS6Attempted(true); setS6(o => !o); }}
            complete={sec6Complete} started={sec6Started}
            summary={declaredValue ? `£${declaredValue}${purchaseOrderNumber ? ` · PO: ${purchaseOrderNumber}` : ""}` : undefined}
            missingCount={sec6Missing.length} />
          {!s6 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <TextField label="Declared value of goods (£)" required type="number" min="0"
                value={declaredValue} onChange={setDeclaredValue} placeholder="0.00"
                hint="For insurance and liability purposes — not the transport price."
                error={(s6Attempted || triedSave) && !(parseFloat(declaredValue) > 0) ? "Required" : undefined} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Purchase order number" value={purchaseOrderNumber}
                  onChange={setPurchaseOrderNumber} placeholder="PO-2026-12345"
                  hint="Your internal PO number if needed for invoicing." />
                <TextField label="Billing reference / cost code" value={billingRef}
                  onChange={setBillingRef} placeholder="COST-CENTRE-123" />
              </div>
              <SectionFooter complete={sec6Complete} label="Billing" onCollapse={() => { if (!sec6Complete) setS6Attempted(true); setS6(true); }} missing={sec6Missing} />
            </div>
          )}
        </div>

        {/* ── Sec 7: Rejection & return policy ──────────────────────────────── */}
        <div className="card overflow-hidden">
          <button type="button" onClick={() => setShowExceptionPolicy(o => !o)}
            className="w-full flex items-center gap-3 px-5 py-4 border-b border-border text-left hover:bg-slate-50/60 transition-colors">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border ${showExceptionPolicy ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200 shadow-sm"}`}>
              🔄
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-primary">Rejection &amp; return policy</h2>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">optional</span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {failureAction
                  ? REJECTION_ACTIONS.find(([v]) => v === failureAction)?.[1] ?? failureAction
                  : "What should the driver do if goods are refused at the door?"}
              </p>
            </div>
            <span className={`text-xl font-bold flex-shrink-0 ml-1 transition-transform duration-200 ${showExceptionPolicy ? "text-accent" : "text-muted"}`}>
              {showExceptionPolicy ? "⌄" : "›"}
            </span>
          </button>

          {showExceptionPolicy && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div className="text-xs text-slate-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 leading-relaxed">
                Fill this in so the driver knows exactly what to do without having to call the office.
              </div>

              <div>
                <FieldLabel>If delivery is rejected at the door, what should the driver do?</FieldLabel>
                <div className="mt-1">
                  <Chips options={REJECTION_ACTIONS} value={failureAction} onChange={setFailureAction} />
                </div>
              </div>

              {failureAction === "deliver_to_alternative_address" && (
                <div className="space-y-3 border-l-2 border-orange-200 pl-4">
                  <TextField label="Site name" value={altReturnSiteName}
                    onChange={setAltReturnSiteName} placeholder="Acme Returns Depot — Unit 3" caseRule="proper_name" />
                  <TextField label="Address line 1" value={altReturnAddress}
                    onChange={setAltReturnAddress} placeholder="12 Warehouse Lane" caseRule="proper_name" />
                  <TextField label="Address line 2" value={altReturnAddressLine2}
                    onChange={setAltReturnAddressLine2} placeholder="Industrial Estate" caseRule="proper_name" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <TextField label="Town / city" value={altReturnTown}
                        onChange={setAltReturnTown} placeholder="Manchester" caseRule="proper_name" />
                    </div>
                    <label className="block">
                      <FieldLabel>{POSTCODE_META[altReturnCountry]?.label ?? "Postcode"}</FieldLabel>
                      <input className="input mt-1 w-full" type="text"
                        value={altReturnPostcode}
                        placeholder={POSTCODE_META[altReturnCountry]?.placeholder ?? "Postcode"}
                        onChange={e => setAltReturnPostcode(e.target.value.toUpperCase())} />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField label="County / region" value={altReturnCounty}
                      onChange={setAltReturnCounty} placeholder="Greater Manchester" caseRule="proper_name" />
                    <label className="block">
                      <FieldLabel>Country</FieldLabel>
                      <div className="relative mt-1">
                        <select className="input w-full appearance-none pr-9"
                          value={altReturnCountry}
                          onChange={e => setAltReturnCountry(e.target.value)}>
                          {COUNTRIES.map(([code, name]) => (
                            <option key={code} value={code}>{name}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </label>
                  </div>
                  <div>
                    <FieldLabel>Exact entrance pin — latitude / longitude</FieldLabel>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <div>
                        <FieldLabel>Latitude</FieldLabel>
                        <input className="input font-mono" type="number" step="0.000001"
                          placeholder="e.g. 53.483959"
                          value={altReturnLat} onChange={e => setAltReturnLat(e.target.value)} />
                      </div>
                      <div>
                        <FieldLabel>Longitude</FieldLabel>
                        <input className="input font-mono" type="number" step="0.000001"
                          placeholder="e.g. -2.244644"
                          value={altReturnLng} onChange={e => setAltReturnLng(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
                      <span className="text-amber-500 text-base leading-none mt-px flex-shrink-0">⚠</span>
                      <p className="text-xs font-semibold text-amber-800 leading-snug">Must be the truck gate, not the building centre.</p>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Entrance instructions</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2}
                      value={altReturnNavInstructions}
                      onChange={e => setAltReturnNavInstructions(e.target.value)}
                      placeholder="Enter via Gate B on the left. Intercom code 1234." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField label="Contact name" value={altReturnContactName}
                      onChange={setAltReturnContactName} placeholder="Jane Smith" caseRule="proper_name" />
                    <TextField label="Contact phone" type="tel" value={altReturnContactPhone}
                      onChange={setAltReturnContactPhone} placeholder="+44 7700 900123" />
                  </div>
                </div>
              )}

              {failureAction === "call_office_before_leaving" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-l-2 border-orange-200 pl-4">
                  <TextField label="Approval contact name" value={approvalContactName}
                    onChange={setApprovalContactName} placeholder="Jane Smith" />
                  <TextField label="Approval contact phone" type="tel" value={approvalContactPhone}
                    onChange={setApprovalContactPhone} placeholder="+44 7700 900123" />
                </div>
              )}

              <Toggle value={photosOnRejection} onChange={setPhotosOnRejection}
                label="Photos required on rejection" />
              <Toggle value={signatureOnRejection} onChange={setSignatureOnRejection}
                label="Rejection signature required" />

              <div>
                <FieldLabel>Additional rejection / return notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2}
                  value={rejectionNotes} onChange={e => setRejectionNotes(e.target.value)}
                  placeholder="Do not leave goods unattended. Call depot before returning." />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Sticky save bar ──────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40"
        style={{background: 'white', borderTop: '1px solid #e2e8f0', boxShadow: '0 -4px 24px rgba(15,23,42,0.08)'}}>
        <div className="max-w-3xl mx-auto px-5 py-3">
          {triedSave && MISSING.length > 0 && (
            <div className="flex items-center gap-2 mb-2 text-xs text-red-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {MISSING.length} required field{MISSING.length > 1 ? "s" : ""} still needed — scroll up to see
            </div>
          )}
          {error && (
            <div className="mb-2 text-xs text-red-600 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors px-1 flex-shrink-0">
              Cancel
            </button>
            <div className="flex-1" />

            <>
              <button onClick={handleSaveDraft} disabled={saving !== null}
                className="btn btn-outline text-sm px-5 py-2.5 flex-shrink-0">
                {saving === "draft" ? "Saving…" : isEditMode ? "Save as draft" : "Save Draft"}
              </button>
              <button onClick={handleSaveReady} disabled={saving !== null}
                className={"btn text-sm px-6 py-2.5 font-bold flex-shrink-0 " +
                  (MISSING.length === 0
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "btn-primary")}>
                {saving === "ready" ? "Saving…" : isEditMode ? (MISSING.length === 0 ? "Update job" : "Save changes") : (MISSING.length === 0 ? "Save & Plan" : "Ready for Planner")}
              </button>
            </>
          </div>
        </div>
      </div>

    </div>
  );
}
