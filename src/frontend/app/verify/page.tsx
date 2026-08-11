import { Metadata } from 'next';
import { fetchVerificationByTxHash, repoDisplayName } from '@/lib/social-cards';

// Social cards for /verify?txHash=... deep links: crawlers don't run JS, so
// the meta tags must come from the server. The interactive page itself stays
// a client component (re-exported below).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ txHash?: string }>;
}): Promise<Metadata> {
  const { txHash } = await searchParams;

  const defaultMetadata: Metadata = {
    title: 'Verify Smart Contract',
    description:
      'Verify Aiken smart contracts from source code in your browser and anchor the verification on-chain.',
    openGraph: {
      title: 'Verify Smart Contract | UPLC Link',
      description: 'Verify Aiken smart contracts from source code in your browser',
      type: 'website',
      siteName: 'UPLC Link',
      url: '/verify',
      images: [
        { url: '/api/og?type=verify', width: 1200, height: 630, alt: 'Smart Contract Verification' },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Verify Smart Contract | UPLC Link',
      description: 'Verify Aiken smart contracts from source code in your browser',
      images: ['/api/og?type=verify'],
    },
  };

  if (!txHash) {
    return defaultMetadata;
  }

  const verification = await fetchVerificationByTxHash(txHash);
  if (!verification) {
    return defaultMetadata;
  }

  const repo = repoDisplayName(verification.sourceUrl);
  const commitShort = verification.commitHash.substring(0, 8);
  const scriptCount = new Set(
    verification.scripts.map((s) => s.finalHash || s.rawHash).filter(Boolean)
  ).size;

  const title = `${repo} @ ${commitShort}`;
  const description =
    `On-chain verification of ${repo} at ${commitShort} | ` +
    `${verification.compilerType} ${verification.compilerVersion}` +
    `${verification.env ? ` (env: ${verification.env})` : ''} | ` +
    `${scriptCount} script hash${scriptCount === 1 ? '' : 'es'} | ${verification.status}`;

  const ogImage = `/api/og?type=verify&txHash=${encodeURIComponent(txHash)}`;
  const pageUrl = `/verify?txHash=${encodeURIComponent(txHash)}`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | UPLC Link`,
      description,
      type: 'website',
      siteName: 'UPLC Link',
      url: pageUrl,
      images: [
        { url: ogImage, width: 1200, height: 630, alt: `${repo} verification details` },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | UPLC Link`,
      description,
      images: [ogImage],
    },
  };
}

export { default } from './VerifyPageContent';
