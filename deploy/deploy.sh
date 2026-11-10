#!/usr/bin/env bash
# stdin carries the KEY=value lines for .env, so no secret reaches an argument list or the process environment.
# Usage: deploy.sh <commit sha>, run from the directory that holds deploy/compose.prod.yaml.
set -euo pipefail

sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <40-character commit sha>" >&2; exit 2; }

compose_file=deploy/compose.prod.yaml
[ -f "$compose_file" ] || { echo "run from the directory that holds $compose_file" >&2; exit 2; }

backup_vars=(BACKUP_AGE_RECIPIENT BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_BUCKET BACKUP_KEY_ID BACKUP_KEY BACKUP_HEALTHCHECK_URL)
required=(POSTGRES_PASSWORD ALLOWED_TAILSCALE_LOGIN "${backup_vars[@]}")
declare -A seen=()
umask 077
env_tmp=$(mktemp .env.XXXXXX)
trap 'rm -f "$env_tmp"' EXIT

while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  if [[ ! "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    echo "FAIL: stdin has a line that is not KEY=value" >&2
    exit 2
  fi
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  [ "$key" != IMAGE_TAG ] || { echo "FAIL: IMAGE_TAG comes from the argument, not stdin" >&2; exit 2; }
  # Compose reads a single-quoted value literally, except that \' escapes the quote and runs on into the next line.
  [[ "$value" != *[\'\\]* ]] || { echo "FAIL: the value of $key holds a ' or a \\" >&2; exit 2; }
  [ -z "$value" ] || seen[$key]=1
  printf "%s='%s'\n" "$key" "$value" >>"$env_tmp"
done
for key in "${required[@]}"; do
  [ -n "${seen[$key]:-}" ] || { echo "FAIL: stdin lacks a value for $key" >&2; exit 2; }
done
printf "IMAGE_TAG='%s'\n" "$sha" >>"$env_tmp"
chmod 600 "$env_tmp"

# .env moves into place only once the images exist, so a bad SHA leaves the running stack's .env alone.
docker compose -f "$compose_file" --env-file "$env_tmp" pull --quiet
mv "$env_tmp" .env

compose=(docker compose -f "$compose_file" --env-file .env)

# A dump before the migration, so a bad migration costs nothing. A failed dump stops the deploy.
# No volume means the first deploy, so there is nothing to dump yet.
if docker volume inspect copilot_pgdata >/dev/null 2>&1; then
  "${compose[@]}" up -d --wait --wait-timeout 120 postgres
  deploy/backup.sh pre-deploy
else
  echo "backup skipped: no Postgres volume yet, so this is the first deploy"
fi

fail() {
  echo "FAIL: the stack did not become healthy at $sha" >&2
  "${compose[@]}" ps >&2 || true
  exit 1
}
# The ingest drain of up to 6 minutes happens before the wait starts; the job's 15-minute timeout covers both.
"${compose[@]}" up -d --wait --wait-timeout 300 --remove-orphans || fail
# nginx resolves api once at start, and a same-SHA run that recreates api leaves web unchanged.
"${compose[@]}" restart web || fail
"${compose[@]}" up -d --wait --wait-timeout 60 --no-deps web || fail

# Keeps the deployed SHA plus the two newest others. An image in use refuses removal.
pruned=0 kept=0
for image in copilot-api copilot-web copilot-jobspy; do
  listing=$(docker image ls "ghcr.io/dandutra/$image" --format '{{.CreatedAt}}|{{.Tag}}') \
    || { echo "WARN: could not list $image, so none was pruned" >&2; continue; }
  mapfile -t tags < <(printf '%s\n' "$listing" | sort -r | cut -d'|' -f2)
  others=0
  for tag in "${tags[@]}"; do
    case "$tag" in "" | "<none>") continue ;; esac
    if [ "$tag" = "$sha" ]; then kept=$((kept + 1)); continue; fi
    others=$((others + 1))
    if [ "$others" -le 2 ]; then kept=$((kept + 1)); continue; fi
    if docker image rm "ghcr.io/dandutra/$image:$tag" >/dev/null 2>&1; then pruned=$((pruned + 1)); fi
  done
done
docker image prune -f >/dev/null
echo "deployed=$sha kept=$kept pruned=$pruned"
