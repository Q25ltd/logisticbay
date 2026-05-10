import type { FleetTrailer } from "../../types";
import { Button } from "../../components/Button";
import { statusBadgeClass, statusLabel } from "./fleetUtils";
import { BODY_TYPES } from "../../constants/vehicleTaxonomy";

function trailerSpec(trailer: FleetTrailer) {
  return BODY_TYPES.find(t => t.value === trailer.bodyType)?.label ?? trailer.bodyType ?? trailer.trailerType;
}

export default function TrailersTable({ trailers, allEmpty, onEdit, onDelete, onAddFirst }: {
  trailers: FleetTrailer[];
  allEmpty: boolean;
  onEdit: (t: FleetTrailer) => void;
  onDelete: (t: FleetTrailer) => void;
  onAddFirst: () => void;
}) {
  if (trailers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🚛</div>
        <div className="font-bold text-primary mb-1">{allEmpty ? "No trailers yet" : "No trailers match"}</div>
        <div className="text-sm text-muted mb-4">{allEmpty ? "Add your first trailer to get started" : "Try a different status filter"}</div>
        {allEmpty && <Button onClick={onAddFirst}>Add First Trailer</Button>}
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
              <th className="text-left px-4 py-3 font-bold text-primary">Type</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Status</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Yard Location</th>
              <th className="text-left px-4 py-3 font-bold text-primary">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {trailers.map((trailer, i) => (
              <tr key={trailer.id} className={"border-b border-border last:border-0 " + (i % 2 === 1 ? "bg-slate-50/50" : "")}>
                <td className="px-4 py-3 font-bold text-primary">{trailer.registration}</td>
                <td className="px-4 py-3 text-muted">{trailerSpec(trailer)}</td>
                <td className="px-4 py-3">
                  <span className={statusBadgeClass(trailer.status)}>{statusLabel(trailer.status)}</span>
                </td>
                <td className="px-4 py-3 text-muted">{trailer.yardLocation || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-muted max-w-[200px] truncate">{trailer.notes || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(trailer)} className="text-xs text-accent hover:underline font-semibold mr-3">Edit</button>
                  <button onClick={() => onDelete(trailer)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {trailers.map(trailer => (
          <div key={trailer.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-primary">{trailer.registration}</span>
                  <span className={statusBadgeClass(trailer.status)}>{statusLabel(trailer.status)}</span>
                </div>
                <div className="text-sm text-muted">{trailerSpec(trailer)}</div>
                {trailer.yardLocation && <div className="text-xs text-muted mt-1">Yard: {trailer.yardLocation}</div>}
                {trailer.notes && <div className="text-xs text-muted mt-1 line-clamp-2">{trailer.notes}</div>}
              </div>
              <div className="flex flex-col gap-2 ml-4 text-right">
                <button onClick={() => onEdit(trailer)} className="text-xs text-accent hover:underline font-semibold min-h-[44px] flex items-center justify-end">Edit</button>
                <button onClick={() => onDelete(trailer)} className="text-xs text-red-500 hover:underline font-semibold">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
