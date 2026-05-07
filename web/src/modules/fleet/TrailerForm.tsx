import { useState } from "react";
import { fleetApi } from "../../api/fleet";
import type { FleetTrailer } from "../../types";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { TRAILER_TYPES, TRAILER_STATUSES } from "./fleetConstants";
import { statusLabel } from "./fleetUtils";

export default function TrailerForm({ initial, onSave, onCancel }: {
  initial?: FleetTrailer; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    registration: initial?.registration ?? "",
    trailerType:   initial?.trailerType   ?? "",
    status:        initial?.status        ?? "available",
    notes:         initial?.notes         ?? "",
    yardLocation:  initial?.yardLocation  ?? "",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        registration: form.registration.trim(),
        trailerType:   form.trailerType,
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
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Trailer Type *
          <select className="input mt-1 w-full" value={form.trailerType} onChange={set("trailerType")} required>
            <option value="">Select type…</option>
            {TRAILER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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
      <Input
        label="Yard Location"
        value={form.yardLocation}
        onChange={set("yardLocation")}
        placeholder="Bay 7, South yard…"
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
