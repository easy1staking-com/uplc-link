/**
 * Transaction builder for registry submission
 * Builds Cardano transactions with metadata label 1984 for verification requests
 */

import { Assets, TransactionHash, TransactionMetadatum } from '@evolution-sdk/evolution';
import * as Bytes from '@evolution-sdk/evolution/Bytes';
import type { SignBuilder } from '@evolution-sdk/evolution/sdk/builders/SignBuilder';
import { encodeVerificationMetadata, chunkMetadata, type VerificationMetadata } from './metadata-encoder';
import type { ConnectedWallet } from '../types/wallet';

export const REGISTRY_METADATA_LABEL = 1984n;

/**
 * Build a registry submission transaction
 *
 * The transaction includes:
 * - Metadata label 1984 with verification data (chunked into 64-byte pieces)
 * - 1 ADA output back to sender (prevents "output too small" error)
 *
 * @param wallet - Connected wallet (raw CIP-30 handle + Evolution signing client)
 * @param metadata - Verification metadata to encode
 * @returns Signing-ready transaction builder
 */
export async function buildRegistrySubmissionTx(
  wallet: ConnectedWallet,
  metadata: VerificationMetadata
): Promise<SignBuilder> {
  const { client } = wallet;

  // Get sender address
  const address = await client.address();

  // Encode metadata to CBOR hex and chunk into 64-byte pieces
  // (128 hex chars = 64 bytes; byte arrays, not hex strings, respect the limit)
  const metadataHex = encodeVerificationMetadata(metadata);
  const byteChunks = chunkMetadata(metadataHex, 128).map(chunk =>
    TransactionMetadatum.bytes(Bytes.fromHex(chunk))
  );

  return client
    .newTx()
    .payToAddress({ address, assets: Assets.fromLovelace(1_000_000n) })
    .attachMetadata({
      label: REGISTRY_METADATA_LABEL,
      metadata: TransactionMetadatum.array(byteChunks),
    })
    .build();
}

/**
 * Estimate transaction fee
 *
 * @returns Estimated fee in lovelace
 */
export async function estimateRegistrySubmissionFee(
  wallet: ConnectedWallet,
  metadata: VerificationMetadata
): Promise<string> {
  const signBuilder = await buildRegistrySubmissionTx(wallet, metadata);
  const fee = await signBuilder.estimateFee();
  return fee.toString();
}

/**
 * Sign and submit a built transaction
 *
 * @returns Transaction hash (hex)
 */
export async function signAndSubmitTx(
  signBuilder: SignBuilder,
  onSigned?: () => void
): Promise<string> {
  // Sign transaction (wallet popup will appear)
  const submitBuilder = await signBuilder.sign();
  onSigned?.();

  // Submit to blockchain
  const txHash = await submitBuilder.submit();

  return TransactionHash.toHex(txHash);
}
