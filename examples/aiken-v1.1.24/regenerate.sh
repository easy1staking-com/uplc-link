#!/usr/bin/env bash
# Regenerates every compiler-produced fixture of this project. Never hand-edit them.
# Usage: AIKEN=/abs/path/to/aiken-v1.1.24 ./regenerate.sh   (never aikup, never bare `aiken`)
set -euo pipefail

EXPECTED_VERSION="aiken v1.1.24+bacbeb3"

if [[ -z "${AIKEN:-}" ]]; then
  echo "AIKEN must point at the v1.1.24 release binary" >&2
  exit 1
fi
if [[ "$("$AIKEN" --version)" != "$EXPECTED_VERSION" ]]; then
  echo "AIKEN must report exactly '$EXPECTED_VERSION'" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FE="$ROOT/src/frontend/__tests__/fixtures"
BE="$ROOT/src/backend/src/test/resources/aiken-v1.1.24"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TITLES=(owner threshold pair tuple nested seed payee minimum)
CBORS=(
  581cabababababababababababababababababababababababababababab
  1a001e8480
  9f0142cafeff
  9f42beef02ff
  d8799fd8799f07ffff
  d8799f5820111111111111111111111111111111111111111111111111111111111111111100ff
  d8799fd8799f581ccdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdffd87a80ff
  a140a1401a001e8480
)

spend_hash() {
  python3 -I -c '
import json, sys
d = json.load(open(sys.argv[1]))
print(next(v["hash"] for v in d["validators"] if v["title"] == "fixture.vault.spend"))
' "$1"
}

cd "$HERE"

# build <label> [aiken build args...]: leaves $TMP/<label>.json and $TMP/<label>.hashes
build() {
  local label="$1"; shift
  "$AIKEN" build "$@"
  cp plutus.json "$TMP/$label.json"

  python3 -I -c '
import json, sys
print(json.load(open(sys.argv[1]))["validators"][0]["compiledCode"])
' "$TMP/$label.json" > "$TMP/$label.cc"
  local decoded
  decoded="$("$AIKEN" uplc decode --cbor --hex "$TMP/$label.cc" | tr -s ' \n\t' ' ')"
  for b in valueContains unValueData; do
    if ! grep -qE "\(builtin $b ?\)" <<<"$decoded"; then
      echo "build '$label': compiledCode does not retain builtin $b" >&2
      exit 1
    fi
  done

  spend_hash "$TMP/$label.json" > "$TMP/$label.hashes"
  local prev="$TMP/$label.json" k
  for k in 0 1 2 3 4 5 6 7; do
    "$AIKEN" blueprint apply -i "$prev" -o "$TMP/$label.$k.json" -m fixture -v vault "${CBORS[$k]}"
    spend_hash "$TMP/$label.$k.json" >> "$TMP/$label.hashes"
    prev="$TMP/$label.$k.json"
  done
}

build default
build preview --env preview

mkdir -p "$FE" "$BE"
cp "$TMP/default.json" "$FE/blueprint-v1124-default.json"
cp "$TMP/default.json" "$BE/plutus-default.json"
cp "$TMP/preview.json" "$FE/blueprint-v1124-preview.json"
cp "$TMP/preview.json" "$BE/plutus-preview.json"

python3 -I - "$TMP" "$FE/blueprint-v1124-oracle.json" "${TITLES[@]}" -- "${CBORS[@]}" <<'PY'
import json, sys
tmp, out = sys.argv[1], sys.argv[2]
rest = sys.argv[3:]
i = rest.index("--")
titles, cbors = rest[:i], rest[i + 1:]

def build(env, label):
    hashes = open(f"{tmp}/{label}.hashes").read().split()
    return {"env": env, "unapplied_hash": hashes[0], "applied_hashes": hashes[1:]}

oracle = {
    "compiler": "v1.1.24+bacbeb3",
    "stdlib": "aiken-lang/stdlib v4.0.0",
    "validator": "fixture.vault",
    "parameters": [{"title": t, "cbor": c} for t, c in zip(titles, cbors)],
    "builds": [build("", "default"), build("preview", "preview")],
}
with open(out, "w") as f:
    f.write(json.dumps(oracle, indent=2) + "\n")
PY
cp "$FE/blueprint-v1124-oracle.json" "$BE/oracle.json"

rm -f "$HERE/plutus.json"
