import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import { api } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import type { Customer, JobTemplate, PlannedJob, SavedLocation } from "../../types";

import {
  SERVICE_TYPES, JOB_TYPES, PRIORITY_OPTS,
  BODY_CATEGORY_OPTS, BODY_TYPE_OPTS, GVW_CLASS_OPTS,
  DRIVER_LICENCE_OPTS, DRIVER_ENDORSEMENT_OPTS,
  TRAILER_LENGTH_OPTS, LOAD_UNITS, HANDLING_METHODS,
  TRAILER_BODY_TYPE_VALUES, equipmentForBodyType,
} from "./createJobConstants";
import type { StopState } from "./createJobTypes";
import { today, nowDisplay, makeStop, jobStopToStopState, stopComplete } from "./createJobUtils";
import {
  FieldLabel, ReadOnlyField, SectionHeader, SectionFooter,
  OptionalToggle, Toggle, MultiCheck, TextField,
} from "./CreateJobFormComponents";
import CustomerSearch from "./CustomerSearch";
import StopCard from "./StopCard";
import { LocationSearch } from "./StopCard";
import { buildBody } from "./createJobPayload";
import type { CreateJobPayload } from "./createJobPayload";
import {
  BODY_TYPES_BY_CATEGORY,
  bodyCategoryNeedsTrailer,
  gvwForCategory,
  licencesThatCanDrive,
  type BodyCategory,
  type BodyType,
  type DriverEndorsement,
  type DriverLicenceClass,
  type GvwClass,
  type OnboardEquipment,
} from "../../constants/vehicleTaxonomy";

function legacyVehicleToRequirement(value: string | undefined | null) {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "artic" || /^class\s*1$/.test(v)) return { bodyCategory: "tractor", bodyType: "", equipment: [] as string[], licenceClass: "CE" };
  if (v === "van") return { bodyCategory: "van", bodyType: "panel", equipment: [] as string[], licenceClass: "B" };
  if (v === "rigid" || /^class\s*2$/.test(v)) return { bodyCategory: "rigid", bodyType: "", equipment: [] as string[], licenceClass: "C" };
  if (v === "tipper") return { bodyCategory: "rigid", bodyType: "tipper", equipment: [] as string[], licenceClass: "C" };
  if (v === "grab") return { bodyCategory: "rigid", bodyType: "tipper", equipment: ["hiab_crane"], licenceClass: "C" };
  if (v === "mixer") return { bodyCategory: "rigid", bodyType: "mixer", equipment: [] as string[], licenceClass: "C" };
  if (v === "hiab") return { bodyCategory: "rigid", bodyType: "flatbed", equipment: ["hiab_crane"], licenceClass: "C" };
  if (v === "refrigerated") return { bodyCategory: "rigid", bodyType: "fridge", equipment: ["fridge_unit"], licenceClass: "C" };
  if (v === "other" || v.startsWith("other:")) return { bodyCategory: "rigid", bodyType: "other", equipment: [] as string[], licenceClass: "C" };
  return { bodyCategory: "", bodyType: "", equipment: [] as string[], licenceClass: "" };
}

function optionLabel(options: [string, string][], value: string) {
  return options.find(([v]) => v === value)?.[1] ?? value;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: jobIdParam } = useParams<{ id?: string }>();
  const editJobId = jobIdParam ? parseInt(jobIdParam, 10) : null;
  const isEditMode = !!editJobId;

  // Template-edit mode: /jobs/template/:templateId
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const editTemplateIdParam = searchParams.get("editTemplateId");
  const editTemplateId = editTemplateIdParam ? parseInt(editTemplateIdParam, 10) : null;
  const isTemplateMode = !!editTemplateId;

  const [saving, setSaving] = useState<"draft" | "ready" | null>(null);
  const [error, setError] = useState("");
  const [loadingJob, setLoadingJob] = useState(isEditMode);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Saved locations (loaded once)
  const [locations,     setLocations]     = useState<SavedLocation[]>([]);
  const [templates,     setTemplates]     = useState<JobTemplate[]>([]);
  const [tplQuery,      setTplQuery]      = useState("");
  const [companyTicker, setCompanyTicker] = useState<string | null>(null);
  const [jobReference,  setJobReference]  = useState<string | null>(null);

  // templateId in URL = open blank job pre-filled with template (Use → button)
  const preloadTemplateId = searchParams.get("templateId");

  useEffect(() => {
    jobsApi.locations().then(r => setLocations(r.data)).catch(() => {});
    api.get<{ ticker?: string | null }>("/company").then(c => setCompanyTicker(c.ticker ?? null)).catch(() => {});
  }, []);
  useEffect(() => {
    jobsApi.templates().then(r => {
      setTemplates(r.data);
      // Auto-apply if ?templateId= in URL
      if (preloadTemplateId) {
        const t = r.data.find((t: JobTemplate) => t.id === parseInt(preloadTemplateId, 10));
        if (t) applyTemplate(t);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(t: JobTemplate) {
    const jd = t.defaultJobData;

    // ── Job basics ──────────────────────────────────────────────────────────
    if (jd?.customerName) { setCustomerName(jd.customerName); setCustomerId(jd.customerId ?? null); }
    if (jd?.serviceType)  setServiceType(jd.serviceType);
    if (jd?.jobType)      setJobType(jd.jobType);
    if (jd?.jobTitle)     setJobTitle(jd.jobTitle);
    if (jd?.priority)     setPriority(jd.priority);

    // ── Customer details ────────────────────────────────────────────────────
    if (jd?.contactName)     setContactName(jd.contactName);
    if (jd?.contactPhone)    setContactPhone(jd.contactPhone);
    if (jd?.contactEmail)    setContactEmail(jd.contactEmail);
    if (jd?.billingNotes)    setBillingNotes(jd.billingNotes);
    if (jd?.custInstructions) setCustInstructions(jd.custInstructions);
    if (jd?.custRefRequired !== undefined) setCustRefRequired(jd.custRefRequired);
    if (jd?.poRequired      !== undefined) setPoRequired(jd.poRequired);

    // ── Load details ────────────────────────────────────────────────────────
    const dl = t.defaultLoadDetails;
    const materialType = jd?.materialDesc || dl?.materialType || t.defaultMaterialType || "";
    if (materialType)        setMaterialDesc(materialType);
    const qty = jd?.totalQty ?? (dl?.quantity != null ? String(dl.quantity) : "");
    if (qty)                 setTotalQty(qty);
    const unit = jd?.qtyUnit ?? dl?.unit ?? "";
    if (unit)                setQtyUnit(unit);
    if (jd?.qtyUnitOther)   setQtyUnitOther(jd.qtyUnitOther);
    const weight = jd?.totalWeight ?? (dl?.weight != null ? String(dl.weight) : "");
    if (weight)              setTotalWeight(weight);
    const vol = jd?.volume   ?? (dl?.volume  != null ? String(dl.volume)  : "");
    if (vol)                 setVolume(vol);
    if (jd?.dimensions   ?? dl?.dimensions)   setDimensions(jd?.dimensions   ?? dl?.dimensions   ?? "");
    if (jd?.adrClass     ?? dl?.hazardClass)  setAdrClass(jd?.adrClass     ?? dl?.hazardClass   ?? "");
    if (jd?.fragile         !== undefined) setFragile(jd.fragile);
    else if (dl?.fragile    !== undefined) setFragile(dl.fragile);
    if (jd?.stackable       !== undefined) setStackable(jd.stackable);
    else if (dl?.stackable  !== undefined) setStackable(dl.stackable);
    if (jd?.tempControlled  !== undefined) setTempControlled(jd.tempControlled);
    else if (dl?.tempControlled !== undefined) setTempControlled(dl.tempControlled);
    if (jd?.tempRange ?? dl?.tempRange) setTempRange(jd?.tempRange ?? dl?.tempRange ?? "");
    if (jd?.forkliftReq !== undefined) setForkliftReq(jd.forkliftReq);
    else if (dl?.forkliftRequired !== undefined) setForkliftReq(dl.forkliftRequired);
    if (jd?.tailLiftReq !== undefined) setTailLiftReq(jd.tailLiftReq);
    else if (dl?.tailLiftRequired !== undefined) setTailLiftReq(dl.tailLiftRequired);
    if (jd?.craneReq !== undefined) setCraneReq(jd.craneReq);
    else if (dl?.craneRequired !== undefined) setCraneReq(dl.craneRequired);
    if (jd?.loadingMethod   ?? dl?.loadingMethod)   setLoadingMethod(jd?.loadingMethod   ?? dl?.loadingMethod   ?? "");
    if (jd?.unloadingMethod ?? dl?.unloadingMethod) setUnloadingMethod(jd?.unloadingMethod ?? dl?.unloadingMethod ?? "");
    if (jd?.loadNotes ?? dl?.notes ?? t.defaultNotes) setLoadNotes(jd?.loadNotes ?? dl?.notes ?? t.defaultNotes ?? "");
    if (jd?.photosRequired  !== undefined) setPhotosRequired(jd.photosRequired);
    else if (dl?.photosRequired !== undefined) setPhotosRequired(dl.photosRequired);
    if (jd?.weighbridgeReq  !== undefined) setWeighbridgeReq(jd.weighbridgeReq);
    else if (dl?.weighbridgeRequired !== undefined) setWeighbridgeReq(dl.weighbridgeRequired);
    if (jd?.podRequired     !== undefined) setPodRequired(jd.podRequired);

    // ── Vehicle requirements ────────────────────────────────────────────────
    const vClass = jd?.vehicleType ?? "";
    const legacyReq = legacyVehicleToRequirement(vClass);
    const nextReqBodyCategory = jd?.reqBodyCategory ?? legacyReq.bodyCategory;
    if (nextReqBodyCategory) setReqBodyCategory(nextReqBodyCategory as BodyCategory);
    if (jd?.reqGvwMin) setReqGvwMin(jd.reqGvwMin as GvwClass);
    else if (jd?.minSize) setReqGvwMin(jd.minSize as GvwClass);
    const nextReqBodyType = jd?.reqBodyType ?? legacyReq.bodyType;
    if (nextReqBodyType) setReqBodyType(nextReqBodyType as BodyType);
    if (jd?.reqEquipment?.length) setReqEquipment(jd.reqEquipment as OnboardEquipment[]);
    else if (jd?.equipmentReq?.length) setReqEquipment(jd.equipmentReq as OnboardEquipment[]);
    else if (legacyReq.equipment.length) setReqEquipment(legacyReq.equipment as OnboardEquipment[]);
    const nextReqLicence = jd?.reqLicenceClass ?? legacyReq.licenceClass;
    if (nextReqLicence) setReqLicenceClass(nextReqLicence as DriverLicenceClass);
    if (jd?.reqEndorsements?.length) setReqEndorsements(jd.reqEndorsements as DriverEndorsement[]);
    else if (jd?.driverQuals?.length) setReqEndorsements(jd.driverQuals as DriverEndorsement[]);
    if (jd?.trailerLength) setTrailerLength(jd.trailerLength);
    if (vClass) {
      if (vClass.startsWith("other:")) {
        setVehicleType("other");
        setVehicleTypeOther(vClass.replace("other:", "").trim());
      } else {
        setVehicleType(vClass);
      }
    }
    if (jd?.vehicleTypeOther) setVehicleTypeOther(jd.vehicleTypeOther);
    if (jd?.minSize)          setMinSize(jd.minSize);
    if (jd?.trailersAllowed?.length)   setTrailersAllowed(jd.trailersAllowed);
    else if (t.trailerTypesAllowed?.length) setTrailersAllowed(t.trailerTypesAllowed);
    if (jd?.equipmentReq?.length)      setEquipmentReq(jd.equipmentReq);
    if (jd?.driverQuals?.length)       setDriverQuals(jd.driverQuals);
    if (jd?.heightRestriction) setHeightRestriction(jd.heightRestriction);
    if (jd?.weightRestriction) setWeightRestriction(jd.weightRestriction);
    if (jd?.lengthRestriction) setLengthRestriction(jd.lengthRestriction);
    if (jd?.accessNotes)       setAccessNotes(jd.accessNotes);
    if (jd?.assignedTruck)     setAssignedTruck(jd.assignedTruck);
    if (jd?.assignedTrailer)   setAssignedTrailer(jd.assignedTrailer);

    // ── Failure / return ────────────────────────────────────────────────────
    if (jd?.failureAction)     setFailureAction(jd.failureAction);
    if (jd?.assistancePhone)   setAssistancePhone(jd.assistancePhone);
    if (jd?.assistanceNote)    setAssistanceNote(jd.assistanceNote);
    if (jd?.returnDestination) setReturnDestination(jd.returnDestination);
    const alt = jd?.altAddress as Record<string, unknown> | null | undefined;
    if (alt) {
      if (alt.companyName) setAltCompanyName(String(alt.companyName));
      if (alt.street)      setAltStreet(String(alt.street));
      if (alt.town)        setAltTown(String(alt.town));
      if (alt.postcode)    setAltPostcode(String(alt.postcode));
      if (alt.country)     setAltCountry(String(alt.country));
      if (alt.lat)         setAltLat(String(alt.lat));
      if (alt.lng)         setAltLng(String(alt.lng));
      if (alt.unit)        setAltUnit(String(alt.unit));
      if (alt.addressLine2) setAltAddressLine2(String(alt.addressLine2));
      if (alt.county)      setAltCounty(String(alt.county));
      if (alt.contactName) setAltContactName(String(alt.contactName));
      if (alt.contactPhone) setAltContactPhone(String(alt.contactPhone));
      if (alt.contactEmail) setAltContactEmail(String(alt.contactEmail));
      if (alt.navNotes)    setAltNavNotes(String(alt.navNotes));
      if (alt.driverNotes) setAltDriverNotes(String(alt.driverNotes));
      if (alt.savedLocationId) setAltSavedLocationId(Number(alt.savedLocationId));
    }

    // ── Stops — restore all fields, clear per-run variables ────────────────
    const ds = Array.isArray(t.defaultStops) ? t.defaultStops : [];
    if (ds.length > 0) {
      setStops(ds.map((s: Record<string, unknown>) => ({
        ...makeStop(),
        id:              Math.random().toString(36).slice(2),
        collapsed:       true,
        stopType:        ((s.stopType as string) || (s.type === "pickup" ? "collection" : "delivery")) as "collection" | "delivery",
        savedLocationId: (s.savedLocationId as number) ?? null,
        locationQuery:   (s.locationQuery as string) || (s.siteName as string) || "",
        siteName:        (s.siteName as string) || "",
        street:          (s.street as string) || "",
        town:            (s.town as string) || "",
        postcode:        (s.postcode as string) || "",
        country:         (s.country as string) || "United Kingdom",
        lat:             s.lat != null ? String(s.lat) : "",
        lng:             s.lng != null ? String(s.lng) : "",
        unitBuilding:    (s.unitBuilding as string) || (s.unitName as string) || "",
        addressLine2:    (s.addressLine2 as string) || "",
        countyRegion:    (s.countyRegion as string) || "",
        contactName:     (s.contactName as string) || "",
        contactPhone:    (s.contactPhone as string) || "",
        contactEmail:    (s.contactEmail as string) || "",
        driverNotes:     (s.driverNotes as string) || (s.instructions as string) || "",
        navigationInstructions: (s.navigationInstructions as string) || "",
        openingHours:    (s.openingHours as string) || "",
        locationType:    (s.locationType as string) || "",
        internalNotes:   (s.internalNotes as string) || "",
        numPallets:      s.numPallets != null ? String(s.numPallets) : "",
        earliestArrival: (s.earliestArrival as string) || "",
        unloadingTime:   (s.unloadingTime as string) || "",
        bookingRequired: (s.bookingRequired as boolean) ?? false,
        // Per-run variables reset to blank
        date:            today(),
        timeType:        "anytime" as const,
        exactTime:       "",
        windowStart:     "",
        windowEnd:       "",
        refNumber:       "",
        bookingRef:      "",
      })));
    }

    setTplQuery(t.name);
    // Expand all sections so user sees what was loaded
    setSec1Collapsed(false);
    setSec2Collapsed(false);
    setSec3Collapsed(false);
    setSec4Collapsed(false);
    setSec5Collapsed(false);
    setSec6Collapsed(false);
  }

  // ── Section collapse state ───────────────────────────────────────────────
  const [sec1Collapsed, setSec1Collapsed] = useState(true);
  const [sec2Collapsed, setSec2Collapsed] = useState(true);
  const [sec3Collapsed, setSec3Collapsed] = useState(true);
  const [sec4Collapsed, setSec4Collapsed] = useState(true);

  // ── Section 01 — Job Basics ──────────────────────────────────────────────
  const [showBasicsOpts,      setShowBasicsOpts]      = useState(false);
  const [customerName,        setCustomerName]        = useState("");
  const [customerId,          setCustomerId]          = useState<number | null>(null);
  const [plannedDate,         setPlannedDate]         = useState(today());
  const [serviceType,         setServiceType]         = useState("");
  const [jobType,             setJobType]             = useState("");
  const [jobTitle,            setJobTitle]            = useState("");
  const [referenceNumber,     setReferenceNumber]     = useState("");
  const [customerRef,         setCustomerRef]         = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [priority,            setPriority]            = useState("normal");

  // ── Section 02 — Customer Details ───────────────────────────────────────
  const [showCustOpts,    setShowCustOpts]    = useState(false);
  const [contactName,     setContactName]     = useState("");
  const [contactPhone,    setContactPhone]    = useState("");
  const [contactEmail,    setContactEmail]    = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [billingNotes,    setBillingNotes]    = useState("");
  const [custInstructions,  setCustInstructions]  = useState("");
  const [custRefRequired,   setCustRefRequired]   = useState(false);
  const [poRequired,        setPoRequired]        = useState(false);

  function handleCustomerChange(name: string, id: number | null, customer?: Customer) {
    setCustomerName(name);
    setCustomerId(id);
    if (customer) {
      setContactName(customer.contactName   || "");
      setContactPhone(customer.contactPhone || "");
      setContactEmail(customer.contactEmail || "");
    }
  }

  // ── Section 03 — Stops ───────────────────────────────────────────────────
  const [stops, setStops] = useState<StopState[]>([makeStop()]);

  function updateStop(id: string, patch: Partial<StopState>) {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }
  function addStop() { setStops(prev => [...prev, makeStop()]); }
  function removeStop(id: string) { setStops(prev => prev.filter(s => s.id !== id)); }

  // ── Section 04 — Load Details ────────────────────────────────────────────
  const [showLoadOpts,     setShowLoadOpts]     = useState(false);
  const [materialDesc,     setMaterialDesc]     = useState("");
  const [totalQty,         setTotalQty]         = useState("");
  const [qtyUnit,          setQtyUnit]          = useState("");
  const [qtyUnitOther,     setQtyUnitOther]     = useState("");
  const [totalWeight,      setTotalWeight]      = useState("");
  const [podRequired,      setPodRequired]      = useState(true);
  // Optional — physical
  const [volume,           setVolume]           = useState("");
  const [dimensions,       setDimensions]       = useState("");
  // Optional — conditions
  const [hazardous,        setHazardous]        = useState(false);
  const [adrClass,         setAdrClass]         = useState("");
  const [tempControlled,   setTempControlled]   = useState(false);
  const [tempRange,        setTempRange]        = useState("");
  const [fragile,          setFragile]          = useState(false);
  const [stackable,        setStackable]        = useState(false);
  // Optional — equipment
  const [forkliftReq,      setForkliftReq]      = useState(false);
  const [tailLiftReq,      setTailLiftReq]      = useState(false);
  const [craneReq,         setCraneReq]         = useState(false);
  // Optional — handling methods
  const [loadingMethod,    setLoadingMethod]    = useState("");
  const [unloadingMethod,  setUnloadingMethod]  = useState("");
  // Optional — extra
  const [loadNotes,        setLoadNotes]        = useState("");
  const [photosRequired,   setPhotosRequired]   = useState(false);
  const [weighbridgeReq,   setWeighbridgeReq]   = useState(false);

  // ── Section 05 — Vehicle Requirements ───────────────────────────────────
  const [sec5Collapsed,    setSec5Collapsed]    = useState(true);
  const [reqBodyCategory,  setReqBodyCategory]  = useState<BodyCategory | "">("");
  const [reqGvwMin,        setReqGvwMin]        = useState<GvwClass | "">("");
  const [reqBodyType,      setReqBodyType]      = useState<BodyType | "">("");
  const [reqEquipment,     setReqEquipment]     = useState<OnboardEquipment[]>([]);
  const [reqLicenceClass,  setReqLicenceClass]  = useState<DriverLicenceClass | "">("");
  const [reqEndorsements,  setReqEndorsements]  = useState<DriverEndorsement[]>([]);
  const [trailerLength,    setTrailerLength]    = useState("");
  const [vehicleType,      setVehicleType]      = useState("");
  const [vehicleTypeOther, setVehicleTypeOther] = useState("");
  const [assignedTruck,    setAssignedTruck]    = useState("");
  const [assignedTrailer,  setAssignedTrailer]  = useState("");
  // Optional
  const [showVehicleOpts,  setShowVehicleOpts]  = useState(false);
  const [minSize,          setMinSize]          = useState("");
  const [trailersAllowed,  setTrailersAllowed]  = useState<string[]>([]);
  const [equipmentReq,     setEquipmentReq]     = useState<string[]>([]);
  const [driverQuals,      setDriverQuals]      = useState<string[]>([]);
  const [heightRestriction,setHeightRestriction]= useState("");
  const [weightRestriction,setWeightRestriction]= useState("");
  const [lengthRestriction,setLengthRestriction]= useState("");
  const [accessNotes,      setAccessNotes]      = useState("");

  // ── Section 06 — Return Instructions ────────────────────────────────────
  const [sec6Collapsed,      setSec6Collapsed]      = useState(true);
  const [failureAction,      setFailureAction]      = useState("call_assistance");
  // call_assistance
  const [assistancePhone,    setAssistancePhone]    = useState("");
  const [assistanceNote,     setAssistanceNote]     = useState("");
  // finish_then_return
  const [returnDestination,  setReturnDestination]  = useState("");
  // alternative address (shared by deliver_alternative and finish_then_return→alternative)
  const [altSavedLocationId, setAltSavedLocationId] = useState<number | null>(null);
  const [altLocationQuery,   setAltLocationQuery]   = useState("");
  const [altCompanyName,     setAltCompanyName]     = useState("");
  const [altStreet,          setAltStreet]          = useState("");
  const [altTown,            setAltTown]            = useState("");
  const [altPostcode,        setAltPostcode]        = useState("");
  const [altCountry,         setAltCountry]         = useState("United Kingdom");
  const [altLat,             setAltLat]             = useState("");
  const [altLng,             setAltLng]             = useState("");
  const [altUnit,            setAltUnit]            = useState("");
  const [altAddressLine2,    setAltAddressLine2]    = useState("");
  const [altCounty,          setAltCounty]          = useState("");
  const [altContactName,     setAltContactName]     = useState("");
  const [altContactPhone,    setAltContactPhone]    = useState("");
  const [altContactEmail,    setAltContactEmail]    = useState("");
  const [altNavNotes,        setAltNavNotes]        = useState("");
  const [altDriverNotes,     setAltDriverNotes]     = useState("");
  const [showAltOpts,        setShowAltOpts]        = useState(false);

  const needsAltAddress =
    failureAction === "deliver_alternative" ||
    (failureAction === "finish_then_return" && returnDestination === "alternative");

  useEffect(() => {
    if (!reqBodyCategory) return;
    const candidates = licencesThatCanDrive(reqBodyCategory);
    if (candidates.length > 0 && !reqLicenceClass) {
      setReqLicenceClass(candidates[0].value);
    }
  }, [reqBodyCategory, reqGvwMin, reqLicenceClass]);

  useEffect(() => {
    if (!reqBodyCategory) return;
    const allowed = gvwForCategory(reqBodyCategory).map(g => g.value);
    if (reqGvwMin && !allowed.includes(reqGvwMin)) setReqGvwMin("");
    const bodyTypes = BODY_TYPES_BY_CATEGORY[reqBodyCategory] ?? [];
    if (reqBodyType && !bodyTypes.includes(reqBodyType)) setReqBodyType("");
  }, [reqBodyCategory, reqGvwMin, reqBodyType]);

  // ── Quality / missing fields ─────────────────────────────────────────────
  const basicsComplete   = !!(customerName.trim() && plannedDate && serviceType && jobType);
  const customerComplete = !!(contactName.trim() && contactPhone.trim());
  const stopsComplete    = stops.length > 0 && stops.every(stopComplete);
  const loadComplete     = !!(materialDesc.trim() && totalQty.trim() && qtyUnit && totalWeight.trim());
  const selectedBodyTypes = reqBodyCategory ? (BODY_TYPES_BY_CATEGORY[reqBodyCategory] ?? []) : [];
  const visibleBodyTypeOptions = selectedBodyTypes.length > 0
    ? BODY_TYPE_OPTS.filter(([value]) => selectedBodyTypes.includes(value as BodyType))
    : BODY_TYPE_OPTS;
  const trailerBodyTypeOpts = BODY_TYPE_OPTS.filter(([value]) =>
    (TRAILER_BODY_TYPE_VALUES as readonly string[]).includes(value),
  );
  const visibleGvwOptions = reqBodyCategory
    ? gvwForCategory(reqBodyCategory).map(g => [g.value, g.label] as [string, string])
    : GVW_CLASS_OPTS;
  const trailerRequired = reqBodyCategory ? bodyCategoryNeedsTrailer(reqBodyCategory) : false;
  const bodyTypeRequired = !!reqBodyCategory && selectedBodyTypes.length > 0 && !trailerRequired;
  const visibleEquipmentOpts = equipmentForBodyType(reqBodyType, reqBodyCategory)
    .map(e => [e.value, e.label] as [string, string]);
  const vehicleComplete  =
    !!reqBodyCategory &&
    (!trailerRequired || trailersAllowed.length > 0) &&
    (!bodyTypeRequired || !!reqBodyType);

  const altAddressComplete = !needsAltAddress || !!(
    altCompanyName.trim() && altStreet.trim() && altTown.trim() && altPostcode.trim() && altCountry.trim()
  );
  const returnComplete =
    failureAction !== "finish_then_return" || (
      !!returnDestination && altAddressComplete
    );
  const assistanceComplete =
    failureAction !== "call_assistance" || !!assistancePhone.trim();
  const sec6Complete = !!failureAction && assistanceComplete && returnComplete && altAddressComplete;

  // ── "Started" flags (for status dots) ───────────────────────────────────
  const sec1Started = !!(customerName || (serviceType || jobType));
  const sec2Started = !!(contactName || contactPhone);
  const sec3Started = stops.some(s => s.siteName || s.street);
  const sec4Started = !!(materialDesc || totalQty || totalWeight);
  const sec5Started = !!(reqBodyCategory || reqGvwMin || reqBodyType || reqEquipment.length || reqLicenceClass || trailersAllowed.length);
  const sec6Started = failureAction !== "call_assistance" || !!assistancePhone;
  const hasStarted  = sec1Started || sec2Started || sec3Started || sec4Started || sec5Started;

  // Auto-collapse removed — sections stay open until the user manually closes them.
  // The section headers already show a green checkmark when complete.

  // ── Edit mode: load job and populate all state ───────────────────────────
  useEffect(() => {
    if (!editJobId) return;
    setLoadingJob(true);
    jobsApi.get(editJobId).then((job: PlannedJob) => {
      setCustomerName(job.customerName || job.customer?.name || "");
      setCustomerId(job.customerId ?? null);
      setPlannedDate(job.plannedDate ? job.plannedDate.slice(0, 10) : today());
      setServiceType(job.serviceType || "");
      setJobType(job.jobType || "");
      setJobTitle(job.jobTitle || "");
      setJobReference(job.jobReference ?? null);
      setReferenceNumber(job.referenceNumber || "");
      setCustomerRef(job.customerRef || "");
      setPurchaseOrderNumber(job.purchaseOrderNumber || "");
      setPriority(job.priority || "normal");
      setContactName(job.bookingContactName || "");
      setContactPhone(job.bookingContactPhone || "");
      setContactEmail(job.bookingContactEmail || "");
      setCustInstructions(job.customerInstructions || "");
      if (job.stops && job.stops.length > 0) {
        setStops([...job.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(jobStopToStopState));
      }
      const ld = job.loadDetails;
      setMaterialDesc(ld?.materialType || job.materialType || "");
      setTotalQty(ld?.quantity != null ? String(ld.quantity) : job.quantityExpected || "");
      setQtyUnit(ld?.unit || job.quantityUnit || "");
      setTotalWeight(ld?.weight != null ? String(ld.weight) : "");
      setVolume(ld?.volume != null ? String(ld.volume) : "");
      setDimensions(ld?.dimensions || "");
      setAdrClass(ld?.hazardClass || "");
      setTempControlled(ld?.tempControlled ?? false);
      setTempRange(ld?.tempRange || "");
      setFragile(ld?.fragile ?? false);
      setStackable(ld?.stackable ?? false);
      setForkliftReq(ld?.forkliftRequired ?? false);
      setTailLiftReq(ld?.tailLiftRequired ?? false);
      setCraneReq(ld?.craneRequired ?? false);
      setLoadingMethod(ld?.loadingMethod || "");
      setUnloadingMethod(ld?.unloadingMethod || "");
      setLoadNotes(ld?.notes || "");
      setPhotosRequired(ld?.photosRequired ?? false);
      setWeighbridgeReq(ld?.weighbridgeRequired ?? false);
      setPodRequired(job.requirePOD ?? true);
      const vClass = job.vehicleClassRequired || job.vehicleClass || "";
      const legacyReq = legacyVehicleToRequirement(vClass);
      setReqBodyCategory((job.reqBodyCategory || legacyReq.bodyCategory || "") as BodyCategory | "");
      setReqGvwMin((job.reqGvwMin || job.minVehicleSize || "") as GvwClass | "");
      setReqBodyType((job.reqBodyType || legacyReq.bodyType || "") as BodyType | "");
      setReqEquipment(Array.isArray(job.reqEquipment)
        ? job.reqEquipment as OnboardEquipment[]
        : legacyReq.equipment as OnboardEquipment[]);
      setReqLicenceClass((job.reqLicenceClass || legacyReq.licenceClass || "") as DriverLicenceClass | "");
      setReqEndorsements(Array.isArray(job.driverQualificationsReq) ? job.driverQualificationsReq as DriverEndorsement[] : []);
      if (vClass.startsWith("other:")) {
        setVehicleType("other");
        setVehicleTypeOther(vClass.replace("other:", "").trim());
      } else {
        setVehicleType(vClass);
      }
      setMinSize(job.minVehicleSize || "");
      setTrailersAllowed(Array.isArray(job.trailerTypesAllowed) ? job.trailerTypesAllowed : []);
      setAssignedTruck(job.assignedTruck || "");
      setAssignedTrailer(job.assignedTrailer || "");
      setEquipmentReq(Array.isArray(job.equipmentRequired) ? job.equipmentRequired : []);
      setDriverQuals(Array.isArray(job.driverQualificationsReq) ? job.driverQualificationsReq : []);
      setHeightRestriction(job.heightRestriction || "");
      setWeightRestriction(job.weightRestriction || "");
      setLengthRestriction(job.lengthRestriction || "");
      setAccessNotes(job.vehicleAccessNotes || "");
      setFailureAction(job.failureAction || "call_assistance");
      setAssistancePhone(job.assistancePhone || "");
      setAssistanceNote(job.assistanceNote || "");
      setReturnDestination(job.returnDestination || "");
      // Expand all sections so the user sees filled data
      setSec1Collapsed(false);
      setSec2Collapsed(false);
      setSec3Collapsed(false);
      setSec4Collapsed(false);
      setSec5Collapsed(false);
      setSec6Collapsed(false);
    }).catch(() => {
      setError("Could not load job for editing.");
    }).finally(() => {
      setLoadingJob(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editJobId]);

  // ── Template-edit mode: load template and populate all state ────────────────
  useEffect(() => {
    if (!editTemplateId) return;
    setLoadingJob(true);
    jobsApi.templates().then(r => {
      const t = r.data.find((t: JobTemplate) => t.id === editTemplateId);
      if (!t) { setError("Template not found."); return; }
      applyTemplate(t);
      // Restore template name for editing
      setTemplateName(t.name);
    }).catch(() => {
      setError("Could not load template for editing.");
    }).finally(() => {
      setLoadingJob(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTemplateId]);

  // ── Save template (template-edit mode) ───────────────────────────────────
  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      setError("Enter a template name");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving("ready");
    setError("");
    try {
      const [params] = makePayloadParams("ready_to_plan");
      const stopData = params.stops.map(s => ({
        stopType:        s.stopType,
        savedLocationId: s.savedLocationId,
        locationQuery:   s.locationQuery,
        siteName:        s.siteName,
        street:          s.street,
        town:            s.town,
        postcode:        s.postcode,
        country:         s.country,
        lat:             s.lat,
        lng:             s.lng,
        unitBuilding:    s.unitBuilding,
        addressLine2:    s.addressLine2,
        countyRegion:    s.countyRegion,
        contactName:     s.contactName,
        contactPhone:    s.contactPhone,
        contactEmail:    s.contactEmail,
        driverNotes:     s.driverNotes,
        navigationInstructions: s.navigationInstructions,
        openingHours:    s.openingHours,
        locationType:    s.locationType,
        internalNotes:   s.internalNotes,
        numPallets:      s.numPallets,
        earliestArrival: s.earliestArrival,
        unloadingTime:   s.unloadingTime,
        bookingRequired: s.bookingRequired,
        // Per-run variables NOT stored
      }));
      const defaultJobData = {
        customerId:       params.customerId,
        customerName:     params.customerName,
        serviceType:      params.serviceType,
        jobType:          params.jobType,
        jobTitle:         params.jobTitle,
        priority:         params.priority,
        contactName:      params.contactName,
        contactPhone:     params.contactPhone,
        contactEmail:     params.contactEmail,
        billingNotes:     params.billingNotes,
        custInstructions: params.custInstructions,
        custRefRequired:  params.custRefRequired,
        poRequired:       params.poRequired,
        materialDesc:     params.materialDesc,
        totalQty:         params.totalQty,
        qtyUnit:          params.qtyUnit,
        qtyUnitOther:     params.qtyUnitOther,
        totalWeight:      params.totalWeight,
        volume:           params.volume,
        dimensions:       params.dimensions,
        adrClass:         params.adrClass,
        fragile:          params.fragile,
        stackable:        params.stackable,
        tempControlled:   params.tempControlled,
        tempRange:        params.tempRange,
        forkliftReq:      params.forkliftReq,
        tailLiftReq:      params.tailLiftReq,
        craneReq:         params.craneReq,
        loadingMethod:    params.loadingMethod,
        unloadingMethod:  params.unloadingMethod,
        loadNotes:        params.loadNotes,
        photosRequired:   params.photosRequired,
        weighbridgeReq:   params.weighbridgeReq,
        podRequired:      params.podRequired,
        vehicleType:      params.vehicleType,
        vehicleTypeOther: params.vehicleTypeOther,
        reqBodyCategory:  params.reqBodyCategory,
        reqGvwMin:        params.reqGvwMin,
        reqBodyType:      params.reqBodyType,
        reqEquipment:     params.reqEquipment,
        reqLicenceClass:  params.reqLicenceClass,
        reqEndorsements:  params.reqEndorsements,
        trailerLength:    trailerLength,
        minSize:          params.minSize,
        trailersAllowed:  params.trailersAllowed,
        equipmentReq:     params.equipmentReq,
        driverQuals:      params.driverQuals,
        heightRestriction: params.heightRestriction,
        weightRestriction: params.weightRestriction,
        lengthRestriction: params.lengthRestriction,
        accessNotes:      params.accessNotes,
        assignedTruck:    params.assignedTruck,
        assignedTrailer:  params.assignedTrailer,
        failureAction:    params.failureAction,
        assistancePhone:  params.assistancePhone,
        assistanceNote:   params.assistanceNote,
        returnDestination: params.returnDestination,
        altAddress:       params.needsAltAddress ? {
          savedLocationId: params.altSavedLocationId,
          companyName:     params.altCompanyName,
          street:          params.altStreet,
          town:            params.altTown,
          postcode:        params.altPostcode,
          country:         params.altCountry,
          lat:             params.altLat,
          lng:             params.altLng,
          unit:            params.altUnit,
          addressLine2:    params.altAddressLine2,
          county:          params.altCounty,
          contactName:     params.altContactName,
          contactPhone:    params.altContactPhone,
          contactEmail:    params.altContactEmail,
          navNotes:        params.altNavNotes,
          driverNotes:     params.altDriverNotes,
        } : null,
      };
      const patchBody = {
        name:               templateName.trim(),
        defaultMaterialType: params.materialDesc,
        defaultStops:       stopData,
        defaultJobData,
      };
      if (editTemplateId) {
        await jobsApi.updateTemplate(editTemplateId, patchBody);
      } else {
        await jobsApi.createTemplate(patchBody);
      }
      navigate("/app/templates");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save template");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  // ── Auto-save indicator (localStorage snapshot every 30 s) ────────────────
  useEffect(() => {
    const started = customerName || serviceType || stops[0].siteName || materialDesc;
    if (!started) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("lb_job_draft_ts", new Date().toISOString());
      } catch {}
      setLastAutoSaved(new Date());
    }, 30_000);
    return () => clearTimeout(t);
  });

  const MISSING = [
    !customerName.trim()   && "Customer",
    !plannedDate           && "Planned date",
    !serviceType           && "Service type",
    !jobType               && "Job type",
    !contactName.trim()    && "Contact name",
    !contactPhone.trim()   && "Contact phone",
    !stopsComplete         && "Stop addresses / timing",
    !materialDesc.trim()   && "Goods description",
    !totalQty.trim()       && "Total quantity",
    !qtyUnit               && "Unit",
    !totalWeight.trim()    && "Total weight",
    !vehicleComplete       && "Vehicle requirements",
    !sec6Complete          && "Return / failure instruction",
  ].filter(Boolean) as string[];

  // ── Score calculation ────────────────────────────────────────────────────
  // Required fields scale to 65 pts; optional fields scale to 35 pts.
  // Points within each group are relative weights — totals are normalised.
  const SCORE_REQ = [
    { pts: 8,  ok: !!customerName.trim() },
    { pts: 5,  ok: !!plannedDate },
    { pts: 7,  ok: !!serviceType },
    { pts: 7,  ok: !!jobType },
    { pts: 6,  ok: !!contactName.trim() },
    { pts: 6,  ok: !!contactPhone.trim() },
    { pts: 12, ok: stopsComplete },
    { pts: 6,  ok: !!materialDesc.trim() },
    { pts: 4,  ok: !!(totalQty.trim() && qtyUnit) },
    { pts: 4,  ok: !!totalWeight.trim() },
    { pts: 7,  ok: vehicleComplete },
    { pts: 5,  ok: sec6Complete },
  ];
  const SCORE_OPT: { label: string; pts: number; ok: boolean }[] = [
    { label: "Reference number",      pts: 3, ok: !!referenceNumber.trim() },
    { label: "Customer / PO ref",     pts: 2, ok: !!(customerRef.trim() || purchaseOrderNumber.trim()) },
    { label: "Contact email",         pts: 2, ok: !!contactEmail.trim() },
    { label: "Stop contacts",         pts: 4, ok: stops.every(s => !!s.contactName.trim()) },
    { label: "Booking references",    pts: 2, ok: stops.some(s => s.bookingRequired && !!s.bookingRef.trim()) },
    { label: "Driver stop notes",     pts: 2, ok: stops.some(s => !!s.driverNotes.trim()) },
    { label: "Volume / dimensions",   pts: 2, ok: !!(volume.trim() || dimensions.trim()) },
    { label: "Equipment required",    pts: 4, ok: reqEquipment.length > 0 },
    { label: "Driver endorsements",   pts: 4, ok: reqEndorsements.length > 0 },
    { label: "Trailer types",          pts: 2, ok: !trailerRequired || trailersAllowed.length > 0 },
    { label: "Vehicle restrictions",  pts: 2, ok: !!(heightRestriction.trim() || weightRestriction.trim() || lengthRestriction.trim()) },
    { label: "Access notes",          pts: 3, ok: !!accessNotes.trim() },
    { label: "Min vehicle size",      pts: 2, ok: !!reqGvwMin },
    { label: "Load notes",            pts: 1, ok: !!loadNotes.trim() },
  ];

  const reqTotal   = SCORE_REQ.reduce((s, x) => s + x.pts, 0);
  const reqEarned  = SCORE_REQ.filter(x => x.ok).reduce((s, x) => s + x.pts, 0);
  const optTotal   = SCORE_OPT.reduce((s, x) => s + x.pts, 0);
  const optEarned  = SCORE_OPT.filter(x => x.ok).reduce((s, x) => s + x.pts, 0);
  const reqScore   = Math.round((reqEarned / reqTotal) * 65);
  const optScore   = Math.round((optEarned / optTotal) * 35);
  const totalScore = reqScore + optScore;

  const scoreColor =
    totalScore >= 80 ? "text-green-600" :
    totalScore >= 40 ? "text-amber-600" :
    totalScore >= 10 ? "text-red-500" : "text-slate-400";
  const barReqColor  = "bg-slate-600";
  const barOptColor  = "bg-green-500";
  const OPT_MISSING  = SCORE_OPT.filter(x => !x.ok).map(x => x.label);

  function makePayloadParams(saveMode: "draft" | "ready_to_plan"): [CreateJobPayload, "draft" | "ready_to_plan"] {
    const params: CreateJobPayload = {
      stops,
      qtyUnit,
      qtyUnitOther,
      materialDesc,
      totalQty,
      totalWeight,
      volume,
      adrClass,
      loadNotes,
      dimensions,
      fragile,
      stackable,
      tempControlled,
      tempRange,
      photosRequired,
      weighbridgeReq,
      forkliftReq,
      tailLiftReq,
      craneReq,
      loadingMethod,
      unloadingMethod,
      vehicleType,
      vehicleTypeOther,
      reqBodyCategory,
      reqGvwMin,
      reqBodyType,
      reqEquipment,
      reqLicenceClass,
      reqEndorsements,
      customerId,
      customerName,
      plannedDate,
      serviceType,
      jobType,
      jobTitle,
      referenceNumber,
      customerRef,
      purchaseOrderNumber,
      priority,
      contactName,
      contactPhone,
      contactEmail,
      billingNotes,
      custInstructions,
      custRefRequired,
      poRequired,
      assignedTruck,
      assignedTrailer,
      minSize,
      trailersAllowed,
      equipmentReq,
      driverQuals,
      heightRestriction,
      weightRestriction,
      lengthRestriction,
      accessNotes,
      podRequired,
      failureAction,
      assistancePhone,
      assistanceNote,
      returnDestination,
      needsAltAddress,
      altSavedLocationId,
      altCompanyName,
      altStreet,
      altTown,
      altPostcode,
      altCountry,
      altLat,
      altLng,
      altUnit,
      altAddressLine2,
      altCounty,
      altContactName,
      altContactPhone,
      altContactEmail,
      altNavNotes,
      altDriverNotes,
      isEditMode,
      saveAsTemplate,
      templateName,
    };
    return [params, saveMode];
  }

  async function handleSaveDraft() {
    if (!isEditMode && saveAsTemplate && !templateName.trim()) {
      setError("Enter a template name, or uncheck 'Save as template'");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving("draft");
    setError("");
    try {
      const body = buildBody(...makePayloadParams("draft"));
      if (editJobId) {
        await jobsApi.update(editJobId, body);
      } else {
        await jobsApi.create(body);
      }
      navigate("/app/jobs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveReady() {
    setTriedSave(true);
    if (!isEditMode && saveAsTemplate && !templateName.trim()) {
      setError("Enter a template name, or uncheck 'Save as template'");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // If required fields are missing, just reveal the pills — don't call API
    if (MISSING.length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving("ready");
    setError("");
    try {
      const body = buildBody(...makePayloadParams("ready_to_plan"));
      if (editJobId) {
        await jobsApi.update(editJobId, body);
      } else {
        await jobsApi.create(body);
      }
      navigate("/app/jobs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save job");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(null);
    }
  }

  if (loadingJob) {
    return <div className="flex h-64 items-center justify-center text-muted">{isTemplateMode ? "Loading template…" : "Loading job…"}</div>;
  }

  return (
    <div className="min-h-screen bg-surface pb-40">

      {/* ── Page header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5" style={{boxShadow: '0 1px 4px rgba(15,23,42,0.06)'}}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-muted hover:text-primary hover:border-slate-300 hover:bg-slate-50 transition-all flex-shrink-0" title="Back">←</button>
          <div>
            <h1 className="text-xl font-black text-primary">
              {isTemplateMode ? "Edit Template" : isEditMode ? "Edit Job" : "New Job"}
            </h1>
            <p className="text-sm text-muted mt-0.5">
              {isTemplateMode
                ? "Change any details — dates and reference numbers are not stored in templates"
                : isEditMode
                ? "Update the fields below — changes won't be lost until you save"
                : "Fill in the sections below — save as draft any time"}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="max-w-3xl mx-auto px-4 pt-4"><div className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">{error}</div></div>}

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">

        {/* ── Template name input (template-edit mode) ──────────────────────── */}
        {isTemplateMode && (
          <div className="card px-5 py-4 border-l-4 border-l-blue-500">
            <label className="text-xs font-bold text-muted uppercase tracking-widest mb-1.5 block">Template Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Tesco Luton Daily Run"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
            />
            <p className="text-xs text-muted mt-1.5">
              ⚡ Dates, time slots and reference numbers are <strong>not stored</strong> — fill them in when creating a job from this template.
            </p>
          </div>
        )}

        {/* ── Template picker ────────────────────────────────────────────────── */}
        {!isEditMode && !isTemplateMode && templates.length > 0 && (
          <div className="card px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold text-muted uppercase tracking-widest mb-1.5 block">
                  Start from a template
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="input pr-8"
                    placeholder="Type to search templates…"
                    value={tplQuery}
                    onChange={e => setTplQuery(e.target.value)}
                  />
                  {tplQuery && (
                    <button type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary text-lg leading-none"
                      onClick={() => setTplQuery("")}>×</button>
                  )}
                </div>
                {tplQuery && (() => {
                  const matches = templates.filter(t =>
                    t.name.toLowerCase().includes(tplQuery.toLowerCase()) && t.status === "active"
                  );
                  if (!matches.length) return (
                    <p className="text-xs text-muted mt-2">No templates match "{tplQuery}"</p>
                  );
                  return (
                    <div className="mt-1.5 border border-border rounded-xl overflow-hidden shadow-sm">
                      {matches.slice(0, 6).map(t => (
                        <button key={t.id} type="button"
                          onClick={() => applyTemplate(t)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-border last:border-0 flex items-center justify-between gap-2">
                          <span className="font-medium text-primary">{t.name}</span>
                          {t.defaultMaterialType && (
                            <span className="text-xs text-muted">{t.defaultMaterialType}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <p className="text-xs text-muted hidden sm:block flex-shrink-0 max-w-32 text-right leading-relaxed">
                Fills stops, cargo and references automatically
              </p>
            </div>
          </div>
        )}

        {/* ── Quality score ──────────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          {/* Gradient top bar */}
          <div className="h-1.5 w-full flex">
            <div className="h-full bg-slate-600 transition-all duration-700 ease-out" style={{ width: hasStarted ? `${reqScore}%` : "0%" }} />
            <div className="h-full bg-green-500 transition-all duration-700 ease-out" style={{ width: hasStarted ? `${optScore}%` : "0%" }} />
            <div className="h-full flex-1 bg-slate-100" />
          </div>
          <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Job Completeness</div>
              <div className={"text-5xl font-black leading-none " + (hasStarted ? scoreColor : "text-slate-300")}>
                {hasStarted ? totalScore : "—"}<span className="text-2xl">{hasStarted ? "%" : ""}</span>
              </div>
              <div className="text-xs text-muted mt-1.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600 inline-block" /> Required <strong className="text-slate-700">{hasStarted ? `${reqScore}/65` : "0/65"}</strong></span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Optional <strong className="text-green-700">{hasStarted ? `${optScore}/35` : "0/35"}</strong></span>
              </div>
            </div>
            <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center flex-shrink-0 ${
              !hasStarted ? "border-slate-100 bg-slate-50" :
              totalScore >= 80 ? "border-green-200 bg-green-50" : totalScore >= 40 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
              <span className={"text-xl font-black " + (hasStarted ? scoreColor : "text-slate-300")}>{hasStarted ? `${totalScore}%` : "—"}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4 flex">
            <div className={"h-full bg-slate-600 transition-all duration-700 ease-out rounded-full"} style={{ width: hasStarted ? `${reqScore}%` : "0%" }} />
            <div className={"h-full bg-green-500 transition-all duration-700 ease-out"} style={{ width: hasStarted ? `${optScore}%` : "0%", borderRadius: reqScore > 0 ? "0 9999px 9999px 0" : "9999px" }} />
          </div>

          {/* Missing required */}
          {triedSave && MISSING.length > 0 && (
            <div className="border-t border-slate-100 pt-3 mb-3">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2.5">
                {MISSING.length} still needed
              </div>
              <div className="flex flex-wrap gap-2">
                {MISSING.map(f => (
                  <span key={f} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-full font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" /> {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional fields to improve score */}
          {MISSING.length === 0 && OPT_MISSING.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-2.5">
                Add these to boost your score
              </div>
              <div className="flex flex-wrap gap-2">
                {OPT_MISSING.map(f => (
                  <span key={f} className="inline-flex items-center gap-1.5 text-xs bg-slate-50 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors cursor-default">
                    + {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {MISSING.length === 0 && OPT_MISSING.length === 0 && (
            <div className="border-t border-green-200 pt-3 bg-green-50 -mx-5 px-5 -mb-5 pb-5 rounded-b-xl">
              <span className="text-sm text-green-700 font-semibold">✓ All fields complete — this job is ready to plan</span>
            </div>
          )}
          </div>{/* end p-5 */}
        </div>

        {/* ── Section 01 — Job Basics ────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={1} icon="📋" title="Job Basics" subtitle="Date, service type and job type" active
            collapsed={sec1Collapsed} onToggle={() => setSec1Collapsed(o => !o)}
            summary={[customerName, plannedDate, serviceType].filter(Boolean).join(" · ")}
            complete={basicsComplete} started={sec1Started} />
          {!sec1Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">
            <div>
              <FieldLabel required>Customer</FieldLabel>
              <CustomerSearch value={customerName} linkedId={customerId} onChange={handleCustomerChange} />
            </div>
            <div>
              <FieldLabel required>Planned Date</FieldLabel>
              <input type="date" className="input" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} />
              <p className="text-xs text-muted mt-1.5">👉 When this job appears for planning</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Service Type</FieldLabel>
                <select className="input" value={serviceType} onChange={e => setServiceType(e.target.value)}>
                  <option value="">— Select —</option>
                  {SERVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel required>Job Type</FieldLabel>
                <select className="input" value={jobType} onChange={e => setJobType(e.target.value)}>
                  <option value="">— Select —</option>
                  {JOB_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <OptionalToggle open={showBasicsOpts} onToggle={() => setShowBasicsOpts(o => !o)} label="optional job details" />
            {showBasicsOpts && (
              <div className="space-y-4 pt-1 border-t border-border">
                <TextField
                  label="Job Title / Short Description"
                  value={jobTitle}
                  onChange={setJobTitle}
                  placeholder="e.g. Overnight trunking — North to South depot"
                  caseRule="proper_name"
                />
                {/* Auto-generated job reference */}
                <div className="flex items-center gap-3 py-2 px-3 rounded-xl border bg-slate-50">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">Job Reference No.</div>
                    {jobReference ? (
                      <div className="font-mono font-bold text-green-700 text-base">{jobReference}</div>
                    ) : (
                      <div className="text-sm text-muted italic">
                        {companyTicker
                          ? `${companyTicker}-${String(new Date().getFullYear()).slice(-2)}-XXXXXX — auto-assigned on save`
                          : "Auto-assigned on save (set company ticker in Settings first)"}
                      </div>
                    )}
                  </div>
                  {jobReference && <div className="text-green-600 text-lg">✓</div>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField label="Customer Reference No." value={referenceNumber} onChange={setReferenceNumber} placeholder="CUST-REF-456" />
                  <TextField label="Purchase Order No." value={purchaseOrderNumber} onChange={setPurchaseOrderNumber} placeholder="PO-789" />
                </div>
                <div className="max-w-xs">
                  <FieldLabel>Priority</FieldLabel>
                  <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                    {PRIORITY_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadOnlyField label="Created By" value={user?.name ?? "—"} />
                  <ReadOnlyField label="Created At" value={nowDisplay()} />
                </div>
              </div>
            )}
          </div>}
          {!sec1Collapsed && <SectionFooter complete={basicsComplete} label="Job basics" onCollapse={() => setSec1Collapsed(true)} />}
        </div>

        {/* ── Section 02 — Customer Details ──────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={2} icon="🏢" title="Customer Details" subtitle="Operational contact for this job" active
            collapsed={sec2Collapsed} onToggle={() => setSec2Collapsed(o => !o)}
            summary={[contactName, contactPhone].filter(Boolean).join(" · ")}
            complete={customerComplete} started={sec2Started} />
          {!sec2Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">
            {customerId && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span>✓</span>
                <span>Linked to <strong>{customerName}</strong> — contact details autofilled. Edit below if different for this job.</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Contact Name" value={contactName} onChange={setContactName} placeholder="Jane Smith" caseRule="proper_name" required />
              <div>
                <FieldLabel required>Contact Phone</FieldLabel>
                <input type="tel" className="input" placeholder="07700 900123"
                  value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>
            <OptionalToggle open={showCustOpts} onToggle={() => setShowCustOpts(o => !o)} label="customer details" />
            {showCustOpts && (
              <div className="space-y-4 pt-1 border-t border-border">
                <TextField label="Customer Address" value={customerAddress} onChange={setCustomerAddress} placeholder="1 Example Road, Sampletown, EX1 1AA" caseRule="address_line" />
                <TextField label="Contact Email" type="email" value={contactEmail} onChange={setContactEmail} placeholder="jane@example.com" caseRule="lower" />
                <div>
                  <FieldLabel>Billing Notes</FieldLabel>
                  <textarea className="input min-h-16 resize-none" placeholder="e.g. Invoice to head office, attn: Accounts Payable…"
                    value={billingNotes} onChange={e => setBillingNotes(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Customer-Specific Instructions</FieldLabel>
                  <textarea className="input min-h-16 resize-none" placeholder="e.g. Always call 30 min before arrival, do not use rear entrance…"
                    value={custInstructions} onChange={e => setCustInstructions(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Toggle value={custRefRequired} onChange={setCustRefRequired} label="Customer reference required" />
                    <p className="text-xs text-muted mt-1.5">Driver must enter customer ref before completing job</p>
                  </div>
                  <div>
                    <Toggle value={poRequired} onChange={setPoRequired} label="Purchase order required" />
                    <p className="text-xs text-muted mt-1.5">Driver must enter PO number before completing job</p>
                  </div>
                </div>
              </div>
            )}
          </div>}
          {!sec2Collapsed && <SectionFooter complete={customerComplete} label="Customer details" onCollapse={() => setSec2Collapsed(true)} />}
        </div>

        {/* ── Section 03 — Collection / Delivery ─────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={3} icon="🔄" title="Collection / Delivery" subtitle="Add all pickup and dropoff stops for this job" active
            collapsed={sec3Collapsed} onToggle={() => setSec3Collapsed(o => !o)}
            summary={`${stops.length} stop${stops.length !== 1 ? "s" : ""} · ${stops.filter(stopComplete).length} complete`}
            complete={stopsComplete} started={sec3Started} />

          {!sec3Collapsed && <div className="p-4 space-y-3">
            {stops.map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                index={i}
                total={stops.length}
                locations={locations}
                onChange={patch => updateStop(stop.id, patch)}
                onRemove={() => removeStop(stop.id)}
                triedSave={triedSave}
              />
            ))}

            <button type="button" onClick={addStop}
              className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted hover:border-accent hover:text-accent transition-colors">
              + Add another stop
            </button>
          </div>}

          {!sec3Collapsed && <SectionFooter complete={stopsComplete} label="All stops" onCollapse={() => setSec3Collapsed(true)} />}
        </div>

        {/* ── Section 04 — Load Details ───────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={4} icon="⚖️" title="Load Details" subtitle="Total job load, weight, conditions and handling" active
            collapsed={sec4Collapsed} onToggle={() => setSec4Collapsed(o => !o)}
            summary={[materialDesc, totalWeight ? totalWeight + "t" : ""].filter(Boolean).join(" · ")}
            complete={loadComplete} started={sec4Started} />
          {!sec4Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            {/* Goods description */}
            <div>
              <FieldLabel required>Goods / Material Description</FieldLabel>
              <input type="text" className="input" placeholder="e.g. Construction aggregate, frozen poultry, retail fixtures"
                value={materialDesc} onChange={e => setMaterialDesc(e.target.value)} />
            </div>

            {/* Qty + unit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Total Quantity</FieldLabel>
                <input type="text" inputMode="decimal" className="input" placeholder="e.g. 24"
                  value={totalQty} onChange={e => setTotalQty(e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Unit</FieldLabel>
                <select className="input" value={qtyUnit} onChange={e => setQtyUnit(e.target.value)}>
                  <option value="">— Select unit —</option>
                  {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            {qtyUnit === "other" && (
              <div>
                <FieldLabel required>Unit Description</FieldLabel>
                <input type="text" className="input" placeholder="e.g. Rolls, coils, drums…"
                  value={qtyUnitOther} onChange={e => setQtyUnitOther(e.target.value)} />
              </div>
            )}

            {/* Total weight */}
            <div className="max-w-xs">
              <FieldLabel required>Total Weight / Estimated Weight</FieldLabel>
              <div className="relative">
                <input type="text" inputMode="decimal" className="input pr-12" placeholder="e.g. 24.0"
                  value={totalWeight} onChange={e => setTotalWeight(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">tonnes</span>
              </div>
            </div>

            {/* POD required */}
            <div>
              <Toggle value={podRequired} onChange={setPodRequired} label="Proof of delivery required" />
              <p className="text-xs text-muted mt-1.5">Driver must confirm delivery and capture POD before completing the job</p>
            </div>

            <OptionalToggle open={showLoadOpts} onToggle={() => setShowLoadOpts(o => !o)} label="load details" />

            {showLoadOpts && (
              <div className="space-y-5 pt-1 border-t border-border">

                {/* Physical */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Physical</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Volume</FieldLabel>
                      <div className="relative">
                        <input type="text" className="input pr-8" placeholder="e.g. 36"
                          value={volume} onChange={e => setVolume(e.target.value)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">m³</span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Dimensions (L × W × H)</FieldLabel>
                      <input type="text" className="input" placeholder="e.g. 2.4 × 1.2 × 1.8 m"
                        value={dimensions} onChange={e => setDimensions(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Conditions</div>
                  <div className="space-y-3">
                    <div>
                      <Toggle value={hazardous} onChange={setHazardous} label="Hazardous goods (ADR)" />
                      {hazardous && (
                        <div className="mt-2 max-w-xs">
                          <FieldLabel>ADR Class</FieldLabel>
                          <input type="text" className="input" placeholder="e.g. Class 3 — Flammable liquids"
                            value={adrClass} onChange={e => setAdrClass(e.target.value)} />
                        </div>
                      )}
                    </div>
                    <div>
                      <Toggle value={tempControlled} onChange={setTempControlled} label="Temperature controlled" />
                      {tempControlled && (
                        <div className="mt-2 max-w-xs">
                          <FieldLabel>Temperature Range</FieldLabel>
                          <input type="text" className="input" placeholder="e.g. 2°C – 8°C"
                            value={tempRange} onChange={e => setTempRange(e.target.value)} />
                        </div>
                      )}
                    </div>
                    <Toggle value={fragile}   onChange={setFragile}   label="Fragile" />
                    <Toggle value={stackable} onChange={setStackable} label="Stackable" />
                  </div>
                </div>

                {/* Handling / equipment */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Handling Equipment Required</div>
                  <div className="space-y-3">
                    <Toggle value={forkliftReq} onChange={setForkliftReq} label="Forklift required" />
                    <Toggle value={tailLiftReq} onChange={setTailLiftReq} label="Tail lift required" />
                    <Toggle value={craneReq}    onChange={setCraneReq}    label="Crane required" />
                  </div>
                </div>

                {/* Handling methods */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Handling Methods</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Loading Method</FieldLabel>
                      <select className="input" value={loadingMethod} onChange={e => setLoadingMethod(e.target.value)}>
                        <option value="">— Select —</option>
                        {HANDLING_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Unloading Method</FieldLabel>
                      <select className="input" value={unloadingMethod} onChange={e => setUnloadingMethod(e.target.value)}>
                        <option value="">— Select —</option>
                        {HANDLING_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Extra */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Extra</div>
                  <div className="space-y-3">
                    <div>
                      <FieldLabel>Load Notes</FieldLabel>
                      <textarea className="input min-h-16 resize-none" placeholder="Any additional load information for the driver or planner…"
                        value={loadNotes} onChange={e => setLoadNotes(e.target.value)} />
                    </div>
                    <Toggle value={photosRequired}  onChange={setPhotosRequired}  label="Photos / documents required" />
                    <Toggle value={weighbridgeReq}  onChange={setWeighbridgeReq}  label="Weighbridge ticket required" />
                  </div>
                </div>

              </div>
            )}
          </div>}
          {!sec4Collapsed && <SectionFooter complete={loadComplete} label="Load details" onCollapse={() => setSec4Collapsed(true)} />}
        </div>

        {/* ── Section 05 — Vehicle Requirements ─────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={5} icon="🚛" title="Vehicle Requirements" subtitle="Body category, trailer, equipment and licence" active
            collapsed={sec5Collapsed} onToggle={() => setSec5Collapsed(o => !o)}
            summary={reqBodyCategory ? [
              optionLabel(BODY_CATEGORY_OPTS, reqBodyCategory),
              reqGvwMin,
              reqBodyType ? optionLabel(BODY_TYPE_OPTS, reqBodyType) : "",
            ].filter(Boolean).join(" · ") : undefined}
            complete={vehicleComplete} started={sec5Started} />

          {!sec5Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            <div>
              <FieldLabel required>Body Category</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {BODY_CATEGORY_OPTS.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => {
                      const next = key as BodyCategory;
                      setReqBodyCategory(next);
                      setVehicleType(key);
                      if (!bodyCategoryNeedsTrailer(next)) setTrailersAllowed([]);
                    }}
                    className={"text-sm px-3 py-1.5 rounded-full border font-medium transition-colors " +
                      (reqBodyCategory === key
                        ? "bg-slate-700 text-white border-slate-700"
                        : "bg-white text-muted border-border hover:border-gray-400")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visibleGvwOptions.length > 0 && (
              <div>
                <FieldLabel>Minimum GVW</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {visibleGvwOptions.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setReqGvwMin(key as GvwClass)}
                      className={"text-sm px-3 py-1.5 rounded-full border font-medium transition-colors " +
                        (reqGvwMin === key
                          ? "bg-slate-700 text-white border-slate-700"
                          : "bg-white text-muted border-border hover:border-gray-400")}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bodyTypeRequired && (
              <div>
                <FieldLabel required>Body Type</FieldLabel>
                <select className="input max-w-xl" value={reqBodyType} onChange={e => setReqBodyType(e.target.value as BodyType | "")}>
                  <option value="">— Select body type —</option>
                  {visibleBodyTypeOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}

            {trailerRequired && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-blue-700 text-sm font-bold">Trailer required</span>
                  <span className="text-blue-500 text-xs">— select acceptable trailer body types</span>
                </div>
                <div>
                  <FieldLabel required>Trailer Body Type</FieldLabel>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {trailerBodyTypeOpts.map(([key, label]) => (
                      <button key={key} type="button"
                        onClick={() => setTrailersAllowed(prev =>
                          prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
                        )}
                        className={"text-sm px-3 py-1.5 rounded-full border font-medium transition-colors " +
                          (trailersAllowed.includes(key)
                            ? "bg-blue-700 text-white border-blue-700"
                            : "bg-white text-muted border-border hover:border-blue-400")}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {trailersAllowed.length === 0 && (
                    <p className="mt-1.5 text-xs text-red-500">Select at least one trailer type</p>
                  )}
                </div>
                <div className="max-w-xs">
                  <FieldLabel>Trailer Length</FieldLabel>
                  <select className="input" value={trailerLength} onChange={e => setTrailerLength(e.target.value)}>
                    <option value="">— No length preference —</option>
                    {TRAILER_LENGTH_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="max-w-xs">
                  <FieldLabel>Trailer Number Plate</FieldLabel>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. TR45 XYZ  (leave blank if not yet known)"
                    value={assignedTrailer}
                    onChange={e => setAssignedTrailer(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-xl">
              <div>
                <FieldLabel>Truck / Unit Registration</FieldLabel>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. AB12 CDE"
                  value={assignedTruck}
                  onChange={e => setAssignedTruck(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted mt-1.5">
                  Optional at creation. Planner assigns from dashboard.
                </p>
              </div>
              {!trailerRequired && (
                <div>
                  <FieldLabel>Trailer Number Plate</FieldLabel>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. TR45 XYZ"
                    value={assignedTrailer}
                    onChange={e => setAssignedTrailer(e.target.value.toUpperCase())}
                  />
                  <p className="text-xs text-muted mt-1.5">
                    Use when a trailer is already known or loaded.
                  </p>
                </div>
              )}
            </div>

            <div>
              <FieldLabel>Onboard Equipment</FieldLabel>
              <MultiCheck options={visibleEquipmentOpts} value={reqEquipment} onChange={v => setReqEquipment(v as OnboardEquipment[])} />
            </div>

            <div>
              <FieldLabel>Minimum Driver Licence</FieldLabel>
              <select className="input max-w-xl" value={reqLicenceClass} onChange={e => setReqLicenceClass(e.target.value as DriverLicenceClass | "")}>
                <option value="">— Select licence —</option>
                {DRIVER_LICENCE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div>
              <FieldLabel>Driver Endorsements</FieldLabel>
              <MultiCheck options={DRIVER_ENDORSEMENT_OPTS} value={reqEndorsements} onChange={v => setReqEndorsements(v as DriverEndorsement[])} />
            </div>

            <OptionalToggle open={showVehicleOpts} onToggle={() => setShowVehicleOpts(o => !o)} label="vehicle details" />

            {showVehicleOpts && (
              <div className="space-y-6 pt-1 border-t border-border">

                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Restrictions</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <FieldLabel>Height</FieldLabel>
                      <div className="relative">
                        <input type="text" inputMode="decimal" className="input pr-6" placeholder="e.g. 4.0"
                          value={heightRestriction} onChange={e => setHeightRestriction(e.target.value)} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">m</span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Weight</FieldLabel>
                      <div className="relative">
                        <input type="text" inputMode="decimal" className="input pr-6" placeholder="e.g. 7.5"
                          value={weightRestriction} onChange={e => setWeightRestriction(e.target.value)} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">t</span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Length</FieldLabel>
                      <div className="relative">
                        <input type="text" inputMode="decimal" className="input pr-6" placeholder="e.g. 9.0"
                          value={lengthRestriction} onChange={e => setLengthRestriction(e.target.value)} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">m</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Access / Vehicle Notes</div>
                  <textarea className="input min-h-16 resize-none"
                    placeholder="e.g. Tight access — no artic. Residential road. Low bridge at 3.8m on approach."
                    value={accessNotes} onChange={e => setAccessNotes(e.target.value)} />
                </div>

              </div>
            )}
          </div>}
          {!sec5Collapsed && <SectionFooter complete={vehicleComplete} label="Vehicle requirements" onCollapse={() => setSec5Collapsed(true)} />}
        </div>

        {/* ── Section 06 — Return Instructions ───────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader num={6} icon="↩️" title="Return / Failure Instructions" subtitle="What the driver does if a delivery cannot be completed"
            active collapsed={sec6Collapsed} onToggle={() => setSec6Collapsed(o => !o)}
            complete={sec6Complete} started={sec6Started}            summary={failureAction ? (
              failureAction === "call_assistance"      ? `Call for assistance${assistancePhone ? ` · ${assistancePhone}` : ""}` :
              failureAction === "next_delivery"        ? "Proceed to next delivery" :
              failureAction === "return_depot"         ? "Return to depot" :
              failureAction === "return_collection"    ? "Return to collection address" :
              failureAction === "deliver_alternative"  ? "Deliver to alternative address" :
              failureAction === "finish_then_return"   ? `Finish deliveries, then return${returnDestination ? ` to ${returnDestination}` : ""}` : ""
            ) : undefined} />

          {!sec6Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            {/* Main dropdown */}
            <div>
              <FieldLabel required>What should the driver do if delivery fails?</FieldLabel>
              <select className="input" value={failureAction} onChange={e => { setFailureAction(e.target.value); setReturnDestination(""); }}>
                <option value="call_assistance">Call for assistance</option>
                <option value="next_delivery">Proceed to next delivery</option>
                <option value="return_depot">Return to depot</option>
                <option value="return_collection">Return to collection address</option>
                <option value="deliver_alternative">Deliver to alternative address</option>
                <option value="finish_then_return">Finish remaining deliveries, then return</option>
              </select>
              <p className="text-xs text-muted mt-1.5">
                {failureAction === "next_delivery"     && "Driver will proceed to the next stop on the job."}
                {failureAction === "return_depot"      && "System uses the driver's assigned depot / yard. No address needed."}
                {failureAction === "return_collection" && "System uses the original collection stop address. No address needed."}
                {failureAction === "call_assistance"   && "Driver will call the number below before taking any other action."}
                {failureAction === "deliver_alternative" && "Driver will deliver to the alternative address below."}
                {failureAction === "finish_then_return"  && "Driver will complete any remaining stops, then return as specified."}
              </p>
            </div>

            {/* Call for assistance */}
            {failureAction === "call_assistance" && (
              <div className="space-y-3 pt-1 border-t border-border">
                <div>
                  <FieldLabel required>Assistance Phone Number</FieldLabel>
                  <input type="tel" className="input" placeholder="e.g. 07700 900123"
                    value={assistancePhone} onChange={e => setAssistancePhone(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Assistance Instruction / Note</FieldLabel>
                  <textarea className="input min-h-16 resize-none"
                    placeholder="e.g. Call dispatcher before returning. Quote job reference."
                    value={assistanceNote} onChange={e => setAssistanceNote(e.target.value)} />
                </div>
              </div>
            )}

            {/* Finish then return — destination picker */}
            {failureAction === "finish_then_return" && (
              <div className="pt-1 border-t border-border">
                <FieldLabel required>Return Destination</FieldLabel>
                <div className="flex gap-2 flex-wrap">
                  {[["depot","Depot"],["collection","Collection address"],["alternative","Alternative address"]].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setReturnDestination(val)}
                      className={"text-sm px-4 py-2 rounded-full border font-medium transition-colors " +
                        (returnDestination === val
                          ? "bg-slate-700 text-white border-slate-700"
                          : "bg-white text-muted border-border hover:border-gray-400")}>
                      {label}
                    </button>
                  ))}
                </div>
                {returnDestination === "depot"      && <p className="text-xs text-muted mt-2">Uses driver's assigned depot. No address needed.</p>}
                {returnDestination === "collection" && <p className="text-xs text-muted mt-2">Uses the original collection stop address. No address needed.</p>}
              </div>
            )}

            {/* Alternative address block — shared */}
            {needsAltAddress && (
              <div className="space-y-4 pt-1 border-t border-border">
                <div className="text-xs font-bold text-muted uppercase tracking-widest">Alternative Address</div>

                {/* Saved location search */}
                <div>
                  <FieldLabel>Search saved locations</FieldLabel>
                  <LocationSearch
                    value={altLocationQuery}
                    linkedId={altSavedLocationId}
                    locations={locations}
                    onSelect={loc => {
                      setAltSavedLocationId(loc.id);
                      setAltLocationQuery(loc.name);
                      setAltCompanyName(loc.siteName || loc.name);
                      setAltStreet(loc.street);
                      setAltTown(loc.town);
                      setAltPostcode(loc.postcode);
                      setAltLat(loc.latitude != null ? String(loc.latitude) : "");
                      setAltLng(loc.longitude != null ? String(loc.longitude) : "");
                      setAltContactName(loc.contactName || "");
                      setAltContactPhone(loc.contactPhone || "");
                    }}
                    onClear={() => {
                      setAltSavedLocationId(null);
                      setAltLocationQuery("");
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FieldLabel required>Company / Site Name</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Acme Logistics Ltd"
                      value={altCompanyName} onChange={e => setAltCompanyName(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Street / Address Line 1</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. 12 Sample Road"
                      value={altStreet} onChange={e => setAltStreet(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel required>Town / City</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Sampletown"
                      value={altTown} onChange={e => setAltTown(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel required>Postcode</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. EX1 1AA"
                      value={altPostcode} onChange={e => setAltPostcode(e.target.value.toUpperCase())} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Country</FieldLabel>
                    <input type="text" className="input" placeholder="United Kingdom"
                      value={altCountry} onChange={e => setAltCountry(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Latitude</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. 51.5074"
                      value={altLat} onChange={e => setAltLat(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Longitude</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. -0.1278"
                      value={altLng} onChange={e => setAltLng(e.target.value)} />
                  </div>
                </div>

                <OptionalToggle open={showAltOpts} onToggle={() => setShowAltOpts(o => !o)} label="optional address details" />

                {showAltOpts && <div className="space-y-3">
                  <div>
                    <FieldLabel>Unit / Building</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Unit 4B"
                      value={altUnit} onChange={e => setAltUnit(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Address Line 2</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Exampleshire Industrial Estate"
                      value={altAddressLine2} onChange={e => setAltAddressLine2(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>County / Region</FieldLabel>
                    <input type="text" className="input" placeholder="e.g. Exampleshire"
                      value={altCounty} onChange={e => setAltCounty(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Contact Name</FieldLabel>
                      <input type="text" className="input" placeholder="e.g. J. Smith"
                        value={altContactName} onChange={e => setAltContactName(e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel>Contact Phone</FieldLabel>
                      <input type="tel" className="input" placeholder="e.g. 07700 900456"
                        value={altContactPhone} onChange={e => setAltContactPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Contact Email</FieldLabel>
                    <input type="email" className="input" placeholder="e.g. goods@example.com"
                      value={altContactEmail} onChange={e => setAltContactEmail(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Navigation Instructions</FieldLabel>
                    <textarea className="input min-h-16 resize-none"
                      placeholder="e.g. Enter via rear gate on Example Lane"
                      value={altNavNotes} onChange={e => setAltNavNotes(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Driver Notes</FieldLabel>
                    <textarea className="input min-h-16 resize-none"
                      placeholder="e.g. Call ahead 30 mins before arrival"
                      value={altDriverNotes} onChange={e => setAltDriverNotes(e.target.value)} />
                  </div>
                </div>}
              </div>
            )}

          </div>}
          {!sec6Collapsed && <SectionFooter complete={sec6Complete} label="Return instructions" onCollapse={() => setSec6Collapsed(true)} />}
        </div>

      </div>

      {/* ── Sticky save bar ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40" style={{background: 'white', borderTop: '1px solid #e2e8f0', boxShadow: '0 -4px 24px rgba(15,23,42,0.08)'}}>
        {/* Progress strip */}
        <div className="w-full h-1 flex">
          <div className="h-full bg-slate-500 transition-all duration-700" style={{ width: `${reqScore}%` }} />
          <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${optScore}%` }} />
        </div>
        <div className="max-w-3xl mx-auto px-5 py-3">
          {/* Inline error / missing hint */}
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
            {/* Cancel — quiet, left */}
            <button onClick={() => navigate(-1)}
              className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors px-1 flex-shrink-0">
              Cancel
            </button>
            <div className="flex-1" />

            {/* Template mode: just one Save Template button */}
            {isTemplateMode ? (
              <button onClick={handleSaveTemplate} disabled={saving !== null}
                className="btn bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-2.5 font-bold flex-shrink-0">
                {saving !== null ? "Saving…" : "Save Template"}
              </button>
            ) : (
              <>
                {!isEditMode && (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveAsTemplate}
                        onChange={e => setSaveAsTemplate(e.target.checked)}
                      />
                      Also save as new template
                    </label>
                    {saveAsTemplate && (
                      <>
                        <input
                          className={"input !py-1.5 !text-xs w-full " + (!templateName.trim() ? "border-red-300 focus:ring-red-200" : "")}
                          placeholder="Template name (required)"
                          value={templateName}
                          onChange={e => setTemplateName(e.target.value)}
                          autoFocus
                        />
                        {!templateName.trim() && (
                          <p className="text-xs text-red-600">Enter a name to save this job as a template</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {/* Quality score — centre-right */}
                <div className={"hidden sm:flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border flex-shrink-0 " +
                  (totalScore >= 80 ? "text-green-700 bg-green-50 border-green-200" :
                   totalScore >= 40 ? "text-amber-700 bg-amber-50 border-amber-200" :
                   "text-slate-400 bg-slate-50 border-slate-200")}>
                  {hasStarted ? `${totalScore}%` : "—"}
                </div>
                {/* Save Draft */}
                <button onClick={handleSaveDraft} disabled={saving !== null}
                  className="btn btn-outline text-sm px-5 py-2.5 flex-shrink-0">
                  {saving === "draft" ? "Saving…" : isEditMode ? "Save as draft" : "Save Draft"}
                </button>
                {/* Save Ready */}
                <button onClick={handleSaveReady} disabled={saving !== null}
                  className={"btn text-sm px-6 py-2.5 font-bold flex-shrink-0 " +
                    (MISSING.length === 0
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "btn-primary")}>
                  {saving === "ready" ? "Saving…" : isEditMode ? (MISSING.length === 0 ? "Update job" : "Update & mark ready") : (MISSING.length === 0 ? "Save & Plan" : "Ready for Planner")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
