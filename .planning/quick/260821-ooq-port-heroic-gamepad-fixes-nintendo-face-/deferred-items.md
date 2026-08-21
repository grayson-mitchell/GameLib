# Deferred Items — quick task 260821-ooq

Out-of-scope discoveries found while running the plan's lint/codecheck gates.
Not fixed here per the executor's scope boundary (pre-existing, unrelated to
this task's files).

## `pnpm lint` pre-existing errors in `meta/hardcodedStringGate.ts`

9 `@typescript-eslint/no-unnecessary-type-assertion` errors at lines 466, 520,
535, 731, 734, 773, 784, 830, 983. Confirmed pre-existing (file untouched by
this plan) via `npx eslint meta/hardcodedStringGate.ts` before any edits in
this task. Not caused by, and not fixed by, quick task 260821-ooq.

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

The `meta/hardcodedStringGate.ts` lint item above remains OPEN.
