import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/** Midnight Pro: Geist for text and headlines, Geist Mono for numbers. */
const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-num",
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
        {/* Before paint: saved theme, else dark (the default identity). No flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <div className="relative">
          <Nav />
          <main className="w-full pb-24">{children}</main>
          <footer className="page border-t border-rule pb-12 pt-8 text-center text-sm text-fog">
            <p className="mx-auto max-w-[70ch]">
              AdPilot does not buy ads or touch any ad account. Optional data sources (Google Places, PageSpeed,
              YouTube, Meta) are read-only and badged LIVE with their date; forecasts are ESTIMATE from a local India
              2026 rate card. Channel fit is XGBoost; product reading is heuristic + optional LLM.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
