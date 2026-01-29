/**
 * Wallet-related type definitions
 */

import { BrowserWallet } from '@meshsdk/core';

export interface WalletInfo {
  name: string;
  icon: string;
  version: string;
}

export interface WalletConnection {
  wallet: BrowserWallet;
  address: string;
  networkId: number;
  walletName: string;
}

export interface WalletContextType {
  wallet: BrowserWallet | null;
  address: string;
  networkId: number | null;
  walletName: string | null;
  isConnecting: boolean;
  isNetworkMismatch: boolean;
  expectedNetwork: string;
  walletNetworkName: string;
  connectWallet: (walletName: string) => Promise<void>;
  disconnectWallet: () => void;
}

// Cardano wallet API types (from window.cardano)
export interface CardanoWalletApi {
  name: string;
  icon: string;
  apiVersion: string;
  enable: () => Promise<any>;
  isEnabled: () => Promise<boolean>;
}

// MeshSDK already declares Window.cardano type
// We don't need to redeclare it here
