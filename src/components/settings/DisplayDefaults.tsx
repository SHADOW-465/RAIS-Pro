"use client";

// Display defaults — what a screen shows before anyone touches a filter.
//
// This is deliberately NOT in Calculation rules. `defaultSections` is the one
// policy key that changes no number: every rate, count and cost is identical
// whichever way it is set, only the starting scope on screen differs. Sitting it
// next to the rejection formula implied it was arithmetic.
//
// It stays a server-side policy key rather than a browser tweak so the whole
// plant opens on the same view — per-browser display state was what the policy
// work replaced in the first place.
//
// Saves immediately on pick: one field, and the audit note writes itself more
// precisely than a free-text box would.

import { useState } from "react";
import { useRegistry } from "@/components/app/RegistryContext";
import { usePersona } from "@/components/app/PersonaContext";
import { personaDef } from "@/lib/persona";
import Icon from "@/components/editorial/Icon";
import type { CalculationPolicyT } from "@/core/policy/policy";

type Sections = CalculationPolicyT["defaultSections"];

const CHOICES: { value: string; label: string; hint: string; usual?: boolean }[] = [
  {
    value: "assembly",
    label: "Assembly only",
    hint: "P15–P27. Matches what the plant’s own reports mean by “rejection %”.",
    usual: true,
  },
  {
    value: "secondary,assembly",
    label: "Secondary + Assembly",
    hint: "From P10 onward.",
  },
  {
    value: "primary,secondary,assembly",
    label: "Whole plant",
    hint: "Primary + Secondary + Assembly. Every section carries its own denominator, so the headline rate is the sum of three.",
  },
];

const toValue = (v: Sections) => [...v].sort().join(",");

export default function DisplayDefaults() {
  const { policy, refreshRegistry } = useRegistry();
  const { persona, canConfigure } = usePersona();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const current = toValue(policy.defaultSections);

  async function pick(value: string) {
    if (!canConfigure || value === current || saving) return;
    const choice = CHOICES.find((c) => c.value === value);
    setSaving(value);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: { ...policy, defaultSections: value.split(",") as Sections },
          note: `Default floor areas → ${choice?.label ?? value}`,
          changedBy: personaDef(persona).label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      await refreshRegistry();
      setFlash(`Screens now open on ${choice?.label ?? value}.`);
      window.setTimeout(() => setFlash(null), 3200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rules-embed">
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
            <strong>View only.</strong> Switch to General Manager to change the default view.
          </p>
        </div>
      )}

      <div className="rules-doc">
        <section className="rules-group" aria-labelledby="display-sections-title">
          <header className="rules-group-head">
            <span className="rules-group-idx" aria-hidden>
              01
            </span>
            <div className="rules-group-copy">
              <h3 id="display-sections-title" className="rules-group-title">
                Opening floor areas
              </h3>
              <p className="rules-group-hint">Where every screen starts before anyone filters</p>
            </div>
          </header>

          <article className="rules-decision">
            <div className="rules-decision-no" aria-hidden>
              01
            </div>
            <div className="rules-decision-body">
              <header className="rules-decision-head">
                <h4 className="rules-decision-title">Sections in view by default</h4>
                <p className="rules-decision-summary">
                  Changes no number — a rate is the same whichever sections are on screen. This
                  only decides which ones you see first. Anyone can widen or narrow it per session
                  from <strong>Sources &amp; batches</strong> without changing this.
                </p>
              </header>

              <fieldset className="rules-choices" disabled={!canConfigure || saving !== null}>
                <legend className="sr-only">Sections in view by default</legend>
                {CHOICES.map((c) => {
                  const selected = current === c.value;
                  const id = `display-sections-${c.value}`;
                  return (
                    <label
                      key={c.value}
                      htmlFor={id}
                      className={`rules-choice ${selected ? "is-selected" : ""} ${!canConfigure ? "is-readonly" : ""}`}
                    >
                      <input
                        id={id}
                        type="radio"
                        name="display-default-sections"
                        className="rules-choice-input"
                        checked={selected}
                        disabled={!canConfigure || saving !== null}
                        onChange={() => void pick(c.value)}
                      />
                      <span className="rules-choice-radio" aria-hidden>
                        {selected && <Icon name="check" size={11} stroke={2.8} />}
                      </span>
                      <span className="rules-choice-body">
                        <span className="rules-choice-label-row">
                          <span className="rules-choice-label">{c.label}</span>
                          {c.usual && <span className="rules-pill">Usual</span>}
                          {saving === c.value && (
                            <span className="rules-pill">Saving…</span>
                          )}
                        </span>
                        <span className="rules-choice-hint">{c.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <footer className="rules-affects">
                <span className="rules-affects-lab">Affects</span>
                <span className="rules-affects-text">
                  Starting scope on every screen · saved to the plant, not this browser
                </span>
              </footer>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
