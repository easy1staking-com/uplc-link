"use client";

import { useState } from "react";

interface VerificationResult {
  success: boolean;
  results: {
    validator: string;
    validatorModule: string;
    validatorName: string;
    purposes: string[];
    expected: string;
    actual: string;
    matches: boolean | null;
    missing: boolean;
  }[];
  buildLog?: string;
  error?: string;
  warnings?: string[];
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/easy1staking-com/cardano-recurring-payment");
  const [commitHash, setCommitHash] = useState("97a8acf9f4bfcc14f63bc93c0feb2afe14dc9872");
  const [aikenVersion, setAikenVersion] = useState("v1.1.3");
  const [expectedHashes, setExpectedHashes] = useState("abba");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  const handleVerify = async () => {
    setStatus("verifying");
    setVerificationResult(null);

    try {
      // Parse expected hashes (JSON array or newline-separated)
      let hashes: string[];
      try {
        hashes = JSON.parse(expectedHashes);
      } catch {
        hashes = expectedHashes.split('\n').map(h => h.trim()).filter(Boolean);
      }

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          commitHash,
          aikenVersion,
          expectedHashes: hashes,
        }),
      });

      const result: VerificationResult = await response.json();

      if (result.success) {
        setStatus("success");
      } else {
        setStatus("error");
      }

      setVerificationResult(result);
    } catch (error) {
      setStatus("error");
      setVerificationResult({
        success: false,
        results: [],
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-2">Plutus Scan</h1>
        <p className="text-gray-400">Don&apos;t trust, verify.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">GitHub Repository URL</label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/username/repo"
            className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Commit Hash</label>
          <input
            type="text"
            value={commitHash}
            onChange={(e) => setCommitHash(e.target.value)}
            placeholder="abc123def456..."
            className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600 font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Aiken Version</label>
          <input
            type="text"
            value={aikenVersion}
            onChange={(e) => setAikenVersion(e.target.value)}
            placeholder="v1.0.0"
            className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Expected Hashes (one per line or JSON array)
          </label>
          <textarea
            value={expectedHashes}
            onChange={(e) => setExpectedHashes(e.target.value)}
            placeholder={'hash1\nhash2\nhash3\n\nor\n\n["hash1", "hash2", "hash3"]'}
            rows={5}
            className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600 font-mono text-sm"
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={status === "verifying" || !repoUrl || !commitHash || !aikenVersion || !expectedHashes}
          className="w-full px-6 py-3 bg-white text-black font-medium rounded hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          {status === "verifying" ? "Verifying..." : "Verify Contract"}
        </button>

        {verificationResult && (
          <div className="space-y-4">
            {verificationResult.error && (
              <div className="p-4 rounded border bg-red-950 border-red-800 text-red-200">
                <p className="font-bold">Error:</p>
                <p className="font-mono text-sm mt-2">{verificationResult.error}</p>
              </div>
            )}

            {verificationResult.warnings && verificationResult.warnings.length > 0 && (
              <div className="p-4 rounded border bg-yellow-950 border-yellow-800 text-yellow-200">
                <p className="font-bold">⚠️ Warnings:</p>
                {verificationResult.warnings.map((warning, idx) => (
                  <p key={idx} className="text-sm mt-2">{warning}</p>
                ))}
              </div>
            )}

            {verificationResult.results.length > 0 && (
              <div className="space-y-2">
                {verificationResult.results.map((r, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded border ${
                      r.missing
                        ? "bg-gray-900 border-gray-700"
                        : r.matches
                        ? "bg-green-950 border-green-800"
                        : "bg-red-950 border-red-800"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium text-lg">{r.validatorModule}.{r.validatorName}</div>
                        {r.purposes.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            Purposes: {r.purposes.join(", ")}
                          </div>
                        )}
                      </div>
                      <span className="text-2xl">
                        {r.missing ? "⚠️" : r.matches ? "✅" : "❌"}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm font-mono">
                      <div>
                        <span className="text-gray-400">Expected:</span>{" "}
                        <span className={r.missing ? "text-yellow-400" : ""}>
                          {r.expected}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Actual:</span> {r.actual}
                      </div>
                      {r.missing && (
                        <div className="text-yellow-400 text-xs mt-2">
                          ⚠️ No expected hash provided for this validator
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {verificationResult.buildLog && (
              <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
                <summary className="cursor-pointer font-medium">Build Log</summary>
                <pre className="mt-4 text-xs overflow-x-auto text-gray-400">
                  {verificationResult.buildLog}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
