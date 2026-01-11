'use client';

import { useContext, useEffect, useState } from 'react';
import { WalletContext } from './wallet-provider';
import type { WalletContextType } from '../types/wallet';

/**
 * Hook to access wallet context
 * Must be used within WalletProvider
 */
export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

export interface WalletInfo {
  id: string;
  name: string;
  icon: string;
}

/**
 * Hook to detect available Cardano wallets in the browser
 * Returns list of wallet info with icons (CIP-30 standard)
 */
export function useAvailableWallets(): WalletInfo[] {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const detectWallets = () => {
      const detected: WalletInfo[] = [];

      if (window.cardano) {
        // Iterate through all properties in window.cardano
        Object.keys(window.cardano).forEach((key) => {
          const wallet = window.cardano?.[key];
          // Check if it's a valid CIP-30 wallet (has name and icon)
          if (wallet && typeof wallet === 'object' && 'name' in wallet && 'icon' in wallet) {
            detected.push({
              id: key,
              name: (wallet as any).name,
              icon: (wallet as any).icon
            });
          }
        });
      }

      setWallets(detected);
      console.log('Detected wallets:', detected);
    };

    // Detect immediately
    detectWallets();

    // Also detect after a short delay (some wallets load asynchronously)
    const timeoutId = setTimeout(detectWallets, 500);

    return () => clearTimeout(timeoutId);
  }, []);

  return wallets;
}

/**
 * Format wallet name for display
 */
export function formatWalletName(walletKey: string): string {
  const names: Record<string, string> = {
    eternl: 'Eternl',
    nami: 'Nami',
    flint: 'Flint',
    typhon: 'Typhon',
    gerowallet: 'GeroWallet',
  };
  return names[walletKey] || walletKey;
}

/**
 * Truncate address for display (e.g., addr1...abc123)
 */
export function truncateAddress(address: string, start = 8, end = 6): string {
  if (!address || address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
