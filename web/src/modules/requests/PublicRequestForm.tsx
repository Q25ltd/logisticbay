/**
 * Public transport request form — customer-facing, no login required.
 * Design matches CreateJobPage exactly: same section headers, field labels,
 * optional toggles, and card layout.
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

// ── Reusable time button group ─────────────────────────────────────────────────
function TimeButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LOADING_TIME_OPTS.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "px-3 py-2 rounded-xl border text-sm font-medium transition-colors " +
            (value === v
              ? "bg-accent text-white border-accent"
              : "bg-white text-muted border-border hover:border-gray-400")
          }
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// ── Entrance pin — manual lat/lng only ────────────────────────────────────────
function EntrancePinInput({
  lat, lng, onChange,
}: {
  lat: string; lng: string;
  onChange: (lat: string, lng: string) => void;
}) {
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
          <input
            className="input font-mono"
            type="number"
            step="0.000001"
            placeholder="e.g. 53.483959"
            value={lat}
            onChange={e => onChange(e.target.value, lng)}
          />
        </div>
        <div>
          <FieldLabel>Longitude</FieldLabel>
          <input
            className="input font-mono"
            type="number"
            step="0.000001"
            placeholder="e.g. -2.244644"
            value={lng}
            onChange={e => onChange(lat, e.target.value)}
          />
        </div>
      </div>
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

  // Section collapse state
  const [s1, setS1] = useState(false);
  const [s2, setS2] = useState(false);
  const [s3, setS3] = useState(false);
  const [s4, setS4] = useState(false);
  const [s5, setS5] = useState(false);
  const [s6, setS6] = useState(false);

  // Optional panels
  const [showCollectionOpts,  setShowCollectionOpts]  = useState(false);
  const [showDeliveryOpts,    setShowDeliveryOpts]    = useState(false);
  const [showLoadOpts,        setShowLoadOpts]        = useState(false);
  const [showNoteOpts,        setShowNoteOpts]        = useState(false);

  // ── Section 1: Your details ──────────────────────────────────────────────
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // ── Section 2: Collection ────────────────────────────────────────────────
  const [collectionReference, setCollectionReference] = useState("");
  const [pSiteName,   setPSiteName]   = useState("");
  const [pUnitName,   setPUnitName]   = useState("");
  const [pAddress1,   setPAddress1]   = useState("");
  const [pAddress2,   setPAddress2]   = useState("");
  const [pTownCity,   setPTownCity]   = useState("");
  const [pCounty,     setPCounty]     = useState("");
  const [pPostcode,   setPPostcode]   = useState("");
  const [pLatStr,     setPLatStr]     = useState("");
  const [pLngStr,     setPLngStr]     = useState("");
  const [pEntrance,   setPEntrance]   = useState("");
  const [pDate,       setPDate]       = useState("");
  const [pEarliest,   setPEarliest]   = useState("");
  const [pLatest,     setPLatest]     = useState("");
  const [pLoadTime,   setPLoadTime]   = useState("30");
  const [pLoadCustom, setPLoadCustom] = useState("");
  const [pContact,    setPContact]    = useState("");
  const [pPhone,      setPPhone]      = useState("");
  const [pEmail,      setPEmail]      = useState("");
  const [pBookingReq, setPBookingReq] = useState(false);
  const [pBookingRef, setPBookingRef] = useState("");
  const [pHours,      setPHours]      = useState("");
  const [pRestrict,   setPRestrict]   = useState("");

  // ── Section 3: Delivery ──────────────────────────────────────────────────
  const [deliveryReference, setDeliveryReference] = useState("");
  const [dSiteName,   setDSiteName]   = useState("");
  const [dUnitName,   setDUnitName]   = useState("");
  const [dAddress1,   setDAddress1]   = useState("");
  const [dAddress2,   setDAddress2]   = useState("");
  const [dTownCity,   setDTownCity]   = useState("");
  const [dCounty,     setDCounty]     = useState("");
  const [dPostcode,   setDPostcode]   = useState("");
  const [dLatStr,     setDLatStr]     = useState("");
  const [dLngStr,     setDLngStr]     = useState("");
  const [dEntrance,   setDEntrance]   = useState("");
  const [dDate,       setDDate]       = useState("");
  const [dEarliest,   setDEarliest]   = useState("");
  const [dLatest,     setDLatest]     = useState("");
  const [dUnloadTime, setDUnloadTime] = useState("30");
  const [dUnloadCustom, setDUnloadCustom] = useState("");
  const [dContact,    setDContact]    = useState("");
  const [dPhone,      setDPhone]      = useState("");
  const [dEmail,      setDEmail]      = useState("");
  const [dBookingReq, setDBookingReq] = useState(false);
  const [dBookingRef, setDBookingRef] = useState("");
  const [dHours,      setDHours]      = useState("");
  const [dRestrict,   setDRestrict]   = useState("");

  // ── Section 4: Load ──────────────────────────────────────────────────────
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

  // ── Section 5: References & billing ─────────────────────────────────────
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [billingReference,    setBillingReference]    = useState("");
  const [declaredGoodsValue,  setDeclaredGoodsValue]  = useState("");

  // ── Section 6: Notes ────────────────────────────────────────────────────
  const [driverNotes,   setDriverNotes]   = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [safetyNotes,   setSafetyNotes]   = useState("");

  // ── Completeness checks ──────────────────────────────────────────────────
  const sec1Complete = !!(customerCompanyName.trim() && contactName.trim() && contactPhone.trim() && contactEmail.trim());
  const sec2Complete = !!(collectionReference.trim() && pSiteName.trim() && pAddress1.trim() && pTownCity.trim() && pPostcode.trim() && pDate && pEarliest && pLatest && pLatStr && pLngStr && pEntrance.trim());
  const sec3Complete = !!(deliveryReference.trim() && dSiteName.trim() && dAddress1.trim() && dTownCity.trim() && dPostcode.trim() && dDate && dEarliest && dLatest && dLatStr && dLngStr && dEntrance.trim());
  const sec4Complete = !!(goodsDesc.trim() && quantity && unit);
  const sec5Complete = true; // all optional
  const sec6Complete = true; // all optional

  const sec1Started = !!(customerCompanyName || contactName || contactPhone || contactEmail);
  const sec2Started = !!(collectionReference || pSiteName || pAddress1);
  const sec3Started = !!(deliveryReference || dSiteName || dAddress1);
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

    const pLoadMin   = pLoadTime   === "custom" ? parseInt(pLoadCustom, 10)   : parseInt(pLoadTime, 10);
    const dUnloadMin = dUnloadTime === "custom" ? parseInt(dUnloadCustom, 10) : parseInt(dUnloadTime, 10);

    const pickupData: PickupDataInput = {
      siteName:    pSiteName.trim(),
      unitName:    pUnitName.trim() || undefined,
      addressLine1: pAddress1.trim(),
      addressLine2: pAddress2.trim() || undefined,
      townCity:    pTownCity.trim(),
      countyRegion: pCounty.trim() || undefined,
      postcode:    pPostcode.trim(),
      entranceLat: parseFloat(pLatStr),
      entranceLng: parseFloat(pLngStr),
      entranceInstructions: pEntrance.trim(),
      contactName:  pContact.trim() || undefined,
      contactPhone: pPhone.trim()   || undefined,
      contactEmail: pEmail.trim()   || undefined,
      bookingRequired:  pBookingReq,
      bookingReference: pBookingRef.trim() || undefined,
      openingHours:     pHours.trim()      || undefined,
      siteRestrictions: pRestrict.trim()   || undefined,
      pickupDate:   pDate,
      earliestTime: pEarliest,
      latestTime:   pLatest,
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
      entranceLat: parseFloat(dLatStr),
      entranceLng: parseFloat(dLngStr),
      entranceInstructions: dEntrance.trim(),
      contactName:  dContact.trim() || undefined,
      contactPhone: dPhone.trim()   || undefined,
      contactEmail: dEmail.trim()   || undefined,
      bookingRequired:  dBookingReq,
      bookingReference: dBookingRef.trim() || undefined,
      openingHours:     dHours.trim()      || undefined,
      siteRestrictions: dRestrict.trim()   || undefined,
      deliveryDate:  dDate,
      earliestTime:  dEarliest,
      latestTime:    dLatest,
      estimatedUnloadingMinutes: dUnloadMin,
    };

    const loadData: LoadDataInput = {
      goodsDescription: goodsDesc.trim(),
      quantity:         parseFloat(quantity),
      unit:             unit === "other" ? (otherUnit.trim() || "other") : unit,
      estimatedWeight:  estWeight    ? parseFloat(estWeight)    : undefined,
      palletCount:      palletCount  ? parseInt(palletCount, 10) : undefined,
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

  // ── States ───────────────────────────────────────────────────────────────

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
          <button
            type="button"
            className="btn btn-primary mt-6"
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
    <div className="min-h-screen bg-surface">
      {/* Page header */}
      <div className="bg-white border-b border-border px-4 py-5 text-center shadow-sm">
        <div className="text-xs font-bold uppercase tracking-widest text-accent mb-1">Transport Request</div>
        <h1 className="text-xl font-black text-primary">{linkInfo.companyName}</h1>
        <p className="text-sm text-muted mt-1">Fill in all sections to submit a transport request.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Global error list */}
        {errors.length > 0 && (
          <div className="card border-red-200 p-4">
            <div className="font-semibold text-red-800 mb-2 text-sm">Please fix the following before submitting:</div>
            {errors.map((e, i) => <div key={i} className="text-sm text-red-700">• {e}</div>)}
          </div>
        )}

        {/* ── Section 1: Your details ── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={1} icon="👤" title="Your details" subtitle="Company name and contact information"
            active collapsed={s1} onToggle={() => setS1(o => !o)}
            complete={sec1Complete} started={sec1Started}
            summary={customerCompanyName || contactName}
          />
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

        {/* ── Section 2: Collection ── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={2} icon="📦" title="Collection" subtitle="Where and when the driver collects the load"
            active collapsed={s2} onToggle={() => setS2(o => !o)}
            complete={sec2Complete} started={sec2Started}
            summary={pSiteName ? `${pSiteName}${pDate ? " · " + pDate : ""}` : undefined}
          />
          {!s2 && (
            <div className="px-5 pt-5 pb-4 space-y-4">

              <TextField label="Collection reference" required value={collectionReference}
                onChange={setCollectionReference} placeholder="COL-2026-001234"
                hint="Warehouse release number, booking ref, or site collection code. Driver needs this on arrival." />

              <TextField label="Site name" required value={pSiteName}
                onChange={setPSiteName} placeholder="Acme Warehouse — Unit 5" caseRule="proper_name" />
              <TextField label="Address line 1" required value={pAddress1}
                onChange={setPAddress1} placeholder="Industrial Estate Road" caseRule="proper_name" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <TextField label="Town / city" required value={pTownCity}
                    onChange={setPTownCity} placeholder="Birmingham" caseRule="proper_name" />
                </div>
                <TextField label="Postcode" required value={pPostcode}
                  onChange={v => setPPostcode(v.toUpperCase())} placeholder="B1 1AA" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Collection date" required type="date" value={pDate} onChange={setPDate} />
                <TextField label="Earliest time" required type="time" value={pEarliest} onChange={setPEarliest} />
                <TextField label="Latest time" required type="time" value={pLatest} onChange={setPLatest} />
              </div>

              <div>
                <FieldLabel required>Estimated loading time</FieldLabel>
                <TimeButtons value={pLoadTime} onChange={setPLoadTime} />
                {pLoadTime === "custom" && (
                  <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                    value={pLoadCustom} onChange={e => setPLoadCustom(e.target.value)} />
                )}
              </div>

              <EntrancePinInput lat={pLatStr} lng={pLngStr}
                onChange={(lat, lng) => { setPLatStr(lat); setPLngStr(lng); }} />

              <div>
                <FieldLabel required>Entrance instructions</FieldLabel>
                <textarea className="input mt-1 w-full" rows={3} value={pEntrance}
                  onChange={e => setPEntrance(e.target.value)}
                  placeholder="Enter via Gate B on the left. Intercom code 1234. Ask for goods-in." />
                <div className="text-xs text-muted mt-1">Gate code, security procedure, which entrance to use, barriers to be aware of.</div>
              </div>

              <OptionalToggle open={showCollectionOpts} onToggle={() => setShowCollectionOpts(o => !o)} label="collection site details" />
              {showCollectionOpts && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <TextField label="Unit / building name" value={pUnitName} onChange={setPUnitName} placeholder="Unit 12B" />
                  <TextField label="Address line 2" value={pAddress2} onChange={setPAddress2} placeholder="Business Park" />
                  <TextField label="County / region" value={pCounty} onChange={setPCounty} placeholder="West Midlands" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <TextField label="Site contact name" value={pContact} onChange={setPContact} />
                    <TextField label="Site contact phone" type="tel" value={pPhone} onChange={setPPhone} />
                    <TextField label="Site contact email" type="email" value={pEmail} onChange={setPEmail} />
                  </div>
                  <Toggle value={pBookingReq} onChange={setPBookingReq} label="Booking required before arrival" />
                  {pBookingReq && (
                    <TextField label="Booking reference" value={pBookingRef} onChange={setPBookingRef} placeholder="BKG-2026-5678" />
                  )}
                  <TextField label="Opening hours" value={pHours} onChange={setPHours} placeholder="Mon–Fri 06:00–18:00" />
                  <div>
                    <FieldLabel>Site restrictions</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2} value={pRestrict}
                      onChange={e => setPRestrict(e.target.value)}
                      placeholder="Height limit 4.0m, max 44t, no overnight parking" />
                  </div>
                </div>
              )}

              <SectionFooter complete={sec2Complete} label="Collection" onCollapse={() => setS2(true)} />
            </div>
          )}
        </div>

        {/* ── Section 3: Delivery ── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={3} icon="🏁" title="Delivery" subtitle="Where and when the driver delivers the load"
            active collapsed={s3} onToggle={() => setS3(o => !o)}
            complete={sec3Complete} started={sec3Started}
            summary={dSiteName ? `${dSiteName}${dDate ? " · " + dDate : ""}` : undefined}
          />
          {!s3 && (
            <div className="px-5 pt-5 pb-4 space-y-4">

              <TextField label="Delivery reference" required value={deliveryReference}
                onChange={setDeliveryReference} placeholder="DEL-2026-001234"
                hint="Delivery booking number, PO, or goods-in reference. Driver needs this to unload." />

              <TextField label="Site name" required value={dSiteName}
                onChange={setDSiteName} placeholder="Customer Distribution Centre" caseRule="proper_name" />
              <TextField label="Address line 1" required value={dAddress1}
                onChange={setDAddress1} placeholder="Logistics Park, Unit 12" caseRule="proper_name" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <TextField label="Town / city" required value={dTownCity}
                    onChange={setDTownCity} placeholder="Manchester" caseRule="proper_name" />
                </div>
                <TextField label="Postcode" required value={dPostcode}
                  onChange={v => setDPostcode(v.toUpperCase())} placeholder="M1 1AA" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField label="Delivery date" required type="date" value={dDate} onChange={setDDate} />
                <TextField label="Earliest time" required type="time" value={dEarliest} onChange={setDEarliest} />
                <TextField label="Latest time" required type="time" value={dLatest} onChange={setDLatest} />
              </div>

              <div>
                <FieldLabel required>Estimated unloading time</FieldLabel>
                <TimeButtons value={dUnloadTime} onChange={setDUnloadTime} />
                {dUnloadTime === "custom" && (
                  <input className="input mt-2 max-w-xs" type="number" placeholder="Minutes"
                    value={dUnloadCustom} onChange={e => setDUnloadCustom(e.target.value)} />
                )}
              </div>

              <EntrancePinInput lat={dLatStr} lng={dLngStr}
                onChange={(lat, lng) => { setDLatStr(lat); setDLngStr(lng); }} />

              <div>
                <FieldLabel required>Entrance instructions</FieldLabel>
                <textarea className="input mt-1 w-full" rows={3} value={dEntrance}
                  onChange={e => setDEntrance(e.target.value)}
                  placeholder="Goods-in via roller shutters at rear. Report to warehouse office first." />
                <div className="text-xs text-muted mt-1">Gate code, security procedure, goods-in entrance, dock number.</div>
              </div>

              <OptionalToggle open={showDeliveryOpts} onToggle={() => setShowDeliveryOpts(o => !o)} label="delivery site details" />
              {showDeliveryOpts && (
                <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                  <TextField label="Unit / building name" value={dUnitName} onChange={setDUnitName} placeholder="Unit 12B" />
                  <TextField label="Address line 2" value={dAddress2} onChange={setDAddress2} placeholder="Business Park" />
                  <TextField label="County / region" value={dCounty} onChange={setDCounty} placeholder="Greater Manchester" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <TextField label="Site contact name" value={dContact} onChange={setDContact} />
                    <TextField label="Site contact phone" type="tel" value={dPhone} onChange={setDPhone} />
                    <TextField label="Site contact email" type="email" value={dEmail} onChange={setDEmail} />
                  </div>
                  <Toggle value={dBookingReq} onChange={setDBookingReq} label="Booking required before arrival" />
                  {dBookingReq && (
                    <TextField label="Booking reference" value={dBookingRef} onChange={setDBookingRef} placeholder="BKG-2026-9012" />
                  )}
                  <TextField label="Opening hours" value={dHours} onChange={setDHours} placeholder="Mon–Fri 07:00–17:00" />
                  <div>
                    <FieldLabel>Site restrictions</FieldLabel>
                    <textarea className="input mt-1 w-full" rows={2} value={dRestrict}
                      onChange={e => setDRestrict(e.target.value)}
                      placeholder="FORS Silver required, max width 2.4m, no tail-lift deliveries" />
                  </div>
                </div>
              )}

              <SectionFooter complete={sec3Complete} label="Delivery" onCollapse={() => setS3(true)} />
            </div>
          )}
        </div>

        {/* ── Section 4: Load details ── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={4} icon="🏗️" title="Load details" subtitle="What is being transported"
            active collapsed={s4} onToggle={() => setS4(o => !o)}
            complete={sec4Complete} started={sec4Started}
            summary={goodsDesc ? `${goodsDesc}${quantity ? " · " + quantity + " " + unit : ""}` : undefined}
          />
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

        {/* ── Section 5: References & billing ── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={5} icon="📄" title="References & billing" subtitle="Purchase order and billing details"
            active collapsed={s5} onToggle={() => setS5(o => !o)}
            complete={sec5Complete} optional
            summary={purchaseOrderNumber || billingReference || undefined}
          />
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
              <SectionFooter complete={sec5Complete} label="References" onCollapse={() => setS5(true)} />
            </div>
          )}
        </div>

        {/* ── Section 6: Notes ── */}
        <div className="card overflow-hidden">
          <SectionHeader
            num={6} icon="📝" title="Notes" subtitle="Instructions for the driver and any other notes"
            active collapsed={s6} onToggle={() => setS6(o => !o)}
            complete={sec6Complete} optional
            summary={driverNotes ? driverNotes.slice(0, 40) + (driverNotes.length > 40 ? "…" : "") : undefined}
          />
          {!s6 && (
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div>
                <FieldLabel>Driver notes</FieldLabel>
                <textarea className="input mt-1 w-full" rows={3} value={driverNotes}
                  onChange={e => setDriverNotes(e.target.value)}
                  placeholder="Ask for John at site office. Wear PPE — hi-vis and steel caps required." />
                <div className="text-xs text-muted mt-1">
                  Instructions the driver must see: access codes, procedures, what to ask for on arrival.
                </div>
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

              <SectionFooter complete={sec6Complete} label="Notes" onCollapse={() => setS6(true)} />
            </div>
          )}
        </div>

        {/* ── Submit bar ── */}
        <div className="card px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-muted">
            {[sec1Complete, sec2Complete, sec3Complete, sec4Complete].filter(Boolean).length} / 4 required sections complete
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary px-8"
          >
            {submitting ? "Submitting…" : "Submit transport request →"}
          </button>
        </div>

      </form>
    </div>
  );
}
