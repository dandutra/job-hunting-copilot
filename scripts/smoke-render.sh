#!/usr/bin/env bash
# Renders a fake resume and letter inside a built API image, to prove the image carries a working Typst.
# Usage: scripts/smoke-render.sh <image>   (the image must already exist locally)
set -euo pipefail
image="${1:?usage: smoke-render.sh <image>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# --pull=never, so a registry image never stands in for the one just built.
docker run --rm --pull=never -v "$here/smoke-render.cjs:/smoke-render.cjs:ro" \
  --entrypoint node "$image" /smoke-render.cjs
