import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/AppProviders";

// Applied before first paint so the theme never flashes: honor a saved choice,
// else fall back to the OS preference. Mirrors src/lib/theme.tsx (THEME_KEY).
const THEME_INIT = `(function(){try{var t=localStorage.getItem('lm.theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Monospace for tabular numerics — currency amounts, quantities, API keys.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
// Editorial serif accent (headlines, pull-quotes) — warm-luxury counterpoint to Inter.
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "LedgerMind — Smart Finance for Small Businesses",
  description:
    "Your AI-powered virtual accountant, bookkeeper, analyst, and CFO — all in one platform. Upload receipts, track expenses, and get intelligent financial insights.",
  keywords: ["AI finance", "expense tracking", "GST", "bookkeeping", "small business"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
