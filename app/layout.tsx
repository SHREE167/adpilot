import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans } from "next/font/google";
import { Nav } from "@/components/Nav";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    // data-theme is set by THEME_INIT_SCRIPT before hydration, so React must not fight it.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before paint: saved theme, else OS preference. No flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${body.variable} ${fraunces.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <div className="relative z-10">
          <Nav />
          <main className="w-full pb-24 pt-2">{children}</main>
          <footer className="mx-auto max-w-5xl px-6 pb-12 text-sm text-fog sm:px-12">
            AdPilot does not buy ads or touch any ad account. Optional data sources
            (Google Places, PageSpeed) are read-only and badged LIVE with their date;
            forecasts are ESTIMATE from a local India 2026 rate card. Channel fit is
            XGBoost; product reading is heuristic + optional LLM.
          </footer>
        </div>
      </body>
    </html>
  );
}
