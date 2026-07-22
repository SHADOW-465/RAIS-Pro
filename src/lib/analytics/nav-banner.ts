// Minimal pub/sub for the "the AI drove here — why + undo" banner.
export interface NavBanner {
  label: string;    // e.g. "Defect Analysis · April"
  reason: string;   // e.g. "rejection spike"
  fromHref: string; // where the user was, for Undo
}

type Fn = (b: NavBanner) => void;
const subscribers = new Set<Fn>();

export function emitNavBanner(b: NavBanner): void {
  for (const fn of subscribers) fn(b);
}

export function subscribeNavBanner(fn: Fn): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
