import { queriesForNav, routeReadsLedger, routeReadsLineage } from "../page-data";
import { ledgerFetchWindow, type LedgerDateTweaks } from "../ledger-window";
import { navKeyForPath } from "@/lib/nav-keys";

const ALL: LedgerDateTweaks = { datePreset: "all", dateFrom: "", dateTo: "" };
const LAST_90: LedgerDateTweaks = { datePreset: "last-90-days", dateFrom: "", dateTo: "" };

describe("which URL mounts a ledger fetch", () => {
  test("login is not a screen, and nested settings still is", () => {
    expect(navKeyForPath("/login")).toBeNull();
    expect(navKeyForPath("/settings/rules")).toBe("settings");
    expect(routeReadsLedger("settings")).toBe(true);
  });
});

describe("routeReadsLedger", () => {
  test("staging, CAPA, alerts and ask do not download the ledger", () => {
    expect(routeReadsLedger("staging")).toBe(false);
    expect(routeReadsLedger("capa")).toBe(false);
    expect(routeReadsLedger("alerts")).toBe(false);
    expect(routeReadsLedger("ask")).toBe(false);
  });

  test("settings still reads the ledger, because calculation rules do", () => {
    expect(routeReadsLedger("settings")).toBe(true);
    expect(routeReadsLedger("dashboard")).toBe(true);
  });
});

describe("routeReadsLineage", () => {
  test("entry, conversion and report screens load conversions", () => {
    expect(routeReadsLineage("data-entry")).toBe(true);
    expect(routeReadsLineage("batch-conversion")).toBe(true);
    expect(routeReadsLineage("dashboard")).toBe(true);
    expect(routeReadsLineage("reports")).toBe(true);
  });

  test("ask, staging and settings do not", () => {
    expect(routeReadsLineage("ask")).toBe(false);
    expect(routeReadsLineage("staging")).toBe(false);
    expect(routeReadsLineage("settings")).toBe(false);
  });
});

describe("queriesForNav", () => {
  test("a relative preset without an anchor prefetches bounds, not rows", () => {
    const ids = queriesForNav("dashboard", LAST_90, { ready: false }, "ada").map((q) => q.id);
    expect(ids).toEqual(["schema", "ledger-bounds", "conversions"]);
  });

  test("once the anchor is known, the events key is the padded window", () => {
    const anchor = { ready: true, max: "2026-06-15" };
    const queries = queriesForNav("dashboard", LAST_90, anchor, "ada");
    const events = queries.find((q) => q.id === "events");
    const window = ledgerFetchWindow(LAST_90, anchor);
    expect(queries.map((q) => q.id)).toEqual(["schema", "events", "conversions"]);
    expect(events?.queryKey).toEqual(["events", "ada", window.from ?? "", window.to ?? ""]);
    expect(window.to).toBe("2026-06-15");
    expect(window.from! < "2026-06-15").toBe(true);
  });

  test("ask prefetches nothing, and staging prefetches schema only", () => {
    expect(queriesForNav("ask", ALL, { ready: true }, "ada")).toEqual([]);
    expect(queriesForNav("staging", ALL, { ready: true }, "ada").map((q) => q.id)).toEqual(["schema"]);
  });
});
