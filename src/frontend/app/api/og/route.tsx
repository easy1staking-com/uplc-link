import { NextRequest, NextResponse } from 'next/server';

// Helper to fetch script data
async function fetchScriptByHash(hash: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/registry?action=byHash&hash=${hash}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching script for OG image:', error);
    return null;
  }
}

// Generate SVG OG image
function generateSVG(config: {
  title: string;
  subtitle?: string;
  details?: Array<{ label: string; value: string }>;
  statusColor?: string;
  statusText?: string;
}) {
  const { title, subtitle, details = [], statusColor, statusText } = config;

  const detailsHTML = details
    .map(
      (d, i) => `
    <text x="80" y="${440 + i * 40}" font-size="20" fill="#71717a">${d.label}:</text>
    <text x="80" y="${465 + i * 40}" font-size="24" fill="#a1a1aa" font-family="monospace">${d.value}</text>
  `
    )
    .join('');

  const statusBadge = statusColor && statusText
    ? `<rect x="80" y="280" width="${statusText.length * 12 + 40}" height="40" rx="8" fill="${statusColor}"/>
       <text x="${80 + (statusText.length * 12 + 40) / 2}" y="306" font-size="20" font-weight="bold" fill="#000" text-anchor="middle">${statusText}</text>`
    : '';

  return `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#09090b"/>

      <!-- Header -->
      <text x="80" y="80" font-size="36" font-weight="bold" fill="#3b82f6">UPLC Scan</text>
      ${subtitle ? `<text x="300" y="80" font-size="24" fill="#71717a">${subtitle}</text>` : ''}

      <!-- Title -->
      <text x="80" y="180" font-size="56" font-weight="bold" fill="#ffffff" style="max-width: 1040px;">${title.length > 40 ? title.substring(0, 37) + '...' : title}</text>

      <!-- Status Badge -->
      ${statusBadge}

      <!-- Details -->
      ${detailsHTML}
    </svg>
  `.trim();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'home';
    const hash = searchParams.get('hash');

    let svgContent: string;

    // Registry with hash - show script details
    if (type === 'registry' && hash) {
      const scriptData = await fetchScriptByHash(hash);

      if (scriptData && scriptData.scripts && scriptData.scripts.length > 0) {
        const script = scriptData.scripts[0];
        const scriptName = `${script.moduleName}.${script.validatorName}`;
        const shortHash = hash.substring(0, 24) + '...';
        const repoName = scriptData.sourceUrl.split('/').slice(-2).join('/');
        const commitShort = scriptData.commitHash.substring(0, 8);

        const statusColor =
          script.parameterizationStatus === 'COMPLETE'
            ? '#22c55e'
            : script.parameterizationStatus === 'PARTIAL'
            ? '#eab308'
            : '#6b7280';

        const statusText =
          script.parameterizationStatus === 'COMPLETE'
            ? '✓ Fully Parameterized'
            : script.parameterizationStatus === 'PARTIAL'
            ? '⚡ Partially Parameterized'
            : 'Not Parameterized';

        svgContent = generateSVG({
          title: scriptName,
          subtitle: 'Verified Smart Contract',
          statusColor,
          statusText,
          details: [
            { label: 'Hash', value: shortHash },
            { label: 'Source', value: `${repoName} @ ${commitShort}` },
            { label: 'Compiler', value: `${scriptData.compilerType} ${scriptData.compilerVersion}` },
          ],
        });
      } else {
        // Hash not found
        svgContent = generateSVG({
          title: 'Script Not Found',
          subtitle: 'UPLC Scan',
          details: [{ label: 'Hash', value: hash.substring(0, 40) + '...' }],
        });
      }
    } else if (type === 'registry') {
      // Registry without hash
      svgContent = generateSVG({
        title: 'Registry Explorer',
        subtitle: 'UPLC Scan',
        details: [
          { label: '', value: 'Search and explore verified Plutus smart contracts' },
        ],
      });
    } else if (type === 'verify') {
      // Verify page
      svgContent = generateSVG({
        title: 'Smart Contract Verification',
        subtitle: 'UPLC Scan',
        details: [
          { label: '', value: 'Verify Plutus smart contracts from source code' },
        ],
      });
    } else {
      // Home page - default
      svgContent = generateSVG({
        title: 'UPLC Scan',
        subtitle: '',
        details: [
          { label: '', value: 'Plutus Smart Contract Explorer & Verification Platform' },
        ],
      });
    }

    return new NextResponse(svgContent, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error generating OG image:', error);

    // Fallback SVG
    const fallbackSVG = generateSVG({
      title: 'UPLC Scan',
      subtitle: 'Smart Contract Verification',
      details: [],
    });

    return new NextResponse(fallbackSVG, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}
