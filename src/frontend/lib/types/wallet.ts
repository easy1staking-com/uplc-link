/**
 * Wallet-related type definitions
 */

import type { Client } from '@evolution-sdk/evolution';
import type * as Wallet from '@evolution-sdk/evolution/sdk/wallet/Wallet';

/** Full signing client returned by Client.make(chain).withKoios(...).withCip30(api) */
export type SigningClient = Client.SigningClient;

/**
 * Raw CIP-30 API handle returned by window.cardano[key].enable().
 * Evolution's WalletApi plus the CIP-30 members it doesn't type.
 */
export interface Cip30Api extends Wallet.WalletApi {
  getNetworkId: () => Promise<number>;
  getChangeAddress: () => Promise<string>;
}

/** A connected wallet: raw CIP-30 handle + Evolution signing client */
export interface ConnectedWallet {
  api: Cip30Api;
  client: SigningClient;
}

export interface WalletInfo {
  name: string;
  icon: string;
  version: string;
}

export interface WalletContextType {
  wallet: ConnectedWallet | null;
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

// CIP-30 injected wallet entry on window.cardano
export interface CardanoWalletApi {
  name: string;
  icon: string;
  apiVersion: string;
  enable: () => Promise<Cip30Api>;
  isEnabled: () => Promise<boolean>;
}

declare global {
  interface Window {
    cardano?: Record<string, CardanoWalletApi>;
  }
}
