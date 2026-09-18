# Agent instructions for Clinic Hub

These instructions apply to every AI coding agent working in this repository (Claude Code,
Codex, or others). `CLAUDE.md` points here so both tools follow the same rules.

## Before you start

1. Read `README.md` for the product model and current limitations.
2. Read `docs/IMPROVEMENT_PLAN.md`. It is the agreed backlog, ordered by phase. Work the
   earliest unfinished phase unless the user names a different item. Tick checkboxes as you
   finish items and note anything you deliberately skipped.
3. Check `git status`. Preserve uncommitted user changes; never revert or reformat files you
   were not asked to touch.

## Project facts

- Vite, React 19, TypeScript 6, React Router 7, vitest with Testing Library, oxlint.
- `src/domain` is the framework-free domain layer: types, seed, repository, registries,
  resolvers. Keep React out of it.
- Persistence is a `localStorage` demo store. It is not production security.
- Tenant boundary: every read and write is scoped by `organizationId` and `clinicId`. Any new
  mutation must assert tenant match the way `src/domain/repository.ts` does.
- Specialty modules are declarative in `src/domain/specialtyRegistry.ts`. Never hard-code a
  specialty in a page.
- Styling is one design-token stylesheet in `src/index.css`. Reuse tokens and existing
  classes. The current visual design is approved; do not restyle without being asked.

## Working rules

- Smallest safe change that completes the request. No unrelated refactors.
- Every bug fix ships with a test that fails before the fix.
- Run `npm run typecheck && npm run lint && npm run test` before reporting done, and report
  the actual output. Never claim validation you did not run.
- Do not add dependencies unless `docs/IMPROVEMENT_PLAN.md` names one for that item.
- Do not commit `dist/`, `.env`, or any real patient data.
- Commit only when the user asks. Do not push, deploy, or touch external services without
  explicit approval.
- When you finish a plan item, update its checkbox in `docs/IMPROVEMENT_PLAN.md` in the same
  commit.
