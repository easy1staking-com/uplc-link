"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { backendClient } from "@/lib/api/backend-client";
import { SubmitToRegistry } from "@/components/verification/SubmitToRegistry";
import { encodeParameterValue } from "@/lib/cardano/cbor-encoding";
import type { VerificationResponseDto } from "@/lib/types/registry";

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
    hash: string;
    parameters?: ParameterSchema[];
    expected: string;
    actual: string;
    matches: boolean | null;
    missing: boolean;
    requiresParams?: boolean;
    parameterized?: boolean;
    compiledCode?: string;
    plutusVersion?: "V1" | "V2" | "V3";
  }[];
  buildLog?: string;
  error?: string;
  warnings?: string[];
}

interface ParameterValue {
  name: string;
  value: string;
  useValidatorRef: boolean;
  referenceTo?: string;
  rawCborMode: boolean;
}

interface ValidatorParams {
  [hash: string]: ParameterValue[];
}

function VerifyPageContent() {
  const searchParams = useSearchParams();
  const txHash = searchParams.get("txHash");

  // Deep link loading state
  const [deepLinkLoading, setDeepLinkLoading] = useState(!!txHash);
  const [deepLinkError, setDeepLinkError] = useState<string>("");
  const [deepLinkData, setDeepLinkData] = useState<VerificationResponseDto | null>(null);

  // Form state
  const [repoUrl, setRepoUrl] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [aikenVersion, setAikenVersion] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [aikenVersions, setAikenVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [expectedHashes, setExpectedHashes] = useState("");
  const [parsedExpectedHashes, setParsedExpectedHashes] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [validatorParams, setValidatorParams] = useState<ValidatorParams>({});
  const [calculatedHashes, setCalculatedHashes] = useState<Record<string, string>>({});

  // Track if we should auto-verify after loading
  const [shouldAutoVerify, setShouldAutoVerify] = useState(false);

  // Helper functions (same as main page)
  const isHashParameter = (paramName: string): boolean => {
    const name = paramName.toLowerCase();
    return name.includes("hash") || name.includes("validator") ||
           name.includes("script") || name.includes("policy");
  };

  const getParameterType = (schema: any): string => {
    if (!schema) return "unknown";
    if (schema.dataType) {
      if (schema.dataType === "map") return "map (CBOR)";
      if (schema.dataType === "constructor" || schema.dataType === "list") {
        return `${schema.dataType} (CBOR)`;
      }
      return schema.dataType;
    }
    if (schema.$ref) {
      const refParts = schema.$ref.split('/');
      const typeName = refParts[refParts.length - 1];
      const cleaned = typeName.replace(/~1/g, '/').replace(/~0/g, '~');
      const parts = cleaned.split('/');
      return parts[parts.length - 1];
    }
    if (schema.items) {
      const itemType = getParameterType(schema.items);
      return `List<${itemType}>`;
    }
    if (schema.keys && schema.values) return "map (CBOR)";
    if (schema.anyOf && schema.anyOf.length > 0) {
      return schema.anyOf[0].title || "constructor (CBOR)";
    }
    return "unknown";
  };

  const isComplexType = (schema: any): boolean => {
    if (!schema) return false;
    return !isByteArrayType(schema) && !isIntegerType(schema);
  };

  const isByteArrayType = (schema: any): boolean => {
    if (!schema) return false;
    const type = getParameterType(schema).toLowerCase();
    return type.includes('byte') || type.includes('hash') || type.includes('policy');
  };

  const isIntegerType = (schema: any): boolean => {
    if (!schema) return false;
    const type = getParameterType(schema).toLowerCase();
    return type.includes('int') || type === 'integer';
  };

  const cborEncodeHash = (hash: string): string => {
    const cleanHash = hash.trim().replace(/^0x/, "");
    return `581C${cleanHash}`;
  };

  // Fetch Aiken versions on mount
  useEffect(() => {
    const fetchVersions = async () => {
      setLoadingVersions(true);
      try {
        const response = await fetch("https://api.github.com/repos/aiken-lang/aiken/releases?per_page=50");
        const releases = await response.json();
        const versions = releases
          .map((release: any) => release.tag_name)
          .filter((tag: string) => tag.startsWith("v"));
        setAikenVersions(versions);
        if (versions.length > 0 && !aikenVersion) {
          setAikenVersion(versions[0]);
        }
      } catch (error) {
        console.error("Failed to fetch Aiken versions:", error);
        setAikenVersions(["v1.1.3", "v1.1.2", "v1.1.1", "v1.1.0", "v1.0.29"]);
        if (!aikenVersion) setAikenVersion("v1.1.3");
      } finally {
        setLoadingVersions(false);
      }
    };
    fetchVersions();
  }, []);

  // Fetch deep link data when txHash is present
  useEffect(() => {
    if (!txHash) return;

    const fetchDeepLinkData = async () => {
      setDeepLinkLoading(true);
      setDeepLinkError("");

      try {
        const data = await backendClient.getVerificationByTxHash(txHash);
        setDeepLinkData(data);

        // Pre-populate form fields
        setRepoUrl(data.sourceUrl);
        setCommitHash(data.commitHash);
        setSourcePath(data.sourcePath || "");

        // Set compiler version (strip 'v' prefix if needed for matching)
        const version = data.compilerVersion.startsWith('v')
          ? data.compilerVersion
          : `v${data.compilerVersion}`;
        setAikenVersion(version);

        // Build expected hashes from stored scripts (deduplicated)
        // Note: Aiken alpha and non-alpha versions group scripts differently by purpose,
        // but the hash is the same - so we deduplicate to get unique script hashes
        const hashes = [...new Set(
          data.scripts
            .map(s => s.finalHash || s.rawHash)
            .filter(Boolean)
        )];
        setExpectedHashes(hashes.join('\n'));

        // Trigger auto-verification after form is populated
        setShouldAutoVerify(true);
      } catch (error) {
        console.error("Failed to fetch verification data:", error);
        setDeepLinkError(
          error instanceof Error
            ? error.message
            : "Failed to load verification data"
        );
      } finally {
        setDeepLinkLoading(false);
      }
    };

    fetchDeepLinkData();
  }, [txHash]);

  // Parse expected hashes
  useEffect(() => {
    if (!expectedHashes.trim()) {
      setParsedExpectedHashes([]);
      return;
    }

    try {
      const parsed = JSON.parse(expectedHashes);
      if (Array.isArray(parsed)) {
        setParsedExpectedHashes(parsed.filter(Boolean) as string[]);
      } else if (typeof parsed === "object") {
        setParsedExpectedHashes(Object.values(parsed).filter(Boolean) as string[]);
      }
    } catch {
      const lines = expectedHashes
        .split(/[\n,]/)
        .map(line => {
          if (line.includes(':')) {
            return line.split(':')[1]?.trim();
          }
          return line.trim();
        })
        .filter(Boolean);
      setParsedExpectedHashes(lines);
    }
  }, [expectedHashes]);

  // Recalculate hashes when parameters change
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!verificationResult?.results) return;

    const calculateHashes = async () => {
      try {
        const { applyParamsToScript } = await import("@meshsdk/core-csl");
        const { resolveScriptHash } = await import("@meshsdk/core");

        const newCalculatedHashes: Record<string, string> = {};

        for (const result of verificationResult.results) {
          newCalculatedHashes[result.hash] = result.actual;
        }

        let changed = true;
        let maxPasses = 10;
        let passCount = 0;

        while (changed && passCount < maxPasses) {
          changed = false;
          passCount++;

          for (const result of verificationResult.results) {
            if (!result.compiledCode || !result.plutusVersion) continue;

            const params = validatorParams[result.hash];
            if (!params || params.length === 0) continue;

            const hasValues = params.some(p => p.value || p.referenceTo);
            if (!hasValues) continue;

            try {
              const resolvedParams = params.map((param, paramIdx) => {
                if (param.useValidatorRef && param.referenceTo) {
                  const referencedHash = newCalculatedHashes[param.referenceTo];
                  if (!referencedHash) return "";
                  return cborEncodeHash(referencedHash);
                }

                if (!param.value) return "";

                const paramSchema = result.parameters?.[paramIdx];
                const paramType = paramSchema ? getParameterType(paramSchema.schema) : "unknown";

                try {
                  return encodeParameterValue(param.value, paramType, param.rawCborMode);
                } catch (error) {
                  console.error(`Parameter encoding error for ${param.name}:`, error);
                  return "";
                }
              });

              if (resolvedParams.some(p => !p)) continue;

              const scriptCbor = applyParamsToScript(result.compiledCode, resolvedParams, "CBOR");
              const hash = resolveScriptHash(scriptCbor, result.plutusVersion);

              if (newCalculatedHashes[result.hash] !== hash) {
                newCalculatedHashes[result.hash] = hash;
                changed = true;
              }
            } catch (error) {
              console.error(`Failed to calculate hash for ${result.hash}:`, error);
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

  // Initialize params with stored values from deep link
  const initializeParamsFromDeepLink = (
    results: VerificationResult["results"],
    deepLinkScripts: VerificationResponseDto["scripts"]
  ) => {
    const newParams: ValidatorParams = {};

    results.forEach(validator => {
      if (validator.parameters && validator.parameters.length > 0) {
        // Find matching script from deep link data by raw hash
        const storedScript = deepLinkScripts.find(s => s.rawHash === validator.hash);
        const storedParams = storedScript?.providedParameters || [];

        newParams[validator.hash] = validator.parameters.map((param, idx) => {
          const storedValue = storedParams[idx] || "";
          const isComplex = isComplexType(param.schema);

          return {
            name: param.title || "param",
            value: storedValue, // Pre-fill with stored CBOR value
            useValidatorRef: false, // Use raw value mode since we have CBOR
            referenceTo: undefined,
            rawCborMode: true, // Stored values are already CBOR-encoded
          };
        });
      }
    });

    setValidatorParams(newParams);
  };

  // Initialize params without deep link data
  const initializeParams = (results: VerificationResult["results"]) => {
    const newParams: ValidatorParams = {};
    results.forEach(validator => {
      if (validator.parameters && validator.parameters.length > 0) {
        newParams[validator.hash] = validator.parameters.map(param => {
          const isComplex = isComplexType(param.schema);
          return {
            name: param.title || "param",
            value: "",
            useValidatorRef: isHashParameter(param.title || ""),
            referenceTo: undefined,
            rawCborMode: isComplex,
          };
        });
      }
    });
    setValidatorParams(newParams);
  };

  const updateParamValue = (hash: string, paramIndex: number, field: keyof ParameterValue, value: any) => {
    setValidatorParams(prev => ({
      ...prev,
      [hash]: prev[hash].map((param, idx) =>
        idx === paramIndex ? { ...param, [field]: value } : param
      ),
    }));
  };

  const handleVerify = async () => {
    setStatus("verifying");
    setVerificationResult(null);

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          commitHash,
          aikenVersion,
          sourcePath: sourcePath || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const result: VerificationResult = await response.json();

      if (result.success) {
        setStatus("success");
      } else {
        setStatus("error");
      }

      setVerificationResult(result);

      // Initialize parameters - use deep link data if available
      if (Object.keys(validatorParams).length === 0) {
        if (deepLinkData) {
          initializeParamsFromDeepLink(result.results, deepLinkData.scripts);
        } else {
          initializeParams(result.results);
        }
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

  // Auto-verify when form is populated from deep link
  useEffect(() => {
    if (shouldAutoVerify && repoUrl && commitHash && aikenVersion && expectedHashes) {
      setShouldAutoVerify(false);
      handleVerify();
    }
  }, [shouldAutoVerify, repoUrl, commitHash, aikenVersion, expectedHashes]);

  // Loading state for deep link
  if (deepLinkLoading) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">UPLC Link</h1>
          <p className="text-gray-400">Loading verification data...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3 text-gray-400">Fetching verification from transaction {txHash?.substring(0, 16)}...</span>
        </div>
      </main>
    );
  }

  // Error state for deep link
  if (deepLinkError) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">UPLC Link</h1>
          <p className="text-gray-400">Verification Error</p>
        </div>
        <div className="p-4 bg-red-950 border border-red-800 rounded text-red-200">
          <p className="font-bold">Failed to load verification data</p>
          <p className="mt-2">{deepLinkError}</p>
          <p className="mt-4 text-sm">
            Transaction hash: <code className="font-mono">{txHash}</code>
          </p>
        </div>
        <a
          href="/"
          className="inline-block mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          Go to Manual Verification
        </a>
      </main>
    );
  }

  return (
    <>
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

      <main className="min-h-screen p-8 max-w-2xl mx-auto pb-32">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold">UPLC Link</h1>
            <span
              className="px-2 py-1 bg-orange-900/50 border border-orange-600 rounded text-orange-200 text-xs font-semibold cursor-help"
              title="Alpha software - Expect bugs and issues. Always verify results independently."
            >
              ALPHA
            </span>
          </div>
          <p className="text-gray-400">Don&apos;t trust, verify.</p>
          {txHash && deepLinkData && (
            <div className="mt-2 px-3 py-2 bg-blue-950 border border-blue-800 rounded text-blue-200 text-sm">
              Loaded from transaction: <code className="font-mono">{txHash.substring(0, 16)}...</code>
            </div>
          )}
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
            <select
              value={aikenVersion}
              onChange={(e) => setAikenVersion(e.target.value)}
              disabled={loadingVersions}
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600"
            >
              {loadingVersions ? (
                <option>Loading versions...</option>
              ) : (
                <>
                  <option value="">Select Aiken version...</option>
                  {aikenVersions.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Source Path <span className="text-gray-500 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="e.g., contracts/my-project"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Path within the repository to the Aiken project root (leave empty if at repository root)
            </p>
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
                  <p className="font-bold">Warnings:</p>
                  {verificationResult.warnings.map((warning, idx) => (
                    <p key={idx} className="text-sm mt-2">{warning}</p>
                  ))}
                </div>
              )}

              {/* Overall verification summary */}
              {verificationResult.results.length > 0 && parsedExpectedHashes.length > 0 && (
                (() => {
                  const actualHashes = verificationResult.results.map(r => calculatedHashes[r.hash] || r.actual);
                  const matchedActual = actualHashes.filter(h => parsedExpectedHashes.includes(h));
                  const unmatchedActual = actualHashes.filter(h => !parsedExpectedHashes.includes(h));
                  const unmatchedExpected = parsedExpectedHashes.filter(h => !actualHashes.includes(h));
                  const allMatch = actualHashes.length === parsedExpectedHashes.length && unmatchedActual.length === 0;

                  return (
                    <div className={`p-4 rounded border ${
                      allMatch
                        ? "bg-green-950 border-green-800 text-green-200"
                        : "bg-orange-950 border-orange-800 text-orange-200"
                    }`}>
                      <p className="font-bold text-lg mb-2">
                        {allMatch ? "All Hashes Match!" : "Hash Verification Summary"}
                      </p>
                      <div className="text-sm space-y-1">
                        <p>Expected: {parsedExpectedHashes.length} hash(es) | Actual: {actualHashes.length} hash(es)</p>
                        <p>Matched: {matchedActual.length} | Unmatched Actual: {unmatchedActual.length} | Unmatched Expected: {unmatchedExpected.length}</p>

                        {unmatchedActual.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer font-medium">Unmatched Actual Hashes</summary>
                            <ul className="ml-4 mt-1 font-mono text-xs">
                              {unmatchedActual.map((hash, idx) => (
                                <li key={idx}>- {hash}</li>
                              ))}
                            </ul>
                          </details>
                        )}

                        {unmatchedExpected.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer font-medium">Unmatched Expected Hashes</summary>
                            <ul className="ml-4 mt-1 font-mono text-xs">
                              {unmatchedExpected.map((hash, idx) => (
                                <li key={idx}>- {hash}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {verificationResult.results.length > 0 && (
                <div className="space-y-2">
                  {verificationResult.results.map((r, idx) => {
                    const actualHash = calculatedHashes[r.hash] || r.actual;
                    const isParameterized = calculatedHashes[r.hash] && calculatedHashes[r.hash] !== r.actual;

                    const matches = parsedExpectedHashes.length > 0
                      ? parsedExpectedHashes.includes(actualHash)
                      : null;

                    const params = validatorParams[r.hash] || [];
                    const hasParameters = r.parameters && r.parameters.length > 0;
                    const parametersProvided = hasParameters && params.some(p => p.value || p.referenceTo);

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded border ${
                          matches === null
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
                            {matches === null ? "?" : matches ? "OK" : "X"}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm font-mono">
                          {hasParameters && (
                            <div className="mb-2 pb-2 border-b border-gray-700">
                              <span className="text-yellow-400">Requires Parameters:</span>
                              <ul className="ml-4 mt-1 text-xs">
                                {r.parameters!.map((param, pidx) => (
                                  <li key={pidx} className="text-gray-300">
                                    - {param.title || `param${pidx}`} ({getParameterType(param.schema)})
                                  </li>
                                ))}
                              </ul>
                              {parametersProvided && isParameterized && (
                                <div className="text-green-400 text-xs mt-1">
                                  Parameters applied - hash calculated client-side
                                </div>
                              )}
                              {hasParameters && !parametersProvided && (
                                <div className="text-yellow-400 text-xs mt-1">
                                  Parameters not provided - showing unparameterized hash
                                </div>
                              )}
                            </div>
                          )}
                          <div>
                            <span className="text-gray-400">Expected:</span>{" "}
                            <span className={matches === null ? "text-yellow-400" : ""}>
                              {parsedExpectedHashes.length > 0 ? "Any of provided hashes" : "N/A - No hashes provided"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Actual:</span> {actualHash}
                            {isParameterized && <span className="text-green-400 ml-2">Live</span>}
                          </div>
                          {matches === null && (
                            <div className="text-yellow-400 text-xs mt-2">
                              No expected hashes provided
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
                    {deepLinkData
                      ? "Parameters have been pre-filled from the verification transaction. Modify if needed."
                      : "Some validators require parameters. Fill in the values below - hashes will update automatically."}
                  </p>
                  <div className="space-y-6">
                    {verificationResult.results
                      .filter(r => r.parameters && r.parameters.length > 0)
                      .map((r) => {
                        const params = validatorParams[r.hash] || [];
                        return (
                          <div key={r.hash} className="border border-zinc-700 rounded p-4">
                            <h4 className="font-medium mb-3">
                              {r.validator}
                              <span className="text-xs text-gray-400 ml-2">
                                (Hash: {r.hash.substring(0, 16)}...)
                              </span>
                            </h4>
                            <div className="space-y-3">
                              {r.parameters!.map((param, pidx) => {
                                const paramValue = params[pidx];
                                if (!paramValue) return null;

                                return (
                                  <div key={pidx} className="space-y-2">
                                    <label className="block text-sm font-medium">
                                      {param.title || `Parameter ${pidx + 1}`}
                                      <span className="text-gray-500 ml-2 text-xs">
                                        ({getParameterType(param.schema)})
                                      </span>
                                    </label>

                                    <div className="flex flex-col gap-2 mb-2">
                                      {isByteArrayType(param.schema) && (
                                        <label className="flex items-center text-sm text-gray-400">
                                          <input
                                            type="checkbox"
                                            checked={paramValue.useValidatorRef}
                                            onChange={(e) => updateParamValue(r.hash, pidx, "useValidatorRef", e.target.checked)}
                                            className="mr-2"
                                          />
                                          Use validator hash reference
                                        </label>
                                      )}

                                      {!paramValue.useValidatorRef && (
                                        <label className={`flex items-center text-sm ${isComplexType(param.schema) ? 'text-gray-500' : 'text-gray-400'}`}>
                                          <input
                                            type="checkbox"
                                            checked={paramValue.rawCborMode}
                                            onChange={(e) => updateParamValue(r.hash, pidx, "rawCborMode", e.target.checked)}
                                            disabled={isComplexType(param.schema)}
                                            className="mr-2"
                                          />
                                          Raw CBOR mode (advanced)
                                          {isComplexType(param.schema) && (
                                            <span className="ml-1 text-xs">(required)</span>
                                          )}
                                        </label>
                                      )}
                                    </div>

                                    {paramValue.useValidatorRef ? (
                                      <select
                                        value={paramValue.referenceTo || ""}
                                        onChange={(e) => updateParamValue(r.hash, pidx, "referenceTo", e.target.value)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-zinc-600"
                                      >
                                        <option value="">Select a validator...</option>
                                        {verificationResult.results.map((v) => {
                                          const currentHash = calculatedHashes[v.hash] || v.actual;
                                          return (
                                            <option key={v.hash} value={v.hash}>
                                              {v.validator} ({currentHash.substring(0, 16)}...)
                                            </option>
                                          );
                                        })}
                                      </select>
                                    ) : (
                                      <>
                                        <input
                                          type="text"
                                          value={paramValue.value}
                                          onChange={(e) => updateParamValue(r.hash, pidx, "value", e.target.value)}
                                          placeholder={
                                            paramValue.rawCborMode
                                              ? "Enter CBOR hex (e.g., 581c... or 182a...)"
                                              : isIntegerType(param.schema)
                                              ? "Enter number (e.g., 42)"
                                              : isByteArrayType(param.schema)
                                              ? "Enter hex string (e.g., abc123...)"
                                              : "Enter CBOR hex"
                                          }
                                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
                                        />
                                        {!paramValue.rawCborMode && (
                                          <div className="text-xs text-gray-400 mt-1">
                                            {isIntegerType(param.schema)
                                              ? "Enter as plain number - will be auto-encoded to CBOR"
                                              : isByteArrayType(param.schema)
                                              ? "Enter as hex string - will be auto-encoded to CBOR bytearray"
                                              : ""}
                                          </div>
                                        )}
                                        {paramValue.rawCborMode && !isComplexType(param.schema) && (
                                          <div className="text-xs text-orange-400 mt-1">
                                            Raw CBOR mode: Provide complete CBOR-encoded hex value
                                          </div>
                                        )}
                                      </>
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

              {/* Submit to Registry Section */}
              {verificationResult.success && verificationResult.results.length > 0 && parsedExpectedHashes.length > 0 && (() => {
                const actualHashes = verificationResult.results.map(r => calculatedHashes[r.hash] || r.actual);
                const allMatch = actualHashes.length === parsedExpectedHashes.length &&
                                 actualHashes.every(h => parsedExpectedHashes.includes(h));

                return allMatch ? (
                  <SubmitToRegistry
                    verificationData={{
                      repoUrl,
                      commitHash,
                      aikenVersion,
                      sourcePath,
                      expectedHashes,
                      results: verificationResult.results,
                      validatorParams,
                      calculatedHashes,
                    }}
                  />
                ) : null;
              })()}

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
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">UPLC Link</h1>
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    }>
      <VerifyPageContent />
    </Suspense>
  );
}
