#!/usr/bin/env bash
# Fails if any app image holds personal data. The repo is public, so images must stay clean.
set -euo pipefail
tag="${IMAGE_TAG:?set IMAGE_TAG}"
checked=0
for image in copilot-api copilot-web copilot-jobspy; do
  ref="ghcr.io/dandutra/${image}:${tag}"
  docker image inspect "$ref" >/dev/null
  cid=$(docker create "$ref")
  # Dependencies ship their own data/ folders, so only look outside node_modules and system libs.
  leaks=$(docker export "$cid" | tar -t | grep -vE '(^|/)node_modules/|^usr/(local/)?lib/' \
    | grep -E '(^|/)(data/|\.env($|\.))' | grep -v '\.env\.example$' || true)
  docker rm "$cid" >/dev/null
  checked=$((checked + 1))
  if [ -n "$leaks" ]; then
    echo "FAIL: $ref contains:" >&2
    echo "$leaks" >&2
    exit 1
  fi
done
echo "checked $checked images, 0 leaks"
