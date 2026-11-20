# Deferred Items — quick task 260817-pkx

Out-of-scope issues discovered during execution, NOT fixed (scope boundary: only
auto-fix issues directly caused by this task's own changes).

## Pre-existing eslint errors/warnings in meta/buildSidecarSea.ts (unrelated to this task)

Confirmed present at HEAD (4ab9d986a) BEFORE any of this task's edits — verified by
running eslint against `git show HEAD:meta/buildSidecarSea.ts` directly:

- `buildPostjectArgv()` (L254 pre-edit numbering) — `platform: NodeJS.Platform | string`
  parameter type triggers `@typescript-eslint/no-redundant-type-constituents`
  ("darwin" | "linux" | "win32" is overridden by string in this union type).
- `buildCodesignArgv()` (L378 pre-edit numbering) — same redundant-type-constituents
  error, same parameter shape.
- `nodeDistUrls()` — two `@typescript-eslint/no-unsafe-call` /
  `no-unsafe-member-access` warnings on `.toString()` calls against an `any`-typed
  value (unrelated to the SEA-worker-asset change).

Not touched by this task's Task 1/2/3 edits (`buildPostjectArgv`/`buildCodesignArgv`
signatures and bodies are unmodified). Left as-is per the executor scope boundary.

## Pre-existing eslint warnings in decompressPool.test.ts (unrelated to this task)

Two `@typescript-eslint/no-unsafe-assignment` warnings on `caught = err` inside
pre-existing `.catch((err) => { caught = err })` blocks (the "a worker that throws"
and "a worker that hangs" test cases, both authored before this task). Not touched by
Task 2's additions. Left as-is per the executor scope boundary.

## Note: humbleFlowRegistration.ts's isPackagedSidecar() carries the same stale
## eslint-disable rule name this task fixed in decompressPool.ts

`isPackagedSidecar()` (`src/backend/sidecar/humbleFlowRegistration.ts` ~L161) uses
`// eslint-disable-next-line @typescript-eslint/no-var-requires`, which no longer
matches the actual rule this project's eslint config reports for a `require()` call
(`@typescript-eslint/no-require-imports`) — the directive is a no-op and the file
currently reports one real eslint error at the `require('node:sea')` call site.
Task 2 (`decompressPool.ts`'s `resolveWorkerSpec()`) mirrors this function's shape as
instructed by the plan, but uses the corrected rule name so the new code is actually
lint-clean. `humbleFlowRegistration.ts` itself is untouched by this task's file list —
left as a pre-existing, unrelated file's issue per the executor scope boundary, but
flagged here since it is the exact pattern this task's own code copies from.
