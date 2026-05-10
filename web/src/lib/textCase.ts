export type CaseRule = "proper_name" | "address_line" | "sentence" | "upper" | "lower" | "none";

const SMALL_WORDS = new Set(["of", "the", "and", "or", "on", "in", "de", "la", "le", "du", "des", "von", "van", "der"]);
const ACRONYMS = new Set(["UK", "EU", "USA", "DPD", "DHL", "ASDA", "B&Q", "M&S", "NHS", "HGV", "LGV", "ADR", "CMR", "EORI", "MRN", "VAT"]);

function capWord(word: string): string {
  if (!word) return word;
  if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
  if (SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
  return word
    .split(/(['-])/)
    .map((part, index) => {
      if (index % 2 !== 0) return part;
      if (index > 0 && SMALL_WORDS.has(part.toLowerCase())) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

export function applyCase(value: string, rule: CaseRule): string {
  if (!value) return value;
  switch (rule) {
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "sentence":
      return value.charAt(0).toUpperCase() + value.slice(1);
    case "proper_name":
    case "address_line":
      return value.split(/(\s+)/).map((token, index) => {
        if (/^\s+$/.test(token)) return token;
        const capped = capWord(token);
        return index === 0 ? capped.charAt(0).toUpperCase() + capped.slice(1) : capped;
      }).join("");
    case "none":
    default:
      return value;
  }
}

export function autoCapitalizeFor(rule: CaseRule) {
  if (rule === "proper_name" || rule === "address_line") return "words";
  if (rule === "sentence") return "sentences";
  if (rule === "upper") return "characters";
  return "off";
}
