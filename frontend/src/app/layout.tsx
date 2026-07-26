import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";

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
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} antialiased`}>{children}</body>
    </html>
  );
}
