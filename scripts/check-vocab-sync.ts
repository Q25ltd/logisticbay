import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Hard-checked: must always stay in sync. Build fails if they diverge.
const corePaths = [
  "shared/vehicleTaxonomy.ts",
  "api/src/constants/vehicleTaxonomy.ts",
  "web/src/constants/vehicleTaxonomy.ts",
];

// Soft-checked: mobile is updated in separate mobile sessions.
// Logs a warning but does not fail the build.
const softPaths = [
  "mobile/src/constants/vehicleTaxonomy.ts",
];

function hash(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const coreHashes = corePaths.map(p => ({ p, h: hash(p) }));
if (new Set(coreHashes.map(x => x.h)).size > 1) {
  console.error("❌ Vocabulary files have drifted (API / web / shared):");
  coreHashes.forEach(x => console.error(`  ${x.h}  ${x.p}`));
  process.exit(1);
}

const coreHash = coreHashes[0].h;
for (const p of softPaths) {
  if (!existsSync(p)) continue;
  const h = hash(p);
  if (h !== coreHash) {
    console.warn(`⚠️  ${p} is out of sync with shared/vehicleTaxonomy.ts — update in a mobile session`);
  }
}

console.log("✅ Vocabulary files in sync.");

