import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Lora,
  JetBrains_Mono,
  Barlow_Semi_Condensed,
} from "next/font/google";
import "./globals.css";
import { TweaksProvider } from "@/components/editorial/TweaksContext";
import TweaksPanel from "@/components/editorial/TweaksPanel";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-lora",
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
        className={`${plusJakartaSans.variable} ${lora.variable} ${jetbrainsMono.variable} ${barlowSemiCondensed.variable}`}
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
