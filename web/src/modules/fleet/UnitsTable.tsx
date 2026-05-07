import type { FleetUnit } from "../../types";
import { Button } from "../../components/Button";
import { statusBadgeClass, statusLabel } from "./fleetUtils";

export default function UnitsTable({ units, allEmpty, onEdit, onDelete, onAddFirst }: {
  units: FleetUnit[];
  allEmpty: boolean;
  onEdit: (u: FleetUnit) => void;
  onDelete: (u: FleetUnit) => void;
  onAddFirst: () => void;
}) {
  if (units.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🚛</div>
        <div className="font-bold text-primary mb-1">{allEmpty ? "No units yet" : "No units match"}</div>
        <div className="text-sm text-muted mb-4">{allEmpty ? "Add your first unit to get started" : "Try a different status filter"}</div>
        {allEmpty && <Button onClick={onAddFirst}>Add First Unit</Button>}
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-4 py-3 font-bold text-primary">Registration</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Class</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Status</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Yard Location</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {units.map((unit, i) => (
              <tr key={unit.id} className={"border-b border-border last:border-0 " + (i % 2 === 1 ? "bg-slate-50/50" : "")}>
                <td className="px-4 py-3 font-bold text-primary">{unit.registration}</td>
                <td className="px-4 py-3 text-muted">{unit.vehicleClass}</td>
                <td className="px-4 py-3">
                  <span className={statusBadgeClass(unit.status)}>{statusLabel(unit.status)}</span>
                </td>
                <td className="px-4 py-3 text-muted">{unit.yardLocation || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-muted max-w-[200px] truncate">{unit.notes || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(unit)} className="text-xs text-accent hover:underline font-semibold mr-3">Edit</button>
                  <button onClick={() => onDelete(unit)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {units.map(unit => (
          <div key={unit.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-primary">{unit.registration}</span>
                  <span className={statusBadgeClass(unit.status)}>{statusLabel(unit.status)}</span>
                </div>
                <div className="text-sm text-muted">{unit.vehicleClass}</div>
                {unit.yardLocation && <div className="text-xs text-muted mt-1">Yard: {unit.yardLocation}</div>}
                {unit.notes && <div className="text-xs text-muted mt-1 line-clamp-2">{unit.notes}</div>}
              </div>
              <div className="flex flex-col gap-2 ml-4 text-right">
                <button onClick={() => onEdit(unit)} className="text-xs text-accent hover:underline font-semibold min-h-[44px] flex items-center justify-end">Edit</button>
                <button onClick={() => onDelete(unit)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
