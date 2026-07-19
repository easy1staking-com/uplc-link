'use client';

import { createContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { Client, Address, mainnet, preprod, preview } from '@evolution-sdk/evolution';
import type { WalletContextType, ConnectedWallet } from '../types/wallet';
import { config } from '../config';

export const WalletContext = createContext<WalletContextType | null>(null);

const chains = { mainnet, preprod, preview } as const;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [address, setAddress] = useState<string>('');
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Network validation
  const expectedNetworkId = config.network.expectedNetworkId;
  const isNetworkMismatch = networkId !== null && networkId !== expectedNetworkId;

  // Get human-readable network names
  const expectedNetwork = config.network.displayName;
  const walletNetworkName = useMemo(() => {
    if (networkId === null) return '';
    return networkId === 1 ? 'Mainnet' : 'Testnet';
  }, [networkId]);

  const connectWallet = useCallback(async (walletKey: string): Promise<void> => {
    setIsConnecting(true);
    try {
      console.log('Connecting to wallet:', walletKey);

      const injected = window.cardano?.[walletKey];
      if (!injected) {
        throw new Error(`Wallet ${walletKey} not found`);
      }

      // Enable via raw CIP-30, then wrap in an Evolution signing client
      const api = await injected.enable();
      const client = Client.make(chains[config.cardanoNetwork])
        .withKoios({ baseUrl: config.network.koiosUrl })
        .withCip30(api);

      const walletAddress = Address.toBech32(await client.address());
      const network = await api.getNetworkId();

      console.log('Wallet connected:', walletAddress);

      setWallet({ api, client });
      setAddress(walletAddress);
      setNetworkId(network);
      setWalletName(walletKey);

      // Save preference
      localStorage.setItem('preferredWallet', walletKey);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Auto-reconnect on mount if wallet was previously connected
  useEffect(() => {
    const preferredWallet = localStorage.getItem('preferredWallet');
    if (preferredWallet && typeof window !== 'undefined' && !wallet) {
      // Check if wallet is still available
      if (window.cardano?.[preferredWallet]) {
        connectWallet(preferredWallet).catch((error) => {
          console.log('Auto-reconnect failed:', error);
          localStorage.removeItem('preferredWallet');
        });
      } else {
        // Wallet no longer available, clear preference
        localStorage.removeItem('preferredWallet');
      }
    }
  }, [connectWallet, wallet]);

  function disconnectWallet(): void {
    setWallet(null);
    setAddress('');
    setNetworkId(null);
    setWalletName(null);
    localStorage.removeItem('preferredWallet');
    console.log('Wallet disconnected');
  }

  const value: WalletContextType = {
    wallet,
    address,
    networkId,
    walletName,
    isConnecting,
    isNetworkMismatch,
    expectedNetwork,
    walletNetworkName,
    connectWallet,
    disconnectWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}
