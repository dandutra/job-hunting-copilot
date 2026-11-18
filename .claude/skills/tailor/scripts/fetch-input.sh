#!/usr/bin/env bash
set -euo pipefail
id=${1:-}; out=${2:-}
[[ $id =~ ^[0-9]+$ && -n $out ]] || { echo "usage: fetch-input.sh <numeric Posting ID> <output file>" >&2; exit 2; }
[[ -f data/master-profile.yaml ]] || { echo "data/master-profile.yaml not found; run from the repo root" >&2; exit 1; }
base=$(grep -m1 '^COPILOT_API_URL=' .env | cut -d= -f2- | tr -d "\"'\r" || true); base=${base%/}
[[ -n $base ]] || { echo "COPILOT_API_URL is not set in .env" >&2; exit 1; }
rm -f "$out"
if ! curl -sS --fail-with-body "$base/postings/$id/tailoring-input" -o "$out"; then
  cat "$out" >&2 2>/dev/null || true; rm -f "$out"; exit 1
fi
# Exit 1, not 3, on a non-JSON body, so a wrong URL never reads as a profile mismatch.
stored=$(node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).profileVersion) } catch { process.exit(1) }' "$out") \
  || { rm -f "$out"; echo "the API answered with something other than JSON; check that COPILOT_API_URL ends in /api" >&2; exit 1; }
local_hash=$(shasum -a 256 data/master-profile.yaml | cut -d' ' -f1)
if [[ $stored != "$local_hash" ]]; then
  rm -f "$out"
  echo "data/master-profile.yaml differs from the stored profile version. Run pnpm profile:import, then try again." >&2
  exit 3
fi
echo "profile version matches; input saved to $out"
