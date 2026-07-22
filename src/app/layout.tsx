import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { TweaksProvider } from "@/components/editorial/TweaksContext";
import { EventsProvider } from "@/components/app/EventsContext";
import { RegistryProvider } from "@/components/app/RegistryContext";

export const metadata: Metadata = {
  title: "RAIS Pro — Rejection Diagnostic",
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
      <body className={GeistSans.className}>
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
          <EventsProvider>
            <RegistryProvider>
              {children}
            </RegistryProvider>
          </EventsProvider>
        </TweaksProvider>
      </body>
    </html>
  );
}
