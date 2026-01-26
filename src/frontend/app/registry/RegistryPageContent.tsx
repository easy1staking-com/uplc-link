'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { backendClient } from '@/lib/api/backend-client';
import type { ScriptResponseDto } from '@/lib/types/registry';

// Extended script with verification metadata
interface ScriptWithMetadata extends ScriptResponseDto {
  txHash: string;
  sourceUrl: string;
  commitHash: string;
  compilerType: string;
  compilerVersion: string;
}

// Build commit URL based on repository platform
function buildCommitUrl(sourceUrl: string, commitHash: string): string {
  if (sourceUrl.includes('github.com')) {
    return `${sourceUrl}/tree/${commitHash}`;
  } else if (sourceUrl.includes('gitlab.com')) {
    return `${sourceUrl}/-/tree/${commitHash}`;
  } else if (sourceUrl.includes('bitbucket.org')) {
    return `${sourceUrl}/src/${commitHash}`;
  }
  // Fallback to GitHub format for unknown platforms
  return `${sourceUrl}/tree/${commitHash}`;
}

// Component that handles search params - needs to be wrapped in Suspense
function RegistryPageContentInner() {
  const searchParams = useSearchParams();
  const [searchMode, setSearchMode] = useState<'hash' | 'url'>('url');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ScriptWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Perform search (can be called from form or programmatically)
  async function performSearch(query: string, mode: 'hash' | 'url') {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      if (mode === 'hash') {
        const data = await backendClient.getScriptsByHash(query.trim());
        // Add metadata to each script
        const scriptsWithMetadata = (data.scripts || []).map(script => ({
          ...script,
          txHash: data.txHash,
          sourceUrl: data.sourceUrl,
          commitHash: data.commitHash,
          compilerType: data.compilerType,
          compilerVersion: data.compilerVersion,
        }));
        setResults(scriptsWithMetadata);
      } else {
        // Partial URL search
        const dataList = await backendClient.searchByUrlPattern(query.trim());
        // Flatten results but keep verification metadata with each script
        const allScripts = dataList.flatMap(data =>
          (data.scripts || []).map(script => ({
            ...script,
            txHash: data.txHash,
            sourceUrl: data.sourceUrl,
            commitHash: data.commitHash,
            compilerType: data.compilerType,
            compilerVersion: data.compilerVersion,
          }))
        );
        setResults(allScripts);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Handle URL parameters on mount
  useEffect(() => {
    const hashParam = searchParams.get('hash');
    const urlParam = searchParams.get('url');

    if (hashParam) {
      setSearchMode('hash');
      setSearchQuery(hashParam);
      performSearch(hashParam, 'hash');
    } else if (urlParam) {
      setSearchMode('url');
      setSearchQuery(urlParam);
      performSearch(urlParam, 'url');
    }
  }, [searchParams]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    performSearch(searchQuery, searchMode);
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Registry Explorer</h1>
        <p className="text-gray-400">Search verified smart contracts</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8 space-y-4">
        {/* Search Mode Toggle */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchMode"
              value="url"
              checked={searchMode === 'url'}
              onChange={(e) => setSearchMode('url')}
              className="w-4 h-4"
            />
            <span className="text-sm">Search by URL</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchMode"
              value="hash"
              checked={searchMode === 'hash'}
              onChange={(e) => setSearchMode('hash')}
              className="w-4 h-4"
            />
            <span className="text-sm">Search by Hash</span>
          </label>
        </div>

        {/* Search Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              searchMode === 'hash'
                ? 'Enter script hash...'
                : 'Enter URL pattern (e.g., sundae-labs, easy1staking, aiken-lang)...'
            }
            className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-950 border border-red-800 rounded text-red-200">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm text-gray-400 mb-4">
            Found {results.length} script{results.length !== 1 ? 's' : ''}
          </div>

          {results.map((script, idx) => (
            <div
              key={idx}
              className="p-6 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-700 transition-colors"
            >
              {/* Script Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium mb-1">
                    {script.moduleName}.{script.validatorName}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="px-2 py-1 bg-zinc-800 rounded text-xs">{script.purpose}</span>
                    <span className="px-2 py-1 bg-zinc-800 rounded text-xs">{script.plutusVersion}</span>
                    <span className="px-2 py-1 bg-zinc-800 rounded text-xs">{script.compilerType} {script.compilerVersion}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <span
                  className={`px-3 py-1 rounded text-sm ${
                    script.parameterizationStatus === 'COMPLETE'
                      ? 'bg-green-950 border border-green-800 text-green-200'
                      : script.parameterizationStatus === 'PARTIAL'
                      ? 'bg-yellow-950 border border-yellow-800 text-yellow-200'
                      : 'bg-gray-800 text-gray-300'
                  }`}
                >
                  {script.parameterizationStatus === 'COMPLETE'
                    ? 'Parameterized'
                    : script.parameterizationStatus === 'PARTIAL'
                    ? 'Partial Params'
                    : 'No Params'}
                </span>
              </div>

              {/* Source Information */}
              <div className="mb-4 p-3 bg-zinc-950 rounded border border-zinc-800">
                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-gray-500">Repository: </span>
                    <a
                      href={script.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                    >
                      {script.sourceUrl}
                    </a>
                  </div>
                  <div>
                    <span className="text-gray-500">Commit: </span>
                    <a
                      href={buildCommitUrl(script.sourceUrl, script.commitHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                    >
                      {script.commitHash.substring(0, 8)}
                    </a>
                    <button
                      onClick={() => navigator.clipboard.writeText(script.commitHash)}
                      className="ml-2 px-2 py-0.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                    <span className="text-gray-500">Verification: </span>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/verify?txHash=${script.txHash}`;
                        navigator.clipboard.writeText(url);
                      }}
                      className="px-3 py-1 text-xs bg-blue-800 hover:bg-blue-700 rounded transition-colors inline-flex items-center gap-1"
                      title="Copy verification deep link"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      Share Verification
                    </button>
                  </div>
                </div>
              </div>

              {/* Hashes */}
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-500">Raw Hash:</span>
                  <div className="mt-1 px-3 py-2 bg-zinc-950 rounded font-mono text-sm break-all flex items-center justify-between gap-2">
                    <span>{script.rawHash}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => navigator.clipboard.writeText(script.rawHash)}
                        className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        title="Copy hash"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/registry?hash=${script.rawHash}`;
                          navigator.clipboard.writeText(url);
                        }}
                        className="px-2 py-1 text-xs bg-blue-800 hover:bg-blue-700 rounded transition-colors"
                        title="Copy shareable link"
                      >
                        Share
                      </button>
                    </div>
                  </div>
                </div>

                {script.finalHash && script.finalHash !== script.rawHash && (
                  <div>
                    <span className="text-sm text-gray-500">Final Hash (parameterized):</span>
                    <div className="mt-1 px-3 py-2 bg-zinc-950 rounded font-mono text-sm break-all flex items-center justify-between gap-2">
                      <span>{script.finalHash}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => navigator.clipboard.writeText(script.finalHash!)}
                          className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                          title="Copy hash"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/registry?hash=${script.finalHash}`;
                            navigator.clipboard.writeText(url);
                          }}
                          className="px-2 py-1 text-xs bg-blue-800 hover:bg-blue-700 rounded transition-colors"
                          title="Copy shareable link"
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Parameters */}
              {script.requiredParameters && script.requiredParameters.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                    Parameters ({script.requiredParameters.length})
                  </summary>
                  <div className="mt-2 space-y-3">
                    {script.requiredParameters.map((param, pidx) => {
                      const providedValue = script.providedParameters?.[pidx];
                      return (
                        <div key={pidx} className="text-sm">
                          <div className="text-gray-400 mb-1">{param.title || `param${pidx}`}</div>
                          {providedValue ? (
                            <div className="flex items-center gap-2">
                              <code className="flex-1 px-2 py-1 bg-zinc-950 rounded font-mono text-xs text-green-400 break-all">
                                {providedValue}
                              </code>
                              <button
                                onClick={() => navigator.clipboard.writeText(providedValue)}
                                className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors shrink-0"
                                title="Copy CBOR value"
                              >
                                Copy
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 italic">No value provided</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      ) : !loading && searchQuery && (
        <div className="text-center text-gray-400 py-12">
          No scripts found matching your search
        </div>
      )}

      {/* Empty State */}
      {!loading && !searchQuery && results.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          <p className="mb-4">Enter a search query to find verified scripts</p>
          <div className="text-sm space-y-2">
            <p>Examples:</p>
            <p>• sundae-labs</p>
            <p>• easy1staking</p>
            <p>• aiken-lang</p>
          </div>
        </div>
      )}
    </main>
  );
}

// Wrapper with Suspense boundary
export function RegistryPageContent() {
  return (
    <Suspense fallback={
      <main className="min-h-screen p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Registry Explorer</h1>
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    }>
      <RegistryPageContentInner />
    </Suspense>
  );
}
