import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import { WalletProvider } from "@/lib/cardano/wallet-provider";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { NetworkBadge } from "@/components/NetworkBadge";

export const metadata: Metadata = {
  title: {
    default: "UPLC Link - Cardano Smart Contract Verification",
    template: "%s | UPLC Link"
  },
  description: "Don't trust, verify. Build and verify Aiken smart contracts in your browser. Open-source registry for verified Cardano smart contracts.",
  keywords: ["Cardano", "Smart Contracts", "Aiken", "UPLC", "Plutus", "Blockchain", "Verification", "DApp"],
  authors: [{ name: "UPLC Link" }],
  creator: "UPLC Link",
  publisher: "UPLC Link",
  metadataBase: new URL('https://uplc.link'),

  // Open Graph
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://uplc.link',
    title: 'UPLC Link - Cardano Smart Contract Verification',
    description: 'Don\'t trust, verify. Build and verify Aiken smart contracts in your browser. Open-source registry for verified Cardano smart contracts.',
    siteName: 'UPLC Link',
    images: [
      {
        url: '/api/og?type=home',
        width: 1200,
        height: 630,
        alt: 'UPLC Link - Cardano Smart Contract Verification',
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'UPLC Link - Cardano Smart Contract Verification',
    description: 'Don\'t trust, verify. Build and verify Aiken smart contracts in your browser.',
    images: ['/api/og?type=home'],
    creator: '@uplclink',
  },

  // Icons
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },

  // Manifest
  manifest: '/manifest.json',

  // Canonical URL
  alternates: {
    canonical: 'https://uplc.link',
  },

  // Other metadata
  applicationName: 'UPLC Link',
  referrer: 'origin-when-cross-origin',
  category: 'technology',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "UPLC Link",
    "url": "https://uplc.link",
    "description": "Don't trust, verify. Build and verify Aiken smart contracts in your browser. Open-source registry for verified Cardano smart contracts.",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "creator": {
      "@type": "Organization",
      "name": "UPLC Link"
    },
    "keywords": "Cardano, Smart Contracts, Aiken, UPLC, Plutus, Blockchain, Verification, DApp",
    "inLanguage": "en-US",
    "browserRequirements": "Requires JavaScript. Requires HTML5."
  };

  return (
    <html lang="en">
      <head>
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />

        {/*
          Search Console Verification (add your verification codes here when ready):
          <meta name="google-site-verification" content="YOUR_CODE" />
          <meta name="msvalidate.01" content="YOUR_CODE" />
        */}
      </head>
      <body className="antialiased bg-black text-white">
        <WalletProvider>
          <header className="border-b border-zinc-800 bg-zinc-950">
            <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
                  <div className="w-8 h-8 relative">
                    <Image
                      src="/favicon.svg"
                      alt="UPLC Link Logo"
                      width={32}
                      height={32}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <span className="text-xl font-bold">UPLC Link</span>
                </Link>
                <NetworkBadge />
                <nav className="flex gap-6">
                  <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Verify
                  </Link>
                  <Link href="/registry" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Registry
                  </Link>
                  <Link href="/docs" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Docs
                  </Link>
                </nav>
              </div>
              <WalletConnectButton />
            </div>
          </header>
          {children}

          {/* Footer */}
          <footer className="border-t border-zinc-800 bg-zinc-950 mt-16">
            <div className="max-w-6xl mx-auto px-8 py-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* About */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <Image
                      src="/favicon.svg"
                      alt="UPLC Link Logo"
                      width={32}
                      height={32}
                    />
                    <span className="text-lg font-bold">UPLC Link</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    Open-source tool for verifying Cardano smart contracts built with Aiken.
                  </p>
                  <p className="text-xs text-gray-500">
                    Built on Cardano, powered by Aiken
                  </p>
                </div>

                {/* Credits & Sponsors */}
                <div>
                  <h3 className="text-sm font-semibold mb-4">Credits</h3>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <span className="text-gray-400">Sponsored by:</span>
                      <br />
                      <a
                        href="https://easy1staking.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        EASY1 Stake Pool
                      </a>
                    </li>
                    <li className="text-gray-500 text-xs">
                      Supporting Cardano decentralization
                    </li>
                  </ul>
                </div>

                {/* Links */}
                <div>
                  <h3 className="text-sm font-semibold mb-4">Links</h3>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <Link href="/docs" className="text-gray-400 hover:text-white transition-colors">
                        📖 Documentation
                      </Link>
                    </li>
                    <li>
                      <a
                        href="https://api.uplc.link/swagger-ui.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        📚 API Reference
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://github.com/nemo83"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        👨‍💻 @nemo83 (Maintainer)
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://github.com/easy1staking-com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        🏢 EASY1 Staking GitHub
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://twitter.com/cryptojoe101"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        𝕏 @cryptojoe101
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://cardano.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        ◎ Cardano
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://aiken-lang.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        🔧 Aiken
                      </a>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="mt-8 pt-8 border-t border-zinc-800 text-center">
                <p className="text-sm text-gray-500">
                  Open source under Apache 2.0 License •{' '}
                  <a
                    href="https://github.com/easy1staking-com/plutus-scan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View on GitHub
                  </a>
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Made with ❤️ for the Cardano community •{' '}
                  <a
                    href="https://claude.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gray-400"
                  >
                    Built with Claude
                  </a>
                </p>
              </div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
