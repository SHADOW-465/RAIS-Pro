// Draft cache for in-progress data entry. Keeps typed-but-unsaved values across
// navigation/reload so an operator never loses a half-filled form. This is NOT
// a save — nothing reaches the ledger until the operator submits.
// ponytail: localStorage, per-browser. Move server-side if drafts must follow a
// user between devices.

export function loadDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — drafts are best-effort */
  }
}
