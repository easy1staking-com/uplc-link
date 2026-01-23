"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { backendClient } from "@/lib/api/backend-client";
import type { StatsResponseDto } from "@/lib/types/registry";

export default function Home() {
  const router = useRouter();
  const [quickLookup, setQuickLookup] = useState("");
  const [stats, setStats] = useState<StatsResponseDto | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await backendClient.getStats();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Handle quick lookup - detect address vs hash
  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const input = quickLookup.trim();
    if (!input) return;

    // Route to registry with the input as hash parameter
    // The registry page handles both addresses and hashes
    router.push(`/registry?hash=${encodeURIComponent(input)}`);
  };

  // Check if input looks like an address or hash
  const getInputType = (input: string): string => {
    if (input.startsWith("addr1")) return "address";
    if (input.startsWith("stake1")) return "stake address";
    if (/^[a-fA-F0-9]{56}$/.test(input)) return "script hash";
    return "address or hash";
  };

  return (
    <>
      {/* GitHub Fork Ribbon */}
      <a
        href="https://github.com/easy1staking-com/plutus-scan"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-0 right-0 z-50"
      >
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white px-16 py-2 rotate-45 translate-x-12 translate-y-6 shadow-lg hover:from-blue-600 hover:to-blue-800 transition-colors">
          <span className="text-sm font-semibold">Fork me on GitHub</span>
        </div>
      </a>

      <main className="min-h-screen p-8 max-w-5xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-16 pt-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <h1 className="text-5xl font-bold">UPLC Link</h1>
            <span
              className="px-2 py-1 bg-orange-900/50 border border-orange-600 rounded text-orange-200 text-xs font-semibold cursor-help"
              title="Alpha software - Expect bugs and issues. Always verify results independently."
            >
              ALPHA
            </span>
          </div>
          <p className="text-xl text-gray-400 mb-4">Don&apos;t trust, verify.</p>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Open-source Cardano smart contract verification tool.
            Verify source code against on-chain scripts, explore the registry, and build trust.
          </p>
        </div>

        {/* Stats Section */}
        {stats && (
          <div className="flex justify-center gap-8 mb-12">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400">{stats.verifications}</div>
              <div className="text-sm text-gray-500">Verifications</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400">{stats.scripts}</div>
              <div className="text-sm text-gray-500">Smart Contracts</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-400">{stats.repositories}</div>
              <div className="text-sm text-gray-500">Repositories</div>
            </div>
          </div>
        )}
        {statsLoading && (
          <div className="flex justify-center gap-8 mb-12">
            <div className="text-center animate-pulse">
              <div className="text-3xl font-bold text-gray-600">--</div>
              <div className="text-sm text-gray-500">Verifications</div>
            </div>
            <div className="text-center animate-pulse">
              <div className="text-3xl font-bold text-gray-600">--</div>
              <div className="text-sm text-gray-500">Smart Contracts</div>
            </div>
            <div className="text-center animate-pulse">
              <div className="text-3xl font-bold text-gray-600">--</div>
              <div className="text-sm text-gray-500">Repositories</div>
            </div>
          </div>
        )}

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Verify Card */}
          <Link
            href="/verify"
            className="group p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-blue-600 transition-all hover:shadow-lg hover:shadow-blue-900/20"
          >
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">Verify</h2>
            <p className="text-gray-400 text-sm">
              Verify smart contract source code against on-chain scripts.
              Build from source and compare hashes.
            </p>
            <div className="mt-4 text-blue-500 text-sm font-medium group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Start verification
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Registry Card */}
          <Link
            href="/registry"
            className="group p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-green-600 transition-all hover:shadow-lg hover:shadow-green-900/20"
          >
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-green-400 transition-colors">Registry</h2>
            <p className="text-gray-400 text-sm">
              Search and explore verified smart contracts on Cardano.
              Find contracts by hash, address, or repository.
            </p>
            <div className="mt-4 text-green-500 text-sm font-medium group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Explore registry
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Docs Card */}
          <Link
            href="/docs"
            className="group p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-purple-600 transition-all hover:shadow-lg hover:shadow-purple-900/20"
          >
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-purple-400 transition-colors">Documentation</h2>
            <p className="text-gray-400 text-sm">
              Learn how to verify and submit smart contracts.
              Understand the verification process and metadata format.
            </p>
            <div className="mt-4 text-purple-500 text-sm font-medium group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Read docs
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Quick Lookup Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Quick Lookup</h3>
          <p className="text-gray-400 text-sm mb-4">
            Check if a smart contract is verified by entering its address or script hash.
          </p>
          <form onSubmit={handleQuickLookup} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={quickLookup}
                onChange={(e) => setQuickLookup(e.target.value)}
                placeholder="Paste address or script hash..."
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-zinc-600 font-mono text-sm"
              />
              {quickLookup && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  {getInputType(quickLookup)}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!quickLookup.trim()}
              className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              Check
            </button>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-zinc-800 text-center text-gray-500 text-sm">
          <p>
            Built by{" "}
            <a
              href="https://easy1staking.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Easy1Staking
            </a>
            {" "}for the Cardano community.
          </p>
        </footer>
      </main>
    </>
  );
}
