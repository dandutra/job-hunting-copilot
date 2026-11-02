#!/usr/bin/env bash
# Fails if any app image holds personal data. The repo is public, so images must stay clean.
set -euo pipefail
tag="${IMAGE_TAG:?set IMAGE_TAG}"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
found=0 processed=0 skipped=0 failed=0 leaked=0

for image in copilot-api copilot-web copilot-jobspy; do
  found=$((found + 1))
  ref="ghcr.io/dandutra/${image}:${tag}"
  cid=$(docker create "$ref")
  # An unreadable image must fail the scan, so the listing is checked before anything filters it.
  if ! docker export "$cid" | tar -t >"$workdir/listing" || [ ! -s "$workdir/listing" ]; then
    echo "FAIL: could not list the files in $ref" >&2
    failed=$((failed + 1))
    docker rm "$cid" >/dev/null
    continue
  fi
  docker rm "$cid" >/dev/null
  processed=$((processed + 1))

  # Dependencies ship their own data/ folders, so only look outside node_modules and system libs.
  # grep exits 1 on no match, which here means a clean image.
  leaks=$(grep -vE '(^|/)node_modules/|^usr/(local/)?lib/' "$workdir/listing" \
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
