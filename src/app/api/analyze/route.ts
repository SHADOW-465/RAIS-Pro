// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { createServerClient } from "@/lib/supabase";
import { getModel, activeBackend } from "@/lib/ai";
import {
  DashboardConfigSchema,
  MergePlanSchema,
  type DashboardConfigOutput,
  type MergePlanOutput,
} from "@/lib/schemas";
import { buildManifestPrompt, buildPrompt } from "@/lib/analysis-utils";
import { applyMergePlan } from "@/lib/merger";
import type { SheetSummary } from "@/lib/parser";
import type { MergePlan } from "@/types/analysis";

const SYSTEM_PROMPT =
  "You are a senior data analyst. Return ONLY data that conforms to the " +
  "requested schema. Never invent numbers — every value must trace to the " +
  "provided data section.";

// Fallback merge plan for single-sheet uploads — skips the AI classification
// round-trip since there's nothing to deduplicate.
function buildFallbackMergePlan(summaries: SheetSummary[]): MergePlan {
  return {
    groups: [
      {
        label: "All Data",
        sheets: summaries.map((s) => s.name),
        reason: "Single source — no deduplication needed",
      },
    ],
    excludedSheets: [],
    crossFileStrategy: "sum",
    warnings: [],
  };
}

// Ensure every sheet appears in the plan; orphans get attached to the first
// group rather than being silently dropped.
function patchOrphans(plan: MergePlanOutput, summaries: SheetSummary[]): MergePlanOutput {
  const planned = new Set([
    ...plan.groups.flatMap((g) => g.sheets),
    ...plan.excludedSheets.map((e) => e.sheet),
  ]);
  const orphans = summaries.map((s) => s.name).filter((k) => !planned.has(k));
  if (orphans.length === 0) return plan;
  if (plan.groups.length > 0) {
    plan.groups[0].sheets.push(...orphans);
  } else {
    plan.groups.push({ label: "Data", sheets: orphans, reason: "auto-assigned" });
  }
  return plan;
}

export async function POST(req: NextRequest) {
  try {
    const { summaries, deviceId, fileNames } = (await req.json()) as {
      summaries: SheetSummary[];
      deviceId?: string;
      fileNames?: string[];
    };

    if (!Array.isArray(summaries) || summaries.length === 0) {
      return NextResponse.json({ error: "No summaries provided" }, { status: 400 });
    }

    // Defensive dedup — prevent doubled numbers if the same sheet arrives twice.
    const seen = new Set<string>();
    const uniqueSummaries: SheetSummary[] = summaries.filter((s) => {
      if (seen.has(s.name)) {
        console.warn(`[analyze] duplicate sheetKey dropped: ${s.name}`);
        return false;
      }
      seen.add(s.name);
      return true;
    });

    const backend = activeBackend();
    console.log(`[analyze] backend=${backend}, sheets=${uniqueSummaries.length}`);

    // ── Phase 1: merge plan ─────────────────────────────────────────────────
    let mergePlan: MergePlan;
    const manifests = uniqueSummaries.map((s) => s.manifest).filter(Boolean);
    const needsClassification = uniqueSummaries.length > 1;

    if (needsClassification && manifests.length > 0) {
      try {
        const { object } = await generateObject({
          model: getModel({ fast: true }),
          schema: MergePlanSchema,
          system: SYSTEM_PROMPT,
          prompt: buildManifestPrompt(manifests),
          temperature: 0.1,
        });
        mergePlan = patchOrphans(object, uniqueSummaries);
      } catch (err) {
        const msg =
          err instanceof NoObjectGeneratedError
            ? `model returned no valid JSON (${err.cause})`
            : err instanceof Error
              ? err.message
              : String(err);
        console.warn(`[analyze] manifest classification failed (${msg}); using fallback`);
        mergePlan = buildFallbackMergePlan(uniqueSummaries);
      }
    } else {
      mergePlan = buildFallbackMergePlan(uniqueSummaries);
    }

    console.log(
      "[analyze] mergePlan:",
      mergePlan.groups.map((g) => `${g.label}(${g.sheets.length})`).join(", "),
      "excluded:",
      mergePlan.excludedSheets.length,
    );

    // ── Phase 2: deterministic aggregation (no AI) ──────────────────────────
    const merged = applyMergePlan(uniqueSummaries, mergePlan);

    // ── Phase 3: dashboard generation ───────────────────────────────────────
    let dashboard: DashboardConfigOutput;
    try {
      const { object } = await generateObject({
        model: getModel(),
        schema: DashboardConfigSchema,
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(merged, uniqueSummaries),
        temperature: 0.1,
      });
      dashboard = object;
    } catch (err) {
      if (err instanceof NoObjectGeneratedError) {
        console.error("[analyze] dashboard generation produced no valid object:", err.cause);
        return NextResponse.json(
          { error: "Analysis model returned no valid result. Try again." },
          { status: 502 },
        );
      }
      throw err;
    }

    // ── Save to Supabase (best-effort) ──────────────────────────────────────
    let sessionId: string | null = null;
    try {
      if (deviceId && typeof deviceId === "string") {
        const db = createServerClient();
        const { data: session } = await db
          .from("sessions")
          .insert({
            device_id: deviceId,
            title: dashboard.dashboardTitle,
            files: Array.isArray(fileNames) ? fileNames.map((n) => ({ name: n })) : [],
            dashboard,
            merge_plan: mergePlan,
            data_summary: JSON.stringify(summaries),
          })
          .select("id")
          .single();
        sessionId = session?.id ?? null;
      }
    } catch (saveErr) {
      console.warn("[analyze] session save failed (non-fatal):", saveErr);
    }

    return NextResponse.json({ ...dashboard, sessionId, mergePlan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
