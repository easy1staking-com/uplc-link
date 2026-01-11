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
- **Wallet Integration:** MeshSDK
- **Smart Contract Compilation:** Native Aiken (server-side via aikup)
- **Parameter Application:** MeshSDK WASM (client-side)

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
2. Install specified Aiken version using `aikup`
3. Build with native Aiken compiler
4. Extract script hashes and parameter schemas from `plutus.json`
5. Return results to client

**Client (Browser):**
1. Display validation results
2. Apply parameters using MeshSDK WASM
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
- **aikup** (Aiken version manager) - `npm install -g @aiken-lang/aikup`
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
  "aikenVersion": "v1.1.3"
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

The `next.config.ts` file includes special webpack configuration for:

- WebAssembly support (for MeshSDK WASM modules)
- MeshSDK externalization (server-side)
- Polyfills for Node.js modules (fs, net, tls)

### Webpack WASM Support

```typescript
config.experiments = {
  asyncWebAssembly: true,
  layers: true,
};
```

This enables loading MeshSDK's WASM modules for parameter application and hash calculation in the browser.

### MeshSDK Integration

MeshSDK is used for:
- Wallet connection (multiple providers)
- Transaction building
- Parameter application to scripts
- Script hash calculation

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

### Build Optimization

The frontend uses Next.js standalone output mode for minimal Docker images:

```typescript
const nextConfig = {
  output: "standalone",
  // ...
};
```

## Troubleshooting

### WASM Loading Issues

If you see "WebAssembly module is included in initial chunk" errors (for MeshSDK):

1. Ensure `asyncWebAssembly` is enabled in webpack config
2. Use dynamic imports for WASM-dependent code
3. Check browser compatibility (Chrome 89+, Firefox 86+)

### Aiken Installation Issues

If contract builds fail:

1. Ensure `aikup` is installed on the server (`npm install -g @aiken-lang/aikup`)
2. Check that Aiken binaries are in PATH (`~/.aiken/bin`)
3. Verify sufficient disk space for cloning repos
4. Check that the specified Aiken version is available

### MeshSDK Import Errors

If you see "Module not found" for MeshSDK:

1. Check `next.config.ts` externals configuration
2. Ensure client-side imports use dynamic imports
3. Clear `.next` cache and rebuild

### Build Failures

If contracts fail to build:

1. Verify Git repository is public and accessible
2. Check Aiken version matches project requirements
3. Review build log for compilation errors
4. Ensure commit hash is valid

## Performance Considerations

- Compilation runs server-side (Next.js API route)
- Native Aiken compilation takes 5-30 seconds depending on project size
- Parameter updates trigger live hash recalculation in browser (WASM)
- Registry searches are cached by browser
- Server needs sufficient resources for git clones and builds

## Browser Compatibility

- Chrome/Edge 89+
- Firefox 86+
- Safari 15.4+

WebAssembly and dynamic imports are required.

## Contributing

See the main [README](../../README.md) for contribution guidelines.

## License

Apache License 2.0 - see [LICENSE](../../LICENSE)

## Links

- **Production:** [uplc.link](https://uplc.link)
- **API:** [api.uplc.link](https://api.uplc.link)
- **GitHub:** [easy1staking-com/plutus-scan](https://github.com/easy1staking-com/plutus-scan)
