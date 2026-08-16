# Clinic Hub

Multi-tenant clinic workspace for organizations that run one or many clinics, with practitioners across specialties (GP, gynecology, dentistry, pediatrics, cardiology). Adding or updating a doctor's specialties automatically enables the matching specialty module for that clinic.

The demo data is configured for Pakistan, but market behavior is not encoded in application logic. Each organization owns ISO country/currency codes, BCP 47 locale, IANA timezone, calling code, data-residency metadata, retention, and policy-profile settings.

## Quick start

```bash
npm install
npm run dev
```

Other scripts:

- `npm run build` — typecheck + production build
- `npm run test` — tenant isolation + module registry tests
- `npm run typecheck` — TypeScript only
- `npm run lint` — oxlint
- `npm run preview` — preview the production build

Copy `.env.example` to `.env` if you want to override the app name or storage key.

## Demo walkthrough

1. Open `/` for the public clinic website and doctor directory.
2. Select a clinic or specialty, then open a doctor card for their public profile and contact details.
3. Open `/admin` for the management dashboard.
4. Add, edit, deactivate, or reactivate a doctor under **Practitioners**. Public cards update immediately.
5. Switch organization to **Sehat Family Clinics** — patients and practitioners change; Indus data is not visible.
6. Use **Reset demo data** on the dashboard if you want the seeded state again.
7. Use **Organization settings** to change region and governance metadata without changing code.
8. Use the doctor form for daily changes or download the CSV template for organization-wide bulk onboarding.

## Architecture (current MVP)

```
Organization
  └── Clinic
        ├── Practitioners (1..n specialties)
        ├── Patients
        └── Active modules = union of active practitioner specialties
```

- **Tenant boundary:** every read/write is scoped by `organizationId` + `clinicId` in `src/domain/repository.ts`.
- **Specialty modules:** declarative registry in `src/domain/specialtyRegistry.ts`. Navigation and module routes are derived — no hard-coded dental-only product shell.
- **Persistence:** browser `localStorage` demo store. This is intentionally not production security.
- **Roles:** membership records include `owner | admin | receptionist | practitioner` for UI groundwork; full RBAC belongs on a real backend.
- **Market configuration:** `RegionalSettings` lives on each organization. Formatting uses standard `Intl` APIs instead of country-specific branches.
- **Policy profiles:** governance profiles are declarative readiness templates. Selecting one does not make the product legally compliant.
- **Doctor roster management:** individual add/edit/deactivate is the primary workflow. CSV import supports up to 500 validated rows across clinics accessible to the current organization membership.
- **Public directory:** active doctors are published as cards at `/clinic/:organizationSlug`; each profile includes specialties, qualifications, clinic, availability, languages, and contact actions.
- **Admin workspace:** management routes live under `/admin` and are separated from the public website. Authentication remains a production requirement.

## Doctor CSV format

Required columns:

`clinic,full_name,email,phone,specialties,active`

- `clinic`: exact clinic name or clinic ID within the current organization.
- `specialties`: specialty IDs, labels, or short labels separated by `|` or `;`.
- `active`: `true/false`, `yes/no`, `1/0`, or `active/inactive`.
- Existing organization emails, duplicate file emails, inaccessible clinics, and unknown specialties are rejected in preview.
- Doctors are deactivated rather than deleted to preserve historical references.

## Market and compliance model

- Pakistan is seed data, not a global default hidden in code.
- Onboarding should collect the organization's locale, currency, timezone, calling code, and data-residency choice.
- Policy profiles such as HIPAA/GDPR readiness are optional configuration templates and can be supplied by a future backend.
- Legal requirements must be reviewed with qualified counsel for each operating jurisdiction.
- Technical enforcement (MFA, audit trails, consent evidence, retention/deletion, encryption, and residency) belongs in the production identity/API/data layers.

## Production roadmap (scalable multi-tenant)

This frontend is shaped so a backend can replace the local repository without rewriting the product model.

1. **Auth & tenancy** — OIDC/SAML (or Clerk/Auth0), memberships, invite flows, org/clinic switcher backed by JWT claims.
2. **Data store** — Postgres with `organization_id` / `clinic_id` on every tenant table; enforce with **row-level security**.
3. **API** — versioned REST or tRPC; never trust client-side filtering alone.
4. **Audit & PHI** — immutable audit log, encryption at rest, secrets in a vault, backups + restore drills.
5. **Observability** — structured logs, metrics, tracing, error reporting (e.g. Sentry).
6. **Deploy** — static frontend on CDN (Cloudflare/Vercel/Netlify) + API on containers or serverless; CI for lint/test/build.
7. **Compliance** — treat clinical data as regulated (HIPAA/local equivalents); BAA with vendors, access reviews, retention policies.

## Important limitation

This repository is a **local demo**. It does not provide real authentication, authorization, encryption, or HIPAA compliance. Do not store real patient data in it.
