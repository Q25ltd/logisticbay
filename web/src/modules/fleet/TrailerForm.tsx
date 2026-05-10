import { useState } from "react";
import { fleetApi } from "../../api/fleet";
import type { FleetTrailer } from "../../types";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { TRAILER_STATUSES } from "./fleetConstants";
import { statusLabel } from "./fleetUtils";
import {
  BODY_TYPES,
  TRAILER_BODY_TYPE_VALUES,
  TRAILER_LENGTHS,
  equipmentForTrailerType,
  type BodyType,
} from "../../constants/vehicleTaxonomy";
import { MultiCheck } from "../jobs/CreateJobFormComponents";

export default function TrailerForm({ initial, onSave, onCancel }: {
  initial?: FleetTrailer; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    registration: initial?.registration ?? "",
    trailerType:   initial?.trailerType   ?? "",
    bodyType:      initial?.bodyType       ?? "",
    trailerLength: initial?.trailerLength  ?? "",
    decks:         initial?.decks == null ? "1" : String(initial.decks),
    compartments:  initial?.compartments == null ? "" : String(initial.compartments),
    onboardEquipment: Array.isArray(initial?.onboardEquipment) ? initial.onboardEquipment : [] as string[],
    status:        initial?.status        ?? "available",
    notes:         initial?.notes         ?? "",
    yardLocation:  initial?.yardLocation  ?? "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const trailerBodyTypes = BODY_TYPES.filter(t => TRAILER_BODY_TYPE_VALUES.includes(t.value as BodyType));
  const equipmentOptions = equipmentForTrailerType(form.bodyType as BodyType | "");
  const showDecks = ["double_deck_curtain", "double_deck_box", "car_transporter", "livestock", "fridge_multi_temp"].includes(form.bodyType);
  const showCompartments = form.bodyType.startsWith("tanker") || form.bodyType.includes("_tanker");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        registration: form.registration.trim(),
        trailerType:   form.trailerType || form.bodyType,
        bodyType:      form.bodyType,
        trailerLength: form.trailerLength,
        decks:         Number(form.decks || 1),
        compartments:  form.compartments === "" ? null : Number(form.compartments),
        onboardEquipment: form.onboardEquipment,
        status:        form.status,
        notes:         form.notes.trim()        || undefined,
        yardLocation:  form.yardLocation.trim() || undefined,
      };
      if (initial) {
        await fleetApi.trailers.update(initial.id, payload);
      } else {
        await fleetApi.trailers.create(payload);
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
        label="Registration / Trailer Number *"
        value={form.registration}
        onChange={set("registration")}
        placeholder="e.g. TR-001 or XY63 FGH"
        caseRule="upper"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Trailer Body Type *
          <select className="input mt-1 w-full" value={form.bodyType} onChange={e => {
            const next = e.target.value;
            setForm(p => ({ ...p, bodyType: next, trailerType: next, onboardEquipment: [] }));
          }} required>
            <option value="">Select body type...</option>
            {trailerBodyTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Status
          <select className="input mt-1 w-full" value={form.status} onChange={set("status")}>
            {TRAILER_STATUSES.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={`grid gap-3 mt-3 ${showDecks ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="block text-sm font-semibold">
          Trailer Length
          <select className="input mt-1 w-full" value={form.trailerLength} onChange={set("trailerLength")}>
            <option value="">No length set</option>
            {TRAILER_LENGTHS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        {showDecks && (
          <label className="block text-sm font-semibold">
            Decks
            <select className="input mt-1 w-full" value={form.decks} onChange={set("decks")}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
        )}
      </div>
      {showCompartments && (
        <Input
          label="Compartments"
          type="number"
          value={form.compartments}
          onChange={set("compartments")}
          placeholder="e.g. 3"
        />
      )}
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
        placeholder="Bay 7, South yard…"
        caseRule="proper_name"
      />
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
          {initial ? "Save Changes" : "Add Trailer"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}
