#!/usr/bin/env bash
# Runs on the Droplet as `deploy`, started by .github/workflows/deploy.yml over Tailscale SSH.
# stdin carries the KEY=value lines for .env, so no secret reaches an argument list or the process environment.
# Usage: deploy.sh <commit sha>   (from the directory that holds deploy/compose.prod.yaml)
set -euo pipefail

sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <40-character commit sha>" >&2; exit 2; }

compose_file=deploy/compose.prod.yaml
[ -f "$compose_file" ] || { echo "run from the directory that holds $compose_file" >&2; exit 2; }

# A value may hold any character except a newline, which the line check below rejects.
required=(POSTGRES_PASSWORD)
declare -A seen=()
umask 077
tmp=$(mktemp .env.XXXXXX)
trap 'rm -f "$tmp"' EXIT

while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  if [[ ! "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    echo "FAIL: stdin has a line that is not KEY=value" >&2
    exit 2
  fi
  key="${BASH_REMATCH[1]}"
  [ "$key" != IMAGE_TAG ] || { echo "FAIL: IMAGE_TAG comes from the argument, not stdin" >&2; exit 2; }
  seen[$key]=1
  printf '%s\n' "$line" >>"$tmp"
done
for key in "${required[@]}"; do
  [ -n "${seen[$key]:-}" ] || { echo "FAIL: stdin lacks $key" >&2; exit 2; }
done
printf 'IMAGE_TAG=%s\n' "$sha" >>"$tmp"
chmod 600 "$tmp"
mv "$tmp" .env

compose=(docker compose -f "$compose_file" --env-file .env)

"${compose[@]}" pull --quiet
# The 6-minute ingest drain is inside this call; the wait covers it and the other services' start.
if ! "${compose[@]}" up -d --wait --wait-timeout 600 --remove-orphans; then
  echo "FAIL: the stack did not become healthy at $sha" >&2
  "${compose[@]}" ps >&2 || true
  exit 1
fi

# Keeps the deployed SHA plus the two newest others per image. An image in use refuses removal.
pruned=0 kept=0
for image in copilot-api copilot-web copilot-jobspy; do
  mapfile -t tags < <(docker image ls "ghcr.io/dandutra/$image" --format '{{.CreatedAt}}|{{.Tag}}' | sort -r | cut -d'|' -f2)
  others=0
  for tag in "${tags[@]}"; do
    if [ "$tag" = "$sha" ]; then kept=$((kept + 1)); continue; fi
    others=$((others + 1))
    if [ "$others" -le 2 ]; then kept=$((kept + 1)); continue; fi
    if docker image rm "ghcr.io/dandutra/$image:$tag" >/dev/null 2>&1; then pruned=$((pruned + 1)); fi
  done
done
docker image prune -f >/dev/null
echo "deployed=$sha kept=$kept pruned=$pruned"
