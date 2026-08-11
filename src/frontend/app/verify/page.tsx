"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { backendClient } from "@/lib/api/backend-client";
import { SubmitToRegistry } from "@/components/verification/SubmitToRegistry";
import { ParamBuilder } from "@/components/builder/ParamBuilder";
import type { BuilderContext } from "@/components/builder/context";
import { applyPayloadsAndHash } from "@/lib/blueprint/apply-params";
import {
  encodeFormValue,
  payloadToCborHex,
  normalizeHexInput,
  type ParamPayload,
} from "@/lib/blueprint/encode";
import { decodeCborToFormValue } from "@/lib/blueprint/decode";
import { classifySchema, describeSchema, emptyFormValue } from "@/lib/blueprint/schema";
import type {
  BlueprintDefinitions,
  BlueprintSchema,
  ParameterState,
} from "@/lib/blueprint/types";
import type { VerificationResult, ValidatorParams } from "@/lib/types/verification";
import { toAikenReleaseTag } from "@/lib/aiken-version";
import type { VerificationResponseDto } from "@/lib/types/registry";
import * as Data from "@evolution-sdk/evolution/Data";

/**
 * Encode one parameter's builder state into an applicable payload.
 * Returns null when the parameter has no (complete) value yet.
 * Throws EncodeError on invalid input.
 */
function encodeParameterState(
  schema: BlueprintSchema | undefined,
  definitions: BlueprintDefinitions,
  state: ParameterState,
  resolveValidatorRef: (hash: string) => string | undefined
): ParamPayload | null {
  if (!schema) {
    // No schema available — only raw CBOR can be applied
    if (state.mode !== "cbor" || !state.cborHex.trim()) return null;
    return { kind: "data", data: Data.fromCBORHex(normalizeHexInput(state.cborHex, state.name)) };
  }

  if (state.mode === "cbor") {
    if (!state.cborHex.trim()) return null;
    // Route through schema decoding so raw (#-typed) parameters become
    // constant payloads; schema-mismatched CBOR falls back to plain Data.
    const decoded = decodeCborToFormValue(state.cborHex, schema, definitions);
    if (decoded) {
      return encodeFormValue(schema, definitions, decoded, { resolveValidatorRef });
    }
    return { kind: "data", data: Data.fromCBORHex(normalizeHexInput(state.cborHex, state.name)) };
  }

  if (!state.formValue) return null;
  return encodeFormValue(schema, definitions, state.formValue, { resolveValidatorRef });
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
  const [env, setEnv] = useState("");
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

  // Fully-encoded parameter CBOR (raw hash -> hex list), derived alongside
  // calculatedHashes and handed to the registry submission
  const [encodedParams, setEncodedParams] = useState<Record<string, string[]>>({});

  const definitions: BlueprintDefinitions = verificationResult?.definitions ?? {};

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
        setAikenVersions(["v1.1.22", "v1.1.21", "v1.1.19", "v1.1.17", "v1.1.0", "v1.0.29"]);
        if (!aikenVersion) setAikenVersion("v1.1.22");
      } finally {
        setLoadingVersions(false);
      }
    };
    fetchVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setEnv(data.env || "");

        // Normalize stored compiler version (may carry "+<build>" metadata,
        // e.g. "v1.1.21+42babe5") to the release tag the dropdown lists
        const version = toAikenReleaseTag(data.compilerVersion);
        if (version) {
          setAikenVersion(version);
        }

        // Build expected hashes from stored scripts (deduplicated)
        // Note: Aiken alpha and non-alpha versions group scripts differently by purpose,
        // but the hash is the same - so we deduplicate to get unique script hashes
        const hashes = [...new Set(
          data.scripts
            .map(s => s.finalHash || s.rawHash)
            .filter(Boolean)
        )];
        setExpectedHashes(hashes.join('\n'));

        // Only auto-verify when the stored compiler version normalized cleanly.
        // Otherwise aikenVersion still holds the default (latest) release, and
        // auto-verifying against the wrong compiler would show a spurious hash
        // mismatch with no explanation — surface the reason and let the user pick.
        if (version) {
          setShouldAutoVerify(true);
        } else {
          setDeepLinkError(
            `Stored compiler version "${data.compilerVersion}" is not a recognized Aiken release; ` +
            `select the version manually before verifying.`
          );
        }
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

    const calculateHashes = () => {
      try {
        const defs = verificationResult.definitions ?? {};
        const newCalculatedHashes: Record<string, string> = {};
        const newEncodedParams: Record<string, string[]> = {};

        for (const result of verificationResult.results) {
          newCalculatedHashes[result.hash] = result.actual;
        }

        let changed = true;
        const maxPasses = 10;
        let passCount = 0;

        while (changed && passCount < maxPasses) {
          changed = false;
          passCount++;

          for (const result of verificationResult.results) {
            if (!result.compiledCode || !result.plutusVersion) continue;

            const params = validatorParams[result.hash];
            if (!params || params.length === 0) continue;

            // Only apply once the user (or deep-link prefill) has provided
            // values — untouched defaults never silently change the hash
            if (!params.some(p => p.touched)) continue;

            try {
              const payloads: ParamPayload[] = [];
              const hexes: string[] = [];
              let complete = true;

              for (let paramIdx = 0; paramIdx < params.length; paramIdx++) {
                const paramSchema = result.parameters?.[paramIdx]?.schema;
                let payload: ParamPayload | null = null;
                try {
                  payload = encodeParameterState(
                    paramSchema,
                    defs,
                    params[paramIdx],
                    (h) => newCalculatedHashes[h]
                  );
                } catch {
                  // Incomplete/invalid input — treated as not yet provided
                }
                if (!payload) {
                  complete = false;
                  break;
                }
                payloads.push(payload);
                hexes.push(payloadToCborHex(payload));
              }

              if (!complete) continue;

              const { hash } = applyPayloadsAndHash(result.compiledCode, payloads, result.plutusVersion);
              newEncodedParams[result.hash] = hexes;

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
        setEncodedParams(newEncodedParams);
      } catch (error) {
        console.error("Failed to calculate hashes:", error);
      }
    };

    calculateHashes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validatorParams, verificationResult]);

  /** Default builder state for one parameter schema. */
  const defaultParamState = (
    name: string,
    schema: BlueprintSchema,
    defs: BlueprintDefinitions
  ): ParameterState => {
    const classified = classifySchema(schema, defs);
    const formCapable = classified.kind !== "opaque" && classified.kind !== "unsupported";
    return {
      name,
      mode: formCapable ? "form" : "cbor",
      formValue: formCapable ? emptyFormValue(schema, defs) : null,
      cborHex: "",
      touched: false,
    };
  };

  // Initialize params with stored values from deep link:
  // stored CBOR decodes into Form mode when it parses against the schema,
  // otherwise it lands in CBOR mode as-is.
  const initializeParamsFromDeepLink = (
    result: VerificationResult,
    deepLinkScripts: VerificationResponseDto["scripts"]
  ) => {
    const defs = result.definitions ?? {};
    const newParams: ValidatorParams = {};

    result.results.forEach(validator => {
      if (validator.parameters && validator.parameters.length > 0) {
        // Find matching script from deep link data by raw hash
        const storedScript = deepLinkScripts.find(s => s.rawHash === validator.hash);
        const storedParams = storedScript?.providedParameters || [];

        newParams[validator.hash] = validator.parameters.map((param, idx) => {
          const name = param.title || "param";
          const storedValue = storedParams[idx] || "";
          if (!storedValue) return defaultParamState(name, param.schema, defs);

          const decoded = decodeCborToFormValue(storedValue, param.schema, defs);
          if (decoded) {
            return {
              name,
              mode: "form" as const,
              formValue: decoded,
              cborHex: storedValue,
              touched: true,
            };
          }
          return {
            name,
            mode: "cbor" as const,
            formValue: null,
            cborHex: storedValue,
            touched: true,
          };
        });
      }
    });

    setValidatorParams(newParams);
  };

  // Initialize params without deep link data
  const initializeParams = (result: VerificationResult) => {
    const defs = result.definitions ?? {};
    const newParams: ValidatorParams = {};
    result.results.forEach(validator => {
      if (validator.parameters && validator.parameters.length > 0) {
        newParams[validator.hash] = validator.parameters.map(param =>
          defaultParamState(param.title || "param", param.schema, defs)
        );
      }
    });
    setValidatorParams(newParams);
  };

  const updateParamState = (hash: string, paramIndex: number, state: ParameterState) => {
    setValidatorParams(prev => ({
      ...prev,
      [hash]: prev[hash].map((param, idx) =>
        idx === paramIndex ? { ...state, touched: true } : param
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
          env: env.trim() || undefined,
        }),
      });

      if (!response.ok) {
        // The route returns a descriptive { error } body for validation
        // failures (bad commit hash, URL, source path, version); surface it
        // instead of the opaque status line.
        const serverError = await response
          .json()
          .then((body) => body?.error as string | undefined)
          .catch(() => undefined);
        throw new Error(serverError || `Server returned ${response.status}: ${response.statusText}`);
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
          initializeParamsFromDeepLink(result, deepLinkData.scripts);
        } else {
          initializeParams(result);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <Link
          href="/"
          className="inline-block mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          Go to Manual Verification
        </Link>
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
              Environment <span className="text-gray-500 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder="e.g., mainnet"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Aiken environment module passed as <code>aiken build --env</code> (leave empty if the project was built without one)
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
                    const parametersProvided = hasParameters && params.some(p => p.touched);

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
                                    - {param.title || `param${pidx}`} ({describeSchema(param.schema, definitions)})
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

              {/* Parameter Input Section — blueprint-driven builder */}
              {verificationResult.results.some(r => r.parameters && r.parameters.length > 0) && (
                <div className="mt-6 p-6 bg-zinc-900 border border-zinc-800 rounded">
                  <h3 className="text-lg font-semibold mb-4">Configure Validator Parameters</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    {deepLinkData
                      ? "Parameters have been pre-filled from the verification transaction. Modify if needed."
                      : "Some validators require parameters. Fill in the values below - hashes will update automatically."}
                  </p>
                  {(() => {
                    const ctx: BuilderContext = {
                      definitions,
                      validators: verificationResult.results.map(v => ({
                        hash: v.hash,
                        name: v.validator,
                        currentHash: calculatedHashes[v.hash] || v.actual,
                      })),
                    };
                    const resolveValidatorRef = (h: string) =>
                      calculatedHashes[h] || verificationResult.results.find(v => v.hash === h)?.actual;

                    return (
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
                                <div className="space-y-4">
                                  {r.parameters!.map((param, pidx) => {
                                    const state = params[pidx];
                                    if (!state) return null;
                                    return (
                                      <ParamBuilder
                                        key={pidx}
                                        title={param.title || `Parameter ${pidx + 1}`}
                                        schema={param.schema}
                                        state={state}
                                        onChange={(next) => updateParamState(r.hash, pidx, next)}
                                        ctx={ctx}
                                        resolveValidatorRef={resolveValidatorRef}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })()}
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
                      env: env.trim() || undefined,
                      expectedHashes,
                      results: verificationResult.results,
                      encodedParams,
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
