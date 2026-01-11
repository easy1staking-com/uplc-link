import { NextRequest, NextResponse } from 'next/server';

// Use server-side env var (without NEXT_PUBLIC prefix for security)
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    let backendUrl: string;

    if (action === 'bySource') {
      const sourceUrl = searchParams.get('sourceUrl');
      const commit = searchParams.get('commit');

      if (!sourceUrl || !commit) {
        return NextResponse.json(
          { error: 'Missing required parameters: sourceUrl, commit' },
          { status: 400 }
        );
      }

      backendUrl = `${BACKEND_URL}/api/v1/scripts/by-source?sourceUrl=${encodeURIComponent(sourceUrl)}&commit=${commit}`;
    } else if (action === 'byHash') {
      const hash = searchParams.get('hash');

      if (!hash) {
        return NextResponse.json(
          { error: 'Missing required parameter: hash' },
          { status: 400 }
        );
      }

      backendUrl = `${BACKEND_URL}/api/v1/scripts/by-hash/${hash}`;
    } else if (action === 'status') {
      const sourceUrl = searchParams.get('sourceUrl');
      const commit = searchParams.get('commit');

      if (!sourceUrl || !commit) {
        return NextResponse.json(
          { error: 'Missing required parameters: sourceUrl, commit' },
          { status: 400 }
        );
      }

      backendUrl = `${BACKEND_URL}/api/v1/verification-requests?sourceUrl=${encodeURIComponent(sourceUrl)}&commit=${commit}`;
    } else if (action === 'search') {
      const urlPattern = searchParams.get('urlPattern');

      if (!urlPattern) {
        return NextResponse.json(
          { error: 'Missing required parameter: urlPattern' },
          { status: 400 }
        );
      }

      backendUrl = `${BACKEND_URL}/api/v1/scripts/search?urlPattern=${encodeURIComponent(urlPattern)}`;
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    console.log('Proxying request to:', backendUrl);

    const response = await fetch(backendUrl);

    // Check content type to ensure it's JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Backend returned non-JSON response:', response.status, text);
      return NextResponse.json(
        { error: 'Backend returned non-JSON response', details: text },
        { status: response.status || 500 }
      );
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('Backend error:', response.status, data);
      return NextResponse.json(
        data,
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Backend API error:', error);
    return NextResponse.json(
      { error: 'Backend API error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
