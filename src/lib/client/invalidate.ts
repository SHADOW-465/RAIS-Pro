import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getQueryClient } from "./query-client";

/** Every client write goes through one of these. Keys are prefixes: invalidating
 *  ["events"] drops every date window, for every signed-in user. */
export type WriteKind =
  | "events"
  | "entries"
  | "schema"
  | "conversions"
  | "capa"
  | "presets"
  | "grants"
  | "roles"
  | "workbooks"
  | "clear-data";

const LEDGER: QueryKey[] = [["events"], ["ledger-bounds"], ["plant-totals"]];

export function queryKeysForWrite(kind: WriteKind): QueryKey[] {
  switch (kind) {
    case "events":
    case "entries":
      return LEDGER;
    case "schema":
      return [["schema"], ["plant-totals"]];
    case "conversions":
      return [["conversions"]];
    case "capa":
      return [["capa"]];
    case "presets":
      return [["presets"]];
    case "grants":
      return [["grants"]];
    case "roles":
      return [["roles"], ["users"]];
    case "workbooks":
      return [["workbooks"], ...LEDGER];
    case "clear-data":
      return [
        ...LEDGER,
        ["schema"],
        ["conversions"],
        ["capa"],
        ["presets"],
        ["grants"],
        ["roles"],
        ["users"],
        ["workbooks"],
      ];
  }
}

/** Mark the caches a write just made stale and refetch anything on screen.
 *  No-op on the server and in tests, where no QueryClient is bound. */
export async function invalidateAfterWrite(
  kind: WriteKind,
  client?: QueryClient | null,
): Promise<void> {
  const qc = client === undefined ? getQueryClient() : client;
  if (!qc) return;
  await Promise.all(
    queryKeysForWrite(kind).map((queryKey) => qc.invalidateQueries({ queryKey })),
  );
}
