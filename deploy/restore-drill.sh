#!/usr/bin/env bash
# Run on the Mac, never on the Droplet: it needs the age private key and a bucket key that can read.
# Downloads the latest dump, decrypts it, restores it into a throwaway Postgres container and prints row counts
# for the tables that can't be fetched again. It exits non-zero on a failed restore, a missing table or 0 rows.
#
# Required: BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_BUCKET, RESTORE_KEY_ID, RESTORE_KEY (a key with readFiles
# and listFiles, not the Droplet's), and RESTORE_AGE_IDENTITY_FILE (the age private key).
# Optional: DRILL_TABLES (space-separated), DRILL_POSTGRES_IMAGE, RESTORE_DUMP_KEY (an object name instead of the latest),
# and RESTORE_SAVE_DUMP (a path to keep the decrypted dump at, for a real restore; it holds personal data).
set -euo pipefail

for name in BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_BUCKET RESTORE_KEY_ID RESTORE_KEY RESTORE_AGE_IDENTITY_FILE; do
  [ -n "${!name:-}" ] || { echo "FAIL: $name is not set" >&2; exit 2; }
done
[ -f "$RESTORE_AGE_IDENTITY_FILE" ] || { echo "FAIL: $RESTORE_AGE_IDENTITY_FILE does not exist" >&2; exit 2; }
# Labels and Applications have no table yet; add them here when they do.
read -r -a tables <<<"${DRILL_TABLES:-master_profile_version merge_log_entry tailored_resume}"
image="${DRILL_POSTGRES_IMAGE:-postgres:17}"
endpoint="${BACKUP_S3_ENDPOINT%/}"

umask 077
workdir=$(mktemp -d)
container="copilot-restore-drill-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$workdir"' EXIT

s3() {
  curl --fail --silent --show-error --max-time 600 \
    --aws-sigv4 "aws:amz:${BACKUP_S3_REGION}:s3" --user "${RESTORE_KEY_ID}:${RESTORE_KEY}" "$@"
}

# Object names start with a UTC timestamp, so the last one in listing order is the newest.
echo "==> Listing dumps in ${BACKUP_BUCKET}"
keys=() token=""
while :; do
  if [ -n "$token" ]; then
    page=$(s3 -G "${endpoint}/${BACKUP_BUCKET}" --data-urlencode "list-type=2" --data-urlencode "prefix=dumps/" \
      --data-urlencode "continuation-token=${token}")
  else
    page=$(s3 -G "${endpoint}/${BACKUP_BUCKET}" --data-urlencode "list-type=2" --data-urlencode "prefix=dumps/")
  fi
  while IFS= read -r k; do [ -z "$k" ] || keys+=("$k"); done < <(printf '%s' "$page" | grep -o '<Key>[^<]*</Key>' | sed -e 's/<Key>//' -e 's#</Key>##')
  token=$(printf '%s' "$page" | grep -o '<NextContinuationToken>[^<]*</NextContinuationToken>' | sed -e 's/<[^>]*>//g' || true)
  [ -n "$token" ] || break
done
echo "found=${#keys[@]}"
[ "${#keys[@]}" -gt 0 ] || { echo "FAIL: the bucket holds no dumps" >&2; exit 1; }
latest="${RESTORE_DUMP_KEY:-$(printf '%s\n' "${keys[@]}" | sort | tail -n 1)}"

echo "==> Downloading and decrypting ${latest}"
s3 -o "$workdir/dump.age" "${endpoint}/${BACKUP_BUCKET}/${latest}"
age -d -i "$RESTORE_AGE_IDENTITY_FILE" -o "$workdir/dump" "$workdir/dump.age"
[ -s "$workdir/dump" ] || { echo "FAIL: the decrypted dump is empty" >&2; exit 1; }

[ -z "${RESTORE_SAVE_DUMP:-}" ] || { cp "$workdir/dump" "$RESTORE_SAVE_DUMP"; echo "decrypted dump kept at $RESTORE_SAVE_DUMP"; }

echo "==> Restoring into a throwaway ${image} container"
docker run -d --name "$container" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill "$image" >/dev/null
ready=0
for _ in $(seq 1 60); do
  # The image's init server restarts once, so a ready check can pass early; the SELECT proves the final server.
  if docker exec "$container" psql -U postgres -d drill -tAc 'SELECT 1' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo "FAIL: the throwaway Postgres did not start" >&2; exit 1; }
docker exec -i "$container" pg_restore -U postgres -d drill --no-owner --no-privileges --exit-on-error <"$workdir/dump" \
  || { echo "FAIL: pg_restore failed" >&2; exit 1; }

echo "==> Row counts"
total=0 failed=0
for table in "${tables[@]}"; do
  [[ "$table" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "FAIL: bad table name $table" >&2; exit 2; }
  if ! count=$(docker exec "$container" psql -U postgres -d drill -tAc "SELECT count(*) FROM ${table}"); then
    echo "    ${table}: MISSING" >&2
    failed=$((failed + 1))
    continue
  fi
  printf '    %-24s %s\n' "$table" "$count"
  total=$((total + count))
done
echo "dump=${latest} tables=${#tables[@]} failed=${failed} total_rows=${total}"
[ "$failed" -eq 0 ] || { echo "FAIL: a table is missing from the restore" >&2; exit 1; }
[ "$total" -gt 0 ] || { echo "FAIL: the restore holds 0 rows" >&2; exit 1; }
echo "==> Restore drill OK"
