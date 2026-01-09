import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UPLC Link - Verify Cardano Smart Contracts",
  description: "Don't trust, verify. Build and verify Aiken smart contracts in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-black text-white">
        {children}
      </body>
    </html>
  );
}
