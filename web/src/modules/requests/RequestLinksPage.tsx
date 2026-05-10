/**
 * Manage permanent reusable intake links.
 * Each link gets a unique URL that customers can use to submit transport requests.
 * Links can be linked to a customer account, named, and deactivated.
 */

import { useState, useEffect } from "react";
import { jobRequestsApi, type RequestLink } from "../../api/jobRequests";
import { driversApi } from "../../api/drivers";
import { api } from "../../api/client";
import type { Customer } from "../../types";

const APP_URL = window.location.origin;

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function RequestLinksPage() {
  const [links,     setLinks]     = useState<RequestLink[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);

  // New link form
  const [newName,       setNewName]       = useState("");
  const [newCustomerId, setNewCustomerId] = useState<number | "">("");
  const [saving,        setSaving]        = useState(false);
  const [saveErr,       setSaveErr]       = useState("");
  const [newLink,       setNewLink]       = useState<RequestLink | null>(null); // shown once after creation

  useEffect(() => {
    Promise.all([
      jobRequestsApi.listLinks(),
      api.get<{ data: Customer[] }>("/customers"),
    ]).then(([lr, cr]) => {
      setLinks(lr.data);
      setCustomers(cr.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) { setSaveErr("Link name is required"); return; }
    setSaveErr(""); setSaving(true);
    try {
      const link = await jobRequestsApi.createLink({
        name: newName.trim(),
        customerId: newCustomerId ? Number(newCustomerId) : undefined,
      });
      setLinks(prev => [link, ...prev]);
      setNewLink(link);
      setNewName(""); setNewCustomerId(""); setCreating(false);
    } catch (err: any) {
      setSaveErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(link: RequestLink) {
    try {
      const updated = await jobRequestsApi.updateLink(link.id, { isActive: !link.isActive });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, isActive: updated.isActive } : l));
    } catch { /* silent */ }
  }

  const requestUrl = (rawToken: string) => `${APP_URL}/request/${rawToken}`;

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>Intake Links</h1>
          <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
            Permanent reusable links for customers to submit transport requests.
            Each customer can use the same link repeatedly.
          </p>
        </div>
        <button className="btn btn-primary text-sm" onClick={() => setCreating(c => !c)}>
          + New link
        </button>
      </div>

      {/* New token revealed after creation */}
      {newLink?.rawToken && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 space-y-3">
          <div className="font-semibold text-green-800">✓ Link created — copy it now</div>
          <p className="text-sm text-green-700">
            The full URL is only shown once. Save it and send it to the customer.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              className="input font-mono text-sm bg-white flex-1"
              value={requestUrl(newLink.rawToken)}
            />
            <button
              className="btn btn-secondary text-sm shrink-0"
              onClick={() => copyToClipboard(requestUrl(newLink.rawToken!))}
            >
              Copy
            </button>
          </div>
          <button
            className="text-xs underline"
            style={{ color: "#6b7280" }}
            onClick={() => setNewLink(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold" style={{ color: "#0f172a" }}>New intake link</h2>
          {saveErr && <div className="text-sm text-red-600">{saveErr}</div>}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Link name <span className="text-red-500">*</span></label>
              <input
                className="input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Acme Haulage — standing order link"
              />
              <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                Internal label only — customers don't see this.
              </p>
            </div>
            <div>
              <label className="label">Customer (optional)</label>
              <select className="input" value={newCustomerId} onChange={e => setNewCustomerId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">— Any customer / public —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                If linked to a customer, their company name and contact details are pre-filled on the form.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary text-sm" disabled={saving}>
                {saving ? "Creating…" : "Create link"}
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Links list */}
      {loading ? (
        <div className="text-sm text-muted py-8 text-center">Loading…</div>
      ) : links.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔗</div>
          <div className="font-semibold" style={{ color: "#0f172a" }}>No intake links yet</div>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
            Create a link and send it to a customer so they can submit transport requests directly.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => (
            <div key={link.id} className={"card p-4 " + (!link.isActive ? "opacity-60" : "")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: "#0f172a" }}>{link.name}</span>
                    <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold " +
                      (link.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500")}>
                      {link.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {link.customer && (
                    <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                      Linked to: {link.customer.name}
                    </div>
                  )}
                  <div className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                    {link.usageCount} submission{link.usageCount !== 1 ? "s" : ""}
                    {link.lastUsedAt && <span> · Last used {new Date(link.lastUsedAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-xs font-mono truncate flex-1" style={{ color: "#6b7280" }}>
                      {APP_URL}/request/[token]
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="btn btn-secondary text-xs px-3 py-1.5"
                    onClick={() => toggleActive(link)}
                  >
                    {link.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs p-4 rounded-xl bg-blue-50 border border-blue-100" style={{ color: "#374151" }}>
        <strong>How it works:</strong> Each link has a unique secret URL.
        Send the URL to your customer. They can use it as many times as they like.
        Each submission creates a new job request in your review queue.
        Deactivate a link at any time to stop new submissions from that URL.
        The token is shown only once when you create the link — after that it cannot be recovered (create a new link if needed).
      </div>
    </div>
  );
}
