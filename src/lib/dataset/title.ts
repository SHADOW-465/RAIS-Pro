import type { DatasetSource } from "./types";
import type { SchemaSignatureColumn } from "@/lib/schema/types";

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/gi;

/** Clean one file/sheet base name down to meaningful lowercase words. */
function words(name: string): string[] {
  const base = name.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "");
  const cleaned = base
    .replace(/\b\d+\s*fr\b|\bfr\s*\d+\b/gi, " ") // size tokens
    .replace(/\b3\s*way\b/gi, " ")
    .replace(MONTHS, " ")
    .replace(/\d+/g, " ")                         // sequence numbers, years
    .replace(/[^a-zA-Z ]+/g, " ")
    .toLowerCase();
  return cleaned.split(/\s+/).filter((w) => w.length >= 3);
}

const STOP = new Set(["report", "file", "the", "and", "for", "inspe", "inspection", "sheet", "data"]);

/** A deterministic, human-ish dataset title. The LLM refinement pass (spec [B])
 *  can later replace this; here we pick the most frequent meaningful word(s)
 *  shared across the source names, else describe the table shape. */
export function deriveTitle(columns: SchemaSignatureColumn[], sources: DatasetSource[]): string {
  const freq = new Map<string, number>();
  for (const s of sources) {
    for (const w of new Set(words(s.fileName))) {
      if (STOP.has(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map((e) => e[0]);
  if (top.length > 0) {
    return top.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }
  const measures = columns.filter((c) => c.role === "measure").length;
  const dims = columns.filter((c) => c.role === "dimension" || c.role === "dimension-date").length;
  const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const spell = (n: number) => NUMBER_WORDS[n] ?? String(n);
  const plural = (n: number, word: string) => `${spell(n)} ${word}${n === 1 ? "" : "s"}`;
  return `Dataset (${plural(measures, "measure")}, ${plural(dims, "dimension")})`;
}
