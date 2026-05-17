import { useState } from "react";
import { jobsApi } from "../../api/jobs";
import { Alert } from "../../components/Alert";
import type { JobContext } from "./dashboardTypes";
import {
  dateTimeInput,
  fromDateTimeInput,
  isSameStop,
  shortLocation,
  sortedStops,
} from "./dashboardUtils";

export default function QuickFixDrawer({
  context,
  onClose,
  onSaved,
}: {
  context: JobContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fixable = context.warnings.filter((warning) => warning.fix);
  const [selectedType, setSelectedType] = useState(fixable[0]?.type ?? "");
  const selectedWarning = fixable.find((warning) => warning.type === selectedType) ?? fixable[0];
  const selectedStop = sortedStops(context.job).find((stop) => isSameStop(stop, selectedWarning?.fix?.stopKey));
  const [value, setValue] = useState(() => {
    if (!selectedWarning?.fix) return "";
    if (selectedWarning.fix.kind === "stop_time") return dateTimeInput(selectedStop?.timeWindowStart ?? selectedStop?.bookedTime ?? null);
    if (selectedWarning.fix.kind === "return_instruction") return context.job.alternativeReturnAddress ?? "";
    if (selectedWarning.fix.kind === "stop_reference") return selectedStop?.referenceNumber ?? "";
    return selectedStop?.contactPhone ?? "";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changeIssue(type: string) {
    const nextWarning = fixable.find((warning) => warning.type === type) ?? fixable[0];
    const nextStop = sortedStops(context.job).find((stop) => isSameStop(stop, nextWarning?.fix?.stopKey));
    setSelectedType(type);
    if (!nextWarning?.fix) setValue("");
    else if (nextWarning.fix.kind === "stop_time") setValue(dateTimeInput(nextStop?.timeWindowStart ?? nextStop?.bookedTime ?? null));
    else if (nextWarning.fix.kind === "return_instruction") setValue(context.job.alternativeReturnAddress ?? "");
    else if (nextWarning.fix.kind === "stop_reference") setValue(nextStop?.referenceNumber ?? "");
    else setValue(nextStop?.contactPhone ?? "");
  }

  async function save() {
    if (!selectedWarning?.fix) return;
    setSaving(true);
    setError("");
    try {
      if (selectedWarning.fix.kind === "return_instruction") {
        await jobsApi.update(context.job.id, {
          alternativeReturnAddress: value,
          saveMode: "draft",
        });
      } else {
        const stops = sortedStops(context.job).map((stop) => {
          if (!isSameStop(stop, selectedWarning.fix?.stopKey)) return stop;
          if (selectedWarning.fix?.kind === "stop_phone") return { ...stop, contactPhone: value.trim() };
          if (selectedWarning.fix?.kind === "stop_reference") return { ...stop, referenceNumber: value.trim() };
          return {
            ...stop,
            timeWindowStart: fromDateTimeInput(value),
            timeWindowEnd: stop.timeWindowEnd ?? fromDateTimeInput(value),
          };
        });
        await jobsApi.update(context.job.id, { stops, saveMode: "draft" });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save quick fix");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-primary">Quick fix</h2>
              <p className="mt-1 text-sm text-muted">{context.route}</p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-outline px-3 py-1.5 text-xs">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <Alert type="error" message={error} />}

          {fixable.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-muted">
              No small quick-fix fields are available for this job. Use full job editing when that route is available.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label">Issue</label>
                <select className="input" value={selectedType} onChange={(event) => changeIssue(event.target.value)}>
                  {fixable.map((warning) => (
                    <option key={warning.type} value={warning.type}>{warning.message}</option>
                  ))}
                </select>
              </div>

              {selectedStop && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-muted">
                  Stop {selectedStop.sequenceNumber}: {shortLocation(selectedStop, selectedStop.locationTextSnapshot)}
                </div>
              )}

              {selectedWarning?.fix?.kind === "return_instruction" ? (
                <div>
                  <label className="label">Return instruction</label>
                  <select className="input" value={value} onChange={(event) => setValue(event.target.value)}>
                    <option value="">Select return instruction</option>
                    <option value="depot">Return to depot</option>
                    <option value="collection">Return to collection point</option>
                    <option value="alternative">Return to alternative address</option>
                  </select>
                </div>
              ) : selectedWarning?.fix?.kind === "stop_time" ? (
                <div>
                  <label className="label">Stop time</label>
                  <input className="input" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="label">{selectedWarning?.fix?.kind === "stop_reference" ? "Stop reference" : "Contact phone"}</label>
                  <input className="input" value={value} onChange={(event) => setValue(event.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border p-5">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
            <button type="button" disabled={!fixable.length || saving || !value.trim()} onClick={save} className="btn btn-primary">
              {saving ? "Saving..." : "Save fix"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
