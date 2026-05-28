import { useState } from "react";
import { driversApi } from "../../api/drivers";
import type { Driver } from "../../types";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";
import { Input } from "../../components/Input";
import { BODY_TYPES, DRIVER_ENDORSEMENTS, DRIVER_LICENCE_CLASSES, TRAILER_BODY_TYPE_VALUES } from "../../constants/vehicleTaxonomy";
import { MultiCheck } from "../jobs/CreateJobFormComponents";

export default function DriverForm({ initial, onSave, onCancel }: {
  initial?: Driver; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    displayName: initial?.displayName ?? "",
    employeeNumber: initial?.employeeNumber ?? "",
    phoneNumber: initial?.phoneNumber ?? "",
    email: initial?.user?.email ?? "",
    employmentStartDate: initial?.employmentStartDate ? String(initial.employmentStartDate).slice(0, 10) : "",
    driverType: initial?.driverType ?? "permanent",
    licenceClass: initial?.licenceClass ?? "",
    endorsements: Array.isArray(initial?.endorsements) ? initial.endorsements : [] as string[],
    canUseTrailer: Boolean(initial?.canUseTrailer),
    trailerTypesAllowed: Array.isArray(initial?.trailerTypesAllowed) ? initial.trailerTypesAllowed : [] as string[],
    adrAllowed: Boolean(initial?.adrAllowed),
    hiabAllowed: Boolean(initial?.hiabAllowed),
    moffettAllowed: Boolean(initial?.moffettAllowed),
    manualHandlingAllowed: Boolean(initial?.manualHandlingAllowed),
    preferredStartTime: initial?.preferredStartTime ?? "",
    earliestStartTime: initial?.earliestStartTime ?? "",
    latestFinishTime: initial?.latestFinishTime ?? "",
    preferredShiftHours: initial?.preferredShiftHours == null ? "" : String(initial.preferredShiftHours),
    normalWorkingDays: Array.isArray(initial?.normalWorkingDays) ? initial.normalWorkingDays : [] as string[],
    weekendAvailable: Boolean(initial?.weekendAvailable),
    nightWorkAllowed: Boolean(initial?.nightWorkAllowed),
    nightsOutAllowed: Boolean(initial?.nightsOutAllowed),
    overtimeAllowed: Boolean(initial?.overtimeAllowed),
    workPattern: (initial?.workPattern ?? "") as string,
    baseLocation: initial?.baseLocation ?? "",
    basePostcode: initial?.basePostcode ?? "",
    baseLat: initial?.baseLat ?? null as number | null,
    baseLng: initial?.baseLng ?? null as number | null,
    operatingArea: initial?.operatingArea ?? "",
    avoidAreas: initial?.avoidAreas ?? "",
    plannerNotes: initial?.plannerNotes ?? "",
    holidayAllowance: initial?.holidayAllowance == null ? "28" : String(initial.holidayAllowance),
    holidayRequests: (initial?.holidayRequests ?? []).map((h) => ({
      startDate: String(h.startDate).slice(0, 10),
      endDate: String(h.endDate).slice(0, 10),
      reason: h.reason ?? "holiday",
      note: h.note ?? "",
      status: h.status ?? "approved",
    })),
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [loginDetails, setLoginDetails] = useState<{ email: string; pin: string } | null>(null);
  const [postcodeGeoStatus, setPostcodeGeoStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const setBool = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.checked }));

  function toggleList(field: "normalWorkingDays" | "trailerTypesAllowed", value: string) {
    setForm((p) => {
      const current = p[field] as string[];
      return {
        ...p,
        [field]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
  }

  function addHoliday() {
    setForm((p) => ({
      ...p,
      holidayRequests: [
        ...p.holidayRequests,
        { startDate: "", endDate: "", reason: "holiday", note: "", status: "approved" },
      ],
    }));
  }

  function updateHoliday(index: number, field: string, value: string) {
    setForm((p) => ({
      ...p,
      holidayRequests: p.holidayRequests.map((h, i) => i === index ? { ...h, [field]: value } : h),
    }));
  }

  function removeHoliday(index: number) {
    setForm((p) => ({
      ...p,
      holidayRequests: p.holidayRequests.filter((_, i) => i !== index),
    }));
  }

  async function geocodeBasePostcode(pc: string) {
    const clean = pc.trim().replace(/\s+/g, "").toUpperCase();
    if (!clean) { setForm(p => ({ ...p, baseLat: null, baseLng: null })); setPostcodeGeoStatus("idle"); return; }
    setPostcodeGeoStatus("loading");
    try {
      const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
      const data = await res.json() as { result?: { latitude: number; longitude: number } };
      if (data.result) {
        setForm(p => ({ ...p, baseLat: data.result!.latitude, baseLng: data.result!.longitude }));
        setPostcodeGeoStatus("ok");
      } else {
        setForm(p => ({ ...p, baseLat: null, baseLng: null }));
        setPostcodeGeoStatus("error");
      }
    } catch { setPostcodeGeoStatus("error"); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const payload = {
      ...form,
      workPattern: form.workPattern || null,
      preferredShiftHours: form.preferredShiftHours === "" ? null : Number(form.preferredShiftHours),
      holidayAllowance: form.holidayAllowance === "" ? 28 : Number(form.holidayAllowance),
      holidayRequests: form.holidayRequests.filter((h) => h.startDate && h.endDate),
    };

    try {
      if (initial) {
        await driversApi.update(initial.id, payload);
        onSave();
      } else {
        const result = await driversApi.create(payload) as any;
        if (result.defaultPin) {
          setLoginDetails({ email: result.loginEmail, pin: result.defaultPin });
          return;
        }
        onSave();
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (loginDetails) return (
    <div>
      <div className="bg-green-50 border-2 border-green-500 rounded-xl p-5 mb-4">
        <div className="font-bold text-green-800 mb-3">📱 Driver Login Details — share with driver</div>
        <div className="bg-white rounded-lg p-4 font-mono text-sm space-y-2">
          <div><span className="font-bold">Email:</span> {loginDetails.email}</div>
          <div className="flex items-center gap-3">
            <span className="font-bold">PIN:</span>
            <span className="text-2xl font-black tracking-widest bg-yellow-100 px-3 py-1 rounded">{loginDetails.pin}</span>
          </div>
        </div>
        <p className="text-xs text-green-700 mt-3">⚠ Driver must change PIN on first login. Save these details now.</p>
      </div>
      <Button className="w-full" onClick={onSave}>Done →</Button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input label="Full Name *" value={form.displayName} onChange={set("displayName")} placeholder="John Smith" caseRule="proper_name" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Employee No." value={form.employeeNumber} onChange={set("employeeNumber")} placeholder="D001" />
        <Input label="Phone" value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="07700 000000" />
      </div>
      {!initial && (
        <Input label="Email (creates login)" type="email" value={form.email} onChange={set("email")} caseRule="lower"
          placeholder="driver@company.com" hint="Driver logs into mobile app with this email + PIN (default PIN: 123456 — must change on first login)" />
      )}

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Planner profile</h3>

        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold">
            Employment type
            <select className="input mt-1 w-full" value={form.driverType} onChange={set("driverType")}>
              <option value="permanent">Permanent</option>
              <option value="agency">Agency</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </label>

          <label className="block text-sm font-semibold">
            Work pattern
            <select className="input mt-1 w-full" value={form.workPattern} onChange={set("workPattern")}>
              <option value="">Not set</option>
              <option value="day_driver">Day driver</option>
              <option value="night_driver">Night driver</option>
              <option value="tramper">Tramper</option>
            </select>
          </label>

          <label className="block text-sm font-semibold">
            Licence class
            <select className="input mt-1 w-full" value={form.licenceClass} onChange={set("licenceClass")}>
              <option value="">Select...</option>
              {DRIVER_LICENCE_CLASSES.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold mb-2">Endorsements</div>
          <MultiCheck
            options={DRIVER_ENDORSEMENTS.map(e => [e.value, e.label] as [string, string])}
            value={form.endorsements}
            onChange={list => setForm(p => ({ ...p, endorsements: list }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Employment start date" type="date" value={form.employmentStartDate} onChange={set("employmentStartDate")} />
          <div className="text-xs rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
            Used to calculate permanent driver holiday increases after years worked. Agency/subcontractor drivers still use unavailable dates only.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <Input label="Preferred start" type="time" value={form.preferredStartTime} onChange={set("preferredStartTime")} />
          <Input label="Earliest start" type="time" value={form.earliestStartTime} onChange={set("earliestStartTime")} />
          <Input label="Latest finish" type="time" value={form.latestFinishTime} onChange={set("latestFinishTime")} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Preferred shift hours" type="number" value={form.preferredShiftHours} onChange={set("preferredShiftHours")} placeholder="9" />
          {form.driverType === "permanent" ? (
            <Input label="Paid holiday allowance days" type="number" value={form.holidayAllowance} onChange={set("holidayAllowance")} placeholder="28" />
          ) : (
            <div className="text-sm rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
              Agency/subcontractor drivers can still add unavailable holiday dates, but paid holiday allowance does not apply.
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold mb-2">Normal working days</div>
          <div className="flex flex-wrap gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <label key={day} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm">
                <input type="checkbox" checked={form.normalWorkingDays.includes(day)} onChange={() => toggleList("normalWorkingDays", day)} />
                {day}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.weekendAvailable} onChange={setBool("weekendAvailable")} /> Weekend available</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.nightWorkAllowed} onChange={setBool("nightWorkAllowed")} /> Night work allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.nightsOutAllowed} onChange={setBool("nightsOutAllowed")} /> Nights out allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.overtimeAllowed} onChange={setBool("overtimeAllowed")} /> Overtime allowed</label>
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Capabilities</h3>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.canUseTrailer} onChange={setBool("canUseTrailer")} /> Can use trailer</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.adrAllowed} onChange={setBool("adrAllowed")} /> ADR allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.hiabAllowed} onChange={setBool("hiabAllowed")} /> HIAB</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.moffettAllowed} onChange={setBool("moffettAllowed")} /> Moffett / forklift</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.manualHandlingAllowed} onChange={setBool("manualHandlingAllowed")} /> Manual handling</label>
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold mb-2">Trailer types allowed</div>
          <div className="flex flex-wrap gap-2">
            {BODY_TYPES.filter(t => (TRAILER_BODY_TYPE_VALUES as readonly string[]).includes(t.value)).map((type) => (
              <label key={type.value} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm">
                <input type="checkbox" checked={form.trailerTypesAllowed.includes(type.value)} onChange={() => toggleList("trailerTypesAllowed", type.value)} />
                {type.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Base / area</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input label="Base location" value={form.baseLocation} onChange={set("baseLocation")} placeholder="Depot / home base" caseRule="proper_name" />
          </div>
          <div>
            <Input
              label="Base postcode"
              value={form.basePostcode}
              onChange={e => { set("basePostcode")(e); setPostcodeGeoStatus("idle"); }}
              onBlur={() => geocodeBasePostcode(form.basePostcode)}
              placeholder="TS29 6PX"
              caseRule="upper"
              hint={
                postcodeGeoStatus === "loading" ? "Looking up…" :
                postcodeGeoStatus === "ok"      ? "✓ Location found" :
                postcodeGeoStatus === "error"   ? "Postcode not found" :
                "Used for route calculations"
              }
            />
          </div>
        </div>
        <Input label="Operating area" value={form.operatingArea} onChange={set("operatingArea")} placeholder="North West, Liverpool, Manchester..." caseRule="proper_name" />
        <Input label="Avoid areas" value={form.avoidAreas} onChange={set("avoidAreas")} placeholder="Areas to avoid if possible" />
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Unavailable / holiday dates</h3>
        {form.holidayRequests.map((holiday, index) => (
          <div key={index} className="border rounded-xl p-3 mb-3 bg-slate-50">
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="date" value={holiday.startDate} onChange={(e) => updateHoliday(index, "startDate", e.target.value)} />
              <Input label="To" type="date" value={holiday.endDate} onChange={(e) => updateHoliday(index, "endDate", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <label className="block text-sm font-semibold">
                Reason
                <select className="input mt-1 w-full" value={holiday.reason} onChange={(e) => updateHoliday(index, "reason", e.target.value)}>
                  <option value="holiday">Holiday</option>
                  <option value="sickness">Sickness</option>
                  <option value="training">Training</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Input label="Note" value={holiday.note} onChange={(e) => updateHoliday(index, "note", e.target.value)} placeholder="Optional" caseRule="sentence" />
            </div>
            <Button type="button" variant="outline" className="mt-2" onClick={() => removeHoliday(index)}>Remove date</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addHoliday}>+ Add unavailable dates</Button>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="font-bold text-primary mb-3">Planner notes</h3>
        <textarea className="input w-full min-h-[90px]" value={form.plannerNotes} onChange={set("plannerNotes")} placeholder="Anything planners need to know before assigning work..." />
      </div>

      <div className="flex gap-3 mt-5">
        <Button type="submit" loading={loading} className="flex-1">{initial ? "Save Changes" : "Add Driver →"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}
