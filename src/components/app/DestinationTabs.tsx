"use client";

// The tab bar of a multi-screen destination (Quality, Lots, Log, …). Each tab
// is still its own route, so every tab is bookmarkable and role-gated by the
// same NavKey the proxy checks: a role only sees the tabs it may open.

import { useRouter } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import { usePersona } from "@/components/app/PersonaContext";
import { NAV_ROUTES, NAV_TAB_LABELS, destinationForKey, type NavKey } from "@/lib/nav-keys";

export default function DestinationTabs({ active }: { active: NavKey }) {
  const router = useRouter();
  const { allowsNav } = usePersona();
  const dest = destinationForKey(active);
  const keys = dest?.keys.filter((k) => allowsNav(k)) ?? [];
  if (!dest || keys.length < 2) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <Tabs
        ariaLabel={dest.label}
        active={active}
        onSelect={(id) => {
          const href = NAV_ROUTES[id as NavKey].href;
          if (href && id !== active) router.push(href);
        }}
        items={keys.map((k) => ({ id: k, label: NAV_TAB_LABELS[k] ?? NAV_ROUTES[k].label }))}
      />
    </div>
  );
}
