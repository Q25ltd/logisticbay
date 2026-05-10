/**
 * Public transport request form — customer-facing, no login required.
 * Supports multiple collection stops and multiple delivery stops.
 * Design matches CreateJobPage exactly.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  jobRequestsPublicApi,
  type PublicLinkInfo,
  type PickupDataInput,
  type DeliveryDataInput,
  type LoadDataInput,
  type SubmitRequestBody,
} from "../../api/jobRequests";
import {
  FieldLabel,
  TextField,
  SectionHeader,
  SectionFooter,
  OptionalToggle,
  Toggle,
} from "../jobs/CreateJobFormComponents";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOADING_TIME_OPTS: [string, string][] = [
  ["15", "15 min"], ["30", "30 min"], ["45", "45 min"],
  ["60", "1 hour"], ["90", "1.5 hrs"], ["120", "2 hours"], ["custom", "Custom"],
];

const LOAD_UNITS: [string, string][] = [
  ["pallets", "Pallets"], ["tonnes", "Tonnes"], ["kg", "Kilograms"],
  ["bags", "Bags"], ["items", "Items"], ["loads", "Loads"],
  ["litres", "Litres"], ["cubic_metres", "Cubic metres"], ["other", "Other"],
];

// ── Stop state shapes ─────────────────────────────────────────────────────────

interface PickupStop {
  id: string;
  collapsed: boolean;
  showOpts: boolean;
  referenceNumber: string;
  siteName: string;
  unitName: string;
  address1: string;
  address2: string;
  townCity: string;
  county: string;
  postcode: string;
  latStr: string;
  lngStr: string;
  entrance: string;
  date: string;
  earliest: string;
  latest: string;
  loadTime: string;
  loadCustom: string;
  contact: string;
  phone: string;
  email: string;
  bookingReq: boolean;
  bookingRef: string;
  hours: string;
  restrict: string;
}

interface DeliveryStop {
  id: string;
  collapsed: boolean;
  showOpts: boolean;
  referenceNumber: string;
  siteName: string;
  unitName: string;
  address1: string;
  address2: string;
  townCity: string;
  county: string;
  postcode: string;
  latStr: string;
  lngStr: string;
  entrance: string;
  date: string;
  earliest: string;
  latest: string;
  unloadTime: string;
  unloadCustom: string;
  contact: string;
  phone: string;
  email: string;
  bookingReq: boolean;
  bookingRef: string;
  hours: string;
  restrict: string;
}

let _uid = 0;
function uid() { return `s${++_uid}`; }

function newPickup(): PickupStop {
  return {
    id: uid(), collapsed: false, showOpts: false,
    referenceNumber: "", siteName: "", unitName: "",
    address1: "", address2: "", townCity: "", county: "", postcode: "",
    latStr: "", lngStr: "", entrance: "",
    date: "", earliest: "", latest: "",
    loadTime: "30", loadCustom: "",
    contact: "", phone: "", email: "",
    bookingReq: false, bookingRef: "", hours: "", restrict: "",
  };
}

function newDelivery(): DeliveryStop {
  return {
    id: uid(), collapsed: false, showOpts: false,
    referenceNumber: "", siteName: "", unitName: "",
    address1: "", address2: "", townCity: "", county: "", postcode: "",
    latStr: "", lngStr: "", entrance: "",
    date: "", earliest: "", latest: "",
    unloadTime: "30", unloadCustom: "",
    contact: "", phone: "", email: "",
    bookingReq: false, bookingRef: "", hours: "", restrict: "",
  };
}

function isPickupComplete(s: PickupStop) {
  return !!(s.referenceNumber.trim() && s.siteName.trim() && s.address1.trim() &&
            s.townCity.trim() && s.postcode.trim() && s.date && s.earliest && s.latest &&
            s.latStr && s.lngStr && s.entrance.trim());
}

function isDeliveryComplete(s: DeliveryStop) {
  return !!(s.referenceNumber.trim() && s.siteName.trim() && s.address1.trim() &&
            s.townCity.trim() && s.postcode.trim() && s.date && s.earliest && s.latest &&
            s.latStr && s.lngStr && s.entrance.trim());
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function TimeButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LOADING_TIME_OPTS.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={"px-3 py-2 rounded-xl border text-sm font-medium transition-colors " +
            (value === v ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-gray-400")}>
          {l}
        </button>
      ))}
    </div>
  );
}

function EntrancePinInput({ lat, lng, onChange }: { lat: string; lng: string; onChange: (lat: string, lng: string) => void }) {
  return (
    <div>
      <FieldLabel required>Exact entrance pin — latitude / longitude</FieldLabel>
      <div className="text-xs text-muted mb-2">
        Enter the exact coordinates where the driver should enter the site: gate, yard entrance, goods-in door, or security barrier.
        <br />Use Google Maps → right-click the exact point → copy coordinates.
        <strong className="text-primary"> This must be the truck entrance, not the postcode centre.</strong>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Latitude</FieldLabel>
          <input className="input font-mono" type="number" step="0.000001"
            placeholder="e.g. 53.483959" value={lat} onChange={e => onChange(e.target.value, lng)} />
        </div>
        <div>
          <FieldLabel>Longitude</FieldLabel>
          <input className="input font-mono" type="number" step="0.000001"
            placeholder="e.g. -2.244644" value={lng} onChange={e => onChange(lat, e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Stop card header ──────────────────────────────────────────────────────────

function StopCardHeader({
  index, total, label, siteName, complete, collapsed,
  onToggle, onRemove,
}: {
  index: number; total: number; label: string; siteName: string;
  complete: boolean; collapsed: boolean;
  onToggle: () => void; onRemove: () => void;
}) {
  return (
    <div
      className={"flex items-center gap-2 px-4 py-3 cursor-pointer select-none " +
        (collapsed ? "border-b-0" : "border-b border-border")}
      style={{ background: complete ? "#f0fdf4" : "#f8fafc" }}
      onClick={onToggle}
    >
      <span className={"w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 " +
        (complete ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500")}>
        {complete ? "✓" : index + 1}
      </span>
      <span className="text-xs font-bold text-muted uppercase tracking-wide flex-shrink-0">
        {label} {total > 1 ? `stop ${index + 1}` : "stop"}
      </span>
      {siteName && <span className="text-sm font-medium text-primary truncate">{siteName}</span>}
      <div className="flex-1" />
      {total > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded transition-colors flex-shrink-0">
          Remove
        </button>
      )}
      <span className="text-muted text-xs flex-shrink-0">{collapsed ? "▼" : "▲"}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PublicRequestForm() {
  const { token } = useParams<{ token: string }>();
  const [linkInfo,   setLinkInfo]   = useState<PublicLinkInfo | null>(null);
  const [linkError,  setLinkError]  = useState("");
  const [submitted,  setSubmitted]  = useState(false);
  const [warnings,   setWarnings]   = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors,     setErrors]     = useState<string[]>([]);

  // Section collapse
  const [s1, setS1] = useState(false);
  const [s2, setS2] = useState(false);
  const [s3, setS3] = useState(false);
  const [s4, setS4] = useState(false);
  const [s5, setS5] = useState(false);
  const [s6, setS6] = useState(false);

  // Optional panels
  const [showLoadOpts,  setShowLoadOpts]  = useState(false);
  const [showNoteOpts,  setShowNoteOpts]  = useState(false);

  // ── Section 1 ────────────────────────────────────────────────────────────
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // ── Section 2: Collection stops ──────────────────────────────────────────
  const [pickups, setPickups] = useState<PickupStop[]>([newPickup()]);
  const updPickup = (id: string, patch: Partial<PickupStop>) =>
    setPickups(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  // ── Section 3: Delivery stops ────────────────────────────────────────────
  const [deliveries, setDeliveries] = useState<DeliveryStop[]>([newDelivery()]);
  const updDelivery = (id: string, patch: Partial<DeliveryStop>) =>
    setDeliveries(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  // ── Section 4 ────────────────────────────────────────────────────────────
  const [goodsDesc,   setGoodsDesc]   = useState("");
  const [quantity,    setQuantity]    = useState("");
  const [unit,        setUnit]        = useState("pallets");
  const [otherUnit,   setOtherUnit]   = useState("");
  const [estWeight,   setEstWeight]   = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [hazardous,   setHazardous]   = useState(false);
  const [adrClass,    setAdrClass]    = useState("");
  const [tempCtrl,    setTempCtrl]    = useState(false);
  const [tempRange,   setTempRange]   = useState("");
  const [fragile,     setFragile]     = useState(false);
  const [forklift,    setForklift]    = useState(false);
  const [tailLift,    setTailLift]    = useState(false);
  const [loadNotes,   setLoadNotes]   = useState("");

  // ── Section 5 ────────────────────────────────────────────────────────────
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [billingReference,    setBillingReference]    = useState("");
  const [declaredGoodsValue,  setDeclaredGoodsValue]  = useState("");

  // ── Section 6 ────────────────────────────────────────────────────────────
  const [driverNotes,   setDriverNotes]   = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [safetyNotes,   setSafetyNotes]   = useState("");

  // ── Completeness ─────────────────────────────────────────────────────────
  const sec1Complete = !!(customerCompanyName.trim() && contactName.trim() && contactPhone.trim() && contactEmail.trim());
  const sec2Complete = pickups.length > 0 && pickups.every(isPickupComplete);
  const sec3Complete = deliveries.length > 0 && deliveries.every(isDeliveryComplete);
  const sec4Complete = !!(goodsDesc.trim() && quantity && unit);

  const sec1Started = !!(customerCompanyName || contactName || contactPhone || contactEmail);
  const sec2Started = pickups.some(s => s.siteName || s.address1 || s.referenceNumber);
  const sec3Started = deliveries.some(s => s.siteName || s.address1 || s.referenceNumber);
  const sec4Started = !!(goodsDesc || quantity);

  // ── Load link info ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    jobRequestsPublicApi.getLinkInfo(token)
      .then(info => {
        setLinkInfo(info);
        if (info.customerName)  setCustomerCompanyName(info.customerName);
        if (info.contactName)   setContactName(info.contactName);
        if (info.contactEmail)  setContactEmail(info.contactEmail);
        if (info.contactPhone)  setContactPhone(info.contactPhone);
      })
      .catch(() => setLinkError("This request link is not valid or has expired."));
  }, [token]);

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    const pickupData: PickupDataInput[] = pickups.map(p => ({
      referenceNumber: p.referenceNumber.trim() || undefined,
      siteName:    p.siteName.trim(),
      unitName:    p.unitName.trim() || undefined,
      addressLine1: p.address1.trim(),
      addressLine2: p.address2.trim() || undefined,
      townCity:    p.townCity.trim(),
      countyRegion: p.county.trim() || undefined,
      postcode:    p.postcode.trim(),
      entranceLat: parseFloat(p.latStr),
      entranceLng: parseFloat(p.lngStr),
      entranceInstructions: p.entrance.trim(),
      contactName:  p.contact.trim() || undefined,
      contactPhone: p.phone.trim()   || undefined,
      contactEmail: p.email.trim()   || undefined,
      bookingRequired:  p.bookingReq,
      bookingReference: p.bookingRef.trim() || undefined,
      openingHours:     p.hours.trim()      || undefined,
      siteRestrictions: p.restrict.trim()   || undefined,
      pickupDate:   p.date,
      earliestTime: p.earliest,
      latestTime:   p.latest,
      estimatedLoadingMinutes: p.loadTime === "custom" ? parseInt(p.loadCustom, 10) : parseInt(p.loadTime, 10),
    }));

    const deliveryData: DeliveryDataInput[] = deliveries.map(d => ({
      referenceNumber: d.referenceNumber.trim() || undefined,
      siteName:    d.siteName.trim(),
      unitName:    d.unitName.trim() || undefined,
      addressLine1: d.address1.trim(),
      addressLine2: d.address2.trim() || undefined,
      townCity:    d.townCity.trim(),
      countyRegion: d.county.trim() || undefined,
      postcode:    d.postcode.trim(),
      entranceLat: parseFloat(d.latStr),
      entranceLng: parseFloat(d.lngStr),
      entranceInstructions: d.entrance.trim(),
      contactName:  d.contact.trim() || undefined,
      contactPhone: d.phone.trim()   || undefined,
      contactEmail: d.email.trim()   || undefined,
      bookingRequired:  d.bookingReq,
      bookingReference: d.bookingRef.trim() || undefined,
      openingHours:     d.hours.trim()      || undefined,
      siteRestrictions: d.restrict.trim()   || undefined,
      deliveryDate:  d.date,
      earliestTime:  d.earliest,
      latestTime:    d.latest,
      estimatedUnloadingMinutes: d.unloadTime === "custom" ? parseInt(d.unloadCustom, 10) : parseInt(d.unloadTime, 10),
    }));

    const loadData: LoadDataInput = {
      goodsDescription: goodsDesc.trim(),
      quantity:         parseFloat(quantity),
      unit:             unit === "other" ? (otherUnit.trim() || "other") : unit,
      estimatedWeight:  estWeight   ? parseFloat(estWeight)    : undefined,
      palletCount:      palletCount ? parseInt(palletCount, 10) : undefined,
      hazardousGoods:   hazardous,
      adrClass:         adrClass.trim() || undefined,
      temperatureControlled: tempCtrl,
      temperatureRange:      tempRange.trim() || undefined,
      fragile,
      forkliftRequired: forklift,
      tailLiftRequired: tailLift,
      loadNotes:        loadNotes.trim() || undefined,
    };

    const body: SubmitRequestBody = {
      customerCompanyName: customerCompanyName.trim(),
      contactName:         contactName.trim(),
      contactPhone:        contactPhone.trim(),
      contactEmail:        contactEmail.trim(),
      // Top-level refs = first stop's ref (required by API, used as fallback per-stop)
      collectionReference: pickups[0]?.referenceNumber.trim() || "",
      deliveryReference:   deliveries[0]?.referenceNumber.trim() || "",
      purchaseOrderNumber: purchaseOrderNumber.trim() || undefined,
      billingReference:    billingReference.trim()    || undefined,
      declaredGoodsValue:  declaredGoodsValue ? parseFloat(declaredGoodsValue) : undefined,
      pickupData,
      deliveryData,
      loadData,
      driverVisibleNotes:  driverNotes.trim()   || undefined,
      customerNotes:       customerNotes.trim() || undefined,
      safetyInstructions:  safetyNotes.trim()   || undefined,
    };

    setSubmitting(true);
    try {
      const result = await jobRequestsPublicApi.submit(token!, body);
      setWarnings(result.warnings ?? []);
      setSubmitted(true);
    } catch (err: any) {
      setErrors(err.errors ?? [err.message ?? "Submission failed. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Special states ────────────────────────────────────────────────────────

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-black text-primary mb-2">Link not available</h1>
          <p className="text-sm text-muted">{linkError}</p>
        </div>
      </div>
    );
  }

  if (!linkInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-sm text-muted animate-pulse">Loading…</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <div className="card p-8 text-center max-w-lg">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-black text-primary mb-3">Request submitted</h1>
          <p className="text-base text-secondary mb-4">
            Your transport request has been submitted to <strong>{linkInfo.companyName}</strong>.
            The operations team will review it and contact you if anything is needed.
          </p>
          {warnings.length > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-left text-sm space-y-1">
              <div className="font-semibold text-amber-800 mb-1">⚠ Notes on your submission:</div>
              {warnings.map((w, i) => <div key={i} className="text-amber-700">• {w}</div>)}
            </div>
          )}
          <button type="button" className="btn btn-primary mt-6"
            onClick={() => { setSubmitted(false); setErrors([]); }}>
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-white border-b border-border px-4 py-5 text-center shadow-sm">
        <div className="text-xs font-bold uppercase tracking-widest text-accent mb-1">Transport Request</div>
        <h1 className="text-xl font-black text-primary">{linkInfo.companyName}</h1>
        <p className="text-sm text-muted mt-1">Fill in all sections to submit a transport request.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {errors.length > 0 && (
          <div className="card border-red-200 p-4">
            <div className="font-semibold text-red-800 mb-2 text-sm">Please fix the following before submitting:</div>
            {errors.map((e, i) => <div key={i} className="text-sm text-red-700">• {e}</div>)}
          </div>
        )}

        {/* ── Section 1: Your details ─────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={1} icon="👤" title="Your details" subtitle="Company name and contact information"
            active collapsed={s1} onToggle={() => setS1(o => !o)}
            complete={sec1Complete} started={sec1Started}
            summary={customerCompanyName || contactName} />
          {!s1 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <TextField label="Company / organisation name" required value={customerCompanyName}
                onChange={setCustomerCompanyName} placeholder="Acme Distribution Ltd" caseRule="proper_name" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Contact name" required value={contactName}
                  onChange={setContactName} placeholder="Jane Smith" caseRule="proper_name" />
                <TextField label="Contact phone" required type="tel" value={contactPhone}
                  onChange={setContactPhone} placeholder="+44 7700 900123" />
              </div>
              <TextField label="Contact email" required type="email" value={contactEmail}
                onChange={setContactEmail} placeholder="jane@acme.com" />
              <SectionFooter complete={sec1Complete} label="Your details" onCollapse={() => setS1(true)} />
            </div>
          )}
        </div>

        {/* ── Section 2: Collection stops ─────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={2} icon="📦"
            title={pickups.length > 1 ? `Collection stops (${pickups.length})` : "Collection"}
            subtitle="Where and when the driver collects the load"
            active collapsed={s2} onToggle={() => setS2(o => !o)}
            complete={sec2Complete} started={sec2Started}
            summary={
              pickups[0]?.siteName
                ? `${pickups[0].siteName}${pickups.length > 1 ? ` +${pickups.length - 1} more` : ""}` +
                  (pickups[0].date ? ` · ${pickups[0].date}` : "")
                : undefined
            } />
          {!s2 && (
            <div className="px-5 pt-5 pb-4 space-y-5">
              {pickups.map((stop, idx) => (
                <div key={stop.id} className="border border-border rounded-xl overflow-hidden">
                  <StopCardHeader
                    index={idx} total={pickups.length} label="Collection"
                    siteName={stop.siteName} complete={isPickupComplete(stop)}
                    collapsed={stop.collapsed}
                    onToggle={() => updPickup(stop.id, { collapsed: !stop.collapsed })}
                    onRemove={() => setPickups(prev => prev.filter(s => s.id !== stop.id))} />
                  {!stop.collapsed && (
                    <div className="px-4 py-4 space-y-4">
                      <TextField
                        label={idx === 0 ? "Collection reference" : "Reference for this stop"} required
                        value={stop.referenceNumber}
                        onChange={v => updPickup(stop.id, { referenceNumber: v })}
                        placeholder="COL-2026-001234"
                        hint="Warehouse release number, booking ref, or site collection code. Driver needs this on arrival." />

                      <TextField label="Site name" required value={stop.siteName}
                        onChange={v => updPickup(stop.id, { siteName: v })}
                        placeholder="Acme Warehouse — Unit 5" caseRule="proper_name" />
                      <TextField label="Address line 1" required value={stop.address1}
                        onChange={v => updPickup(stop.id, { address1: v })}
                        placeholder="Industrial Estate Road" caseRule="proper_name" />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <TextField label="Town / city" required value={stop.townCity}
                            onChange={v => updPickup(stop.id, { townCity: v })}
                            placeholder="Birmingham" caseRule="proper_name" />
                        </div>
                        <TextField label="Postcode" required value={stop.postcode}
                          onChange={v => updPickup(stop.id, { postcode: v.toUpperCase() })}
                          placeholder="B1 1AA" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <TextField label="Collection date" required type="date" value={stop.date}
                          onChange={v => updPickup(stop.id, { date: v })} />
                        <TextField label="Earliest time" required type="time" value={stop.earliest}
                          onChange={v => updPickup(stop.id, { earliest: v })} />
                        <TextField label="Latest time" required type="time" value={stop.latest}
                          onChange={v => updPickup(stop.id, { latest: v })} />
                      </div>

                      <div>
                        <FieldLabel required>Estimated loading time</FieldLabel>
                        <TimeButtons value={stop.loadTime} onChange={v => updPickup(stop.id, { loadTime: v })} />
                        {stop.loadTime === "custom" && (
                          <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                            value={stop.loadCustom} onChange={e => updPickup(stop.id, { loadCustom: e.target.value })} />
                        )}
                      </div>

                      <EntrancePinInput lat={stop.latStr} lng={stop.lngStr}
                        onChange={(lat, lng) => updPickup(stop.id, { latStr: lat, lngStr: lng })} />

                      <div>
                        <FieldLabel required>Entrance instructions</FieldLabel>
                        <textarea className="input mt-1 w-full" rows={3} value={stop.entrance}
                          onChange={e => updPickup(stop.id, { entrance: e.target.value })}
                          placeholder="Enter via Gate B on the left. Intercom code 1234. Ask for goods-in." />
                        <div className="text-xs text-muted mt-1">Gate code, security procedure, which entrance to use, barriers to be aware of.</div>
                      </div>

                      <OptionalToggle open={stop.showOpts}
                        onToggle={() => updPickup(stop.id, { showOpts: !stop.showOpts })}
                        label="additional site details" />
                      {stop.showOpts && (
                        <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                          <TextField label="Unit / building name" value={stop.unitName}
                            onChange={v => updPickup(stop.id, { unitName: v })} placeholder="Unit 12B" />
                          <TextField label="Address line 2" value={stop.address2}
                            onChange={v => updPickup(stop.id, { address2: v })} placeholder="Business Park" />
                          <TextField label="County / region" value={stop.county}
                            onChange={v => updPickup(stop.id, { county: v })} placeholder="West Midlands" />
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <TextField label="Site contact name" value={stop.contact}
                              onChange={v => updPickup(stop.id, { contact: v })} />
                            <TextField label="Site contact phone" type="tel" value={stop.phone}
                              onChange={v => updPickup(stop.id, { phone: v })} />
                            <TextField label="Site contact email" type="email" value={stop.email}
                              onChange={v => updPickup(stop.id, { email: v })} />
                          </div>
                          <Toggle value={stop.bookingReq}
                            onChange={v => updPickup(stop.id, { bookingReq: v })}
                            label="Booking required before arrival" />
                          {stop.bookingReq && (
                            <TextField label="Booking reference" value={stop.bookingRef}
                              onChange={v => updPickup(stop.id, { bookingRef: v })} placeholder="BKG-2026-5678" />
                          )}
                          <TextField label="Opening hours" value={stop.hours}
                            onChange={v => updPickup(stop.id, { hours: v })} placeholder="Mon–Fri 06:00–18:00" />
                          <div>
                            <FieldLabel>Site restrictions</FieldLabel>
                            <textarea className="input mt-1 w-full" rows={2} value={stop.restrict}
                              onChange={e => updPickup(stop.id, { restrict: e.target.value })}
                              placeholder="Height limit 4.0m, max 44t, no overnight parking" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add stop button */}
              <button
                type="button"
                onClick={() => setPickups(prev => [...prev, newPickup()])}
                className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-600 font-medium hover:border-blue-400 hover:bg-blue-50 transition-colors">
                + Add another collection stop
              </button>

              <SectionFooter complete={sec2Complete} label="Collection" onCollapse={() => setS2(true)} />
            </div>
          )}
        </div>

        {/* ── Section 3: Delivery stops ───────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={3} icon="🏁"
            title={deliveries.length > 1 ? `Delivery stops (${deliveries.length})` : "Delivery"}
            subtitle="Where and when the driver delivers the load"
            active collapsed={s3} onToggle={() => setS3(o => !o)}
            complete={sec3Complete} started={sec3Started}
            summary={
              deliveries[0]?.siteName
                ? `${deliveries[0].siteName}${deliveries.length > 1 ? ` +${deliveries.length - 1} more` : ""}` +
                  (deliveries[0].date ? ` · ${deliveries[0].date}` : "")
                : undefined
            } />
          {!s3 && (
            <div className="px-5 pt-5 pb-4 space-y-5">
              {deliveries.map((stop, idx) => (
                <div key={stop.id} className="border border-border rounded-xl overflow-hidden">
                  <StopCardHeader
                    index={idx} total={deliveries.length} label="Delivery"
                    siteName={stop.siteName} complete={isDeliveryComplete(stop)}
                    collapsed={stop.collapsed}
                    onToggle={() => updDelivery(stop.id, { collapsed: !stop.collapsed })}
                    onRemove={() => setDeliveries(prev => prev.filter(s => s.id !== stop.id))} />
                  {!stop.collapsed && (
                    <div className="px-4 py-4 space-y-4">
                      <TextField
                        label={idx === 0 ? "Delivery reference" : "Reference for this stop"} required
                        value={stop.referenceNumber}
                        onChange={v => updDelivery(stop.id, { referenceNumber: v })}
                        placeholder="DEL-2026-001234"
                        hint="Delivery booking number, PO, or goods-in reference. Driver needs this to unload." />

                      <TextField label="Site name" required value={stop.siteName}
                        onChange={v => updDelivery(stop.id, { siteName: v })}
                        placeholder="Customer Distribution Centre" caseRule="proper_name" />
                      <TextField label="Address line 1" required value={stop.address1}
                        onChange={v => updDelivery(stop.id, { address1: v })}
                        placeholder="Logistics Park, Unit 12" caseRule="proper_name" />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <TextField label="Town / city" required value={stop.townCity}
                            onChange={v => updDelivery(stop.id, { townCity: v })}
                            placeholder="Manchester" caseRule="proper_name" />
                        </div>
                        <TextField label="Postcode" required value={stop.postcode}
                          onChange={v => updDelivery(stop.id, { postcode: v.toUpperCase() })}
                          placeholder="M1 1AA" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <TextField label="Delivery date" required type="date" value={stop.date}
                          onChange={v => updDelivery(stop.id, { date: v })} />
                        <TextField label="Earliest time" required type="time" value={stop.earliest}
                          onChange={v => updDelivery(stop.id, { earliest: v })} />
                        <TextField label="Latest time" required type="time" value={stop.latest}
                          onChange={v => updDelivery(stop.id, { latest: v })} />
                      </div>

                      <div>
                        <FieldLabel required>Estimated unloading time</FieldLabel>
                        <TimeButtons value={stop.unloadTime} onChange={v => updDelivery(stop.id, { unloadTime: v })} />
                        {stop.unloadTime === "custom" && (
                          <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                            value={stop.unloadCustom} onChange={e => updDelivery(stop.id, { unloadCustom: e.target.value })} />
                        )}
                      </div>

                      <EntrancePinInput lat={stop.latStr} lng={stop.lngStr}
                        onChange={(lat, lng) => updDelivery(stop.id, { latStr: lat, lngStr: lng })} />

                      <div>
                        <FieldLabel required>Entrance instructions</FieldLabel>
                        <textarea className="input mt-1 w-full" rows={3} value={stop.entrance}
                          onChange={e => updDelivery(stop.id, { entrance: e.target.value })}
                          placeholder="Goods-in via roller shutters at rear. Report to warehouse office first." />
                        <div className="text-xs text-muted mt-1">Gate code, security procedure, goods-in entrance, dock number.</div>
                      </div>

                      <OptionalToggle open={stop.showOpts}
                        onToggle={() => updDelivery(stop.id, { showOpts: !stop.showOpts })}
                        label="additional site details" />
                      {stop.showOpts && (
                        <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                          <TextField label="Unit / building name" value={stop.unitName}
                            onChange={v => updDelivery(stop.id, { unitName: v })} placeholder="Unit 12B" />
                          <TextField label="Address line 2" value={stop.address2}
                            onChange={v => updDelivery(stop.id, { address2: v })} placeholder="Business Park" />
                          <TextField label="County / region" value={stop.county}
                            onChange={v => updDelivery(stop.id, { county: v })} placeholder="Greater Manchester" />
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <TextField label="Site contact name" value={stop.contact}
                              onChange={v => updDelivery(stop.id, { contact: v })} />
                            <TextField label="Site contact phone" type="tel" value={stop.phone}
                              onChange={v => updDelivery(stop.id, { phone: v })} />
                            <TextField label="Site contact email" type="email" value={stop.email}
                              onChange={v => updDelivery(stop.id, { email: v })} />
                          </div>
                          <Toggle value={stop.bookingReq}
                            onChange={v => updDelivery(stop.id, { bookingReq: v })}
                            label="Booking required before arrival" />
                          {stop.bookingReq && (
                            <TextField label="Booking reference" value={stop.bookingRef}
                              onChange={v => updDelivery(stop.id, { bookingRef: v })} placeholder="BKG-2026-9012" />
                          )}
                          <TextField label="Opening hours" value={stop.hours}
                            onChange={v => updDelivery(stop.id, { hours: v })} placeholder="Mon–Fri 07:00–17:00" />
                          <div>
                            <FieldLabel>Site restrictions</FieldLabel>
                            <textarea className="input mt-1 w-full" rows={2} value={stop.restrict}
                              onChange={e => updDelivery(stop.id, { restrict: e.target.value })}
                              placeholder="FORS Silver required, max width 2.4m, no tail-lift deliveries" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add stop button */}
              <button
                type="button"
                onClick={() => setDeliveries(prev => [...prev, newDelivery()])}
                className="w-full py-3 border-2 border-dashed border-green-200 rounded-xl text-sm text-green-700 font-medium hover:border-green-400 hover:bg-green-50 transition-colors">
                + Add another delivery stop
              </button>

              <SectionFooter complete={sec3Complete} label="Delivery" onCollapse={() => setS3(true)} />
            </div>
          )}
        </div>

        {/* ── Section 4: Load details ─────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={4} icon="🏗️" title="Load details" subtitle="What is being transported"
            active collapsed={s4} onToggle={() => setS4(o => !o)}
            complete={sec4Complete} started={sec4Started}
            summary={goodsDesc ? `${goodsDesc}${quantity ? " · " + quantity + " " + unit : ""}` : undefined} />
          {!s4 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div>
                <FieldLabel required>Description of goods</FieldLabel>
                <textarea className="input mt-1 w-full" rows={2} value={goodsDesc}
                  onChange={e => setGoodsDesc(e.target.value)}
                  placeholder="Automotive parts — engine components, boxed" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Quantity" required type="number" value={quantity}
                  onChange={setQuantity} placeholder="12" />
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

              <OptionalToggle open={showLoadOpts} onToggle={() => setShowLoadOpts(o => !o)} label="weight, dimensions & special requirements" />
              {showLoadOpts && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Estimated total weight (kg)" type="number" value={estWeight}
                      onChange={setEstWeight} placeholder="14000" />
                    <TextField label="Pallet count" type="number" value={palletCount}
                      onChange={setPalletCount} placeholder="24" />
                  </div>
                  <div className="space-y-3">
                    <Toggle value={fragile}   onChange={setFragile}   label="Fragile / handle with care" />
                    <Toggle value={hazardous} onChange={setHazardous} label="Hazardous goods (ADR)" />
                    <Toggle value={tempCtrl}  onChange={setTempCtrl}  label="Temperature controlled" />
                    <Toggle value={forklift}  onChange={setForklift}  label="Forklift required at collection" />
                    <Toggle value={tailLift}  onChange={setTailLift}  label="Tail lift required" />
                  </div>
                  {hazardous && (
                    <TextField label="ADR class" value={adrClass} onChange={setAdrClass} placeholder="Class 3 — Flammable liquid" />
                  )}
                  {tempCtrl && (
                    <TextField label="Temperature range" value={tempRange} onChange={setTempRange} placeholder="2°C – 8°C" />
                  )}
                  <div>
                    <FieldLabel>Load notes</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2} value={loadNotes}
                      onChange={e => setLoadNotes(e.target.value)}
                      placeholder="Stacked 3 high. Do not tip. Tail lift required for unloading." />
                  </div>
                </div>
              )}
              <SectionFooter complete={sec4Complete} label="Load details" onCollapse={() => setS4(true)} />
            </div>
          )}
        </div>

        {/* ── Section 5: References & billing ────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={5} icon="📄" title="References & billing" subtitle="Purchase order and billing details"
            active collapsed={s5} onToggle={() => setS5(o => !o)}
            complete optional
            summary={purchaseOrderNumber || billingReference || undefined} />
          {!s5 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Your purchase order number" value={purchaseOrderNumber}
                  onChange={setPurchaseOrderNumber} placeholder="PO-2026-12345"
                  hint="Required on our invoice by your finance team." />
                <TextField label="Billing reference / cost code" value={billingReference}
                  onChange={setBillingReference} placeholder="COST-CENTRE-123" />
              </div>
              <TextField label="Declared value of goods (£)" type="number" value={declaredGoodsValue}
                onChange={setDeclaredGoodsValue} placeholder="0.00"
                hint="For insurance purposes — not the transport charge." />
              <SectionFooter complete label="References" onCollapse={() => setS5(true)} />
            </div>
          )}
        </div>

        {/* ── Section 6: Notes ────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={6} icon="📝" title="Notes" subtitle="Instructions for the driver and any other notes"
            active collapsed={s6} onToggle={() => setS6(o => !o)}
            complete optional
            summary={driverNotes ? driverNotes.slice(0, 40) + (driverNotes.length > 40 ? "…" : "") : undefined} />
          {!s6 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div>
                <FieldLabel>Driver notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={3} value={driverNotes}
                  onChange={e => setDriverNotes(e.target.value)}
                  placeholder="Ask for John at site office. Wear PPE — hi-vis and steel caps required." />
                <div className="text-xs text-muted mt-1">Instructions the driver must see: access codes, procedures, what to ask for on arrival.</div>
              </div>
              <OptionalToggle open={showNoteOpts} onToggle={() => setShowNoteOpts(o => !o)} label="safety & office notes" />
              {showNoteOpts && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <div>
                    <FieldLabel>Safety instructions</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2} value={safetyNotes}
                      onChange={e => setSafetyNotes(e.target.value)}
                      placeholder="COSHH data sheets provided. No open flames near load." />
                  </div>
                  <div>
                    <FieldLabel>Other notes for the office</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2} value={customerNotes}
                      onChange={e => setCustomerNotes(e.target.value)}
                      placeholder="Please call to confirm day before. Back-up contact is Mike." />
                  </div>
                </div>
              )}
              <SectionFooter complete label="Notes" onCollapse={() => setS6(true)} />
            </div>
          )}
        </div>

        {/* ── Submit bar ──────────────────────────────────────────────────── */}
        <div className="card px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-muted">
            {[sec1Complete, sec2Complete, sec3Complete, sec4Complete].filter(Boolean).length} / 4 required sections complete
          </div>
          <button type="submit" disabled={submitting} className="btn btn-primary px-8">
            {submitting ? "Submitting…" : "Submit transport request →"}
          </button>
        </div>

      </form>
    </div>
  );
}
