#!/usr/bin/env bash
# Runtime-image E2E for the Aiken v1.1.24 fixture (T-407-1). See README.md.
#
# Builds the FE and BE Docker images from this checkout, starts a disposable
# stack on a private Docker network, and proves clone -> build -> apply ->
# encode -> ingest -> rebuild -> apply -> read-back for an empty env and for
# `--env preview`. Nothing is built, signed or submitted on-chain.
#
# Exit codes: 0 = no FAIL line; 1 = at least one FAIL; 2 = precondition failed
# (no Docker object has been created).
set -euo pipefail

E2E_SOURCE_URL="${E2E_SOURCE_URL:-https://github.com/easy1staking-com/uplc-link}"
E2E_FIXTURE_COMMIT="${E2E_FIXTURE_COMMIT:-f141bf8dfecfbdf832f2f58d0f983f26ef75c899}"
E2E_KEEP_IMAGES="${E2E_KEEP_IMAGES:-0}"
E2E_TIMEOUT_S="${E2E_TIMEOUT_S:-1500}"
E2E_WORK_DIR="${E2E_WORK_DIR:-$(mktemp -d)}"
SOURCE_PATH="examples/aiken-v1.1.24"
ORACLE_REL="src/frontend/__tests__/fixtures/blueprint-v1124-oracle.json"

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
RUN_ID="$(date +%s)-$$"
WORK="$E2E_WORK_DIR"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"

NET="uplc-e2e-$RUN_ID"
PG="uplc-e2e-$RUN_ID-pg"
BE="uplc-e2e-$RUN_ID-be"
FE="uplc-e2e-$RUN_ID-fe"
BE_IMG="uplc-link-e2e-be:$RUN_ID"
FE_IMG="uplc-link-e2e-fe:$RUN_ID"

echo "RUN_ID=$RUN_ID"
echo "WORK_DIR=$WORK"

FAILS=0
START_EPOCH="$(date +%s)"
CREATED=0

pass() { echo "PASS $1"; }
failf() { FAILS=$((FAILS + 1)); echo "FAIL $1 — $2"; }

finish() {
  if [ "$FAILS" -eq 0 ]; then
    echo "E2E RESULT: PASS"
    exit 0
  fi
  echo "E2E RESULT: FAIL ($FAILS failed)"
  exit 1
}

infra_fail() { failf "infra $1" "$2"; finish; }

# ---------------------------------------------------------------- stage 1
echo "== stage 1: preconditions"
PRE=0
pre_fail() { echo "PRECONDITION FAILED: $1" >&2; PRE=1; }

if ! git -C "$ROOT" diff --quiet "$E2E_FIXTURE_COMMIT" HEAD -- examples/aiken-v1.1.24 "$ORACLE_REL" 2>/dev/null; then
  pre_fail "fixture diff: examples/aiken-v1.1.24 or the oracle differs between $E2E_FIXTURE_COMMIT and HEAD (or that commit is not available locally)"
fi

rm -rf "$WORK/gate"
if ! { git init -q "$WORK/gate" && git -C "$WORK/gate" fetch -q --depth 1 "$E2E_SOURCE_URL" "$E2E_FIXTURE_COMMIT"; } >"$WORK/gate.log" 2>&1; then
  pre_fail "fetch probe: $E2E_SOURCE_URL does not serve $E2E_FIXTURE_COMMIT (see $WORK/gate.log)"
fi

if ! command -v docker >/dev/null 2>&1; then pre_fail "docker not found"; fi
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q 'version "21'; then
  pre_fail "JAVA_HOME must point to a JDK 21"
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v20* ]]; then pre_fail "node v20 required"; fi
TSX="$ROOT/src/frontend/node_modules/.bin/tsx"
if [ ! -x "$TSX" ]; then pre_fail "$TSX missing (run npm ci in src/frontend)"; fi
if ! command -v curl >/dev/null 2>&1; then pre_fail "curl not found"; fi

if [ "$PRE" -ne 0 ]; then exit 2; fi

# ---------------------------------------------------------------- cleanup
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  set +e
  if [ "$CREATED" = 1 ]; then
    local c
    for c in "$BE" "$FE" "$PG"; do
      if docker inspect "$c" >/dev/null 2>&1; then
        docker logs "$c" >"$WORK/${c##*-}.log" 2>&1
      fi
    done
    docker rm -f "$BE" "$FE" "$PG" >/dev/null 2>&1
    docker network rm "$NET" >/dev/null 2>&1
    if [ "$E2E_KEEP_IMAGES" != 1 ]; then
      docker rmi "$BE_IMG" "$FE_IMG" >/dev/null 2>&1
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ORACLE="$ROOT/$ORACLE_REL"
OUT="$WORK/out"
mkdir -p "$OUT"

# ---------------------------------------------------------------- stage 2
echo "== stage 2: BE build"
if ! (cd "$ROOT/src/backend" && ./gradlew --no-daemon -q bootJar testClasses) >"$WORK/gradle.log" 2>&1; then
  infra_fail be-gradle "gradle bootJar testClasses failed (see $WORK/gradle.log)"
fi
rm -rf "$WORK/be-ctx" "$WORK/inject"
mkdir -p "$WORK/be-ctx/build/libs" "$WORK/inject"
cp "$ROOT/src/backend/build/libs/plutus-scan-0.0.1-SNAPSHOT.jar" "$WORK/be-ctx/build/libs/"
cp -r "$ROOT/src/backend/build/classes/java/test/e2e" "$WORK/inject/e2e"
CREATED=1
if ! docker build -f "$ROOT/src/backend/Dockerfile" -t "$BE_IMG" "$WORK/be-ctx" >"$WORK/build-be.log" 2>&1; then
  infra_fail be-image "docker build failed (see $WORK/build-be.log)"
fi

# ---------------------------------------------------------------- stage 3
echo "== stage 3: FE build"
if ! docker build -t "$FE_IMG" \
    --build-arg CARDANO_NETWORK=preview \
    --build-arg "BACKEND_URL=http://$BE:8080" \
    --build-arg BASE_URL=http://localhost:3000 \
    --build-arg BLOCKFROST_PROJECT_ID= \
    "$ROOT/src/frontend" >"$WORK/build-fe.log" 2>&1; then
  infra_fail fe-image "docker build failed (see $WORK/build-fe.log)"
fi

# ---------------------------------------------------------------- stage 4
echo "== stage 4: image checks"
FE_VER="$(docker run --rm --entrypoint /root/.aiken/bin/aiken "$FE_IMG" --version 2>&1 || true)"
if [ "$FE_VER" = "aiken v1.1.24+bacbeb3" ]; then
  pass "image fe-preinstalled-v1.1.24"
else
  failf "image fe-preinstalled-v1.1.24" "default aiken in the FE image prints: $FE_VER"
fi

if docker run --rm --entrypoint sh "$BE_IMG" -c 'test ! -e /root/.aiken/versions/v1.1.24' >/dev/null 2>&1; then
  pass "image be-v1.1.24-on-demand"
else
  failf "image be-v1.1.24-on-demand" "/root/.aiken/versions/v1.1.24 already exists in the BE image"
fi

JAR_LIST="$WORK/be-jar.lst"
if ! docker run --rm --entrypoint sh "$BE_IMG" -c 'jar tf /app/app.jar' >"$JAR_LIST" 2>"$WORK/be-jar.err"; then
  failf "image be-jar-no-e2e-classes" "jar tf failed (see $WORK/be-jar.err)"
elif ! grep -q '^BOOT-INF/classes/com/easy1staking/' "$JAR_LIST"; then
  failf "image be-jar-no-e2e-classes" "jar listing is empty or unexpected, cannot conclude"
elif grep -q -e 'e2e/' -e 'MetadataReplayInjector' "$JAR_LIST"; then
  failf "image be-jar-no-e2e-classes" "jar lists: $(grep -e 'e2e/' -e 'MetadataReplayInjector' "$JAR_LIST" | head -3 | tr '\n' ' ')"
else
  pass "image be-jar-no-e2e-classes"
fi

# ---------------------------------------------------------------- stage 5
echo "== stage 5: stack"
docker network create "$NET" >/dev/null || infra_fail network "docker network create failed"

docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_USER=cardano -e POSTGRES_PASSWORD=password -e POSTGRES_DB=plutus_scan \
  postgres:16-alpine >/dev/null || infra_fail postgres "could not start postgres"
for _ in $(seq 1 60); do
  if docker exec "$PG" pg_isready -U cardano -d plutus_scan >/dev/null 2>&1; then PG_UP=1; break; fi
  PG_UP=0; sleep 1
done
[ "$PG_UP" = 1 ] || infra_fail postgres "pg_isready never succeeded"

docker run -d --name "$FE" --network "$NET" -p 127.0.0.1::3000 \
  -e "BACKEND_URL=http://$BE:8080" "$FE_IMG" >/dev/null || infra_fail fe-start "could not start the FE container"
FE_URL="http://$(docker port "$FE" 3000/tcp | sed -n 1p)"
FE_UP=0
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$FE_URL/api/health" 2>/dev/null || true)" = 200 ]; then FE_UP=1; break; fi
  sleep 2
done
[ "$FE_UP" = 1 ] || infra_fail fe-start "GET $FE_URL/api/health never returned 200 within 120 s"

# run one FE-leg mode, echo its output, count its FAIL lines into FAILS
run_leg() {
  local mode="$1"; shift
  local logf="$WORK/leg-$mode.log" rc=0 n
  set +e
  (cd "$ROOT/src/frontend" && "$TSX" e2e/runtime-fe-leg.ts "$mode" "$@") 2>&1 | tee "$logf"
  rc="${PIPESTATUS[0]}"
  set -e
  n="$(grep -c '^FAIL ' "$logf" || true)"
  FAILS=$((FAILS + n))
  if [ "$rc" -ne 0 ] && [ "$n" -eq 0 ]; then
    failf "infra fe-leg-$mode" "leg exited $rc without a FAIL line (see $logf)"
  fi
}

echo "== stage 5: FE leg (prepare)"
run_leg prepare --fe-url "$FE_URL" --oracle "$ORACLE" --source-url "$E2E_SOURCE_URL" \
  --commit "$E2E_FIXTURE_COMMIT" --source-path "$SOURCE_PATH" --out-dir "$OUT"
[ -f "$OUT/replay.txt" ] || : >"$OUT/replay.txt"
EXPECTED_LINES="$(grep -c . "$OUT/replay.txt" || true)"

echo "== stage 5: BE start"
docker run -d --name "$BE" --network "$NET" -p 127.0.0.1::8080 \
  -e "DB_URL=jdbc:postgresql://$PG:5432/plutus_scan" \
  -v "$WORK/inject:/e2e/classes:ro" -v "$OUT/replay.txt:/e2e/replay.txt:ro" \
  --entrypoint java "$BE_IMG" \
  -Dloader.path=/e2e/classes -cp /app/app.jar org.springframework.boot.loader.launch.PropertiesLauncher \
  --store.sync-auto-start=false --spring.main.sources=e2e.ingest.MetadataReplayInjector \
  --e2e.replay.file=/e2e/replay.txt --verification.poll-interval-ms=5000 >/dev/null \
  || infra_fail be-start "could not start the BE container"
BE_URL="http://$(docker port "$BE" 8080/tcp | sed -n 1p)"

INJECTED=0
for _ in $(seq 1 90); do
  BE_LOG="$(docker logs "$BE" 2>&1 || true)"
  if grep -q 'Application run failed' <<<"$BE_LOG"; then
    infra_fail be-start "BE reported 'Application run failed' (see $WORK/be.log)"
  fi
  INJECTED="$(grep -c 'E2E-INJECTED' <<<"$BE_LOG" || true)"
  if [ "$INJECTED" -ge "$EXPECTED_LINES" ]; then break; fi
  sleep 2
done
if [ "$INJECTED" -lt "$EXPECTED_LINES" ]; then
  infra_fail be-start "only $INJECTED of $EXPECTED_LINES replay lines injected within 180 s"
fi

echo "== stage 5: FE leg (check)"
ELAPSED=$(( $(date +%s) - START_EPOCH ))
REMAINING=$(( E2E_TIMEOUT_S - ELAPSED ))
[ "$REMAINING" -ge 120 ] || REMAINING=120
run_leg check --fe-url "$FE_URL" --be-url "$BE_URL" --oracle "$ORACLE" --out-dir "$OUT" --timeout-s "$REMAINING"

# ---------------------------------------------------------------- BE log + DB evidence
BE_LOG="$(docker logs "$BE" 2>&1 || true)"
N_INSTALL="$(grep -c 'Installing Aiken version: v1.1.24' <<<"$BE_LOG" || true)"
N_BUILD="$(grep -c 'Building Aiken project in:' <<<"$BE_LOG" || true)"
N_BUILD_PREVIEW="$(grep 'Building Aiken project in:' <<<"$BE_LOG" | grep -c '(env: preview)' || true)"
N_CACHE="$(grep -c 'Cache hit for' <<<"$BE_LOG" || true)"
if [ "$N_INSTALL" -ge 1 ] && [ "$N_BUILD" -eq 2 ] && [ "$N_BUILD_PREVIEW" -eq 1 ] && [ "$N_CACHE" -eq 0 ]; then
  pass "be rebuild-ran"
else
  failf "be rebuild-ran" "install lines=$N_INSTALL (want >=1), build lines=$N_BUILD (want 2), preview builds=$N_BUILD_PREVIEW (want 1), cache hits=$N_CACHE (want 0)"
fi

GOT_VERSIONS="$(docker exec "$PG" psql -U cardano -d plutus_scan -At -c "select env || ':' || (plutus_json_content->'preamble'->'compiler'->>'version') from plutus_json_cache order by env" 2>&1 || true)"
WANT_VERSIONS=$':v1.1.24+bacbeb3\npreview:v1.1.24+bacbeb3'
if [ "$GOT_VERSIONS" = "$WANT_VERSIONS" ]; then
  pass "be compiler-version"
else
  failf "be compiler-version" "plutus_json_cache query printed: $GOT_VERSIONS"
fi

finish
