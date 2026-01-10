'use client';

import { useState } from 'react';
import { useWallet, useAvailableWallets, formatWalletName, truncateAddress } from '@/lib/cardano/wallet-hooks';

export function WalletConnectButton() {
  const { wallet, address, walletName, isConnecting, connectWallet, disconnectWallet } = useWallet();
  const availableWallets = useAvailableWallets();
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string>('');

  async function handleConnect(walletKey: string) {
    setError('');
    setShowDropdown(false);

    try {
      await connectWallet(walletKey);
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError('Failed to connect wallet. Please try again.');
    }
  }

  function handleDisconnect() {
    disconnectWallet();
    setShowDropdown(false);
  }

  // If wallet is connected, show address and disconnect button
  if (wallet && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600 transition-colors flex items-center gap-2"
        >
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm">{truncateAddress(address)}</span>
          <span className="text-xs text-gray-500">({formatWalletName(walletName || '')})</span>
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded shadow-lg z-20">
              <div className="p-4 border-b border-zinc-800">
                <div className="text-xs text-gray-500 mb-1">Connected Wallet</div>
                <div className="text-sm font-mono break-all">{address}</div>
              </div>
              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-zinc-800 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // If no wallet connected, show connect button
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isConnecting}
        className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded shadow-lg z-20">
            {availableWallets.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">
                No Cardano wallets detected. Please install Eternl, Nami, or Flint.
              </div>
            ) : (
              <>
                <div className="p-2 border-b border-zinc-800">
                  <div className="text-xs text-gray-500 px-2 py-1">Select Wallet</div>
                </div>
                {availableWallets.map((walletKey) => (
                  <button
                    key={walletKey}
                    onClick={() => handleConnect(walletKey)}
                    className="w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors flex items-center gap-3"
                  >
                    <div className="text-sm font-medium">{formatWalletName(walletKey)}</div>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="absolute right-0 mt-2 w-64 p-3 bg-red-950 border border-red-800 rounded text-sm text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
