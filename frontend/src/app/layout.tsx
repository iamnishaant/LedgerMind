import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Monospace for tabular numerics — currency amounts, quantities, API keys.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "AI FinanceOS — Smart Finance for Small Businesses",
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
