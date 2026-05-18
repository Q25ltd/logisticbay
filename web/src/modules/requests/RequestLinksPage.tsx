/**
 * Manage permanent reusable intake links.
 * Each link gets a unique URL that customers can use to submit transport requests.
 * The main link is auto-created and suitable for websites / social media.
 * Custom links can be linked to a specific customer account.
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

function requestUrl(rawToken: string) {
  return `${APP_URL}/request/${rawToken}`;
}

export default function RequestLinksPage() {
  const [links,     setLinks]     = useState<RequestLink[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<number | "main" | null>(null);
  function handleCopy(id: number | "main", url: string) {
    copyToClipboard(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // New link form
  const [newName,         setNewName]         = useState("");
  const [newCustomerId,   setNewCustomerId]   = useState<number | "">("");
  const [newTemplateJson, setNewTemplateJson] = useState("");
  const [templateJsonErr, setTemplateJsonErr] = useState("");
  const [saving,          setSaving]          = useState(false);
  const [saveErr,         setSaveErr]         = useState("");

  // Per-link edit state
  const [editingId,        setEditingId]        = useState<number | null>(null);
  const [editName,         setEditName]         = useState("");
  const [editTemplateJson, setEditTemplateJson] = useState("");
  const [editTemplateErr,  setEditTemplateErr]  = useState("");
  const [editSaving,       setEditSaving]       = useState(false);
  const [editErr,          setEditErr]          = useState("");

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
    let parsedTemplate: Record<string, unknown> | null = null;
    if (newTemplateJson.trim()) {
      try { parsedTemplate = JSON.parse(newTemplateJson.trim()); setTemplateJsonErr(""); }
      catch { setTemplateJsonErr("Invalid JSON — check your template data."); return; }
    }
    setSaveErr(""); setSaving(true);
    try {
      const link = await jobRequestsApi.createLink({
        name:         newName.trim(),
        customerId:   newCustomerId ? Number(newCustomerId) : undefined,
        templateData: parsedTemplate,
      });
      setLinks(prev => {
        const mainLinks   = prev.filter(l => l.isMain);
        const customLinks = prev.filter(l => !l.isMain);
        return [...mainLinks, link, ...customLinks];
      });
      setNewName(""); setNewCustomerId(""); setNewTemplateJson(""); setCreating(false);
    } catch (err: any) {
      setSaveErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(link: RequestLink) {
    setEditingId(link.id);
    setEditName(link.name);
    setEditTemplateJson(link.templateData ? JSON.stringify(link.templateData, null, 2) : "");
    setEditTemplateErr("");
    setEditErr("");
  }

  function closeEdit() {
    setEditingId(null); setEditName(""); setEditTemplateJson(""); setEditTemplateErr(""); setEditErr("");
  }

  async function handleUpdate(link: RequestLink) {
    if (!editName.trim()) { setEditErr("Name is required"); return; }
    let parsedTemplate: Record<string, unknown> | null = null;
    if (editTemplateJson.trim()) {
      try { parsedTemplate = JSON.parse(editTemplateJson.trim()); setEditTemplateErr(""); }
      catch { setEditTemplateErr("Invalid JSON — check your template data."); return; }
    }
    setEditErr(""); setEditSaving(true);
    try {
      const updated = await jobRequestsApi.updateLink(link.id, { name: editName.trim(), templateData: parsedTemplate });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, name: updated.name, templateData: updated.templateData } : l));
      closeEdit();
    } catch (err: any) {
      setEditErr(err.message ?? "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(link: RequestLink) {
    try {
      const updated = await jobRequestsApi.updateLink(link.id, { isActive: !link.isActive });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, isActive: updated.isActive } : l));
    } catch { /* silent */ }
  }

  async function handleRegenerate(link: RequestLink) {
    if (!window.confirm(`Regenerate the link for "${link.name}"?\n\nThe current URL will immediately stop working. You will need to update anywhere this link is shared.`)) return;
    try {
      const updated = await jobRequestsApi.regenerateLink(link.id);
      setLinks(prev => prev.map(l => l.id === link.id ? updated : l));
    } catch { /* silent */ }
  }

  const mainLink    = links.find(l => l.isMain);
  const customLinks = links.filter(l => !l.isMain);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: "#0f172a" }}>Intake Links</h1>
          <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
            Shareable links for customers to submit transport requests. Each submission creates a job in your review queue.
          </p>
        </div>
        <button className="btn btn-primary text-sm" onClick={() => setCreating(c => !c)}>
          + New link
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* ── Main company link ────────────────────────────────────────── */}
          {mainLink && (
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
                <button
                  className="btn btn-secondary text-xs px-3 py-1.5 shrink-0"
                  onClick={() => toggleActive(mainLink)}
                >
                  {mainLink.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>

              {mainLink.rawToken ? (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    className="input font-mono text-sm bg-white flex-1"
                    value={requestUrl(mainLink.rawToken)}
                  />
                  <button
                    className={"btn text-sm shrink-0 " + (copiedId === "main" ? "btn-primary" : "btn-secondary")}
                    onClick={() => handleCopy("main", requestUrl(mainLink.rawToken!))}
                  >
                    {copiedId === "main" ? "✓ Copied" : "Copy link"}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Token unavailable — click Regenerate to issue a new link URL.
                  <button
                    className="ml-2 underline font-medium"
                    onClick={() => handleRegenerate(mainLink)}
                  >
                    Regenerate
                  </button>
                </div>
              )}

              <div className="text-xs" style={{ color: "#6366f1" }}>
                {mainLink.usageCount} submission{mainLink.usageCount !== 1 ? "s" : ""}
                {mainLink.lastUsedAt && <span> · Last used {new Date(mainLink.lastUsedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          )}

          {/* ── Create form ──────────────────────────────────────────────── */}
          {creating && (
            <div className="card p-5 space-y-4">
              <h2 className="font-bold" style={{ color: "#0f172a" }}>New custom link</h2>
              {saveErr && <div className="text-sm text-red-600">{saveErr}</div>}
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="label">Link name <span className="text-red-500">*</span></label>
                  <input
                    className="input"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Acme Ltd standing order link"
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
                <div>
                  <label className="label">Template pre-fill data (optional, JSON)</label>
                  <textarea
                    className={"input font-mono text-xs min-h-24 resize-y " + (templateJsonErr ? "border-red-400" : "")}
                    value={newTemplateJson}
                    onChange={e => { setNewTemplateJson(e.target.value); setTemplateJsonErr(""); }}
                    placeholder={'{\n  "serviceType": "delivery",\n  "jobType": "multi_drop"\n}'}
                  />
                  {templateJsonErr && <p className="text-xs text-red-600 mt-1">{templateJsonErr}</p>}
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

          {/* ── Custom links list ────────────────────────────────────────── */}
          {customLinks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold" style={{ color: "#374151" }}>Custom links</h2>
              {customLinks.map(link => (
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
                      <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                        {link.usageCount} submission{link.usageCount !== 1 ? "s" : ""}
                        {link.lastUsedAt && <span> · Last used {new Date(link.lastUsedAt).toLocaleDateString()}</span>}
                      </div>

                      {/* Link URL row */}
                      <div className="mt-2">
                        {link.rawToken ? (
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              className="input font-mono text-xs bg-gray-50 flex-1"
                              value={requestUrl(link.rawToken)}
                            />
                            <button
                              className={"btn text-xs px-3 py-1.5 shrink-0 " + (copiedId === link.id ? "btn-primary" : "btn-secondary")}
                              onClick={() => handleCopy(link.id, requestUrl(link.rawToken!))}
                            >
                              {copiedId === link.id ? "✓ Copied" : "Copy"}
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs" style={{ color: "#9ca3af" }}>
                            Token unavailable — regenerate to get a new URL.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        className="btn btn-secondary text-xs px-3 py-1.5"
                        onClick={() => editingId === link.id ? closeEdit() : openEdit(link)}
                      >
                        {editingId === link.id ? "Cancel" : "Edit"}
                      </button>
                      <button
                        className="btn btn-secondary text-xs px-3 py-1.5"
                        onClick={() => toggleActive(link)}
                      >
                        {link.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        className="btn btn-secondary text-xs px-3 py-1.5"
                        onClick={() => handleRegenerate(link)}
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {editingId === link.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      {editErr && <div className="text-xs text-red-600">{editErr}</div>}
                      <div>
                        <label className="label text-xs">Link name <span className="text-red-500">*</span></label>
                        <input className="input text-sm" value={editName} onChange={e => setEditName(e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-xs">Template pre-fill data (JSON)</label>
                        <textarea
                          className={"input font-mono text-xs min-h-24 resize-y " + (editTemplateErr ? "border-red-400" : "")}
                          value={editTemplateJson}
                          onChange={e => { setEditTemplateJson(e.target.value); setEditTemplateErr(""); }}
                          placeholder={'{\n  "goodsType": "pallets"\n}'}
                        />
                        {editTemplateErr && <p className="text-xs text-red-600 mt-1">{editTemplateErr}</p>}
                        <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                          Leave blank to remove template data.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary text-xs px-3 py-1.5" onClick={() => handleUpdate(link)} disabled={editSaving}>
                          {editSaving ? "Saving…" : "Save changes"}
                        </button>
                        <button className="btn btn-secondary text-xs px-3 py-1.5" onClick={closeEdit}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!mainLink && customLinks.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔗</div>
              <div className="font-semibold" style={{ color: "#0f172a" }}>No intake links yet</div>
              <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
                Your company link will appear here automatically.
              </p>
            </div>
          )}

          <div className="text-xs p-4 rounded-xl bg-blue-50 border border-blue-100" style={{ color: "#374151" }}>
            <strong>How it works:</strong> Each link has a unique URL. Customers use it to submit transport requests — each submission appears in your review queue. You can copy the link at any time from this page. Deactivate a link to stop new submissions without deleting it. Use Regenerate if a link's URL has been accidentally exposed — the old URL immediately stops working.
          </div>
        </>
      )}
    </div>
  );
}
