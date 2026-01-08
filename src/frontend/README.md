# Plutus Scan

**Don't trust, verify.**

A contract verification tool for Cardano/Aiken smart contracts. Verify that on-chain contract hashes match the source code from a specific GitHub commit.

## Features

- ✅ Verify Aiken contracts against source code
- 🔄 Multi-version support (automatically installs specified Aiken version)
- 📦 Multiple validators per contract
- 🐳 Docker-ready for easy deployment
- 🔍 Full build log transparency

## Quick Start

### Using Docker (Recommended)

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The app will be available at http://localhost:3000

### Local Development

```bash
# Install dependencies
npm install

# Install aikup (Aiken version manager)
npm install -g @aiken-lang/aikup

# Run development server
npm run dev
```

## Usage

1. Enter the **GitHub repository URL** (e.g., `https://github.com/username/repo`)
2. Enter the **commit hash** you want to verify
3. Enter the **Aiken version** used to build the contract (e.g., `v1.1.21`)
4. Enter the **expected hashes** (one per line or as JSON array)
5. Click **Verify Contract**

The tool will:
- Clone the repository at the specified commit
- Install the specified Aiken version
- Build the contract
- Extract the compiled hashes
- Compare them with your expected hashes
- Show you the results ✅ or ❌

## Docker Configuration

The docker-compose.yml allocates:
- **CPU**: 2-4 cores
- **Memory**: 2-4 GB

Adjust these in `docker-compose.yml` based on your contract complexity:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

## API

### POST /api/verify

Verify a contract.

**Request:**
```json
{
  "repoUrl": "https://github.com/user/repo",
  "commitHash": "abc123...",
  "aikenVersion": "v1.1.21",
  "expectedHashes": ["hash1", "hash2"]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "validator": "my_validator",
      "expected": "hash1",
      "actual": "hash1",
      "matches": true
    }
  ],
  "buildLog": "..."
}
```

## Security Notes

- The server clones and builds contracts in isolated temporary directories
- Each build is cleaned up after completion
- All build logs are returned for transparency
- You can self-host for full control

## License

MIT
