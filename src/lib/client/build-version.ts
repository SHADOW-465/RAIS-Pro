// "Is the server running a different build than this tab?" Pure, so it is testable.

/** The build this bundle was compiled as (inlined by next.config.ts). */
export const CLIENT_BUILD_ID: string | null = process.env.NEXT_PUBLIC_BUILD_ID ?? null;

/** True only when both ids are known and differ. An unknown id never nags. */
export function isNewBuild(local: string | null, remote: unknown): boolean {
  return typeof remote === "string" && remote !== "" && !!local && remote !== local;
}

/** Minimum gap between checks, so focus/visibility bursts do not hammer the server. */
export const BUILD_CHECK_MIN_GAP_MS = 30_000;
export const BUILD_POLL_MS = 5 * 60_000;
