// Units a station made available downstream.
//
// Plant identity at every process (primary, secondary, assembly):
//   accept = checked − (rejected + hold)
// When accepted was recorded, that number is the pass-forward. When it was
// not, the identity is derived so a throughput-only station still feeds the
// next one.

export function passedForward(q: {
  checked?: number | null;
  accepted?: number | null;
  rejected?: number | null;
  hold?: number | null;
}): number {
  const accepted = q.accepted ?? 0;
  if (accepted > 0) return accepted;
  return Math.max(0, (q.checked ?? 0) - (q.rejected ?? 0) - (q.hold ?? 0));
}
