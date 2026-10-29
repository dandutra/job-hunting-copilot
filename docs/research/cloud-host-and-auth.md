# Cloud host and single-user auth

Research for ticket #8. All sources were read on 2026-10-29. Prices are USD unless marked EUR, and they change often, so check the source before buying.

## Summary

1. Use a DigitalOcean Basic Droplet with 2 GiB of RAM in Toronto (TOR1). It costs $12 a month, or $14.40 with weekly backups, and runs the whole Docker Compose stack unchanged.
2. Fly.io is the only PaaS with a Canadian region (Toronto). Its managed Postgres starts at $38 a month, so the stack fits the budget only with a self-run, unsupported Postgres.
3. Railway and Render fit the budget but have no Canadian region and do not run a Compose file as is. They also hide the Linux, Compose and IaC work that the cloud/ops Role family asks for.
4. Cloudflare Access's free plan covers up to 50 users, so it protects the UI for one user at $0, with One-time PIN email login and no identity provider to set up.
5. Access needs a domain on Cloudflare nameservers, and the cheapest path is Cloudflare Registrar (about $10.46 a year for .com). Tailscale Serve is a $0 option with no domain, but it only works while the phone has Tailscale connected.

## Comparison

Stack: Python worker (polls about every hour), NestJS API, web UI (static build), Postgres under 1 GB.

| Host | Monthly cost for this stack | Postgres | Always-on worker or cron | Canadian region | GitHub Actions deploy | Compose support |
|---|---|---|---|---|---|---|
| DigitalOcean Droplet | $12 for 2 GiB / 1 vCPU / 50 GiB; $14.40 with weekly backups (20%). The 1 GiB plan at $6 is likely too tight for Postgres, Node and JobSpy together (my estimate, not measured). | Self-run in Compose on the Droplet. Managed PostgreSQL starts at $15.15, which breaks the budget. | Either one. A long-running container with a scheduler, or host cron. | Yes, TOR1. Droplets and managed PostgreSQL are both available there. | Yes, with any SSH deploy step. Terraform provider `digitalocean/digitalocean` is maintained by DigitalOcean. | Native. Docker 1-Click image on the Marketplace. |
| Hetzner Cloud | EUR 5.99 excl. VAT for CX23 (2 vCPU / 4 GB / 40 GB) in Germany or Finland. In the US (Ashburn, Hillsboro) the cheapest is CPX11 at EUR 17.99, over budget. | Self-run in Compose. | Either one, as on any VPS. | No. EU, US and Singapore only. | Yes, with SSH. Terraform provider `hetznercloud/hcloud` is maintained by Hetzner. | Native. |
| Fly.io | About $8 to $10 at iad prices (my estimate): API at shared-cpu-1x 512 MB $3.69, self-run Postgres at 512 MB $3.69 plus a 1 GB volume at $0.15, hourly scheduled worker billed only while it runs. Toronto prices are not published on the page. No free tier for new orgs. | Managed Postgres Basic is $38 a month plus $0.28/GB. Unmanaged Fly Postgres "is not supported by Fly.io Support". | Both. `fly machine run --schedule hourly` runs a Machine on a fuzzy hourly cycle. | Yes, yyz (Toronto), with Managed Postgres. | Yes. Official `superfly/flyctl-actions` plus a deploy token and `flyctl deploy --remote-only`. | Partial. `[build.compose]` in `fly.toml` runs all services as containers in one Machine and ignores `volumes:` in the Compose file. |
| Railway | $5 Hobby plan, which includes $5 of usage. Usage is $10 per GB of RAM a month and $20 per vCPU a month, billed per second. Likely $5 to $10 for this stack (my estimate, not measured). | Postgres template, a single node Railway maintains. Backups are a feature you turn on. | Both. Cron runs must be at least 5 minutes apart. | No. California, Virginia, Amsterdam, Singapore. | Yes. `railway up` with a project token in `RAILWAY_TOKEN`. | Import only. Dragging a Compose file onto the canvas creates services as staged changes. IaC is `.railway/railway.ts`; `railway.json` stops being read on 2026-12-01. |
| Render | About $14: API web service $7, worker as a cron job at $0.00016 a minute with a $1 minimum, Postgres `0.1c-256mb` $6 plus $0.30/GB storage, static UI free. Hobby workspace is $0 plus compute. | Render Postgres from $6. Free Postgres expires after 30 days, so it does not work here. | Both. Background workers have no free plan. Cron jobs bill by the second. | No. Oregon, Ohio, Virginia, Frankfurt, Singapore. | Yes. A deploy hook URL called with `curl` from a workflow. | No Compose. Dockerfile or prebuilt image per service, with Blueprints as IaC. |

### Portfolio value

The VPS options show the most transferable skills: a Linux host, Docker Compose as the real deploy unit, Terraform for the server and firewall, and a GitHub Actions pipeline that builds images and deploys over SSH. Both DigitalOcean and Hetzner have vendor-maintained Terraform providers. A PaaS replaces most of that with its own config file and dashboard. Fly.io is the best PaaS for this, because `fly.toml`, Machines and volumes map to ordinary container concepts. Railway's and Render's skills transfer less.

### Datacenter IP blocking

This was not researched (a sibling ticket covers it). JobSpy's README says "All of the job board sites are aggressive with blocking" and that LinkedIn answers bursts with HTTP 429. I found no source that names a host here as worse than the others. Expect every option above to use datacenter IP ranges.

## Auth options

### Cloudflare Tunnel plus Cloudflare Access (recommended)

- The Zero Trust Free plan is $0 "forever" for up to 50 users, with log retention of up to 24 hours. Paid is $7 per user per month. One user fits the free plan.
- One-time PIN login works "as an alternative to integrating an identity provider". Access emails a PIN to addresses in the policy, and the PIN expires after 10 minutes. No Google or GitHub IdP setup is needed.
- A self-hosted Access app needs "an active domain on Cloudflare", with a full setup or a partial (CNAME) setup. Publishing an app through a Tunnel also needs a website added to Cloudflare.
- `cloudflared` makes outbound-only connections, so the server needs no open inbound ports. The firewall can then block 80 and 443.
- Cheapest domain path: Cloudflare Registrar charges the registry cost with no markup, and every domain it registers uses Cloudflare nameservers, which meets the Access requirement. A third-party price list (NameBeta, updated 2026-10-21) shows .com at $10.46 a year and .ca at $9.19. Cloudflare's own price for .ca, and whether it supports .ca, were not verified.
- Defense in depth: the API can check the `Cf-Access-Jwt-Assertion` header, so a request that bypasses Cloudflare is rejected. I did not read Cloudflare's page on that header, so treat this as unverified.

### Tailscale Serve (no domain)

- The Personal plan is $0 for up to 6 users with unlimited devices.
- Serve gives HTTPS on a `*.ts.net` name, reachable only inside the tailnet. Funnel would make it public, which defeats the point.
- Trade-off: a push alert for an A-tier Posting opens on the phone only while the Tailscale app is connected. It also adds no login screen, so whoever holds the phone has access.

### Single-user login in the API

- No third party and no domain needed, but a public IP and a TLS certificate are still needed.
- The project then owns password storage, sessions, rate limiting and brute-force lockout. It is the most code and the most risk for one user. It is better as a second layer behind Access than as the only gate.

## Open questions

- Fly.io Toronto (yyz) Machine prices. The pricing page says prices vary by region and lists only iad and ewr.
- Real memory use of the stack (Postgres, NestJS, Python with JobSpy, Node build for the UI). It decides between the $6 1 GiB and the $12 2 GiB Droplet. Measure it locally with `docker stats`.
- Railway's monthly bill for an idle Postgres and API. Its pricing is per second of use, and I found no published example for this size.
- Hetzner's static pages showed "This product is currently unavailable" on every plan when fetched without a browser. That may be a rendering artifact, or stock may be short.
- Hetzner backup pricing and whether VAT applies to a customer in Canada were not checked.
- Whether a datacenter IP from any of these hosts can scrape LinkedIn and Indeed, or whether a residential proxy is needed. A proxy would add a monthly cost to every option. This is the sibling ticket.

## Sources

All read on 2026-10-29.

- DigitalOcean Droplet pricing: https://www.digitalocean.com/pricing/droplets
- DigitalOcean managed database pricing: https://www.digitalocean.com/pricing/managed-databases
- DigitalOcean regional availability (TOR1): https://docs.digitalocean.com/platform/regional-availability/
- DigitalOcean Docker 1-Click image: https://marketplace.digitalocean.com/apps/docker
- DigitalOcean Terraform provider: https://github.com/digitalocean/terraform-provider-digitalocean (latest release v2.106.0)
- Hetzner Cloud overview and locations: https://www.hetzner.com/cloud/
- Hetzner Cost-Optimized plans: https://www.hetzner.com/cloud/cost-optimized/
- Hetzner Regular Performance plans (US prices): https://www.hetzner.com/cloud/regular-performance/
- Hetzner Terraform provider: https://github.com/hetznercloud/terraform-provider-hcloud (latest release v1.70.2)
- Fly.io pricing: https://docs.fly.io/about/pricing
- Fly.io regions: https://docs.fly.io/reference/regions/
- Fly.io Managed Postgres: https://docs.fly.io/postgres/
- Fly.io unmanaged Postgres support status: https://docs.fly.io/flyctl/postgres
- Fly.io scheduled Machines: https://docs.fly.io/machines/flyctl/fly-machine-run/
- Fly.io Compose in multi-container Machines: https://docs.fly.io/machines/guides-examples/multi-container-machines
- Fly.io GitHub Actions deploy: https://docs.fly.io/launch/continuous-deployment-with-github-actions/
- Railway pricing: https://railway.com/pricing
- Railway regions: https://docs.railway.com/reference/regions
- Railway cron jobs: https://docs.railway.com/reference/cron-jobs
- Railway PostgreSQL: https://docs.railway.com/databases/postgresql
- Railway Compose import: https://docs.railway.com/builds/dockerfiles
- Railway infrastructure as code: https://docs.railway.com/infrastructure-as-code
- Railway CLI deploys: https://docs.railway.com/cli/deploying
- Render pricing: https://render.com/pricing
- Render free tier limits: https://render.com/docs/free
- Render compute plans: https://render.com/docs/compute-plans
- Render cron jobs: https://render.com/docs/cronjobs
- Render regions: https://render.com/docs/regions
- Render Docker support: https://render.com/docs/docker
- Render deploy hooks: https://render.com/docs/deploy-hooks
- Cloudflare Zero Trust plans: https://www.cloudflare.com/plans/sase-zero-trust.md
- Cloudflare Access self-hosted app prerequisites: https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/
- Cloudflare One-time PIN: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Cloudflare Tunnel, remote-managed: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/
- Cloudflare Registrar: https://www.cloudflare.com/products/registrar/
- Cloudflare Registrar FAQ (nameservers): https://developers.cloudflare.com/registrar/faq/
- Cloudflare Registrar price list (third party, NameBeta): https://cfdomainpricing.com/
- Tailscale pricing: https://tailscale.com/pricing
- Tailscale Serve: https://tailscale.com/kb/1312/serve
- JobSpy README (blocking notes): https://github.com/speedyapply/JobSpy
