import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { TweaksProvider } from "@/components/editorial/TweaksContext";
import { EventsProvider } from "@/components/app/EventsContext";
import { RegistryProvider } from "@/components/app/RegistryContext";
import { PersonaProvider } from "@/components/app/PersonaContext";
import { ActiveMetricProvider } from "@/components/app/ActiveMetricContext";
import { ConfirmProvider } from "@/components/ui/ConfirmContext";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
  description: "Soft modern diagnostic briefing for plant operations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      {/* Grammarly and similar extensions inject data-gr-* on <body> before
          React hydrates. suppressHydrationWarning is one level deep, so html
          above does not cover this tag. */}
      <body className={GeistSans.className} suppressHydrationWarning>
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
              } catch (_) {}
            `,
          }}
        />
        <TweaksProvider>
          <PersonaProvider>
            <EventsProvider>
              <RegistryProvider>
                <ActiveMetricProvider>
                  <ConfirmProvider>{children}</ConfirmProvider>
                </ActiveMetricProvider>
              </RegistryProvider>
            </EventsProvider>
          </PersonaProvider>
        </TweaksProvider>
      </body>
    </html>
  );
}
