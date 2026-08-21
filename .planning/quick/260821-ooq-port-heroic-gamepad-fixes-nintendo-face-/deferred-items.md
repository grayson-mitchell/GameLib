# Deferred Items — quick task 260821-ooq

Out-of-scope discoveries found while running the plan's lint/codecheck gates.
Not fixed here per the executor's scope boundary (pre-existing, unrelated to
this task's files).

## `pnpm lint` pre-existing errors — RESOLVED 2026-08-21

9 `@typescript-eslint/no-unnecessary-type-assertion` errors at lines 466, 520,
535, 731, 734, 773, 784, 830, 983. Confirmed pre-existing (files untouched by
this plan) before any edits in this task. Not caused by quick task 260821-ooq.

**File attribution corrected 2026-08-21.** This entry originally named
`meta/hardcodedStringGate.ts`. That is wrong — that file has only warnings, zero
errors. The line numbers were right but the path was not: all 9 errors were in
`src/backend/storeManagers/steam/__tests__/removeCopies.test.ts`. The mistake is
easy to make because `npx eslint <file>` and repo-wide `pnpm lint` print
interleaved output, and `hardcodedStringGate.ts` emits a long run of
`no-unsafe-*` **warnings** immediately above. Always confirm severity and path
together — `eslint -f json` filtered on `severity === 2` is unambiguous.

**RESOLVED 2026-08-21 (`acab0e0b4`), at the user's request.**
`@types/jest` declares `requireMock<TModule extends {} = any>(name): TModule`,
so TypeScript infers `TModule` from the assertion's own contextual type, making
`jest.requireMock('x') as { ... }` a genuine no-op. All 9 sites moved to the
explicit type-parameter form already used elsewhere in that same file at the
`os` mock. Typing strength is unchanged — both forms return an unchecked
`TModule`. Repo-wide eslint is now **0 errors** (3939 warnings, unchanged).

## Full Frontend jest project: one pre-existing unrelated failure — RESOLVED 2026-08-21

`src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts` --
`D4: the new button carries the file's own class string -- pinned pre/post-edit
counts` fails: expected 18 occurrences of a class-string pattern in
`GameSubMenu/index.tsx`, found 19. This plan's two commits touch only
`src/frontend/screens/ConsoleMode/controller.ts`,
`src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts`,
`src/frontend/helpers/gamepad.ts` and
`src/frontend/helpers/__tests__/gamepadDisconnect.test.ts` -- `GameSubMenu`
and its test are untouched by this plan (`git diff --stat` across both
commits confirmed). A recent unrelated commit (`260821-le0`, "add Remove all
copies sweep for orphaned Steam installs") appears to have shifted the
pinned count; that pin needs re-baselining by whoever owns that gate, not by
this quick task.

**RESOLVED 2026-08-21 (`3e8ded873`), in this same quick task at the user's request.**
Re-baselined onto the property D4 guards rather than bumping `17 + 1` to `18 + 1`.
The count was the wrong instrument in both directions: it went false-RED on any
unrelated button added to the file, and it was false-GREEN-able, since a total is
silently satisfiable if the install-options button loses the class while another
gains one (demonstrated concretely before the change). D4 now reads the class off
that specific button via its unique `onClick` handler; `D4b` keeps the
"class is genuinely shared" half with a `toBeGreaterThan(1)` check that is stable
under additions and removals; and a `D4 DISCRIMINATOR` spec carries the
anti-vacuity proof inside the suite. Frontend project now 1858/1858.

## Still open: repo-wide `prettier --check` drift (NOT swept here)

`removeCopies.test.ts` was already prettier-dirty at `HEAD~1` — **71 differing
lines**, none of them at the 9 sites above (verified with `prettier
--stdin-filepath` against the real path, so config resolution matches the
in-repo run). The `acab0e0b4` fix was deliberately committed _without_ a
`prettier --write` sweep: reformatting would have buried a 25-line behavioural
diff in ~110 lines of unrelated churn. It added no new drift (0 prettier
complaints land on any changed line) and incidentally reduced the pre-existing
count from 71 to 57.

This is not local to one file. `.github/workflows/lint.yml` runs `pnpm prettier`
(`prettier --check .`) as a gate, and that gate is red repo-wide, independent of
any change in this quick task. Re-baselining it is a standalone task — it should
be one pure-formatting commit, kept clear of behavioural changes.

Separately, two config landmines to resolve before any such sweep:

- `src/preload/.prettierrc` sets `printWidth: 120`, overriding the root
  `.prettierrc.json` (which sets no `printWidth`, so root defaults to 80).
  Files under `src/preload/` are therefore formatted to a different width than
  the rest of the repo.
- `.editorconfig`'s `[{*.ts, *.tsx, *.js}]` section has a space after each
  comma. EditorConfig treats brace alternatives literally, so ` *.tsx` and
  ` *.js` (leading space) match nothing — that section only ever applies to
  `*.ts`.
