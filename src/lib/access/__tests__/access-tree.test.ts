// The access catalog and its tree projection.
//
// Two properties carry the whole feature. First, grants and the stored role
// convert both ways without loss — that is what lets the picker ship before
// `plant_roles` grows a grants column, and what stops a GM's edit from quietly
// widening or narrowing a role it was only meant to read. Second, an id nobody
// declared is never granted: deny by omission, the same rule `navAllow` has
// always had.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_LEAVES,
  DASHBOARD_CARDS,
  dashboardCardIds,
  cardGrantId,
  grantsFromRole,
  leafById,
  permissionGrantId,
  roleAccessFromGrants,
  screenGrantId,
} from "@/lib/access/catalog";
import {
  buildAccessTree,
  checkState,
  grantIdsUnder,
  toggleNode,
  withCounts,
  type AccessNode,
} from "@/lib/access/tree";
import { BUILTIN_ROLES } from "@/lib/auth/roles";
import { NAV_ROUTES, type NavKey } from "@/lib/nav-keys";
import { PERSONA_ORDER } from "@/lib/persona";

const tree = buildAccessTree();

const findNode = (id: string, nodes: AccessNode[] = tree): AccessNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(id, n.children);
    if (hit) return hit;
  }
  return null;
};

describe("catalog", () => {
  test("every sidebar destination is grantable", () => {
    for (const key of Object.keys(NAV_ROUTES) as NavKey[]) {
      expect(leafById(screenGrantId(key))).toBeDefined();
    }
  });

  test("leaf ids are unique — a collision would silently merge two grants", () => {
    expect(new Set(ALL_LEAVES.map((l) => l.id)).size).toBe(ALL_LEAVES.length);
  });

  test("every leaf binds to something the app can actually enforce", () => {
    // The rule this file exists to keep: no checkbox without a mechanism.
    for (const leaf of ALL_LEAVES) {
      const bound = leaf.navKey ?? leaf.capability ?? leaf.cardId;
      expect(bound).toBeDefined();
    }
  });
});

describe("grants round-trip through the stored role", () => {
  test.each(PERSONA_ORDER)("%s survives grants → role → grants unchanged", (id) => {
    const role = BUILTIN_ROLES[id];
    const grants = grantsFromRole(role);
    const stored = roleAccessFromGrants(grants);

    expect(new Set(stored.navAllow)).toEqual(new Set(role.navAllow));
    expect(stored.capabilities).toEqual(role.capabilities);
    expect(grantsFromRole({ ...stored })).toEqual(grants);
  });

  test("the Owner's view-only capabilities come back as no permission leaves", () => {
    const grants = grantsFromRole(BUILTIN_ROLES.owner);
    for (const cap of ["write", "approve", "configure", "eraseLedger"] as const) {
      expect(grants.has(permissionGrantId(cap))).toBe(false);
    }
    expect(grants.has(screenGrantId("copq"))).toBe(true);
  });

  test("an id nobody declared is dropped rather than carried through", () => {
    const stored = roleAccessFromGrants(new Set(["screen.invented", "permission.superuser"]));
    expect(stored.navAllow).toEqual([]);
    expect(stored.grants).toEqual([]);
    expect(stored.capabilities).toEqual({
      write: false,
      approve: false,
      configure: false,
      eraseLedger: false,
    });
  });
});

describe("tree shape", () => {
  test("top-level folders follow the sidebar's own grouping, plus permissions", () => {
    expect(tree.map((n) => n.label)).toEqual([
      "Overview",
      "Your data",
      "Analysis",
      "Management",
      "Permissions",
    ]);
  });

  test("dashboard cards hang off the dashboard screen", () => {
    const dash = findNode(screenGrantId("dashboard"));
    expect(dash?.children[0]?.label).toBe("Cards");
    expect(dash?.children[0]?.children).toHaveLength(DASHBOARD_CARDS.length);
  });

  test("every catalog leaf reaches the tree — an unreachable grant is unpickable", () => {
    const inTree = new Set(tree.flatMap((n) => grantIdsUnder(n)));
    for (const leaf of ALL_LEAVES) expect(inTree.has(leaf.id)).toBe(true);
  });
});

describe("tri-state", () => {
  const analysis = () => findNode("section.analysis")!;

  test("a folder with every leaf granted is on; with none, off", () => {
    const all = new Set(grantIdsUnder(analysis()));
    expect(checkState(analysis(), all)).toBe("on");
    expect(checkState(analysis(), new Set())).toBe("off");
  });

  test("a folder with some leaves granted is mixed", () => {
    expect(checkState(analysis(), new Set([screenGrantId("copq")]))).toBe("mixed");
  });

  // The honest reading: the screen is reachable but something under it is not,
  // so the row must not claim to be fully on.
  test("a granted screen with a withheld card reads as mixed", () => {
    const dash = findNode(screenGrantId("dashboard"))!;
    const granted = new Set(grantIdsUnder(dash));
    granted.delete(cardGrantId("copq"));
    expect(checkState(dash, granted)).toBe("mixed");
  });
});

describe("toggling", () => {
  test("ticking a folder grants everything under it", () => {
    const next = toggleNode(findNode("section.analysis")!, new Set());
    expect(next.has(screenGrantId("spc"))).toBe(true);
    expect(next.has(screenGrantId("copq"))).toBe(true);
  });

  test("un-ticking a folder revokes everything under it", () => {
    const analysis = findNode("section.analysis")!;
    const next = toggleNode(analysis, new Set(grantIdsUnder(analysis)));
    expect(checkState(analysis, next)).toBe("off");
  });

  test("a mixed folder fills in rather than clearing", () => {
    const analysis = findNode("section.analysis")!;
    const next = toggleNode(analysis, new Set([screenGrantId("copq")]));
    expect(checkState(analysis, next)).toBe("on");
  });

  // A card the board would never render because its screen is withheld is a
  // grant that lies about what someone can see.
  test("granting a card grants the screen that carries it", () => {
    const next = toggleNode(findNode(cardGrantId("pareto"))!, new Set());
    expect(next.has(screenGrantId("dashboard"))).toBe(true);
  });

  test("revoking the dashboard takes its cards with it", () => {
    const dash = findNode(screenGrantId("dashboard"))!;
    const next = toggleNode(dash, new Set(grantIdsUnder(dash)));
    for (const c of DASHBOARD_CARDS) expect(next.has(cardGrantId(c.id))).toBe(false);
  });

  test("toggling one screen leaves its siblings alone", () => {
    const before = new Set([screenGrantId("spc"), screenGrantId("copq")]);
    const next = toggleNode(findNode(screenGrantId("copq"))!, before);
    expect(next.has(screenGrantId("spc"))).toBe(true);
    expect(next.has(screenGrantId("copq"))).toBe(false);
  });
});

describe("counts", () => {
  test("folders report how many of their leaves are granted", () => {
    const counted = withCounts(tree, new Set([screenGrantId("copq")]));
    const analysis = counted.find((n) => n.id === "section.analysis")!;
    expect(analysis.count).toBe(1);
  });

  test("leaves carry no count — the gutter is for folders", () => {
    const counted = withCounts(tree, new Set());
    const permissions = counted.find((n) => n.id === "folder.permissions")!;
    expect(permissions.children.every((c) => c.count === undefined)).toBe(true);
  });
});

// A card on the board that is missing from the catalog can never be withheld,
// and one in the catalog that is no longer on the board is a checkbox that does
// nothing. Neither is visible in review, so read the board and compare — the
// same walk-the-source approach route-auth-coverage.test.ts uses to stop a new
// route from forgetting its guard.
describe("the card catalog tracks the actual dashboard", () => {
  const board = readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8");
  const onBoard = [...board.matchAll(/<DashItem\s+id="([^"]+)"/g)].map((m) => m[1]);

  test("the board was actually parsed", () => {
    expect(onBoard.length).toBeGreaterThan(5);
  });

  test("every card on the board is grantable", () => {
    expect([...new Set(onBoard)].sort()).toEqual(dashboardCardIds().sort());
  });
});
