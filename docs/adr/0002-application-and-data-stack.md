# ADR-0002: Application and data stack

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: This proposal was chosen autonomously without owner approval on 2026-10-07.

## Context

The product requires a custom TypeScript modular monolith, managed PostgreSQL, strict tenant isolation, public SSR, API workers, and independent deployability of app entrypoints without premature microservices.

## Decision

- Use npm workspaces in the existing npm repository, keeping the current root package as the demo
	until it can be intentionally retired. Add bounded modules and shared contracts under `apps/` and
	`packages/` without moving demo files in this slice.
- Use Fastify for the API and worker composition roots.
- Use PostgreSQL with SQL-first migrations, Kysely for typed queries, and Zod for runtime boundary schemas. Generate OpenAPI from shared contracts.
- Use AWS CDK (TypeScript) for infrastructure as code; run API and worker services on ECS Fargate. Use SQS for queued work, S3 for media, ElastiCache for cache/pub-sub, Secrets Manager and KMS for secrets/encryption, and CloudWatch plus OpenTelemetry for operations.
- Keep the tenant and platform consoles as React/Vite applications. Use Next.js for the server-rendered public site.
- PostgreSQL row-level security and composite tenant constraints remain mandatory; framework selection does not replace them.

## Consequences and gates

- Keep modules behind public facades and use a transactional outbox for cross-module side effects.
- Local development uses disposable PostgreSQL and local service adapters; it must not require production credentials.
- Validate package-manager, CI, and migration tooling versions in the foundation PR. No vendor service is provisioned by this decision.
