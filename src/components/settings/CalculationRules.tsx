"use client";

// Calculation rules — plant policy for every dashboard number.
// Live preview uses the same analytics selectors as the rest of the app.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/editorial/Icon";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { usePersona } from "@/components/app/PersonaContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { personaDef } from "@/lib/persona";
import {
  resolveScope,
  rejectionRate,
  totalChecked,
  totalRejected,
  fpy,
  copq,
  bySection,
} from "@/lib/analytics";
import { STAGE_CATEGORIES, STAGES } from "@/core/ontology/plant-catalog";
import {
  DEFAULT_POLICY,
  type CalculationPolicyT,
  type PolicyVersion,
} from "@/core/policy/policy";

type RuleKey = keyof CalculationPolicyT;
type SectionId = "rates" | "targets" | "cost" | "history";

interface Choice {
  value: string;
  label: string;
  hint: string;
  recommended?: boolean;
}

interface RuleCard {
  key: RuleKey;
  section: SectionId;
  title: string;
  summary: string;
  choices?: Choice[];
  numeric?: {
    min: number;
    max: number;
    step: number;
    suffix: string;
    prefix?: string;
    unitLabel: string;
  };
  affects: string;
}

interface BaselineMeta {
  policy: CalculationPolicyT;
  changedBy: string;
  changedAt: string;
  note: string;
}

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "rates", label: "Rejection math", hint: "The locked formula" },
  { id: "targets", label: "Targets", hint: "Green · amber · red" },
  { id: "cost", label: "Cost", hint: "Unit cost & weights" },
  { id: "history", label: "History", hint: "Audit trail" },
];

const CARDS: RuleCard[] = [
  {
    key: "reworkCountsAs",
    section: "rates",
    title: "Rework / hold units",
    summary: "Units held at a gate. Count them as checked only if they are re-inspected there.",
    choices: [
      {
        value: "excluded",
        label: "Exclude from checked",
        hint: "Held units stay in their own bucket.",
        recommended: true,
      },
      {
        value: "checked",
        label: "Count as checked",
        hint: "When held units are dispositioned at the same gate.",
      },
    ],
    affects: "Checked, rates, mass balance",
  },
  // defaultSections lives in Settings → Display defaults. It changes no number,
  // only which sections a screen opens on, so it is not a calculation rule.
  {
    key: "targetRejectionPct",
    section: "targets",
    title: "Target rejection",
    summary: "Goal line on charts. Above this → red / at risk.",
    numeric: { min: 0, max: 100, step: 0.1, suffix: "%", unitLabel: "Target" },
    affects: "Target lines, at-risk status, savings",
  },
  {
    key: "watchRejectionPct",
    section: "targets",
    title: "Watch threshold",
    summary: "Amber band. Must stay below the target so it warns early.",
    numeric: { min: 0, max: 100, step: 0.1, suffix: "%", unitLabel: "Watch" },
    affects: "Watch status, alerts",
  },
  {
    key: "unitCostInr",
    section: "cost",
    title: "Finished unit cost",
    summary: "Basis for COPQ. One plant-wide value — not per browser.",
    numeric: {
      min: 0,
      max: 100_000,
      step: 0.5,
      suffix: "",
      prefix: "₹",
      unitLabel: "₹ / unit",
    },
    affects: "COPQ, savings, cost of rejection",
  },
];

const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  STAGE_CATEGORIES.map((c) => [c.id, c.label.replace(/\s*\(.*\)$/, "")]),
);
const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  STAGES.map((x) => [x.stageId, x.label.replace(/\s*\(.*\)$/, "")]),
);
const stageLabel = (id: string | null) => (id ? (STAGE_LABEL[id] ?? id) : "—");

function formatApiError(data: {
  error?: string;
  issues?: { path?: (string | number)[]; message?: string }[];
}): string {
  if (data.issues?.length) {
    return `Could not save — ${data.issues
      .slice(0, 3)
      .map((i) => `${i.path?.join(".") ?? ""}: ${i.message ?? "invalid"}`.replace(/^: /, ""))
      .join("; ")}`;
  }
  return data.error ?? "Save failed";
}

function sectionDirty(
  section: SectionId,
  draft: CalculationPolicyT,
  saved: CalculationPolicyT,
): boolean {
  if (section === "history") return false;
  if (section === "rates") return draft.reworkCountsAs !== saved.reworkCountsAs;
  if (section === "targets") {
    return (
      draft.targetRejectionPct !== saved.targetRejectionPct ||
      draft.watchRejectionPct !== saved.watchRejectionPct
    );
  }
  if (section === "cost") {
    return (
      draft.unitCostInr !== saved.unitCostInr ||
      JSON.stringify(draft.stageCostWeights) !== JSON.stringify(saved.stageCostWeights)
    );
  }
  return false;
}

export default function CalculationRules() {
  const { events } = useEvents();
  const { registry, policy: savedPolicy, refreshRegistry } = useRegistry();
  const { persona, canConfigure } = usePersona();
  const { t } = useTweaks();
  const noteId = useId();
  const noteRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<CalculationPolicyT>(savedPolicy);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<PolicyVersion[]>([]);
  const [baseline, setBaseline] = useState<BaselineMeta | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [policyVersion, setPolicyVersion] = useState<number | null>(null);

  useEffect(() => setDraft(savedPolicy), [savedPolicy]);

  /* The rail is gone — the page is one document now, so "go to targets" means
     scroll there. Anchors also make a group linkable from Settings. */
  const focusGroup = useCallback((id: SectionId) => {
    const el = document.getElementById(`rules-grp-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    el.querySelector<HTMLElement>("input, button, select")?.focus({ preventScroll: true });
  }, []);

  const loadPolicyMeta = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/policy");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : `Could not load policy (${res.status})`,
        );
      }
      setHistory(Array.isArray(data.history) ? data.history : []);
      if (typeof data.version === "number") setPolicyVersion(data.version);
      setBaseline(data.baseline ?? null);
    } catch (e) {
      setHistory([]);
      setHistoryError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicyMeta();
  }, [loadPolicyMeta]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedPolicy),
    [draft, savedPolicy],
  );

  const matchesBaseline = useMemo(() => {
    if (!baseline) return false;
    return JSON.stringify(draft) === JSON.stringify(baseline.policy);
  }, [draft, baseline]);

  const watchAboveTarget =
    Number.isFinite(draft.watchRejectionPct) &&
    Number.isFinite(draft.targetRejectionPct) &&
    draft.watchRejectionPct >= draft.targetRejectionPct;

  const evaluate = useMemo(() => {
    const ev = events ?? [];
    return (p: CalculationPolicyT) => {
      const scope = resolveScope(ev, t, p);
      return {
        rejection: rejectionRate(ev, scope, registry ?? undefined).value,
        checked: totalChecked(ev, scope, registry ?? undefined).value,
        rejected: totalRejected(ev, scope).value,
        fpy: fpy(ev, scope, registry ?? undefined).value,
        copq: copq(ev, scope)?.value ?? 0,
      };
    };
  }, [events, t, registry]);

  /** Live section arithmetic under the DRAFT policy — the worked example. */
  const sectionRows = useMemo(() => {
    const ev = events ?? [];
    if (ev.length === 0) return [];
    return bySection(ev, resolveScope(ev, t, draft), registry ?? undefined).filter(
      (r) => r.checked > 0 || r.rejected > 0,
    );
  }, [events, t, draft, registry]);

  const before = useMemo(() => evaluate(savedPolicy), [evaluate, savedPolicy]);
  const after = useMemo(() => evaluate(draft), [evaluate, draft]);

  const set = <K extends RuleKey>(k: K, v: CalculationPolicyT[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setError(null);
    setFieldError(null);
    setFlash(null);
  };

  const discard = () => {
    setDraft(savedPolicy);
    setNote("");
    setError(null);
    setFieldError(null);
  };

  function validateDraft(): string | null {
    if (watchAboveTarget) {
      focusGroup("targets");
      return "Watch threshold must be lower than the target.";
    }
    if (
      !Number.isFinite(draft.targetRejectionPct) ||
      !Number.isFinite(draft.watchRejectionPct) ||
      !Number.isFinite(draft.unitCostInr)
    ) {
      return "Enter valid numbers for target, watch, and unit cost.";
    }
    for (const [sid, w] of Object.entries(draft.stageCostWeights)) {
      if (!Number.isFinite(w) || w < 0 || w > 1) {
        focusGroup("cost");
        return `Gate weight for “${sid}” must be between 0 and 1.`;
      }
    }
    return null;
  }

  async function putPolicy(opts: {
    asBaseline?: boolean;
    baselineOnly?: boolean;
    note: string;
  }) {
    const res = await fetch("/api/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: draft,
        note: opts.note,
        changedBy: personaDef(persona).label,
        asBaseline: opts.asBaseline === true,
        baselineOnly: opts.baselineOnly === true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatApiError(data));
    if (typeof data.version === "number") setPolicyVersion(data.version);
    if (data.baseline) setBaseline(data.baseline as BaselineMeta);
    if (data.version != null && data.version > 0) {
      setHistory((h) => {
        const row = data as PolicyVersion;
        return [row, ...h.filter((x) => x.version !== row.version)];
      });
    }
    await refreshRegistry();
    return data;
  }

  async function save() {
    if (!canConfigure) {
      setError("Only a General Manager can change calculation rules.");
      return;
    }
    if (!dirty) return;
    if (note.trim().length === 0) {
      setFieldError("Add a short reason for the audit trail.");
      noteRef.current?.focus();
      return;
    }
    const v = validateDraft();
    if (v) {
      setFieldError(v);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      await putPolicy({ note: note.trim() });
      setNote("");
      setFlash("Rules saved. Dashboard and reports use the new values.");
      window.setTimeout(() => setFlash(null), 3200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /** Promote current draft to plant restore-point. If draft differs from live, saves live too. */
  async function setAsPlantDefault() {
    if (!canConfigure) {
      setError("Only a General Manager can set the plant default.");
      return;
    }
    const v = validateDraft();
    if (v) {
      setFieldError(v);
      return;
    }
    if (matchesBaseline && !dirty) {
      setFlash("These rules are already the plant default.");
      window.setTimeout(() => setFlash(null), 2500);
      return;
    }

    // Dirty draft needs an audit note for the live save; clean live → baseline only.
    if (dirty && note.trim().length === 0) {
      setFieldError("Add a reason, then set as plant default — this also saves live rules.");
      noteRef.current?.focus();
      return;
    }

    setSettingDefault(true);
    setError(null);
    setFieldError(null);
    try {
      await putPolicy({
        asBaseline: true,
        baselineOnly: !dirty,
        note: dirty
          ? note.trim()
          : "Set current rules as plant default",
      });
      setNote("");
      setFlash(
        dirty
          ? "Saved and set as plant default. “Restore plant default” will use these values."
          : "Plant default updated. “Restore plant default” will use these values.",
      );
      window.setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set plant default");
    } finally {
      setSettingDefault(false);
    }
  }

  function restorePlantDefault() {
    const p = baseline?.policy ?? DEFAULT_POLICY;
    setDraft(p);
    setFieldError(null);
    setError(null);
    focusGroup("rates");
    setFlash(
      baseline
        ? "Plant default loaded into the editor. Review, then Save to make it live."
        : "Shipped defaults loaded (no plant default set yet). Review, then Save to make them live.",
    );
    window.setTimeout(() => setFlash(null), 4000);
  }

  function restoreShippedDefaults() {
    setDraft(DEFAULT_POLICY);
    setFieldError(null);
    setError(null);
    focusGroup("rates");
    setFlash("Shipped defaults loaded into the editor. Save to apply them live.");
    window.setTimeout(() => setFlash(null), 3500);
  }

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const qty = (n: number) => Math.round(n).toLocaleString();
  const inr = (n: number) => `₹${Math.round(n).toLocaleString()}`;

  /* Metrics become COLUMNS here, not rows. Embedded in the settings panel the
     proof has to sit above the decisions rather than beside them, and a
     transposed table is ~90px tall instead of ~200px — small enough to stay
     stuck to the top of the panel while you scroll the decisions. */
  const IMPACT: {
    label: string;
    b: string;
    a: string;
    changed: boolean;
    /** true = moved the way a plant wants it to move */
    better: boolean | null;
  }[] = [
    {
      label: "Rejection",
      b: pct(before.rejection),
      a: pct(after.rejection),
      changed: before.rejection !== after.rejection,
      better: before.rejection === after.rejection ? null : after.rejection < before.rejection,
    },
    {
      label: "Checked",
      b: qty(before.checked),
      a: qty(after.checked),
      changed: before.checked !== after.checked,
      better: null,
    },
    {
      label: "Rejected",
      b: qty(before.rejected),
      a: qty(after.rejected),
      changed: before.rejected !== after.rejected,
      better: before.rejected === after.rejected ? null : after.rejected < before.rejected,
    },
    {
      label: "FPY",
      b: pct(before.fpy),
      a: pct(after.fpy),
      changed: before.fpy !== after.fpy,
      better: before.fpy === after.fpy ? null : after.fpy > before.fpy,
    },
    {
      label: "COPQ",
      b: inr(before.copq),
      a: inr(after.copq),
      changed: before.copq !== after.copq,
      better: before.copq === after.copq ? null : after.copq < before.copq,
    },
  ];

  const changedCount = IMPACT.filter((r) => r.changed).length;
  const stages = (registry?.stages ?? []) as { stageId: string; label?: string }[];
  const ladderMax = Math.max(15, draft.targetRejectionPct * 1.4, draft.watchRejectionPct * 1.4, 1);
  const watchPct = Math.min(100, (draft.watchRejectionPct / ladderMax) * 100);
  const targetPct = Math.min(100, (draft.targetRejectionPct / ladderMax) * 100);
  const busy = saving || settingDefault;
  const cardNumber = new Map(CARDS.map((c, i) => [c.key, i + 1]));

  return (
    <div className="rules-embed">
      {/* Toolbar — state + the two restore actions. No page mast: the settings
          panel head already names this section. */}
      <div className="rules-toolbar">
        <div className="rules-status-row" aria-label="Policy status">
          <span className="rules-chip">
            {policyVersion != null && policyVersion > 0 ? `v${policyVersion}` : "Shipped defaults"}
          </span>
          <span className={`rules-chip ${dirty ? "is-warn" : "is-ok"}`}>
            {dirty ? "Unsaved changes" : "Live"}
          </span>
          <span className={`rules-chip ${baseline ? "is-ok" : ""}`}>
            {baseline ? "Plant default set" : "No plant default"}
          </span>
          {!canConfigure && <span className="rules-chip is-muted">View only</span>}
        </div>
        <div className="rules-toolbar-actions">
          <button
            type="button"
            className="settings-btn settings-btn--ghost"
            disabled={!canConfigure || busy}
            onClick={restorePlantDefault}
            title={
              baseline
                ? `Plant default from ${baseline.changedBy}${baseline.changedAt ? ` · ${new Date(baseline.changedAt).toLocaleDateString()}` : ""}`
                : "No plant default yet — loads shipped defaults"
            }
          >
            Restore default
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--ghost"
            disabled={!canConfigure || busy || matchesBaseline}
            onClick={() => void setAsPlantDefault()}
          >
            {settingDefault ? "Setting…" : "Set as default"}
          </button>
        </div>
      </div>

      {flash && (
        <div className="settings-toast settings-toast--ok" role="status">
          <Icon name="check" size={15} stroke={2.5} />
          {flash}
        </div>
      )}
      {error && (
        <div className="settings-toast settings-toast--bad" role="alert">
          <span className="rules-toast-body">{error}</span>
          <button type="button" className="settings-link-danger" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {!canConfigure && (
        <div className="rules-banner" role="status">
          <Icon name="alert" size={15} stroke={2} aria-hidden />
          <p>
            <strong>View only.</strong> Switch to General Manager to edit or set defaults.
          </p>
        </div>
      )}

      {/* Proof — sticky, so the consequence never leaves the screen. */}
      <div className={`rules-proofbar ${dirty ? "is-dirty" : ""}`}>
        <div className="rules-proofbar-head">
          <h3 className="rules-proofbar-title">
            {dirty
              ? changedCount > 0
                ? `${changedCount} metric${changedCount === 1 ? "" : "s"} would change`
                : "No numbers move"
              : "Today's numbers"}
          </h3>
          <p className="rules-proofbar-sub">Same code the dashboard runs, on your live ledger</p>
        </div>

        <div className="rules-impact-scroll">
          <table className="rules-impact">
            <caption className="sr-only">
              Current metric values{dirty ? " and their values after the pending change" : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="rules-impact-corner">
                  <span className="sr-only">Reading</span>
                </th>
                {IMPACT.map((m) => (
                  <th key={m.label} scope="col" className={m.changed ? "is-changed" : ""}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="rules-impact-nowrow">
                <th scope="row">Now</th>
                {IMPACT.map((m) => (
                  <td key={m.label}>{m.b}</td>
                ))}
              </tr>
              {dirty && (
                <tr className="rules-impact-afterrow">
                  <th scope="row">After</th>
                  {IMPACT.map((m) => (
                    <td key={m.label}>
                      {m.changed ? (
                        <span
                          className={`rules-impact-delta ${
                            m.better === true ? "is-better" : m.better === false ? "is-worse" : ""
                          }`}
                        >
                          {m.a}
                        </span>
                      ) : (
                        <span className="rules-impact-same" aria-label="unchanged">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {dirty ? (
          <div className="rules-commit">
            <label className="settings-field rules-commit-note" htmlFor={noteId}>
              <span className="settings-field-label">
                Reason for change
                <span className="rules-required">Required</span>
              </span>
              <input
                ref={noteRef}
                id={noteId}
                className={`settings-input ${fieldError ? "is-invalid" : ""}`}
                value={note}
                placeholder="e.g. Align with FY26 quality plan"
                disabled={!canConfigure || busy}
                maxLength={500}
                aria-invalid={!!fieldError}
                aria-describedby={fieldError ? "rules-note-error" : undefined}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              {fieldError && (
                <span id="rules-note-error" className="rules-field-error" role="alert">
                  {fieldError}
                </span>
              )}
            </label>
            <div className="rules-commit-btns">
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                disabled={!canConfigure || busy}
                onClick={() => void save()}
                aria-busy={saving}
              >
                <Icon name="save" size={14} stroke={2.2} aria-hidden />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                disabled={busy}
                onClick={discard}
              >
                Discard
              </button>
            </div>
          </div>
        ) : (
          <p className="rules-proofbar-idle">
            Change a rule below — this table gains an <strong>After</strong> row.
          </p>
        )}
      </div>

      {/* Numbered decision stages. */}
      <div className="rules-doc">
        {SECTIONS.filter((s) => s.id !== "history").map((group, gi) => {
          const groupCards = CARDS.filter((c) => c.section === group.id);
          const hasDiff = sectionDirty(group.id, draft, savedPolicy);
          return (
            <section
              key={group.id}
              id={`rules-grp-${group.id}`}
              className="rules-group"
              aria-labelledby={`rules-grp-${group.id}-title`}
            >
              <header className="rules-group-head">
                <span className="rules-group-idx" aria-hidden>
                  {String(gi + 1).padStart(2, "0")}
                </span>
                <div className="rules-group-copy">
                  <h3 id={`rules-grp-${group.id}-title`} className="rules-group-title">
                    {group.label}
                  </h3>
                  <p className="rules-group-hint">{group.hint}</p>
                </div>
                {hasDiff && <span className="rules-group-flag">Edited</span>}
              </header>

              {group.id === "rates" && (
                <>
                  <div className="rules-locked">
                    <span className="rules-locked-badge" aria-hidden>
                      Fixed
                    </span>
                    <div>
                      <p className="rules-locked-title">This formula is fixed</p>
                      <p className="rules-locked-body">
                        It used to be two dropdowns. Between them, 8 of the 9 combinations were
                        arithmetically incoherent — a headline % whose denominator disagreed with
                        the Checked figure beside it — and changing one silently rewrote every
                        past report with nothing on the page saying which convention produced it.
                        Only <strong>rework handling</strong> below is still a plant choice.
                      </p>
                    </div>
                  </div>

                  <div className="rules-tiers" aria-label="Plant rejection formula">
                    <div className="rules-tier">
                      <span className="rules-tier-step">1</span>
                      <div className="rules-tier-body">
                        <h5 className="rules-tier-title">Inside a section</h5>
                        <p className="rules-tier-formula">
                          section rejects ÷ section entry checked
                        </p>
                        <p className="rules-tier-ex">
                          Gates share one batch (Visual → Final). Sum all rejects; divide by
                          the entry gate only — never add gate rates.
                        </p>
                      </div>
                    </div>
                    <div className="rules-tier-join" aria-hidden>
                      +
                    </div>
                    <div className="rules-tier">
                      <span className="rules-tier-step">2</span>
                      <div className="rules-tier-body">
                        <h5 className="rules-tier-title">Across sections</h5>
                        <p className="rules-tier-formula">
                          Primary rate + Secondary rate + Assembly rate
                        </p>
                        <p className="rules-tier-ex">
                          Departments are separate populations. Their rates add. Never divide
                          all rejects by one section’s checked count.
                        </p>
                      </div>
                    </div>
                  </div>

                  {sectionRows.length > 0 && (
                    <div className="rules-worked">
                      <div className="rules-worked-head">
                        <span className="rules-worked-title">Live proof — your ledger</span>
                        <span className="rules-worked-scope">
                          {sectionRows.length === 1
                            ? "1 section in view"
                            : `${sectionRows.length} sections in view`}
                        </span>
                      </div>
                      <table className="rules-worked-table">
                        <thead>
                          <tr>
                            <th scope="col">Section</th>
                            <th scope="col">Measured at</th>
                            <th scope="col" className="num">
                              Rejected
                            </th>
                            <th scope="col" className="num">
                              Checked
                            </th>
                            <th scope="col" className="num">
                              Rate
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionRows.map((r) => (
                            <tr key={r.section}>
                              <th scope="row">{SECTION_LABEL[r.section] ?? r.section}</th>
                              <td>{stageLabel(r.entryStageId)}</td>
                              <td className="num">{r.rejected.toLocaleString()}</td>
                              <td className="num">{r.checked.toLocaleString()}</td>
                              <td className="num strong">{(r.rate * 100).toFixed(2)}%</td>
                            </tr>
                          ))}
                          <tr className="rules-worked-total">
                            <th scope="row" colSpan={4}>
                              {sectionRows.length > 1
                                ? sectionRows
                                    .map((r) => `${(r.rate * 100).toFixed(2)}%`)
                                    .join(" + ")
                                : "Plant rejection rate"}
                            </th>
                            <td className="num strong accent">
                              {(sectionRows.reduce((t, r) => t + r.rate, 0) * 100).toFixed(2)}%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="rules-worked-note">
                        Wrong answers this replaces:{" "}
                        <span className="rules-worked-wrong">
                          total rejects ÷ Primary checked
                        </span>{" "}
                        (mixes populations) and{" "}
                        <span className="rules-worked-wrong">sum of every gate’s rate</span>{" "}
                        (counts the Assembly funnel four times).
                      </p>
                    </div>
                  )}
                </>
              )}

              {group.id === "targets" && (
                <div className="rules-ladder">
                  <div className="rules-ladder-head">
                    <span className="rules-ladder-title">Status bands</span>
                    <span className="rules-ladder-scale">0–{ladderMax.toFixed(0)}%</span>
                  </div>
                  <div
                    className="rules-ladder-track"
                    role="img"
                    aria-label={`Watch ${draft.watchRejectionPct}%, target ${draft.targetRejectionPct}%`}
                  >
                    <div className="rules-ladder-zone rules-ladder-zone--good" style={{ width: `${watchPct}%` }} />
                    <div
                      className="rules-ladder-zone rules-ladder-zone--warn"
                      style={{ width: `${Math.max(0, targetPct - watchPct)}%` }}
                    />
                    <div
                      className="rules-ladder-zone rules-ladder-zone--bad"
                      style={{ width: `${Math.max(0, 100 - targetPct)}%` }}
                    />
                    <span className="rules-ladder-mark is-watch" style={{ left: `${watchPct}%` }} />
                    <span className="rules-ladder-mark is-target" style={{ left: `${targetPct}%` }} />
                  </div>
                  <div className="rules-ladder-legend">
                    <span><i className="dot--good" /> Under {draft.watchRejectionPct}%</span>
                    <span><i className="dot--warn" /> {draft.watchRejectionPct}–{draft.targetRejectionPct}%</span>
                    <span><i className="dot--bad" /> Over {draft.targetRejectionPct}%</span>
                  </div>
                  {watchAboveTarget && (
                    <p className="rules-inline-warn rules-ladder-warn" role="alert">
                      Watch must stay below target.
                    </p>
                  )}
                </div>
              )}

              {groupCards.map((card) => {
                const current = draft[card.key];
                const edited =
                  JSON.stringify(draft[card.key]) !== JSON.stringify(savedPolicy[card.key]);
                return (
                  <article key={card.key} className={`rules-decision ${edited ? "is-edited" : ""}`}>
                    <div className="rules-decision-no" aria-hidden>
                      {String(cardNumber.get(card.key)).padStart(2, "0")}
                    </div>
                    <div className="rules-decision-body">
                      <header className="rules-decision-head">
                        <h4 className="rules-decision-title">{card.title}</h4>
                        <p className="rules-decision-summary">{card.summary}</p>
                      </header>

                      {card.choices && (
                        <fieldset className="rules-choices" disabled={!canConfigure}>
                          <legend className="sr-only">{card.title}</legend>
                          {card.choices.map((c) => {
                            const selected = current === c.value;
                            const choiceId = `rule-${card.key}-${c.value}`;
                            return (
                              <label
                                key={c.value}
                                htmlFor={choiceId}
                                className={`rules-choice ${selected ? "is-selected" : ""} ${!canConfigure ? "is-readonly" : ""}`}
                              >
                                <input
                                  id={choiceId}
                                  type="radio"
                                  name={card.key}
                                  className="rules-choice-input"
                                  checked={selected}
                                  disabled={!canConfigure}
                                  onChange={() => set(card.key, c.value as never)}
                                />
                                <span className="rules-choice-radio" aria-hidden>
                                  {selected && <Icon name="check" size={11} stroke={2.8} />}
                                </span>
                                <span className="rules-choice-body">
                                  <span className="rules-choice-label-row">
                                    <span className="rules-choice-label">{c.label}</span>
                                    {c.recommended && <span className="rules-pill">Usual</span>}
                                  </span>
                                  <span className="rules-choice-hint">{c.hint}</span>
                                </span>
                              </label>
                            );
                          })}
                        </fieldset>
                      )}

                      {card.numeric && (
                        <div className="rules-numeric">
                          <label className="settings-field" htmlFor={`num-${card.key}`}>
                            <span className="settings-field-label">{card.numeric.unitLabel}</span>
                            <div className="settings-input-wrap rules-numeric-wrap">
                              {card.numeric.prefix && (
                                <span className="settings-affix settings-affix--l" aria-hidden>
                                  {card.numeric.prefix}
                                </span>
                              )}
                              <input
                                id={`num-${card.key}`}
                                type="number"
                                className={`settings-input rules-num-input ${card.numeric.prefix ? "has-prefix" : ""} ${card.numeric.suffix ? "has-suffix" : ""}`}
                                disabled={!canConfigure}
                                min={card.numeric.min}
                                max={card.numeric.max}
                                step={card.numeric.step}
                                inputMode="decimal"
                                value={Number.isFinite(current as number) ? String(current) : ""}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  set(
                                    card.key,
                                    Math.min(card.numeric!.max, Math.max(card.numeric!.min, n)) as never,
                                  );
                                }}
                              />
                              {card.numeric.suffix && (
                                <span className="settings-affix settings-affix--r" aria-hidden>
                                  {card.numeric.suffix}
                                </span>
                              )}
                            </div>
                          </label>
                        </div>
                      )}

                      <footer className="rules-affects">
                        <span className="rules-affects-lab">Affects</span>
                        <span className="rules-affects-text">{card.affects}</span>
                      </footer>
                    </div>
                  </article>
                );
              })}

              {group.id === "cost" && (
                <article className="rules-decision">
                  <div className="rules-decision-no" aria-hidden>
                    {String(CARDS.length + 1).padStart(2, "0")}
                  </div>
                  <div className="rules-decision-body">
                    <header className="rules-decision-head">
                      <h4 className="rules-decision-title">Cost sunk at each gate</h4>
                      <p className="rules-decision-summary">
                        Share of unit cost already spent when a unit is scrapped (0–1). 1.00 = full unit cost.
                      </p>
                    </header>
                    {stages.length === 0 ? (
                      <div className="rules-empty-block">
                        <p className="rules-empty-title">No gates yet</p>
                        <p className="rules-empty">
                          Add stages on <Link href="/schema">Data Schema</Link>.
                        </p>
                      </div>
                    ) : (
                      <ul className="rules-weight-list">
                        {stages.map((s) => {
                          const val = draft.stageCostWeights[s.stageId] ?? 0.6;
                          const pctW = Math.round(Math.min(1, Math.max(0, val)) * 100);
                          const rupees = Number.isFinite(draft.unitCostInr)
                            ? Math.round(draft.unitCostInr * val)
                            : null;
                          return (
                            <li key={s.stageId} className="rules-weight-row">
                              <div className="rules-weight-meta">
                                <span className="rules-weight-name">{s.label ?? s.stageId}</span>
                                <span className="rules-weight-id">{s.stageId}</span>
                              </div>
                              <div className="rules-weight-bar" aria-hidden>
                                <span className="rules-weight-fill" style={{ width: `${pctW}%` }} />
                              </div>
                              <div className="rules-weight-controls">
                                <label className="settings-input-wrap settings-input-wrap--sm">
                                  <span className="sr-only">Weight for {s.label ?? s.stageId}</span>
                                  <input
                                    type="number"
                                    className="settings-input rules-weight-input"
                                    disabled={!canConfigure}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    inputMode="decimal"
                                    value={Number.isFinite(val) ? String(val) : ""}
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      if (!Number.isFinite(n)) return;
                                      set("stageCostWeights", {
                                        ...draft.stageCostWeights,
                                        [s.stageId]: Math.min(1, Math.max(0, n)),
                                      });
                                    }}
                                  />
                                </label>
                                <span className="rules-weight-readout">
                                  {pctW}%
                                  {rupees != null && (
                                    <span className="rules-weight-inr"> · ₹{rupees.toLocaleString()}</span>
                                  )}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <footer className="rules-affects">
                      <span className="rules-affects-lab">Affects</span>
                      <span className="rules-affects-text">COPQ by stage</span>
                    </footer>
                  </div>
                </article>
              )}
            </section>
          );
        })}

        {/* Audit trail closes the document. */}
        <section id="rules-grp-history" className="rules-group" aria-labelledby="rules-grp-history-title">
          <header className="rules-group-head">
            <span className="rules-group-idx" aria-hidden>
              {String(SECTIONS.filter((s) => s.id !== "history").length + 1).padStart(2, "0")}
            </span>
            <div className="rules-group-copy">
              <h3 id="rules-grp-history-title" className="rules-group-title">
                History
              </h3>
              <p className="rules-group-hint">
                Every save, who made it and why. Nothing here is ever rewritten.
              </p>
            </div>
          </header>

          {baseline && (
            <div className="rules-baseline-card">
              <div>
                <p className="rules-baseline-title">Plant default</p>
                <p className="rules-baseline-meta">
                  {baseline.changedBy}
                  {baseline.changedAt ? ` · ${new Date(baseline.changedAt).toLocaleString()}` : ""}
                  {baseline.note ? ` · ${baseline.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                disabled={!canConfigure}
                onClick={restorePlantDefault}
              >
                Load into editor
              </button>
            </div>
          )}

          {historyLoading && <p className="rules-loading">Loading history…</p>}
          {historyError && (
            <div className="rules-banner rules-banner--warn" role="alert">
              <span>{historyError}</span>
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                onClick={() => void loadPolicyMeta()}
              >
                Retry
              </button>
            </div>
          )}
          {!historyLoading && !historyError && history.length === 0 && (
            <div className="rules-empty-block">
              <p className="rules-empty-title">No saves yet</p>
              <p className="rules-empty">
                Live rules are still the shipped defaults. First save becomes v1.
              </p>
            </div>
          )}
          {!historyLoading && history.length > 0 && (
            <ol className="rules-history">
              {history.map((h, idx) => (
                <li key={h.version} className="rules-history-item">
                  <div className="rules-history-rail" aria-hidden>
                    <span className={`rules-history-node ${idx === 0 ? "is-latest" : ""}`} />
                    {idx < history.length - 1 && <span className="rules-history-line" />}
                  </div>
                  <div className="rules-history-body">
                    <div className="rules-history-meta">
                      <span className="rules-history-ver">v{h.version}</span>
                      {idx === 0 && <span className="rules-pill rules-pill--active">Latest</span>}
                      <span className="rules-history-when">
                        {h.changedAt ? new Date(h.changedAt).toLocaleString() : "—"}
                      </span>
                      <span className="rules-history-who">{h.changedBy}</span>
                    </div>
                    <p className="rules-history-note">{h.note || "No note"}</p>
                    {canConfigure && (
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost rules-history-restore"
                        onClick={() => {
                          setDraft(h.policy);
                          setFieldError(null);
                          setError(null);
                          focusGroup("rates");
                        }}
                      >
                        Load into editor
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="rules-shipped-row">
            <p className="settings-field-help">
              Need the original app math? Load shipped defaults into the editor, then save if you want them live.
            </p>
            <button
              type="button"
              className="settings-btn settings-btn--ghost"
              disabled={!canConfigure || busy}
              onClick={restoreShippedDefaults}
            >
              Load shipped defaults
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
