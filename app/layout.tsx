import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Syne } from "next/font/google";
import { FloatingOrbs } from "@/components/Motion";
import { Nav } from "@/components/Nav";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AdPilot — India media mix, estimated",
  description:
    "Plan a channel mix, budget split, and outreach for India. All numbers are ESTIMATE from a local rate card. No live ad buying.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${syne.variable} ${fraunces.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <FloatingOrbs />
        <div className="grain" />
        <div className="relative z-10">
          <Nav />
          <main className="w-full pb-24 pt-2">{children}</main>
          <footer className="mx-auto max-w-5xl px-6 pb-12 text-sm text-fog sm:px-12">
            AdPilot does not buy ads or connect to Meta/Google. Every metric is an
            ESTIMATE from a local India 2026 rate card. Channel fit is XGBoost;
            product reading is heuristic + optional LLM.
          </footer>
        </div>
      </body>
    </html>
  );
}
