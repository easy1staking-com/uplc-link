# Vendored `@evolution-sdk/evolution` (temporary, until T-408)

## What

`evolution-sdk-evolution-0.6.0-831e9cfa.tgz` is a build of the
`@evolution-sdk/evolution` package (its `version` field still reads `0.6.0`) made
from commit `831e9cfa3f2f20dea2390d04e3c37abe6dc4ba69` of the fork
`easy1staking-com/evolution-sdk`, branch `fix/uplc-pv11-builtins-value-array`.
That commit sits directly on upstream main `c728c87abb4f30ad189855ff211031cc21f240a9`
and fixes IntersectMBO/evolution-sdk#666 (upstream PR #667). It changes only
`UPLC.ts`, `UPLC.test.ts` and a changeset on top of upstream main.

`package.json` references it as
`"@evolution-sdk/evolution": "file:vendor/evolution-sdk-evolution-0.6.0-831e9cfa.tgz"`.

## Why

Registry `@evolution-sdk/evolution@0.6.0` cannot decode scripts compiled by
Aiken v1.1.24: it throws `Unknown builtin index` on builtins 87–105 and
`Unknown type tag: 13` on Value constants, so `/verify` cannot hash or apply
parameters to such validators. `__tests__/uplc-pv11.test.ts` pins the fix
against Aiken v1.1.24 oracle output; it is red on registry 0.6.0.

## Digests

| | |
|---|---|
| sha256 | `79c0c784272b1425216bce4c48a23c93c05fa4c4c68c98242cdb3d2292886b87` |
| npm integrity | `sha512-szMaeT5n5I5LdjUpPkgSPabr8EwU0E/cp7mD1k6+iBeTmEJwLd6/pSANKyvDw4czM+FYdyXkk8Jwujh4wMNZKw==` |
| size | 1149874 bytes |

`npm ci` does **not** verify the integrity of a `file:` tarball (measured: a
tarball with one byte appended still installs). Check the sha256 by hand:

```sh
sha256sum src/frontend/vendor/evolution-sdk-evolution-0.6.0-831e9cfa.tgz
```

## Rebuild recipe

Reproduces the tarball byte-identically (Node 20, pnpm 9.0.0 via corepack as
pinned by the package's `packageManager`, frozen lockfile). `$EVO` is a fresh
empty directory; the clone source may be any clone that has the commit.

```sh
git clone -q --no-hardlinks /home/giovanni/Development/workspace/evolution-sdk "$EVO/src" && git -C "$EVO/src" checkout -q --detach 831e9cfa3f2f20dea2390d04e3c37abe6dc4ba69
cd "$EVO/src" && corepack pnpm install --frozen-lockfile --ignore-scripts
cd "$EVO/src/packages/evolution" && corepack pnpm run build && corepack pnpm pack --pack-destination "$EVO/out"
sha256sum "$EVO/out/evolution-sdk-evolution-0.6.0.tgz"
```

Use `pnpm pack` from the package directory. `npm pack`, or a pack at the
monorepo root, does not produce this artefact: the root package is private and
npm does not apply `publishConfig.exports` (which points the exports at
`./dist/*.js`). The sha256 check catches it.

## FE-visible differences from registry 0.6.0

Upstream #608–#660 plus the fix, by module the frontend imports:

- `UPLC`: builtins 87–105 and Value/array constants only.
- `Data`: the default codec options of `toCBORHex`/`fromCBORHex` changed from
  `CML_DATA_DEFAULT_OPTIONS` to `PLUTUS_DATA_OPTIONS` (#617); the encoder was
  rewritten (#616), so constr ≥128 and integer edge cases (−2^64, >64-byte
  bignums) now follow node layout. >64-byte bytestrings were already chunked
  in 0.6.0. Every metadata/apply encode in the FE passes explicit options; only
  `lib/blueprint/decode.ts`'s opaque display re-encode uses the default.
- `CBOR`: gained the `keyOrder` option (#650); presets unchanged.
- Builder internals: `Transaction` default options moved to
  `TX_DEFAULT_OPTIONS`; `SignBuilderImpl`, `Signing.ts` and `txBuilder` changed
  (#610, #618, #652, #654, #655, #656, #658). Not exercised offline.
- Unchanged sources: `Bytes`, `Address`, `ScriptHash`, `PlutusV1/2/3`, `Script`,
  `TransactionMetadatum`, `Assets`, `AuxiliaryData`, `Metadata`,
  `TransactionHash`, `Bech32`, `sdk/wallet/Wallet`, `sdk/client/Client`,
  `sdk/provider/Blockfrost`, `AttachMetadata`.

## Swap back to an official release (T-408)

Once a release containing the #666 fix is published:

1. `cd src/frontend && npm install @evolution-sdk/evolution@<official version>`
   (updates the dependency line in `package.json` and `package-lock.json`).
2. Delete `src/frontend/vendor/` (this README and the tarball).
3. In `src/frontend/Dockerfile`, remove the `COPY vendor/ ./vendor/` line and
   the comment above it.
4. Keep `__tests__/uplc-pv11.test.ts` green (`npm test`).
