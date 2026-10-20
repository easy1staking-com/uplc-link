# UPLC Link - Cardano Smart Contract Verification

> **Don't trust, verify.** Open-source registry and verification system for Cardano smart contracts.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Cardano](https://img.shields.io/badge/Cardano-Mainnet-blue)](https://cardano.org)
[![Aiken](https://img.shields.io/badge/Aiken-Compatible-green)](https://aiken-lang.org)

## 🚀 What is UPLC Link?

UPLC Link is an open-source platform that enables developers and users to verify Cardano smart contracts against their source code. Similar to Etherscan's verification for Ethereum, UPLC Link provides transparency and trust in the Cardano ecosystem.

### Key Features

- ✅ **Source Code Verification** - Build and verify Aiken smart contracts directly from Git repositories
- 🔍 **Public Registry** - Search and explore verified contracts with full source code
- 🔗 **On-Chain Registration** - Submit verified contracts to the blockchain using metadata label 1984
- 🌐 **Browser-Based** - No installation required, verify contracts in your browser
- 📖 **Open Source** - Fully transparent, community-driven development

## 🎯 Quick Start

### For Users - Verify a Contract

1. Go to [uplc.link](https://uplc.link)
2. Enter the GitHub repository URL and commit hash
3. Enter the Aiken compiler version (a release tag such as `v1.1.24`; the field suggests published releases)
4. Click "Verify" to build and compare hashes
5. (Optional) Register verified contracts to the public registry

### For Developers - API Integration

```bash
# Search for verified contracts
curl "https://api.uplc.link/api/v1/scripts/search?urlPattern=sundae-labs"

# Get scripts by hash
curl "https://api.uplc.link/api/v1/scripts/by-hash/{scriptHash}"

# Check verification status
curl "https://api.uplc.link/api/v1/verification-requests?sourceUrl=https://github.com/org/repo&commit=abc123"
```

**📚 Full API documentation:** [https://api.uplc.link/swagger-ui.html](https://api.uplc.link/swagger-ui.html)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UPLC Link Platform                        │
├────────────────────┬────────────────────────────────────────┤
│                    │                                         │
│   Frontend         │   Backend                              │
│   (Next.js 15)     │   (Spring Boot 3)                      │
│                    │                                         │
│   - Browser UI     │   - REST API                           │
│   - Wallet Connect │   - Contract Registry                  │
│   - TX Builder     │   - Blockchain Listener                │
│                    │   - PostgreSQL Database                │
│                    │                                         │
└────────────────────┴───────────┬─────────────────────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │   Cardano Blockchain   │
                     │   (Metadata Label 1984)│
                     └───────────────────────┘
```

### Technology Stack

**Frontend:**
- Next.js 15 (App Router)
- React 18
- TailwindCSS
- Evolution SDK (wallet connection, transaction building, parameter application and script hashing)
- Native Aiken release binaries (server-side compilation in the Next.js `/api/verify` route)

**Backend:**
- Spring Boot 3.3
- Java 21
- PostgreSQL
- Yaci Store (Cardano indexer)
- Bloxbean Cardano Client

**Blockchain:**
- Cardano Mainnet
- Metadata label 1984 for verification requests

## 📦 Repository Structure

```
uplc-scan/
├── src/
│   ├── frontend/          # Next.js frontend application
│   │   ├── app/           # Next.js app router pages
│   │   ├── components/    # React components
│   │   ├── lib/           # Utilities and hooks
│   │   └── public/        # Static assets
│   │
│   └── backend/           # Spring Boot backend API
│       ├── src/main/      # Java source code
│       ├── build.gradle   # Gradle build configuration
│       └── Dockerfile     # Backend container image
│
├── README.md              # This file
└── LICENSE                # Apache 2.0 license
```

## 🛠️ Development

### Prerequisites

- **Node.js** 20+ (for frontend)
- **Java** 21+ (for backend)
- **PostgreSQL** 14+ (for backend database)
- **Docker** (optional, for containerized deployment)

### Running Locally

#### Frontend
```bash
cd src/frontend
npm install
npm run dev
# Visit http://localhost:3000
```

See [frontend/README.md](src/frontend/README.md) for detailed setup.

#### Backend
```bash
cd src/backend
./gradlew bootRun
# API available at http://localhost:8080
```

See [backend/README.md](src/backend/README.md) for detailed setup.

## 📚 Documentation

- **[User Guide](https://uplc.link/docs)** - How to verify and register contracts
- **[API Reference](https://api.uplc.link/swagger-ui.html)** - REST API documentation
- **[Frontend README](src/frontend/README.md)** - Frontend development guide
- **[Backend README](src/backend/README.md)** - Backend development guide
- **[Architecture](docs/ARCHITECTURE.md)** - Detailed system architecture
- **[Deployment Guide](src/frontend/DEPLOYMENT.md)** - Production deployment

## 🤝 Contributing

We welcome contributions! Whether it's:

- 🐛 Bug reports
- 💡 Feature requests
- 📝 Documentation improvements
- 🔧 Code contributions

Please open an issue or pull request on GitHub.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📖 How It Works

### 1. Verification Process

1. **User Input:** Provide Git repo URL, commit hash, and Aiken version
2. **Clone & Build:** The Next.js server (`/api/verify`) clones the repo and builds it with the native Aiken release binary of the chosen version
3. **Hash Comparison:** Compare built script hashes with on-chain hashes
4. **Result:** Display verification status for each validator

### 2. Registration Process

1. **Connect Wallet:** Use a Cardano wallet (Eternl, Nami, Flint)
2. **Build Transaction:** Create transaction with metadata label 1984
3. **Sign & Submit:** Sign with wallet and submit to blockchain
4. **Backend Processing:** Backend detects transaction and indexes the verification

### 3. Registry Exploration

- Search by URL pattern (e.g., "sundae-labs")
- Query by script hash or Cardano address
- View source code and verification details
- Track all validators from a project

## 🌟 Use Cases

- **Protocol Transparency:** Prove your smart contracts match published source code
- **Security Audits:** Verify contracts before interacting with them
- **Developer Trust:** Build confidence in the Cardano ecosystem
- **Regulatory Compliance:** Demonstrate code provenance

## 🙏 Credits

### Sponsored By

**[EASY1 Stake Pool](https://easy1staking.com)** - Supporting Cardano decentralization

### Maintainers

- [@nemo83](https://github.com/nemo83) - Primary maintainer
- [@cryptojoe101](https://twitter.com/cryptojoe101) - Project lead

### Built With

- [Aiken](https://aiken-lang.org) - Smart contract language
- [Cardano](https://cardano.org) - Blockchain platform
- [Evolution SDK](https://github.com/IntersectMBO/evolution-sdk) - Cardano wallet, transaction and Plutus tooling
- [Yaci](https://github.com/bloxbean/yaci-store) - Cardano indexer

### Special Thanks

Made with ❤️ for the Cardano community • Built with [Claude](https://claude.ai)

## 📄 License

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Website:** [uplc.link](https://uplc.link)
- **API:** [api.uplc.link](https://api.uplc.link)
- **GitHub:** [easy1staking-com/plutus-scan](https://github.com/easy1staking-com/plutus-scan)
- **Twitter:** [@cryptojoe101](https://twitter.com/cryptojoe101)

---

**⭐ Star this repository** if you find it useful!

**📢 Share with the community** to help build transparency in Cardano!
