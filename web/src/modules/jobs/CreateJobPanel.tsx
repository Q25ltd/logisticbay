import { useState } from "react";
import { jobsApi } from "../../api/jobs";
import type { Driver, JobTemplate } from "../../types";
import { Alert } from "../../components/Alert";

const TRAILER_TYPES = [
  ["curtain_sider", "Curtain sider"],
  ["box", "Box"],
  ["fridge", "Fridge"],
  ["flatbed", "Flatbed"],
  ["low_loader", "Low loader"],
  ["tanker", "Tanker"],
  ["walking_floor", "Walking floor"],
  ["tipper", "Tipper"],
  ["container", "Container"],
  ["other", "Other"],
] as const;

const STOP_TYPES = [
  ["pickup", "Pickup"],
  ["dropoff", "Dropoff"],
  ["handover", "Handover"],
  ["yard", "Yard"],
  ["depot", "Depot"],
] as const;

function emptyStop(sequenceNumber: number, type: "pickup" | "dropoff" | "handover" | "yard" | "depot") {
  return {
    sequenceNumber,
    type,
    locationTextSnapshot: "",
    contactName: "",
    contactPhone: "",
    referenceNumber: "",
    instructions: "",
    timeWindowStart: "",
    timeWindowEnd: "",
  };
}

export function CreateJobPanel({ drivers, templates, date, initialDriverId, onClose, onCreated }: {
  drivers: Driver[]; templates: JobTemplate[]; date: string; initialDriverId?: number;
  onClose: () => void; onCreated: () => void;
}) {
  const [f, setF] = useState({
    assignedDriverId: initialDriverId ? String(initialDriverId) : "",
    plannedDate: date,
    templateId: "",
    referenceNumber: "",
    plannerNotes: "",
    vehicleClassRequired: "class1",
    serviceType: "general_haulage",
    internalNotes: "",
    priority: "",
    saveAsTemplate: false,
    templateName: "",
  });

  const [trailerTypesAllowed, setTrailerTypesAllowed] = useState<string[]>(["curtain_sider"]);
  const [stops, setStops] = useState([
    emptyStop(1, "pickup"),
    emptyStop(2, "dropoff"),
  ]);
  const [loadDetails, setLoadDetails] = useState({
    quantity: "",
    unit: "pallets",
    materialType: "",
    weight: "",
    volume: "",
    hazardClass: "",
    notes: "",
  });

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  function resequence(nextStops: typeof stops) {
    return nextStops.map((s, index) => ({ ...s, sequenceNumber: index + 1 }));
  }

  function updateStop(index: number, patch: Partial<typeof stops[number]>) {
    setStops(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  function addStop(type: "pickup" | "dropoff" | "handover" | "yard" | "depot") {
    setStops(prev => [...prev, emptyStop(prev.length + 1, type)]);
  }

  function removeStop(index: number) {
    setStops(prev => resequence(prev.filter((_, i) => i !== index)));
  }

  function moveStop(index: number, dir: -1 | 1) {
    setStops(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return resequence(next);
    });
  }

  function toggleTrailerType(value: string) {
    setTrailerTypesAllowed(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }

  function applyTpl(id: string) {
    const t = templates.find(t => String(t.id) === id);
    setF(p => ({ ...p, templateId: id }));
    if (!t) return;

    if (Array.isArray(t.defaultStops) && t.defaultStops.length > 0) {
      setStops(t.defaultStops.map((s, index) => ({
        sequenceNumber: index + 1,
        type: s.type,
        locationTextSnapshot: s.locationTextSnapshot || "",
        contactName: s.contactName || "",
        contactPhone: s.contactPhone || "",
        referenceNumber: s.referenceNumber || "",
        instructions: s.instructions || "",
        timeWindowStart: s.timeWindowStart || "",
        timeWindowEnd: s.timeWindowEnd || "",
      })));
    } else {
      setStops([
        { ...emptyStop(1, "pickup"), locationTextSnapshot: t.pickupTextSnapshot || "" },
        { ...emptyStop(2, "dropoff"), locationTextSnapshot: t.dropoffTextSnapshot || "" },
      ]);
    }

    if (t.defaultLoadDetails) {
      setLoadDetails(p => ({
        ...p,
        quantity: String(t.defaultLoadDetails?.quantity ?? ""),
        unit: t.defaultLoadDetails?.unit || p.unit,
        materialType: t.defaultLoadDetails?.materialType || t.defaultMaterialType || p.materialType,
        weight: String(t.defaultLoadDetails?.weight ?? ""),
        volume: String(t.defaultLoadDetails?.volume ?? ""),
        hazardClass: t.defaultLoadDetails?.hazardClass || "",
        notes: t.defaultLoadDetails?.notes || "",
      }));
    } else {
      setLoadDetails(p => ({ ...p, materialType: t.defaultMaterialType || p.materialType }));
    }

    setTrailerTypesAllowed(Array.isArray(t.trailerTypesAllowed) && t.trailerTypesAllowed.length > 0 ? t.trailerTypesAllowed : trailerTypesAllowed);
    setF(p => ({
      ...p,
      templateId: id,
      referenceNumber: t.defaultReference || p.referenceNumber,
      plannerNotes: t.defaultNotes || p.plannerNotes,
    }));
  }

  async function submit(e: React.FormEvent, saveMode: "draft" | "ready_to_plan") {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      const cleanedStops = stops
        .map((s, index) => ({
          ...s,
          sequenceNumber: index + 1,
          locationTextSnapshot: s.locationTextSnapshot.trim(),
          contactName: s.contactName.trim(),
          contactPhone: s.contactPhone.trim(),
          referenceNumber: s.referenceNumber.trim(),
          instructions: s.instructions.trim(),
          timeWindowStart: s.timeWindowStart || null,
          timeWindowEnd: s.timeWindowEnd || null,
        }))
        .filter(s => saveMode === "ready_to_plan" || s.locationTextSnapshot || s.type);

      await jobsApi.create({
        templateId: f.templateId ? parseInt(f.templateId) : null,
        assignedDriverId: f.assignedDriverId ? parseInt(f.assignedDriverId) : undefined,
        plannedDate: f.plannedDate || undefined,
        referenceNumber: f.referenceNumber,
        plannerNotes: f.plannerNotes,
        vehicleClassRequired: f.vehicleClassRequired,
        trailerTypesAllowed,
        serviceType: f.serviceType,
        internalNotes: f.internalNotes,
        priority: f.priority ? parseInt(f.priority) : undefined,
        stops: cleanedStops,
        loadDetails: {
          quantity: loadDetails.quantity || null,
          unit: loadDetails.unit,
          materialType: loadDetails.materialType,
          weight: loadDetails.weight || null,
          volume: loadDetails.volume || null,
          hazardClass: loadDetails.hazardClass,
          notes: loadDetails.notes,
        },
        saveMode,
        saveAsTemplate: f.saveAsTemplate,
        templateName: f.templateName,
      });

      onCreated();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-primary">Create Job</h2>
            <p className="text-xs text-muted">Structured stops, load details, and vehicle requirements</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl">✕</button>
        </div>

        <form className="p-6 space-y-6">
          {err && <Alert type="error" message={err} />}

          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Template</label>
              <select className="input" value={f.templateId} onChange={e=>applyTpl(e.target.value)}>
                <option value="">— Manual —</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div><label className="label">Planned date</label>
              <input className="input" type="date" value={f.plannedDate} onChange={e=>setF(p=>({...p,plannedDate:e.target.value}))}/></div>
            <div><label className="label">Assign driver later or now</label>
              <select className="input" value={f.assignedDriverId} onChange={e=>setF(p=>({...p,assignedDriverId:e.target.value}))}>
                <option value="">Unassigned</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select></div>
            <div><label className="label">Vehicle class required</label>
              <select className="input" value={f.vehicleClassRequired} onChange={e=>setF(p=>({...p,vehicleClassRequired:e.target.value}))}>
                <option value="class1">Class 1 / Artic</option>
                <option value="class2">Class 2 / Rigid</option>
                <option value="van">Van</option>
              </select></div>
          </section>

          {f.vehicleClassRequired === "class1" && (
            <section>
              <label className="label">Allowed trailer types</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {TRAILER_TYPES.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm border border-border rounded-xl px-3 py-2">
                    <input type="checkbox" checked={trailerTypesAllowed.includes(value)} onChange={() => toggleTrailerType(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-primary">Stops</h3>
                <p className="text-xs text-muted">Pickup/dropoff order is execution order.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {STOP_TYPES.map(([value, label]) => (
                  <button key={value} type="button" className="btn btn-outline text-xs" onClick={() => addStop(value)}>
                    + {label}
                  </button>
                ))}
              </div>
            </div>

            {stops.map((stop, index) => (
              <div key={index} className="border border-border rounded-2xl p-4 space-y-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted">#{index + 1}</span>
                  <select className="input" value={stop.type} onChange={e=>updateStop(index, { type: e.target.value as any })}>
                    {STOP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline text-xs" onClick={() => moveStop(index, -1)}>↑</button>
                  <button type="button" className="btn btn-outline text-xs" onClick={() => moveStop(index, 1)}>↓</button>
                  <button type="button" className="btn btn-outline text-xs text-red-600" onClick={() => removeStop(index)}>Remove</button>
                </div>

                <div><label className="label">Address / location *</label>
                  <input className="input" value={stop.locationTextSnapshot} onChange={e=>updateStop(index, { locationTextSnapshot:e.target.value })} placeholder="Customer site, depot, yard, postcode..." /></div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="label">Contact name</label>
                    <input className="input" value={stop.contactName} onChange={e=>updateStop(index, { contactName:e.target.value })}/></div>
                  <div><label className="label">Contact phone</label>
                    <input className="input" value={stop.contactPhone} onChange={e=>updateStop(index, { contactPhone:e.target.value })}/></div>
                  <div><label className="label">Reference</label>
                    <input className="input" value={stop.referenceNumber} onChange={e=>updateStop(index, { referenceNumber:e.target.value })}/></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label">Window start</label>
                      <input className="input" type="datetime-local" value={stop.timeWindowStart} onChange={e=>updateStop(index, { timeWindowStart:e.target.value })}/></div>
                    <div><label className="label">Window end</label>
                      <input className="input" type="datetime-local" value={stop.timeWindowEnd} onChange={e=>updateStop(index, { timeWindowEnd:e.target.value })}/></div>
                  </div>
                </div>

                <div><label className="label">Instructions</label>
                  <textarea className="input min-h-16" value={stop.instructions} onChange={e=>updateStop(index, { instructions:e.target.value })} placeholder="Gate, loading notes, PPE, call ahead..." /></div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Quantity</label>
              <input className="input" value={loadDetails.quantity} onChange={e=>setLoadDetails(p=>({...p,quantity:e.target.value}))}/></div>
            <div><label className="label">Unit</label>
              <select className="input" value={loadDetails.unit} onChange={e=>setLoadDetails(p=>({...p,unit:e.target.value}))}>
                <option value="pallets">Pallets</option>
                <option value="kg">kg</option>
                <option value="tonnes">Tonnes</option>
                <option value="loads">Loads</option>
                <option value="items">Items</option>
                <option value="other">Other</option>
              </select></div>
            <div><label className="label">Material</label>
              <input className="input" value={loadDetails.materialType} onChange={e=>setLoadDetails(p=>({...p,materialType:e.target.value}))}/></div>
            <div><label className="label">Hazard class</label>
              <input className="input" value={loadDetails.hazardClass} onChange={e=>setLoadDetails(p=>({...p,hazardClass:e.target.value}))}/></div>
            <div><label className="label">Weight</label>
              <input className="input" value={loadDetails.weight} onChange={e=>setLoadDetails(p=>({...p,weight:e.target.value}))}/></div>
            <div><label className="label">Volume</label>
              <input className="input" value={loadDetails.volume} onChange={e=>setLoadDetails(p=>({...p,volume:e.target.value}))}/></div>
          </section>

          <section className="space-y-3">
            <div><label className="label">Reference</label>
              <input className="input" value={f.referenceNumber} onChange={e=>setF(p=>({...p,referenceNumber:e.target.value}))}/></div>
            <div><label className="label">Planner notes</label>
              <textarea className="input min-h-16" value={f.plannerNotes} onChange={e=>setF(p=>({...p,plannerNotes:e.target.value}))}/></div>
            <div><label className="label">Internal notes</label>
              <textarea className="input min-h-16" value={f.internalNotes} onChange={e=>setF(p=>({...p,internalNotes:e.target.value}))}/></div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.saveAsTemplate} onChange={e=>setF(p=>({...p,saveAsTemplate:e.target.checked}))}/>
              Save as template
            </label>
            {f.saveAsTemplate && (
              <input className="input" value={f.templateName} onChange={e=>setF(p=>({...p,templateName:e.target.value}))} placeholder="Template name"/>
            )}
          </section>

          <div className="sticky bottom-0 bg-white border-t border-border py-4 flex gap-3">
            <button type="button" disabled={loading} onClick={(e) => submit(e, "draft")} className="btn btn-outline flex-1">
              {loading ? "Saving..." : "Save Draft"}
            </button>
            <button type="button" disabled={loading} onClick={(e) => submit(e, "ready_to_plan")} className="btn btn-primary flex-1">
              {loading ? "Saving..." : "Mark Ready to Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
