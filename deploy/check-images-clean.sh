#!/usr/bin/env bash
# Fails if any app image holds personal data. The repo is public, so images must stay clean.
set -euo pipefail
tag="${IMAGE_TAG:?set IMAGE_TAG}"
workdir=$(mktemp -d)
cid=""
trap '[ -z "$cid" ] || docker rm "$cid" >/dev/null 2>&1 || true; rm -rf "$workdir"' EXIT
found=0 processed=0 skipped=0 failed=0 leaked=0

for image in copilot-api copilot-web copilot-jobspy; do
  found=$((found + 1))
  ref="ghcr.io/dandutra/${image}:${tag}"
  # --pull=never, so the scan never passes a registry image in place of the one just built.
  if ! cid=$(docker create --pull=never "$ref"); then
    echo "FAIL: could not create a container from $ref" >&2
    cid=""
    failed=$((failed + 1))
    continue
  fi
  # An unreadable image must fail the scan, so the listing is checked before anything filters it.
  listed=true
  if ! docker export "$cid" | tar -t >"$workdir/listing" || [ ! -s "$workdir/listing" ]; then
    listed=false
  fi
  docker rm "$cid" >/dev/null || echo "WARN: could not remove container $cid" >&2
  cid=""
  if [ "$listed" = false ]; then
    echo "FAIL: could not list the files in $ref" >&2
    failed=$((failed + 1))
    continue
  fi
  processed=$((processed + 1))

  # Dependencies ship their own data/ folders, so only look outside node_modules, site-packages and system libs.
  # grep exits 1 on no match, which here means a clean image.
  leaks=$({ grep -vE '(^|/)(node_modules|site-packages)/|^usr/(local/)?lib/' "$workdir/listing" || true; } \
    | { grep -E '(^|/)(data/|\.env($|\.))' || true; } \
    | { grep -v '\.env\.example$' || true; })
  if [ -n "$leaks" ]; then
    echo "FAIL: $ref contains:" >&2
    echo "$leaks" >&2
    leaked=$((leaked + 1))
  fi
done

echo "found=$found processed=$processed skipped=$skipped failed=$failed leaked=$leaked"
[ "$processed" -gt 0 ] && [ "$failed" -eq 0 ] && [ "$leaked" -eq 0 ]
