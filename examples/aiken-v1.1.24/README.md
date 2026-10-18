# aiken-v1.1.24 fixture

Test fixture for T-404: an Aiken project pinned to compiler v1.1.24 and
aiken-lang/stdlib v4.0.0, with one parameterised validator, `fixture.vault`
(eight parameters), whose unapplied `compiledCode` retains the `valueContains`
and `unValueData` builtins. Consumers: T-406 (FE builder tests) and T-407 (E2E).

## Binary provenance

- Release tag: `aiken-lang/aiken` `v1.1.24`, asset `aiken-x86_64-unknown-linux-musl.tar.gz`
- Tarball sha256: `c378acccdaf9533f3375ea623c948d3dcb21f7e8c5ecbb741162c53653470b13`
- Binary sha256: `4257cc8be37cbde5bf7b5dd111e43a1277f45352fb2433ad7a7e647209aa7677`
- `--version` must print exactly `aiken v1.1.24+bacbeb3`

Do not use `aikup`: `aikup install` re-points the global `~/.aiken/bin/aiken`
symlink. Extract the tarball into your own directory and point `AIKEN` at it.

## Regenerate

```
AIKEN=/abs/path/to/aiken examples/aiken-v1.1.24/regenerate.sh
```

The script refuses any other binary version. It builds without `--env` and with
`--env preview`, applies the eight parameters below in order with
`aiken blueprint apply`, and writes the blueprints and the oracle JSON to
`src/frontend/__tests__/fixtures/` (`blueprint-v1124-*.json`) and
`src/backend/src/test/resources/aiken-v1.1.24/` (`plutus-*.json`, `oracle.json`).
Every generated file (including `aiken.lock`) is compiler or script output:
never hand-edit them, regenerate.

## Parameters

Each CBOR equals Aiken v1.1.24's own `cbor.serialise` of the value: indefinite
non-empty lists and constr fields, definite maps, `d87a80` for `None`.

| Title | CBOR | Meaning |
|---|---|---|
| owner | `581cabababababababababababababababababababababababababababab` | ByteArray, 28 x `0xab` |
| threshold | `1a001e8480` | Int 2000000 |
| pair | `9f0142cafeff` | `Pair(1, #"cafe")` |
| tuple | `9f42beef02ff` | `(#"beef", 2)` |
| nested | `d8799fd8799f07ffff` | `Some(Some(7))` |
| seed | `d8799f5820111111111111111111111111111111111111111111111111111111111111111100ff` | OutputReference, tx id 32 x `0x11`, index 0 |
| payee | `d8799fd8799f581ccdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdffd87a80ff` | Address, payment key hash 28 x `0xcd`, no stake credential |
| minimum | `a140a1401a001e8480` | Value, 2000000 lovelace |

## Why `env/default.ak` exists

An empty CIP-171 `env` field means no `--env` flag at all, and a no-flag
`aiken build` then uses the `default` env module. `env/preview.ak` makes the
`--env preview` build produce a different script hash.

## Upstream finding: Assets parameter unusable (Value used instead)

Assets parameter dropped in favour of `Value` — upstream defect. Observed with v1.1.24 + stdlib v4.0.0: the blueprint defines `cardano/assets/Assets` as constr0[inner: `Dict`], `Dict` as constr0[inner: `Pairs`], and the inner `Tokens` as constr0[`Pairs<ByteArray,Int>`]; `aiken blueprint apply` accepts only the triple-wrapped `d8799fd8799fa140d8799fa1401a001e8480ffffff` and rejects the raw map and 1x/2x-wrapped forms. The compiled code of `validator rt(a: Assets)` uses the parameter as `[ (builtin unValueData) [ (builtin mapData) i_0 ] ]` (expects an already-decoded builtin list); `aiken uplc eval` with any `(con data ...)` argument fails "type mismatch, Expected (list a), Got data". So no encoding of an Assets parameter is usable at runtime and the blueprint layout does not match the runtime layout. A `Value` parameter is consistent end to end: schema is a plain map of maps, `blueprint apply` accepts `a140a1401a001e8480`, the code uses `unValueData i_0`, and eval with that Data map succeeds (lovelace 5 accepted, 4 rejected).
