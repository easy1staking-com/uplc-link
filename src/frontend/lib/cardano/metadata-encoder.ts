/**
 * Metadata encoder for Cardano transaction metadata (label 1984)
 * Encodes verification data into ConstrData format matching the backend parser
 */

import { serializeData } from '@meshsdk/core';
import type { Data } from '@meshsdk/core';

export interface VerificationMetadata {
  sourceUrl: string;
  commitHash: string;
  sourcePath?: string;
  compilerVersion: string;
  parameters: Record<string, string[]>; // scriptHash -> [CBOR-encoded params]
}

/**
 * Encode verification metadata into ConstrData format
 *
 * Format:
 * ConstrData(0, [                    // alternative 0 = AIKEN
 *   BytesData(sourceUrl),            // UTF-8 string
 *   BytesData(commitHashHex),        // raw hex bytes
 *   BytesData(sourcePath || ""),     // optional path
 *   BytesData(compilerVersion),      // e.g., "v1.1.3"
 *   MapData({                        // scriptHash -> [params]
 *     scriptHash1: [param1, param2],
 *     scriptHash2: [param1]
 *   })
 * ])
 */
export function encodeVerificationMetadata(data: VerificationMetadata): string {
  const { sourceUrl, commitHash, sourcePath, compilerVersion, parameters } = data;

  // Build parameters map with sorted keys (canonical CBOR ordering)
  const paramsMap = new Map<Data, Data>();

  // Sort entries by script hash (lexicographically) for canonical CBOR encoding
  const sortedEntries = Object.entries(parameters).sort(([a], [b]) => {
    // Compare hex strings lexicographically
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  sortedEntries.forEach(([scriptHash, params]) => {
    // Key: script hash as hex string
    const key: Data = scriptHash;

    // Value: list of parameters (already CBOR encoded hex strings)
    const value: Data = params; // Array of hex strings

    paramsMap.set(key, value);
  });

  // Build ConstrData with alternative 0 (AIKEN)
  const plutusData: Data = {
    alternative: 0,  // AIKEN compiler type
    fields: [
      Buffer.from(sourceUrl, 'utf-8').toString('hex'),
      commitHash,  // Already hex string
      Buffer.from(sourcePath || '', 'utf-8').toString('hex'),
      Buffer.from(compilerVersion, 'utf-8').toString('hex'),
      paramsMap
    ]
  };

  // Serialize to CBOR hex string
  return serializeData(plutusData);
}

/**
 * Chunk metadata into pieces for transaction metadata
 * Cardano metadata has size limits, so we split large data into chunks
 *
 * @param hex - The hex string to chunk
 * @param chunkSize - Size in hex characters (not bytes). Default 128 = 64 bytes
 * @returns Array of hex string chunks
 */
export function chunkMetadata(hex: string, chunkSize = 128): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < hex.length; i += chunkSize) {
    chunks.push(hex.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * CBOR encode a hash (32 bytes)
 * Used for encoding validator references in parameters
 */
export function cborEncodeHash(hashHex: string): string {
  // Hash is already hex string, just serialize it
  return serializeData(hashHex);
}

/**
 * CBOR encode a string value
 * Used for encoding string parameters
 */
export function cborEncodeString(str: string): string {
  // Convert string to hex and serialize
  const hexString = Buffer.from(str, 'utf-8').toString('hex');
  return serializeData(hexString);
}

/**
 * CBOR encode an integer value
 * Used for encoding numeric parameters
 */
export function cborEncodeInt(num: number): string {
  // Serialize the number directly
  return serializeData(num);
}
