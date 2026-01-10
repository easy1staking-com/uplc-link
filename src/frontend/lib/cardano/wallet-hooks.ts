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

/**
 * Hook to detect available Cardano wallets in the browser
 * Returns list of wallet keys (e.g., ['eternl', 'nami', 'flint'])
 */
export function useAvailableWallets(): string[] {
  const [wallets, setWallets] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check which wallets are installed
    const detected: string[] = [];

    if (window.cardano?.eternl) detected.push('eternl');
    if (window.cardano?.nami) detected.push('nami');
    if (window.cardano?.flint) detected.push('flint');
    if (window.cardano?.typhon) detected.push('typhon');
    if (window.cardano?.gerowallet) detected.push('gerowallet');

    setWallets(detected);

    console.log('Detected wallets:', detected);
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
