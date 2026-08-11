import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import {
  fetchScriptByHash,
  fetchVerificationByTxHash,
  repoDisplayName,
  SITE_URL,
} from '@/lib/social-cards';

// PNG output is required: X and Facebook do not render SVG og:images.
// Short shared cache — card contents change as verifications are indexed.
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=86400';

const WIDTH = 1200;
const HEIGHT = 630;

interface Detail {
  label: string;
  value: string;
}

interface Badge {
  text: string;
  color: string;
  textColor?: string;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.substring(0, max - 3) + '...' : value;
}

function Card({
  title,
  subtitle,
  badges = [],
  details = [],
}: {
  title: string;
  subtitle?: string;
  badges?: Badge[];
  details?: Detail[];
}) {
  const hostname = SITE_URL.replace(/^https?:\/\//, '');
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#09090b',
        padding: '64px 80px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
        <span style={{ fontSize: 40, fontWeight: 700, color: '#3b82f6' }}>
          UPLC Link
        </span>
        {subtitle && (
          <span style={{ fontSize: 26, color: '#71717a' }}>{subtitle}</span>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          marginTop: 56,
          fontSize: 58,
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.15,
        }}
      >
        {truncate(title, 44)}
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginTop: 32 }}>
          {badges.map((badge) => (
            <div
              key={badge.text}
              style={{
                display: 'flex',
                backgroundColor: badge.color,
                color: badge.textColor ?? '#000000',
                fontSize: 22,
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: 10,
              }}
            >
              {badge.text}
            </div>
          ))}
        </div>
      )}

      {/* Details */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          gap: 14,
        }}
      >
        {details.map((detail) => (
          <div
            key={detail.label + detail.value}
            style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}
          >
            {detail.label && (
              <span style={{ fontSize: 22, color: '#71717a', minWidth: 130 }}>
                {detail.label}
              </span>
            )}
            <span style={{ fontSize: 25, color: '#a1a1aa' }}>
              {truncate(detail.value, 70)}
            </span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            paddingTop: 22,
            borderTop: '1px solid #27272a',
            fontSize: 22,
            color: '#52525b',
          }}
        >
          {hostname}
        </div>
      </div>
    </div>
  );
}

function statusBadge(parameterizationStatus: string): Badge {
  if (parameterizationStatus === 'COMPLETE') {
    return { text: 'Fully Parameterized', color: '#22c55e' };
  }
  if (parameterizationStatus === 'PARTIAL') {
    return { text: 'Partially Parameterized', color: '#eab308' };
  }
  return { text: 'Not Parameterized', color: '#6b7280', textColor: '#ffffff' };
}

function verificationStatusBadge(status: string): Badge {
  if (status === 'VERIFIED') {
    return { text: 'Verified', color: '#22c55e' };
  }
  if (status === 'FAILED') {
    return { text: 'Verification Failed', color: '#ef4444', textColor: '#ffffff' };
  }
  return { text: status, color: '#6b7280', textColor: '#ffffff' };
}

function compilerDetail(compilerType: string, compilerVersion: string, env: string | null): Detail {
  return {
    label: 'Compiler',
    value: `${compilerType} ${compilerVersion}${env ? ` (env: ${env})` : ''}`,
  };
}

async function registryCard(hash: string) {
  const data = await fetchScriptByHash(hash);
  if (!data || !data.scripts || data.scripts.length === 0) {
    return (
      <Card
        title="Script Not Found"
        subtitle="Registry"
        details={[{ label: 'Hash', value: truncate(hash, 44) }]}
      />
    );
  }
  const script = data.scripts[0];
  return (
    <Card
      title={`${script.moduleName}.${script.validatorName}`}
      subtitle="Verified Smart Contract"
      badges={[statusBadge(script.parameterizationStatus)]}
      details={[
        { label: 'Hash', value: hash.substring(0, 32) + '...' },
        {
          label: 'Source',
          value: `${repoDisplayName(data.sourceUrl)} @ ${data.commitHash.substring(0, 8)}`,
        },
        compilerDetail(data.compilerType, data.compilerVersion, data.env),
      ]}
    />
  );
}

async function verifyCard(txHash: string) {
  const data = await fetchVerificationByTxHash(txHash);
  if (!data) {
    return (
      <Card
        title="Verification Not Found"
        subtitle="Verify"
        details={[{ label: 'Transaction', value: truncate(txHash, 44) }]}
      />
    );
  }
  const scriptCount = new Set(
    data.scripts.map((s) => s.finalHash || s.rawHash).filter(Boolean)
  ).size;
  return (
    <Card
      title={repoDisplayName(data.sourceUrl)}
      subtitle="On-chain Verification"
      badges={[verificationStatusBadge(data.status)]}
      details={[
        { label: 'Commit', value: data.commitHash.substring(0, 12) },
        compilerDetail(data.compilerType, data.compilerVersion, data.env),
        {
          label: 'Scripts',
          value: `${scriptCount} script hash${scriptCount === 1 ? '' : 'es'}`,
        },
      ]}
    />
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'home';
    const hash = searchParams.get('hash');
    const txHash = searchParams.get('txHash');

    let card: React.ReactElement;
    if (type === 'registry' && hash) {
      card = await registryCard(hash);
    } else if (type === 'registry') {
      card = (
        <Card
          title="Registry Explorer"
          details={[
            { label: '', value: 'Search and explore verified Plutus smart contracts' },
          ]}
        />
      );
    } else if (type === 'verify' && txHash) {
      card = await verifyCard(txHash);
    } else if (type === 'verify') {
      card = (
        <Card
          title="Smart Contract Verification"
          details={[
            { label: '', value: 'Verify Plutus smart contracts from source code' },
          ]}
        />
      );
    } else {
      card = (
        <Card
          title="UPLC Link"
          details={[
            { label: '', value: 'Plutus Smart Contract Explorer & Verification Platform' },
          ]}
        />
      );
    }

    return new ImageResponse(card, {
      width: WIDTH,
      height: HEIGHT,
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    console.error('Error generating OG image:', error);
    return new ImageResponse(
      (
        <Card
          title="UPLC Link"
          subtitle="Smart Contract Verification"
        />
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        headers: { 'Cache-Control': CACHE_CONTROL },
      }
    );
  }
}
