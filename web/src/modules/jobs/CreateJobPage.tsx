import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jobsApi } from "../../api/jobs";
import { useAuth } from "../../hooks/useAuth";
import type { Customer, JobTemplate, PlannedJob, SavedLocation } from "../../types";

import {
  SERVICE_TYPES, JOB_TYPES, PRIORITY_OPTS,
  VEHICLE_TYPES, MIN_SIZES, TRAILER_REQUIRED_TYPES, TRAILER_TYPES,
  EQUIPMENT_OPTS, DRIVER_QUALS, LOAD_UNITS, HANDLING_METHODS,
} from "./createJobConstants";
import type { StopState } from "./createJobTypes";
import { today, nowDisplay, makeStop, jobStopToStopState, stopComplete } from "./createJobUtils";
import {
  FieldLabel, ReadOnlyField, SectionHeader, SectionFooter,
  OptionalToggle, Toggle, MultiCheck,
} from "./CreateJobFormComponents";
import CustomerSearch from "./CustomerSearch";
import StopCard from "./StopCard";
import { LocationSearch } from "./StopCard";
import { buildBody } from "./createJobPayload";
import type { CreateJobPayload } from "./createJobPayload";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: jobIdParam } = useParams<{ id?: string }>();
  const editJobId = jobIdParam ? parseInt(jobIdParam, 10) : null;
  const isEditMode = !!editJobId;

  const [saving, setSaving] = useState<"draft" | "ready" | null>(null);
  const [error, setError] = useState("");
  const [loadingJob, setLoadingJob] = useState(isEditMode);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Saved locations (loaded once)
  const [locations,  setLocations]  = useState<SavedLocation[]>([]);
  const [templates,  setTemplates]  = useState<JobTemplate[]>([]);
  const [tplQuery,   setTplQuery]   = useState("");

  useEffect(() => { jobsApi.locations().then(r => setLocations(r.data)).catch(() => {}); }, []);
  useEffect(() => { jobsApi.templates().then(r => setTemplates(r.data)).catch(() => {}); }, []);

  function applyTemplate(t: JobTemplate) {
    if (t.defaultReference)    setReferenceNumber(t.defaultReference);
    if (t.defaultMaterialType) setMaterialDesc(t.defaultMaterialType);
    if (t.defaultNotes)        setLoadNotes(t.defaultNotes);
    const dl = t.defaultLoadDetails;
    if (dl) {
      if (dl.quantity    != null) setTotalQty(String(dl.quantity));
      if (dl.unit)                setQtyUnit(dl.unit);
      if (dl.materialType)       setMaterialDesc(dl.materialType);
      if (dl.weight      != null) setTotalWeight(String(dl.weight));
    }
    const ds = Array.isArray(t.defaultStops) ? t.defaultStops : [];
    if (ds.length > 0) {
      setStops(ds.map(s => ({
        ...makeStop(),
        stopType:       s.type === "pickup" ? "collection" : "delivery",
        savedLocationId: s.savedLocationId ?? null,
        siteName:       s.locationTextSnapshot || "",
        locationQuery:  s.locationTextSnapshot || "",
        lat:            s.lat != null ? String(s.lat) : "",
        lng:            s.lng != null ? String(s.lng) : "",
        contactName:    s.contactName  || "",
        contactPhone:   s.contactPhone || "",
        refNumber:      s.referenceNumber || "",
        driverNotes:    s.instructions || "",
      })));
    }
    setTplQuery(t.name);
    setSec1Collapsed(false);
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
  const [vehicleType,      setVehicleType]      = useState("");
  const [vehicleTypeOther, setVehicleTypeOther] = useState("");
  const [assignedTruck,    setAssignedTruck]    = useState("");
  const [assignedTrailer,  setAssignedTrailer]  = useState("");
  // Optional
  const [showVehicleOpts,  setShowVehicleOpts]  = useState(false);
  const [minSize,          setMinSize]          = useState("");
  const [trailersAllowed,  setTrailersAllowed]  = useState<string[]>([]);
  const [trailersForbidden,setTrailersForbidden]= useState<string[]>([]);
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

  // ── Quality / missing fields ─────────────────────────────────────────────
  const basicsComplete   = !!(customerName.trim() && plannedDate && serviceType && jobType);
  const customerComplete = !!(contactName.trim() && contactPhone.trim());
  const stopsComplete    = stops.length > 0 && stops.every(stopComplete);
  const loadComplete     = !!(materialDesc.trim() && totalQty.trim() && qtyUnit && totalWeight.trim());
  const vehicleComplete  = !!vehicleType &&
    (vehicleType !== "other" || !!vehicleTypeOther.trim()) &&
    (!TRAILER_REQUIRED_TYPES.has(vehicleType) || trailersAllowed.length > 0);

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
  const sec5Started = !!vehicleType;
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
      if (vClass.startsWith("other:")) {
        setVehicleType("other");
        setVehicleTypeOther(vClass.replace("other:", "").trim());
      } else {
        setVehicleType(vClass);
      }
      setMinSize(job.minVehicleSize || "");
      setTrailersAllowed(Array.isArray(job.trailerTypesAllowed) ? job.trailerTypesAllowed : []);
      setTrailersForbidden(Array.isArray(job.trailerTypesForbidden) ? job.trailerTypesForbidden : []);
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
    !vehicleComplete       && "Vehicle type",
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
    { label: "Equipment required",    pts: 4, ok: equipmentReq.length > 0 },
    { label: "Driver qualifications", pts: 4, ok: driverQuals.length > 0 },
    { label: "Trailer rules",         pts: 2, ok: trailersAllowed.length > 0 || trailersForbidden.length > 0 },
    { label: "Vehicle restrictions",  pts: 2, ok: !!(heightRestriction.trim() || weightRestriction.trim() || lengthRestriction.trim()) },
    { label: "Access notes",          pts: 3, ok: !!accessNotes.trim() },
    { label: "Min vehicle size",      pts: 2, ok: !!minSize },
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
      trailersForbidden,
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
    return <div className="flex h-64 items-center justify-center text-muted">Loading job...</div>;
  }

  return (
    <div className="min-h-screen bg-surface pb-40">

      {/* ── Page header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5" style={{boxShadow: '0 1px 4px rgba(15,23,42,0.06)'}}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-muted hover:text-primary hover:border-slate-300 hover:bg-slate-50 transition-all flex-shrink-0" title="Back">←</button>
          <div>
            <h1 className="text-xl font-black text-primary">{isEditMode ? "Edit Job" : "New Job"}</h1>
            <p className="text-sm text-muted mt-0.5">
              {isEditMode ? "Update the fields below — changes won't be lost until you save" : "Fill in the sections below — save as draft any time"}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="max-w-3xl mx-auto px-4 pt-4"><div className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">{error}</div></div>}

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">

        {/* ── Template picker ────────────────────────────────────────────────── */}
        {!isEditMode && templates.length > 0 && (
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
                <div>
                  <FieldLabel>Job Title / Short Description</FieldLabel>
                  <input type="text" className="input" placeholder="e.g. Overnight trunking — North to South depot"
                    value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Job Reference No.</FieldLabel>
                    <input type="text" className="input" placeholder="JB-00123"
                      value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Customer Reference No.</FieldLabel>
                    <input type="text" className="input" placeholder="CUST-REF-456"
                      value={customerRef} onChange={e => setCustomerRef(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Purchase Order No.</FieldLabel>
                    <input type="text" className="input" placeholder="PO-789"
                      value={purchaseOrderNumber} onChange={e => setPurchaseOrderNumber(e.target.value)} />
                  </div>
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
              <div>
                <FieldLabel required>Contact Name</FieldLabel>
                <input type="text" className="input" placeholder="Jane Smith"
                  value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Contact Phone</FieldLabel>
                <input type="tel" className="input" placeholder="07700 900123"
                  value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>
            <OptionalToggle open={showCustOpts} onToggle={() => setShowCustOpts(o => !o)} label="customer details" />
            {showCustOpts && (
              <div className="space-y-4 pt-1 border-t border-border">
                <div>
                  <FieldLabel>Customer Address</FieldLabel>
                  <input type="text" className="input" placeholder="1 Example Road, Sampletown, EX1 1AA"
                    value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Contact Email</FieldLabel>
                  <input type="email" className="input" placeholder="jane@example.com"
                    value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                </div>
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
          <SectionHeader num={5} icon="🚛" title="Vehicle Requirements" subtitle="Vehicle class, trailer type and special equipment" active
            collapsed={sec5Collapsed} onToggle={() => setSec5Collapsed(o => !o)}
            summary={vehicleType ? VEHICLE_TYPES.find(([v]) => v === vehicleType)?.[1] ?? vehicleType : undefined}
            complete={vehicleComplete} started={sec5Started} />

          {!sec5Collapsed && <div className="px-6 pt-5 pb-5 space-y-5">

            {/* Vehicle type */}
            <div>
              <FieldLabel required>Vehicle Type Required</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_TYPES.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => {
                      setVehicleType(key);
                      // Clear trailer type selection when switching away from trailer-requiring types
                      if (!TRAILER_REQUIRED_TYPES.has(key)) setTrailersAllowed([]);
                    }}
                    className={"text-sm px-3 py-1.5 rounded-full border font-medium transition-colors " +
                      (vehicleType === key
                        ? "bg-slate-700 text-white border-slate-700"
                        : "bg-white text-muted border-border hover:border-gray-400")}>
                    {label}
                  </button>
                ))}
              </div>
              {vehicleType === "other" && (
                <div className="mt-3 max-w-xs">
                  <FieldLabel required>Vehicle Type Description</FieldLabel>
                  <input type="text" className="input" placeholder="e.g. Specialist tanker, car transporter…"
                    value={vehicleTypeOther} onChange={e => setVehicleTypeOther(e.target.value)} />
                </div>
              )}
            </div>

            {/* Trailer type picker — shown inline when vehicle requires a trailer */}
            {TRAILER_REQUIRED_TYPES.has(vehicleType) && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-blue-700 text-sm font-bold">Trailer required</span>
                  <span className="text-blue-500 text-xs">— select the trailer type for this job</span>
                </div>
                <div>
                  <FieldLabel required>Trailer Type</FieldLabel>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {TRAILER_TYPES.map(([key, label]) => (
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

            {/* Truck + trailer regs for non-trailer vehicle types */}
            {!TRAILER_REQUIRED_TYPES.has(vehicleType) && (
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
              </div>
            )}

            {/* Truck reg shown separately when trailer box is inline */}
            {TRAILER_REQUIRED_TYPES.has(vehicleType) && (
              <div className="max-w-xs">
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
            )}

            <OptionalToggle open={showVehicleOpts} onToggle={() => setShowVehicleOpts(o => !o)} label="vehicle details" />

            {showVehicleOpts && (
              <div className="space-y-6 pt-1 border-t border-border">

                {/* Minimum size */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Size</div>
                  <div className="max-w-xs">
                    <FieldLabel>Minimum Vehicle Size</FieldLabel>
                    <select className="input" value={minSize} onChange={e => setMinSize(e.target.value)}>
                      <option value="">— No minimum —</option>
                      {MIN_SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>

                {/* Trailer rules */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Trailer Rules</div>
                  <div className="space-y-4">
                    <div>
                      <FieldLabel>Trailer Types Allowed</FieldLabel>
                      <MultiCheck options={TRAILER_TYPES} value={trailersAllowed} onChange={setTrailersAllowed} />
                    </div>
                    <div>
                      <FieldLabel>Trailer Types Forbidden</FieldLabel>
                      <MultiCheck options={TRAILER_TYPES} value={trailersForbidden} onChange={setTrailersForbidden} />
                    </div>
                  </div>
                </div>

                {/* Equipment */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Equipment Required</div>
                  <MultiCheck options={EQUIPMENT_OPTS} value={equipmentReq} onChange={setEquipmentReq} />
                </div>

                {/* Driver qualifications */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 before:content-[''] before:w-3 before:h-px before:bg-slate-300">Driver Qualifications</div>
                  <MultiCheck options={DRIVER_QUALS} value={driverQuals} onChange={setDriverQuals} />
                </div>

                {/* Restrictions */}
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

                {/* Access notes */}
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
          </div>
        </div>
      </div>

    </div>
  );
}
