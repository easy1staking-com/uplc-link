/**
 * Transaction builder for registry submission
 * Builds Cardano transactions with metadata label 1984 for verification requests
 */

import { Transaction, BrowserWallet } from '@meshsdk/core';
import { encodeVerificationMetadata, chunkMetadata, type VerificationMetadata } from './metadata-encoder';

/**
 * Build a registry submission transaction
 *
 * The transaction includes:
 * - Metadata label 1984 with verification data (chunked into 64-byte pieces)
 * - 1 ADA output back to sender (prevents "output too small" error)
 *
 * @param wallet - Connected browser wallet
 * @param metadata - Verification metadata to encode
 * @returns Unsigned transaction hex
 */
export async function buildRegistrySubmissionTx(
  wallet: BrowserWallet,
  metadata: VerificationMetadata
): Promise<string> {
  // Get sender address
  const address = await wallet.getChangeAddress();

  // Encode metadata to CBOR hex
  const metadataHex = encodeVerificationMetadata(metadata);

  // Chunk metadata into 64-byte pieces (128 hex characters = 64 bytes)
  const hexChunks = chunkMetadata(metadataHex, 128);

  // Convert hex chunks to byte arrays
  // This is important: storing hex strings would exceed the 64-byte limit
  // (128 hex chars = 128 bytes as string, but only 64 bytes as raw bytes)
  const byteChunks = hexChunks.map(hexChunk =>
    Buffer.from(hexChunk, 'hex')
  );

  // Build transaction
  const tx = new Transaction({ initiator: wallet });

  // Add metadata with label 1984
  // Store as byte arrays (not hex strings) to respect the 64-byte limit
  tx.setMetadata(1984, byteChunks);

  // Add 1 ADA output back to sender
  // This prevents "output too small" errors and ensures transaction validity
  tx.sendLovelace(address, '1000000');

  // Build and return unsigned transaction
  const unsignedTx = await tx.build();
  return unsignedTx;
}

/**
 * Estimate transaction fee
 *
 * @param wallet - Connected browser wallet
 * @param metadata - Verification metadata to encode
 * @returns Estimated fee in lovelace
 */
export async function estimateRegistrySubmissionFee(
  wallet: BrowserWallet,
  metadata: VerificationMetadata
): Promise<string> {
  try {
    // Build the transaction
    const unsignedTx = await buildRegistrySubmissionTx(wallet, metadata);

    // MeshSDK doesn't expose fee directly from unsigned tx
    // Return a reasonable estimate based on metadata size
    const metadataHex = encodeVerificationMetadata(metadata);
    const metadataSize = metadataHex.length / 2; // Convert hex to bytes

    // Base fee + metadata fee
    // Rough estimate: 0.17 ADA base + 0.000044 ADA per byte
    const baseFee = 170000; // 0.17 ADA in lovelace
    const metadataFee = Math.ceil(metadataSize * 44); // 44 lovelace per byte

    const totalFee = baseFee + metadataFee;

    return totalFee.toString();
  } catch (error) {
    console.error('Fee estimation failed:', error);
    // Return conservative estimate if calculation fails
    return '500000'; // 0.5 ADA
  }
}

/**
 * Sign and submit a transaction
 *
 * @param wallet - Connected browser wallet
 * @param unsignedTx - Unsigned transaction hex
 * @returns Transaction hash
 */
export async function signAndSubmitTx(
  wallet: BrowserWallet,
  unsignedTx: string
): Promise<string> {
  // Sign transaction (wallet popup will appear)
  const signedTx = await wallet.signTx(unsignedTx);

  // Submit to blockchain
  const txHash = await wallet.submitTx(signedTx);

  return txHash;
}
