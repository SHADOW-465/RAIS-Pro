import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { TweaksProvider } from "@/components/editorial/TweaksContext";
import { EventsProvider } from "@/components/app/EventsContext";
import { LineageProvider } from "@/components/app/LineageContext";
import { RegistryProvider } from "@/components/app/RegistryContext";
import { PersonaProvider } from "@/components/app/PersonaContext";
import { ActiveMetricProvider } from "@/components/app/ActiveMetricContext";
import { ConfirmProvider } from "@/components/ui/ConfirmContext";
import { BuildWatcher } from "@/components/app/BuildWatcher";
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
                // lib/storage.ts wraps the saved theme; plain "theme" is the pre-wrapper key.
                let theme = null;
                try { theme = JSON.parse(localStorage.getItem('moid:theme')).data; } catch (_) {}
                if (theme !== 'light' && theme !== 'dark') theme = localStorage.theme;
                if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', theme);
              } catch (_) {}
            `,
          }}
        />
        <BuildWatcher />
        <TweaksProvider>
          <PersonaProvider>
            <EventsProvider>
              <LineageProvider>
                <RegistryProvider>
                  <ActiveMetricProvider>
                    <ConfirmProvider>{children}</ConfirmProvider>
                  </ActiveMetricProvider>
                </RegistryProvider>
              </LineageProvider>
            </EventsProvider>
          </PersonaProvider>
        </TweaksProvider>
      </body>
    </html>
  );
}
