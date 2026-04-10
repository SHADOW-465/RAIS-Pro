import type { Metadata } from "next";
import { Inter, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow-semi-condensed",
});

export const metadata: Metadata = {
  title: "RAIS | Rejection Analysis & Intelligence System",
  description: "AI-powered operational data intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${barlowSemiCondensed.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
