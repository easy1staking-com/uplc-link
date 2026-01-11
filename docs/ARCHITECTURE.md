# UPLC Link - System Architecture

This document provides a detailed overview of the UPLC Link platform architecture, components, and design decisions.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Data Flow](#data-flow)
- [Blockchain Integration](#blockchain-integration)
- [Security Considerations](#security-considerations)
- [Performance & Scalability](#performance--scalability)
- [Technology Decisions](#technology-decisions)

## Overview

UPLC Link is a decentralized verification platform for Cardano smart contracts. The system enables developers to prove that on-chain contracts match published source code, similar to Etherscan's verification for Ethereum.

### Key Design Principles

1. **Transparency** - All verification happens client-side; no hidden processes
2. **Decentralization** - Registry lives on-chain via metadata transactions
3. **Reproducibility** - Deterministic builds ensure consistent verification
4. **Accessibility** - Browser-based, no installation required
5. **Open Source** - Fully transparent, community-driven development

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UPLC Link Platform                           │
├────────────────────────────┬────────────────────────────────────────┤
│                            │                                         │
│   Frontend (Next.js 15)    │   Backend (Spring Boot 3)              │
│   ┌────────────────────┐   │   ┌─────────────────────────────────┐ │
│   │                    │   │   │                                 │ │
│   │  Browser UI        │───┼──▶│  REST API                       │ │
│   │  - Verification    │   │   │  - /scripts/*                   │ │
│   │  - Registry Search │   │   │  - /verification-requests/*     │ │
│   │  - Wallet Connect  │   │   │                                 │ │
│   │                    │   │   └─────────────┬───────────────────┘ │
│   │  WASM Compiler     │   │                 │                     │
│   │  - Aiken Build     │   │   ┌─────────────▼───────────────────┐ │
│   │  - Hash Calc       │   │   │                                 │ │
│   │  - Parameterization│   │   │  Service Layer                  │ │
│   │                    │   │   │  - ScriptService                │ │
│   │  Wallet Integration│   │   │  - AddressService               │ │
│   │  - MeshSDK         │   │   │  - VerificationService          │ │
│   │  - TX Builder      │   │   │                                 │ │
│   │                    │   │   └─────────────┬───────────────────┘ │
│   └────────────────────┘   │                 │                     │
│                            │   ┌─────────────▼───────────────────┐ │
│                            │   │                                 │ │
│                            │   │  Data Layer                     │ │
│                            │   │  - PostgreSQL                   │ │
│                            │   │  - Yaci Store Indexer           │ │
│                            │   │                                 │ │
│                            │   └─────────────┬───────────────────┘ │
│                            │                 │                     │
└────────────────────────────┴─────────────────┼─────────────────────┘
                                               │
                                  ┌────────────▼──────────────┐
                                  │                           │
                                  │  Cardano Blockchain       │
                                  │  - Mainnet/Testnet        │
                                  │  - Metadata Label 1984    │
                                  │                           │
                                  └───────────────────────────┘
```

## Frontend Architecture

### Technology Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Language:** TypeScript 5
- **Styling:** TailwindCSS
- **Wallet:** MeshSDK (@meshsdk/core, @meshsdk/core-csl)
- **Compilation:** Native Aiken (server-side via aikup)
- **Parameterization:** MeshSDK WASM (client-side)
- **Build:** Webpack with WASM support

### Directory Structure

```
src/frontend/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # Main verification interface
│   ├── layout.tsx               # Root layout with wallet provider
│   ├── registry/                # Registry browser
│   │   └── page.tsx            # Search and view verified contracts
│   ├── docs/                    # Documentation pages
│   │   └── page.tsx            # User guide
│   └── api/                     # API routes
│       ├── verify/route.ts     # Contract verification endpoint
│       ├── registry/route.ts   # Registry query proxy
│       └── health/route.ts     # Health check
│
├── components/                   # React components
│   ├── verification/
│   │   └── SubmitToRegistry.tsx # Registry submission UI
│   └── wallet/
│       └── WalletConnectButton.tsx # Wallet connection
│
├── lib/                         # Utilities and libraries
│   ├── api/
│   │   └── backend-client.ts   # Backend API client
│   ├── cardano/
│   │   ├── wallet-provider.tsx  # Wallet context provider
│   │   ├── wallet-hooks.ts      # Custom hooks for wallet
│   │   ├── transaction-builder.ts # TX construction
│   │   └── metadata-encoder.ts  # Metadata encoding
│   ├── types/                   # TypeScript type definitions
│   └── config.ts                # Configuration
│
└── public/                      # Static assets
```

### Key Components

#### 1. Verification Interface (`app/page.tsx`)

The main verification UI handles:

- **User Input:** Repository URL, commit hash, Aiken version, expected hashes
- **Server Communication:** Calls `/api/verify` to trigger server-side build
- **Hash Comparison:** Compares built hashes with expected hashes
- **Parameterization:** Client-side parameter application with live updates
- **Results Display:** Shows match/mismatch status for each validator

**Technical Details:**

- Uses React state for form management
- Fetches Aiken versions from GitHub API
- Dynamic imports for MeshSDK WASM modules (code splitting)
- Real-time hash recalculation on parameter changes

#### 2. Server-Side Compilation

Contract compilation happens on the Next.js server using native Aiken:

```typescript
// Verification flow (simplified)
const response = await fetch('/api/verify', {
  method: 'POST',
  body: JSON.stringify({ repoUrl, commitHash, aikenVersion }),
});

const result = await response.json();
// result contains built hashes and parameter schemas
```

The `/api/verify` route (`app/api/verify/route.ts`):
1. Creates temporary directory
2. Clones the repository using git
3. Installs specified Aiken version using aikup
4. Builds the project with `aiken build`
5. Extracts validator hashes and parameter schemas from plutus.json
6. Returns results to client
7. Cleans up temporary directory

#### 3. Parameter System

Validators can require parameters (e.g., policy IDs, stake keys). The parameterization system:

- **Auto-detection:** Parses parameter schemas from compiled output
- **Type inference:** Identifies simple types (bytes, int) vs complex types (maps, constructors)
- **Validator references:** Allows using another validator's hash as a parameter
- **Live updates:** Recalculates hashes immediately when parameters change
- **CBOR encoding:** Encodes parameters correctly for MeshSDK

**Implementation:**

```typescript
// Cascading parameter resolution (validators can reference each other)
const resolvedParams = params.map(param => {
  if (param.useValidatorRef && param.referenceTo) {
    const referencedHash = calculatedHashes[param.referenceTo];
    return cborEncodeHash(referencedHash); // CBOR-encode the hash
  }
  return param.value; // User-provided value
});

const scriptCbor = applyParamsToScript(compiledCode, resolvedParams, "CBOR");
const hash = resolveScriptHash(scriptCbor, plutusVersion);
```

#### 4. Registry Submission

After verification, users can submit to the on-chain registry:

**Flow:**

1. Connect wallet (MeshSDK wallet provider)
2. Build transaction with metadata label 1984
3. Sign transaction in user's wallet
4. Submit to Cardano blockchain
5. Backend detects transaction and indexes it

**Metadata Format:**

```json
{
  "1984": {
    "sourceUrl": "https://github.com/org/repo",
    "commitHash": "abc123...",
    "aikenVersion": "v1.1.3",
    "validators": [
      {
        "validator": "my_validator.spend",
        "hash": "abc123...",
        "parameters": [...]
      }
    ]
  }
}
```

### Webpack Configuration

Special configuration required for MeshSDK WASM modules:

```typescript
// next.config.ts
config.experiments = {
  asyncWebAssembly: true,  // Enable WASM for MeshSDK
  layers: true,
};

config.module.rules.push({
  test: /\.wasm$/,
  type: "webassembly/async",
});
```

This allows loading MeshSDK's WASM modules for parameter application and hash calculation in the browser.

## Backend Architecture

### Technology Stack

- **Framework:** Spring Boot 3.3
- **Language:** Java 21
- **Database:** PostgreSQL 14+
- **Indexer:** Yaci Store (Cardano blockchain indexer)
- **Blockchain Client:** Bloxbean Cardano Client
- **API Docs:** SpringDoc OpenAPI

### Directory Structure

```
src/backend/
├── src/main/java/com/easy1staking/plutusscan/
│   ├── PlutusScanApplication.java       # Main application
│   │
│   ├── controller/                      # REST Controllers
│   │   ├── ScriptController.java       # Script query endpoints
│   │   └── VerificationController.java # Verification status
│   │
│   ├── service/                         # Business logic
│   │   ├── ScriptService.java          # Script operations
│   │   ├── AddressService.java         # Address parsing
│   │   └── VerificationService.java    # Verification handling
│   │
│   ├── domain/                          # Data models
│   │   ├── entity/
│   │   │   ├── Script.java             # Script entity
│   │   │   └── VerificationRequest.java # Verification request entity
│   │   └── repository/
│   │       ├── ScriptRepository.java
│   │       └── VerificationRequestRepository.java
│   │
│   ├── dto/                             # Data Transfer Objects
│   │   ├── request/
│   │   └── response/
│   │       ├── ScriptListResponseDto.java
│   │       └── VerificationResponseDto.java
│   │
│   ├── listener/                        # Blockchain event listeners
│   │   └── MetadataListener.java       # Listens for label 1984
│   │
│   └── config/                          # Configuration
│       ├── OpenApiConfig.java          # Swagger configuration
│       └── DatabaseConfig.java         # Database configuration
│
└── src/main/resources/
    ├── application.yml                  # Application config
    └── db/migration/                    # Database migrations
```

### Key Components

#### 1. REST API Layer

**ScriptController** (`controller/ScriptController.java`)

Provides endpoints for querying verified scripts:

```java
GET /api/v1/scripts/by-source?sourceUrl={url}&commit={hash}
GET /api/v1/scripts/by-hash/{scriptHash}
GET /api/v1/scripts/by-address/{address}
GET /api/v1/scripts/search?urlPattern={pattern}
```

**VerificationController** (`controller/VerificationController.java`)

Query verification request status:

```java
GET /api/v1/verification-requests?sourceUrl={url}&commit={hash}
```

#### 2. Service Layer

**ScriptService** (`service/ScriptService.java`)

Business logic for script operations:

- Find scripts by source URL and commit
- Find scripts by hash (raw or parameterized)
- Search scripts by URL pattern
- Convert entities to DTOs

**AddressService** (`service/AddressService.java`)

Cardano address parsing and validation:

- Extract script hash from addresses
- Support for base addresses, enterprise addresses, stake addresses
- Bech32 decoding using Cardano Foundation libraries

#### 3. Blockchain Listener

**MetadataListener** (`listener/MetadataListener.java`)

Yaci Store event listener that:

- Monitors transactions with metadata label 1984
- Parses verification metadata
- Creates VerificationRequest and Script entities
- Stores in PostgreSQL

**Implementation:**

```java
@EventListener
public void onMetadata(TransactionEvent event) {
  // Extract metadata with label 1984
  // Parse sourceUrl, commitHash, validators
  // Save to database
}
```

#### 4. Data Layer

**Entities:**

- `Script` - Represents a verified smart contract
  - Fields: scriptHash, sourceUrl, commitHash, validatorName, parameters, etc.
- `VerificationRequest` - Represents a verification submission
  - Fields: sourceUrl, commitHash, aikenVersion, timestamp, etc.

**Repositories:**

- `ScriptRepository` - JPA repository with custom queries
  - `findBySourceUrlAndCommitHash()`
  - `findByScriptHashOrFinalScriptHash()`
  - `findBySourceUrlContainingIgnoreCase()`
- `VerificationRequestRepository` - JPA repository for verification requests

### Database Schema

```sql
CREATE TABLE verification_requests (
  id BIGSERIAL PRIMARY KEY,
  source_url VARCHAR(500) NOT NULL,
  commit_hash VARCHAR(40) NOT NULL,
  aiken_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tx_hash VARCHAR(64),
  UNIQUE(source_url, commit_hash)
);

CREATE TABLE scripts (
  id BIGSERIAL PRIMARY KEY,
  verification_request_id BIGINT REFERENCES verification_requests(id),
  script_hash VARCHAR(56) NOT NULL,
  final_script_hash VARCHAR(56),
  validator_name VARCHAR(200),
  validator_module VARCHAR(200),
  purposes TEXT[],
  parameters JSONB,
  plutus_version VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_script_hash (script_hash),
  INDEX idx_final_script_hash (final_script_hash),
  INDEX idx_source (verification_request_id)
);
```

## Data Flow

### 1. Verification Flow

```
User ────▶ Frontend ────▶ Next.js API ────▶ Git Clone + Aiken Build
             │                                      │
             │                                      │ plutus.json
             │                                      ▼
             │                              Extract hashes + schemas
             │                                      │
             │◀────── Return results ───────────────┘
             │
             │ Apply parameters (MeshSDK WASM)
             │ Recalculate hashes
             │ Compare with expected
             ▼
        Display results
```

**Steps:**

1. User provides repo URL, commit, Aiken version, expected hashes
2. Frontend calls `/api/verify` endpoint
3. **Server:** Clones repository using git
4. **Server:** Installs Aiken version using aikup
5. **Server:** Builds contract with `aiken build`
6. **Server:** Extracts hashes and parameter schemas from plutus.json
7. **Server:** Returns results to client
8. **Client:** Displays initial results
9. **Client:** User applies parameters (if needed)
10. **Client:** Recalculates hashes using MeshSDK WASM
11. **Client:** Compares with expected hashes
12. Results displayed (✅/❌ for each validator)

**Key point:** Compilation is server-side (reproducible builds), parameterization and comparison are client-side.

### 2. Registry Submission Flow

```
User ────▶ Frontend ────▶ Wallet ────▶ Cardano Blockchain
                                              │
                                              │ Metadata (label 1984)
                                              ▼
                         Backend ◀────── Yaci Store Listener
                            │
                            │ Parse & store
                            ▼
                        PostgreSQL
```

**Steps:**

1. User verifies contract successfully
2. User clicks "Submit to Registry"
3. Frontend builds transaction with metadata
4. User signs with wallet
5. Transaction submitted to blockchain
6. Yaci Store detects transaction
7. Backend parses metadata and stores in DB
8. Contract now appears in registry searches

### 3. Registry Search Flow

```
User ────▶ Frontend ────▶ Backend API ────▶ PostgreSQL
             │                                    │
             │                                    │
             └────────────────────────────────────┘
                      Display results
```

**Steps:**

1. User searches by URL pattern, hash, or address
2. Frontend calls backend API
3. Backend queries PostgreSQL
4. Results returned and displayed
5. User can view source code, parameters, verification details

## Blockchain Integration

### Metadata Format (Label 1984)

Verification submissions use metadata label 1984:

```json
{
  "1984": {
    "sourceUrl": "https://github.com/sundaeswap-labs/sundae-contracts",
    "commitHash": "35f1a0d8e3a4b2c1f9e8d7c6b5a4e3d2c1b0a9f8",
    "aikenVersion": "v1.1.3",
    "validators": [
      {
        "validator": "pool.spend",
        "validatorModule": "validators/pool",
        "validatorName": "spend",
        "hash": "abc123...",
        "purposes": ["spend"],
        "plutusVersion": "V3",
        "parameters": [
          {
            "name": "pool_nft_policy",
            "value": "581c...",
            "type": "PolicyId"
          }
        ]
      }
    ]
  }
}
```

### Yaci Store Integration

The backend uses Yaci Store for blockchain indexing:

- **Real-time monitoring** of new blocks
- **Metadata extraction** for label 1984
- **Transaction details** (hash, timestamp, etc.)
- **Event-driven architecture** via Spring events

**Configuration:**

```yaml
# application.yml
store:
  cardano:
    host: mainnet-node.example.com
    port: 3001
    protocol-magic: 764824073  # Mainnet
```

### Transaction Building (Frontend)

MeshSDK builds the registry submission transaction:

```typescript
import { Transaction } from '@meshsdk/core';

const tx = new Transaction({ initiator: wallet });
tx.setMetadata(1984, verificationMetadata);
const unsignedTx = await tx.build();
const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);
```

## Security Considerations

### Frontend Security

1. **Server-Side Compilation**
   - Build happens on Next.js server (not client)
   - Reproducible builds using specific Aiken versions
   - Build logs fully transparent
   - Temporary directories cleaned up after build

2. **Wallet Integration**
   - MeshSDK handles wallet security
   - Private keys never exposed
   - Transaction signing in wallet extension

3. **WASM Sandboxing (Client-Side)**
   - MeshSDK WASM runs in browser sandbox for parameterization
   - No file system access
   - Memory isolated

### Backend Security

1. **Input Validation**
   - All API inputs validated
   - SQL injection prevention (JPA/Hibernate)
   - XSS prevention (Spring Security)

2. **Metadata Parsing**
   - Schema validation for metadata
   - Malformed data rejected
   - Size limits enforced

3. **Database**
   - Connection pooling with HikariCP
   - Prepared statements only
   - Regular backups

### Blockchain Security

1. **Immutability**
   - Once submitted, verifications are permanent
   - No central authority can alter records

2. **Transparency**
   - All metadata public on-chain
   - Anyone can verify submissions

3. **Decentralization**
   - No single point of failure
   - Multiple nodes verify transactions

## Performance & Scalability

### Frontend Performance

- **Code splitting:** MeshSDK WASM modules loaded on-demand
- **Lazy loading:** Registry data paginated
- **Static generation:** Docs pages pre-rendered
- **Server-side builds:** Offloads compilation from client

**Optimization:**

```typescript
// Dynamic import for MeshSDK WASM
const { applyParamsToScript } = await import("@meshsdk/core-csl");
```

### Server Performance

- **Temporary directories:** Builds isolated in temp dirs, cleaned after
- **Process isolation:** Each build runs in separate git clone
- **Version caching:** aikup caches Aiken binaries per version

### Backend Performance

- **Database indexing:** Hash and URL columns indexed
- **Connection pooling:** HikariCP for efficient DB connections
- **Caching:** Spring Cache for frequently accessed data
- **Pagination:** Large result sets paginated

**Query Optimization:**

```java
// Efficient hash lookup
@Query("SELECT s FROM Script s WHERE s.scriptHash = ?1 OR s.finalScriptHash = ?1")
List<Script> findByHash(String hash);
```

### Scalability

- **Horizontal scaling:** Stateless backend can scale horizontally
- **CDN:** Static assets served via CDN
- **Database:** PostgreSQL supports read replicas
- **Load balancing:** Backend instances behind load balancer

## Technology Decisions

### Why Next.js 15?

- **App Router:** Modern routing with React Server Components
- **API Routes:** Backend-for-frontend pattern
- **Static/Dynamic:** Flexible rendering strategies
- **TypeScript:** First-class support

### Why Spring Boot 3?

- **Mature ecosystem:** Vast library support
- **Reactive support:** WebFlux for non-blocking I/O
- **Security:** Spring Security battle-tested
- **Monitoring:** Actuator for health checks

### Why PostgreSQL?

- **JSONB:** Native JSON support for flexible schemas
- **Indexing:** Advanced indexing (GIN, BRIN, etc.)
- **Reliability:** ACID compliance, robust
- **Ecosystem:** Excellent tooling and libraries

### Why Yaci Store?

- **Cardano-native:** Built specifically for Cardano
- **Event-driven:** Spring event integration
- **Lightweight:** Minimal resource usage
- **Open source:** Community-maintained

### Why Server-Side Compilation?

- **Reproducibility:** Native Aiken ensures deterministic builds
- **Version control:** aikup allows exact version matching
- **Performance:** Native binary faster than WASM
- **Compatibility:** Full Aiken feature support (not limited by WASM)

### Why Client-Side Parameterization?

- **Instant feedback:** Live hash updates as parameters change
- **No server load:** Parameter changes don't require new builds
- **Privacy:** Parameter values stay in browser
- **WASM efficiency:** MeshSDK WASM handles CBOR encoding efficiently

## Future Enhancements

### Planned Features

1. **Multi-language support:** Plutarch, OpShin, Helios
2. **Private repo support:** OAuth GitHub integration
3. **Batch verification:** Verify multiple contracts at once
4. **Enhanced search:** Full-text search, filters
5. **Analytics:** Verification trends, popular projects

### Infrastructure Improvements

1. **Caching layer:** Redis for API responses
2. **CDN integration:** CloudFlare for global distribution
3. **Monitoring:** Grafana + Prometheus dashboards
4. **CI/CD:** Automated testing and deployment

## Appendix

### API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/scripts/search` | GET | Search by URL pattern |
| `/api/v1/scripts/by-hash/{hash}` | GET | Get by script hash |
| `/api/v1/scripts/by-source` | GET | Get by source + commit |
| `/api/v1/scripts/by-address/{addr}` | GET | Get by Cardano address |
| `/api/v1/verification-requests` | GET | Query verification status |

### Environment Variables

**Frontend:**
```
NEXT_PUBLIC_API_URL=https://api.uplc.link
NEXT_PUBLIC_NETWORK=mainnet
```

**Backend:**
```
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/uplclink
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=...
CARDANO_NODE_HOST=mainnet-node.example.com
CARDANO_NODE_PORT=3001
```

### Dependencies

**Frontend:**
- Next.js 15
- React 19
- MeshSDK 1.9
- TailwindCSS 3.4

**Backend:**
- Spring Boot 3.3
- Java 21
- PostgreSQL 14+
- Yaci Store 0.1.6

---

**Document Version:** 1.0
**Last Updated:** 2026-01-11
**Maintainer:** [@nemo83](https://github.com/nemo83)
