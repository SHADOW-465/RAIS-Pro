"use client";

// /quality, /lots, … are not screens, they are destinations. Send the visitor
// to the first tab their role may open (the sidebar link does the same).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePersona } from "@/components/app/PersonaContext";
import { NAV_DESTINATIONS, NAV_ROUTES } from "@/lib/nav-keys";
import PageLoader from "@/components/app/PageLoader";

export default function FirstTabRedirect({ destination }: { destination: string }) {
  const router = useRouter();
  const { allowsNav } = usePersona();
  useEffect(() => {
    const keys = NAV_DESTINATIONS.find((d) => d.id === destination)?.keys ?? [];
    const open = keys.find((k) => allowsNav(k));
    router.replace((open && NAV_ROUTES[open].href) || "/");
  }, [destination, allowsNav, router]);
  return <PageLoader />;
}
