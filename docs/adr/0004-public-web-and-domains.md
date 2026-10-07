# ADR-0004: Public rendering and tenant domains

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: This proposal was chosen autonomously without owner approval on 2026-10-07.

## Context

Each tenant needs an SEO-capable public site on an automatically provisioned platform subdomain and may add custom domains with managed TLS. The initial target is 20-100 organizations.

## Decision

- Use Next.js for server-rendered public sites. Keep tenant and platform management consoles as separate React/Vite apps.
- Use Cloudflare for SaaS as the initial custom-hostname and TLS adapter, with the app hosted on AWS. Platform subdomains use a wildcard DNS record and certificate.
- Use `<tenant>.<platform-domain>` as the platform-subdomain pattern. Clinic Hub is the working product name; the exact domain is intentionally TBD and must not be registered or assumed available.
- Require DNS ownership verification before issuing a custom-domain certificate. Support apex domains only where the tenant DNS provider supports flattening/ALIAS; otherwise make `www` canonical.

## Consequences and gates

- Run the planned Cloudflare-for-SaaS versus AWS CloudFront spike before production selection, including certificate lifecycle, origin security, Pakistan latency, operational cost, and apex behavior.
- Cloudflare's published included-hostname allowance fits the initial target, but pricing and limits must be rechecked before launch.
- Unknown hosts return a generic not-found response. Host resolution never grants tenant-admin access.
- No domain is purchased and no DNS or TLS is provisioned by this decision.
