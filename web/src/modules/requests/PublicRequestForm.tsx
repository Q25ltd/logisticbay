/**
 * Public transport request form.
 * Accessible at /request/:token — no login required.
 * Replaces phone calls, WhatsApp messages, and email chaos.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  jobRequestsPublicApi,
  type PublicLinkInfo,
  type PickupDataInput,
  type DeliveryDataInput,
  type LoadDataInput,
  type SubmitRequestBody,
} from "../../api/jobRequests";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOADING_TIME_OPTS = [
  ["15", "15 minutes"], ["30", "30 minutes"], ["45", "45 minutes"],
  ["60", "1 hour"], ["90", "1.5 hours"], ["120", "2 hours"], ["custom", "Custom"],
];

const LOAD_UNITS = [
  ["pallets", "Pallets"], ["tonnes", "Tonnes"], ["kg", "Kilograms"],
  ["bags", "Bags"], ["items", "Items"], ["loads", "Loads"],
  ["litres", "Litres"], ["cubic_metres", "Cubic metres"], ["other", "Other"],
];

// ── Pin picker component ───────────────────────────────────────────────────────
// Simple coordinate input — lat/lng text boxes with postcode auto-lookup.
// Phase 2 will replace this with a map picker.
function EntrancePinInput({
  label, postcode, lat, lng,
  onChange,
}: {
  label: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const [looking, setLooking] = useState(false);
  const [looked, setLooked] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

  async function lookupPostcode() {
    if (!postcode.trim()) return;
    setLooking(true);
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, "").toUpperCase())}`);
      const data = await res.json();
      if (data.result) {
        onChange(data.result.latitude, data.result.longitude);
        setLooked(true);
      }
    } catch { /* silent */ }
    setLooking(false);
  }

  return (
    <div>
      <div className="label" style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <p className="text-xs mb-2" style={{ color: "#6b7280" }}>
        Place the pin where the driver should enter the site: gate, yard entrance, goods-in, or security barrier.
        <br /><em>This is NOT the postcode centre — it must be the exact truck entrance point.</em>
      </p>
      {lat == null || lng == null ? (
        <div>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={lookupPostcode}
            disabled={!postcode.trim() || looking}
          >
            {looking ? "Looking up…" : `Use ${postcode.trim() || "postcode"} as starting point`}
          </button>
          <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
            Entrance pin is required. Click to start from the postcode, then adjust coordinates manually.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-green-50 border-green-200">
          <div className="flex-1 text-sm font-mono" style={{ color: "#0f172a" }}>
            {lat.toFixed(6)}, {lng.toFixed(6)}
            {looked && <span className="ml-2 text-xs text-amber-600">(postcode centre — drag to exact entrance)</span>}
          </div>
          <button
            type="button"
            className="text-xs underline"
            style={{ color: "#6b7280" }}
            onClick={() => onChange(0, 0)}
          >
            Reset
          </button>
        </div>
      )}
      {lat != null && lng != null && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-xs font-medium" style={{ color: "#6b7280" }}>Latitude</label>
            <input
              className="input text-sm font-mono"
              type="number"
              step="0.000001"
              value={lat || ""}
              onChange={e => onChange(parseFloat(e.target.value) || 0, lng)}
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "#6b7280" }}>Longitude</label>
            <input
              className="input text-sm font-mono"
              type="number"
              step="0.000001"
              value={lng || ""}
              onChange={e => onChange(lat, parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section toggle ─────────────────────────────────────────────────────────────
function OptSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-sm font-medium underline"
        style={{ color: "#6366f1" }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? "▾ Hide" : "▸ Add"} {label}
      </button>
      {open && <div className="mt-3 space-y-3 pl-2 border-l-2 border-indigo-100">{children}</div>}
    </div>
  );
}

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: "#6b7280" }}>{hint}</p>}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function PublicRequestForm() {
  const { token } = useParams<{ token: string }>();
  const [linkInfo, setLinkInfo]   = useState<PublicLinkInfo | null>(null);
  const [linkError, setLinkError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [warnings, setWarnings]   = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]       = useState<string[]>([]);

  // Contact
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [contactName, setContactName]   = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // References
  const [collectionReference, setCollectionReference] = useState("");
  const [deliveryReference,   setDeliveryReference]   = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [billingReference,    setBillingReference]    = useState("");
  const [declaredGoodsValue,  setDeclaredGoodsValue]  = useState("");

  // Pickup
  const [pSiteName,    setPSiteName]    = useState("");
  const [pUnitName,    setPUnitName]    = useState("");
  const [pAddress1,    setPAddress1]    = useState("");
  const [pAddress2,    setPAddress2]    = useState("");
  const [pTownCity,    setPTownCity]    = useState("");
  const [pCounty,      setPCounty]      = useState("");
  const [pPostcode,    setPPostcode]    = useState("");
  const [pLat,         setPLat]         = useState<number | null>(null);
  const [pLng,         setPLng]         = useState<number | null>(null);
  const [pEntrance,    setPEntrance]    = useState("");
  const [pContact,     setPContact]     = useState("");
  const [pPhone,       setPPhone]       = useState("");
  const [pEmail,       setPEmail]       = useState("");
  const [pBookingReq,  setPBookingReq]  = useState(false);
  const [pBookingRef,  setPBookingRef]  = useState("");
  const [pHours,       setPHours]       = useState("");
  const [pRestrict,    setPRestrict]    = useState("");
  const [pDate,        setPDate]        = useState("");
  const [pEarliest,    setPEarliest]    = useState("");
  const [pLatest,      setPLatest]      = useState("");
  const [pLoadTime,    setPLoadTime]    = useState("30");
  const [pLoadCustom,  setPLoadCustom]  = useState("");

  // Delivery
  const [dSiteName,    setDSiteName]    = useState("");
  const [dUnitName,    setDUnitName]    = useState("");
  const [dAddress1,    setDAddress1]    = useState("");
  const [dAddress2,    setDAddress2]    = useState("");
  const [dTownCity,    setDTownCity]    = useState("");
  const [dCounty,      setDCounty]      = useState("");
  const [dPostcode,    setDPostcode]    = useState("");
  const [dLat,         setDLat]         = useState<number | null>(null);
  const [dLng,         setDLng]         = useState<number | null>(null);
  const [dEntrance,    setDEntrance]    = useState("");
  const [dContact,     setDContact]     = useState("");
  const [dPhone,       setDPhone]       = useState("");
  const [dEmail,       setDEmail]       = useState("");
  const [dBookingReq,  setDBookingReq]  = useState(false);
  const [dBookingRef,  setDBookingRef]  = useState("");
  const [dHours,       setDHours]       = useState("");
  const [dRestrict,    setDRestrict]    = useState("");
  const [dDate,        setDDate]        = useState("");
  const [dEarliest,    setDEarliest]    = useState("");
  const [dLatest,      setDLatest]      = useState("");
  const [dUnloadTime,  setDUnloadTime]  = useState("30");
  const [dUnloadCustom, setDUnloadCustom] = useState("");

  // Load
  const [goodsDesc,    setGoodsDesc]    = useState("");
  const [quantity,     setQuantity]     = useState("");
  const [unit,         setUnit]         = useState("pallets");
  const [otherUnit,    setOtherUnit]    = useState("");
  const [estWeight,    setEstWeight]    = useState("");
  const [palletCount,  setPalletCount]  = useState("");
  const [hazardous,    setHazardous]    = useState(false);
  const [adrClass,     setAdrClass]     = useState("");
  const [tempCtrl,     setTempCtrl]     = useState(false);
  const [tempRange,    setTempRange]    = useState("");
  const [fragile,      setFragile]      = useState(false);
  const [forklift,     setForklift]     = useState(false);
  const [tailLift,     setTailLift]     = useState(false);
  const [loadNotes,    setLoadNotes]    = useState("");

  // Notes
  const [driverNotes,   setDriverNotes]   = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [safetyNotes,   setSafetyNotes]   = useState("");

  // Load link info
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    const pLoadMin = pLoadTime === "custom" ? parseInt(pLoadCustom, 10) : parseInt(pLoadTime, 10);
    const dUnloadMin = dUnloadTime === "custom" ? parseInt(dUnloadCustom, 10) : parseInt(dUnloadTime, 10);

    const pickupData: PickupDataInput = {
      siteName:    pSiteName.trim(),
      unitName:    pUnitName.trim() || undefined,
      addressLine1: pAddress1.trim(),
      addressLine2: pAddress2.trim() || undefined,
      townCity:    pTownCity.trim(),
      countyRegion: pCounty.trim() || undefined,
      postcode:    pPostcode.trim(),
      entranceLat: pLat!,
      entranceLng: pLng!,
      entranceInstructions: pEntrance.trim(),
      contactName:  pContact.trim() || undefined,
      contactPhone: pPhone.trim() || undefined,
      contactEmail: pEmail.trim() || undefined,
      bookingRequired:  pBookingReq,
      bookingReference: pBookingRef.trim() || undefined,
      openingHours:     pHours.trim() || undefined,
      siteRestrictions: pRestrict.trim() || undefined,
      pickupDate:    pDate,
      earliestTime:  pEarliest,
      latestTime:    pLatest,
      estimatedLoadingMinutes: pLoadMin,
    };

    const deliveryData: DeliveryDataInput = {
      siteName:    dSiteName.trim(),
      unitName:    dUnitName.trim() || undefined,
      addressLine1: dAddress1.trim(),
      addressLine2: dAddress2.trim() || undefined,
      townCity:    dTownCity.trim(),
      countyRegion: dCounty.trim() || undefined,
      postcode:    dPostcode.trim(),
      entranceLat: dLat!,
      entranceLng: dLng!,
      entranceInstructions: dEntrance.trim(),
      contactName:  dContact.trim() || undefined,
      contactPhone: dPhone.trim() || undefined,
      contactEmail: dEmail.trim() || undefined,
      bookingRequired:  dBookingReq,
      bookingReference: dBookingRef.trim() || undefined,
      openingHours:     dHours.trim() || undefined,
      siteRestrictions: dRestrict.trim() || undefined,
      deliveryDate:  dDate,
      earliestTime:  dEarliest,
      latestTime:    dLatest,
      estimatedUnloadingMinutes: dUnloadMin,
    };

    const loadData: LoadDataInput = {
      goodsDescription: goodsDesc.trim(),
      quantity:         parseFloat(quantity),
      unit:             unit === "other" ? (otherUnit.trim() || "other") : unit,
      estimatedWeight:  estWeight ? parseFloat(estWeight) : undefined,
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
      collectionReference: collectionReference.trim(),
      deliveryReference:   deliveryReference.trim(),
      purchaseOrderNumber: purchaseOrderNumber.trim() || undefined,
      billingReference:    billingReference.trim() || undefined,
      declaredGoodsValue:  declaredGoodsValue ? parseFloat(declaredGoodsValue) : undefined,
      pickupData,
      deliveryData,
      loadData,
      driverVisibleNotes:  driverNotes.trim() || undefined,
      customerNotes:       customerNotes.trim() || undefined,
      safetyInstructions:  safetyNotes.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const result = await jobRequestsPublicApi.submit(token!, body);
      setWarnings(result.warnings ?? []);
      setSubmitted(true);
    } catch (err: any) {
      if (err.errors) {
        setErrors(err.errors);
      } else {
        setErrors([err.message ?? "Submission failed. Please try again."]);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Error / loading states ───────────────────────────────────────────────
  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f8fafc" }}>
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: "#0f172a" }}>Link not available</h1>
          <p className="text-sm" style={{ color: "#6b7280" }}>{linkError}</p>
        </div>
      </div>
    );
  }

  if (!linkInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: "#6b7280" }}>Loading…</div>
      </div>
    );
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f8fafc" }}>
        <div className="text-center max-w-lg">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-black mb-3" style={{ color: "#0f172a" }}>Request submitted</h1>
          <p className="text-base mb-4" style={{ color: "#374151" }}>
            Your transport request has been submitted to <strong>{linkInfo.companyName}</strong>.
            Our operations team will review it and contact you if any further information is needed.
          </p>
          {warnings.length > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-left text-sm space-y-1">
              <div className="font-semibold text-amber-800 mb-2">⚠ Notes on your submission:</div>
              {warnings.map((w, i) => <div key={i} className="text-amber-700">{w}</div>)}
            </div>
          )}
          <button
            type="button"
            className="mt-6 btn btn-primary"
            onClick={() => { setSubmitted(false); setErrors([]); }}
          >
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
      {/* Header */}
      <div className="py-6 px-4 text-center border-b bg-white shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#6366f1" }}>
          Transport Request
        </div>
        <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>{linkInfo.companyName}</h1>
        <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
          Fill in the details below to submit a transport request.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Errors */}
        {errors.length > 0 && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="font-semibold text-red-800 mb-2">Please fix the following:</div>
            {errors.map((e, i) => <div key={i} className="text-sm text-red-700">• {e}</div>)}
          </div>
        )}

        {/* ── 1. Contact ── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-base" style={{ color: "#0f172a" }}>1. Your details</h2>
          <Field label="Company / Organisation name" required>
            <input className="input" value={customerCompanyName}
              onChange={e => setCustomerCompanyName(e.target.value)} placeholder="Acme Distribution Ltd" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Contact name" required>
              <input className="input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" />
            </Field>
            <Field label="Contact phone" required>
              <input className="input" type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+44 7700 900123" />
            </Field>
          </div>
          <Field label="Contact email" required>
            <input className="input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="jane@acme.com" />
          </Field>
        </div>

        {/* ── 2. Collection ── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-base" style={{ color: "#0f172a" }}>2. Collection</h2>

          <Field label="Collection reference" required
            hint="Warehouse release number, booking reference, or site collection code. The driver will need this on arrival.">
            <input className="input font-mono" value={collectionReference}
              onChange={e => setCollectionReference(e.target.value)} placeholder="COL-2026-001234" />
          </Field>

          <Field label="Site name" required>
            <input className="input" value={pSiteName} onChange={e => setPSiteName(e.target.value)} placeholder="Acme Warehouse — Unit 5" />
          </Field>

          <Field label="Address line 1" required>
            <input className="input" value={pAddress1} onChange={e => setPAddress1(e.target.value)} placeholder="Industrial Estate Road" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Field label="Town / City" required>
                <input className="input" value={pTownCity} onChange={e => setPTownCity(e.target.value)} placeholder="Birmingham" />
              </Field>
            </div>
            <Field label="Postcode" required>
              <input className="input uppercase" value={pPostcode}
                onChange={e => { setPPostcode(e.target.value.toUpperCase()); setPLat(null); setPLng(null); }}
                placeholder="B1 1AA" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Collection date" required>
              <input className="input" type="date" value={pDate} onChange={e => setPDate(e.target.value)} />
            </Field>
            <Field label="Earliest time" required>
              <input className="input" type="time" value={pEarliest} onChange={e => setPEarliest(e.target.value)} />
            </Field>
            <Field label="Latest time" required>
              <input className="input" type="time" value={pLatest} onChange={e => setPLatest(e.target.value)} />
            </Field>
          </div>

          <Field label="Estimated loading time" required>
            <div className="flex gap-2 flex-wrap">
              {LOADING_TIME_OPTS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPLoadTime(v)}
                  className={"px-3 py-1.5 rounded-lg border text-sm font-medium " +
                    (pLoadTime === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-border bg-white text-slate-600 hover:border-indigo-300")}
                >
                  {l}
                </button>
              ))}
            </div>
            {pLoadTime === "custom" && (
              <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                value={pLoadCustom} onChange={e => setPLoadCustom(e.target.value)} />
            )}
          </Field>

          <EntrancePinInput
            label="Exact entrance pin *"
            postcode={pPostcode}
            lat={pLat} lng={pLng}
            onChange={(lat, lng) => { setPLat(lat === 0 && lng === 0 ? null : lat); setPLng(lat === 0 && lng === 0 ? null : lng); }}
          />

          <Field label="Entrance instructions" required
            hint="Gate code, security procedure, which entrance to use, barriers to be aware of.">
            <textarea className="input" rows={3} value={pEntrance} onChange={e => setPEntrance(e.target.value)}
              placeholder="Enter via Gate B on the left side. Intercom code 1234. Ask for goods-in." />
          </Field>

          <OptSection label="site contact details">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Contact name"><input className="input" value={pContact} onChange={e => setPContact(e.target.value)} /></Field>
              <Field label="Contact phone"><input className="input" type="tel" value={pPhone} onChange={e => setPPhone(e.target.value)} /></Field>
              <Field label="Contact email"><input className="input" type="email" value={pEmail} onChange={e => setPEmail(e.target.value)} /></Field>
            </div>
          </OptSection>

          <OptSection label="booking & opening hours">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="pBookingReq" checked={pBookingReq} onChange={e => setPBookingReq(e.target.checked)} />
              <label htmlFor="pBookingReq" className="text-sm cursor-pointer">Booking required before arrival</label>
            </div>
            {pBookingReq && (
              <Field label="Booking reference">
                <input className="input" value={pBookingRef} onChange={e => setPBookingRef(e.target.value)} placeholder="BKG-2026-5678" />
              </Field>
            )}
            <Field label="Opening hours">
              <input className="input" value={pHours} onChange={e => setPHours(e.target.value)} placeholder="Mon–Fri 06:00–18:00" />
            </Field>
          </OptSection>

          <OptSection label="site restrictions or special notes">
            <Field label="Site restrictions">
              <textarea className="input" rows={2} value={pRestrict} onChange={e => setPRestrict(e.target.value)}
                placeholder="Height restriction 4.0m, max 44t, no overnight parking" />
            </Field>
          </OptSection>
        </div>

        {/* ── 3. Delivery ── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-base" style={{ color: "#0f172a" }}>3. Delivery</h2>

          <Field label="Delivery reference" required
            hint="Delivery booking number, purchase order, or goods-in reference. The driver will need this to unload.">
            <input className="input font-mono" value={deliveryReference}
              onChange={e => setDeliveryReference(e.target.value)} placeholder="DEL-2026-001234" />
          </Field>

          <Field label="Site name" required>
            <input className="input" value={dSiteName} onChange={e => setDSiteName(e.target.value)} placeholder="Customer Distribution Centre" />
          </Field>

          <Field label="Address line 1" required>
            <input className="input" value={dAddress1} onChange={e => setDAddress1(e.target.value)} placeholder="Logistics Park, Unit 12" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Field label="Town / City" required>
                <input className="input" value={dTownCity} onChange={e => setDTownCity(e.target.value)} placeholder="Manchester" />
              </Field>
            </div>
            <Field label="Postcode" required>
              <input className="input uppercase" value={dPostcode}
                onChange={e => { setDPostcode(e.target.value.toUpperCase()); setDLat(null); setDLng(null); }}
                placeholder="M1 1AA" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Delivery date" required>
              <input className="input" type="date" value={dDate} onChange={e => setDDate(e.target.value)} />
            </Field>
            <Field label="Earliest time" required>
              <input className="input" type="time" value={dEarliest} onChange={e => setDEarliest(e.target.value)} />
            </Field>
            <Field label="Latest time" required>
              <input className="input" type="time" value={dLatest} onChange={e => setDLatest(e.target.value)} />
            </Field>
          </div>

          <Field label="Estimated unloading time" required>
            <div className="flex gap-2 flex-wrap">
              {LOADING_TIME_OPTS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDUnloadTime(v)}
                  className={"px-3 py-1.5 rounded-lg border text-sm font-medium " +
                    (dUnloadTime === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-border bg-white text-slate-600 hover:border-indigo-300")}
                >
                  {l}
                </button>
              ))}
            </div>
            {dUnloadTime === "custom" && (
              <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                value={dUnloadCustom} onChange={e => setDUnloadCustom(e.target.value)} />
            )}
          </Field>

          <EntrancePinInput
            label="Exact entrance pin *"
            postcode={dPostcode}
            lat={dLat} lng={dLng}
            onChange={(lat, lng) => { setDLat(lat === 0 && lng === 0 ? null : lat); setDLng(lat === 0 && lng === 0 ? null : lng); }}
          />

          <Field label="Entrance instructions" required
            hint="Gate code, security procedure, goods-in entrance, dock number.">
            <textarea className="input" rows={3} value={dEntrance} onChange={e => setDEntrance(e.target.value)}
              placeholder="Goods-in via roller shutters at rear. Report to warehouse office first." />
          </Field>

          <OptSection label="site contact details">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Contact name"><input className="input" value={dContact} onChange={e => setDContact(e.target.value)} /></Field>
              <Field label="Contact phone"><input className="input" type="tel" value={dPhone} onChange={e => setDPhone(e.target.value)} /></Field>
              <Field label="Contact email"><input className="input" type="email" value={dEmail} onChange={e => setDEmail(e.target.value)} /></Field>
            </div>
          </OptSection>

          <OptSection label="booking & opening hours">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="dBookingReq" checked={dBookingReq} onChange={e => setDBookingReq(e.target.checked)} />
              <label htmlFor="dBookingReq" className="text-sm cursor-pointer">Booking required before arrival</label>
            </div>
            {dBookingReq && (
              <Field label="Booking reference">
                <input className="input" value={dBookingRef} onChange={e => setDBookingRef(e.target.value)} placeholder="BKG-2026-9012" />
              </Field>
            )}
            <Field label="Opening hours">
              <input className="input" value={dHours} onChange={e => setDHours(e.target.value)} placeholder="Mon–Fri 07:00–17:00" />
            </Field>
          </OptSection>

          <OptSection label="site restrictions or special notes">
            <Field label="Site restrictions">
              <textarea className="input" rows={2} value={dRestrict} onChange={e => setDRestrict(e.target.value)}
                placeholder="FORS Silver required, max vehicle width 2.4m, no tail-lift deliveries" />
            </Field>
          </OptSection>
        </div>

        {/* ── 4. Load ── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-base" style={{ color: "#0f172a" }}>4. Load details</h2>

          <Field label="Description of goods" required hint="What is being transported?">
            <textarea className="input" rows={2} value={goodsDesc} onChange={e => setGoodsDesc(e.target.value)}
              placeholder="Automotive parts — engine components, boxed" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" required>
              <input className="input" type="number" min="0" step="any" value={quantity}
                onChange={e => setQuantity(e.target.value)} placeholder="12" />
            </Field>
            <Field label="Unit" required>
              <select className="input" value={unit} onChange={e => setUnit(e.target.value)}>
                {LOAD_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
          {unit === "other" && (
            <Field label="Describe unit">
              <input className="input" value={otherUnit} onChange={e => setOtherUnit(e.target.value)} placeholder="e.g. rolls" />
            </Field>
          )}

          <OptSection label="weight, dimensions &amp; special requirements">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimated total weight (kg)">
                <input className="input" type="number" value={estWeight} onChange={e => setEstWeight(e.target.value)} placeholder="14000" />
              </Field>
              <Field label="Pallet count">
                <input className="input" type="number" value={palletCount} onChange={e => setPalletCount(e.target.value)} placeholder="24" />
              </Field>
            </div>

            <div className="space-y-2">
              {[
                [fragile, setFragile, "Fragile / handle with care"] as const,
                [hazardous, setHazardous, "Hazardous goods (ADR)"] as const,
                [tempCtrl, setTempCtrl, "Temperature controlled"] as const,
                [forklift, setForklift, "Forklift required at collection"] as const,
                [tailLift, setTailLift, "Tail lift required"] as const,
              ].map(([val, setter, label], i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={val} onChange={e => (setter as any)(e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            {hazardous && (
              <Field label="ADR class">
                <input className="input max-w-xs" value={adrClass} onChange={e => setAdrClass(e.target.value)} placeholder="Class 3 — Flammable liquid" />
              </Field>
            )}
            {tempCtrl && (
              <Field label="Temperature range">
                <input className="input max-w-xs" value={tempRange} onChange={e => setTempRange(e.target.value)} placeholder="2°C – 8°C" />
              </Field>
            )}

            <Field label="Load notes">
              <textarea className="input" rows={2} value={loadNotes} onChange={e => setLoadNotes(e.target.value)}
                placeholder="Stacked 3 high. Do not tip. Tail lift required for unloading." />
            </Field>
          </OptSection>
        </div>

        {/* ── 5. Commercial ── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-base" style={{ color: "#0f172a" }}>5. References &amp; billing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Your purchase order number"
              hint="Required on our invoice by your finance team.">
              <input className="input" value={purchaseOrderNumber} onChange={e => setPurchaseOrderNumber(e.target.value)} placeholder="PO-2026-12345" />
            </Field>
            <Field label="Billing reference / cost code">
              <input className="input" value={billingReference} onChange={e => setBillingReference(e.target.value)} placeholder="COST-CENTRE-123" />
            </Field>
          </div>
          <Field label="Declared value of goods (£)"
            hint="For insurance purposes — not the transport charge.">
            <input className="input max-w-xs" type="number" min="0" step="0.01" value={declaredGoodsValue}
              onChange={e => setDeclaredGoodsValue(e.target.value)} placeholder="0.00" />
          </Field>
        </div>

        {/* ── 6. Notes ── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-base" style={{ color: "#0f172a" }}>6. Notes</h2>

          <Field label="Driver notes"
            hint="Instructions the driver must see: access codes, procedures, what to ask for on arrival.">
            <textarea className="input" rows={3} value={driverNotes} onChange={e => setDriverNotes(e.target.value)}
              placeholder="Ask for John at site office. Wear PPE — hi-vis and steel caps required." />
          </Field>

          <OptSection label="safety instructions or other notes">
            <Field label="Safety instructions">
              <textarea className="input" rows={2} value={safetyNotes} onChange={e => setSafetyNotes(e.target.value)}
                placeholder="COSHH data sheets provided. No open flames near load." />
            </Field>
            <Field label="Other notes for the office">
              <textarea className="input" rows={2} value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}
                placeholder="Please call to confirm day before. Back-up contact is Mike." />
            </Field>
          </OptSection>
        </div>

        {/* Submit */}
        <div className="flex justify-end pb-8">
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary text-base px-8 py-3"
          >
            {submitting ? "Submitting…" : "Submit transport request →"}
          </button>
        </div>

      </form>
    </div>
  );
}
