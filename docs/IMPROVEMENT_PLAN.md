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

- [ ] **Uncaught repository errors crash the app.** Saving a duplicate primary domain or a
      duplicate clinic route throws inside a `setData` updater and lands on the error boundary.
      Files: `src/domain/TenantContext.tsx` (mutation callbacks),
      `src/pages/OrganizationSettingsPage.tsx` `submit`.
      Fix: provider mutations catch and return `{ ok: true } | { ok: false; message }`;
      pages render the message in a `.form-error` line. Apply the same to practitioner and
      patient saves. Test: settings page, set domain to `lassanipolyclinic.com`, submit, expect
      inline error and no throw.
- [ ] **"Saved" chip never shows.** The resync effect in `OrganizationSettingsPage` depends on
      the `organization` and `clinic` object identities, which change after every save, so it
      resets `saved` to false immediately. Fix: depend on `organization.id` and `clinic.id`,
      or move the confirmation to a toast (see Phase 2). Test: submit, expect chip visible.
- [ ] **Practitioner form drops submit silently when no specialty is checked.**
      `src/pages/PractitionersPage.tsx` `onSubmit` returns early with no message. Fix: inline
      error with `role="alert"`, or disable submit and show a hint. Test: fill name, email and
      phone, submit, expect alert and no new row.
- [ ] **Date of birth can render one day early.** `src/domain/regionalFormatting.ts`
      `formatDate` builds a local-midnight `Date` and formats it in the organization timezone.
      Verified: browser `Asia/Karachi` plus org `America/Los_Angeles` shows `Apr 11` for
      `1991-04-12`. Fix: DOB is a calendar date. Parse `${value}T00:00:00Z` and format with
      `timeZone: 'UTC'`. Test by asserting the UTC path.
- [ ] **`?host=` override is honored in production.** `src/domain/publicTenantResolver.ts`
      `resolvePublicTenant` uses `hostOverride` unconditionally, so any visitor can render
      another tenant's site under your domain. Fix: honor the override only when
      `isLocalHostname(hostname)` is true or `VITE_ALLOW_HOST_OVERRIDE=true`. Update
      `buildPublicDemoPath` to match. Add the flag to `.env.example`. Test both branches.
- [ ] **Stale edit form after clinic switch.** Editing a doctor, then switching clinic in the
      top bar, keeps the form; saving throws a tenant violation. Fix: render
      `<PractitionersPage key={clinic.id} />` from the route (or reset in an effect on
      `clinic.id`). Same for the patients page.
- [ ] **Uppercase checkbox labels on the Practitioners form.** The Active and Accepting
      checkboxes sit in a `.field` without `.checklist`, so `.field label` styles apply.
      Fix: wrap them in `<div className="field full checklist">` as the settings page does.
- [ ] **Dead SVG fallback in `SpecialtyThumbnail`.** Every specialty has a PNG path, so the
      `if (thumbnailPath)` branch always wins. Fix: delete the SVG fallback and palette, or
      make `THUMBNAIL_PATHS` a `Partial<Record<...>>` so new specialties use the fallback.
- [ ] Add `src/pages/*.test.tsx` covering the first three items (render inside
      `MemoryRouter` and `TenantProvider`, `localStorage.clear()` in `beforeEach`).

## Phase 1: architecture, next PR, before any new feature

- [ ] **Separate pure reducers from persistence.** Today every `upsert*` in
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
- [ ] **Schema version and validation on read.** `readRaw` casts `JSON.parse` output to
      `AppData`; the only migration strategy is bumping `VITE_STORAGE_KEY`, which wipes data.
      Add `schemaVersion` to `AppData`, a `migrate(raw): AppData` chain, and a runtime check
      (zod is acceptable here; it is the one dependency this plan allows).
- [ ] **Decouple the public site from the admin session.** `PublicDirectoryPage` and
      `PublicDoctorPage` call `useTenant()` and fall back to the admin's selected organization.
      Add a `PublicTenantProvider` under `src/public/` that resolves from host and route params
      only (dev fallback allowed behind the same flag as the host override). Public pages must
      not import `TenantContext`.
- [ ] **Layout routes.** `src/App.tsx` repeats `<AppShell>` five times. Use
      `<Route element={<AdminLayout />}>` with `<Outlet />`, `React.lazy` the admin tree, and
      add a `RequireMembership` guard element as the future auth seam.
- [ ] **Centralize invariants per entity.** Email uniqueness is enforced in CSV import but not
      in `upsertPractitioner`. `assignedPractitionerId` is never checked against the clinic.
      `clinic.slug` is stored, uniqueness unchecked, and routing never reads it. Add
      `validatePractitioner` and `validatePatient` used by every path; drop `slug` or use it.
- [ ] **Stop persisting derived data.** `availabilitySummary` is stored next to
      `availability`. Derive at read time; keep the string only as legacy free-text input.
- [ ] **Registry lookups.** `allSpecialtyOptions()` sorts on every call and is called inside
      render loops. Export a memoized sorted constant and a `slugToSpecialty` map derived from
      `SpecialtyModule.path`; delete `PATH_TO_SPECIALTY` in `SpecialtyModulePage`.
- [ ] **Separate public contact from identity email.** Doctor profiles expose the
      practitioner's personal email and phone, and that email is also the uniqueness key. Add
      `publicContact?: { phone?: string; email?: string }` defaulting to the clinic's contact.
- [ ] **Policy function for roles.** `membership.role` is display-only. Add
      `can(membership, action)` in `src/domain/policy.ts` and use it to hide write actions.
      No auth yet; this only sets the pattern.

## Phase 2: UI consistency (keep the look)

- [ ] Split `src/index.css` into `tokens.css`, `base.css`, `forms.css`, `admin.css`,
      `public.css`. Add `.stack-*` spacing utilities and remove inline `style={{ margin }}`
      from pages. No visual change intended; compare screenshots before and after.
- [ ] Toast or status banner component for save confirmations (reuse `.import-message` style).
      Forms currently reset silently.
- [ ] Confirm dialog before **Reset demo data**.
- [ ] Replace the hand-rolled modal in `AvailabilityDialog` with native `<dialog>` and
      `showModal()` for focus trap and focus restore. Keep the existing `.modal` styles.
- [ ] Group labels ("Specialties", "Public availability", "Policy profiles") become
      `<fieldset><legend>`; a `<label>` with no control is an accessibility error.
- [ ] Patients page: edit, deactivate, search. `upsertPatient` already supports `id`.
- [ ] Admin tables collapse to card rows under 620px.
- [ ] Remove the **Admin portal** button from the public header. Link to `/admin` from the
      README and the not-found page instead.
- [ ] Public pages set `document.title` and a meta description per page.
- [ ] Anchor links in `PublicHeader` use plain `<a href="#doctors">` or a scroll effect;
      router `Link` does not scroll to hashes on same-page navigation.
- [ ] Clinic model gains `address`, `phone`, `email`, `hours`, `mapUrl`; the public contact
      block renders them instead of name and city only.

## Phase 3: features, in priority order

1. [ ] **Clinic public profile editor** in settings: tagline, hero copy, hero image, address,
       phone, hours, WhatsApp and map links. Replaces the hard-coded hero and contact strings.
2. [ ] **Appointment request flow**: form on the doctor profile offering days from
       `AvailabilityWindow`; admin inbox with `new | contacted | booked | declined`.
3. [ ] **Directory search and "available today"** using the window and clinic timezone.
4. [ ] **Doctor photos** (data URL in the demo store) with an initials avatar fallback.
5. [ ] **Audit events** appended on every mutation (`auditEvents: AuditEvent[]` in `AppData`);
       the governance flags claim this and nothing records it.
6. [ ] **Visit notes per specialty module**; modules are hint stubs today.
7. [ ] **Richer CSV**: qualifications, languages, availability, accepting; plus export.
8. [ ] **Urdu and RTL**: `ur-PK` is seeded but there is no string table or `dir` handling.
9. [ ] **Login stub** with membership picker and role-gated routes.
10. [ ] **SEO prerendering** of public routes once the public tree is decoupled (Phase 1).

## Deferred on purpose

- Real auth, RLS, API, encryption, HIPAA: backend work, see the README roadmap.
- Dark mode: tokens are ready; not requested.
- Restyling of the public site: explicitly out of scope, the owner likes it.
