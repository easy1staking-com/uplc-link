# UPLC Link - Frontend

Next.js-based web application for verifying Cardano smart contracts against their source code.

## Overview

The frontend provides a browser-based interface for:
- Building Aiken smart contracts from Git repositories
- Comparing script hashes with on-chain hashes
- Parameterizing validators with custom values
- Submitting verified contracts to the public registry
- Browsing the registry of verified contracts

## Technology Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, TailwindCSS
- **Language:** TypeScript 5
- **Cardano SDK:** Evolution SDK (`@evolution-sdk/evolution` 0.8.0, npm registry release) for wallet connection, transaction building, parameter application and script hashing
- **Smart Contract Compilation:** Native Aiken (server-side, release binary run by absolute path)
- **Parameter Application:** Evolution SDK (client-side)

## Architecture

### Directory Structure

```
src/frontend/
├── app/                    # Next.js app router
│   ├── page.tsx           # Verification interface
│   ├── registry/          # Registry browser
│   └── api/               # API routes
├── components/            # React components
│   ├── verification/      # Verification UI
│   └── wallet/            # Wallet connection
├── lib/                   # Utilities and hooks
│   ├── api/              # Backend client
│   ├── cardano/          # Cardano utilities
│   └── types/            # TypeScript types
└── public/               # Static assets
```

### Key Features

#### 1. Server-Side Compilation with Client-Side Parameterization

The verification process is split between server and client:

**Server (Next.js API Route):**
1. Clone Git repository
2. Download the specified Aiken release if not yet installed, and run its binary
3. Build with native Aiken compiler
4. Extract script hashes and parameter schemas from `plutus.json`
5. Return results to client

**Client (Browser):**
1. Display validation results
2. Apply parameters using the Evolution SDK
3. Recalculate hashes client-side
4. Compare with expected hashes

See `app/api/verify/route.ts` for the server-side build and `app/page.tsx:236-310` for client-side parameterization.

#### 2. Client-Side Parameterization

Validators that require parameters are parameterized client-side:

- Automatic detection of parameter schemas
- Support for validator hash references
- Live hash recalculation as parameters change
- CBOR encoding for complex types

See `app/page.tsx:236-310` for the parameterization logic.

#### 3. Registry Submission

Users can submit verified contracts to the blockchain:

- Connect Cardano wallet (Eternl, Nami, Flint, etc.)
- Build transaction with metadata label 1984
- Sign and submit to blockchain
- Backend detects and indexes the transaction

See `components/verification/SubmitToRegistry.tsx` for the submission flow.

#### 4. Registry Browser

Search and explore verified contracts:

- Search by URL pattern (e.g., "sundae-labs")
- Filter by project or organization
- View source code and verification details

See `app/registry/page.tsx` for the registry interface.

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- **tar** with gzip on PATH, plus outbound HTTPS to both `github.com` and `release-assets.githubusercontent.com` (GitHub redirects release downloads there) for Aiken versions not yet installed. Release binaries are installed only on Linux and macOS, on x86_64 or arm64 (see Troubleshooting). Versions already under `~/.aiken/versions/<tag>/`, for example preinstalled with aikup, run without network.
- **git** - Required for cloning repositories

### Installation

```bash
cd src/frontend
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Backend API URL (optional, defaults to http://localhost:8080)
NEXT_PUBLIC_API_URL=http://localhost:8080

# Cardano network (optional, defaults to mainnet)
NEXT_PUBLIC_NETWORK=mainnet
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

The build output is in standalone mode for optimized Docker deployments.

## API Routes

The frontend includes several API routes:

### POST /api/verify

Verifies a contract by building from source.

**Request:**
```json
{
  "repoUrl": "https://github.com/username/repo",
  "commitHash": "abc123...",
  "aikenVersion": "v1.1.22"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "validator": "my_validator",
      "validatorModule": "validators/my_validator",
      "validatorName": "spend",
      "purposes": ["spend"],
      "parameters": [...],
      "expected": "hash1",
      "actual": "hash2",
      "matches": false,
      "compiledCode": "cbor_hex",
      "plutusVersion": "V3"
    }
  ],
  "buildLog": "...",
  "warnings": []
}
```

### GET /api/registry

Queries the backend for verified contracts.

**Query Parameters:**
- `urlPattern`: Search by URL pattern
- `sourceUrl` + `commit`: Get by exact source
- `hash`: Get by script hash

### GET /api/health

Health check endpoint.

## Configuration

### Next.js Configuration

The `next.config.ts` file sets only `output: "standalone"`. It carries no custom bundler, loader or module-shim configuration, and none is needed.

### Evolution SDK Integration

The Evolution SDK (`@evolution-sdk/evolution`) is used for:
- Wallet connection: raw CIP-30 `enable()` wrapped in `Client.make(<chain>).withBlockfrost(...).withCip30(api)` (`lib/cardano/wallet-provider.tsx`)
- Transaction building, signing and submission (`lib/cardano/transaction-builder.ts`)
- Parameter application to scripts (`lib/blueprint/apply-params.ts`) and parameter CBOR encoding (`lib/blueprint/encode.ts`)
- Script hash calculation (`lib/cardano/script-hash.ts`)
- Label-1984 metadata encoding (`lib/cardano/metadata-encoder.ts`)

The package is the npm registry release `@evolution-sdk/evolution@0.8.0`, pinned exactly in `package.json`; `npm ci` checks the download against the integrity hash in `package-lock.json`.

## Development Guide

### Adding a New Component

1. Create component in `components/` directory
2. Use TypeScript for type safety
3. Follow React 19 patterns (use client/server components appropriately)

Example:
```tsx
"use client";

export function MyComponent() {
  return <div>Hello</div>;
}
```

### Adding a New API Route

1. Create route in `app/api/[name]/route.ts`
2. Export GET, POST, etc. handlers
3. Use Next.js 15 route handler API

Example:
```typescript
export async function GET(request: Request) {
  return Response.json({ data: "..." });
}
```

### Working with Wallet

Use the wallet hooks from `lib/cardano/wallet-hooks.ts`:

```typescript
import { useWallet } from '@/lib/cardano/wallet-hooks';

function MyComponent() {
  const { wallet, connect, disconnect } = useWallet();

  // ...
}
```

### Backend Integration

Use the backend client from `lib/api/backend-client.ts`:

```typescript
import { backendApi } from '@/lib/api/backend-client';

const scripts = await backendApi.searchScripts('sundae-labs');
```

## Testing

### Unit Tests

```bash
npm test
```

Runs tests in `__tests__/` directory.

### Manual Testing Checklist

- [ ] Verify a contract from GitHub
- [ ] Test parameterized validators
- [ ] Connect wallet and submit to registry
- [ ] Search registry
- [ ] Test different Aiken versions
- [ ] Test error handling (invalid repo, build failures)

## Deployment

### Docker Build

```bash
docker build -t uplc-link-frontend .
docker run -p 3000:3000 uplc-link-frontend
```

### Environment Variables (Production)

```env
NEXT_PUBLIC_API_URL=https://api.uplc.link
NEXT_PUBLIC_NETWORK=mainnet
```

### Aiken Builds: Install and Build

`/api/verify` runs the requested compiler by absolute path from
`~/.aiken/versions/<tag>/` (`lib/aiken-toolchain.ts`). A version that is
absent is downloaded from its GitHub release (`releases/download`, never the
API), checked against its SHA-256 and moved into place atomically. The shared
`~/.aiken/bin/aiken` is never created, removed or re-pointed.

Within one Node process, install + build pairs run one at a time, in arrival
order, so the throughput is one build at a time per process. `git clone` runs
outside the lock.

Across processes nothing is serialised, but processes sharing one Aiken home,
and so the `aiken-cache` volume in `docker-compose.yml`, no longer corrupt each
other. Two of them may each download the same absent version once, and the one
that loses the move uses the winner's binary.

Not covered: a binary that is already present is trusted as it is, and temp
dirs left behind by a crashed process are not swept.

### Build Optimization

The frontend uses Next.js standalone output mode for minimal Docker images:

```typescript
const nextConfig = {
  output: "standalone",
  // ...
};
```

## Troubleshooting

### Aiken Installation Issues

If contract builds fail:

1. Check that release downloads are reachable from the server. The `releases/download/<tag>/<asset>` request and its `.sha256` sidecar go to `github.com`, which answers each with a 302 to `release-assets.githubusercontent.com`, so an egress allowlist that admits only `github.com` fails every install. The backend image (`AikenToolchain`) downloads the same way, from the same two hosts, with the same platform limits.
2. Read the `Failed to install Aiken version <tag>:` message: it names the URL and the HTTP status (a 404 means there is no release asset for that version on this platform)
3. Check the platform. Only Linux and macOS on x86_64 or arm64 are supported; anything else fails before any request with `Unsupported platform for Aiken releases: <platform>` or `Unsupported architecture for Aiken releases: <arch>`. Legacy releases (v1.0.26 and older, the `-alpha` releases up to `v1.0.26-alpha`) publish no checksum, so they install only on Linux x86_64 against a pinned SHA-256. Elsewhere they fail with `no published or pinned SHA-256 for <asset>; refusing to download it`, unless that version's binary is already present under `~/.aiken/versions/<tag>/`
4. Check that `~/.aiken/versions` is writable
5. Verify sufficient disk space for cloning repos
6. Check that the specified Aiken version is available

### Evolution SDK Import Errors

If `@evolution-sdk/evolution` cannot be resolved:

1. Run `npm ci` in `src/frontend` (it installs `@evolution-sdk/evolution@0.8.0` from the npm registry and checks it against `package-lock.json`)
2. Clear `.next` cache and rebuild

### Build Failures

If contracts fail to build:

1. Verify Git repository is public and accessible
2. Check Aiken version matches project requirements
3. Review build log for compilation errors
4. Ensure commit hash is valid

## Performance Considerations

- Compilation runs server-side (Next.js API route)
- Native Aiken compilation takes 5-30 seconds depending on project size
- Parameter updates trigger live hash recalculation in the browser (Evolution SDK)
- Registry searches are cached by browser
- Server needs sufficient resources for git clones and builds

## Browser Compatibility

- Chrome/Edge 89+
- Firefox 86+
- Safari 15.4+

## Contributing

See the main [README](../../README.md) for contribution guidelines.

## License

Apache License 2.0 - see [LICENSE](../../LICENSE)

## Links

- **Production:** [uplc.link](https://uplc.link)
- **API:** [api.uplc.link](https://api.uplc.link)
- **GitHub:** [easy1staking-com/plutus-scan](https://github.com/easy1staking-com/plutus-scan)
