# Clinic Hub authoritative development plan and gap analysis

Date: 2026-10-06
Branch reviewed: `feature/clinic-hub-public-directory`
Status: authoritative for all new development

This document consolidates the completed demo backlog from `IMPROVEMENT_PLAN.md`, the proposed
production architecture from `PLATFORM_PLAN.md`, and the evidence-backed repository gap analysis.
Those two older documents are retained as source/history, but future agents and development tasks
must use this file as the single execution plan.

## Task-start priority and consent protocol

Every agent or development tool must read this document completely before changing code, dependencies,
schemas, infrastructure, external services, or generated artifacts.

At the start of each implementation task:

1. Map the request to a priority and backlog item in this document.
2. Identify the earliest unfinished prerequisite and state the recommended next work to the user.
3. If the request follows the dependency order, continue according to the active routing mode.
4. If the request skips a prerequisite, conflicts with the target architecture, extends the demo instead
   of the replacement platform, or introduces out-of-scope clinical data, stop before editing or
   delegating. Explain the consequence and ask: **“The plan recommends [priority] first because
   [reason]. Do you want me to proceed with [requested override] anyway?”**
5. Continue with the override only after the user gives an affirmative reply. Record the approved
   override and any skipped prerequisite in the checkpoint section when work is completed.

This extra confirmation is not required for read-only analysis, repository inspection, planning,
urgent security or data-loss diagnosis, or a request that already explicitly acknowledges and approves
the plan deviation. It never authorizes deployments, production access, destructive data changes,
billing, account changes, or external communications; those still require their own explicit approval.

## Document reconciliation

- `IMPROVEMENT_PLAN.md` describes the localStorage demo. Its Phase 0-3 work and browser automation
  checklist are complete. The demo should now be preserved, not expanded into production.
- `PLATFORM_PLAN.md` supplies the agreed product scope, production architecture, external constraints,
  data model and delivery phases. Its direction is adopted here, with the repository audit findings
  used to refine priority and prerequisites.
- Where the old documents differ, this document wins. In particular, demo patients, visit notes and
  clinical specialty-module workflows are not part of the production product.

## Product definition and boundaries

Clinic Hub is a TypeScript SaaS for an initial 20-100 Pakistani clinic and hospital tenants. A tenant
may have one or many locations, self-onboard, publish a public website on a platform or custom domain,
manage its service catalog, practitioners and schedules, receive lightweight appointment requests and
bookings, and communicate through its own tenant- or location-specific WhatsApp number. Platform staff
operate tenants from a separate console; tenant users see only their authorized tenant and locations.

### In scope


### Out of scope

  billing. A separate HIS owns these concerns.

Production contact data is limited to name, E.164 phone, optional email, preferred language, consent
evidence and an optional `external_patient_ref`. Message bodies are sensitive and require tenant
scoping, encryption, retention controls and log redaction.

Platform plans and clinic services must remain separate concepts: plans/add-ons/entitlements belong to
`billing`; consultations/procedures/packages belong to `catalog`.

## Agreed architecture baseline

| Area | Direction | Status before implementation |
|---|---|---|
| Shape | Custom TypeScript modular monolith; one API process and one worker entrypoint | Agreed |
| Infrastructure | AWS managed services proposed; Mumbai (`ap-south-1`) approved for dev/staging only; production region open | Proposed; see ADR-0001 |
| Tenancy | Pooled database/schema with `tenant_id`, composite tenant keys and forced PostgreSQL RLS | Proposed in ADR-0002 |
| API | REST/OpenAPI from shared schemas with typed clients and stable webhook/HIS contracts | Proposed in ADR-0002 |
| Backend/data | Fastify, PostgreSQL, Kysely, SQL-first migrations, and Zod/OpenAPI contracts | Proposed in ADR-0002 |
| Async | Transactional outbox relayed to a managed queue with ordered processing and dead letters | Proposed in ADR-0002 |
| Identity | Cognito accepted for MVP; RBAC and entitlement enforcement remain in our code | Cognito accepted; detailed design proposed in ADR-0003 |
| Frontends | Separate React/Vite consoles; Next.js server-rendered public application | Proposed in ADR-0002/0004 |
| Vendors | Queue, storage, secrets, edge, WhatsApp, billing and AI behind ports | Required |
| Delivery | Infrastructure as code, development/staging/production environments and gated CI | Required |

`scheduling`, `contacts`, `billing`, `site`, `domains`, `messaging`, `notifications`, `platform-admin`
import another module's internals.
### External decisions and constraints to re-verify
- Start Meta Business Verification and App Review as a Phase 0 long-lead activity.
- Webhooks require raw-body signature verification, fast acknowledgement, deduplication and async work.
- WhatsApp logistics only: never send diagnoses, prescriptions or results.
- Stripe is not assumed for Pakistan. Start with manual invoices and bank transfer/Raast unless the
  billing ADR selects a local gateway.
- Custom-domain design must support DNS ownership verification and managed certificate lifecycle;
  spike Cloudflare for SaaS against the selected cloud edge before committing.
- Re-check provider pricing, policies, regional availability and API versions immediately before the
  relevant implementation begins; dated research is evidence, not a permanent guarantee.

## Executive assessment

The current application is a polished local demo and a useful source of reusable UI, domain utilities,
and tests. It is not a production foundation for the agreed multi-tenant clinic and hospital SaaS.

The main architectural mismatch is that the current product is one React SPA backed by a single
browser `localStorage` snapshot. The target is a custom TypeScript modular monolith with a server API,
worker, PostgreSQL with forced row-level security, separate platform/tenant/public applications,
transactional authorization and entitlements, and managed infrastructure.

Preserve the demo as a reference branch or tag. Port selected assets into the production platform;
do not continue expanding `AppData` or treat `AppStore` as the production persistence/API contract.

## Strengths to preserve

- Explicit organization and clinic keys throughout the demo domain model.
- Pure reducers with tenant-match assertions and focused isolation tests.
- Declarative specialty registry and reusable availability utilities.
- Public host and branch-route resolution, including production-safe host override behavior.
- Clear public/admin route separation and lazy-loaded admin pages.
- Approved visual language, responsive table treatment, labeled forms, native availability dialog,
  save-state announcements, and reduced-motion support.
- Public directory, doctor profile, appointment-request flow, CSV workflow concepts, Playwright flows,
  axe usage, and visual baselines.

## Gap summary

| Area | Current state | Required production state | Priority |
|---|---|---|---|
| Authentication and authorization | Seeded membership picker; role checks hide links only; direct routes and mutations are not protected | OIDC-backed identity, server sessions, fail-closed route authorization, tenant/location role assignments, authorization matrix tests | P0 |
| Tenant isolation | All tenants and private data live in one browser object; filtering happens in client code | Shared PostgreSQL database with `tenant_id`, composite tenant foreign keys, forced RLS, restricted roles, `withTenant()` transactions, isolation tests | P0 |
| Public data boundary | Public provider loads the full `AppData`, including patients, memberships, notes, and audit events | Narrow published-site read model containing public organization, location, service, practitioner, and schedule data only | P0 |
| Clinical scope | Patients, DOB, notes, visit notes, queues, and clinical specialty modules are included | Remove clinical records; use minimal contacts/consents and optional opaque HIS references | P0 |
| Modular monolith | One Vite SPA organized by horizontal frontend folders | API, worker, tenant console, platform console, SSR public app, shared contracts/UI, bounded modules, vendor ports, outbox | P0 |
| Tenant and locations | Organization/clinic model and clinic switcher exist | Tenant lifecycle, locations, invitations, tenant/location roles, platform operator controls, suspension/closure | P1 |
| Practitioners | A practitioner belongs to exactly one clinic | Practitioner person plus many location assignments, registration number, verification and publication state | P1 |
| Specialties and services | Declarative specialties drive clinical modules | Keep specialties as reference data; add service categories, services, location offerings, practitioner services, duration and pricing metadata | P1 |
| Scheduling | Weekly availability and per-day overrides | Location-aware schedules, exceptions, holidays, service duration, slot generation, holds and concurrency controls | P1 |
| Appointments | Request with preferred weekday and four statuses | Confirmed appointments, time slots, service, status history, reschedule/cancel, reminders and database non-overlap constraint | P1 |
| Contacts and HIS | Patient records are owned locally; no integration seam | Contacts/consents, `external_patient_ref`, stable REST/OpenAPI contracts, idempotency and versioned webhooks/adapters | P1 |
| Plans and entitlements | Absent | Versioned plans, subscriptions, add-ons, overrides, usage events, invoices and transactional entitlement enforcement | P2 |
| Public websites | Good SPA directory and doctor profile | SSR per host, published read model, organization/location content, tenant branding, canonical metadata, dynamic sitemap/robots and cache purge | P2 |
| Domains and TLS | One editable primary-domain string and client host resolver | Platform subdomain, DNS ownership verification, certificate lifecycle, edge adapter, reconciler, canonical state and entitlement checks | P2 |
| Self-onboarding | Existing memberships and an add-clinic form | Registration, email verification, plan selection, first location, branding/services/practitioners/schedules, preview, verification and publish state machine | P2 |
| WhatsApp | Raw clinic click-to-chat URL | Embedded Signup, tenant/location connections, encrypted tokens, signed/deduplicated webhooks, queues/outbox, templates, consent, reminders and metering | P3 |
| Inbox and automation | Absent | Conversations, assignment, notes, unread state, SSE updates, handoff state machine and deterministic booking flows | P3 |

## Confirmed implementation risks

### P0: security and privacy

1. The admin membership guard checks only that a membership object exists. Permission checks are used
   for navigation visibility, not route or mutation enforcement.
2. The login and organization switcher expose seeded memberships and organizations, allowing demo
   impersonation across tenants.
3. Public routes load the same full data snapshot as admin routes. Client-side filtering is not a
   privacy boundary.
4. Whole-snapshot saves allow stale public or admin tabs to overwrite unrelated changes.
5. Client-created audit events are mutable, resettable, and unsuitable as a production audit trail.
6. Public appointment requests have no bot protection, rate limit, consent evidence, E.164 phone
   normalization, idempotency, or transactional concurrency handling.

### P1: data correctness and boundary validation

1. Historical schema migrations jump directly to the newest version without applying each intermediate
   migration. Failed reads silently fall back to demo seed data, which can appear as data loss.
2. Practitioner CSV export does not escape spreadsheet-formula prefixes.
3. URL inputs are trimmed but not validated against HTTPS and approved-host allowlists.
4. Image upload trusts the browser MIME value, accepts SVG, and does not sniff or re-encode content.
5. The current audit context can attribute tenant-switch events to the previous context.

### P1: UI and accessibility

1. English specialty chips expose internal IDs such as `general_medicine` instead of display labels.
2. Mobile admin navigation stacks the complete sidebar before page content and will not scale as more
   modules are introduced.
3. Organization, selected-location website, regional, governance and add-location controls are mixed
   into one long settings page and one sequential save flow.
4. Urdu support is partial: the document language/direction is not updated and several public strings
   remain English.
5. The language chooser is a custom dialog without complete focus, Escape, or focus-restoration behavior.
6. No explicit skip link or design-system `:focus-visible` treatment exists.
7. The public clinic contact grid remains two-column on narrow screens and compresses contact details.
8. Accessibility automation covers only one English public-directory state; admin, Urdu, keyboard,
   modal, error and mobile-navigation states are not covered.

## Development priority

### Decisions and external launch gates

All seven ADRs were initially chosen autonomously without owner approval and are marked Proposed.
Cognito is accepted for the MVP, and Mumbai is approved for development/staging only. Other proposals
may guide reversible local foundation work, but are not production approvals. Keep open items as gates
before production provisioning, public launch, billing, or real patient data.

- [ ] AWS is the proposed cloud provider.
- [x] Mumbai (`ap-south-1`) approved for development and staging only.
- [ ] Production region: compare Mumbai with UAE (`me-central-1`) for Pakistan latency, data residency,
   and Pakistani clinic/regulator views of health data hosted in India before storing real patient data.
- [ ] Single-region deployment with tenant disclosure remains a proposed default; approve the
   production disclosure and backup-region policy after the region comparison.
- [x] Cognito accepted for MVP; keep it behind the application-owned identity interface.
- [ ] Fastify, PostgreSQL, Kysely, SQL migrations and Zod/OpenAPI remain proposed stack choices.
- [ ] Next.js public SSR and full Urdu RTL remain proposed; Cloudflare for SaaS is preferred pending edge spike.
- [ ] Use `<tenant>.<platform-domain>`; Clinic Hub is the working brand, exact domain remains TBD.
- [ ] Manual invoice plus bank transfer/Raast remains proposed; accountant must confirm tax fields.
- [ ] Meta Tech Provider/Embedded Signup v4 remains proposed; validate Pakistani tenant payment
   feasibility with a pilot before promising self-service WhatsApp.
- [ ] Manual first-publish verification and lifecycle/suspension policies remain proposed.
- [ ] Confirm production-region disclosure and backup-region policy after the region comparison.
- [ ] Owner to define plan tiers, entitlement limits and prices before subscription launch.

The proposals and gates are recorded in `docs/adr/0001` through `docs/adr/0007`.

### P0 — Foundation and hard boundaries

Do this before adding business features.

P0 may add `fastify`, `@fastify/cookie`, `@fastify/swagger`, `jose`, `zod`, `kysely`, and `pg`, plus
`@types/pg` and `tsx` for development. Reuse root TypeScript/Vitest/Vite/React tools. Add Next.js for
the public-app shell. Use npm workspaces to preserve the existing lockfile and root demo. Add
infrastructure-provider SDKs only in the phase that first uses them.

P1 may add `oidc-client-ts` for standard Authorization Code + PKCE login in the tenant and platform
consoles. OIDC state and temporary tokens must use session storage only; the API exchanges a verified
access token for its own HttpOnly server session.

- [x] Preserve the demo on `feature/clinic-hub-public-directory`; retain it as the reference branch.
- [x] Record selected architecture defaults and unresolved launch gates in `docs/adr/`.
- [x] Create the target monorepo structure with `apps/api`, `apps/worker`, `apps/web-console`,
   `apps/web-platform`, `apps/web-public`, `packages/shared`, `packages/ui` and infrastructure code.
- [x] Establish shared configuration, structured redacted logging, error contracts, health checks,
   OpenAPI generation and graceful shutdown.
- [x] Add PostgreSQL migrations, separate migration/application roles, forced RLS, composite tenant
   constraints and the transaction-scoped `withTenant()` wrapper.
- [x] Add the RLS catalog check, two-tenant isolation suite and authorization-matrix test to CI.
- [x] Integrate identity, sessions, CSRF protection, MFA for platform staff, invitations and the permission
   catalog with fail-closed route guards.
- [x] Add server-side append-only audit events and security events.

**P0 exit condition:** two seeded tenants cannot read or write each other's data through any tested
path; platform and tenant users authenticate through separate trusted boundaries; public code receives
no private tenant data.

**Production patient-data gate:** do not store real patient data until the production-region comparison,
residency review, and region/backup decision are complete. Mumbai is dev/staging only.

The local identity boundary is implemented and tested with configurable tenant/platform OIDC issuers,
separate session stores/cookies, and platform MFA claims. Actual Cognito app-client configuration and
first platform-staff provisioning remain deployment prerequisites; no identity provider or cloud
resource was created in this P0 slice.

### P1 — Tenant core, catalog and booking foundation

The P1 browser consoles may use `oidc-client-ts` for Authorization Code + PKCE. Keep temporary tokens
in session storage, exchange the access token for a server session, and keep tenant/platform issuers
and clients separate.

- [x] Implement tenants, locations, lifecycle states, memberships, invitations and scoped role assignments.
- [x] Build the initial platform operator console for tenant listing, creation, lifecycle transitions,
   cross-tenant search, and audit/security-event viewing.
- [x] Add time-boxed, reasoned, audited, read-only support impersonation. Platform staff cannot mutate
   tenant data through support access; tokens are hashed, expire after 15 minutes, and are revocable.
- [x] Add production minimal contacts scoped to a location, E.164 phone and optional email/language/
   opaque `external_patient_ref`; record append-only communication-consent evidence by channel and
   purpose. Keep demo `Patient` and `VisitNote` data isolated to the preserved localStorage reference.
- [x] Implement tenant-scoped practitioner identities with multi-location assignments, registration
   authority/numbers, branch-specific verification, and per-location publication state.
- [x] Implement tenant-wide service categories/definitions, location-specific offerings with duration
   and minor-unit price metadata, and same-location practitioner-service assignments.
- [x] Implement location-timezone schedules and date exceptions, slot generation, expiring holds,
   appointment requests/confirmation, append-only status history, reschedule/cancel and the database
   double-booking constraint.
- [x] Port location-scoped practitioner CSV import/export server-side with preview validation, atomic
   commit, formula escaping and shared boundary schemas.
- [x] Publish stable versioned OpenAPI contracts, shared HIS appointment request/event schemas, and
   tenant/location-scoped idempotent appointment creation; no external HIS connection is enabled yet.

**P1 exit condition:** authorized staff can configure locations, services, practitioners and schedules
and create bookings without cross-tenant access or double-booking.

### P2 — Commercial model, websites, domains and onboarding

- [x] Implement versioned plans, entitlements, subscriptions, add-ons, overrides, usage and billing ports.
- [x] Enforce every limit transactionally; downgrades must never delete tenant data.
- [ ] Build the tenant site model, constrained branding/theme contract, publish/unpublish workflow and
   denormalized public read model.
- [ ] Build the SSR public app with per-host caching, canonical URLs, structured data, dynamic sitemap and
   robots responses, CSP and cache invalidation.
- [ ] Implement platform subdomains and the custom-domain DNS/certificate lifecycle with reconciliation.
- [ ] Build the resumable onboarding state machine, plan selection, trial/activation flow, completion
   checklist and platform verification queue.

**P2 exit condition:** a new tenant can register, configure its first location and website, pass
verification, and publish on a TLS-enabled platform or verified custom domain.

### P3 — WhatsApp, inbox and automation

- [ ] Implement the `WhatsAppProvider` port and Meta Embedded Signup flow.
- [ ] Add location/default connections and encrypted token references.
- [ ] Add signature-verified webhook ingestion, raw-event persistence, deduplication, queue/outbox,
   ordered processing, retries and dead-letter handling.
- [ ] Add approved templates, service-window enforcement, consent/opt-out handling, reminders and usage
   metering.
- [ ] Build the staff inbox, filters, assignment, internal notes, unread counts, media and SSE updates.
- [ ] Add the bot/human handoff state machine and deterministic booking, reschedule, cancel and clinic-info
   flows in English and Urdu.
- [ ] Add the optional AI assistant only after deterministic workflows, guardrails, spend caps and
   synthetic evaluation gates are established.

**P3 exit condition:** a pilot tenant connects its own WhatsApp number and patients can complete a
booking workflow with reliable reminders and safe staff handoff.

## The next development slice

P2 billing is in place: versioned plans, entitlements, subscriptions, add-ons, overrides, usage,
manual invoices, and transactional limits. Plan versions do not store prices. Operator invoices use
an amount entered at issue time. Owner-defined tiers and prices remain a prerequisite to charging
tenants. Next priority is the tenant site model, branding contract, and publish workflow. Do not add
clinical records, diagnoses, prescriptions, or visit notes.

## Validation baseline

At the time of this review:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed: 24 files and 65 tests.
- Playwright was not rerun because the evidence suite regenerates tracked screenshots. Existing E2E
  definitions, visual baselines and evidence screenshots were inspected.

## Current checkpoint and approved overrides

- The localStorage demo improvement backlog is complete.
- The demo reference branch was fast-forward merged into local `main` at `0864a8e` on 2026-10-07;
   the reference branch remains available. No push was performed.
- Active work branch: `feature/platform-p0-foundation`.
- ADR-0001 through ADR-0007 are Proposed; Cognito is accepted for MVP and Mumbai is approved for
   development/staging only. Production region remains open.
- P0 local foundation is complete: npm workspaces, API/worker/console/public shells, OIDC/session/RBAC
   boundaries, invitations, append-only audit/security events, PostgreSQL RLS, and CI integration checks.
- Validation: demo 65 tests; API 187 tests; PostgreSQL integration 19 tests; all workspace and demo
   builds passed; lint/typecheck passed; npm audit reported zero vulnerabilities.
- P1 tenant lifecycle/location API, scoped memberships and invitations, tenant/platform consoles,
   tenant provisioning, lifecycle transitions, search, and audit viewing are implemented locally.
- Controlled support access is limited to read-only snapshots. Contacts, consent events, practitioner
   assignments, practitioner profiles, location offerings, and practitioner-service assignments are
   scoped by forced tenant/location RLS. Consent evidence restricts physical contact/location deletion
   until an explicit retention/anonymization workflow is designed. Schedules and booking lifecycles use
   timezone-aware slots, append-only history, and database-enforced overlap prevention.
- OpenAPI contract v1.0.0 and shared HIS appointment request/event schemas are published; appointment
   creation accepts tenant/location-scoped idempotency keys. No external HIS connection is enabled.
- No production resources, real domains, Meta accounts, billing, or patient data were touched.
- P2 billing slice is implemented locally. Plans, immutable versions, entitlements, add-ons,
   overrides, subscriptions, usage events, and the manual `BillingProvider` are in the API. Location,
   practitioner, and staff-seat creates enforce limits inside the same transaction. Domain, WhatsApp
   connection, and storage limits require the caller to pass live usage until those modules exist.
   Downgrades change the plan version and do not delete tenant rows. No catalog prices are stored.
- Validation for this slice: API unit tests 190 passed; PostgreSQL integration tests 21 passed;
   migration `0032_plans_entitlements.sql` applied on the local test database.
- Next recommended priority: P2 tenant site model and publish workflow. Owner input on pricing and
   plan tiers remains a prerequisite to subscription launch.
- Cognito app-client setup and initial platform-staff provisioning remain explicit identity deployment
   gates; production region/data-residency remains the real-patient-data gate.
- Proposals were initially selected autonomously without owner approval; no priority overrides or skipped
   prerequisites.
- Approved priority overrides: none.
- Deliberately skipped prerequisites: none.

