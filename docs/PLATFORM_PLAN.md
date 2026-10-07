# Clinic Hub platform plan (v2, historical source)

Status: consolidated into [GAP_ANALYSIS.md](GAP_ANALYSIS.md) on 2026-10-06. Retained as detailed
architecture source and decision history; it is no longer the execution checklist.

`docs/GAP_ANALYSIS.md` is the single authoritative plan for all new work. The localStorage demo stays
as the reference prototype and is replaced, not extended. This document preserves the detailed design,
research and original phase rationale that informed the consolidated plan.

## 1. Product definition

**What it is.** One TypeScript platform where Pakistani clinics and hospitals self-onboard, publish a
site on a platform subdomain or their own domain, and handle patient contact over WhatsApp. Initial
target: 20-100 tenant organizations, from single-location clinics to multi-location hospitals. The
platform admin runs every tenant from one console. Each tenant's management sees only its own tenant.

**In scope**
- Self-onboarding, subscriptions, entitlements, usage metering, billing hooks.
- Tenants, locations, branding, public site, platform subdomain and custom-domain TLS.
- Clinic service catalog, practitioners, schedules, appointment requests and bookings.
- Minimal patient contact data and consent.
- WhatsApp: inbound requests, outbound reminders and notifications, two-way staff inbox, automated
  booking/chatbot flows, human handoff, and a tenant's or a single location's own number.
- Platform admin console, audit log, RBAC.

**Out of scope** (a separate hospital/clinic management system owns it): medical records, clinical
notes, diagnoses, prescriptions, visit documentation, results, patient billing. The seam is an
optional `external_patient_ref` on a contact plus a future API/webhooks. Demo features to remove:
`patients`, `visitNotes`, and the clinical specialty-module pages.

**Minimum patient data.** Name, phone (E.164), optional email, preferred language, per-channel
consent. Anything more needs a decision recorded here. Patients volunteer health details in chat, so
message bodies are sensitive: encrypted at rest, tenant-scoped, retention-limited, redacted from
logs, never used to train AI models.

**Actors.** Now: platform admin, tenant owner, tenant admin. Later, with no schema change: location
manager, receptionist, practitioner, billing admin, content editor. Patients never log in.

**Two kinds of "services" stay separate** in tables, modules, code names and UI copy.

| | Platform plans (we sell to tenants) | Clinic catalog (tenants offer to patients) |
|---|---|---|
| Meaning | plans, add-ons, entitlements, usage | consultations, procedures, vaccinations, packages |
| Module | `billing` | `catalog` |
| Tables | `plans`, `plan_versions`, `plan_entitlements`, `addons`, `subscriptions`, `usage_events` | `service_categories`, `services`, `location_services`, `practitioner_services` |
| Words to use | plan, add-on, entitlement | service, offering |

**Starting point (demo findings that drive this rewrite).**
- All tenants live in one browser-held blob, login is a membership picker, and roles only hide
  navigation links. Public pages load the whole dataset. Appointment requests reach the admin only
  because both run in the same browser.
- `AppStore` is a whole-snapshot `load/save`, the wrong seam for an API or row-level security.
- Demo defects (visit notes lost through a schema-version mismatch, a broken migration chain, `Intl`
  crashes on bad timezone/locale) disappear with the rewrite. Their lessons stand: validate on write,
  never fall back silently, never trust client state.

## 2. External constraints (verified 2026-10-06; re-verify before building)

| Topic | Verified fact | Design consequence |
|---|---|---|
| WhatsApp onboarding | Embedded Signup lets a tenant connect its own WABA and number. It returns the WABA ID, phone number ID and a token code that our server exchanges for a business token, then registers the number for Cloud API and subscribes our app to that WABA's webhooks. Tenants own their WhatsApp assets. Version 2 is deprecated on 2026-10-15. | Build on Embedded Signup v4 only. One app-level webhook URL, routed by `phone_number_id`/WABA. Numbers already on the WhatsApp Business app need the business-app onboarding variant, which many clinics are likely to need. |
| Meta approval | Onboarding customers needs App Review with advanced access to `whatsapp_business_management` and `whatsapp_business_messaging`. Default cap is 10 new tenants per rolling 7 days; 200 after Business Verification, App Review and Access Verification. | Long-lead item, start in Phase 0. The cap is not a constraint at 20-100 tenants. |
| WhatsApp billing | As a Tech Provider, each tenant must add its own payment method to its WABA, so Meta's fees land on the tenant. Only Solution Partners can share a credit line. | Meta message fees cannot be folded into our subscription on this route. Entitlements meter our own usage; Meta's per-message `pricing` data is recorded for visibility only. Resale needs a different route (section 16). |
| WhatsApp pricing | Since 2025-07-01: per template message, by category and recipient country code. Free-form messages are free inside the 24-hour customer-service window, as are utility templates sent inside it. Rates change only on 1 Jan/Apr/Jul/Oct (Pakistan utility and authentication rates rose on 2026-04-01). | Enforce window-versus-template at send time, show tenants cost estimates, keep rate tables as data. |
| Webhooks | Events are signed: `X-Hub-Signature-256` is `sha256=` plus an HMAC-SHA256 of the body with the app secret. Reply 200. Failed deliveries are retried for up to 36 hours and batched up to 1000 updates. Optional mTLS. | Verify on the raw body, dedupe by message id, process asynchronously. |
| Health data | Meta Terms 4.2: the platform is not HIPAA-compliant and Meta makes no promise it suits regulated health data. | Templates and bot flows carry logistics only (who, when, where). Never results, diagnoses or prescriptions. |
| Profiling, resale | Terms 4.1: no building or augmenting profiles of WhatsApp users beyond message threads; no reselling the platform. | No cross-tenant contact linking. Confirm the Tech Provider terms with Meta before pricing add-ons. |
| AI | Terms 4.7: AI providers whose primary functionality is a general-purpose assistant are prohibited. Where an AI provider is involved, WhatsApp data must not be used to create, train or improve AI models (fine-tuning for the business's exclusive use is allowed). | The assistant stays business-scoped and ancillary to booking/support. Every LLM vendor contract forbids training on our traffic, whatever the terms strictly require. Evaluation sets are synthetic. |
| Custom domains | Cloudflare for SaaS is bundled with Free/Pro/Business plans: 100 custom hostnames included, $0.10 per additional hostname, up to 50,000. Wildcard custom hostnames and apex proxying/BYOIP are Enterprise only. | 20-100 tenants fit the included hostnames. Apex domains work only if the tenant's DNS provider supports CNAME flattening/ALIAS; otherwise `www` is canonical. |
| Payments | Pakistan is not on Stripe's supported-country list. | Billing must not assume Stripe (sections 7 and 16). |

Sources: [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/overview),
[pricing](https://developers.facebook.com/docs/whatsapp/pricing/),
[webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started),
[Meta Terms for WhatsApp Business Platform](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform),
[AI provider policy](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers),
[Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/),
[Stripe availability](https://stripe.com/global).

## 3. Architecture decisions

"Decided" means the owner chose it. "Proposed" means this plan recommends it; confirm in Phase 0 as ADRs
under `docs/adr/`.

| Area | Choice | Status |
|---|---|---|
| Shape | Custom TypeScript modular monolith: one codebase, one API process, one worker entrypoint. Split a module out only on evidence. | Decided |
| Infrastructure | Managed cloud services for PostgreSQL, object storage, queues, cache, secrets, monitoring, backups, CDN, TLS. Not a backend-as-a-service. | Decided |
| Tenancy | Pooled: one database, one schema, `tenant_id` on every tenant table, Postgres row-level security (RLS). | Proposed |
| API | REST with OpenAPI generated from shared zod schemas, typed client for the SPAs. Webhooks and a future hospital-system integration need a stable HTTP contract. | Proposed |
| Backend framework | Fastify, one plugin per module. NestJS is an acceptable alternative. | Proposed |
| Data access | Kysely typed SQL with SQL-first migrations. RLS, exclusion constraints and partial indexes are SQL features. | Proposed |
| Async | Transactional outbox in Postgres, relayed to a managed queue with a dead-letter queue, ordered per conversation, behind a `QueuePort`. | Proposed |
| Cache | Managed Redis-class cache for entitlement snapshots, rate limits, inbox fan-out. Never a source of truth. | Proposed |
| Storage | S3-class bucket, presigned uploads, per-tenant prefix, server-side validation. | Proposed |
| Secrets | Managed secret store plus KMS envelope encryption for WhatsApp tokens. | Proposed |
| Identity | Managed OIDC provider for authentication only. Authorization (RBAC) stays in our code. | Proposed |
| Edge | CDN, WAF and managed TLS in front, with an API for custom hostnames. Default: Cloudflare for SaaS. Spike against AWS CloudFront multi-tenant before committing. | Proposed |
| Frontends | `web-console` (tenant) and `web-platform` (operator) as separate Vite SPAs so operator code never ships to tenants. `web-public` is server-rendered. | Proposed |
| Observability | OpenTelemetry traces, structured JSON logs with `tenant_id` and `request_id` (PII redacted), metrics, error tracking, uptime checks, alerts. | Proposed |
| Delivery | Infrastructure as code, three environments, CI gates listed in section 15. | Proposed |
| Billing | Provider-agnostic `BillingProvider` port. Manual-invoice adapter first. | Proposed |

## 4. Tenancy and access control

**Isolation (hard boundary).**
- Every tenant-owned table has `tenant_id uuid not null`, a unique `(tenant_id, id)`, and composite
  foreign keys to parents so a row cannot reference another tenant.
- RLS is enabled and forced. Policy: `tenant_id = current_setting('app.tenant_id', true)::uuid`.
- The app connects as a role that is neither table owner nor `BYPASSRLS`. Migrations use a separate
  owner role.
- Each request runs in a transaction that starts with `set_config('app.tenant_id', $1, true)`
  (transaction-local, safe with pooled connections). A `withTenant(tenantId, fn)` wrapper is the only
  way to reach tenant tables. Unset context fails closed.
- Platform-wide work runs only through the `platform-admin` module under a separate DB role. Every call
  writes an audit row. Impersonation is time-boxed, needs a reason, shows a banner, and is audited.
- Unauthenticated entry points resolve the tenant first: public requests by `Host` through a narrow
  `SECURITY DEFINER` lookup on `tenant_domains`; WhatsApp webhooks by `phone_number_id`/WABA.
- CI guards: a catalog check that every table with `tenant_id` has forced RLS and a policy, and an
  isolation suite that seeds two tenants and proves tenant A can read or write nothing of tenant B
  through every repository function and every route.

**Identity.** Two realms: platform staff and tenant users (separate pools, cookies and hostnames).
MFA is mandatory for platform staff. A user may hold memberships in several tenants. The active tenant
is chosen after login and re-checked against memberships on every request, never taken from a client
header. Sessions are server-side, revocable, HttpOnly/Secure/SameSite cookies with CSRF protection.

**RBAC (soft boundary inside a tenant).**
- A permission catalog in code (`resource.action`: `location.manage`, `practitioner.manage`,
  `catalog.manage`, `schedule.manage`, `appointment.read`, `appointment.manage`, `contact.read`,
  `inbox.read`, `inbox.reply`, `inbox.assign`, `inbox.handoff`, `whatsapp.connection.manage`,
  `site.edit`, `site.publish`, `domain.manage`, `billing.manage`, `member.invite`, `audit.read`).
- Roles are data (`roles`, `role_permissions`). System roles are seeded and immutable: `platform_admin`,
  `tenant_owner`, `tenant_admin` first; `location_manager`, `receptionist`, `practitioner`,
  `billing_admin`, `content_editor` added later without schema change; custom roles later still.
- `role_assignments(membership_id, role_id, scope_type, scope_id)` with scope `tenant` or `location`.
- One enforcement point: every route declares its permission or is explicitly `public`; a test fails
  the build otherwise. An authorization-matrix test (role x route) is generated from the catalog.
- Permission and entitlement are separate checks: permission says who may, entitlement says whether the
  tenant's plan allows it. Both must pass.

## 5. Modular monolith layout

```
apps/
  api/          Fastify composition root, modules/, worker entrypoint
  web-console/  tenant console (Vite SPA)
  web-platform/ operator console (Vite SPA)
  web-public/   server-rendered tenant sites
packages/
  shared/       zod schemas, permission catalog, entitlement keys, types
  ui/           design tokens and components (ported from the demo)
infra/          infrastructure as code
docs/
```

| Module | Owns |
|---|---|
| `identity` | users, IdP subject mapping, sessions, MFA state, invitations |
| `access` | permission catalog, roles, role assignments, `authorize()` |
| `tenancy` | tenants, locations, lifecycle, settings, onboarding state |
| `domains` | hostnames, verification, certificate status, edge adapter |
| `catalog` | clinic service catalog, specialties |
| `directory` | practitioners and their location assignments |
| `scheduling` | schedules, exceptions, slots, appointment requests, appointments, reminder rules |
| `contacts` | minimal contacts and consents |
| `messaging` | WhatsApp connections, webhooks, templates, conversations, messages, inbox |
| `automation` | flow engine, handoff rules, AI assistant adapter |
| `billing` | plans, entitlements, subscriptions, usage, invoices, billing port |
| `site` | site settings, pages, publishing, public read models |
| `media` | uploads and assets |
| `audit` | append-only audit and security events |
| `platform-admin` | the only cross-tenant code path |

Rules:
- A module exposes one `index.ts` facade and domain events. Nothing imports another module's internals
  or reads its tables. CI enforces this (dependency-cruiser or equivalent).
- Cross-module side effects go through the transactional outbox.
- Vendors sit behind ports: `QueuePort`, `StoragePort`, `SecretsPort`, `EdgePort`, `WhatsAppProvider`,
  `BillingProvider`, `LlmPort`, `EmailPort`.
- Time-ordered UUIDs for primary keys; opaque slugs in public URLs; idempotency keys on create
  endpoints; timestamps in UTC with the location's IANA timezone stored alongside.

## 6. Core data model

Global (no tenant RLS; reached only through the owning module or a narrow lookup function):
`tenants`, `users`, `platform_staff`, `tenant_domains`, `plans`, `plan_versions`, `plan_entitlements`,
`addons`, `subscriptions`, `subscription_items`, `entitlement_overrides`, `usage_events`,
`usage_rollups`, `invoices`, platform `audit_events`.

Tenant plane (all carry `tenant_id` and RLS): `locations`, `memberships`, `roles`, `role_permissions`,
`role_assignments`, `invitations`, `practitioners`, `practitioner_locations`, `service_categories`,
`services`, `location_services`, `practitioner_services`, `schedules`, `schedule_exceptions`,
`appointment_requests`, `appointments`, `contacts`, `consents`, `whatsapp_connections`,
`wa_templates`, `conversations`, `messages`, `automation_flows`, `flow_sessions`, `canned_replies`,
`site_settings`, `site_pages`, `media_assets`, tenant `audit_events`, `outbox`.

Key constraints:
- A practitioner is a person, assigned to many locations through `practitioner_locations` (the demo's
  single `clinicId` is dropped). Registration number is stored for the publish gate.
- `appointments` carries an exclusion constraint (`btree_gist`) so one practitioner cannot hold
  overlapping active bookings.
- `contacts` has a unique `(tenant_id, phone_e164)`. No cross-tenant contact table exists.
- `whatsapp_connections.location_id` is nullable: null means the tenant default number. Unique
  `phone_number_id` across the platform.
- `messages` has a unique `(connection_id, provider_message_id)` for webhook dedupe.
- Clinic hours are structured (`schedules` plus exceptions), not free text.

## 7. Plans, entitlements, metering

- **Plan** is a versioned bundle of entitlements. Plan versions are immutable; changes create a new
  version. A tenant may carry overrides and add-ons.
- **Entitlement kinds:** `flag` (on/off), `limit` (live resource count), `meter` (consumption per
  period with an included quota and an overage policy).

| Key | Kind | Enforced in |
|---|---|---|
| `locations.max` | limit | `tenancy` create location |
| `practitioners.max` | limit | `directory` create/activate practitioner |
| `domains.custom.max` | limit | `domains` add custom domain |
| `whatsapp.connections.max` | limit | `messaging` connect number |
| `staff.seats.max` | limit | `access` invite member (active once staff roles exist) |
| `storage.gb.max` | limit | `media` upload |
| `automation.runs.monthly` | meter | `automation` flow engine |
| `whatsapp.template_sends.monthly` | meter, informational | `messaging` outbound pipeline |
| `ai.credits.monthly` | meter | `automation` AI adapter |
| `inbox.enabled`, `chatbot.enabled`, `site.branding_removal`, `api.access` | flag | owning module |

- **Enforcement:** `EntitlementService.assert(tenant, key, delta)` runs inside the same transaction as
  the resource-creating command, with a row lock on the tenant's counter so two requests cannot both
  squeeze under a limit. Downgrades never delete data: over-limit resources become read-only or
  unpublished, with a grace period.
- **Metering:** append-only `usage_events` with an idempotent `source_ref`, rolled up per billing period.
  WhatsApp status webhooks include a `pricing` object (billable, category); record it per tenant.
- **Add-ons** map to entitlement increments: extra location, extra WhatsApp number, practitioner pack,
  custom domain, AI credit pack.
- **Subscription states:** `trialing`, `active`, `past_due`, `suspended`, `canceled`. Effect of
  `suspended` on the public site and outbound WhatsApp is a decision (section 16).
- **WhatsApp cost layers:** Meta's per-message fees go to the tenant on the Tech Provider route, so
  entitlements here meter our own usage only. If the owner wants to bill messaging, the route changes
  (section 16) and `whatsapp.*` meters become billable.
- **Billing port:** `createCustomer`, `startSubscription`, `changePlan`, `recordUsage`, `issueInvoice`,
  webhook handling. First adapter: manual invoices (PDF, operator marks paid). A local payment-gateway
  adapter follows once chosen. Tax-invoice fields come from an accountant before launch.

## 8. Domains and TLS

- **Platform subdomain.** `<slug>.<platform-domain>` is created at registration, available immediately
  under a wildcard DNS record and wildcard certificate at the edge. Slugs are DNS-safe, unique, checked
  against a reserved list (`www`, `api`, `app`, `console`, `admin`, `mail`, and so on) and changeable
  only through support.
- **Custom domain.** The tenant enters a hostname; the console shows the DNS records to add: a CNAME to
  the edge target and a TXT ownership token. States: `pending_dns`, `verifying`, `issuing_certificate`,
  `active`, `failed`, `removed`. A reconciler polls DNS and the edge API, notifies the tenant, and
  alerts us on stuck or expiring certificates.
- **Apex domains.** Supported only where the tenant's DNS provider flattens CNAME/ALIAS; otherwise the
  tenant uses `www` and redirects the apex at their registrar.
- **Safety.** One tenant per hostname. Ownership is verified before a certificate is requested, so a
  tenant cannot claim someone else's domain. Hostnames are removed at the edge when a tenant is
  suspended or closed, to avoid dangling-DNS takeover. HTTP redirects to HTTPS; HSTS once active. The
  custom domain is canonical once active.
- **Routing.** The edge forwards `Host`; the origin resolves the tenant from `tenant_domains` (short
  cached lookup, invalidated on change). Unknown host returns a generic 404 with no tenant data.
- **Entitlement:** `domains.custom.max`.
- **Phase 0 spike:** compare Cloudflare for SaaS and AWS CloudFront multi-tenant on a throwaway domain:
  hostname add/verify/issue/renew through the API, apex behavior, latency from Pakistan, cost at 100
  hostnames, WAF, operations burden.

## 9. WhatsApp

**Provider boundary.** Everything goes through a `WhatsAppProvider` port (send message, send template,
list/sync templates, download media, verify and parse webhooks). Default adapter: Meta Cloud API as a
Tech Provider with Embedded Signup v4. A BSP adapter is possible later without touching other modules.

**Connections.** `whatsapp_connections` holds `waba_id`, `phone_number_id`, display number, status,
quality rating, messaging-limit tier, an encrypted token reference, and `location_id` (null for the
tenant default). Outbound routing: the appointment's location connection, else the tenant default, else
blocked with a clear error. Inbound: `phone_number_id` identifies the connection; if the connection is
tenant-wide, the bot asks which location.

**Inbound pipeline.** Single webhook endpoint, verify `X-Hub-Signature-256` on the raw body, persist the
raw event, dedupe on provider message id, enqueue, reply 200 immediately. A worker normalizes, upserts
contact and conversation, routes to bot or human, and emits inbox events. Failed events are replayable.

**Outbound pipeline.** Command to outbox to queue (ordered per conversation) to worker. The worker checks
entitlements, consent, and the customer-service window: free-form only while the window is open,
otherwise an approved template. It sends, records status, merges delivered/read/failed webhooks
monotonically, retries with backoff, and dead-letters with an alert. Per-connection rate limits respect
Meta's messaging tier.

**Templates.** We ship a template library (reminder, confirmation, reschedule, cancel; English and
Urdu), submitted per WABA at connection time and synced into `wa_templates`. Reminders use utility
templates. Content is logistics only.

**Consent.** `consents` records opt-in source and evidence per contact and channel. Opt-out keywords stop
all outbound except legally required service replies. Marketing-category sends are off by default.

**Reminders.** Per-tenant offsets (for example 24h and 2h before), timezone-aware, idempotent, cancelled
on reschedule or cancel.

**Staff inbox.** Conversation list filtered by location, assignee and status; assignment; internal
notes; canned replies; unread counts; real-time updates over SSE with a cache pub/sub; media stored in
object storage. Access is scoped by location through RBAC (`inbox.*` permissions).

**Bot flows.** A deterministic flow engine with versioned JSON definitions and persisted sessions:
language choice (Urdu, English), menu, book (service, location, practitioner, date, slot, confirm),
reschedule/cancel, clinic info and hours, talk to staff. Uses interactive buttons and lists. Slots are
held briefly. Booking creates an `appointment_request` or a confirmed `appointment`, per tenant setting.

**Human handoff.** States `bot_active`, `waiting_human`, `human_active`, `resolved`. Triggers: patient
asks, repeated misunderstanding, emergency or complaint keywords, low AI confidence, staff takeover.
While a human is active the bot is muted; it resumes after inactivity. Out-of-hours auto-reply and staff
notification.

**AI assistant (optional, behind `ai.credits.monthly`).**
- Intent routing and FAQ answers over the tenant's own content only.
- Tools are a closed list executed server-side with tenant, location and contact fixed by the session:
  `search_slots`, `hold_slot`, `create_booking_request`, `get_clinic_info`, `handoff`. The model never
  supplies a tenant id and cannot send arbitrary templates.
- Patient text and model output are untrusted input: schema-validated, prompt-injection tested.
- No medical advice. Emergency wording triggers a fixed safety message and handoff.
- Vendor contract: no training on our traffic, data-processing terms. Per-tenant spend cap.
- Evaluation set (synthetic English, Urdu, Roman Urdu) gates every prompt or model change.

**Retention.** Message body retention is tenant-configurable within a platform maximum (proposal:
default 90 days); media expires sooner. Per-contact export and deletion.

## 10. Public sites

- Server-rendered per request with CDN caching keyed by host and path; purge on publish.
- The `site` module builds a denormalized public read model per tenant (organization, locations,
  services, practitioners, schedules). Public code never sees admin data.
- SEO per host: dynamic `sitemap.xml` and `robots.txt`, canonical URL (custom domain wins), Open Graph,
  `schema.org` markup, `<html lang dir>` per language.
- Privacy and speed: self-hosted fonts, no third-party scripts by default, CSP with nonces, mobile-first
  and light for low-bandwidth connections.
- Patient actions: appointment request form (bot protection, rate limits), WhatsApp click-to-chat to the
  tenant's own number, call and map links. Slot lookups use the `scheduling` public API.
- Publish gate: a site goes live only after required content passes checks and, at launch, after
  platform approval (section 11). Every page has a report-abuse link.

## 11. Self-onboarding

State machine on `tenants.onboarding_state`, resumable:
`registered` to `email_verified` to `plan_selected` to `location_created` to `branding_done` to
`services_done` to `practitioners_done` to `schedules_done` to `ready_to_publish` to `published`.

1. Register an organization (email verification, bot protection, disposable-email block, per-IP limits).
   The platform subdomain is reserved immediately in `draft`.
2. Choose a subscription. Entitlements materialize into the tenant's snapshot. With manual billing at
   launch, paid plans start as a trial plus an activation request the operator approves.
3. Create the first location.
4. Configure branding, clinic services, practitioners, schedules.
5. Preview, then publish. Gate: required fields complete, entitlements satisfied, and platform
   verification (facility registration; practitioners' medical-council registration numbers).
   Verification is manual at launch and automated later where possible.
6. Optional later steps: custom domain, WhatsApp connection (both entitlement-gated; WhatsApp needs the
   tenant's Meta business details and a payment method on their WABA).

Abuse controls matter here: a fake clinic or fake doctor on a public medical directory is a patient
safety and trust problem, which is why publication is gated.

## 12. Security and privacy baseline

- **AuthN/Z.** MFA required for platform staff and (recommended) tenant owners; TOTP or passkeys, not SMS
  OTP. Deny by default; every route declares a permission or `public`.
- **Input.** Shared zod schemas at the edge. URL fields are allowlisted (https only; `wa.me` or
  `api.whatsapp.com` for WhatsApp; approved map hosts). Uploads: content sniffing, size limits, no SVG,
  re-encode images. CSV export escapes formulas (`escapeFormulae`).
- **Public abuse.** Bot protection and rate limits on registration, appointment requests and domain claims.
- **Secrets and crypto.** Managed secret store, envelope-encrypted WhatsApp tokens, rotation, nothing in
  the repo. TLS everywhere, encryption at rest.
- **Data.** PII redaction in logs, retention schedule (messages, media, audit), per-contact export and
  delete, point-in-time-recovery backups with cross-region copies and scheduled restore drills,
  least-privilege DB roles.
- **Web.** CSP with nonces, HSTS, `frame-ancestors` none on consoles, no third-party scripts or fonts on
  tenant sites by default.
- **Webhooks.** Signature check, dedupe, rate limiting, optional mTLS.
- **Supply chain.** Lockfile, dependency and secret scanning, Dependabot-style updates, SBOM.
- **Audit.** Append-only audit of admin actions, impersonation, entitlement overrides and security events.
- **Compliance.** Counsel reviews Pakistan data-protection and healthcare-advertising rules, the privacy
  policy, terms and a tenant data-processing agreement. Breach runbook. Do not claim HIPAA or similar
  compliance anywhere in the product.

## 13. Pakistan market requirements

- Locales `en-PK` and `ur-PK`. Decide whether Urdu public sites are fully right-to-left (the demo kept
  left-to-right on purpose). Self-hosted font with Nastaliq support. The bot understands Urdu, English
  and Roman Urdu.
- Phone normalization: `03xx` to `+92 3xx`, stored as E.164.
- Default timezone `Asia/Karachi`, still stored per location.
- Many clinics already run the WhatsApp Business app on their number; support the business-app
  onboarding variant so they keep it.
- Meta bills tenants in a supported currency; confirm how Pakistani businesses attach a payment method to
  their WABA before promising self-service WhatsApp (risk 2).
- Stripe is unavailable; plan for bank transfer, Raast or a local gateway, and tax-compliant invoices.
- Pick the hosting region by measured latency from Karachi, Lahore and Islamabad.

## 14. Reuse from the demo

| Demo asset | Fate |
|---|---|
| `src/domain/specialtyRegistry.ts` | Port as specialty reference data; drop workflow hints and module pages |
| `src/domain/availability.ts` and tests | Port to `packages/shared`; extend into slot generation |
| `src/domain/publicTenantResolver.ts` | Port the logic to the server-side host resolver; `?host=` becomes dev-only |
| `src/domain/uiStrings.ts`, `regionalFormatting.ts` | Port to i18n catalogs (`en-PK`, `ur-PK`) |
| `src/domain/practitionerImport.ts` | Port server-side; same CSV format; escape formulas on export |
| `src/domain/policy.ts` | Superseded by the permission catalog |
| `src/styles/*`, `src/components/*` | Port to `packages/ui` and the web apps; keep the approved look |
| `e2e/*`, axe and visual baselines | Keep the approach; rewrite the flows |
| `AppData`, localStorage store, seed login, org switcher, Reset demo data, `patients`, `visitNotes`, `SpecialtyModulePage`, `scripts/generate-seo.mjs` | Delete |

## 15. Delivery plan

Work phases in order unless noted. One phase per branch/PR, one checklist item per commit where
practical. Before each commit run typecheck, lint, unit, integration and (from Phase 1) the isolation
suite. Tick boxes as work lands.

CI gates (from Phase 1): typecheck, lint, unit tests, integration tests on a real Postgres, RLS catalog
check and isolation suite, authorization-matrix test, module-boundary check, build, dependency and secret
scanning. Playwright E2E and axe for user flows. Contract tests for WhatsApp webhooks using signed
fixtures. Load test of webhook ingestion before launch.

### Phase 0: decisions and long-lead items (no product code)
- [ ] Record the section 16 decisions as ADRs in `docs/adr/`.
- [ ] Meta: business portfolio and developer app; start Business Verification; build Embedded Signup v4
      on a sandbox account; prepare App Review (use-case recording, privacy policy, data-deletion URL).
      Runs in parallel with every later phase.
- [ ] Billing route (manual invoicing and/or a local gateway) and tax-invoice fields, with an accountant.
- [ ] Custom-domain spike (section 8).
- [ ] Reserve the platform domain and console hostnames.
- [ ] Legal drafts: privacy policy, terms, tenant data-processing agreement, tenant verification policy.
- [ ] Update `AGENTS.md` and `CLAUDE.md` to point at this plan (owner approval).
- [ ] Decide how the demo is preserved (tag or branch) before restructuring.

### Phase 1: foundation
- [ ] Monorepo layout from section 5; remove the stray untracked `client/` and `server/` folders.
- [ ] Three environments as code; CI pipeline with the gates above.
- [ ] API skeleton: config, redacted structured logging, request context, error model, OpenAPI, health
      checks, graceful shutdown.
- [ ] Database baseline: migrations, owner/app/platform roles, a migration helper that enables and forces
      RLS, the `withTenant` wrapper.
- [ ] RLS catalog check and isolation suite in CI.
- [ ] Identity: IdP integration, two realms, sessions, CSRF, MFA for platform staff, invitations.
- [ ] RBAC: permission catalog, role tables, `authorize()`, fail-closed route guard, matrix test.
- [ ] Audit module and security events.
- [ ] Observability baseline: traces, metrics, error tracking, alerts.
- Exit: two seeded tenants cannot read or write each other's rows through any tested path; platform admin
  and tenant owner can sign in; no business features yet.

### Phase 2: tenant core and platform console
- [ ] `tenancy`: tenants, locations, lifecycle (`draft`, `trial`, `active`, `suspended`, `closed`),
      settings (locale, timezone, language).
- [ ] Memberships, invitations and role assignments (tenant and location scope).
- [ ] Platform console: tenant list and detail, create, suspend, close, audited impersonation, audit
      viewer, cross-tenant search.
- [ ] `media`: presigned uploads, validation, per-tenant prefix, quota hook.
- [ ] `packages/ui`: port tokens and components; rebuild the console shell with role-aware navigation.
- Exit: operator manages tenants; a tenant owner manages only their tenant.

### Phase 3: catalog, practitioners, scheduling, booking
- [ ] `catalog`: categories, services, location offerings; specialty reference data.
- [ ] `directory`: practitioners as people, location assignments, profile, photo, languages, registration
      number.
- [ ] `scheduling`: weekly schedules per practitioner and location, exceptions, slot generation by
      service duration and timezone, requests to bookings, reschedule and cancel, status history, the
      double-booking exclusion constraint.
- [ ] `contacts` and `consents`; E.164 normalization.
- [ ] CSV import and export on the server.
- Exit: staff can configure services, doctors and schedules and create bookings without double-booking.

### Phase 4: plans, entitlements, metering, billing (can overlap Phase 5)
- [ ] `billing`: plans, versions, entitlements, add-ons, overrides, subscriptions and states.
- [ ] `EntitlementService` wired into every limit in section 7, with concurrency tests.
- [ ] Usage events and rollups; usage view for tenant and operator.
- [ ] `BillingProvider` port and the manual-invoice adapter; operator invoice workflow.
- Exit: exceeding any limit is blocked or billed per policy; downgrades never delete data.

### Phase 5: public sites and domains (can overlap Phase 4)
- [ ] `site`: settings, pages, publish and unpublish, public read model, cache purge.
- [ ] `web-public`: server-rendered directory, doctor and location pages, booking request form, WhatsApp
      click-to-chat, per-host sitemap and robots, CSP.
- [ ] `domains`: platform subdomain provisioning, custom domain add, verify, issue, renew, remove; edge
      adapter; reconciler and alerts.
- Exit: a new tenant is reachable on its subdomain with TLS immediately; a custom domain goes active
  without manual steps.

### Phase 6: self-onboarding
- [ ] Registration, email verification, bot protection, abuse limits.
- [ ] The onboarding wizard and state machine from section 11, resumable.
- [ ] Publish gate and platform verification queue in the operator console.
- [ ] Plan selection and trial/activation flow.
- Exit: a stranger can register, configure and (after approval) publish without operator help beyond
  verification.

### Phase 7: WhatsApp core (needs Phases 3 and 4; Meta approval from Phase 0)
- [ ] `WhatsAppProvider` port and the Meta adapter; Embedded Signup v4 connect, disconnect and
      business-app onboarding variant; encrypted tokens.
- [ ] Webhook endpoint: signature check, raw-event store, dedupe, queue, replay tool.
- [ ] Outbound pipeline: window and template rules, consent checks, retries, dead-letter, rate limits.
- [ ] Template library, per-WABA submission and sync.
- [ ] Reminders and notifications from appointments.
- [ ] Usage metering from status webhooks.
- Exit: a pilot tenant connects its own number and receives booking confirmations and reminders.

### Phase 8: inbox and handoff
- [ ] Conversations and messages UI, filters, assignment, notes, canned replies, unread counts.
- [ ] Real-time updates (SSE plus cache pub/sub), media handling.
- [ ] Per-location scoping through RBAC; handoff state machine and staff notifications; out-of-hours reply.
- Exit: staff run a full two-way conversation and take over from the bot.

### Phase 9: automation and AI
- [ ] Deterministic flow engine and the booking flow, with slot holds.
- [ ] Reschedule, cancel, clinic-info and talk-to-staff flows; Urdu and English copy.
- [ ] AI assistant behind `ai.credits.monthly` with the closed tool list, guardrails, spend caps and the
      synthetic evaluation harness.
- Exit: a patient books, reschedules and cancels over WhatsApp without staff; any failure hands off.

### Phase 10: hardening and launch
- [ ] External penetration test; fix findings.
- [ ] Load and failure tests (webhook storm, queue backlog, dead-letter, Meta outage); restore drill.
- [ ] Runbooks, status page, on-call alerts; support tooling for the operator.
- [ ] Legal documents live; export and delete flows tested.
- [ ] Pilot tenants onboarded; go-live checklist signed off.

## 16. Decisions needed from the owner

| # | Decision | Recommended default | Why it matters |
|---|---|---|---|
| 1 | Cloud and region | AWS; pick UAE (`me-central-1`) or Mumbai (`ap-south-1`) by measured latency | Fixes the infrastructure code and managed-service choices |
| 2 | Identity | Managed OIDC provider for authentication; RBAC in our code | Offloads MFA and recovery risk; user count is small |
| 3 | WhatsApp route | Tech Provider with Embedded Signup v4; tenants own their WABA and pay Meta | A Solution Partner or BSP route is needed if we want to bill messaging or if tenants cannot pay Meta |
| 4 | Billing in Pakistan | Manual invoice plus bank transfer/Raast at launch; local gateway adapter later | Stripe is unavailable |
| 5 | AI vendor and scope | No-training LLM API; assistant ancillary to booking/support only | Meta Terms 4.7, cost, Urdu quality |
| 6 | Public site stack | Server-rendered framework with per-host CDN caching; decide full RTL for Urdu | SEO on tenant domains |
| 7 | Platform domain and brand | Needed before wildcard TLS and Meta app review | Blocks Phase 0 |
| 8 | Publish gate | Manual approval of first publish (facility registration, council numbers) | Patient trust |
| 9 | Data residency | Single region, disclosed to tenants | Hospitals may ask for in-country hosting |
| 10 | Plan tiers and prices | You define tiers, limits and prices; engineering needs only the keys in section 7 | Phase 4 input |
| 11 | Suspended tenants | Policy for public site and outbound WhatsApp | Phase 4 behavior |

## 17. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Meta App Review or Business Verification delays | Start in Phase 0; develop on the sandbox; keep the BSP adapter option behind the port |
| 2 | Pakistani tenants cannot attach a payment method to their WABA | Test with pilot tenants early; evaluate a Solution Partner or local BSP route |
| 3 | Collecting subscription payments in Pakistan | Billing port, manual invoicing first, accountant input |
| 4 | RLS mistakes leak tenant data | Forced RLS, restricted DB roles, catalog check, isolation suite, authorization matrix in CI |
| 5 | Health details in chats or AI prompts | Logistics-only templates, retention limits, log redaction, no-training vendor, emergency handoff |
| 6 | Fake clinics or doctors published | Publish gate, verification queue, abuse reporting, takedown runbook |
| 7 | Custom-domain support load | Guided DNS checker, clear status UI, reconciler alerts, `www` canonical |
| 8 | Scope creep into clinical features | Section 1 out-of-scope list; changing it needs an ADR |
| 9 | Meta pricing or policy changes (quarterly) | Provider port, rate tables as data, track Meta changelog |
| 10 | Duplicate or out-of-order webhooks | Idempotent processing, per-conversation ordering, monotonic status merge |
| 11 | Cost blowups from WhatsApp or AI usage | Meters, spend caps, alerts, per-tenant dashboards |
| 12 | Regional outage or residency pushback | Cross-region backups, restore drills, residency decision (section 16) |
