# Clinic Hub improvement plan

Source: principal-architect review of the whole project on 2026-09-18, on branch
`feature/clinic-hub-public-directory`. Line numbers were correct on that date and may drift.
Update the checkboxes in this file as work lands so the next agent knows where things stand.

Baseline at review time: `npm run typecheck`, `npm run lint`, `npm run test` all green (20 tests).

## Recommendation: what to fix now versus later

- **Now, on the current branch (Phase 0):** the eight confirmed bugs. They are small, they sit
  on files this branch already touches, and three of them crash the app or silently drop user
  input. Two to three hours total. Merge the branch only after Phase 0 is done.
- **Next PR, before any new feature (Phase 1):** the architecture items. They change the shape
  every future feature builds on, so doing them after features means doing the features twice.
- **Later (Phases 2 and 3):** UI consistency and new features, in the listed order.

## Execution priority

Use this sequence when breaking the checklist into implementation slices. Each slice should be
validated before starting the next one.

1. **Phase 0A: stop mutation crashes and silent loss.** Change provider mutations to return a
      result, render save errors on settings, practitioners, and patients, and add page tests for
      duplicate routes plus the no-specialty practitioner submit.
2. **Phase 0B: fix state and data correctness.** Fix the settings saved-state effect, reset edit
      forms on clinic changes, and correct calendar-date formatting for dates of birth.
3. **Phase 0C: close tenant and UI correctness gaps.** Restrict production `?host=` overrides,
      fix practitioner checkbox styling, and make the specialty thumbnail fallback reachable.
4. **Phase 1A: establish the persistence boundary.** Extract pure reducers, add the store
      interface and local-storage implementation, then expose provider saving/error status while
      preserving repository compatibility.
5. **Phase 1B: make persisted data evolvable.** Add schema versioning, migration, and runtime
      validation on reads. This must land before new persisted entities or fields.
6. **Phase 1C: enforce domain invariants centrally.** Validate practitioner, patient, clinic
      route, assignment, and email rules through every write path; stop persisting derived
      availability summaries.
7. **Phase 1D: separate public and admin context.** Add the public tenant provider and remove
      public-page dependence on the admin session. Then add the shared admin layout and membership
      guard seam.
8. **Phase 1E: prepare public and registry contracts.** Add public contact fields, policy
      actions, and memoized specialty lookups. These are prerequisites for safe profile and role-
      aware features, but lower risk than the persistence and tenancy work.
9. **Phase 2: improve workflow and accessibility.** Add save status UI, reset confirmation,
      native dialog behavior, fieldsets, patient search/edit/deactivate, responsive tables, public
      metadata and anchor behavior, then split CSS only after behavior is stable.
10. **Phase 3A: make the public clinic profile real.** Add clinic contact/profile fields and
       the settings editor, including media and links. This supplies the data model for later
       directory and appointment work.
11. **Phase 3B: build patient-facing discovery and conversion.** Add directory availability
       search, doctor photos, then appointment requests and the admin appointment inbox.
12. **Phase 3C: add governance and localization.** Add audit events, visit notes, richer CSV,
       Urdu/RTL handling, and the login stub with role-gated routes.
13. **Phase 3D: optimize delivery.** Add SEO prerendering after the public tree is decoupled
       and the public routes have stable data contracts.

## Current checkpoint — 2026-09-29

- Completed and committed Phase 0, Phase 1, and the first three Phase 2 workflow items:
      save-status feedback, reset confirmation, and native availability dialog.
- Last commit: `205f72b` (`refactor: use native availability dialog`). The worktree is clean.
- Last validation: `npm run typecheck`, `npm run lint`, and `npm run test` passed; 45 tests ran.
- Resume at the next unchecked Phase 2 item: convert standalone form group labels to
      semantic `<fieldset>` and `<legend>` elements, starting with Specialties, Public availability,
      and Policy profiles.
- Remaining Phase 2 work after that: patient edit/deactivate/search, responsive admin tables,
      public header/admin link cleanup, public metadata and anchor behavior, clinic contact/profile
      fields, then the CSS split.

## How to work this plan

- Work phases in order. Do not start Phase 3 features on top of the current persistence
  shape; Phase 1 exists so features are not built twice.
- One phase per branch/PR. Inside a phase, one checklist item per commit where practical.
- Every bug fix ships with a test that fails before the fix. Domain fixes get a vitest unit
  test next to the module; UI fixes get a Testing Library page test (there are none yet).
- Keep the visual design. The owner likes the current look. Change layout and styling only
  where an item below says so, and use the existing tokens in `src/index.css`.
- Keep the domain layer pure and framework-free. React imports never go under `src/domain`.
- Do not add dependencies unless an item names one. Prefer platform APIs (native `<dialog>`,
  `Intl`, `crypto.randomUUID`).
- Run `npm run typecheck && npm run lint && npm run test` before every commit.
- Do not commit `dist/`. Do not store real patient data.

## Phase 0: fix now, on the current branch

- [x] **Uncaught repository errors crash the app.** Saving a duplicate primary domain or a
      duplicate clinic route throws inside a `setData` updater and lands on the error boundary.
      Files: `src/domain/TenantContext.tsx` (mutation callbacks),
      `src/pages/OrganizationSettingsPage.tsx` `submit`.
      Fix: provider mutations catch and return `{ ok: true } | { ok: false; message }`;
      pages render the message in a `.form-error` line. Apply the same to practitioner and
      patient saves. Test: settings page, set domain to `lassanipolyclinic.com`, submit, expect
      inline error and no throw.
- [x] **"Saved" chip never shows.** The resync effect in `OrganizationSettingsPage` depends on
      the `organization` and `clinic` object identities, which change after every save, so it
      resets `saved` to false immediately. Fix: depend on `organization.id` and `clinic.id`,
      or move the confirmation to a toast (see Phase 2). Test: submit, expect chip visible.
- [x] **Practitioner form drops submit silently when no specialty is checked.**
      `src/pages/PractitionersPage.tsx` `onSubmit` returns early with no message. Fix: inline
      error with `role="alert"`, or disable submit and show a hint. Test: fill name, email and
      phone, submit, expect alert and no new row.
- [x] **Date of birth can render one day early.** `src/domain/regionalFormatting.ts`
      `formatDate` builds a local-midnight `Date` and formats it in the organization timezone.
      Verified: browser `Asia/Karachi` plus org `America/Los_Angeles` shows `Apr 11` for
      `1991-04-12`. Fix: DOB is a calendar date. Parse `${value}T00:00:00Z` and format with
      `timeZone: 'UTC'`. Test by asserting the UTC path.
- [x] **`?host=` override is honored in production.** `src/domain/publicTenantResolver.ts`
      `resolvePublicTenant` uses `hostOverride` unconditionally, so any visitor can render
      another tenant's site under your domain. Fix: honor the override only when
      `isLocalHostname(hostname)` is true or `VITE_ALLOW_HOST_OVERRIDE=true`. Update
      `buildPublicDemoPath` to match. Add the flag to `.env.example`. Test both branches.
- [x] **Stale edit form after clinic switch.** Editing a doctor, then switching clinic in the
      top bar, keeps the form; saving throws a tenant violation. Fix: render
      `<PractitionersPage key={clinic.id} />` from the route (or reset in an effect on
      `clinic.id`). Same for the patients page.
- [x] **Uppercase checkbox labels on the Practitioners form.** The Active and Accepting
      checkboxes sit in a `.field` without `.checklist`, so `.field label` styles apply.
      Fix: wrap them in `<div className="field full checklist">` as the settings page does.
- [x] **Dead SVG fallback in `SpecialtyThumbnail`.** Every specialty has a PNG path, so the
      `if (thumbnailPath)` branch always wins. Fix: delete the SVG fallback and palette, or
      make `THUMBNAIL_PATHS` a `Partial<Record<...>>` so new specialties use the fallback.
- [x] Add `src/pages/*.test.tsx` covering the first three items (render inside
      `MemoryRouter` and `TenantProvider`, `localStorage.clear()` in `beforeEach`).

## Phase 1: architecture, next PR, before any new feature

- [x] **Separate pure reducers from persistence.** Today every `upsert*` in
      `src/domain/repository.ts` calls `writeRaw` and returns synchronously, and the provider
      callbacks return `void`, so a real backend (async, can fail, has loading state) cannot
      be substituted. Target shape:
      - `src/domain/reducers.ts`: pure `(data, context, input) => AppData` functions with the
        existing tenant assertions. No I/O.
      - `src/domain/store.ts`: `interface AppStore { load(): Promise<AppData>; save(data): Promise<void> }`
        with `LocalStorageStore` as the first implementation.
      - `TenantProvider` applies reducers, then persists through the store in one place, and
        exposes `status: 'idle' | 'saving' | 'error'` plus `error`.
      Keep the existing repository tests green by re-exporting from the new modules.
- [x] **Schema version and validation on read.** `readRaw` casts `JSON.parse` output to
      `AppData`; the only migration strategy is bumping `VITE_STORAGE_KEY`, which wipes data.
      Add `schemaVersion` to `AppData`, a `migrate(raw): AppData` chain, and a runtime check
      (zod is acceptable here; it is the one dependency this plan allows).
- [x] **Decouple the public site from the admin session.** `PublicDirectoryPage` and
      `PublicDoctorPage` call `useTenant()` and fall back to the admin's selected organization.
      Add a `PublicTenantProvider` under `src/public/` that resolves from host and route params
      only (dev fallback allowed behind the same flag as the host override). Public pages must
      not import `TenantContext`.
- [x] **Layout routes.** `src/App.tsx` repeats `<AppShell>` five times. Use
      `<Route element={<AdminLayout />}>` with `<Outlet />`, `React.lazy` the admin tree, and
      add a `RequireMembership` guard element as the future auth seam.
- [x] **Centralize invariants per entity.** Email uniqueness is enforced in CSV import but not
      in `upsertPractitioner`. `assignedPractitionerId` is never checked against the clinic.
      `clinic.slug` is stored, uniqueness unchecked, and routing never reads it. Add
      `validatePractitioner` and `validatePatient` used by every path; drop `slug` or use it.
- [x] **Stop persisting derived data.** `availabilitySummary` is stored next to
      `availability`. Derive at read time; keep the string only as legacy free-text input.
- [x] **Registry lookups.** `allSpecialtyOptions()` sorts on every call and is called inside
      render loops. Export a memoized sorted constant and a `slugToSpecialty` map derived from
      `SpecialtyModule.path`; delete `PATH_TO_SPECIALTY` in `SpecialtyModulePage`.
- [x] **Separate public contact from identity email.** Doctor profiles expose the
      practitioner's personal email and phone, and that email is also the uniqueness key. Add
      `publicContact?: { phone?: string; email?: string }` defaulting to the clinic's contact.
- [x] **Policy function for roles.** `membership.role` is display-only. Add
      `can(membership, action)` in `src/domain/policy.ts` and use it to hide write actions.
      No auth yet; this only sets the pattern.

## Phase 2: UI consistency (keep the look)

- [x] Split `src/index.css` into `tokens.css`, `base.css`, `forms.css`, `admin.css`,
      `public.css`. Add `.stack-*` spacing utilities and remove inline `style={{ margin }}`
      from pages. No visual change intended; compare screenshots before and after.
- [x] Toast or status banner component for save confirmations (reuse `.import-message` style).
      Forms currently reset silently.
- [x] Confirm dialog before **Reset demo data**.
- [x] Replace the hand-rolled modal in `AvailabilityDialog` with native `<dialog>` and
      `showModal()` for focus trap and focus restore. Keep the existing `.modal` styles.
- [x] Group labels ("Specialties", "Public availability", "Policy profiles") become
      `<fieldset><legend>`; a `<label>` with no control is an accessibility error.
- [x] Patients page: edit, deactivate, search. `upsertPatient` already supports `id`.
- [x] Admin tables collapse to card rows under 620px.
- [x] Remove the **Admin portal** button from the public header. Link to `/admin` from the
      README and the not-found page instead.
- [x] Public pages set `document.title` and a meta description per page.
- [x] Anchor links in `PublicHeader` use plain `<a href="#doctors">` or a scroll effect;
      router `Link` does not scroll to hashes on same-page navigation.
- [x] Clinic model gains `address`, `phone`, `email`, `hours`, `mapUrl`; the public contact
      block renders them instead of name and city only.

## Phase 3: features, in priority order

1. [x] **Clinic onboarding** in settings: create a clinic, validate route uniqueness, and assign
      it to the current organization membership.
2. [x] **Clinic public profile editor** in settings: tagline, hero copy, hero image, address,
       phone, hours, WhatsApp and map links. Replaces the hard-coded hero and contact strings.
3. [x] **Appointment request flow**: form on the doctor profile offering days from
       `AvailabilityWindow`; admin inbox with `new | contacted | booked | declined`.
4. [x] **Directory search and "available today"** using the window and clinic timezone.
5. [x] **Doctor photos** (data URL in the demo store) with an initials avatar fallback.
6. [x] **Audit events** appended on every mutation (`auditEvents: AuditEvent[]` in `AppData`);
       the governance flags claim this and nothing records it.
7. [x] **Visit notes per specialty module**; modules are hint stubs today.
8. [x] **Richer CSV**: qualifications, languages, availability, accepting; plus export.
9. [x] **Urdu and RTL**: `ur-PK` has a public string table; the product intentionally keeps the
      existing left-to-right layout while translating supported public copy.
10. [x] **Login stub** with membership picker and role-gated routes.
11. [x] **SEO prerendering** of public routes once the public tree is decoupled (Phase 1).

## Deferred on purpose

- Real auth, RLS, API, encryption, HIPAA: backend work, see the README roadmap.
- Dark mode: tokens are ready; not requested.
- Restyling of the public site: explicitly out of scope, the owner likes it.
