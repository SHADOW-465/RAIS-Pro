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

/** The one accepted definition: passedForward. Hold is never added in. */
export const ACCEPTED_QUANTITY_LABEL =
  "Passed forward: the recorded accepted quantity when the gate has one, otherwise checked minus rejected minus hold. Hold is shown separately and is not part of accepted.";

export function gateAccepted(q: {
  checked?: number | null;
  good?: number | null;
  accepted?: number | null;
  rejected?: number | null;
  rework?: number | null;
  hold?: number | null;
}): number {
  return passedForward({
    checked: q.checked,
    accepted: q.good ?? q.accepted,
    rejected: q.rejected,
    hold: q.rework ?? q.hold,
  });
}

/** Units this gate passed forward that the next gate has not checked. */
export function notYetAtNextGate(passed: number, nextChecked: number): number {
  return Math.max(0, passed - nextChecked);
}
