"use client";

import { ClerkProvider } from "@clerk/nextjs";

const ACCENT = "#2563EB";

export function MoidClerkProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return children;
  return (
    <ClerkProvider
      signInUrl="/login"
      signUpUrl="/login"
      afterSignOutUrl="/login"
      appearance={{
        variables: {
          colorPrimary: ACCENT,
          colorPrimaryForeground: "#ffffff",
          colorBackground: "#ffffff",
          colorForeground: "#0f172a",
          borderRadius: "8px",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
