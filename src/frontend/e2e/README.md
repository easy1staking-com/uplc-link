# plutus-scan e2e harness

Playwright QA scripts for the frontend, persisted in-repo from the T-301
through T-305 / T-205 development-session harnesses (T-207/T-208,
2026-08-13).
These are standalone verification scripts, not a `test:e2e` npm script and
not wired into CI — run them manually as needed.

## What each script covers

- **`mobile-sweep.mjs`** — the fast, mocked-backend sweep. Checks zero
  horizontal overflow at 360/390/768/1024px across every route (`/`,
  `/verify`, `/registry`, `/docs`) and their key interaction states (drawer
  open, deep-link results expanded, error states, manual sundae verify flow,
  registry search results expanded), plus:
  - responsive chrome: hamburger vs inline nav, drawer open/close/navigate,
    footer grid column count (T-301)
  - verify page: corner-ribbon absence, deep-link hash break-all + visible
    Copy-hash button + clipboard content, input width at mobile widths
    (T-302)
  - registry page: header pill / hash-row button single-line height, input
    width at mobile widths (T-303)
  - a fixed/sticky-element guard (no unexpected `position: fixed|sticky`
    element visible in the viewport at any width, except the drawer overlay
    itself while the drawer is open)

- **`registry-check.mjs`** — self-contained registry-proxy check. Builds the
  frontend, boots `next start` against an in-process stub HTTP backend, and
  exercises the real `/api/registry` proxy route end-to-end (no route
  mocking — the Next.js server actually calls out to the stub). Locks in the
  `purposes: string[]` / `env: string | null` response shape and the T-208
  guard that omits the purposes pill entirely when `purposes` is empty
  rather than rendering an empty pill.

- **`real-verify.mjs`** — SLOW (~6 minutes), network-dependent, NEVER part
  of the fast suite. No API mocks: submits a real repository/commit to
  `/api/verify`, which does a real `git clone` + `aikup` + `aiken build`
  against upstream GitHub and the Aiken toolchain. Confirms the mobile
  layout holds up against real (not fixture) verification output.

## Install

```bash
cd src/frontend/e2e
npm install
npx playwright install chromium
```

This is a separate `package.json`/lockfile from `src/frontend` — Playwright
is pinned here (`1.62.1`) and is not a dependency of the app itself.
`src/frontend/.gitignore`'s `/node_modules` is anchored to the frontend
root and does NOT cover `e2e/node_modules`, hence this directory's own
`.gitignore`.

## Running the fast suite (mobile-sweep.mjs, registry-check.mjs)

`mobile-sweep.mjs` needs a running production server. Port hygiene first —
`next start` forks a `next-server` child process, so a name-based `pkill`
misses it; kill by PID:

```bash
ss -ltnp | grep :3461          # find the PID (if any) still bound
kill -9 <pid>                  # only if something is listening
```

Then, from `src/frontend`:

```bash
npm run build && PORT=3461 npm start   # leave running in this terminal
```

In another terminal, from `src/frontend/e2e`:

```bash
node mobile-sweep.mjs
```

The target URL defaults to `http://localhost:3461`; override with
`E2E_BASE_URL` (full URL) or `E2E_PORT` (port only, same host). Exits 0 iff
every check passes. Screenshots and `mobile-sweep-summary.json` (per
width/state pass-fail + offender list) are written to `artifacts/`
(gitignored — see "No screenshots committed" below).

`registry-check.mjs` is self-contained — it builds the frontend and boots
its own `next start` + stub backend on ports 4205/4206 (override with
`STUB_PORT` / `NEXT_PORT`), so it does not need the server from the step
above:

```bash
node registry-check.mjs
```

## Self-test mode

`mobile-sweep.mjs` includes a built-in self-test that proves its
fixed/sticky-element guard actually fires on a real offender, rather than
passing vacuously:

```bash
E2E_SELF_TEST_FIXED=1 node mobile-sweep.mjs
```

Against a running server (same prereqs as the fast suite above), it loads
`/` at 360x740, then: (a) confirms the guard reports zero offenders on the
unmodified page; (b) injects a visible 120x40 `position: fixed` div at the
top-left corner (`id="__e2e_fixed_probe"`) and confirms the guard reports
exactly that element as the offender; (c) removes it and confirms the guard
passes clean again. Exits 0 iff all three phases hold.

## Running the slow suite (real-verify.mjs)

Same server prereqs as `mobile-sweep.mjs` above (build + `PORT=3461 npm
start`). Takes up to 6 minutes — it performs a real network clone and Aiken
build, not a mocked one:

```bash
node real-verify.mjs
```

## Byte-identity baseline technique (local-only)

Several of the source session harnesses this suite was distilled from used
a byte-identity screenshot comparison to prove "nothing changed elsewhere":
capture a full-page PNG before a change, capture the same shot after, and
diff the two files byte-for-byte (or pixel-for-pixel with a tool like
`pixelmatch`) to catch any unintended visual regression outside the area
under test. That technique is **not** reproduced as a committed baseline
here — screenshots are machine- and font-rendering-dependent (different
CI/dev machines will not produce byte-identical PNGs), so no PNGs are
committed and `artifacts/` is gitignored.

To use this technique locally: run the relevant script once before your
change (rename or move the `artifacts/*.png` files it writes out of
`artifacts/` so the next run doesn't overwrite them), make your change, run
the script again, and diff the two screenshot sets on your own machine
(`diff` for byte-identity, or a perceptual/pixel diff tool if you expect
sub-pixel rendering variance). Treat any unexpected diff outside your
intended change as a regression.

## A note on fixtures/sundae-response.json

`fixtures/sundae-response.json` contains embedded `/tmp/plutus-scan-*`
paths. These are **public build-log output** from the app's own verify
pipeline (the paths the backend reports back to the frontend), not session
artifacts or local machine paths — they are sanctioned fixture content, not
something that leaked from a development environment.

## Provenance

This harness was persisted in-repo from the T-301 through T-305 / T-205
development-session harnesses (mobile-responsive-repair epic, 2026-08-13).
It intentionally drops each individual ticket's desktop-baseline-vs-after
screenshot-suffix machinery (`T30x_DESKTOP_SUFFIX` env vars) since there is
no more "before" state to compare against once folded into a single ongoing
harness — see the byte-identity section above for how to reproduce
that workflow locally when you need it for a specific change.
