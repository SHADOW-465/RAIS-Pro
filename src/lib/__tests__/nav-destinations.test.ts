// The 21-screen sidebar became 9 destinations. NavKey stays the unit of access,
// so what must hold is: no screen is orphaned, every old URL still lands
// somewhere, and each built-in role sees the destinations it should.

import {
  LEGACY_ROUTES,
  NAV_DESTINATIONS,
  NAV_ROUTES,
  ROUTED_NAV_KEYS,
  destinationForKey,
  modernPath,
  navKeyForPath,
  type NavKey,
} from "@/lib/nav-keys";
import { PERSONAS, type PersonaId } from "@/lib/persona";

const visible = (id: PersonaId) =>
  NAV_DESTINATIONS.filter((d) => d.keys.some((k) => PERSONAS[id].navAllow.includes(k))).map((d) => d.id);

describe("destinations", () => {
  test("nine destinations", () => expect(NAV_DESTINATIONS).toHaveLength(9));

  test("every routed screen lives in exactly one destination", () => {
    for (const key of ROUTED_NAV_KEYS) {
      expect(NAV_DESTINATIONS.filter((d) => d.keys.includes(key))).toHaveLength(1);
    }
    expect(destinationForKey("ask")).toBeNull();
  });

  test("a screen's URL sits under its destination", () => {
    const base: Record<string, string> = {
      home: "/", log: "/log", excel: "/excel", quality: "/quality", lots: "/lots",
      cost: "/cost", actions: "/actions", reports: "/reports", setup: "/setup",
    };
    for (const d of NAV_DESTINATIONS) {
      for (const k of d.keys) {
        const href = NAV_ROUTES[k].href as string;
        expect(base[d.id] === "/" ? href === "/" : href === base[d.id] || href.startsWith(`${base[d.id]}/`)).toBe(true);
      }
    }
  });
});

describe("old URLs", () => {
  test("every pre-regroup screen URL has a redirect to its current URL", () => {
    expect(Object.keys(LEGACY_ROUTES)).toHaveLength(ROUTED_NAV_KEYS.length - 2); // minus "/" and "/reports", which did not move
    for (const to of Object.values(LEGACY_ROUTES)) {
      expect(ROUTED_NAV_KEYS.some((k) => NAV_ROUTES[k].href === to)).toBe(true);
    }
  });

  test("modernPath rewrites old links, keeps query and hash, leaves new ones alone", () => {
    expect(modernPath("/stage-analysis?stage=visual")).toBe("/quality/stage?stage=visual");
    expect(modernPath("/settings#rules")).toBe("/setup/settings#rules");
    expect(modernPath("/settings/rules")).toBe("/setup/settings/rules");
    expect(modernPath("/quality/stage")).toBe("/quality/stage");
    expect(modernPath("/holdings")).toBe("/holdings");
    expect(navKeyForPath(modernPath("/audit").split("?")[0])).toBe("audit");
    expect(navKeyForPath("/reports")).toBe("reports");
  });
});

describe("role menus", () => {
  test("GM sees all nine", () => expect(visible("gm")).toHaveLength(9));

  test("Owner: no Log, Excel files or Plant setup", () => {
    expect(visible("owner")).toEqual(["home", "quality", "lots", "cost", "actions", "reports"]);
  });

  test("Operator: everything but Plant setup, and keeps the Audit trail", () => {
    expect(visible("operator")).toEqual(["home", "log", "excel", "quality", "lots", "cost", "actions", "reports"]);
    expect(PERSONAS.operator.navAllow).toContain("audit" as NavKey);
  });
});
