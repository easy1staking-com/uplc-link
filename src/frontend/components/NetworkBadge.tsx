'use client';

import { config } from '@/lib/config';

/**
 * NetworkBadge - Displays a visual indicator for testnet environments
 *
 * - Mainnet: No badge (clean production look)
 * - Preprod: Yellow pill badge
 * - Preview: Blue pill badge
 */
export function NetworkBadge() {
  const { network, cardanoNetwork } = config;

  // Don't show badge for mainnet
  if (!network.showBadge) {
    return null;
  }

  const colorClasses = {
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  };

  const colors = network.badgeColor ? colorClasses[network.badgeColor] : colorClasses.yellow;

  return (
    <span
      className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full border ${colors}`}
    >
      {cardanoNetwork}
    </span>
  );
}
