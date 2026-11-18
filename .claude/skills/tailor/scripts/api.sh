#!/usr/bin/env bash
# The /tailor calls to the copilot API, so a run never retypes a curl line.
#   api.sh submit <Posting ID> <draft.json>   POST a draft; prints the body (a 422 lists failing lines)
#   api.sh get <draft ID>                     GET a stored draft with its lines, Facts and verdicts
# Run from the repo root: COPILOT_API_URL comes from .env. Requests send no Origin and need no token.
set -euo pipefail
base=$(grep -m1 '^COPILOT_API_URL=' .env | cut -d= -f2- | tr -d "\"'\r" || true); base=${base%/}
[[ -n $base ]] || { echo "COPILOT_API_URL is not set in .env" >&2; exit 1; }
cmd=${1:-}
case $cmd in
  submit)
    [[ ${2:-} =~ ^[0-9]+$ && -f ${3:-} ]] || { echo "usage: api.sh submit <Posting ID> <draft.json>" >&2; exit 2; }
    curl -sS --fail-with-body -X POST "$base/postings/$2/tailored-resumes" \
      -H 'Content-Type: application/json' -d @"$3"
    ;;
  get)
    [[ ${2:-} =~ ^[0-9]+$ ]] || { echo "usage: api.sh get <draft ID>" >&2; exit 2; }
    curl -sS --fail-with-body "$base/tailored-resumes/$2"
    ;;
  *)
    echo "usage: api.sh submit <Posting ID> <draft.json> | api.sh get <draft ID>" >&2; exit 2
    ;;
esac
echo
