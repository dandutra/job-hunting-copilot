---
type: gotcha
title: Tailnet identity guard
description: How the global API guard decides who gets in, and what a change to nginx, Serve or the routes would break.
tags: [security, deploy]
sources: ["#37"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-06T17:15:00-05:00
---

`TailnetGuard` in `apps/api/src/auth/` is a global guard. It answers 401 unless `Tailscale-User-Login` equals `ALLOWED_TAILSCALE_LOGIN`, and 403 for a `POST`, `PUT`, `PATCH` or `DELETE` whose `Origin` host differs from the `Host` header. A request with no `Origin` passes, as a CLI sends it.

- nginx strips `/api`, so the API sees plain routes and "every `/api/` route" means every route except `@Public()` ones. `/health` is the only public one. A new route is guarded by default.
- The Origin check compares hostnames, not ports, because nginx passes `$host`, which has no port. It works only while nginx keeps `proxy_set_header Host $host`. If nginx stops forwarding the browser's host, every browser `POST` gets a 403.
- nginx must also keep forwarding `Tailscale-User-Login`. Without it every request gets a 401.
- `AuthModule` throws at boot when `ALLOWED_TAILSCALE_LOGIN` is empty or blank. In production the value comes from the `production` environment secret of the same name, and `deploy.sh` fails without it. CI and the image build set a placeholder, because Compose's `:?` needs one. Tests set a login in `apps/api/test/test-env.ts`.
- In local dev the Vite proxy adds `Tailscale-User-Login` from the root `.env`, standing in for Serve. Set `ALLOWED_TAILSCALE_LOGIN` there to any value, or the API won't start. The proxy sends that login on every request, so a dev server started with `--host` lets any device on the LAN through.
- `write-openapi.ts` builds `AppModule`, so it sets a placeholder login when none is set. CI has none.
- The login comparison is exact and case-sensitive. Copy it from the Tailscale admin console as Serve sends it.
- The log keeps the rejected login, method and path. It never keeps the body.
- Swagger's `/docs` routes bypass the guard because Swagger registers them on the HTTP adapter. They are served only outside production.
- Open: Tailscale's docs don't say whether Serve overwrites a forged `Tailscale-User-Login`. Run the live check from the Droplet, a `tag:server` device, against `GET /api/me` with your login forged in the header. A 200 there means stop and report on #37. `/me` returns the allowed login and exists so a guarded route is always there to check.
