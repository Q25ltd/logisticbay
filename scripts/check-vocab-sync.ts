import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Cross-workspace vocabulary sync check.
 *
 * Some vocabulary files are duplicated BYTE-FOR-BYTE across workspaces (api / web /
 * shared) because knip cannot trace imports across workspace boundaries. Each such
 * file forms a "group": the core copies must be identical (build fails on drift),
 * and the mobile copy is soft-checked (warning only — updated in mobile sessions).
 *
 * To add a new mirrored vocabulary, append a group below.
 */
interface VocabGroup {
  name: string;
  /** Hard-checked: must always stay identical. Build fails if they diverge. */
  corePaths: string[];
  /** Soft-checked: logs a warning but does not fail the build. */
  softPaths: string[];
}

const groups: VocabGroup[] = [
  {
    name: "vehicleTaxonomy",
    corePaths: [
      "shared/vehicleTaxonomy.ts",
      "api/src/constants/vehicleTaxonomy.ts",
      "web/src/constants/vehicleTaxonomy.ts",
    ],
    softPaths: [
      "mobile/src/constants/vehicleTaxonomy.ts",
    ],
  },
  {
    name: "loadVocab",
    corePaths: [
      "shared/loadVocab.ts",
      "api/src/constants/loadVocab.ts",
      "web/src/constants/loadVocab.ts",
    ],
    softPaths: [
      "mobile/src/constants/loadVocab.ts",
    ],
  },
];

function hash(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

let failed = false;

for (const group of groups) {
  const coreHashes = group.corePaths.map(p => ({ p, h: hash(p) }));
  if (new Set(coreHashes.map(x => x.h)).size > 1) {
    console.error(`❌ Vocabulary group "${group.name}" has drifted (API / web / shared):`);
    coreHashes.forEach(x => console.error(`  ${x.h}  ${x.p}`));
    failed = true;
    continue;
  }

  const coreHash = coreHashes[0].h;
  for (const p of group.softPaths) {
    if (!existsSync(p)) continue;
    const h = hash(p);
    if (h !== coreHash) {
      console.warn(`⚠️  ${p} is out of sync with the "${group.name}" core — update in a mobile session`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("✅ Vocabulary files in sync.");
