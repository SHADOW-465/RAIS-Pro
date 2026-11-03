"use client";

// Log (plan §4): one header for Data Entry and Batch Conversion. L1 = entries
// today, pending sync, last saved + "Log a batch". One tab row replaces the
// two pages' separate tab bars: Log a batch | Convert a batch | History |
// Conversions. Tabs on the current route switch in place; the others navigate.
// Access stays on the "data-entry" and "batch-conversion" NavKeys.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEvents } from "@/components/app/EventsContext";
import { usePersona } from "@/components/app/PersonaContext";
import { QualityHeader } from "@/components/app/QualityParts";
import Tabs from "@/components/ui/Tabs";
import { loadShiftBatches } from "@/lib/entry/shift-batches";
import { localDay, logSummary } from "@/lib/entry/log-summary";

export type LogTab = "entry" | "convert" | "history" | "conversions";

const TABS: { id: LogTab; label: string; route: "entry" | "conversion"; href: string }[] = [
  { id: "entry", label: "Log a batch", route: "entry", href: "/log/entry" },
  { id: "convert", label: "Convert a batch", route: "conversion", href: "/log/conversion" },
  { id: "history", label: "History", route: "entry", href: "/log/entry?tab=history" },
  { id: "conversions", label: "Conversions", route: "conversion", href: "/log/conversion?tab=history" },
];

function savedLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return localDay(d) === localDay(new Date()) ? time : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export default function LogHeader({
  route, active, onLocal, intro,
}: {
  route: "entry" | "conversion";
  active: LogTab;
  onLocal: (tab: LogTab) => void;
  intro: string;
}) {
  const router = useRouter();
  const { allowsNav } = usePersona();
  const { events } = useEvents();
  const [shiftRows, setShiftRows] = useState<{ synced?: boolean }[]>([]);
  useEffect(() => { setShiftRows(loadShiftBatches()); }, [events]);

  const s = useMemo(
    () => logSummary((events ?? []) as never[], shiftRows, localDay(new Date())),
    [events, shiftRows],
  );

  const tabs = TABS.filter((t) => allowsNav(t.route === "entry" ? "data-entry" : "batch-conversion"));
  const go = (id: string) => {
    const tab = TABS.find((t) => t.id === id)!;
    if (tab.route === route) {
      onLocal(tab.id);
      window.history.replaceState(null, "", tab.href);
    } else {
      router.push(tab.href);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
      <p style={{ fontSize: "var(--text-md)", margin: 0, color: "var(--text-2)", maxWidth: "70ch" }}>{intro}</p>
      <QualityHeader
        tiles={[
          { label: "Entries today", value: s.entriesToday, status: "neutral", hint: "Saves that reached the ledger" },
          {
            label: "Pending sync", value: s.pendingSync, status: s.pendingSync > 0 ? "warning" : "ok",
            hint: s.pendingSync > 0 ? "Typed here, not on the ledger yet" : "Everything typed here is on the ledger",
          },
          { label: "Last saved", value: savedLabel(s.lastSaved), status: "neutral", hint: "Newest Data Entry save" },
        ]}
        actionLabel={active !== "entry" && allowsNav("data-entry") ? "Log a batch" : undefined}
        onAction={() => go("entry")}
      />
      {tabs.length > 1 && <Tabs ariaLabel="Log" items={tabs.map(({ id, label }) => ({ id, label }))} active={active} onSelect={go} />}
    </div>
  );
}
