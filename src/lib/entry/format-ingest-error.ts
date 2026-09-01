// Turn ledger/ingest failures into one operator-facing sentence.
//
// Zod dumps (`invalid_value` on ruleId, expected V-001|…) used to print as
// "Sync Error: [{code:…}]" on Data Entry. That is a schema crash, not the
// reason the row stayed off the ledger.

function firstIssue(raw: unknown): { path?: string; message?: string; code?: string } | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as { path?: unknown; message?: unknown; code?: unknown };
    return {
      path: Array.isArray(o.path) ? o.path.map(String).join(".") : typeof o.path === "string" ? o.path : undefined,
      message: typeof o.message === "string" ? o.message : undefined,
      code: typeof o.code === "string" ? o.code : undefined,
    };
  }
  if (Array.isArray(raw) && raw[0]) return firstIssue(raw[0]);
  return null;
}

function isOperatorSentence(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 400 && !t.startsWith("[") && !t.startsWith("{") && !/^invalid option/i.test(t);
}

export function formatIngestError(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  let parsed: unknown = raw;
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = raw;
    }
  }
  const issue = firstIssue(parsed);
  const path = issue?.path ?? "";
  const msg = issue?.message ?? "";

  if (path.includes("ruleId") || /invalid option: expected one of/i.test(msg)) {
    return (
      "This station’s checked quantity exceeds what the previous station passed forward. " +
      "Fix the counts, then retry."
    );
  }
  if (msg && isOperatorSentence(msg)) return msg;
  if (text && isOperatorSentence(text)) return text;
  return "The write was rejected. Check this station’s counts against the previous station, then retry.";
}

/** Prefer the server’s exact clarification sentence over a schema dump. */
export function formatLedgerBlockReason(
  error: unknown,
  issues?: { message: string }[] | null,
): string {
  const fromIssues = (issues ?? [])
    .map((i) => (typeof i.message === "string" ? i.message.trim() : ""))
    .filter(isOperatorSentence);
  if (fromIssues.length > 0) return fromIssues.join(" ");
  return formatIngestError(error);
}
