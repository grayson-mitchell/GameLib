---
phase: quick-260915-ajd
plan: 01
subsystem: backend
tags: [winetricks, ipc, types, parser, tdd]

requires: []
provides:
  - "Pure, dependency-free `parseWinetricksListAll(chunks: string[]): WinetricksComponent[]` parser module"
  - "Shared `WinetricksComponent { verb, title, category, cached }` type across backend, IPC and frontend"
  - "`Winetricks.listAvailable` rewired from `dlls list` + `fonts list` to a single `list-all` invocation with `LANG=C` pinned"
affects: [winetricks, backend/tools, frontend/Winetricks]

tech-stack:
  added: []
  patterns:
    - "Line-oriented parsing over joined stdout chunks instead of per-chunk word extraction, to make output shape independent of pipe-buffer timing"
    - "Positive shape-match rejection of stdout noise lines, rather than a denylist or fixed-line skip"
    - "Narrowly-scoped `envOverrides` parameter on a shared runner function, defaulting to a no-op spread so other call sites are behaviourally unchanged"

key-files:
  created:
    - src/backend/tools/winetricksListParse.ts
    - src/backend/tools/__tests__/winetricksListParse.test.ts
  modified:
    - src/common/types.ts
    - src/common/types/ipc.ts
    - src/backend/tools/index.ts
    - src/frontend/components/UI/Winetricks/index.tsx
    - src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
    - src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx

key-decisions:
  - "Took the list-all path (C-2): one wine invocation instead of two, category comes for free, and apps/benchmarks/settings verbs are no longer silently dropped"
  - "publisher/year stay embedded in title rather than becoming their own fields, which is what makes the allcodecs nested-parens title structurally safe to extract"
  - "LANG=C is the load-bearing env override, not LC_ALL alone; the override is scoped to only the list-all call via a new optional envOverrides parameter on runWithArgs"

patterns-established:
  - "Pure parser modules under src/backend/tools/ that import only shared types, so they can be unit tested without dragging in the storeManagers/electron graph"

requirements-completed: [QUICK-260915-ajd]

duration: ~35min
completed: 2026-09-15
---

# Quick Task 260915-ajd: Change listAvailable to return verb+title+category+cached Summary

**Winetricks' `listAvailable` now returns `{verb, title, category, cached}[]` via a new pure line-oriented parser over `list-all` output, replacing the old `dlls list` + `fonts list` chunk-leading-word extraction, and the type change is propagated through IPC to a frontend that behaves identically (filter/render/install still key off `verb` alone).**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-15
- **Tasks:** 3/3 completed
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Added a pure, dependency-free `parseWinetricksListAll` parser module with 16 unit tests, all driven by synthetic fixtures (no shelling out to the real winetricks binary), covering both printf shapes, all four flag variants, chunk coalescing, the >24-char verb trap, stdout noise rejection, the nested-parens title, the prefix-block skip, category derivation, header-ordering, pre-header line dropping, and deduplication.
- Rewired `Winetricks.listAvailable` to a single `list-all` invocation with `LANG=C`/`LC_ALL=C` pinned only on that call, replacing the two-call `dlls list` + `fonts list` pair.
- Propagated `WinetricksComponent` through `common/types.ts`, `common/types/ipc.ts`, and the frontend Winetricks search panel, with zero UI redesign and zero new user-facing strings.
- Ran and confirmed RED on all five plan-mandated negative controls before finalizing the implementation.

## Task Commits

Each task was committed atomically, following the plan's TDD gate sequence for Task 1:

1. **Task 1 (RED): add failing test for winetricks list-all parser** - `976080382` (test)
2. **Task 1 (GREEN): implement pure winetricks list-all parser** - `a1bace4f3` (feat)
3. **Task 2: rewire listAvailable to list-all with LANG pinned, update IPC type** - `982b35d7d` (feat)
4. **Task 3: propagate the type to the frontend with behaviour held constant** - `49f3ce261` (feat)

No refactor commit was needed — the implementation passed cleanly on the first GREEN pass with no cleanup required.

_Plan-level TDD gate sequence verified: `test(...)` commit (976080382) precedes the `feat(...)` commit (a1bace4f3) that made it pass._

## Files Created/Modified

- `src/backend/tools/winetricksListParse.ts` - New pure parser: `parseWinetricksListAll(chunks: string[]): WinetricksComponent[]`. Header-first ordering, positive verb-shape match, end-anchored flags-group strip, first-occurrence dedup.
- `src/backend/tools/__tests__/winetricksListParse.test.ts` - 16 synthetic-fixture unit tests covering every `<behavior>` bullet from the plan.
- `src/common/types.ts` - Added `WinetricksComponent { verb, title, category, cached }`, with a comment recording why publisher/year are NOT split out and how a future plan must anchor if it adds them.
- `src/common/types/ipc.ts` - `winetricksAvailable` now declares `Promise<WinetricksComponent[]>`; import block updated alphabetically.
- `src/backend/tools/index.ts` - `runWithArgs` gained an optional fifth `envOverrides` parameter, merged last over the platform env branches (no-op by default). `listAvailable` now makes one `list-all` call with `{ LANG: 'C', LC_ALL: 'C' }` and returns `parseWinetricksListAll(output ?? [])`.
- `src/frontend/components/UI/Winetricks/index.tsx` - `allComponents` state is now `WinetricksComponent[]`; `install(component: string)` unchanged.
- `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx` - `Props.allComponents`/`searchResults` are `WinetricksComponent[]`; filter matches `c.verb` only; suggestion rows key/render/install on `c.verb`; the mouse-click-race fix is untouched.
- `src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` - Local `Props` mirror now imports `WinetricksComponent`; fixture is two full component objects (`vcrun`, `corefonts`); every original assertion, including that `onInstallClicked` receives the bare verb string `'vcrun'`, is unchanged.

## Decisions Made

- **C-2 taken as recommended:** switched to `list-all` rather than keeping the `dlls list` + `fonts list` pair. One wine invocation instead of two, `category` comes for free, and the previously-dropped apps/benchmarks/settings verbs are now reachable. Measured counts: `dlls` (328) + `fonts` (42) = 370 under the old pair, versus 567 under `list-all` (apps 57, benchmarks 8, dlls 328, fonts 42, settings 132 — F-5's static `w_metadata` count).
- **Publisher/year left embedded in `title`:** the agreed shape has exactly four keys. With no `(` to anchor a publisher/year extraction on, the `allcodecs` line's nested parentheses cannot be truncated — this is a structural guarantee, not a tested-around one. A comment above `WinetricksComponent` in `common/types.ts` tells any future plan adding these fields to anchor on the LAST parenthesised group before the trailing `[flags]`, never the first.
- **`envOverrides` scoped narrowly:** rather than changing `runWithArgs`'s behavior for every call, a fifth optional parameter defaults to `undefined` (a no-op spread), so `run`/`install`/GUI call sites are byte-identical to before. Only `listAvailable` passes `{ LANG: 'C', LC_ALL: 'C' }`.

## Called-out behaviour changes (calibrated, per plan)

**C-1 — the returned list becomes deterministic and gains the noise filter. It does not go from broken to working.** Per the plan's F-9 measurement against the real winetricks binary, today's chunk-leading-word parse already returned an essentially complete list on most runs — because `winetricks_list_all` sources each metadata file in its own subshell with its own `printf`, so the pipe almost always flushes one line per write. Two consecutive live runs measured 329 total lines: one run lost 3 verbs to chunk coalescing (326 usable chunks out of 329 lines, one chunk carrying 5 lines), the very next run lost 0 (329 chunks == 329 lines, no coalescing at all). **This was never a broken function returning "a handful of chunk-leading words"** — it was a timing-dependent, low-rate, nondeterministic dropout, plus one platform-dependent junk entry (macOS's `warning: taskset/cpuset not available on your platform!` stdout line, which today became a component literally named `warning:`). Both are eliminated by this plan: the line-oriented parser is timing-independent by construction (no chunk boundary can ever coalesce two lines' worth of decision), and the positive verb-shape match structurally rejects the `warning:` line (and any future bare stdout `echo`) without a denylist. The value delivered is **determinism and noise rejection**, not a rescue from a non-functional baseline.

**C-2 — `list-all` replaces `dlls list` + `fonts list`.** Implemented as described above. This is the change that actually widens what the user can find: roughly 370 verbs (dlls + fonts only) to 567 verbs (apps, benchmarks, dlls, fonts, settings). The `===== prefix =====` block, which under `list-all` emits bare category names (`apps`, `dlls`, `fonts`, `settings`) rather than verbs, is skipped as a whole block by the parser (keyed on the category name being exactly `prefix`), not filtered by shape — those category-name lines pass the verb shape test (`/^[a-z0-9_][a-z0-9_=]*$/`) perfectly, so shape alone cannot distinguish them.

## F-4 correction (LANG vs LC_ALL)

`winetricks_list_all` localises its `[downloadable]`/`[cached]` flag words via `case ${LANG} in` — it switches on **`LANG`**, not `LC_ALL`. Several locales (bg, da, de, fr, pl, pt, ru, uk, zh_CN, zh_TW) get a translated flag word (e.g. German `gecached`). **Pinning only `LC_ALL=C` would have been inert against this defect** — the parser's `cached` derivation would silently stop working for any user running GameLib in one of those locales. The implementation pins `LANG=C` as the load-bearing variable and `LC_ALL=C` as belt-and-braces for any child tool, scoped to only the `list-all` call — the install path (`Winetricks.install`, `Winetricks.run`) keeps the user's own locale via `runWithArgs`'s unchanged default (`envOverrides` defaults to `undefined`, a no-op spread). Note per the plan: the live probe that originally surfaced this area set *both* `LANG` and `LC_ALL`, so it did not by itself discriminate between them — this correction's basis is the winetricks script source (`case ${LANG} in`), which is dispositive, not the probe.

## Negative controls (all five run and confirmed RED)

Each was applied against a temporary copy of the real module/test, run scoped to the relevant test group, confirmed RED, then the real files were restored and diffed byte-identical against the pre-control backup before continuing:

1. **Reverted to a per-chunk `split(' ', 1)[0]` parser** → all 3 coalescing tests failed (`Received length: 1` instead of 5; wrong truncated verb `=====`/`erb` instead of `splitverb`). **RED confirmed.**
2. **Disabled the verb shape check** (`if (!VERB_SHAPE_RE.test(verb))` replaced with `if (false)`) → the noise-rejection test failed: `warning:` appeared in the result (`Received array: ["before", "warning:", "after"]`). **RED confirmed.**
3. **Anchored title extraction on the first `(`** → the `allcodecs` test failed: `title.includes('except wmp')` returned `false` (title was truncated to just `All codecs `). **RED confirmed.**
4. **Moved the header check after the verb shape test** → the category test failed: with `=====` unable to pass the shape test's first-character requirement, headers were never recognized, `currentCategory` stayed `null` forever, and every line was skipped (`Received: Array []` instead of the five expected categories). **RED confirmed.**
5. **Flipped one flags fixture from `[downloadable,cached]` to `[downloadable]`** → the four-flag-variants test failed: `cached` for the `both` verb read `false` instead of the expected `true`. **RED confirmed.**

## F-7 propagation surface

**Confirmed complete — `tsc` found no site F-7 had missed.** After Task 2's rewrite, `pnpm codecheck` produced exactly one error, and it was the expected frontend site (`Winetricks/index.tsx(72,24)`) that Task 3 fixes; no backend, common, or preload errors appeared. The three passthrough sites F-7 flagged as "needs no edit, verify rather than assume" (`ipc_handler.ts:68`, `wineToolsFlowRegistration.ts:301`, `preload/api/wine.ts:16`) were confirmed generic/shape-agnostic by inspection and required no changes, matching the plan's prediction exactly.

## Verification results

- `pnpm exec jest --selectProjects Backend --passWithNoTests src/backend/tools/__tests__/winetricksListParse.test.ts` — **EXIT=0**, 16/16 passed.
- `pnpm exec jest --selectProjects Frontend --passWithNoTests src/frontend/components/UI/Winetricks` — **EXIT=0**, 4/4 passed (mouse-race suite unchanged in behaviour).
- `pnpm codecheck` — **EXIT=0**, whole project.
- `pnpm lint` — **EXIT=0**. `SRC_CEILING` (1123) and `TESTS_CEILING` (638) both matched exactly, unbumped — no new warnings introduced. `production: PASS | tests: PASS`.
- `git diff --stat` against baseline `fa2ad5030` touches exactly the 8 files listed in the plan's `files_modified` — no more, no less. Zero changes under `public/locales/`; zero new `t(` call sites confirmed via diff inspection.
- All five negative controls run and confirmed RED (see above).

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes were required beyond what the plan already specified; no architectural decisions arose; no auth gates encountered; no package installs.

## Known Stubs

None. `title`, `category`, and `cached` are carried through the full type but deliberately unrendered in the UI — this is the plan's explicit, named end state (see `<out_of_scope>`), not an unintentional stub.

## Threat Flags

None. All threat-relevant surface introduced by this plan (the new parser's regex DoS exposure, the wider IPC payload, the noise-line spoofing vector) was already enumerated in the plan's own `<threat_model>` (T-ajd-01 through T-ajd-05) and mitigated as specified: end-anchored, non-nested-quantifier regexes throughout the parser; no new unbounded buffering (the chunk array was already fully buffered by `runWithArgs` before `listAvailable` saw it); positive shape-match rejection of non-component lines rather than a denylist; `title`/`category` carried but never rendered.

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk. All 4 commit hashes
(976080382, a1bace4f3, 982b35d7d, 49f3ce261) confirmed present in `git log
--oneline --all`.
