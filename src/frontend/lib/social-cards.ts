/**
 * Server-side data fetchers for social link-preview cards (generateMetadata
 * and the /api/og image route). These hit the backend directly instead of
 * self-fetching through /api/registry — crawler-triggered rendering must not
 * depend on the frontend knowing its own public hostname.
 */

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:8080';

/** Public site origin — set NEXT_PUBLIC_BASE_URL per environment (preview/prod). */
export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://uplc.link';

const TX_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;
const SCRIPT_HASH_PATTERN = /^[0-9a-fA-F]{56}$/;

export interface CardScript {
  moduleName: string;
  validatorName: string;
  purposes: string[];
  plutusVersion: string;
  parameterizationStatus: 'NONE_REQUIRED' | 'PARTIAL' | 'COMPLETE';
  rawHash: string;
  finalHash: string | null;
}

export interface CardVerification {
  txHash: string;
  sourceUrl: string;
  commitHash: string;
  sourcePath: string | null;
  compilerType: string;
  compilerVersion: string;
  env: string | null;
  status: string;
  scripts: CardScript[];
}

export interface CardScriptLookup {
  sourceUrl: string;
  commitHash: string;
  compilerType: string;
  compilerVersion: string;
  env: string | null;
  scripts: CardScript[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error('Social card fetch failed:', url, error);
    return null;
  }
}

export async function fetchVerificationByTxHash(
  txHash: string
): Promise<CardVerification | null> {
  if (!TX_HASH_PATTERN.test(txHash)) {
    return null;
  }
  return fetchJson<CardVerification>(
    `${BACKEND_URL}/api/v1/verification-requests/by-tx/${txHash}`
  );
}

export async function fetchScriptByHash(
  hash: string
): Promise<CardScriptLookup | null> {
  if (!SCRIPT_HASH_PATTERN.test(hash)) {
    return null;
  }
  return fetchJson<CardScriptLookup>(
    `${BACKEND_URL}/api/v1/scripts/by-hash/${hash}`
  );
}

/** "github.com/org/repo" → "org/repo" for compact display. */
export function repoDisplayName(sourceUrl: string): string {
  return sourceUrl.replace(/\.git$/, '').split('/').filter(Boolean).slice(-2).join('/');
}
