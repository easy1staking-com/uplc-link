# Plutus & Plutarch Example Validators

This directory contains example "always true" parameterized validators for both **Plutus (Plinth)** and **Plutarch**, designed to help test uplc.link verification with non-Aiken contracts.

## Directory Structure

```
examples/
├── plutus-example/         # Plutus (Plinth) validator
│   ├── AlwaysTrue.hs
│   ├── plutus-example.cabal
│   └── cabal.project
├── plutarch-example/       # Plutarch validator
│   ├── AlwaysTrue.hs
│   ├── plutarch-example.cabal
│   └── cabal.project
└── README.md
```

## Key Differences: Plutus vs Plutarch vs Aiken

### Build Output Formats

| Language | Output Format | Structure |
|----------|---------------|-----------|
| **Aiken** | `plutus.json` | Contains validators array with metadata, blueprint, parameters schema |
| **Plutus/Plutarch** | `.plutus` file(s) | One file per validator, JSON envelope with `type`, `description`, `cborHex` |

### Aiken plutus.json Example:
```json
{
  "preamble": { "title": "...", "version": "...", "plutusVersion": "v2" },
  "validators": [
    {
      "title": "module.validator.spend",
      "compiledCode": "5907b6...",
      "hash": "abc123...",
      "parameters": [...]
    }
  ]
}
```

### Plutus/Plutarch .plutus File Example:
```json
{
  "type": "PlutusScriptV2",
  "description": "Always True Validator",
  "cborHex": "5907b65907b30100003232323232323232..."
}
```

## Prerequisites

### Installing GHC and Cabal

**On macOS:**
```bash
# Using GHCup (recommended)
curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh

# Install GHC 9.6.6 (compatible with Plutus)
ghcup install ghc 9.6.6
ghcup set ghc 9.6.6

# Install Cabal 3.10+
ghcup install cabal 3.10.3.0
ghcup set cabal 3.10.3.0
```

**On Linux:**
```bash
# Same as macOS using GHCup
curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh
ghcup install ghc 9.6.6
ghcup set ghc 9.6.6
ghcup install cabal 3.10.3.0
ghcup set cabal 3.10.3.0
```

### Optional: Nix (for reproducible builds)

Both examples support Nix for reproducible builds:

```bash
# Install Nix
sh <(curl -L https://nixos.org/nix/install) --daemon

# Enable flakes
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

## Building the Examples

### Plutus Example

```bash
cd examples/plutus-example

# Update package index
cabal update

# Build the project
cabal build

# Run the executable (generates .plutus files)
cabal run plutus-example
```

**Output:**
- `always-true-unparameterized.plutus` - Raw validator without parameters
- `always-true-parameterized.plutus` - Validator with example parameters applied

### Plutarch Example

```bash
cd examples/plutarch-example

# Update package index
cabal update

# Build the project
cabal build

# Run the executable
cabal run plutarch-example
```

**Output:**
- `plutarch-always-true.plutus` - Compiled validator

## Parameterization

### In Plutus (Plinth)

Plutus uses **Template Haskell** and `applyCode` to apply parameters:

```haskell
-- Define validator with parameters
mkValidator :: BuiltinByteString -> Integer -> BuiltinData -> BuiltinData -> BuiltinData -> ()

-- Apply parameters at compile time
mkParameterizedValidator pkh deadline =
    PlutusV2.mkValidatorScript $
        $$(compile [|| mkValidator ||])
        `applyCode` liftCode pkh
        `applyCode` liftCode deadline
```

**Parameters in these examples:**
1. `beneficiary`: BuiltinByteString (28-byte public key hash)
2. `deadline`: Integer (POSIXTime)

### In Plutarch

Plutarch uses **lambda abstractions**:

```haskell
-- Validator takes parameters as arguments
alwaysTrueValidator :: Term s (PByteString :--> PInteger :--> PValidator)
alwaysTrueValidator = plam $ \beneficiary deadline datum redeemer ctx ->
  popaque $ pconstant ()
```

Parameters are applied using Cardano.Api's `applyArguments` function after compilation.

## Verification Challenges for uplc.link

### 1. **No Standard Build Output Format**

Unlike Aiken's `plutus.json`, Plutus/Plutarch projects produce:
- One `.plutus` file per validator
- No centralized metadata
- No parameter schema (you need to infer from source code)

**Implications:**
- uplc.link needs to scan for all `.plutus` files in a build directory
- Parameter types must be extracted from Haskell source or provided manually
- No "module.validator.purpose" naming convention

### 2. **Build Process Complexity**

**Aiken:**
```bash
aiken build
# → produces plutus.json with all validators
```

**Plutus/Plutarch:**
```bash
cabal build
cabal run <executable>
# → each executable writes its own .plutus file(s)
# → output location varies (can be anywhere in source tree)
```

**Implications:**
- uplc.link backend needs to:
  1. Clone the repo
  2. Run `cabal build`
  3. Run all executables
  4. Find all generated `.plutus` files
  5. Extract parameters from source code (difficult!)

### 3. **No Parameter Schema**

Aiken includes JSON Schema for parameters:

```json
{
  "parameters": [
    {
      "title": "beneficiary",
      "schema": {
        "dataType": "bytes",
        "$comment": "A 28-byte public key hash"
      }
    }
  ]
}
```

Plutus/Plutarch: **None**. You must:
- Parse Haskell source code
- Match function signatures
- Infer types from code

### 4. **Git Repository Challenges**

**Typical Plutus/Plutarch Repo:**
```
my-plutus-project/
├── cabal.project
├── src/
│   └── Validators/
│       ├── AlwaysTrue.hs
│       └── Vesting.hs
├── app/
│   └── Main.hs          # Writes .plutus files
└── scripts/             # Output directory (not standardized)
    ├── always-true.plutus
    └── vesting.plutus
```

**Issues:**
- No standard project structure
- Output location not standardized (could be `/scripts`, `/validators`, `/plutus`, etc.)
- Multiple executables may generate different validators
- May require specific build steps or scripts

## Integration Strategy for uplc.link

### Option 1: Manual Upload (Easiest)

Users provide:
1. The `.plutus` file(s)
2. Git repo URL + commit hash
3. Manual parameter schema (JSON)

### Option 2: Semi-Automatic Build (Medium)

1. Clone repo at commit hash
2. Run `cabal build`
3. Scan for `.hs` files with `writeFileTextEnvelope` calls
4. Run executables to generate `.plutus` files
5. Request user to provide parameter schemas manually

### Option 3: Full Automation (Hard)

Requires:
1. **Haskell parser** to extract:
   - Function signatures
   - Parameter types
   - Validator definitions
2. **Build script detection** (look for `scripts/build.sh`, etc.)
3. **Output location detection** (search for `.plutus` files after build)
4. **Type inference** for parameters

**Recommendation:** Start with **Option 1 or 2** for MVP.

## Testing the Examples

### 1. Build and Generate .plutus Files

```bash
# Plutus
cd examples/plutus-example
cabal run plutus-example

# Plutarch
cd examples/plutarch-example
cabal run plutarch-example
```

### 2. Verify the Output

Check the generated `.plutus` files:

```bash
cat always-true-parameterized.plutus
```

Should look like:
```json
{
  "type": "PlutusScriptV2",
  "description": "",
  "cborHex": "5907b659..."
}
```

### 3. Calculate the Hash

You can use `cardano-cli` to calculate the script hash:

```bash
cardano-cli transaction policyid \
  --script-file always-true-parameterized.plutus
```

Or use MeshSDK in your verification backend.

### 4. Integration Test with uplc.link

**Manual test flow:**

1. **Create a test repository:**
   ```bash
   git init plutus-test
   cd plutus-test
   cp -r examples/plutus-example/* .
   git add .
   git commit -m "Add always-true validator"
   git remote add origin <your-github-repo>
   git push -u origin main
   ```

2. **Build and get hash:**
   ```bash
   cabal run plutus-example
   cardano-cli transaction policyid --script-file always-true-parameterized.plutus
   # Output: abc123...def456 (script hash)
   ```

3. **Test uplc.link verification:**
   - Go to uplc.link
   - Enter repo URL
   - Enter commit hash
   - Enter expected hash
   - Provide parameter values (or upload parameter schema JSON)
   - Verify!

## Next Steps

### For uplc.link Backend:

1. **Add Parser for .plutus Files:**
   ```java
   // PlutusScriptParser.java
   class PlutusScriptParser {
       public static ParsedValidator parse(File plutusFile) {
           // Read JSON
           // Extract cborHex
           // Calculate hash
           // Return ParsedValidator
       }
   }
   ```

2. **Add Build Support:**
   ```java
   // CabalBuilder.java
   class CabalBuilder {
       public void build(Path repoPath) {
           // Run: cabal update
           // Run: cabal build
           // Run: cabal run <executable>
           // Scan for .plutus files
       }
   }
   ```

3. **Add Compiler Detection:**
   ```java
   if (hasCabalProject(repoPath)) {
       // Use Plutus/Plutarch flow
   } else if (hasAikenToml(repoPath)) {
       // Use Aiken flow
   }
   ```

### For uplc.link Frontend:

1. **Add Language Selector:**
   - Aiken
   - Plutus (Plinth)
   - Plutarch

2. **Conditional UI:**
   - If Plutus/Plutarch: Allow manual parameter schema upload
   - If Aiken: Auto-detect from plutus.json

## Resources

- **Plutus Documentation:** https://plutus.readthedocs.io/
- **Plutarch Guide:** http://plutarch-plutus.org/
- **Plinth Announcement:** [IOG Blog - Plutus Tx gets a makeover: meet Plinth](https://iohk.io/blog/posts/2025/02/20/plutus-tx-gets-a-makeover-meet-plinth/)
- **Cardano Developer Portal:** https://developers.cardano.org/docs/build/smart-contracts/overview/
- **Plutonomicon GitHub:** https://github.com/Plutonomicon
- **Plutarch Repository:** https://github.com/Plutonomicon/plutarch-plutus

## Questions?

Feel free to modify these examples and test them thoroughly. The always-true validators are intentionally simple to make testing easier.

For production validators with real logic, you'll need to handle:
- Proper datum/redeemer validation
- Transaction context checks
- Error handling
- Gas optimization

Good luck testing! 🚀
