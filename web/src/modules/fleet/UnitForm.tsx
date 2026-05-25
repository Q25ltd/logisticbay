import { useState } from "react";
import { fleetApi } from "../../api/fleet";
import type { FleetUnit } from "../../types";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { UNIT_STATUSES } from "./fleetConstants";
import { statusLabel } from "./fleetUtils";
import {
  BODY_CATEGORIES,
  BODY_TYPES,
  BODY_TYPES_BY_CATEGORY,
  GVW_CLASSES,
  equipmentForBodyType,
  gvwForCategory,
  type BodyCategory,
  type BodyType,
} from "../../constants/vehicleTaxonomy";
import { MultiCheck } from "../jobs/CreateJobFormComponents";

export default function UnitForm({ initial, onSave, onCancel }: {
  initial?: FleetUnit; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    registration: initial?.registration ?? "",
    vehicleClass:  initial?.vehicleClass  ?? "",
    bodyCategory:  initial?.bodyCategory   ?? "",
    gvwClass:      initial?.gvwClass       ?? "",
    bodyType:      initial?.bodyType       ?? "",
    onboardEquipment: Array.isArray(initial?.onboardEquipment) ? initial.onboardEquipment : [] as string[],
    status:        initial?.status        ?? "available",
    notes:         initial?.notes         ?? "",
    yardLocation:  initial?.yardLocation  ?? "",
    heightM:       initial?.heightM != null  ? String(initial.heightM)  : "",
    widthM:        initial?.widthM  != null  ? String(initial.widthM)   : "",
    lengthM:       initial?.lengthM != null  ? String(initial.lengthM)  : "",
    axleLoadT:     initial?.axleLoadT != null ? String(initial.axleLoadT) : "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const categoryGvwOptions = form.bodyCategory ? gvwForCategory(form.bodyCategory as BodyCategory) : [];
  const gvwOptions = categoryGvwOptions.length > 0 ? categoryGvwOptions : GVW_CLASSES;
  const bodyTypeValues = form.bodyCategory
    ? BODY_TYPES_BY_CATEGORY[form.bodyCategory as BodyCategory] ?? []
    : [];
  // bodyTypeValues === [] means this category has no body of its own (tractor, drawbar, heavy_haulage)
  const categoryHasBodyType = bodyTypeValues.length > 0;
  const bodyTypeOptions = BODY_TYPES.filter(t => bodyTypeValues.includes(t.value));
  const equipmentOptions = equipmentForBodyType(
    form.bodyType as BodyType | "",
    form.bodyCategory as BodyCategory | "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.bodyCategory) { setError("Body category is required"); return; }
    if (!form.gvwClass && categoryGvwOptions.length > 0) { setError("GVW class is required"); return; }
    setLoading(true);
    try {
      const payload = {
        registration: form.registration.trim(),
        vehicleClass:  form.vehicleClass || form.bodyCategory,
        bodyCategory:  form.bodyCategory,
        gvwClass:      form.gvwClass,
        bodyType:      form.bodyType,
        onboardEquipment: form.onboardEquipment,
        status:        form.status,
        notes:         form.notes.trim()        || undefined,
        yardLocation:  form.yardLocation.trim() || undefined,
        heightM:       form.heightM   ? parseFloat(form.heightM)   : null,
        widthM:        form.widthM    ? parseFloat(form.widthM)    : null,
        lengthM:       form.lengthM   ? parseFloat(form.lengthM)   : null,
        axleLoadT:     form.axleLoadT ? parseFloat(form.axleLoadT) : null,
      };
      if (initial) {
        await fleetApi.units.update(initial.id, payload);
      } else {
        await fleetApi.units.create(payload);
      }
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}
      <Input
        label="Registration / Unit Number *"
        value={form.registration}
        onChange={set("registration")}
        placeholder="e.g. AB12 CDE"
        caseRule="upper"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Body Category *
          <select className="input mt-1 w-full" value={form.bodyCategory} onChange={e => {
            const next = e.target.value;
            setForm(p => ({ ...p, bodyCategory: next, vehicleClass: next, gvwClass: "", bodyType: "", onboardEquipment: [] }));
          }} required>
            <option value="">Select category...</option>
            {BODY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Status
          <select className="input mt-1 w-full" value={form.status} onChange={set("status")}>
            {UNIT_STATUSES.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={`grid gap-3 mt-3 ${categoryHasBodyType ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="block text-sm font-semibold">
          GVW Class *
          <select className="input mt-1 w-full" value={form.gvwClass} onChange={set("gvwClass")} required>
            <option value="">Select GVW...</option>
            {gvwOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {categoryHasBodyType && (
          <label className="block text-sm font-semibold">
            Body Type
            <select className="input mt-1 w-full" value={form.bodyType} onChange={e => {
              setForm(p => ({ ...p, bodyType: e.target.value, onboardEquipment: [] }));
            }}>
              <option value="">None / not applicable</option>
              {bodyTypeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="mt-3">
        <div className="text-sm font-semibold mb-2">Onboard equipment</div>
        <MultiCheck
          options={equipmentOptions.map(e => [e.value, e.label] as [string, string])}
          value={form.onboardEquipment}
          onChange={list => setForm(p => ({ ...p, onboardEquipment: list }))}
        />
      </div>
      <Input
        label="Yard Location"
        value={form.yardLocation}
        onChange={set("yardLocation")}
        placeholder="Bay 3, North yard…"
        caseRule="proper_name"
      />

      {/* Vehicle dimensions — used for ORS HGV route restriction checks */}
      <div className="mt-4 mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        Vehicle dimensions (for route planning)
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Height (m)
          <input type="number" step="0.01" min="0" max="5" className="input mt-1 w-full"
            placeholder="e.g. 3.8" value={form.heightM} onChange={set("heightM")} />
        </label>
        <label className="block text-sm font-semibold">
          Width (m)
          <input type="number" step="0.01" min="0" max="3" className="input mt-1 w-full"
            placeholder="e.g. 2.55" value={form.widthM} onChange={set("widthM")} />
        </label>
        <label className="block text-sm font-semibold">
          Cab length (m)
          <input type="number" step="0.01" min="0" max="10" className="input mt-1 w-full"
            placeholder="e.g. 6.0" value={form.lengthM} onChange={set("lengthM")} />
        </label>
        <label className="block text-sm font-semibold">
          Max axle load (t)
          <input type="number" step="0.1" min="0" max="20" className="input mt-1 w-full"
            placeholder="e.g. 11.5" value={form.axleLoadT} onChange={set("axleLoadT")} />
        </label>
      </div>

      <label className="block text-sm font-semibold mt-3">
        Notes
        <textarea
          className="input w-full mt-1 min-h-[72px]"
          value={form.notes}
          onChange={set("notes")}
          placeholder="Any relevant notes for planners…"
        />
      </label>
      <div className="flex gap-3 mt-5">
        <Button type="submit" loading={loading} className="flex-1">
          {initial ? "Save Changes" : "Add Unit"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}
