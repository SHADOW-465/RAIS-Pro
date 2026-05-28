import type { Metadata } from "next";
import {
  Inter_Tight,
  Fraunces,
  JetBrains_Mono,
  Barlow_Semi_Condensed,
} from "next/font/google";
import "./globals.css";
import { TweaksProvider } from "@/components/editorial/TweaksContext";
import TweaksPanel from "@/components/editorial/TweaksPanel";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow-semi-condensed",
});

export const metadata: Metadata = {
  title: "RAIS Pro — The Rejection Report",
  description: "Editorial diagnostic for pharma operations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${interTight.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${barlowSemiCondensed.variable}`}
        data-density="comfortable"
        data-bg="warm"
        data-card="outlined"
        data-chart-style="filled"
        style={{ fontFamily: "var(--sans)" }}
      >
        <TweaksProvider>
          {children}
          <TweaksPanel />
        </TweaksProvider>
      </body>
    </html>
  );
}
