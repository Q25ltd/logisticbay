/**
 * check-docs-sync — DATA_DICTIONARY.md must describe the real schema.
 *
 * Fails the build when the dictionary documents a model or field that does not
 * exist in api/prisma/schema.prisma, or when a schema model has no dictionary
 * section at all. This is the mechanical guard against documentation drift —
 * added after the 2026-07-14/15 audits found ~260 lines documenting a deleted
 * model and columns dropped months earlier (CLAUDE.md § Anti-drift rule 7).
 *
 * Conventions understood:
 *   - "## ~~Name~~ (REMOVED — …)" sections are tombstones → skipped.
 *   - "## A / B / C" sections document several models → fields checked
 *     against the union of those models.
 *   - "## Name (label)" → parenthetical ignored.
 *   - Non-model sections (API shapes, vocab, blob layouts, form mapping) are
 *     explicitly allowlisted below — add new ones deliberately.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(resolve(root, "api/prisma/schema.prisma"), "utf8");
const dict   = readFileSync(resolve(root, "DATA_DICTIONARY.md"), "utf8");

// ── Parse prisma models ──────────────────────────────────────────────────────
const models = new Map<string, Set<string>>();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const fields = new Set<string>();
  for (const raw of m[2].split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const f = line.match(/^(\w+)\s+\S+/);
    if (f) fields.add(f[1]);
  }
  models.set(m[1], fields);
}

// ── Sections that document things other than a prisma model ─────────────────
const NON_MODEL_SECTIONS = [
  "Load-movement vocabulary",
  "Job — loadData blob",
  "Form field → database mapping",
  "Planning API — Response types",
  "Planning API — Endpoints",
  "Planning feasibility — derived terms (in-memory, non-schema)",
  "Runs readiness — derived terms (Runs screen B1; `GET /runs/:id/readiness`)",
  "Soft-Delete Conventions — per model",
];

// Models intentionally without their own dictionary section (documented
// elsewhere or pure infrastructure). Keep this list SHORT and justified.
const MODELS_WITHOUT_SECTION = [
  "PasswordResetToken",   // auth infrastructure — no business fields
  "EmailVerificationToken", // auth infrastructure
  "ShiftSubmitJob",       // internal background-job queue row
];

// ── Parse dictionary sections ────────────────────────────────────────────────
interface Section { header: string; fields: string[] }
const sections: Section[] = [];
const parts = dict.split(/^## /m).slice(1);
for (const part of parts) {
  const header = part.split("\n")[0].trim();
  const fields: string[] = [];
  for (const line of part.split("\n")) {
    const f = line.match(/^\| (\w+) \|/);
    if (f && !["Field", "field", "Model", "Section"].includes(f[1])) fields.push(f[1]);
  }
  sections.push({ header, fields });
}

const errors: string[] = [];
const documentedModels = new Set<string>();

for (const sec of sections) {
  if (sec.header.includes("REMOVED") || sec.header.startsWith("~~")) continue;
  if (NON_MODEL_SECTIONS.includes(sec.header)) continue;
  if (sec.fields.length === 0) continue; // prose-only section

  // Resolve header → one or more prisma models
  const base = sec.header.replace(/\s*\(.*\)\s*$/, "").trim();
  const names = base.split("/").map(s => s.trim().replace(/\s+/g, ""));
  const resolved: string[] = [];
  for (const n of names) {
    const hit = [...models.keys()].find(k => k.toLowerCase() === n.toLowerCase());
    if (hit) resolved.push(hit);
  }
  if (resolved.length === 0) {
    errors.push(`Section "## ${sec.header}" documents no existing prisma model — dead model or missing allowlist entry.`);
    continue;
  }
  resolved.forEach(r => documentedModels.add(r));

  const union = new Set<string>();
  for (const r of resolved) for (const f of models.get(r)!) union.add(f);

  for (const f of sec.fields) {
    if (!union.has(f)) {
      errors.push(`"## ${sec.header}": field "${f}" does not exist on ${resolved.join("/")} — phantom documentation.`);
    }
  }
}

for (const m of models.keys()) {
  if (!documentedModels.has(m) && !MODELS_WITHOUT_SECTION.includes(m)) {
    errors.push(`Model "${m}" exists in schema.prisma but has no DATA_DICTIONARY.md section.`);
  }
}

if (errors.length) {
  console.error(`❌ check:docs — ${errors.length} dictionary/schema mismatch(es):\n`);
  for (const e of errors) console.error("  · " + e);
  process.exit(1);
}
console.log(`✅ Dictionary in sync with schema (${documentedModels.size} models verified).`);
