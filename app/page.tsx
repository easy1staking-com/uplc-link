"use client";

import { useState, useEffect } from "react";

interface ParameterSchema {
  title?: string;
  schema: any;
}

interface VerificationResult {
  success: boolean;
  results: {
    validator: string;
    validatorModule: string;
    validatorName: string;
    purposes: string[];
    parameters?: ParameterSchema[];
    expected: string;
    actual: string;
    matches: boolean | null;
    missing: boolean;
    requiresParams?: boolean;
    parameterized?: boolean;
    compiledCode?: string; // CBOR hex from build
    plutusVersion?: "V1" | "V2" | "V3";
  }[];
  buildLog?: string;
  error?: string;
  warnings?: string[];
}

interface ParameterValue {
  name: string;
  value: string;
  useValidatorRef: boolean; // Whether to use validator reference
  referenceTo?: string; // Which validator to reference
}

interface ValidatorParams {
  [validatorName: string]: ParameterValue[];
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/easy1staking-com/cardano-recurring-payment");
  const [commitHash, setCommitHash] = useState("97a8acf9f4bfcc14f63bc93c0feb2afe14dc9872");
  const [aikenVersion, setAikenVersion] = useState("v1.1.3");
  const [expectedHashes, setExpectedHashes] = useState("abba");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [validatorParams, setValidatorParams] = useState<ValidatorParams>({});
  const [calculatedHashes, setCalculatedHashes] = useState<Record<string, string>>({});

  // Helper: Detect if parameter name suggests hash reference
  const isHashParameter = (paramName: string): boolean => {
    const name = paramName.toLowerCase();
    return name.includes("hash") || name.includes("validator") ||
           name.includes("script") || name.includes("policy");
  };

  // Helper: CBOR-encode a hash (28 bytes = 56 hex chars)
  const cborEncodeHash = (hash: string): string => {
    // Remove any spaces or prefixes
    const cleanHash = hash.trim().replace(/^0x/, "");

    // Validate it's 56 hex characters (28 bytes)
    if (cleanHash.length !== 56) {
      console.warn(`Hash length is ${cleanHash.length}, expected 56. Hash: ${cleanHash}`);
    }

    // CBOR byte string encoding:
    // 0x58 = major type 2 (byte string), 0x1C = length 28 bytes
    return `581C${cleanHash}`;
  };

  // Initialize parameter state from verification results
  const initializeParams = (results: VerificationResult["results"]) => {
    const newParams: ValidatorParams = {};
    results.forEach(validator => {
      if (validator.parameters && validator.parameters.length > 0) {
        newParams[validator.validator] = validator.parameters.map(param => ({
          name: param.title || "param",
          value: "",
          useValidatorRef: isHashParameter(param.title || ""),
          referenceTo: undefined,
        }));
      }
    });
    setValidatorParams(newParams);
  };

  // Helper: Update a parameter value
  const updateParamValue = (validatorName: string, paramIndex: number, field: keyof ParameterValue, value: any) => {
    setValidatorParams(prev => ({
      ...prev,
      [validatorName]: prev[validatorName].map((param, idx) =>
        idx === paramIndex ? { ...param, [field]: value } : param
      ),
    }));
  };

  // Effect: Recalculate hashes when parameters change (client-side)
  useEffect(() => {
    if (typeof window === "undefined") return; // Only run in browser
    if (!verificationResult?.results) return;

    const calculateHashes = async () => {
      try {
        // Dynamically import MeshSDK (client-side only)
        const { applyParamsToScript } = await import("@meshsdk/core-csl");
        const { resolveScriptHash } = await import("@meshsdk/core");

        const newCalculatedHashes: Record<string, string> = {};

        // First pass: populate with unparameterized hashes
        for (const result of verificationResult.results) {
          newCalculatedHashes[result.validator] = result.actual;
        }

        // Multiple passes to handle cascading dependencies
        // (e.g., validator A depends on validator B which depends on validator C)
        let changed = true;
        let maxPasses = 10; // Prevent infinite loops
        let passCount = 0;

        while (changed && passCount < maxPasses) {
          changed = false;
          passCount++;

          for (const result of verificationResult.results) {
            if (!result.compiledCode || !result.plutusVersion) continue;

            const params = validatorParams[result.validator];
            if (!params || params.length === 0) continue;

            // Check if we have any values
            const hasValues = params.some(p => p.value || p.referenceTo);
            if (!hasValues) continue;

            try {
              // Resolve parameter values (handle validator references)
              const resolvedParams = params.map(param => {
                if (param.useValidatorRef && param.referenceTo) {
                  const referencedHash = newCalculatedHashes[param.referenceTo];
                  if (!referencedHash) return "";
                  // CBOR-encode the hash before passing it as a parameter
                  return cborEncodeHash(referencedHash);
                }
                return param.value;
              });

              // Skip if any param is empty
              if (resolvedParams.some(p => !p)) continue;

              // Apply parameters with CBOR data type (parameters are already CBOR-encoded)
              const scriptCbor = applyParamsToScript(result.compiledCode, resolvedParams, "CBOR");
              const hash = resolveScriptHash(scriptCbor, result.plutusVersion);

              // Check if hash changed
              if (newCalculatedHashes[result.validator] !== hash) {
                newCalculatedHashes[result.validator] = hash;
                changed = true; // Need another pass to update dependent validators
              }
            } catch (error) {
              console.error(`Failed to calculate hash for ${result.validator}:`, error);
            }
          }
        }

        setCalculatedHashes(newCalculatedHashes);
      } catch (error) {
        console.error("Failed to load MeshSDK:", error);
      }
    };

    calculateHashes();
  }, [validatorParams, verificationResult]);

  const handleVerify = async () => {
    setStatus("verifying");
    setVerificationResult(null);

    try {
      // Parse expected hashes (JSON array, object, or newline-separated)
      let hashes: string[] | Record<string, string>;
      try {
        hashes = JSON.parse(expectedHashes);
      } catch {
        // Try to parse as "validator: hash" format
        const lines = expectedHashes.split('\n').map(h => h.trim()).filter(Boolean);
        if (lines[0]?.includes(':')) {
          // Named format
          hashes = Object.fromEntries(
            lines.map(line => {
              const [validator, hash] = line.split(':').map(s => s.trim());
              return [validator, hash];
            })
          );
        } else {
          // Array format
          hashes = lines;
        }
      }

      // Note: We don't send validatorParameters to the server anymore
      // Parameters are applied client-side for instant feedback
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

      // Initialize parameter state if we haven't already
      if (Object.keys(validatorParams).length === 0) {
        initializeParams(result.results);
      }
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
                {verificationResult.results.map((r, idx) => {
                  // Use calculated hash if available (from client-side parameterization)
                  const actualHash = calculatedHashes[r.validator] || r.actual;
                  const isParameterized = calculatedHashes[r.validator] && calculatedHashes[r.validator] !== r.actual;
                  const matches = r.missing ? null : actualHash === r.expected;

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded border ${
                        r.missing
                          ? "bg-gray-900 border-gray-700"
                          : matches
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
                          {r.missing ? "⚠️" : matches ? "✅" : "❌"}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm font-mono">
                        {r.parameters && r.parameters.length > 0 && (
                          <div className="mb-2 pb-2 border-b border-gray-700">
                            <span className="text-yellow-400">🔧 Requires Parameters:</span>
                            <ul className="ml-4 mt-1 text-xs">
                              {r.parameters.map((param, pidx) => (
                                <li key={pidx} className="text-gray-300">
                                  • {param.title || `param${pidx}`} ({param.schema?.dataType || "unknown"})
                                </li>
                              ))}
                            </ul>
                            {isParameterized && (
                              <div className="text-green-400 text-xs mt-1">
                                ✓ Parameters applied - hash calculated client-side
                              </div>
                            )}
                            {!isParameterized && (
                              <div className="text-yellow-400 text-xs mt-1">
                                ⚠️ Parameters not applied - showing unparameterized hash
                              </div>
                            )}
                          </div>
                        )}
                        <div>
                          <span className="text-gray-400">Expected:</span>{" "}
                          <span className={r.missing ? "text-yellow-400" : ""}>
                            {r.expected}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Actual:</span> {actualHash}
                          {isParameterized && <span className="text-green-400 ml-2">⚡ Live</span>}
                        </div>
                        {r.missing && (
                          <div className="text-yellow-400 text-xs mt-2">
                            ⚠️ No expected hash provided for this validator
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Parameter Input Section */}
            {verificationResult.results.some(r => r.parameters && r.parameters.length > 0) && (
              <div className="mt-6 p-6 bg-zinc-900 border border-zinc-800 rounded">
                <h3 className="text-lg font-semibold mb-4">Configure Validator Parameters</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Some validators require parameters. Fill in the values below - hashes will update automatically.
                </p>
                <div className="space-y-6">
                  {verificationResult.results
                    .filter(r => r.parameters && r.parameters.length > 0)
                    .map((r) => {
                      const params = validatorParams[r.validator] || [];
                      return (
                        <div key={r.validator} className="border border-zinc-700 rounded p-4">
                          <h4 className="font-medium mb-3">{r.validator}</h4>
                          <div className="space-y-3">
                            {r.parameters!.map((param, pidx) => {
                              const paramValue = params[pidx];
                              if (!paramValue) return null;

                              return (
                                <div key={pidx} className="space-y-2">
                                  <label className="block text-sm font-medium">
                                    {param.title || `Parameter ${pidx + 1}`}
                                    <span className="text-gray-500 ml-2 text-xs">
                                      ({param.schema?.dataType || "unknown"})
                                    </span>
                                  </label>

                                  <div className="flex items-center gap-2 mb-2">
                                    <label className="flex items-center text-sm text-gray-400">
                                      <input
                                        type="checkbox"
                                        checked={paramValue.useValidatorRef}
                                        onChange={(e) => updateParamValue(r.validator, pidx, "useValidatorRef", e.target.checked)}
                                        className="mr-2"
                                      />
                                      Use validator hash reference
                                    </label>
                                  </div>

                                  {paramValue.useValidatorRef ? (
                                    <select
                                      value={paramValue.referenceTo || ""}
                                      onChange={(e) => updateParamValue(r.validator, pidx, "referenceTo", e.target.value)}
                                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-zinc-600"
                                    >
                                      <option value="">Select a validator...</option>
                                      {verificationResult.results.map((v) => {
                                        const currentHash = calculatedHashes[v.validator] || v.actual;
                                        return (
                                          <option key={v.validator} value={v.validator}>
                                            {v.validator} ({currentHash})
                                          </option>
                                        );
                                      })}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={paramValue.value}
                                      onChange={(e) => updateParamValue(r.validator, pidx, "value", e.target.value)}
                                      placeholder="Enter value..."
                                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
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
