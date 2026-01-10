/**
 * Application configuration
 * Loads environment variables and provides typed configuration
 */

export const config = {
  // Backend API URL
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080',

  // Cardano network (mainnet, preprod, preview)
  cardanoNetwork: process.env.NEXT_PUBLIC_CARDANO_NETWORK || 'mainnet',

  // Cardano explorer URL for transaction links
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://cardanoscan.io',

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
