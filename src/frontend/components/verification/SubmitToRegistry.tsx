'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/cardano/wallet-hooks';
import { buildRegistrySubmissionTx, signAndSubmitTx, estimateRegistrySubmissionFee } from '@/lib/cardano/transaction-builder';
import type { VerificationMetadata } from '@/lib/cardano/metadata-encoder';
import type { VerificationData } from '@/lib/types/verification';
import { cborEncodeHash } from '@/lib/cardano/metadata-encoder';
import { config } from '@/lib/config';

interface SubmitToRegistryProps {
  verificationData: VerificationData;
}

type SubmissionStatus = 'idle' | 'building' | 'signing' | 'submitting' | 'success' | 'error';

export function SubmitToRegistry({ verificationData }: SubmitToRegistryProps) {
  const { wallet, address, isNetworkMismatch, expectedNetwork, walletNetworkName } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [txHash, setTxHash] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [estimatedFee, setEstimatedFee] = useState<string>('');

  /**
   * Build parameters map from verification results
   * Maps script hash to list of CBOR-encoded parameter values
   */
  function buildParametersMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};

    verificationData.results.forEach(result => {
      const params = verificationData.validatorParams[result.hash];
      if (!params || params.length === 0) return;

      // Use the raw hash (before parameterization) as the key
      // The backend looks up parameters by raw hash, not by the final calculated hash
      const scriptHash = result.actual;

      // Map parameter values
      const encodedParams = params.map(param => {
        if (param.useValidatorRef && param.referenceTo) {
          // Reference to another validator - get its hash and CBOR encode
          const refHash = verificationData.calculatedHashes[param.referenceTo];
          if (!refHash) {
            console.warn(`Reference validator hash ${param.referenceTo} not found`);
            return '';
          }
          return cborEncodeHash(refHash);
        }
        // Parameter value is already CBOR encoded from UI
        return param.value;
      }).filter(Boolean);

      if (encodedParams.length > 0) {
        map[scriptHash] = encodedParams;
      }
    });

    return map;
  }

  /**
   * Handle modal open - estimate fee
   */
  async function handleOpenModal() {
    setIsOpen(true);
    setStatus('idle');
    setError('');
    setTxHash('');

    if (wallet) {
      try {
        const parameters = buildParametersMap();
        const metadata: VerificationMetadata = {
          sourceUrl: verificationData.repoUrl,
          commitHash: verificationData.commitHash,
          sourcePath: verificationData.sourcePath,
          compilerVersion: verificationData.aikenVersion,
          parameters,
        };

        const fee = await estimateRegistrySubmissionFee(wallet, metadata);
        setEstimatedFee(fee);
      } catch (err) {
        console.error('Fee estimation failed:', err);
        setEstimatedFee('500000'); // Default estimate
      }
    }
  }

  /**
   * Handle transaction submission
   */
  async function handleSubmit() {
    if (!wallet) {
      setError('Wallet not connected');
      return;
    }

    try {
      setError('');

      // Build parameters map
      setStatus('building');
      const parameters = buildParametersMap();

      // Create metadata
      const metadata: VerificationMetadata = {
        sourceUrl: verificationData.repoUrl,
        commitHash: verificationData.commitHash,
        sourcePath: verificationData.sourcePath,
        compilerVersion: verificationData.aikenVersion,
        parameters,
      };

      // Build transaction
      const unsignedTx = await buildRegistrySubmissionTx(wallet, metadata);

      // Sign transaction (wallet popup)
      setStatus('signing');
      const signedTx = await wallet.signTx(unsignedTx);

      // Submit to blockchain
      setStatus('submitting');
      const hash = await wallet.submitTx(signedTx);

      setStatus('success');
      setTxHash(hash);
    } catch (err) {
      console.error('Submission failed:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    }
  }

  /**
   * Close modal and reset state
   */
  function handleClose() {
    setIsOpen(false);
    setStatus('idle');
    setError('');
    setTxHash('');
  }

  // Count validators that will be submitted
  const validatorsWithParams = verificationData.results.filter(
    r => verificationData.validatorParams[r.hash]?.length > 0
  ).length;

  return (
    <div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded">
      <h3 className="font-bold text-lg mb-2">Submit to Registry</h3>
      <p className="text-sm text-gray-400 mb-4">
        Submit your verified contract to the public registry for others to discover.
        {validatorsWithParams > 0 && (
          <span className="block mt-1">
            {validatorsWithParams} validator{validatorsWithParams !== 1 ? 's' : ''} with parameters will be registered.
          </span>
        )}
      </p>

      {!wallet ? (
        <p className="text-yellow-400 text-sm">Connect your wallet to submit</p>
      ) : isNetworkMismatch ? (
        <div className="p-3 bg-red-950 border border-red-800 rounded">
          <p className="text-red-300 text-sm font-medium">Wrong Network</p>
          <p className="text-red-400 text-xs mt-1">
            Your wallet is on <strong>{walletNetworkName}</strong>, but this app is configured for <strong>{expectedNetwork}</strong>.
            Please switch networks in your wallet to submit.
          </p>
        </div>
      ) : (
        <button
          onClick={handleOpenModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          Submit to Registry
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={status === 'idle' || status === 'error' ? handleClose : undefined}
          />

          {/* Modal Content */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-zinc-800">
                <h2 className="text-2xl font-bold">Submit to Registry</h2>
              </div>

              {/* Content */}
              <div className="p-6">
                {status === 'idle' && (
                  <>
                    {/* Review Information */}
                    <div className="space-y-4 mb-6">
                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-1">Repository</h3>
                        <p className="text-sm break-all">{verificationData.repoUrl}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-1">Commit</h3>
                        <p className="text-sm font-mono">{verificationData.commitHash}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-1">Compiler</h3>
                        <p className="text-sm">Aiken {verificationData.aikenVersion}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-1">Validators</h3>
                        <ul className="text-sm space-y-1">
                          {verificationData.results.map((result, idx) => (
                            <li key={idx}>
                              {result.validatorModule}.{result.validatorName}
                              {verificationData.validatorParams[result.hash]?.length > 0 && (
                                <span className="text-gray-400">
                                  {' '}({verificationData.validatorParams[result.hash].length} param{verificationData.validatorParams[result.hash].length !== 1 ? 's' : ''})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {estimatedFee && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-400 mb-1">Estimated Fee</h3>
                          <p className="text-sm">{(parseInt(estimatedFee) / 1_000_000).toFixed(2)} ADA</p>
                        </div>
                      )}

                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-1">Wallet</h3>
                        <p className="text-sm font-mono break-all">{address}</p>
                      </div>
                    </div>

                    {/* Info Notice */}
                    <div className="mb-6 p-3 bg-blue-950 border border-blue-800 rounded text-sm text-blue-200">
                      <p className="font-medium mb-1">What happens next:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Transaction will be built with metadata label 1984</li>
                        <li>Your wallet will prompt you to sign the transaction</li>
                        <li>Transaction will be submitted to the Cardano blockchain</li>
                        <li>Backend will detect and process the verification request</li>
                        <li>Scripts will appear in registry within 30 seconds</li>
                      </ul>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleSubmit}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      >
                        Submit Transaction
                      </button>
                      <button
                        onClick={handleClose}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                {(status === 'building' || status === 'signing' || status === 'submitting') && (
                  <div className="text-center py-8">
                    <div className="mb-4">
                      <div className="inline-block w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-lg font-medium mb-2">
                      {status === 'building' && 'Building transaction...'}
                      {status === 'signing' && 'Waiting for signature...'}
                      {status === 'submitting' && 'Submitting to blockchain...'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {status === 'building' && 'Encoding metadata and building transaction'}
                      {status === 'signing' && 'Please sign the transaction in your wallet'}
                      {status === 'submitting' && 'This may take a few seconds'}
                    </p>
                  </div>
                )}

                {status === 'success' && (
                  <div className="text-center py-8">
                    <div className="mb-4">
                      <svg className="inline-block w-16 h-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold mb-2">Transaction Submitted!</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Your verification has been submitted to the blockchain.
                    </p>

                    <div className="mb-6 p-4 bg-zinc-950 rounded border border-zinc-800">
                      <p className="text-sm text-gray-400 mb-2">Transaction Hash:</p>
                      <p className="text-sm font-mono break-all mb-3">{txHash}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(txHash)}
                          className="flex-1 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        >
                          Copy Hash
                        </button>
                        <a
                          href={`${config.explorerUrl}/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors text-center"
                        >
                          View on Explorer
                        </a>
                      </div>
                    </div>

                    <div className="mb-6 p-3 bg-green-950 border border-green-800 rounded text-sm text-green-200">
                      <p>The backend will process your verification request within 30 seconds.</p>
                      <p className="mt-1">You can search for your scripts in the Registry Explorer.</p>
                    </div>

                    <button
                      onClick={handleClose}
                      className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                    >
                      Close
                    </button>
                  </div>
                )}

                {status === 'error' && (
                  <div className="text-center py-8">
                    <div className="mb-4">
                      <svg className="inline-block w-16 h-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold mb-2">Submission Failed</h3>
                    <div className="mb-6 p-4 bg-red-950 border border-red-800 rounded text-sm text-red-200">
                      {error}
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setStatus('idle')}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={handleClose}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
