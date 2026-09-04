---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 03
subsystem: sidecar-ipc, backend-platform-types, planning-gates
tags: [ipc-retirement, model-a-retirement, mechanical-gate, D-11, D-12, D-13]
dependency-graph:
  requires: [40-01, 40-05]
  provides: [D-11-channel-recensus, D-12-shim-deletion, D-13-retirement-gate]
  affects:
    - .planning/IPC-PORT-INVENTORY.md
    - meta/runPlanningGates.py
    - src/backend/platform/types.ts
tech-stack:
  added: []
  patterns:
    - "mutation-proven mechanical gate (RED via reintroduced token + restore, GREEN against real tree)"
    - "RETIRED_CHANNELS exclusion set for a frozen historical document cross-checked against live state"
key-files:
  created:
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-CHANNEL-RECENSUS.md
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/model-a-retirement-gate.py
  modified:
    - src/backend/platform/types.ts
    - src/backend/platform/index.ts
    - src/backend/platform/__tests__/types.usage.test.ts
    - src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts
    - src/common/types/ipc.ts
    - src/preload/api/humble.ts
    - src/backend/sidecar/humbleLoginFlowRegistration.ts
    - src/backend/humble/ipc_handler.ts
    - src/backend/sidecar/__tests__/humbleLoginFlows.test.ts
    - src/backend/sidecar/__tests__/humbleFlows.test.ts
    - src/backend/sidecar/humbleFlowRegistration.ts
    - src/backend/humble/user.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - .planning/IPC-PORT-INVENTORY.md
    - meta/runPlanningGates.py
    - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py
    - .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py
    - .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-SEAM-PARITY-SWEEP.md
    - .planning/phases/34.4-tauri-ipc-re-plumb-slice-7-steam-completion-and-humble/ported-channels-gate.py
decisions:
  - "Both orphaned channels (humbleLoginNavigated, humbleGetLoginUserAgent) verdict REMOVE — zero live callers across all four required sweep surfaces"
  - "types.usage.test.ts's structural-stand-in assertion deleted wholesale rather than partially preserved — its target (humbleLoginChromeCss.ts) was already deleted outright by plan 40-01, so nothing surviving depends on it"
  - "Cross-phase gate regressions from Task 1's inventory edit fixed with two different strategies: direct constant-shrink for LIVE-state gates, RETIRED_CHANNELS exclusion-set for the gate cross-checking a FROZEN historical document"
metrics:
  duration: "~2.5 hours (includes discovery and fix of 4 cross-phase regressions)"
  completed: 2026-09-04
---

# Phase 40 Plan 03: Model A shim retirement, channel re-census, and mutation-proven gate Summary

Deleted the last Electron-era `<webview>` type shim, retired two now-orphaned IPC channels after a
four-surface zero-callers sweep, and shipped a mechanical gate (mutation-proven both directions)
that fails CI the moment a `<webview>`/`WebviewTag`/`webviewPreloadPath` token reappears under
`src/frontend/` — then discovered and fixed four separate downstream regressions this plan's own
channel-removal edit caused in gates and tests it does not own.

## What Was Built

### Task 1 — D-11 channel re-census (commit `c152dd9ef`)

Both channels swept across all four required surfaces ((a) TypeScript `src/` callers, (b) Rust
`src-tauri/` in every casing, (c) the underlying behaviour/method directly, (d) test-file
channel-list pins). Full evidence, commands, and hit counts are recorded in
`40-CHANNEL-RECENSUS.md`. Summary:

| Channel | Verdict | Zero-caller evidence |
|---|---|---|
| `humbleLoginNavigated` | **REMOVE** | 0 TS callers, 0 Rust dispatch arms, 0 production callers of `HumbleUser.notifyLoginNavigated()` (only test-only unit-test call sites, unaffected since the method itself is untouched) |
| `humbleGetLoginUserAgent` | **REMOVE** | 0 TS callers (one prose-comment mention only), 0 Rust dispatch arms, 9 production callers of `standardBrowserUserAgent()` remain — none via this channel |

Both channels' only renderer caller was `HumbleLoginSurface.tsx`, deleted by plan `40-01`.

IPC-PORT-INVENTORY.md Totals, before/after (verbatim, deliberate one-above-union offset preserved
per CONTEXT.md):

```
Before:                          After:
| Unique channels | 218 |        | Unique channels | 216 |
| Ported to sidecar | 63 |       | Ported to sidecar | 61 |
| **Unported** | **159** |       | **Unported** | **159** |
```

### Task 2 — D-12 shim deletion (commit `69fc68348`)

Deleted `WebviewTag`/`DidFailLoadEvent` from `types.ts`, both barrel re-exports from `index.ts`,
and their assertions from `types.usage.test.ts`. Left a retirement note carrying the literal token
`REQ-40-10`.

**Entanglement-check result (explicit sentence, per acceptance criteria):** no surviving interface
in `types.ts` references `WebviewTag` or `DidFailLoadEvent` in a member signature, extends clause,
or union — `WebviewTag` extends `HTMLElement` (nothing inherits from it) and no other type names
either identifier as a parameter or return type. The structural stand-in flagged at line 259 typed
its props object against `humbleLoginChromeCss.ts`'s exports, which plan `40-01` had already
deleted outright, so that whole assertion function was removed wholesale rather than partially
preserved — there was no surviving dependent to keep it for.

`getWebviewPreloadPath`'s declared-empty backend return and its test in
`appShellFlowRegistration.ts` were left untouched (`git diff --stat` on that file is empty),
confirming it is a declared-dead backend return, not Model A.

### Task 3 — D-13 mechanical retirement gate (commit `0c5cf18f1`)

Built `model-a-retirement-gate.py` in the phase directory, following the 34.4.1 gate contract
exactly (no-args = CI mode; `--self-test` proves every check rejects known-bad input first;
no `--write` flag since this gate has no generated artifact). Predicate: fail if the literal
tokens `<webview>`, `WebviewTag`, or `webviewPreloadPath` appear on a non-comment line under
`src/frontend/` TypeScript/TSX files, matched as a whole word (not a substring).

Self-test covers 8 cases (5 required, 3 extra):
1. `<webview>` element rejected
2. `WebviewTag` rejected
3. `webviewPreloadPath` rejected
4. `WebviewUnavailablePanel` (prefix-collision survivor) accepted
5. Comment-only occurrence accepted
6. `WebviewBuilder`/`WebviewUrl` (Rust lookalikes, scoped out by `src/frontend/`-only walk) accepted
7. The gate's own docstring tokens (self-invalidation control) accepted
8. **A 4th false-positive risk discovered during measurement, not named in the plan's three**:
   a `*.test.tsx` file carrying a live token mention inside a jest description string — accepted
   (test files are excluded from the walk's scope, matching the plan's "non-test source files"
   framing, and this needed its own explicit case since it is a different mechanism than
   comment-stripping)

**RED run** (mutation-and-restore, exact commands):
```
echo 'export const X = () => <webview src="test" />' >> src/frontend/screens/WebView/index.tsx
python3 .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/model-a-retirement-gate.py
# exit code: 1
# output named the mutated file and the exact line
git checkout -- src/frontend/screens/WebView/index.tsx
git status --porcelain   # empty — confirmed clean after restore
```

**GREEN run** (real post-Phase-40 tree, exact command):
```
python3 .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/model-a-retirement-gate.py
# OK: 358 non-test TypeScript/TSX file(s) under src/frontend/ carry none of the 3 retired Model A
# tokens (<webview>, WebviewTag, webviewPreloadPath).
# exit code: 0
```

**Anti-vacuity floor:** `MINIMUM_EXPECTED_GATES` in `meta/runPlanningGates.py` bumped from **7 to
8** in the same commit, with the explanatory comment updated to name this gate.

`python3 meta/runPlanningGates.py` reports `8/8 planning gates passed.` (confirmed both immediately
after this task and again after the Deviations fixes below).

## Deviations from Plan

All four deviations below are Rule 1 auto-fixes (bugs directly caused by this plan's own Task 1
commit's edit to `.planning/IPC-PORT-INVENTORY.md` and to `humbleLoginFlowRegistration.ts`, which
this plan is responsible for keeping internally consistent). None required a user decision;
architecture was not touched.

**1. [Rule 1 - Bug] `34.5-.../preload-surface-gate.py`'s `>=5`-backtick-count heuristic broke on
the legitimately-shrunk 4-name channel bucket**
- **Found during:** running the plan's own required `python3 meta/runPlanningGates.py` verification
  after Task 3 (surfaced as `6/8 planning gates passed.`)
- **Issue:** `parse_bucket_names()` used `len(found) >= 5` as a proxy for "this line is a real
  channel-list line" — Task 1's edit shrank the Phase 34.4.1 bucket from 6 to 4 names, falling
  below the threshold and making all 4 channels invisible to the gate's coverage/Totals checks
- **Fix:** replaced the count heuristic with a structural whole-line comma-list pattern match
  (`CHANNEL_LIST_LINE_PATTERN`, reusing `ported-channels-gate.py`'s existing convention), verified
  against the live document to strictly gain the 4 affected channels and lose none of the 212 the
  old heuristic caught (old=212, new=216)
- **Files modified:** `.planning/phases/34.5-.../preload-surface-gate.py`
- **Commit:** `0c5cf18f1`

**2. [Rule 1 - Bug] `34.4.1-.../seam-parity-sweep-gate.py`'s hardcoded line-number pin drifted past
its own tolerance window**
- **Found during:** same `meta/runPlanningGates.py` run
- **Issue:** Task 1's deletion of two channel registration blocks from
  `humbleLoginFlowRegistration.ts` shifted the deliberately-kept `getLoginWindowSeam()` smoke-guard
  call site from line 457 to 447 — a 10-line drift exceeding the gate's own `+/-5` window by design
- **Fix:** refreshed `EXPECTED_AXIS_A_SURVIVOR_SET` and `SITE_PROFILES[...]["line_hint"]` from 457
  to 447 (then to 452 — see deviation 4); regenerated the committed `34.4.1-SEAM-PARITY-SWEEP.md`
  artifact via its own sanctioned `--write` flag, verified the diff was exactly the 2 expected
  line-number lines
- **Files modified:** `.planning/phases/34.4.1-.../seam-parity-sweep-gate.py`,
  `.planning/phases/34.4.1-.../34.4.1-SEAM-PARITY-SWEEP.md`
- **Commit:** `0c5cf18f1`

**3. [Rule 1 - Bug] Both `ported-channels-gate.py` files' hardcoded "(6 channels)" heading
regex/prose stopped matching the post-retirement "(4 channels)" inventory section**
- **Found during:** same `meta/runPlanningGates.py` run
- **Issue:** Task 1's edit to `.planning/IPC-PORT-INVENTORY.md`'s Phase 34.4.1 heading (6 → 4
  channels) broke two different gates that each hardcode that count for a different purpose
- **Fix:** two different strategies, matched to each gate's purpose:
  - `34.4-.../ported-channels-gate.py` (verifies LIVE inventory state): `PHASE_34_4_1_CHANNELS`
    shrunk directly to the 4 surviving names, heading regex updated to `(4 channels)`
  - `34.4.1-.../ported-channels-gate.py` (cross-checks the FROZEN historical
    `34.4.1-PORTED-CHANNELS.md` "what shipped" record against live state): added a
    `RETIRED_CHANNELS` exclusion set (mirroring the file's own pre-existing `OAUTH_CHANNEL`
    exclusion idiom) so the live-inventory comparison scopes down to the 4 still-listed channels,
    while every row-level assertion against the frozen historical document stays unchanged — that
    document is not rewritten to erase channels that DID ship and were proven at the time
- **Files modified:** `.planning/phases/34.4-.../ported-channels-gate.py`,
  `.planning/phases/34.4.1-.../ported-channels-gate.py`
- **Commit:** `0c5cf18f1`

**4. [Rule 1 - Bug] A 4th cross-phase fallout, found only by running the plan's FULL stated
`<verification>` jest scope rather than Task 1's narrower per-task scope**
- **Found during:** `pnpm exec jest src/backend/platform src/backend/sidecar` (the plan's own
  `<verification>` command, run after Task 3 as final due diligence)
- **Issue:** `flowRegistrationCensus.test.ts`'s hand-maintained `EXPECTED` tripwire table still
  claimed `humbleLoginFlowRegistration.ts` registers `{ invoke: 4, send: 2 }` (its pre-D-11 count
  of 6); the real count is `{ invoke: 3, send: 1 }` after Task 1's removal. Separately, that same
  file carries a SECOND docstring (distinct from the module-level docstring Task 1 already
  updated) immediately above `registerHumbleLoginFlows()` that still said "6 browser-auth
  channels", plus stale inline comments ("any of the 6 handlers", "── invoke (4) ──",
  "── send (2) ──") at the exact position the census gate's `claimedTotal()` reads from
- **Fix:** updated the `EXPECTED` table entry and all stale docstring/inline-comment counts to the
  real post-removal totals, each with a dated annotation matching the surrounding file's own
  established convention. That 5-line comment insertion shifted the smoke-guard line number again
  (447 → 452), so `seam-parity-sweep-gate.py`'s pins from deviation 2 were refreshed a second time
  and the artifact regenerated again (2-line diff, verified via `git diff`)
- **Files modified:** `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`,
  `src/backend/sidecar/humbleLoginFlowRegistration.ts`,
  `.planning/phases/34.4.1-.../seam-parity-sweep-gate.py`,
  `.planning/phases/34.4.1-.../34.4.1-SEAM-PARITY-SWEEP.md`
- **Commit:** `41997d94a`

### Known flake investigated (not a deviation — pre-existing, out of scope)

`pnpm exec jest src/backend/platform src/backend/sidecar` run with default (parallel) workers
manufactures one failure in `enrichmentFlows.test.ts:1012` (`gai-4` response assertion) that
reproduces consistently under parallelism but vanishes when run in isolation or with
`--runInBand`. Verified this is a pre-existing load-induced flake (matching project memory
`full-suite-run-manufactures-failures-under-load.md`), not caused by this plan's changes: the
same scope run with `--runInBand` is 59/59 suites, 1352/1352 tests green. `enrichmentFlows.test.ts`
is not in this plan's `files_modified` and was not touched.

## Final Verification (all commands, post all fixes)

```
pnpm codecheck                                                            # exit 0
pnpm exec jest src/backend/platform src/backend/sidecar --runInBand       # 59/59 suites, 1352/1352 tests
grep -rn "WebviewTag" src/                                                # 0 matches
grep -rn "DidFailLoadEvent" src/                                          # 0 matches
python3 meta/runPlanningGates.py                                         # 8/8 planning gates passed.
grep -vn '^\s*#' meta/runPlanningGates.py | grep -c "MINIMUM_EXPECTED_GATES = 8"  # 1
git status --short                                                        # (empty)
```

## Commits

| Task | Commit | Description |
|---|---|---|
| Task 1 (D-11) | `c152dd9ef` | Remove `humbleLoginNavigated` and `humbleGetLoginUserAgent` channels |
| Task 2 (D-12) | `69fc68348` | Delete `WebviewTag`/`DidFailLoadEvent` shim and its type-usage pin |
| Task 3 (D-13) | `0c5cf18f1` | Add Model A retirement gate; fix 3 downstream gate regressions (Rule 1) |
| Deviation 4 | `41997d94a` | Correct 4th cross-phase fallout from Task 1's channel removal (Rule 1) |

## Known Stubs

None introduced by this plan.

## Threat Flags

None — this plan removes surface (two IPC channels, one type shim) and adds a CI-only mechanical
gate. No new network endpoints, auth paths, file access patterns, or schema changes at trust
boundaries were introduced.
