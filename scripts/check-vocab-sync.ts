import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const paths = [
  "shared/vehicleTaxonomy.ts",
  "api/src/constants/vehicleTaxonomy.ts",
  "web/src/constants/vehicleTaxonomy.ts",
  "mobile/src/constants/vehicleTaxonomy.ts",
];

const hashes = paths.map(p => ({
  p,
  h: createHash("sha256").update(readFileSync(p)).digest("hex"),
}));

if (new Set(hashes.map(x => x.h)).size > 1) {
  console.error("Vocabulary files have drifted:");
  hashes.forEach(x => console.error(`  ${x.h}  ${x.p}`));
  process.exit(1);
}
