// src/app/api/policy/route.ts
// Calculation policy — the conventions behind every number.
//
// GET → { policy, version, changedBy, changedAt, note, history[], baseline }
// PUT → save a new live version (append-only; latest wins)
//       body.asBaseline === true promotes the payload to the plant restore-point
//       body.baselineOnly === true with asBaseline skips the live append
//
// Reads are also served inline by /api/schema so the client gets plant config
// in one round trip; this route owns writes, history, and plant baseline.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { resolveRole } from "@/lib/auth/roles";
import { policyForRole, roleSeesCost } from "@/lib/access/scope";
import { CalculationPolicy, type CalculationPolicyT } from "@/core/policy/policy";
import { getPolicyStore } from "@/core/policy/policy-store";

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

export async function GET(req: NextRequest) {
  // The unit cost lives in here, so this read is no longer anonymous-by-proxy:
  // a role without the Cost of Rejection screen should not merely be unable to
  // OPEN it, it should not receive the plant's money at all. Redacting only in
  // the browser would leave the figure one network-tab away.
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const role = await resolveRole(auth.actor.role);
  const seesCost = roleSeesCost(role?.navAllow ?? []);

  const store = getPolicyStore();
  const company = companyId();
  const [current, history, baseline] = await Promise.all([
    store.current(company),
    store.history(company),
    store.baseline(company),
  ]);

  if (seesCost) return NextResponse.json({ ...current, history, baseline });

  // History and baseline carry past unit costs; redact those too, or the
  // current value is withheld while every previous one is handed over.
  const nav = role?.navAllow ?? [];
  const redact = <T extends { policy: CalculationPolicyT }>(v: T): T => ({
    ...v,
    policy: policyForRole(v.policy, nav),
  });
  return NextResponse.json({
    ...redact(current),
    history: history.map(redact),
    baseline: baseline ? redact(baseline) : baseline,
    costRedacted: true,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const {
    policy: rawPolicy,
    note,
    changedBy,
    asBaseline,
    baselineOnly,
  } = (body ?? {}) as {
    policy?: unknown;
    note?: unknown;
    changedBy?: unknown;
    asBaseline?: unknown;
    baselineOnly?: unknown;
  };

  const parsed = CalculationPolicy.safeParse(rawPolicy);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid policy", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const promoteBaseline = asBaseline === true;
  const onlyBaseline = promoteBaseline && baselineOnly === true;
  const noteStr = typeof note === "string" ? note.trim() : "";

  // Live saves always need a human reason. Pure "set as plant default" may use
  // an automatic note so the GM is not blocked by a second form field.
  if (!promoteBaseline && noteStr.length === 0) {
    return NextResponse.json(
      { error: "A note explaining the change is required" },
      { status: 400 },
    );
  }
  if (promoteBaseline && !onlyBaseline && noteStr.length === 0) {
    return NextResponse.json(
      {
        error:
          "A note is required when saving rule changes. Or use Set as plant default on the live rules.",
      },
      { status: 400 },
    );
  }

  const who =
    typeof changedBy === "string" && changedBy.trim() ? changedBy.trim() : "unknown";
  const auditNote =
    noteStr || "Set current rules as plant default";

  try {
    const store = getPolicyStore();
    const company = companyId();

    let saved = await store.current(company);

    if (!onlyBaseline) {
      saved = await store.save(company, parsed.data, {
        changedBy: who,
        note: auditNote,
      });
    }

    let baseline = null;
    if (promoteBaseline) {
      baseline = await store.setBaseline(company, parsed.data, {
        changedBy: who,
        note: auditNote,
      });
    } else {
      baseline = await store.baseline(company);
    }

    return NextResponse.json({ ...saved, baseline });
  } catch (err) {
    if (err instanceof Error && err.name === "PolicyTableMissingError") {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/policy] PUT failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 },
    );
  }
}
