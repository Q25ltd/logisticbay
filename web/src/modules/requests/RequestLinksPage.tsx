import { useState, useEffect } from "react";
import { jobRequestsApi, type RequestLink } from "../../api/jobRequests";

const APP_URL = window.location.origin;

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function RequestLinksPage() {
  const [links,       setLinks]       = useState<RequestLink[]>([]);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [copied,      setCopied]      = useState(false);

  useEffect(() => {
    jobRequestsApi.listLinks()
      .then(r => { setLinks(r.data); setCompanySlug(r.companySlug); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleCopy(url: string) {
    copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleActive(link: RequestLink) {
    try {
      const updated = await jobRequestsApi.updateLink(link.id, { isActive: !link.isActive });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, isActive: updated.isActive } : l));
    } catch { /* silent */ }
  }

  async function handleRegenerate(link: RequestLink) {
    if (!window.confirm(`Regenerate the security token for "${link.name}"?\n\nAny existing token-based URLs will immediately stop working. The company slug URL (/${companySlug}) is unaffected.`)) return;
    try {
      const updated = await jobRequestsApi.regenerateLink(link.id);
      setLinks(prev => prev.map(l => l.id === link.id ? updated : l));
    } catch { /* silent */ }
  }

  const mainLink = links.find(l => l.isMain);
  const slugUrl  = companySlug ? `${APP_URL}/request/${companySlug}` : null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>Intake Link</h1>
        <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
          Your company's shareable link for customers to submit transport requests. Each submission creates a job in your review queue.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted py-8 text-center">Loading…</div>
      ) : mainLink ? (
        <>
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold" style={{ color: "#1e1b4b" }}>Company intake link</span>
                  <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " +
                    (mainLink.isActive ? "bg-indigo-200 text-indigo-800" : "bg-gray-200 text-gray-500")}>
                    {mainLink.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#4338ca" }}>
                  Add this to your website, social media, or email signature so any customer can request a job directly.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  className="btn btn-secondary text-xs px-3 py-1.5"
                  onClick={() => toggleActive(mainLink)}
                >
                  {mainLink.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="btn btn-secondary text-xs px-3 py-1.5"
                  onClick={() => handleRegenerate(mainLink)}
                >
                  Regenerate token
                </button>
              </div>
            </div>

            {slugUrl ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  className="input font-mono text-sm bg-white flex-1"
                  value={slugUrl}
                />
                <button
                  className={"btn text-sm shrink-0 " + (copied ? "btn-primary" : "btn-secondary")}
                  onClick={() => handleCopy(slugUrl)}
                >
                  {copied ? "✓ Copied" : "Copy link"}
                </button>
              </div>
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                No company slug set — contact support to get your company URL configured.
              </div>
            )}

            <div className="text-xs" style={{ color: "#6366f1" }}>
              {mainLink.usageCount} submission{mainLink.usageCount !== 1 ? "s" : ""}
              {mainLink.lastUsedAt && <span> · Last used {new Date(mainLink.lastUsedAt).toLocaleDateString()}</span>}
            </div>
          </div>

          <div className="text-xs p-4 rounded-xl bg-blue-50 border border-blue-100" style={{ color: "#374151" }}>
            <strong>How it works:</strong> Customers open your link and fill in a transport request form. Each submission lands in your review queue — you accept or reject it before it enters planning. Deactivate to stop new submissions without losing your URL. Use "Regenerate token" only if a raw token URL has been exposed — your company slug URL is permanent and unaffected.
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <div className="font-semibold" style={{ color: "#0f172a" }}>No intake link found</div>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            Your company link will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
