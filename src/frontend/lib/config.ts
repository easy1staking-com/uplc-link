/**
 * Application configuration
 * Loads environment variables and provides typed configuration
 */

export type CardanoNetwork = 'mainnet' | 'preprod' | 'preview';

export interface NetworkConfig {
  displayName: string;
  explorerUrl: string;
  expectedNetworkId: number; // 0 = testnet, 1 = mainnet (CIP-30)
  showBadge: boolean;
  badgeColor?: 'yellow' | 'blue';
}

export const networkConfigs: Record<CardanoNetwork, NetworkConfig> = {
  mainnet: {
    displayName: 'Mainnet',
    explorerUrl: 'https://cexplorer.io',
    expectedNetworkId: 1,
    showBadge: false,
  },
  preprod: {
    displayName: 'Preprod',
    explorerUrl: 'https://preprod.cexplorer.io',
    expectedNetworkId: 0,
    showBadge: true,
    badgeColor: 'yellow',
  },
  preview: {
    displayName: 'Preview',
    explorerUrl: 'https://preview.cexplorer.io',
    expectedNetworkId: 0,
    showBadge: true,
    badgeColor: 'blue',
  },
};

// Get current network from environment
const currentNetwork = (process.env.NEXT_PUBLIC_CARDANO_NETWORK || 'mainnet') as CardanoNetwork;

// Validate network is valid
const validNetworks: CardanoNetwork[] = ['mainnet', 'preprod', 'preview'];
const resolvedNetwork: CardanoNetwork = validNetworks.includes(currentNetwork) ? currentNetwork : 'mainnet';

export const config = {
  // Backend API URL
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080',

  // Cardano network (mainnet, preprod, preview)
  cardanoNetwork: resolvedNetwork,

  // Current network configuration
  network: networkConfigs[resolvedNetwork],

  // Cardano explorer URL for transaction links (derived from network)
  explorerUrl: networkConfigs[resolvedNetwork].explorerUrl,

  // API configuration
  api: {
    prefix: '/api/v1',
    endpoints: {
      scriptsBySource: '/scripts/by-source',
      scriptsByHash: '/scripts/by-hash',
      verificationStatus: '/verification-requests',
      search: '/scripts/search'
    }
  }
} as const;
