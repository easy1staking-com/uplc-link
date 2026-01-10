import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/lib/cardano/wallet-provider";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";

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
        <WalletProvider>
          <header className="border-b border-zinc-800 bg-zinc-950">
            <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <Link href="/" className="text-xl font-bold hover:text-gray-300 transition-colors">
                  UPLC Link
                </Link>
                <nav className="flex gap-6">
                  <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Verify
                  </Link>
                  <Link href="/registry" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Registry
                  </Link>
                </nav>
              </div>
              <WalletConnectButton />
            </div>
          </header>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
