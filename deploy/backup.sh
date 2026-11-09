#!/usr/bin/env bash
# Dumps Postgres, encrypts the dump to the age public key, uploads it to the backups bucket, then pings healthchecks.io.
# Usage: backup.sh [label], where the label (default "nightly") goes into the object name.
# Settings come from the environment, or from ./.env when that file exists (deploy.sh writes it).
# It exits non-zero when the dump is empty or the upload fails, and it pings only after an upload.
set -euo pipefail

label="${1:-nightly}"
[[ "$label" =~ ^[a-z][a-z0-9-]*$ ]] || { echo "usage: backup.sh [label of lowercase letters, digits and hyphens]" >&2; exit 2; }

env_file="${BACKUP_ENV_FILE:-.env}"
if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

for name in BACKUP_AGE_RECIPIENT BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_BUCKET BACKUP_KEY_ID BACKUP_KEY BACKUP_HEALTHCHECK_URL; do
  [ -n "${!name:-}" ] || { echo "FAIL: $name is not set" >&2; exit 2; }
done
container="${BACKUP_POSTGRES_CONTAINER:-copilot-postgres-1}"
db_user="${POSTGRES_USER:-copilot}"
db_name="${POSTGRES_DB:-copilot}"

umask 077
workdir=$(mktemp -d)
dump_bytes=0 encrypted_bytes=0 uploaded=0 pinged=0
summary() { echo "label=$label dump_bytes=$dump_bytes encrypted_bytes=$encrypted_bytes uploaded=$uploaded pinged=$pinged" >&2; }
# The summary prints on every exit, so a failed run still shows how far it got.
finish() { local rc=$?; rm -rf "$workdir"; summary; exit "$rc"; }
trap finish EXIT

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# The plaintext dump sits in a mode-700 temp dir until the trap removes it.
docker exec -i "$container" pg_dump -Fc -U "$db_user" -d "$db_name" >"$workdir/dump" \
  || { echo "FAIL: pg_dump failed in container $container" >&2; exit 1; }
dump_bytes=$(wc -c <"$workdir/dump" | tr -d ' ')
[ "$dump_bytes" -gt 0 ] || { echo "FAIL: the dump is empty" >&2; exit 1; }
# A custom-format dump starts with PGDMP; anything else is an error message or the wrong program.
[ "$(head -c 5 "$workdir/dump")" = "PGDMP" ] || { echo "FAIL: the dump is not in pg_dump custom format" >&2; exit 1; }

age -r "$BACKUP_AGE_RECIPIENT" -o "$workdir/dump.age" "$workdir/dump" \
  || { echo "FAIL: age could not encrypt the dump" >&2; exit 1; }
encrypted_bytes=$(wc -c <"$workdir/dump.age" | tr -d ' ')
[ "$encrypted_bytes" -gt 0 ] || { echo "FAIL: the encrypted dump is empty" >&2; exit 1; }

key="dumps/$(date -u +%Y%m%dT%H%M%SZ)-${label}.dump.age"
# The signature covers the payload hash, and curl does not compute it for an upload.
curl --fail --silent --show-error --max-time 600 --retry 2 \
  --aws-sigv4 "aws:amz:${BACKUP_S3_REGION}:s3" --user "${BACKUP_KEY_ID}:${BACKUP_KEY}" \
  -H "x-amz-content-sha256: $(sha256_of "$workdir/dump.age")" \
  -T "$workdir/dump.age" "${BACKUP_S3_ENDPOINT%/}/${BACKUP_BUCKET}/${key}" >/dev/null \
  || { echo "FAIL: the upload to ${BACKUP_BUCKET} failed" >&2; exit 1; }
uploaded=1

# A dump that landed stays valid if the ping fails, so this only warns; the missed ping is what raises the alarm.
if curl --fail --silent --show-error --max-time 10 --retry 3 "$BACKUP_HEALTHCHECK_URL" >/dev/null; then
  pinged=1
else
  echo "WARN: the healthchecks.io ping failed" >&2
fi
echo "uploaded $key"
