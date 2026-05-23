/**
 * Paste an email, WhatsApp message, or phone note — Claude extracts structured
 * job data and pre-fills the form below.
 *
 * Props:
 *   onParsed — receives extracted data; parent maps it into form state
 */

import { useState } from "react";
import { aiApi, type ParsedJobData } from "../../api/ai";

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  low:    "bg-red-100 text-red-700",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  high:   "High confidence",
  medium: "Review carefully",
  low:    "Low confidence — many fields may be wrong",
};

interface Props {
  onParsed: (data: ParsedJobData) => void;
}

export default function ParseRequestPanel({ onParsed }: Props) {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");
  const [result,  setResult]  = useState<ParsedJobData | null>(null);

  async function handleParse() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await aiApi.parseRequest(text.trim());
      setResult(data);
      onParsed(data);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("AI_AUTH_ERROR") || msg.includes("invalid api key") || msg.includes("authentication")) {
        setError("AI service is misconfigured — please contact your administrator.");
      } else if (msg.includes("AI_UNAVAILABLE")) {
        setError("AI features are not enabled on this server.");
      } else {
        setError(msg || "Parse failed — please try again");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    setText("");
    setResult(null);
    setError("");
  }

  return (
    <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <span className="font-semibold text-indigo-800 text-sm">
            Fill from email or message
          </span>
          <span className="text-xs text-indigo-500 font-normal hidden sm:inline">
            — paste any text, AI extracts the details
          </span>
        </div>
        <span className="text-indigo-400 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-indigo-200 px-5 pb-5 pt-4 space-y-3">
          <textarea
            className="w-full border border-indigo-200 rounded-xl p-3 text-sm leading-relaxed
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white resize-none"
            rows={6}
            placeholder={`Paste an email, WhatsApp message or phone note here.\n\nExample:\n"Hi, need collection from our Kidderminster depot Thursday morning, 26 pallets kitchen units approx 8 tonnes, delivery to Leeds LS12 before 2pm. Contact on site John Smith 07700 900123."`}
            value={text}
            onChange={e => { setText(e.target.value); setError(""); setResult(null); }}
            disabled={busy}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleParse}
              disabled={!text.trim() || busy}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl
                         hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors flex items-center gap-2"
            >
              {busy ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white
                                   border-t-transparent rounded-full" />
                  Parsing…
                </>
              ) : "Extract job details"}
            </button>
            {(text || result) && (
              <button
                type="button"
                onClick={handleClear}
                disabled={busy}
                className="px-4 py-2 text-sm text-indigo-600 hover:text-indigo-800
                           rounded-xl border border-indigo-200 hover:border-indigo-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
              {error}
            </div>
          )}

          {result && !error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span className="text-sm font-semibold text-green-800">
                  Form filled — review every section below before saving
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_BADGE[result.confidence]}`}>
                  {CONFIDENCE_LABEL[result.confidence]}
                </span>
              </div>

              {result.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-amber-800">Things to check:</p>
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">• {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
