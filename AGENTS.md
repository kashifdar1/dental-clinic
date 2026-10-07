# Agent instructions for Clinic Hub

These instructions apply to every AI coding agent working in this repository (Claude Code,
Codex, or others). `CLAUDE.md` points here so both tools follow the same rules.

## Before you start

1. Read `README.md` for the product model and current limitations.
2. Read `docs/GAP_ANALYSIS.md` completely. It is the single authoritative product scope,
   architecture, gap analysis, dependency order, and development backlog. The older
   `docs/IMPROVEMENT_PLAN.md` and `docs/PLATFORM_PLAN.md` are retained as source/history only.
3. Check `git status`. Preserve uncommitted user changes; never revert or reformat files you
   were not asked to touch.
4. Before any implementation, code-writing tool call, dependency change, migration, or external
   development action, identify the user's requested item and the earliest unfinished prerequisite
   in `docs/GAP_ANALYSIS.md`. Tell the user the recommended priority.
5. If the request matches the current priority and is safe, proceed under the user's routing mode.
   If it skips an unfinished prerequisite, conflicts with the agreed architecture, or reintroduces
   out-of-scope clinical data, do not edit or delegate yet. Explain the conflict and ask for explicit
   confirmation to proceed with the requested override. The user's affirmative reply is the required
   consent. Read-only analysis and urgent security/data-loss diagnosis do not require this extra gate.

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
- Do not add dependencies unless `docs/GAP_ANALYSIS.md` names or permits them for that phase, or the
  user explicitly approves the dependency after the priority/architecture check above.
- Do not commit `dist/`, `.env`, or any real patient data.
- Commit only when the user asks. Do not push, deploy, or touch external services without
  explicit approval.
- When you finish a plan item, update its checkbox and checkpoint in `docs/GAP_ANALYSIS.md` in the
  same commit. Record any owner-approved priority override and any deliberately skipped prerequisite.
