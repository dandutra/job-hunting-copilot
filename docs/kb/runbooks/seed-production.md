---
type: runbook
title: Seed the production database
description: How to run the Watched company seed against production from the Mac, through an SSH tunnel, after checking that no seed name would split a Company.
tags: [ops, companies, ingestion]
sources: ["#73", "#92"]
generated:
  by: claude-opus-5-5
  at: 2026-11-09T16:00:00-05:00
---

No deploy runs the seed. Run it by hand whenever `docs/research/watched-companies.csv` or the seed code changes on `main`. Until it runs, production polls only the boards from the last seed. The first seed ran on 2026-11-09, after #73.

The seed cannot run on the Droplet. The production image has no `tsx` and no `src/`, and Postgres is reachable only inside Docker. So it runs from the Mac against the production database through a tunnel. It only adds and updates rows, so running it twice is safe, and a run that stops partway can simply be repeated.

Every Compose command on the Droplet needs `--env-file .env` (see [Deploy, roll back and rotate secrets](deploy.md)). The commands below define `PSQL` once:

```sh
PSQL='cd ~/copilot && docker compose -f deploy/compose.prod.yaml --env-file .env exec -T postgres psql -U copilot -d copilot -v ON_ERROR_STOP=1'
```

## 1. Check for name splits

The matcher creates a Company for every employer name it sees, so production already holds Companies that JobSpy named. The seed reuses a Company only when the normalized names match exactly ([Company names and Watched boards](../gotchas/company-names-and-watched-boards.md)). On 2026-11-09, JobSpy had made "TD", and the seed's "TD Bank" would have become a second Company.

- List the names with `echo "SELECT id, name FROM company WHERE ats IS NULL ORDER BY name;" | tailscale ssh deploy@copilot "$PSQL"`, and compare them with the CSV's `company` column.
- For each employer that JobSpy named differently, add the seed's name as an alias of the existing Company first. The `normalized_name` must be exactly what `normalizeName` returns, so print it from the repo root:

  ```sh
  pnpm --dir apps/api exec tsx -e 'import { normalizeName } from "./src/companies/normalize-name"; console.log(normalizeName("TD Bank"))'
  ```

  Then insert the alias. `<company id>` is the id of the existing Company from the list above. Look it up each time, because ids differ between databases. For TD on 2026-11-09 it was 10.

  ```sh
  echo "INSERT INTO company_alias (company_id, name, normalized_name) VALUES (<company id>, 'TD Bank', 'td bank');" | tailscale ssh deploy@copilot "$PSQL"
  ```

- A long name in `SEED_ALIASES` (for example "Royal Bank of Canada") that already belongs to a different Company makes the seed throw. Those two Companies need merging first, which is its own decision.

## 2. Open a tunnel

Find the Postgres container's address, then forward a local port to it in a second terminal and leave it open. Tailscale SSH accepts the normal `ssh` client.

```sh
tailscale ssh deploy@copilot 'cd ~/copilot && docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" $(docker compose -f deploy/compose.prod.yaml --env-file .env ps -q postgres)'
ssh -N -L 15432:<that IP>:5432 deploy@copilot
```

## 3. Run the seed from `main`

Wait until the Deploy run for the `main` commit you pull has finished. Its `migrate` step must have applied any new migration before the seed writes to the schema. On the Mac, `pnpm install` and `pnpm --dir apps/api exec prisma generate` must have run since the last pull, because the seed uses the generated Prisma client ([Toolchain version pins](../gotchas/toolchain-version-pins.md)).

```sh
git checkout main && git pull
pnpm install && pnpm --dir apps/api exec prisma generate
DATABASE_URL='postgresql://copilot:<POSTGRES_PASSWORD>@localhost:15432/copilot' pnpm --dir apps/api exec prisma db seed
```

The password is in the password manager. A `DATABASE_URL` set in the shell wins over the one in the local `.env`, because `process.loadEnvFile` never overrides a variable that is already set. The run prints `Seeded: <rows> rows, <companies> companies, <watched> watched`. The first run gave 99 rows, 296 companies and 63 watched. Close the tunnel afterwards.

## 4. Check it

```sh
echo "SELECT ats, count(*) FROM company GROUP BY ats ORDER BY ats;" | tailscale ssh deploy@copilot "$PSQL"
```

The counts per ATS must match the verified rows in the CSV whose ATS is pollable. A name you aliased in step 1 must show its board on the old Company id, not on a new one. After the next ingest tick, `docker compose ... logs --since=2h ingest` shows each adapter's dropped-row counts and any faults. The first Workday poll after a seed is slow, because every in-area row needs a detail call.
