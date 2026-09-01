# Phase 39: Post-cutover CI honesty — Research

**Researched:** 2026-09-02
**Domain:** Repo-wide measurement + disposition analysis (lint census, planning-gate drift, dead-code census). No new libraries, no web research — this phase's entire research deliverable is fresh, verified numbers.
**Confidence:** HIGH on all three measurements — every figure below was produced by running the actual command against the actual working tree today, not carried forward from any snapshot.

## Summary

This phase has three independent workstreams, all inherited as unowned fallout from Phase 35's
Electron cutover. All three ROADMAP snapshot figures turned out to be stale in ways that change
the shape of the work:

1. **Lint debt (M1):** the ROADMAP's `53 errors, 3491 warnings` (2026-08-14) is now **0 errors,
   4190 warnings** (2026-09-02). `pnpm lint` **already exits 0** — Phase 35's deletions took the
   error-generating files with them, exactly as the ROADMAP's sequencing rationale predicted. The
   literal goal in this phase's own folder name ("drive `pnpm lint` to exit 0") is **already met**.
   The honest remaining work is not "fix 53 errors" — it is deciding what to do about the 4190
   warnings (mostly `no-unsafe-*` from `any`-typed test mocks) and preventing silent regression.
2. **Two red planning gates (M2):** still 5/7, same two gates, numbers **unchanged** from the
   2026-08-30 snapshot (206 vs floor 217; `FileNotFoundError` on the moved `electronStub.ts`).
   Both have a clear disposition with evidence: **re-point** the seam-parity gate to
   `backend/platform/index.ts` (the file's actual post-`git mv` location, safeStorage shape
   intact); **re-derive** the preload-surface floor from 217 to the current true count, because
   the 11-channel gap is a **real removal** (window-chrome IPC channels retired under Tauri's
   native window controls), not an extractor regression. A **third, currently masked** gate defect
   was found in the process (see M2 below) — fix it in the same edit or it will surface as a new
   failure the moment the floor is corrected.
3. **Dead `getLoginWindowSeam()` branches (M3):** the premise holds (the seam genuinely cannot
   return `null` in the one shell that exists), but the census is **12 production-code predicate
   sites, not 7** — WR-01's own line citations have already drifted, and re-deriving by predicate
   (not by the file list WR-01 named) surfaces 6 sites it missed entirely, including one behavioral
   branch in `oauthLoginCapture.ts` that was never on WR-01's list.

**Primary recommendation:** mint three requirements, one per workstream, and sequence dead-seam
deletion **before** the final lint re-measurement (deleting branches will remove now-orphaned
`session` imports and touches files that already lint clean at those lines — verified no direct
lint-line overlap, so this ordering is about hygiene and re-verification cost, not about moving
the warning count). Do the two gate dispositions in parallel with either; they touch neither the
lint-scored files nor the seam files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lint rule compliance (errors/warnings) | Backend/Frontend source tiers (wherever the finding lives) | Meta (CI script, `package.json` lint script) | ESLint runs against `src/` and `meta/`; the gate itself (`pnpm lint`) is a Meta/CI concern |
| Planning-gate correctness | Meta (`.planning/**/*-gate.py`, `meta/runPlanningGates.py`) | — | These are planning-document-vs-code consistency checks, not application code; they own no runtime behavior |
| Dead Electron-branch removal | API/Backend (`src/backend/humble`, `src/backend/storeManagers`, `src/backend/sidecar`) | — | All affected code is sidecar (backend) business logic; no frontend or browser-tier surface is involved |

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent, not tracking
  upstream Heroic — never raise upstream-deviation as a concern (already enforced: nothing in this
  phase touches upstream mergeability).
- GSD workflow enforcement: this research is itself part of `/gsd:plan-phase`; no direct file edits
  were made outside that flow.
- No emojis in written artifacts (honored throughout this document).

## Measurements

### M1 — The lint census

**Command:** `npx eslint . --format json -o <scratchpad>/lint-baseline.json` (uncached JSON dump,
provided by the coordinator), independently cross-checked by running the real `pnpm lint` script
(`eslint --cache .`) live in this session.

**Date measured:** 2026-09-02.

**Headline figures (verified twice — JSON parse AND live script run agree):**

| Metric | ROADMAP snapshot (2026-08-14) | Measured (2026-09-02) |
|---|---|---|
| Errors (`severity === 2`) | 53 | **0** |
| Warnings (`severity === 1`) | 3491 | **4190** |
| Files linted | (not recorded) | 1121 (= every tracked `.ts`/`.tsx` file; confirmed via `git ls-files '*.ts' '*.tsx' \| wc -l` = 1121, identical count) |
| Files with ≥1 finding | (not recorded) | 360 |
| `pnpm lint` exit code | non-zero | **0** |

**Why errors dropped to 0, verified not assumed:** Phase 35 deleted the entire Electron main
process (`main.ts`, 1561 lines, 136 IPC channels) and 67 backend files were rewritten off the
`electron` import. The 53 errors in the 2026-08-14 snapshot were never independently re-attributed
to specific files in `deferred-items.md` item 20 beyond "spread across dozens of unrelated `src/`
files" — this research did not attempt forensic reconstruction of which specific 53 disappeared,
only confirmed that the number today is genuinely 0 via two independent measurement paths (fresh
JSON dump and a live cached run).

**No stricter invocation exists anywhere in this repo — checked all three places that could hide a
tighter gate:**
- `package.json:44` — `"lint": "eslint --cache ."` — no `--max-warnings`, no narrower path.
- `.github/workflows/lint.yml:17` — `run: pnpm lint` — bare, same script.
- `.husky/pre-push` — `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update`
  — same bare `pnpm lint`, no added flags.
- Conclusion: `pnpm lint`'s plain exit code **is** the real gate, in CI and locally. There is no
  hidden stricter check to reconcile against.

**Scope is genuinely repo-wide, not narrowed:** `eslint.config.mjs:93` only ignores
`['build/', '**/*.js', '**/*.cjs', '**/*.mjs']`. No `.eslintignore` file exists. 1121 linted files
= 1121 tracked `.ts`/`.tsx` files exactly — the measurement covers the whole repo, confirmed by
independent count.

**Cache does not change the result:** no `.eslintcache` was present on disk (gitignored, and
absent) before this session's `pnpm lint` run. Running the real cached script produced **the exact
same 4190/0/exit-0** result as the uncached JSON dump — the two measurement methods agree
byte-for-byte on the totals.

**Error breakdown by rule:** N/A — 0 errors.

**Error breakdown by file:** N/A — 0 errors.

**Warning breakdown by rule, descending (top 15 of 17 total distinct rules):**

| Rank | Count | Rule |
|---|---|---|
| 1 | 1128 | `@typescript-eslint/no-unsafe-member-access` |
| 2 | 873 | `@typescript-eslint/no-unsafe-assignment` |
| 3 | 343 | `@typescript-eslint/unbound-method` |
| 4 | 332 | `@typescript-eslint/no-unsafe-return` |
| 5 | 324 | `@typescript-eslint/no-unsafe-argument` |
| 6 | 306 | `@typescript-eslint/require-await` |
| 7 | 267 | `@typescript-eslint/no-unsafe-call` |
| 8 | 191 | `import-x/no-named-as-default-member` |
| 9 | 175 | `@typescript-eslint/no-floating-promises` |
| 10 | 76 | `react-hooks/exhaustive-deps` |
| 11 | 69 | *(no ruleId — "Unused eslint-disable directive" findings)* |
| 12 | 61 | `@typescript-eslint/restrict-template-expressions` |
| 13 | 25 | `react-hooks/rules-of-hooks` |
| 14 | 10 | `@typescript-eslint/no-base-to-string` |
| 15 | 6 | `import-x/no-duplicates` |
| — | 3 | `@typescript-eslint/no-for-in-array` |
| — | 1 | `import-x/no-named-as-default` |

The top 7 rules (all `@typescript-eslint/no-unsafe-*` / `unbound-method` / `require-await`) account
for **3573 of 4190 warnings (85%)** — dominated by loosely-typed jest mocks (`jest.fn()`,
`jest.requireActual(...)` assigned without a cast) in test files, not diffuse hand-written
production bugs.

**Warning breakdown by file — test vs production split (this is the load-bearing number for
sizing, not the raw top-20):**

| Scope | Warnings | Files |
|---|---|---|
| Test files (`__tests__/` or `*.test.ts(x)`) | 3011 (72%) | 152 |
| Production files | 1179 (28%) | 208 |

Top 5 files overall are **all test files**: `steam/__tests__/games.test.ts` (422),
`steam/__tests__/library.test.ts` (421), `steam/__tests__/depot.test.ts` (147),
`sidecar/__tests__/sidecarRejectionGuard.test.ts` (102), `humble/__tests__/library.test.ts` (100).

Top production files: `storeManagers/steam/library.ts` (94), `storeManagers/gog/library.ts` (58),
`backend/utils.ts` (46), `storeManagers/steam/games.ts` (35), `storeManagers/gog/games.ts` (34).

Top production-only rules: `no-unsafe-member-access` (188), `no-unsafe-assignment` (183),
`require-await` (181), `import-x/no-named-as-default-member` (179 — almost entirely the `i18next`
default/named-export ambiguity, a single mechanical fix pattern), `no-floating-promises` (169).

**Directories that lint clean at a narrower scope:** `src/common` (38 files) is the **only**
top-level scope that lints 100% clean — verified independently with `npx eslint src/common
--format json`, 0 findings. Every other top-level scope carries debt: `src/backend` 3572,
`src/frontend` 427, `meta` 142, `src/preload` 49.

**Auto-fixable / mechanical subset:**
- **71 warnings** carry a `fix` property in the JSON (eslint's own `--fix` would resolve them) —
  matches eslint's own summary line exactly (`0 errors and 71 warnings potentially fixable with
  the --fix option`).
- **69 findings** are "Unused eslint-disable directive" (no `ruleId`, since the directive itself is
  what's flagged) — these are pure deletions (remove a stale `// eslint-disable-next-line` comment
  that no longer suppresses anything), zero behavioral risk.
- These two sets overlap partially; together they represent the only **mechanically safe, one-shot
  fixable** slice of the 4190. The remaining ~4050 are one-at-a-time `any`-typing fixes in mocks —
  genuinely diffuse, not concentrated in one rule/directory in a way that makes them a single plan.

**Hazard 3 spot-check (finding names the wrong file with the right line numbers) — performed
against the top 3 warning files, since there are no error files to check:**

| File | Line | Rule reported | Verified against real source? |
|---|---|---|---|
| `steam/__tests__/games.test.ts` | 311 col 46 | `no-unsafe-member-access` `.UnsafeInstalldirError` | **CONFIRMED** — line 310 is `UnsafeInstalldirError:` inside a `jest.requireActual(...)` mock factory; matches exactly |
| `steam/__tests__/library.test.ts` | 318 col 5 | `import-x/no-named-as-default-member` on `i18next` | **CONFIRMED** — line 318 is `;(i18next.t as jest.Mock).mockImplementation(` |
| `steam/__tests__/depot.test.ts` | 139 col 3 | `no-unsafe-member-access` `.applyDepotFileFlags` | **CONFIRMED** — lines 137-139 are `jest.requireActual('../depot/fileAttributes').applyDepotFileFlags`, wrapping across the reported line |

All three check out — no misattribution found in this sample. Hazard 3 remains a standing risk for
whichever files the executing plan touches, but this spot-check gives no reason to distrust the
JSON wholesale.

### M2 — The two red planning gates

**Command:** `python3 meta/runPlanningGates.py` (run live in this session, full output captured).

**Date measured:** 2026-09-02. **Result: unchanged from the 2026-08-30 snapshot — 5/7, same two
failures, identical numbers.**

```
5/7 planning gates passed.
```

#### Gate 1 — `34.4.1/seam-parity-sweep-gate.py`

**Current failure (verbatim):**
```
FileNotFoundError: [Errno 2] No such file or directory:
'/Users/graysonmitchell/Projects/GameLib/src/backend/sidecar/electronStub.ts'
```
Thrown from `parse_electron_stub_safestorage()` at gate line 963, reading
`ELECTRON_STUB_PATH = SRC_DIR / "backend" / "sidecar" / "electronStub.ts"` (gate line 73).

All **15 of the gate's own self-tests still pass** (`--self-test` was exercised as part of the
normal run) — the extraction/classification logic itself is intact; only the hardcoded path is
stale.

**Where the artifact actually lives:** `git log --follow -- src/backend/platform/index.ts` shows
continuous history back through the sidecar-era commits (`fe3aa5791`, `64bbef740`, etc.) — this is
the same file, `git mv`'d by plans 35-13/35-15 as the ROADMAP states. The specific export the gate
needs, `safeStorage`, is present and structurally identical to what the gate expects: `index.ts:605-618`
exports a `safeStorage` object whose `isEncryptionAvailable()`/`encryptString()`/`decryptString()`
members throw a fixed string (`"safeStorage is not available in the sidecar — use getTokenStore()
..."`) — the same "hardcoded throw" shape `parse_electron_stub_safestorage()` is built to classify.

**Disposition: REPAIR via RE-POINT.** Change `ELECTRON_STUB_PATH` to
`SRC_DIR / "backend" / "platform" / "index.ts"`. This is the same shape as D-35-14-02's
`packagingConfig.test.ts` re-point (symlink plugin moved to `vite.config.ts`, gate re-pointed, no
logic change). **Caveat:** because the gate currently crashes with an unhandled `FileNotFoundError`
rather than a clean `fail()`, whatever axis-B classification checks run *after* this parse
(`classify_axis_b()`'s remaining body) have never been exercised against the live tree since the
move — repointing the path could surface a **second**, currently-invisible failure the moment this
one is fixed. Budget verification time for this, not just the one-line path edit.

#### Gate 2 — `34.5/preload-surface-gate.py`

**Current failure (verbatim):**
```
GATE FAILED: extracted union has only 206 distinct channel(s), below the audited floor of 217 —
this is the exact signature of a regression to a single-line-only regex (measured at 206 on the
audited tree, 11 short)
```

**Re-measured directly (not just via the gate's own exit code) — ran the extractor in isolation:**

| Metric | Value |
|---|---|
| `invoke` channels (`makeHandlerInvoker`) | 154 |
| `send` channels (`makeListenerCaller`) | 52 |
| **Union (the 206 the gate reports)** | **206** |
| `push` channels (`frontendListenerSlot`, out of tally) | 27 |
| Bucket-line names in `IPC-PORT-INVENTORY.md` | 224 |
| Channels in code but in NO bucket line (`check_coverage` failure set) | **0** |
| Channels in a bucket line but NOT found in code (stale doc entries) | **18** |

**Evidence this is a real removal, not an extractor regression:** `check_coverage` (the check that
would fire if the extractor were missing real channels) **passes cleanly** — every one of the 206
live channels the code exposes is already documented. The gap runs the *other* direction: 18 names
are documented but absent from `src/preload/` today. Their names are unambiguous:
`closeWindow`, `createNewWindow`, `isFrameless`, `isFullscreen`, `isMaximized`, `isMinimized`,
`maximizeWindow`, `minimizeWindow`, `setFullscreen`, `unmaximizeWindow`, `setZoomFactor`,
`showAboutWindow`, `gamepadAction`, `getEpicGamesStatus`, `health`, `openPatreonPage`,
`openReleases`, `openWikiLink` — a coherent cluster of window-chrome IPC channels plus a handful of
misc ones. This matches Phase 35's own record (`main.ts` deletion removed 136 IPC channel
registrations) and Tauri's native window-decoration handling (the `windowChrome` frontend module
now talks to Tauri's own window APIs, not a preload IPC channel, per
`tauri-overlay-does-not-hide-title` / `windowcontrols-grid-area-retired-by-3410` in this project's
own memory). **Verdict: the 206 figure is correct; the 217 floor is stale.**

**Disposition: REPAIR via RE-DERIVE (same shape as D-35-14-02's seam-census re-derivation, "the
stated number was updated with the list — a census whose number outlives its list is how coverage
is lost in the other direction").** Concretely:
1. Delete the 18 stale names from `IPC-PORT-INVENTORY.md`'s bucket lines.
2. Update `## Totals` → `Unique channels` to the new correct count.
3. Lower `AUDITED_UNION_FLOOR` in the gate from 217 to the new true count (206, or the
   post-cleanup bucket count if it differs).

**A third, currently MASKED defect was found while re-measuring — report this to the planner
explicitly, it is not visible from the gate's own output today:** `IPC-PORT-INVENTORY.md`'s stated
`## Totals` → `Unique channels` is **225**, but the document's own bucket lines contain **224**
distinct names (one entry counted in the stated total is not actually backed by a bucket line, or
is double-counted in the stated figure). `check_totals_reconciliation` — the very check that would
catch this — **never runs**, because `check_multiline_awareness` (the 206-vs-217 failure) calls
`fail()` → `sys.exit(1)` before it in `run_all_checks()`'s execution order. Independently verified
by calling `check_totals_reconciliation` directly: it fails (225 ≠ 224). **If the planner fixes
only the floor number without also reconciling the Totals row, this gate will go from "fails on
check 2" straight to "fails on check 5" the moment the plan lands — a fresh red gate that looks
like a regression but is actually a pre-existing defect this measurement uncovered.** Fix both in
the same pass. (Independently confirmed the other four checks — coverage, comment-blindness,
bucket-line-scoping, provenance — all pass cleanly against the live tree; only totals-reconciliation
is masked.)

#### The `D-35-14-02` precedent (gate-disposition template)

Found at `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md:1164`.
Ten source gates were broken by Phase 35's deletions; the disposition table there sets the
methodology this phase's two gates should follow:

- **RE-POINT** when the pinned artifact moved but the underlying invariant is still true elsewhere
  (`packagingConfig.test.ts`'s symlink-plugin pin → `vite.config.ts`). *This is Gate 1's shape.*
- **RE-DERIVE** when a census's stated number and its list must be updated together, never just the
  number (`removeCopies.test.ts`'s "all FOUR seam files" → "THREE", list and count both changed).
  *This is Gate 2's shape.*
- **RETIRE** only as a last resort, when the artifact the gate reads no longer exists at all
  (`electron-builder.yml`-reading gates) — **not applicable to either of this phase's two gates**,
  since both artifacts they check (`backend/platform/index.ts`, `src/preload/`) still exist and are
  still live.
- **INVERT** when a gate asserted "X still exists" and X's deliberate removal is exactly what a
  later phase does — **not applicable here** either.

Neither of Phase 39's two gates is a retire/invert candidate — both are repair-shaped (re-point,
re-derive), which is good news for scope: no new gate needs writing, no gate needs deleting.

### M3 — The dead-seam census

**Command:** manual `grep`/read audit of every `getLoginWindowSeam()` call site, keyed on the
predicate (every `=== null`, `!== null`, `!seam`, ternary, and any local-variable-then-test form),
not on the file list WR-01 named. Cross-checked against ESLint output for the touched files.

**Date measured:** 2026-09-02.

**Premise re-verified, not assumed:** `getLoginWindowSeam()` reads a single module-scoped `let
installed: LoginWindowSeam | null = null` (`loginWindowSeam.ts:204`). The **only** production call
to `setLoginWindowSeam()` anywhere in `src/` is `humbleLoginFlowRegistration.ts:340`,
`setLoginWindowSeam(createRustLoginWindowSeam())`, called **unconditionally**. That function
(`registerHumbleLoginFlows()`) runs at **module scope** — `handlers.ts:197` calls it directly (not
inside a function, not gated), and `handlers.ts` is statically imported by `bootstrap.ts` before any
IPC handler can receive a call. **Since Phase 35 there is exactly one shell** (the Tauri sidecar) —
there is no second build where `setLoginWindowSeam()` is never called. **Conclusion: the premise
holds. `getLoginWindowSeam()` cannot return `null` by the time any handler-reachable code runs it.**
WR-01's characterization is correct on this point.

**The count is 12 production-code predicate sites, not 7.** WR-01 named 6 code locations (plus one
doc comment, counted as its "7th"): `user.ts:274-284, 445, 740, 873-874, 1034-1036` and
`legendary/user.ts:167-177`. Re-deriving from the predicate surfaced **6 additional sites WR-01's
own census missed**, and confirmed WR-01's cited line numbers have already drifted (its
`legendary/user.ts:167-177` is `221-235` today) — direct evidence for the ROADMAP's warning that a
census taken over the wrong namespace (here: "the 6 files WR-01 happened to read" rather than "every
call site of the predicate") misses real instances.

| # | File:line | Predicate form | Dead branch | ~LOC | In WR-01's original list? |
|---|---|---|---|---|---|
| 1 | `humble/user.ts:178-205` (`getLiveCsrfToken`) | `if (seam !== null)` | `else` — `session.fromPartition` csrf read | ~14 | **NO — new finding** |
| 2 | `humble/user.ts:274-284` (`watchForLogin`) | `if (seam === null)` | `ses = session.fromPartition(...)` + `setUserAgent` | ~8 | Yes |
| 3 | `humble/user.ts:445-462` (`checkCookie`) | `if (seam === null) {...} else {...}` | the `seam === null` arm (`ses!.cookies.get`) | ~8 | Yes (cited as "445") |
| 4 | `humble/user.ts:590` | ternary `seam !== null ? seamLabel : null` | the `: null` alternate | 1 | **NO — new finding** |
| 5 | `humble/user.ts:640-673` | `if (seam !== null) { seam.open(...) }` | not a branch *pair* — an always-true guard with no Electron sibling (Electron path opens no window here at all); collapses by removing the wrapper | ~25 guarded | **NO — new finding, different shape** |
| 6 | `humble/user.ts:740-761` (`finishLogin`, csrf capture) | `if (seam !== null && seamLabel !== null) {...} else {...}` | the `else` arm (`session.fromPartition` csrf read) | ~8 | Yes (cited as "740") |
| 7 | `humble/user.ts:873-895` (health-check backfill) | `if (seam === null) {...}` | the `seam === null` arm (`session.fromPartition` csrf backfill) | ~12 | Yes (cited as "873-874") |
| 8 | `humble/user.ts:1034-1042` (`disconnect`) | `if (seam === null) {...} else {...}` | the `seam === null` arm (5-step session wipe) | ~8 | Yes (cited as "1034-1036") |
| 9 | `humble/adapter.ts:275-277` (`humblePostRequest`) | `return seam ? viaSeam(...) : viaElectronNet(...)` | the `viaElectronNet` branch, **and** the entire `humblePostRequestViaElectronNet` function it calls (`adapter.ts:358-431`, ~74 lines) becomes unreachable and deletable too | ~3 (+74 if the callee is also removed) | **NO — new finding** |
| 10 | `humble/library.ts:1211-1214` | ternary `getLoginWindowSeam() !== null ? 'login-window seam transport' : 'electron-net transport'` | the `'electron-net transport'` log-label string (cosmetic — never printed, no behavior) | 1 | **NO — new finding, cosmetic only** |
| 11 | `storeManagers/legendary/user.ts:221-235` (`disconnect`) | `if (seam === null) {...} else {...}` | the `seam === null` arm (5-step session wipe, Epic) | ~8 | Yes (cited as "167-177" — **line numbers have drifted**) |
| 12 | `sidecar/oauthLoginCapture.ts:195-197` (`captureOAuthLogin`) | `if (seam === null) return Promise.resolve({status:'unsupported'})` | the early-return arm | ~3 | **NO — new finding, and behaviorally real** (not cosmetic) |

**Excluded — found by the same grep, deliberately not counted as a dead-Electron-branch:**
`sidecar/humbleLoginFlowRegistration.ts:457`, `if (!seam) { smokeLog(...); return }`, inside a block
gated by `process.env.GAMELIB_LOGIN_SEAM_SMOKE === '1'`. This is a defensive null-check in a
diagnostic smoke-test harness, and its own comment says **"Keep this permanently — it is the
cheapest reproduction harness for any future window-construction regression."** It matches the raw
predicate but is not a dual-build (Electron-vs-Tauri) discriminator — it is a "did registration
actually run" sanity check for a debugging tool. **Recommend: exclude from deletion, note explicitly
in the disposition record so a future re-audit doesn't flag it as "missed."**

**Doc-only updates needed (not code branches, but must move in lockstep with the code collapse):**
- `humble/loginWindowSeam.ts:17-20` — the header doc comment WR-01 already named, currently reads
  "The Electron build never calls `setLoginWindowSeam()` ... so `getLoginWindowSeam()` always
  returns `null` there" — now describes a build that no longer exists.
- `sidecar/oauthLoginFlowRegistration.ts` — its own doc comment references "Under Electron,
  `captureOAuthLogin()`'s own `getLoginWindowSeam() === null` check resolves..." — must be updated
  alongside item #12's collapse, or the doc will assert a now-false fact about a nonexistent build,
  the same category of staleness WR-01 flagged for `loginWindowSeam.ts` itself.

**Total found: 12, not 7.** The gap is not small (71% more sites than estimated) and is not
uniform in kind — 8 are "real" dual-build parity branches (session.fromPartition vs seam), 3 are
trivial (a ternary alternate, a log label), and 1 (`oauthLoginCapture.ts`) is a defensive check in
code that was arguably *already* Tauri-only even during the dual-build era (its own doc comment
frames the Electron case as hypothetical/defensive, "would be harmless even if somehow invoked
there"). The planner should size this as "collapse 8 real branches + 3 trivial simplifications +
1 defensive-but-technically-dead check, update 2 doc comments, leave 1 smoke-test guard alone,"
not as "delete 7 things."

**Lint correlation (M1 × M3 synergy) — checked directly, result: NOT CONFIRMED for production
code.** Ran ESLint against all 6 production files touching these 12 sites
(`humble/user.ts`, `humble/adapter.ts`, `humble/library.ts`, `storeManagers/legendary/user.ts`,
`sidecar/oauthLoginCapture.ts`, `sidecar/humbleLoginFlowRegistration.ts`) and cross-referenced every
reported warning's line number against the 12 dead-branch ranges above: **zero overlap**. The
ROADMAP's stated synergy ("dead branches produce exactly the unsafe-`any` and unused-directive
noise being counted") does not hold at the line level for production code in this measurement.
This may have been truer of the stale 53-error snapshot (many of whose files Phase 35 already
deleted) — that cannot be verified retroactively. **Report this as a correction to the ROADMAP's
premise, not confirmation of it:** deleting the 12 sites will not visibly move the M1 warning count
in production files.

**Test-side correlation is a genuine open question, not measured to a number:** three test sites
explicitly exercise the dead Electron branch via `setLoginWindowSeam(null)` —
`humble/__tests__/user.test.ts:1260, 1615, 1829`. These tests (and whatever mocking scaffolding
supports them) will need deletion or rewrite once the branches collapse, and `user.test.ts` itself
carries 88 warnings — but this research did not isolate how many of those 88 live specifically
inside the three `setLoginWindowSeam(null)` test blocks. **Flagged as an open question for the
planner** (see below), not asserted as a number.

**Cleanup implication:** collapsing sites #2, #3, #6, #7, #8 (user.ts) and #11 (legendary/user.ts)
removes the only remaining uses of the `session` import from `backend/platform` in both files —
that import becomes unused and must be deleted alongside the branch collapse. `tsconfig.json` has
no `noUnusedLocals`/`noUnusedParameters`, so this would not fail `pnpm codecheck`, but an unused
import is exactly the shape `@typescript-eslint/no-unused-vars` (not currently seen at these lines,
but would appear the moment the import becomes dead) would flag — budget for it, don't be surprised
by a new lint warning appearing where there was none before.

## Plan-sizing implications

**Workstream 1 — Lint.** Given 0 errors already: this is **not** a bug-fixing plan, it is a
**verification + regression-prevention** plan. Recommended shape, one plan:
- Task 1: confirm 0 errors / current warning count with a fresh run (re-run at plan-close time, not
  reuse this research's numbers, since the dead-seam workstream may run first and could add or
  remove a handful of warnings in the touched files).
- Task 2 (optional, bounded, mechanical): run `eslint --fix` for the 71 auto-fixable findings and
  delete the 69 unused-eslint-disable directives — zero behavioral risk, shrinks the noise floor.
  **Coupling risk (hazard 4):** `--fix` output must be diffed against `prettier --check` before
  committing; if `--fix` changes formatting in a file `prettier --check` already flags, that's not
  a *new* prettier regression (the gate is already red repo-wide) but it does mean the same commit
  touches a file prettier would also want reformatted — note it, don't let it justify running
  `prettier --write`, which is out of scope by the fence.
- Task 3: add a `--max-warnings <N>` ratchet (N = the freshly re-measured count from Task 1/2) to
  the `lint` script or a CI-only invocation, so the count can only go down, never silently up. This
  is the durable fix for "item 20 was pre-existing and nobody owned it" — a ratchet makes future
  regressions visible immediately instead of accumulating for another 18 months.
- **This is one plan, not several** — none of the 4190 warnings requires a design decision; the
  auto-fixable slice is mechanical and the ratchet is a one-line script change.

**Workstream 2 — Gate dispositions.** Two independent fixes, no shared files:
- Plan A (Gate 1, seam-parity-sweep): one-line path repoint
  (`ELECTRON_STUB_PATH` → `backend/platform/index.ts`) plus verification that no *second* failure
  is hiding behind the crash (budget time to actually run the gate clean afterward, not just patch
  the path and assume success).
- Plan B (Gate 2, preload-surface): a doc edit (delete 18 stale bucket-line names AND fix the
  225→224 Totals mismatch in the same edit) plus a one-line floor change in the gate script. Small,
  but touches two files (`IPC-PORT-INVENTORY.md` and `preload-surface-gate.py`) that must land
  together or the totals-reconciliation check fails on the very next run.
- These two can run in parallel with each other and with either other workstream — no file overlap
  with M1's or M3's targets.

**Workstream 3 — Dead-seam collapse.** One plan, sized around the 8 "real" branches (not 7, not
12 treated uniformly):
- Task 1: collapse the 5 branches in `humble/user.ts` (#1,2,3,6,7,8 above — `getLiveCsrfToken`,
  `watchForLogin`, `checkCookie`, `finishLogin`, health-check backfill, `disconnect`) to a single
  non-null-asserting accessor per WR-01's own prescribed shape (`getLoginWindowSeam()!` or a
  throwing wrapper), remove the now-dead `session.fromPartition` bodies, and drop the resulting
  unused `session` import.
- Task 2: collapse `legendary/user.ts`'s equivalent `disconnect()` branch (#11) the same way.
- Task 3: collapse the two "new" findings that are genuine behavioral branches —
  `adapter.ts`'s `humblePostRequest` ternary (#9, also delete the now-orphaned
  `humblePostRequestViaElectronNet` function) and `oauthLoginCapture.ts`'s early-return (#12).
- Task 4 (small, can ride with any of the above): the two cosmetic/trivial sites (#4 ternary, #10
  log label) and #5's always-true guard unwrap — bundle these as one-line diffs, not separate tasks.
- Task 5: update the two doc comments (`loginWindowSeam.ts:17-20`,
  `oauthLoginFlowRegistration.ts`'s stale "Under Electron..." paragraph) to stop describing a build
  that no longer exists.
- Task 6: rewrite or delete the 3 `setLoginWindowSeam(null)`-based test blocks in
  `humble/__tests__/user.test.ts:1260,1615,1829` that exercise the now-removed Electron path, and
  extend `isTauriRemoved.test.ts` (or a sibling) with the second zero-match assertion WR-01
  prescribed — a real `seam === null`/`!== null` grep sweep under `src/backend/humble` and
  `src/backend/storeManagers`, with a vacuity control, per WR-01's own fix recipe.
- **Explicitly exclude** `humbleLoginFlowRegistration.ts:457`'s smoke-test guard from every task
  above — leave it as-is.

## The gate dispositions (summary table)

| Gate | Disposition | Evidence |
|---|---|---|
| `34.4.1/seam-parity-sweep-gate.py` | **REPAIR — re-point** `ELECTRON_STUB_PATH` to `src/backend/platform/index.ts` | File confirmed present via `git log --follow`; `safeStorage` export shape at `index.ts:605-618` matches what the gate's parser expects |
| `34.5/preload-surface-gate.py` | **REPAIR — re-derive** the floor from 217 to the current true count, AND fix the masked 225-vs-224 Totals mismatch in the same edit | `check_coverage` passes (0 unlisted-in-doc channels); the 18 stale names are a coherent, identifiable cluster of window-chrome channels retired by the Tauri cutover, not an extraction artifact |

Neither gate is a retire/invert candidate (unlike several of D-35-14-02's ten) — both underlying
artifacts (`backend/platform/index.ts`, `src/preload/`) still exist and are still load-bearing.

## Ordering and coupling

1. **The three workstreams have no file overlap** — lint's warning-count work touches whatever
   files carry the top warnings (mostly test mocks + a handful of production files in
   `storeManagers/`); the gate dispositions touch two `.planning/` files each; the dead-seam
   collapse touches exactly 6 named production files + `loginWindowSeam.ts` + `user.test.ts`. No
   ordering is *forced* by file contention.
2. **Ordering is still recommended, for verifiability, not correctness:** run the dead-seam
   collapse (Workstream 3) **before** the lint workstream's final re-measurement (Workstream 1
   Task 1), even though this research found **no direct line-level lint overlap** with the 12
   sites today. Reasoning: collapsing the branches removes the `session` import from two files and
   deletes a ~74-line function (`humblePostRequestViaElectronNet`) — any incidental warning shift
   this produces (e.g. a fresh `no-unused-vars` on the dropped import) should be captured by the
   *same* lint re-measurement that sets the `--max-warnings` ratchet, not discovered as a surprise
   after the ratchet is already locked in. Doing it the other way around (ratchet first, seam
   collapse second) risks locking in a ratchet number that the very next commit invalidates.
3. **The gate-disposition workstream is fully independent** — plan it in any order, including in
   parallel with the other two, since `.planning/` documents are not lint-scanned and the gate
   scripts touch no `src/` files this phase modifies.
4. **Commit hygiene (binding):** per the ROADMAP's hazard rule, each workstream's commits must stay
   separable — a lint-ratchet commit, a gate-A commit, a gate-B commit (or one combined
   gate-disposition commit if the planner prefers, since both are `.planning/`-only and low-risk),
   and one-or-more dead-seam-collapse commits. Do not let the seam-collapse's incidental lint-count
   change land in the same commit as the lint ratchet — land the seam work, re-measure, *then*
   set the ratchet in its own commit, so the ratchet's own commit message can cite the exact
   post-collapse number rather than a number that commit itself makes stale.

## Suggested REQ split

- **`REQ-39-01`** — Lint regression prevention: verify `pnpm lint` exits 0 (already true, confirm
  at plan-close), optionally apply the 71 auto-fixes + 69 unused-directive deletions, add a
  `--max-warnings` ratchet.
- **`REQ-39-02`** — Planning-gate dispositions: repair both `seam-parity-sweep-gate.py` (re-point)
  and `preload-surface-gate.py` (re-derive floor + fix masked Totals mismatch), restoring
  `meta/runPlanningGates.py` to 7/7.
- **`REQ-39-03`** — Dead `getLoginWindowSeam()` branch collapse: remove the 8 real dual-build
  branches + 3 trivial sites + unify via a non-null-asserting accessor, update 2 stale doc
  comments, rewrite/delete the 3 seam-null test blocks, extend the zero-match test gate per WR-01's
  own prescription. Explicitly excludes the smoke-test guard at
  `humbleLoginFlowRegistration.ts:457`.

The planner may further split `REQ-39-02` into `REQ-39-02a`/`REQ-39-02b` (one per gate) if
commit-hygiene is easier to enforce that way — both gates are small enough that either grouping
works; this research has no strong preference.

## Risks and open questions

1. **Gate 1's post-repoint behavior is unverified.** The `FileNotFoundError` is a hard crash, not a
   `fail()` — nothing downstream of `parse_electron_stub_safestorage()` in `classify_axis_b()` has
   run against the live tree since the `git mv`. Repointing the path could reveal a second failure.
   Budget verification time in the plan; do not treat the one-line edit as done until the gate
   actually exits 0.
2. **Gate 2's masked Totals defect (225 vs 224) must be fixed in the same edit as the floor**, or
   the very next run produces a *new* red gate that looks like a regression introduced by this
   phase's own fix. Flagged prominently above; repeating here because it is easy to miss if the
   plan only reads the gate's current stderr output (which never reaches this check).
3. **Test-side lint reduction from the seam collapse is unmeasured.** Three `user.test.ts` blocks
   (lines 1260, 1615, 1829) test the dead Electron path and will need rewriting; this research did
   not isolate how many of `user.test.ts`'s 88 warnings live inside those specific blocks. If the
   planner wants a precise "warnings removed by workstream 3" number, that requires re-running
   ESLint scoped to just those line ranges after the test rewrite — not before, since the exact
   lines the rewrite touches shift the analysis.
4. **`oauthLoginCapture.ts`'s dead branch is philosophically different from the other 7** — this
   file's own sibling doc comment already described its `getLoginWindowSeam() === null` check as
   defensive/hypothetical even under the old dual-build model (it was registered in the Tauri-only
   sidecar module graph and "would be harmless even if somehow invoked" under Electron). Collapsing
   it is still correct (the branch is unreachable now, same as the others), but the planner should
   not describe it in the same "Electron behavior preserved" language WR-01 used for the `user.ts`
   sites — the framing is subtly different and a plan that gets this wrong could misstate what the
   removed code was ever for.
5. **The `humbleLoginFlowRegistration.ts:457` smoke-test guard was found by the same grep and
   correctly excluded** — but a future audit that re-runs this same predicate search without
   reading this research's reasoning could mistake its exclusion for an incomplete sweep. The
   disposition record this phase produces should name it explicitly as "found, considered,
   deliberately kept" to prevent that.
6. **Lint's `--fix` coupling with the separately-red `prettier --check` gate (hazard 4) is a real,
   if small, risk** — not measured precisely (which of the 71 auto-fixable findings would also
   change formatting was not individually checked). If the planner takes the optional Task 2
   (auto-fix), diff the result against `prettier --check`'s file list before committing, purely to
   document the overlap — not to fix it, which stays out of scope.

## Validation Architecture

### Test framework

| Property | Value |
|---|---|
| Framework | Jest (`ts-jest` preset), 5 projects: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta` (`jest.config.js`) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `pnpm test --selectProjects Backend` (workstream 3's files are all backend-scoped) |
| Full suite command | `pnpm test` |

### Phase requirement → validation map

| Req ID | Behavior | Validation type | Automated command | Exit/figure expected |
|---|---|---|---|---|
| REQ-39-01 | `pnpm lint` exits 0, warning count has a ratchet | automated (CI script) | `pnpm lint` | exit code 0; `--max-warnings <N>` in place, N ≥ the last-measured count |
| REQ-39-02 | Both planning gates pass | automated (script) | `python3 meta/runPlanningGates.py` | `7/7 planning gates passed.`, exit code 0 |
| REQ-39-03 | No `getLoginWindowSeam() === null`-style dead branch remains reachable | automated (source gate) | new/extended zero-match test (sibling of `isTauriRemoved.test.ts`) under `src/backend/humble` and `src/backend/storeManagers` | 0 matches, with a vacuity control proving the search itself works |
| REQ-39-03 (regression) | Backend suite still green after the collapse | automated | `pnpm test --selectProjects Backend` | same pass count as the pre-collapse baseline, modulo the 3 rewritten `user.test.ts` blocks |
| REQ-39-01/03 (compile) | No new tsc break from removed imports | automated | `pnpm codecheck` | exit code 0 |

### Sampling rate

- **Per task commit:** `pnpm codecheck` (fast, catches unused-import/type breaks from the seam
  collapse) + the scoped gate command relevant to that task (`pnpm lint` for REQ-39-01,
  `python3 meta/runPlanningGates.py` for REQ-39-02, `pnpm test --selectProjects Backend` for
  REQ-39-03).
- **Per wave/workstream merge:** the full triplet — `pnpm lint`, `python3 meta/runPlanningGates.py`,
  `pnpm test` (full suite, not just Backend, since Task 6's test rewrite could theoretically be
  collected differently by a different project — verify it stays in Backend's collection).
- **Phase gate (`/gsd:verify-work`):** all three terminal commands green in the same session,
  measured live, not inferred from a task SUMMARY's own claim (this project's standing rule: a
  mutating command's own report is never accepted as proof of its own effect).

### The terminal acceptance command, precisely

**`pnpm lint` exits 0 is this phase's stated whole point, and it already does — today, before any
code changes.** The honest terminal acceptance for REQ-39-01 is therefore **not** "drive it to 0"
(already true) but:
1. `pnpm lint` continues to exit 0 after Workstream 3's edits land (verifies no new error was
   introduced by the seam collapse).
2. A `--max-warnings` ratchet is present and set to the freshly re-measured warning count (this
   research measured 4190 on 2026-09-02, pre-seam-collapse; **do not hardcode 4190 into the plan or
   the ratchet** — re-measure after Workstream 3 lands and use that number).
3. **A zero-warning bar is NOT a realistic target for this phase.** 85% of the 4190 warnings are
   `@typescript-eslint/no-unsafe-*` findings against `any`-typed jest mocks — fixing these requires
   either properly typing every mock (a large, diffuse, high-risk-of-behavior-change effort
   explicitly out of this phase's three-workstream scope fence) or suppressing the rule for test
   files (a policy decision this research does not recommend making unilaterally — it would mask
   genuine `any`-typing bugs in the 28% of warnings that are production code). **The honest target
   is zero errors (already met) plus a documented, ratcheted warning count — not zero warnings.**

### Wave 0 gaps

- No new test files are needed for REQ-39-01 or REQ-39-02 — both are verified by re-running the
  existing scripts (`pnpm lint`, `python3 meta/runPlanningGates.py`).
- REQ-39-03 needs one new or extended test file: a sibling to
  `meta/__tests__/isTauriRemoved.test.ts` (or an extension of it) asserting zero matches for the
  `seam === null` / `seam !== null` / `!seam` predicate family under `src/backend/humble` and
  `src/backend/storeManagers`, with its own vacuity control — this is WR-01's own prescribed fix
  and does not yet exist on disk.
- None — existing test infrastructure (Jest, `pnpm test --selectProjects Backend`) covers the
  regression-testing needs of the other two requirements.

## Environment Availability

No external tools, services, or runtimes beyond what the repo already depends on (Node/pnpm,
Python 3 for the gate scripts, ESLint, Jest) — all confirmed present and working during this
research session (every command in this document ran successfully). Skipped further audit: this
phase is a pure in-repo measurement/cleanup phase with no new dependencies.

## Sources

### Primary (HIGH confidence — produced by running the command in this session)
- `npx eslint . --format json` (scratchpad JSON dump) and live `pnpm lint` — M1's entire figure set
- `python3 meta/runPlanningGates.py`, plus direct invocation of the two failing gates' internal
  functions via `importlib` — M2's entire figure set, including the masked Totals defect
- `git log --follow -- src/backend/platform/index.ts` — confirms the `electronStub.ts` → `platform/index.ts` rename history
- Direct `grep`/`Read` of every `getLoginWindowSeam()` call site in `src/` — M3's entire census
- `.planning/ROADMAP.md` Phase 39 section, `.planning/phases/34.9-.../deferred-items.md` item 20,
  `.planning/phases/35-.../35-REVIEW.md` WR-01, `.planning/phases/35-.../deferred-items.md`
  D-35-14-02 — all read in full this session

### Secondary (MEDIUM confidence)
- None — this phase required no external documentation lookup; every claim traces to a command run
  in this session or a planning document read in full.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- M1 (lint census): HIGH — two independent measurement methods (JSON dump, live cached script run)
  agree exactly; hazard-3 spot-check performed and passed.
- M2 (planning gates): HIGH — ran the real gate runner and the two failing gates' internal
  functions directly; the masked Totals defect was independently reproduced, not inferred.
- M3 (dead-seam census): HIGH on the premise (verified via the only `setLoginWindowSeam()` call
  site and its module-scope call order); HIGH on the 12-site enumeration (each site read and
  quoted directly) with an explicit acknowledgment that a 13th form (some exotic predicate shape
  not in the searched list) cannot be proven absent by grep alone — mitigated by searching every
  form the phase brief named plus loose-equality and optional-chaining variants, all returning zero
  additional hits.

**Research date:** 2026-09-02
**Valid until:** These are point-in-time measurements of a fast-moving post-cutover tree — treat as
valid only until the next commit lands in any of the touched files. Re-run all three commands at
plan-close if execution does not begin the same session this research was produced.
