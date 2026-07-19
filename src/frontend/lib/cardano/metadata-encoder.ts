/**
 * Metadata encoder for Cardano transaction metadata (label 1984)
 * Encodes verification data into ConstrData format matching the backend parser
 */

import * as Data from '@evolution-sdk/evolution/Data';
import * as Bytes from '@evolution-sdk/evolution/Bytes';
import type * as CBOR from '@evolution-sdk/evolution/CBOR';

/**
 * CBOR options matching the Java backend serialization (see SerdeTest.java):
 * indefinite-length arrays and constr fields, definite-length maps,
 * definite bytestrings with minimal length encoding.
 */
export const BACKEND_CBOR_OPTIONS: CBOR.CodecOptions = {
  mode: 'custom',
  useIndefiniteArrays: true,
  useIndefiniteMaps: false,
  useDefiniteForEmpty: true,
  sortMapKeys: false,
  useMinimalEncoding: true,
};

export interface VerificationMetadata {
  sourceUrl: string;
  commitHash: string;
  sourcePath?: string;
  compilerVersion: string;
  parameters: Record<string, string[]>; // scriptHash -> [CBOR-encoded params]
}

function utf8ToHex(value: string): string {
  return Bytes.toHex(new TextEncoder().encode(value));
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

  // Sort entries by script hash (lexicographically) for canonical CBOR ordering
  const sortedEntries = Object.entries(parameters).sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  const paramsMap = Data.map(
    sortedEntries.map(([scriptHash, params]) => [
      Data.bytearray(scriptHash),
      Data.list(params.map(param => Data.bytearray(param))),
    ] as [Data.Data, Data.Data])
  );

  const plutusData = Data.constr(0n, [
    Data.bytearray(utf8ToHex(sourceUrl)),
    Data.bytearray(commitHash), // Already hex string
    Data.bytearray(utf8ToHex(sourcePath || '')),
    Data.bytearray(utf8ToHex(compilerVersion)),
    paramsMap,
  ]);

  return Data.toCBORHex(plutusData, BACKEND_CBOR_OPTIONS);
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
 * CBOR encode a hash (28/32 bytes hex)
 * Used for encoding validator references in parameters
 */
export function cborEncodeHash(hashHex: string): string {
  return Data.toCBORHex(Data.bytearray(hashHex), BACKEND_CBOR_OPTIONS);
}

/**
 * CBOR encode a string value as UTF-8 bytes
 */
export function cborEncodeString(str: string): string {
  return Data.toCBORHex(Data.bytearray(utf8ToHex(str)), BACKEND_CBOR_OPTIONS);
}

/**
 * CBOR encode an integer value
 */
export function cborEncodeInt(num: number | bigint): string {
  return Data.toCBORHex(Data.int(BigInt(num)), BACKEND_CBOR_OPTIONS);
}
