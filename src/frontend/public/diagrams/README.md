# UPLC Link Diagrams

This folder contains SVG diagrams for social media and documentation.

## Files

1. **flow-diagram.svg** - Shows how UPLC Link verification works
2. **tech-stack.svg** - Displays the technical architecture

## Usage for Twitter/X

Twitter/X works best with PNG images. To convert SVG to PNG:

### Option 1: Using a browser
1. Open the SVG file in Chrome/Firefox
2. Take a screenshot or use browser dev tools to export as PNG
3. Recommended size: 1200x630px for Twitter cards

### Option 2: Using CLI (if you have ImageMagick installed)
```bash
convert flow-diagram.svg -resize 1200x flow-diagram.png
convert tech-stack.svg -resize 1200x tech-stack.png
```

### Option 3: Online converter
- Visit https://cloudconvert.com/svg-to-png
- Upload SVG, download PNG

## Mermaid Source (Alternative)

You can also generate diagrams from this Mermaid code at https://mermaid.live:

### Flow Diagram
```mermaid
flowchart TD
    A[User Input<br/>Repo URL • Commit Hash • Aiken Version • Expected Hashes] --> B[Backend Processing]
    B --> C[Clone Repository]
    C --> D[Checkout Commit]
    D --> E[Build with Aiken CLI]
    E --> F[Extract Hashes<br/>Parse plutus.json]
    F --> G[Frontend Validation<br/>Dynamic comparison • Client-side parameterization]
    G --> H{Hash Match?}
    H -->|Yes| I[✅ Contract Verified]
    H -->|No| J[❌ Hashes Don't Match]
```

### Tech Stack
```mermaid
graph TB
    subgraph Frontend
        A[Next.js 15<br/>React Server Components]
        B[TailwindCSS<br/>Responsive Design]
        C[MeshSDK<br/>CBOR Encoding • Hash Calculation]
    end

    subgraph Backend
        D[Node.js<br/>API Routes]
        E[Aiken CLI<br/>Smart Contract Build • Version Management]
        F[Git Integration<br/>Repo Cloning • Commit Checkout]
    end

    subgraph Smart Features
        G[Dynamic Validation<br/>Live comparison • Any-order matching]
        H[Parameterization<br/>Client-side • Instant recalculation]
        I[Type Detection<br/>Multi-version • Complex types]
    end
```

## License
Apache 2.0 - Same as the project
