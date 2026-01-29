"use client";

import { useState } from 'react';

// Import directly from package source for development
import {
  VerificationBadge,
  ScriptCard,
  VerifyButton,
  VerificationWidget,
} from '../../../../packages/react/src';

// Use local API for development
const devConfig = {
  baseUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:8080',
};

// Example data - replace with your own verified script hashes
const EXAMPLE_VERIFIED_HASH = 'd91724ab50296c7dfea771d03a1f88c3a59a80a624e5c105b42c009a';
const EXAMPLE_TX_HASH = '7e6d7d45f072ad01b2ad3ced26c328f7afd0f7fefc6a490a914496f8f0f27bf2';

export default function ComponentsPreview() {
  const [customHash, setCustomHash] = useState('');

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">@uplc-link/react Components</h1>
        <p className="text-gray-400">Preview and test the npm package components</p>
      </div>

      {/* Custom Hash Input */}
      <div className="mb-8 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
        <label className="block text-sm font-medium mb-2">Test with custom hash:</label>
        <input
          type="text"
          value={customHash}
          onChange={(e) => setCustomHash(e.target.value)}
          placeholder="Enter script hash or address..."
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono"
        />
      </div>

      {/* VerificationBadge */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">
          VerificationBadge
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Simple badge showing verified/unverified status
        </p>

        <div className="space-y-6">
          {/* Verified example */}
          <div className="p-4 bg-zinc-900 rounded-lg">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Verified Script</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <VerificationBadge scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} size="sm" />
              <VerificationBadge scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} size="md" />
              <VerificationBadge scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} size="lg" />
            </div>
          </div>

          {/* Unverified example */}
          <div className="p-4 bg-zinc-900 rounded-lg">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Unverified Script</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <VerificationBadge scriptHash="0000000000000000000000000000000000000000000000000000dead" config={devConfig} size="sm" />
              <VerificationBadge scriptHash="0000000000000000000000000000000000000000000000000000dead" config={devConfig} size="md" />
              <VerificationBadge scriptHash="0000000000000000000000000000000000000000000000000000dead" config={devConfig} size="lg" />
            </div>
          </div>

          {/* Custom hash */}
          {customHash && (
            <div className="p-4 bg-zinc-900 rounded-lg">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Custom Input</h3>
              <VerificationBadge scriptHash={customHash} config={devConfig} />
            </div>
          )}
        </div>

        <pre className="mt-4 p-3 bg-zinc-950 rounded text-xs text-gray-400 overflow-x-auto">
{`<VerificationBadge scriptHash="${EXAMPLE_VERIFIED_HASH}" />`}
        </pre>
      </section>

      {/* ScriptCard */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">
          ScriptCard
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Rich card displaying verification details
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Full card */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Full Card</h3>
            <ScriptCard scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} />
          </div>

          {/* Compact card */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Compact Card</h3>
            <ScriptCard scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} compact />
          </div>
        </div>

        {/* Unverified */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Unverified Script</h3>
          <ScriptCard scriptHash="0000000000000000000000000000000000000000000000000000dead" config={devConfig} />
        </div>

        {/* Custom */}
        {customHash && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Custom Input</h3>
            <ScriptCard scriptHash={customHash} config={devConfig} />
          </div>
        )}

        <pre className="mt-4 p-3 bg-zinc-950 rounded text-xs text-gray-400 overflow-x-auto">
{`<ScriptCard scriptHash="${EXAMPLE_VERIFIED_HASH}" />
<ScriptCard scriptHash="${EXAMPLE_VERIFIED_HASH}" compact />`}
        </pre>
      </section>

      {/* VerifyButton */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">
          VerifyButton
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Call-to-action button linking to UPLC Link verification
        </p>

        <div className="space-y-6">
          {/* Variants */}
          <div className="p-4 bg-zinc-900 rounded-lg">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Variants</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig} variant="primary" />
              <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig} variant="secondary" />
              <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig} variant="outline" />
            </div>
          </div>

          {/* Sizes */}
          <div className="p-4 bg-zinc-900 rounded-lg">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Sizes</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig} size="sm" />
              <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig} size="md" />
              <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig} size="lg" />
            </div>
          </div>

          {/* Custom text */}
          <div className="p-4 bg-zinc-900 rounded-lg">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Custom Text</h3>
            <VerifyButton txHash={EXAMPLE_TX_HASH} config={devConfig}>
              Check Verification
            </VerifyButton>
          </div>
        </div>

        <pre className="mt-4 p-3 bg-zinc-950 rounded text-xs text-gray-400 overflow-x-auto">
{`<VerifyButton txHash="${EXAMPLE_TX_HASH}" />
<VerifyButton txHash="..." variant="secondary" size="lg" />
<VerifyButton txHash="...">Custom Text</VerifyButton>`}
        </pre>
      </section>

      {/* VerificationWidget */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-zinc-800">
          VerificationWidget
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Self-contained widget with loading state, auto-fetch, and full verification display
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Verified */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Verified Contract</h3>
            <VerificationWidget scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} />
          </div>

          {/* Not Registered */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Not Registered</h3>
            <VerificationWidget scriptHash="0000000000000000000000000000000000000000000000000000dead" config={devConfig} />
          </div>
        </div>

        {/* Theme variants */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Theme Variants</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-2">Light</div>
              <VerificationWidget scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} theme="light" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2">Dark</div>
              <VerificationWidget scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} theme="dark" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2">Auto (follows system)</div>
              <VerificationWidget scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} theme="auto" />
            </div>
          </div>
        </div>

        {/* Without branding */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Without &quot;Powered by&quot; Footer</h3>
          <div className="max-w-sm">
            <VerificationWidget scriptHash={EXAMPLE_VERIFIED_HASH} config={devConfig} showPoweredBy={false} />
          </div>
        </div>

        {/* Custom */}
        {customHash && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Custom Input</h3>
            <div className="max-w-sm">
              <VerificationWidget scriptHash={customHash} config={devConfig} />
            </div>
          </div>
        )}

        <pre className="mt-4 p-3 bg-zinc-950 rounded text-xs text-gray-400 overflow-x-auto">
{`<VerificationWidget scriptHash="${EXAMPLE_VERIFIED_HASH}" />
<VerificationWidget address="addr1..." theme="dark" />
<VerificationWidget scriptHash="..." showPoweredBy={false} />`}
        </pre>
      </section>

      {/* Installation */}
      <section className="mb-12 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
        <h2 className="text-xl font-semibold mb-4">Installation</h2>
        <pre className="p-3 bg-zinc-950 rounded text-sm text-green-400 overflow-x-auto">
npm install @uplc-link/react
        </pre>
        <pre className="mt-4 p-3 bg-zinc-950 rounded text-xs text-gray-400 overflow-x-auto">
{`import { VerificationBadge, ScriptCard, VerifyButton } from '@uplc-link/react';`}
        </pre>
      </section>
    </main>
  );
}
