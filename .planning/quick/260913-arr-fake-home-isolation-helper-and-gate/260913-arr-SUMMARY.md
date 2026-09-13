---
phase: quick-260913-arr
plan: 01
title: Fake-HOME isolation — helper, convention, conversions and gate
status: complete
completed: 2026-09-13
baseline_sha: 31b833a52
commits:
  - d7d021a05 feat(260913-arr) helper + CLAUDE.md convention (items 1, 2)
  - e387cb09b fix(260913-arr) four spawn blocks, capture harness, decision, exemption (items 3, 4, 5)
  - d0479c148 test(260913-arr) the gate, its negative control, and the todo disposition (item 6)
items_landed: 6/6
key_files:
  created:
    - src/backend/testUtils/fakeHomeProfile.ts
    - src/backend/__tests__/fakeHomeIsolation.test.ts
  modified:
    - CLAUDE.md
    - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
    - src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts
    - meta/captureShellScrollback.ts
    - meta/buildSidecarSea.ts
    - meta/sidecarStartupSmoke.cjs
  moved:
    - .planning/todos/{pending -> completed}/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md
---

# quick-260913-arr: Fake-HOME isolation helper and gate — Summary

Implemented D1–D4 of the fake-HOME isolation specification: a two-profile convention, one helper
owning the eight-variable block, four converted spawn blocks plus one converted harness, one
documented "no", one loud exemption, and a gate with a four-state negative control.

**All six owed items landed.** Nothing deferred.

## What each item became

| # | Owed | Landed |
| - | ---- | ------ |
| 1 | CLAUDE.md two-profile rule (D1) | `### Fake-HOME isolation for direct binary runs (two-profile rule)`, line 148, strictly between the `GSD:conventions` markers (103 / 208) — placement proven by line number, not presence. |
| 2 | Helper (D3) | `src/backend/testUtils/fakeHomeProfile.ts`: `createFakeHomeProfile()` + `FAKE_HOME_ENV_KEYS`, `mkdtemp` 0700 root, `childEnv()`, `registerCapture()`, `dispose()`. Fresh per call (D4), no memoization. |
| 3 | Convert the hand-rolled sites | **Four** blocks, all via `profile.childEnv()`. |
| 4 | Harness converted; build script decided | `captureShellScrollback.ts` converted (both halves); `buildSidecarSea.ts` **not** converted, reason in its docstring. |
| 5 | Exemption comment | `meta/sidecarStartupSmoke.cjs` header; behaviour byte-unchanged. |
| 6 | The gate | `src/backend/__tests__/fakeHomeIsolation.test.ts`, 5 tests. |

## The four planner findings, re-measured at execution

All four of the plan's notes were **confirmed**:

- **N1 — three lzma sites, not two.** `lzmaNativeSeaRealBuild.test.ts` had `spawnCapture` env
  blocks at lines 209, 297 and 415. With `decompressWorkerRealBuild.test.ts:115` that is **four**
  blocks converted, not the three the todo named.
- **N2 — four missing variables, not five.** Every block set exactly `HOME`, `USERPROFILE`,
  `XDG_STATE_HOME`, `LOCALAPPDATA`. Missing: `APPDATA`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_CACHE_HOME`. The leak was real; only its magnitude was overstated in the todo.
- **N3 — CLAUDE.md marker-block risk, recorded below.**
- **N4 — `captureShellScrollback.ts` coupling, handled in both halves.**

### The eight variables — confirmed against `jest.setupContainment.ts`

Read at execution time from its `envExpectations` table (lines 577–586) and its assignments
(466–502). The file agrees with the plan exactly, so nothing had to be overridden:

`HOME`=root, `USERPROFILE`=root, `APPDATA`=root/AppData/Roaming, `LOCALAPPDATA`=root/AppData/Local,
`XDG_CONFIG_HOME`=root/.config, `XDG_STATE_HOME`=root/.local/state,
`XDG_DATA_HOME`=root/.local/share, `XDG_CACHE_HOME`=root/.cache.

### `meta/buildSidecarSea.ts` — DECIDED: not converted

Both grounds re-verified before accepting:

1. **It never executes its own product.** Every `spawnArgv()` call site spawns a *tool* — esbuild,
   `node` (SEA blob), `tar`, `postject`, `codesign`, `lipo`. The produced binary appears only ever
   as an **argument** (`lipo -archs <binaryPath>`, `codesign --sign - <binaryPath>`), never as the
   command. So there is no child that could read a profile.
2. **Its children legitimately need the real profile** — `codesign --sign -` reads the macOS
   keychain (which is not `HOME`-isolated anyway), and esbuild/postject cache under the real `HOME`.

Written into the module docstring, with the condition that would flip it.

## The gate, and its negative control

Scope: `.ts`/`.tsx`/`.cjs`/`.js` under `src/` and `meta/`, `node_modules`/`build`/`dist`/`coverage`
pruned — **1204 files** measured. Every match runs on comment-stripped source; the one deliberate
exception is the exemption-anchor assertion, whose target *is* a comment.

**Two-condition rule, chosen from measurement rather than guessed.** Only 4 of the 1204 files carry
an env-key property assignment at all, and only 2 of those also spawn. Requiring *both* a
spawn-family call and a key assignment means `src/backend/__tests__/protocol.test.ts` (which sets
`XDG_CONFIG_HOME` inside a `jest.mock('process')` and spawns nothing) is correctly out of scope
**with no carve-out needed** — the exemption table stayed at exactly one entry, designed in rather
than patched on after a false fire.

Negative control, all four states, each jest run issued as its own process (never chained to the
write):

| State | Result |
| ----- | ------ |
| A — clean tree | GREEN, **5 tests collected** |
| B — control present | **RED**, message names `src/backend/negativeControlFakeHome.ts (assigns HOME, XDG_STATE_HOME)` |
| C — control deleted | GREEN, 5 tests |
| D — restoration | `git status --porcelain src meta` shows only the intended new gate file |

**Exemption integrity, proven separately:** renaming `meta/sidecarStartupSmoke.cjs` away turns the
gate RED on the "exempt file must exist" arm, naming that file; restoring it returns GREEN. The
exemption is therefore not a free pass.

## Measured results (this run, not compared to any recorded figure)

| Gate | Result |
| ---- | ------ |
| `npx tsc --noEmit` | exit 0 |
| `pnpm lint` | exit 0 — production **1123/1124**, tests **638/638** |
| `pnpm smoke:sidecar` | **PASS** — built, started, exited 0 on stdin EOF |
| Both RealBuild suites | **PASS**, in a run collecting 4838 tests |
| `fakeHomeIsolation.test.ts` | PASS, 5 tests |
| Full Backend project | 215/216 suites, 4841 passed (one pre-existing failure, below) |
| Meta project | 38/39 suites (one pre-existing failure, below) |
| `pnpm planning-gates` | **11/11**, exit 0 |

`pnpm lint`'s tests scope was already at its ceiling (638/638, **zero** free slots) before this
work. The new gate file added **zero** warnings, so the ceiling still holds without being raised.

## Two pre-existing failures, both proven not mine

Neither was absorbed or hand-waved as "pre-existing" — each was tied to a named baseline
(`31b833a52`) and a demonstrated mechanism.

**1. `src/backend/humble/__tests__/expirationAlerts.test.ts` — timezone-derived.** The fixture is
`expiration: '2026-08-01'`, and the notification body renders as `"...expires on 7/31/2026"`. The
offending `'7'` comes from the **July** local-time date, not from the `keyindex: 7` the assertion
was written to police. Proven causally by holding the tree constant and varying only `TZ`:

```
TZ=UTC                  -> exit 0   Tests: 15 passed, 15 total
TZ=America/Los_Angeles  -> exit 1   Tests: 1 failed, 14 passed
```

`git diff 31b833a52 -- src/backend/humble/` is empty, and the assertion is byte-identical at the
baseline. This is a real latent defect in that suite (the assertion cannot distinguish a leaked
`keyindex` from a date digit), but it belongs to Humble, not to this task.

**2. `meta/__tests__/lintTranslations.test.ts` — 816 `humbleKeys.*` drift.** `lintTranslations`
reads only `public/locales` and `meta/i18nCatalogPresenceBaseline.json`; it never scans `src/` or
`meta/` source. `git diff 31b833a52 --name-only -- public/locales meta/i18nCatalogPresenceBaseline.json`
is **empty**, so this gate's entire input set is byte-identical to the baseline and its verdict is
the baseline verdict.

> Worth recording: my first hypothesis here — "the other session added English-only keys" — was
> **refuted** by measurement. At `31b833a52` all 49 locales already carry `humbleKeys` children
> (en has 30, and **zero** non-en locales have none). The drift is against the *presence baseline
> file*, not the catalogs. The input-identity argument above is what actually settles it.

## Findings and risks to carry forward

**N3 — the new convention lives inside a GSD-managed marker block.** `CLAUDE.md`'s `## Conventions`
sits between `<!-- GSD:conventions-start source:CONVENTIONS.md -->` and `<!-- GSD:conventions-end -->`.
The only `CONVENTIONS.md` in the repo is `.planning/spikes/CONVENTIONS.md`, and it contains **zero**
occurrences of the pre-existing todo-triage rule — so that rule was written directly into the
managed block and has survived there. The new rule follows that precedent exactly, per D1 (which
explicitly rejected the spikes file as host). **Residual risk, recorded rather than routed around:**
a future regeneration of that block from a source lacking both rules would silently delete them.
Nothing currently gates this.

**The `jest --selectProjects <project> <path>` form does not filter.** Passing test paths as
positional arguments alongside `--selectProjects` ran the *entire* Backend project twice during
this task. `--runTestsByPath` is the form that actually isolates a suite, and it is what produced
the trustworthy per-suite counts above. Also confirmed: the meta project's `displayName` is
`Meta`, not `meta` — the lowercase form collected **zero** tests and exited 1, which was treated as
a failure and re-run, not read as a pass.

**Assertion meanings are unchanged.** Widening each block from four variables to eight changes
isolation, not assertions: `spawnCapture`'s signature, the `liveChildren` reaper, the
`afterAll(reapLiveChildren)` ordering and every `expect()` are untouched, and both RealBuild suites
pass. No assertion's meaning shifted, so there was nothing to absorb.

**D4 cost was not measured and deliberately not traded away.** The suites pass comfortably
(`lzmaNativeSeaRealBuild` at 25.7 s, dominated by its real cold `pnpm build:sidecar-sea`), so
fresh-per-invocation never became painful and no cold-vs-warm delta for the SEA binaries was
needed. No profile reuse was introduced.

## Deviations from plan

1. **`FINDING.md` folded into this SUMMARY.** The plan's `<output>` block asked for a separate
   `260913-arr-FINDING.md`; the executing instructions asked for `260913-arr-SUMMARY.md`. Rather
   than split overlapping content across two documents, every item the FINDING owed (the confirmed
   eight-variable list, the three-vs-two lzma count, the `buildSidecarSea` decision and reason, the
   negative control's red message, the measured lint/planning-gates counts, and the N3 marker-block
   risk) is recorded above.
2. **The gate's rule is two-condition** (spawn-family call **and** key assignment) rather than key
   assignment alone. Chosen from the 1204-file measurement so that the single exemption entry could
   be designed in rather than added to silence a false fire — which is the pattern CLAUDE.md
   forbids. `ALLOWED_TO_ASSIGN` documents that its `jest.setupContainment.ts` entry records intent
   and does not suppress a live hit.
3. **`resolveGamelibLogPath()` takes the profile env** rather than reading `process.env`/`homedir()`
   internally. Required by N4; verified safe because the function is not exported and its suite
   (`meta/__tests__/captureShellScrollback.test.ts`) covers only `analyzeCapture`, `assertRepoRoot`
   and the exported regexes. That suite passes.

## Self-Check: PASSED

- `src/backend/testUtils/fakeHomeProfile.ts` — FOUND
- `src/backend/__tests__/fakeHomeIsolation.test.ts` — FOUND
- `.planning/todos/completed/2026-09-12-live-gate-scripts-need-fake-home-isolation-by-default.md` — FOUND
- `.planning/todos/pending/…fake-home…` — correctly ABSENT
- `src/backend/negativeControlFakeHome.ts` — correctly ABSENT (control removed)
- `meta/sidecarStartupSmoke.cjs` `spawnSync` options — still exactly `{ cwd, encoding, timeout }`
- No dirt path staged in any commit
