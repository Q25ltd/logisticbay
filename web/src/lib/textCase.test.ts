import { applyCase } from "./textCase";

const cases = [
  ["john smith", "proper_name", "John Smith"],
  ["O'BRIEN", "proper_name", "O'Brien"],
  ["stoke-on-trent", "proper_name", "Stoke-on-Trent"],
  ["hgv depot", "proper_name", "HGV Depot"],
  ["the queen of england", "proper_name", "The Queen of England"],
  ["sw1a 1aa", "upper", "SW1A 1AA"],
] as const;

for (const [input, rule, expected] of cases) {
  const actual = applyCase(input, rule);
  if (actual !== expected) {
    throw new Error(`applyCase(${input}, ${rule}) returned ${actual}; expected ${expected}`);
  }
}
