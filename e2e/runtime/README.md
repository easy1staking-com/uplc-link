# Runtime-image E2E (Aiken v1.1.24 fixture)

One command proves the whole verification chain for the T-404 fixture
(`examples/aiken-v1.1.24`, validator `fixture.vault`, eight parameters) inside
the two runtime Docker images, for an empty env and for `--env preview`:

```bash
export JAVA_HOME="$(readlink -f "$HOME/.jenv/versions/21")"
bash e2e/runtime/run.sh
```

With the browser stage (headless Chromium against the FE image the run built):

```bash
E2E_BROWSER=1 bash e2e/runtime/run.sh
```

## What a run proves

1. Both images build from this checkout: `src/frontend/Dockerfile` and
   `src/backend/Dockerfile` (BE from a staging context holding only the boot jar).
2. The FE container's `/api/verify` clones the fixture commit from GitHub,
   installs Aiken v1.1.24 and builds it; the unapplied hash equals the oracle's.
3. The FE's own modules (`payloadToCborHex`, `applyPayloadsAndHash`) apply the
   eight oracle parameters step by step and reach the oracle's hashes.
4. The label-1984 record is encoded exactly as `SubmitToRegistry` +
   `buildRegistrySubmissionTx` attach it (CIP-171 constr 0, six fields, chunked
   by 128 hex characters into a byte-chunk array under label 1984).
5. The BE image ingests that record through its real path
   (`TxMetadataEventListener` -> `TxMetadataProcessor` ->
   `PlutusScanRequestParser` -> `RequestValidator`).
6. The BE scheduler rebuilds from GitHub with `AikenCompilerService` (aikup
   installs v1.1.24 on demand in the BE image) and applies the parameters with
   `ScriptService` / `ParameterApplier` on Scalus.
7. The request reads back `VERIFIED`, script `COMPLETE`, with the oracle's final
   hash, directly from the BE and through the FE registry proxy.
8. Only with `E2E_BROWSER=1` (stage 6): headless Chromium drives the shipped FE
   bundle against the same stack. On `/verify` the top form plus `Verify
   Contract` shows the unapplied oracle hash, all eight parameter-builder forms
   render, filling them through the real widgets (including the ADA-only `Value`
   typed as the explicit empty bytestring `0x`) makes each live per-parameter
   CBOR equal the oracle CBOR, and the result shows the oracle final hash with
   `All Hashes Match!` and the registry submit gate. `/registry?hash=<final
   hash>` renders the BE record and `Share Verification` yields
   `<FE origin>/verify?txHash=<tx>`. `/verify?txHash=<tx>` serves the
   server-rendered social meta, pre-fills the form from the BE record,
   auto-verifies, decodes the stored parameters into the eight forms and shows
   the same final hash. All of it for the default env and for `preview`.

## What it does not prove

- Wallets; building, signing or submitting a transaction; Blockfrost.
- Mobile widths and the CBOR-paste mode (`Load into form`) of the builder.
- The version dropdown's live GitHub releases list: it is blocked in the browser
  leg and the fallback list is used.
- Chain sync: yaci-store's own extraction of label CBOR from a block. The
  injector publishes the event yaci-store would publish; it does not test
  yaci-store.
- The blst / secp256k1 native libraries in the BE image (no uplc-link path
  loads them).

## Prerequisites

- Docker (and the ability to pull `postgres:16-alpine` and the base images),
  `curl`, Node v20, JDK 21 at `$JAVA_HOME`, and `npm ci` done in `src/frontend`
  (the harness uses `src/frontend/node_modules/.bin/tsx`).
- Only for `E2E_BROWSER=1`: `npm ci` in `src/frontend/e2e` (Playwright 1.62.1)
  and its Chromium, installed once by the operator. The harness never installs
  a browser; do not run `playwright install` from a run.
- The fixture commit `f141bf8dfecfbdf832f2f58d0f983f26ef75c899` must be
  fetchable from `E2E_SOURCE_URL` (i.e. `develop` must be pushed): both
  containers clone from GitHub. A local mirror cannot stand in, because the BE
  always clones `https://<host>/<org>/<repo>.git`.
- Never run bare `aiken` or `aikup` on the host: `aikup install` re-points the
  global `~/.aiken/bin/aiken` symlink. This harness only runs them in containers.

## Running

A first run takes roughly 10-15 minutes (two image builds, two Aiken installs,
two rebuilds), which exceeds a foreground command limit. Run it in the
background and read the log when it finishes:

```bash
E2E_WORK_DIR=/tmp/e2e-run bash e2e/runtime/run.sh > /tmp/e2e-run.log 2>&1 &
```

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `JAVA_HOME` | (required) | JDK 21 for `./gradlew bootJar testClasses` |
| `E2E_WORK_DIR` | `mktemp -d` | logs, staging contexts, leg output |
| `E2E_SOURCE_URL` | `https://github.com/easy1staking-com/uplc-link` | repo both containers clone |
| `E2E_FIXTURE_COMMIT` | `f141bf8dfecfbdf832f2f58d0f983f26ef75c899` | commit that carries the fixture |
| `E2E_KEEP_IMAGES` | `0` | `1` keeps the two images after the run |
| `E2E_TIMEOUT_S` | `1500` | shared deadline for BE processing |
| `E2E_BROWSER` | `0` | `1` adds stage 6, the browser leg; anything but `0`/`1` exits 2 |

Exit codes: `0` = no `FAIL ` line; `1` = at least one `FAIL ` line (the last
line is `E2E RESULT: FAIL (<n> failed)`); `2` = a precondition failed and no
Docker object was created. Preconditions: `examples/aiken-v1.1.24` and the
oracle at `HEAD` equal the fixture commit's, the fetch probe against
`E2E_SOURCE_URL` succeeds, docker / JDK 21 / node v20 / tsx are present, and
with `E2E_BROWSER=1` Playwright's Chromium is installed (the `chromium`
executable path reported by `require('playwright')` in `src/frontend/e2e`
exists). Without `E2E_BROWSER=1` the run prints
`== stage 6: browser skipped (E2E_BROWSER != 1)` and runs none of that.

Every expected hash and CBOR is read from
`src/frontend/__tests__/fixtures/blueprint-v1124-oracle.json` at run time.

## Labels

Each label is printed once as `PASS <label>` or `FAIL <label> — <detail>`.
`E` is `default` (no `--env`) or `preview`.

| Label | Stage | PASS iff |
|---|---|---|
| `image fe-preinstalled-v1.1.24` | run.sh | the FE image's default `aiken --version` prints exactly `aiken v1.1.24+bacbeb3` |
| `image be-v1.1.24-on-demand` | run.sh | v1.1.24 is absent from the BE image, so the BE leg proves the on-demand install |
| `image be-jar-no-e2e-classes` | run.sh | the BE image's jar lists no `e2e/` or `MetadataReplayInjector` entry |
| `fe verify E` | prepare | `/api/verify` returns 200, `success`, compiler `v1.1.24+bacbeb3` |
| `fe raw-hash E` | prepare | one `fixture.vault` result, purposes spend+else, hash = oracle unapplied hash, V3, oracle parameter titles |
| `fe param-cbor E` | prepare | all eight oracle CBORs round-trip through `payloadToCborHex` |
| `fe apply E` | prepare | applying the first k parameters (k = 1..8) gives the oracle's k-th hash |
| `fe metadata E` | prepare | the 1984 record decodes to constr 0 with six correct fields, and the label CBOR reassembles to it |
| `be verified E` | check | by-tx returns `VERIFIED`, no error, matching env/source/commit/path/compiler |
| `be script E` | check | one script `fixture.vault`, raw hash, `COMPLETE`, provided parameters = oracle CBORs |
| `be final-hash E` | check | the BE final hash equals the oracle's and the FE-computed one |
| `fe proxy E` | check | `/api/registry?action=byTxHash` returns `VERIFIED` with the oracle final hash |
| `be rebuild-ran` | run.sh | BE log: install of v1.1.24, exactly two builds (one `env: preview`), no cache hit |
| `be compiler-version` | run.sh | the cached plutus.json of both envs reports `v1.1.24+bacbeb3` |

Browser labels (only with `E2E_BROWSER=1`, stage 6, printed by
`src/frontend/e2e/runtime-browser-leg.mjs`; `E` as above):

| Label | PASS iff |
|---|---|
| `browser manual-raw E` | after the top form and `Verify Contract`: one result `fixture.vault`, `Purposes: spend, else`, the eight oracle parameter titles listed in order, the Actual hash equals the oracle unapplied hash, and the unparameterized-hash note is visible |
| `browser manual-forms E` | before typing: each of the eight parameters renders once as a form (`Form`/`CBOR` buttons, no textarea); `nested` has two `select`s at `Some`; `seed` and `payee` show their smart widgets; `minimum` has `+ Add entry` and no text input |
| `browser manual-params E` | after the inputs: each live per-parameter CBOR equals the oracle CBOR; `minimum`'s inputs read `0x`, `0x`, `2000000` |
| `browser manual-hash E` | the Actual hash equals the oracle final hash; `All Hashes Match!` and the matched-count line are visible |
| `browser manual-submit-gate E` | the `Submit to Registry` heading, the registered-count line and `Connect your wallet to submit` are visible and no `Submit to Registry` button exists |
| `browser registry-card E` | `/registry?hash=<final hash>` shows `Found 1 script`, `fixture.vault`, the `Parameterized` badge, the `env: preview` pill only for preview; `Share Verification` puts `<FE origin>/verify?txHash=<tx>` on the clipboard |
| `browser deeplink-meta E` | with JavaScript disabled, `/verify?txHash=<tx>` serves `og:title` starting `<org>/<repo> @ <commit first 8>` and a description with the version, `1 script hash`, `VERIFIED` and (preview only) `(env: preview)` |
| `browser deeplink-prefill E` | the form is pre-filled from the BE record (repo, commit, path, env, version `v1.1.24`, expected hash) and the pre-filled note is visible |
| `browser deeplink-params E` | the eight forms hold the decoded stored parameters: live CBORs equal the oracle's, `minimum` reads `0x`, `0x`, `2000000` |
| `browser deeplink-hash E` | as `manual-hash`, on the deep-link page |
| `browser deeplink-submit-gate E` | as `manual-submit-gate`, on the deep-link page |
| `browser no-blockfrost` | no request attempted in any browser context had a host containing `blockfrost`, and every request to another origin was aborted |

A `FAIL infra <step>` line means the stack could not be brought up; it counts
as a failure.

## Browser leg

`E2E_BROWSER=1` runs `src/frontend/e2e/runtime-browser-leg.mjs` (Playwright
library API, headless Chromium) after the FE and BE legs, against the FE
container only.

- **No external origin.** Every browser context routes all requests: those to
  the FE origin continue to the real container, every other origin is aborted
  and reported once per host as `INFO blocked <host>`. Nothing is answered with
  a stand-in response. `INFO blocked api.github.com` is expected (the version
  dropdown then uses its built-in fallback list, which contains `v1.1.24`).
  There is no wallet, no Blockfrost and nothing is built, signed or submitted.
- **Never clicked.** The only clicks are `Verify Contract`, `+ Add entry` and
  `Share Verification`. No wallet button, no `Submit to Registry`, no
  `Form`/`CBOR` toggle; the submit gate is only observed.
- **Inputs fixed, expectations from the oracle.** The values typed into the
  parameter builder are fixed in the script (hex built with `repeat`, the
  `Value` entry typed as `0x`, `0x`, `2000000`); every expected hash and CBOR is
  read from the oracle at run time, and the deep-link tx hashes from
  `<work dir>/out/expected.json` written by the FE leg.
- On a FAIL a full-page screenshot is saved to `<work dir>/out/browser/`.

## Cleanup guarantees

A trap on EXIT / INT / TERM saves the BE, FE and Postgres logs into the work
dir, then removes exactly the three containers and the network named from
`RUN_ID` (`uplc-e2e-$RUN_ID`, `uplc-e2e-$RUN_ID-{pg,be,fe}`) and, unless
`E2E_KEEP_IMAGES=1`, the two images `uplc-link-e2e-{fe,be}:$RUN_ID`. It never
prunes and never touches any other Docker object.

## The injector

`src/backend/src/test/java/e2e/ingest/MetadataReplayInjector.java` is a plain
class in package `e2e.ingest` (outside the component-scan root, no Spring
stereotype). It lives in `src/test`, so it is never in the boot jar. The harness
mounts its compiled class read-only and starts the BE image with
`--entrypoint java ... PropertiesLauncher -Dloader.path=... --spring.main.sources=e2e.ingest.MetadataReplayInjector`.
It reads `<txHash> <labelCborHex>` lines from `e2e.replay.file` and publishes the
`TxMetadataEvent` yaci-store would publish, so the production ingest code runs
unchanged.

It is not an HTTP endpoint or a direct DB insert on purpose: an endpoint would
be a new unauthenticated ingest path in production code (ingest is a trust
boundary), and a DB insert would skip the parser and validator that the run is
meant to exercise.

## GitHub rate limit

`aikup install` and the stdlib fetch call GitHub unauthenticated inside the
containers. A few runs per hour are fine; if the log shows 403 / "rate limit",
check `curl -s https://api.github.com/rate_limit`, wait for the reset and rerun.
