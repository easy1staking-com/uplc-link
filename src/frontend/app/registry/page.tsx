import { Metadata } from 'next';
import { RegistryPageContent } from './RegistryPageContent';

// Helper function to fetch script data server-side for metadata
async function fetchScriptByHash(hash: string) {
  try {
    // Construct the full URL for the API route
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/registry?action=byHash&hash=${hash}`, {
      cache: 'no-store', // Don't cache since this is for OG tags
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching script for metadata:', error);
    return null;
  }
}

// Generate dynamic metadata based on hash parameter
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ hash?: string; url?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const hash = params.hash;

  // Default metadata for when no hash is provided or hash is invalid
  const defaultMetadata: Metadata = {
    title: 'Registry Explorer | UPLC Scan',
    description: 'Search and explore verified Plutus smart contracts on Cardano. View script hashes, source code verification, and parameterization details.',
    openGraph: {
      title: 'Registry Explorer | UPLC Scan',
      description: 'Search and explore verified Plutus smart contracts on Cardano',
      type: 'website',
      siteName: 'UPLC Scan',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Registry Explorer | UPLC Scan',
      description: 'Search and explore verified Plutus smart contracts on Cardano',
    },
  };

  // If no hash parameter, return default metadata
  if (!hash) {
    return defaultMetadata;
  }

  // Try to fetch script data
  const scriptData = await fetchScriptByHash(hash);

  // If fetch failed or no scripts found, return default with hash in description
  if (!scriptData || !scriptData.scripts || scriptData.scripts.length === 0) {
    return {
      title: 'Script Not Found | UPLC Scan',
      description: `No verified script found for hash: ${hash.substring(0, 16)}...`,
      openGraph: {
        title: 'Script Not Found | UPLC Scan',
        description: `No verified script found for hash: ${hash.substring(0, 16)}...`,
        type: 'website',
        siteName: 'UPLC Scan',
      },
      twitter: {
        card: 'summary',
        title: 'Script Not Found | UPLC Scan',
        description: `No verified script found for hash: ${hash.substring(0, 16)}...`,
      },
    };
  }

  // Extract first script for metadata (if multiple scripts share the hash, show the first one)
  const script = scriptData.scripts[0];
  const scriptName = `${script.moduleName}.${script.validatorName}`;
  const shortHash = hash.substring(0, 16);

  // Build description with key details
  const statusText = script.parameterizationStatus === 'COMPLETE'
    ? 'Fully parameterized'
    : script.parameterizationStatus === 'PARTIAL'
    ? 'Partially parameterized'
    : 'Not parameterized';

  const description = `Verified ${script.purpose} script: ${scriptName} | ${script.plutusVersion} | ${statusText} | Compiled with ${scriptData.compilerType} ${scriptData.compilerVersion}`;

  // Extract repository name from source URL for a cleaner display
  const repoName = scriptData.sourceUrl.split('/').slice(-2).join('/');
  const commitShort = scriptData.commitHash.substring(0, 8);

  return {
    title: `${scriptName} | UPLC Scan`,
    description,
    openGraph: {
      title: `${scriptName} | UPLC Scan`,
      description,
      type: 'website',
      siteName: 'UPLC Scan',
      images: [
        {
          url: '/og-image.png', // You can create a dynamic OG image later
          width: 1200,
          height: 630,
          alt: `${scriptName} verification details`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${scriptName}`,
      description: `Verified ${script.purpose} | ${script.plutusVersion} | ${statusText} | Source: ${repoName}@${commitShort}`,
    },
  };
}

// Server component - renders the client component
export default function RegistryPage() {
  return <RegistryPageContent />;
}
