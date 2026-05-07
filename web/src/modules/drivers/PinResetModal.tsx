import { Button } from "../../components/Button";

export default function PinResetModal({ details, onClose }: { details: { email: string; pin: string; name: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-bold text-primary text-lg mb-4">PIN Reset — {details.name}</h3>
        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-4 mb-4">
          <div className="font-mono text-sm space-y-2">
            <div><span className="font-bold">Email:</span> {details.email}</div>
            <div className="flex items-center gap-3">
              <span className="font-bold">New PIN:</span>
              <span className="text-2xl font-black tracking-widest bg-yellow-100 px-3 py-1 rounded">{details.pin}</span>
            </div>
          </div>
          <p className="text-xs text-green-700 mt-3">Driver must change PIN on next login.</p>
        </div>
        <Button className="w-full" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
