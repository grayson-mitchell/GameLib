# Deferred Items — quick task 260821-ooq

Out-of-scope discoveries found while running the plan's lint/codecheck gates.
Not fixed here per the executor's scope boundary (pre-existing, unrelated to
this task's files).

## `pnpm lint` pre-existing errors in `meta/hardcodedStringGate.ts`

9 `@typescript-eslint/no-unnecessary-type-assertion` errors at lines 466, 520,
535, 731, 734, 773, 784, 830, 983. Confirmed pre-existing (file untouched by
this plan) via `npx eslint meta/hardcodedStringGate.ts` before any edits in
this task. Not caused by, and not fixed by, quick task 260821-ooq.

## Full Frontend jest project: one pre-existing unrelated failure

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
