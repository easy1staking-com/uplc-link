import Link from "next/link";

export default function DocsPage() {
  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4">UPLC Link Documentation</h1>
        <p className="text-gray-400 text-lg">
          Comprehensive guide to verifying and registering Cardano smart contracts
        </p>
      </div>

      <div className="space-y-12">
        {/* Quick Start */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Quick Start</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              UPLC Link allows you to verify that on-chain Cardano smart contracts match their published source code.
              This builds trust and transparency in the ecosystem.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded p-6">
              <h3 className="text-xl font-semibold mb-3">Basic Verification Flow</h3>
              <ol className="list-decimal list-inside space-y-2">
                <li>Navigate to the <Link href="/" className="text-blue-400 hover:underline">verification page</Link></li>
                <li>Enter your GitHub repository URL</li>
                <li>Provide the commit hash to verify</li>
                <li>Select the Aiken compiler version</li>
                <li>Enter expected script hashes</li>
                <li>Click &quot;Verify Contract&quot;</li>
              </ol>
            </div>
          </div>
        </section>

        {/* How Verification Works */}
        <section>
          <h2 className="text-3xl font-bold mb-4">How Verification Works</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              UPLC Link performs verification using a hybrid approach: server-side compilation with client-side parameterization. Here&apos;s what happens:
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-white mb-2">1. Repository Clone (Server)</h4>
                <p className="text-sm">
                  The Next.js API route clones your Git repository at the specified commit.
                  This happens on the server, not in your browser.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">2. Compilation (Server)</h4>
                <p className="text-sm">
                  The native Aiken compiler builds your smart contract on the server using the exact
                  version you specified. Build logs are captured and returned to you.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">3. Hash Extraction (Server)</h4>
                <p className="text-sm">
                  Script hashes and parameter schemas are extracted from plutus.json and sent to your browser.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">4. Parameterization (Client)</h4>
                <p className="text-sm">
                  If validators require parameters, you can apply them in the browser using MeshSDK WASM.
                  Hashes are recalculated live as you change parameters.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">5. Comparison (Client)</h4>
                <p className="text-sm">
                  The built hashes (with or without parameters) are compared with your expected hashes
                  entirely in your browser. Results show which validators match and which don&apos;t.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Parameterized Validators */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Parameterized Validators</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              Many validators require parameters (e.g., policy IDs, stake key hashes).
              UPLC Link supports client-side parameterization with live hash updates.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
              <h3 className="text-xl font-semibold">Parameter Types</h3>

              <div>
                <h4 className="font-semibold text-white mb-2">Simple Types</h4>
                <p className="text-sm mb-2">
                  Bytes, integers, and other primitive types. Enter values directly.
                </p>
                <div className="bg-zinc-800 p-3 rounded font-mono text-xs">
                  Example: 581c7a2e... (CBOR-encoded hash)
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">Validator References</h4>
                <p className="text-sm mb-2">
                  Reference another validator&apos;s hash as a parameter. Use the checkbox
                  to enable validator references.
                </p>
                <div className="bg-zinc-800 p-3 rounded text-xs">
                  Select &quot;Use validator hash reference&quot; and choose the validator
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">Complex Types</h4>
                <p className="text-sm mb-2">
                  Maps, constructors, and custom types require CBOR-encoded values.
                </p>
                <div className="bg-zinc-800 p-3 rounded font-mono text-xs">
                  Example: d8799f581c... (CBOR constructor)
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Registry Submission */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Submitting to Registry</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              After successful verification, you can submit your contract to the public registry.
              This makes it searchable and provides proof of verification.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
              <h3 className="text-xl font-semibold mb-3">Submission Process</h3>

              <ol className="list-decimal list-inside space-y-3">
                <li>
                  <span className="font-semibold">Connect Wallet</span>
                  <p className="ml-6 mt-1 text-sm">
                    Click &quot;Connect Wallet&quot; and choose your Cardano wallet (Eternl, Nami, Flint, etc.)
                  </p>
                </li>

                <li>
                  <span className="font-semibold">Review Transaction</span>
                  <p className="ml-6 mt-1 text-sm">
                    The transaction includes metadata label 1984 with your verification details.
                    Fee is typically 0.3-0.5 ADA.
                  </p>
                </li>

                <li>
                  <span className="font-semibold">Sign &amp; Submit</span>
                  <p className="ml-6 mt-1 text-sm">
                    Sign the transaction in your wallet and submit to the blockchain.
                  </p>
                </li>

                <li>
                  <span className="font-semibold">Backend Processing</span>
                  <p className="ml-6 mt-1 text-sm">
                    The UPLC Link backend detects your transaction and indexes it.
                    Your contract appears in the registry within minutes.
                  </p>
                </li>
              </ol>
            </div>

            <div className="bg-blue-950 border border-blue-800 rounded p-4">
              <h4 className="font-semibold text-blue-200 mb-2">💡 Pro Tip</h4>
              <p className="text-sm text-blue-100">
                Registry submissions are permanent and on-chain. Make sure your verification
                is correct before submitting!
              </p>
            </div>
          </div>
        </section>

        {/* Searching Registry */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Searching the Registry</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              Browse verified contracts in the <a href="/registry" className="text-blue-400 hover:underline">registry</a> or
              use the API to query programmatically.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
              <h3 className="text-xl font-semibold mb-3">Search Methods</h3>

              <div>
                <h4 className="font-semibold text-white mb-2">By URL Pattern</h4>
                <p className="text-sm mb-2">
                  Search for all contracts from a specific organization or project.
                </p>
                <div className="bg-zinc-800 p-3 rounded font-mono text-xs">
                  Example: &quot;sundae-labs&quot; or &quot;aiken-lang&quot;
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">By Script Hash</h4>
                <p className="text-sm mb-2">
                  Look up a specific contract by its on-chain script hash.
                </p>
                <div className="bg-zinc-800 p-3 rounded font-mono text-xs">
                  GET /api/v1/scripts/by-hash/&#123;hash&#125;
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">By Address</h4>
                <p className="text-sm mb-2">
                  Query contracts by Cardano address (script address, stake address, etc.)
                </p>
                <div className="bg-zinc-800 p-3 rounded font-mono text-xs">
                  GET /api/v1/scripts/by-address/addr1...
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* API Reference */}
        <section>
          <h2 className="text-3xl font-bold mb-4">API Reference</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              The UPLC Link API provides programmatic access to the verification registry.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-6">
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">Base URL</h3>
                <div className="bg-zinc-800 p-3 rounded font-mono text-sm">
                  https://api.uplc.link/api/v1
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">Interactive Documentation</h3>
                <p className="text-sm mb-2">
                  Explore all endpoints with Swagger UI:
                </p>
                <a
                  href="https://api.uplc.link/swagger-ui.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  Open API Docs →
                </a>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3">Common Endpoints</h3>
                <div className="space-y-3">
                  <div className="bg-zinc-800 p-3 rounded">
                    <div className="font-mono text-xs text-green-400 mb-1">GET</div>
                    <div className="font-mono text-sm">/scripts/search?urlPattern=&#123;pattern&#125;</div>
                  </div>
                  <div className="bg-zinc-800 p-3 rounded">
                    <div className="font-mono text-xs text-green-400 mb-1">GET</div>
                    <div className="font-mono text-sm">/scripts/by-hash/&#123;hash&#125;</div>
                  </div>
                  <div className="bg-zinc-800 p-3 rounded">
                    <div className="font-mono text-xs text-green-400 mb-1">GET</div>
                    <div className="font-mono text-sm">/scripts/by-source?sourceUrl=&#123;url&#125;&amp;commit=&#123;hash&#125;</div>
                  </div>
                  <div className="bg-zinc-800 p-3 rounded">
                    <div className="font-mono text-xs text-green-400 mb-1">GET</div>
                    <div className="font-mono text-sm">/verification-requests?sourceUrl=&#123;url&#125;&amp;commit=&#123;hash&#125;</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Troubleshooting */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Troubleshooting</h2>
          <div className="space-y-4 text-gray-300">
            <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-white mb-2">❌ Build Failures</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Verify the repository URL is correct and accessible</li>
                  <li>Check the commit hash is valid</li>
                  <li>Ensure the Aiken version matches your project</li>
                  <li>Review build log for compilation errors</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">❌ Hash Mismatches</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Confirm you&apos;re using the same Aiken version</li>
                  <li>Check if validators require parameters</li>
                  <li>Verify the commit hash is exact</li>
                  <li>Ensure expected hashes are from the same network (mainnet/testnet)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">❌ Wallet Connection Issues</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Ensure wallet extension is installed and unlocked</li>
                  <li>Try refreshing the page</li>
                  <li>Check you&apos;re on the correct network (mainnet/testnet)</li>
                  <li>Try a different wallet if problems persist</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">❌ Transaction Failures</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Ensure you have sufficient ADA for fees (typically 0.5-1 ADA)</li>
                  <li>Check wallet is connected to the correct network</li>
                  <li>Wait for previous transactions to confirm</li>
                  <li>Try increasing the transaction fee in wallet settings</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Best Practices</h2>
          <div className="space-y-4 text-gray-300">
            <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h4 className="font-semibold text-white">Tag Releases</h4>
                  <p className="text-sm">
                    Use Git tags for production deployments. This makes verification easier
                    and more reliable.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h4 className="font-semibold text-white">Document Parameters</h4>
                  <p className="text-sm">
                    If your validators require parameters, document them in your README
                    for easy verification.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h4 className="font-semibold text-white">Pin Dependencies</h4>
                  <p className="text-sm">
                    Lock your Aiken version in aiken.toml to ensure reproducible builds.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h4 className="font-semibold text-white">Verify Before Deployment</h4>
                  <p className="text-sm">
                    Always verify your contracts before deploying to mainnet. Catch
                    issues early.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h4 className="font-semibold text-white">Submit to Registry</h4>
                  <p className="text-sm">
                    After deployment, submit to the registry for public transparency
                    and trust.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section>
          <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4 text-gray-300">
            <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
              <summary className="font-semibold cursor-pointer">
                Is my code sent to a server?
              </summary>
              <p className="mt-2 text-sm">
                Yes. The Next.js server clones your repository and builds it with native Aiken.
                However, only public repositories are supported, and all builds happen in isolated
                temporary directories that are cleaned up immediately after. The server is stateless
                and doesn&apos;t store your code.
              </p>
            </details>

            <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
              <summary className="font-semibold cursor-pointer">
                What is metadata label 1984?
              </summary>
              <p className="mt-2 text-sm">
                Metadata label 1984 is used for contract verification submissions on Cardano.
                It contains the source URL, commit hash, and validator information.
              </p>
            </details>

            <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
              <summary className="font-semibold cursor-pointer">
                Can I verify private repositories?
              </summary>
              <p className="mt-2 text-sm">
                Currently, only public repositories are supported since verification
                happens in the browser via HTTP.
              </p>
            </details>

            <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
              <summary className="font-semibold cursor-pointer">
                How long does verification take?
              </summary>
              <p className="mt-2 text-sm">
                Typically 5-30 seconds depending on contract complexity and server load.
                The server needs to clone the repository, install the correct Aiken version,
                and compile the contract.
              </p>
            </details>

            <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
              <summary className="font-semibold cursor-pointer">
                Is UPLC Link free to use?
              </summary>
              <p className="mt-2 text-sm">
                Yes! UPLC Link is open-source and free. Registry submissions require a small
                blockchain transaction fee (0.3-0.5 ADA).
              </p>
            </details>

            <details className="bg-zinc-900 border border-zinc-800 rounded p-4">
              <summary className="font-semibold cursor-pointer">
                Can I self-host UPLC Link?
              </summary>
              <p className="mt-2 text-sm">
                Absolutely! The entire platform is open-source. See the{' '}
                <a href="https://github.com/easy1staking-com/plutus-scan" className="text-blue-400 hover:underline">
                  GitHub repository
                </a>{' '}
                for deployment instructions.
              </p>
            </details>
          </div>
        </section>

        {/* Support */}
        <section className="pb-8">
          <h2 className="text-3xl font-bold mb-4">Support &amp; Resources</h2>
          <div className="space-y-4 text-gray-300">
            <div className="bg-zinc-900 border border-zinc-800 rounded p-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-white mb-2">Documentation</h4>
                  <ul className="space-y-1 text-sm">
                    <li>
                      <a href="/docs" className="text-blue-400 hover:underline">User Guide</a>
                    </li>
                    <li>
                      <a href="https://api.uplc.link/swagger-ui.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        API Reference
                      </a>
                    </li>
                    <li>
                      <a href="https://github.com/easy1staking-com/plutus-scan" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        GitHub Repository
                      </a>
                    </li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-white mb-2">Community</h4>
                  <ul className="space-y-1 text-sm">
                    <li>
                      <a href="https://github.com/easy1staking-com/plutus-scan/issues" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        Report Issues
                      </a>
                    </li>
                    <li>
                      <a href="https://twitter.com/cryptojoe101" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        Twitter
                      </a>
                    </li>
                    <li>
                      <a href="https://easy1staking.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        EASY1 Stake Pool
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
