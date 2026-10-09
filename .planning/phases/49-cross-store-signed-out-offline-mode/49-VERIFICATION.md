---
phase: 49-cross-store-signed-out-offline-mode
verified: 2026-10-10T00:00:00Z
status: gaps_found
score: 8/9 requirements verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-SPEC.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-CONTEXT.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-RESEARCH.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-01-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-01-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-02-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-02-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-03-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-03-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-04-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-04-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-05-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-05-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-06-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-06-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-07-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-07-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-08-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-08-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-09-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-09-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-10-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-10-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-11-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-11-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-12-PLAN.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-12-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-UAT.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/deferred-items.md
  - src/common/signInState.ts
  - src/common/signInDismissal.ts
  - src/common/types.ts
  - src/common/types/ipc.ts
  - src/frontend/helpers/signInInputs.ts
  - src/frontend/helpers/electronStores.ts
  - src/frontend/screens/Library/librarySignInRows.ts
  - src/frontend/screens/Library/librarySyncIndicator.ts
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/screens/Library/components/SteamSyncNotice/index.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Login/loginOpenParam.ts
  - src/frontend/screens/Login/signInTileState.ts
  - src/frontend/screens/Login/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/types.ts
  - src/backend/config.ts
  - src/backend/launcher.ts
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/sessionEpoch.ts
  - src/backend/signInProbe/outcomes.ts
  - src/backend/signInProbe/verdict.ts
  - src/backend/signInProbe/pass.ts
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/storeManagers/legendary/epicOfflineMode.ts
  - src/backend/storeManagers/legendary/user.ts
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/nile/user.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/humble/user.ts
  - src/common/types/storePolicy.ts
  - .planning/IPC-PORT-INVENTORY.md
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md
  - .planning/todos/pending/2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md
  - .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md
  - .planning/todos/pending/2026-10-10-library-sign-in-rows-placement-and-banner-height.md
  - .planning/todos/pending/2026-10-10-nile-classifier-flips-on-stdout-stderr-interleaving.md
  - .planning/todos/pending/2026-10-10-not-connected-row-illegible-in-nord-light.md
  - .planning/todos/completed/2026-10-10-dismissed-sign-in-notice-returns-after-relaunch.md
  - .planning/todos/completed/2026-10-10-epic-expiry-deletes-user-json-and-the-ui-never-rebuilds-user-info.md
covered_digest: "unavailable — gsd_run is not installed in this environment (verification.fingerprint query could not be invoked); same limitation noted in 48-VERIFICATION.md"
gaps:
  - truth: "The sign-in probe pass detects an expired Amazon (nile) credential regardless of how many Amazon games are installed"
    status: partial
    reason: "nile's only probe surface (list-updates) exits before any auth call when zero Amazon games are installed, so a dead Amazon token is never classified expired/unknown for a user in that state — the row stays silently healthy. Confirmed live on real binaries in 49-LIVE-GATE.md Run 1 (F-49-R1-4, UAT item 6, scored 'issue'); SPEC.md's edge-coverage table has no row anticipating a zero-installed-Amazon-games state, so this was an unanticipated gap, not an accepted boundary."
    artifacts:
      - path: "src/backend/signInProbe/runnerProbes.ts"
        issue: "probeNileSession has no code path that forces an auth round-trip when the local games list is empty"
    missing:
      - "A probe strategy for nile that can distinguish 'dead token' from 'nothing installed, so nothing to check' (e.g. a lightweight authenticated call independent of list-updates), or an explicit accepted-limitation note added to 49-SPEC.md's edge coverage table"
deferred:
  - truth: "Amazon expiry classification is verified against a real 400/401/403 refresh failure (A3/A6)"
    addressed_in: "tracked by .planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md (ready: live-gate), not a later roadmap phase"
    evidence: "Operator declined server-side Amazon device deregistration during the live gate (UAT item 5, 'skipped — not scorable'); deferred by explicit operator decision recorded in 49-LIVE-GATE.md Post-run disposition and deferred-items.md #3, not a gap in Phase 49's own delivered scope"
advisory:
  - finding: "Mid-session signInProbe verdict=cleared is picked up by the Library notice only on the next mount/push/pull trigger, not continuously"
    category: other
    reason: "Recorded as F-49-R1-2 / deferred-items.md #5 and tracked in .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md (severity: medium, ready: code). Did not fail any of the 11 scored live-gate UAT items (item 11's 'completed sign-in leaves no row' path is a different trigger and passed); narrower than a blocking gap."
    evidence_status: "triaged by operator, open todo exists, not yet fixed"
  - finding: "nile's healthy/unknown classification can flip depending on stdout/stderr interleaving order"
    category: other
    reason: "Recorded as F-49-R1-5, tracked in .planning/todos/pending/2026-10-10-nile-classifier-flips-on-stdout-stderr-interleaving.md (severity: medium, ready: code). Did not cause a false 'expired' latch in the live gate; classification noise between unknown/healthy only."
    evidence_status: "triaged by operator, open todo exists, not yet fixed"
  - finding: "The not-connected row is low-contrast (black text on a dark banner) in the nord_light theme"
    category: other
    reason: "Recorded as F-49-R1-6, tracked in .planning/todos/pending/2026-10-10-not-connected-row-illegible-in-nord-light.md (severity: minor, ready: code). Cosmetic, theme-scoped, not a functional gap."
    evidence_status: "triaged by operator, open todo exists, not yet fixed"
human_verification: []
---

# Phase 49: Cross-store signed-out / offline mode Verification Report

**Phase Goal:** Warn the user which stores they are not signed in to (Epic, GOG, Amazon, Humble,
Steam) from one consolidated surface, while cached libraries still render and installed games
remain launchable. The Steam client is the reference UX: it tells you plainly that you are
offline, and then gets out of the way so you can still play what is already on disk.

**Verified:** 2026-10-10
**Status:** gaps_found
**Re-verification:** No — initial verification

## Requirement IDs

R1-R9 are phase-local, defined and locked in `49-SPEC.md` (the task's framing: "9, LOCKED — see
49-SPEC.md"). `.planning/REQUIREMENTS.md` carries no Phase 49 rows under any of the patterns
searched (`Phase 49`, `REQ-49`, `cross-store`, `signed-out`) — that mirrors Phase 48's precedent
(48-VERIFICATION.md states the identical situation for Phase 48 and calls it "expected, not an
orphaned-requirement finding"). All nine of 49-SPEC.md's requirements are claimed by at least one
of the twelve plans' `requirements:` frontmatter field; no orphans.

## Goal Achievement

### Observable Truths

| # | Truth (mapped to SPEC requirement) | Status | Evidence |
|---|---|---|---|
| 1 | R1 — The Library shows one consolidated sign-in surface, not five scattered indicators | ✓ VERIFIED | `LibrarySignInNotice` mounted once in `Library/index.tsx:1181`, reads all five stores via `collectSignInInputs`/`resolveSignInStates`; source read in full, matches claims exactly |
| 2 | R2/R3 — A bounded (45s), parallel, edge-triggered boot probe detects expiry for Epic, GOG, Humble and Steam regardless of installed-game count | ✓ VERIFIED | `src/backend/signInProbe/pass.ts` read; `bootstrap.ts:1339` registers the outcomes handler before the `READY_SENTINEL` write at `:1341`, `startSignInProbePass()` called at `:1349` after READY — exact claimed order. Live-verified on real legendary/gogdl binaries (UAT items 1-4, 7, 8 — all `pass`). `pass.test.ts`, `dismissBackstop.test.ts`, `signInProbeBootWire.test.ts`, `bootstrapWirings.test.ts` all pass (ran once, see Behavioral Spot-Checks) |
| 3 | R2/R3 — The same boot probe detects expiry for Amazon (nile) unconditionally | ✗ FAILED (partial) | Live-verified FINDING A4 (`49-LIVE-GATE.md` Run 1, UAT item 6 "issue"): with zero Amazon games installed, `nile list-updates` exits on `No games installed` before any auth call, so Amazon always reads `healthy`/no-row in that state even with a dead token. See Gaps |
| 4 | R4/R5 — The notice is non-modal, in normal document flow, never covers the grid, and never blocks cached library rendering | ✓ VERIFIED | `LibrarySignInNotice/index.scss` has zero `position` declarations; component returns `null` for zero rows; mounted as a sibling of `GamesList`/`FocusRowStrip` in `Library/index.tsx`, never gating `libraryToShow` |
| 5 | R5 — A dismissed never-connected row stays dismissed across a relaunch; an expired row is never dismissible | ✓ VERIFIED | `resolveLibrarySignInRows` (read in full): `expired` rows always `dismissible: false`, dismissed set only consulted for `not-connected`. Relaunch-persistence bug (F-49-R1-3) found live, fixed by `aea939456`, live re-checked by operator 2026-10-09 ("Humble row absent" — confirmed in the closed todo's own text) |
| 6 | R6 — Sign-in from a row opens exactly one Manage Accounts overlay, and a completed sign-in clears the row in the same launch and after relaunch | ✓ VERIFIED | Live-verified (UAT item 11, pass): exactly two `oauthLoginCapture` windows (cancel + real sign-in), no third window on tab/back; `loginOpenParam.ts`/`signInTileState.ts` exist and their test suites pass |
| 7 | R7 — The Login screen's five tiles and the Library notice derive sign-in state from the same selector (no drift) | ✓ VERIFIED | `signInStateParity.test.ts` exists and passes; both `LibrarySignInNotice` and `Login/index.tsx` import `resolveSignInStates`/`collectSignInInputs` from the same modules (confirmed by import grep) |
| 8 | R8 — Cached library still renders and installed games remain launchable for every store in `expired`, with Epic's offline-capable games explicitly kept launchable | ✓ VERIFIED | `resolveEpicOfflineMode` (read in full) can only turn offline mode on, never blocks a launch; call site in `launcher.ts:528-534` confirmed, reads `storeExpired` once per launch. Notice never gates `GamesList`/`libraryToShow` (see truth 4) |
| 9 | R9 — Store names enter every new string only through `{{store}}` interpolation, never concatenation, across all 49 locales | ✓ VERIFIED | `gamelib.json` `library.signIn.{dismiss,expired,notConnected,reconnect,signIn}` and `login.{epic,gog,amazon}Reconnect` keys confirmed present in `en`; `notConnected` key confirmed present in all 49 locale directories by a full-directory grep (zero MISSING lines) |

**Score:** 8/9 requirements verified (R2/R3's Amazon arm is partial — see gap). 0 present-but-behavior-unverified.

### Live Gate Disposition (macOS, 2026-10-09, Run 1)

Per the task's given facts, treated as recorded fact, not re-derived: Run 1 scored a strict **FAIL
8/11** (items 1, 2, 3, 4, 7, 8, 9, 11 pass; item 5 not scorable; item 6 issue; item 10 FAIL on its
relaunch leg). Two of the three failure-class findings were then fixed and live-verified same day:

| Finding | Fix commit | Verified |
|---|---|---|
| F-49-R1-3 (item 10d FAIL — dismiss did not survive relaunch) | `aea939456` | Operator re-check 2026-10-09: "signed out of Humble, dismissed the row, relaunched — Humble row absent. Fix verified." (quoted from the closed todo) |
| F-49-R1-1 (Epic user info never rebuilt after a restored user.json) | `7419d4dc7` | Headline narrowed by the operator's own live measurement before the fix: the latched `expired` flag already won in `resolveSignInState` branch 1 as designed; the fix additionally makes a restored credential file re-seed the UI on next boot. Pinned in `GlobalStateSignInMount.test.ts` |

Both commits were read in full via `git show`; both diffs substantively match their stated intent
(no renamed-but-empty diffs, no test-only changes masquerading as fixes).

Per the task's given facts (treated as fact, not re-derived): **"Effective verdict after
disposition: PASS 9/11 scored, 1 finding (item 6), 1 deferred (item 5)."** This verification
accepts that disposition for items 5 and 10, and additionally examined item 6 independently
(see Gaps) rather than accepting it as automatically non-blocking, because the task's given facts
only named item 5's deferral explicitly as "a recorded decision, not a gap."

### Todo/Documentation Reconciliation

The task's given facts stated "five files" of pending todos; six were found. Reconciled: the live
gate produced **eight** findings-derived todos (confirmed by `49-12-SUMMARY.md`'s `key-files`
list), two of which (`epic-expiry-deletes-user-json…` and `dismissed-sign-in-notice-returns…`)
were fixed same-day and moved to `.planning/todos/completed/` by commits `7419d4dc7` and
`aea939456` respectively (confirmed by `git show` on both commits — both diffs include a
pending→completed rename). 8 − 2 = 6 remaining pending, which is exactly what is on disk. The
"five files" in the task framing was a minor miscount, not a real discrepancy — the todo state is
internally consistent and `pnpm planning-gates` (12/12, all three frontmatter fields present,
bare, lowercase, in order) confirms every one of the six pending and two completed todos is
correctly shaped.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/common/signInState.ts` | Pure 4-value selector, zero imports, D-07 precedence | ✓ VERIFIED | Read in full: 144 lines, zero `import` statements, branch order exactly matches the documented D-07 rationale (expiry flag beats `loggedIn: false`) |
| `src/common/signInDismissal.ts` | Dismissal normalization helpers | ✓ VERIFIED | 61 lines, imported by `GlobalState.tsx` and `signInState.ts` |
| `src/frontend/screens/Library/librarySignInRows.ts` | Pure row decision, expired never dismissible | ✓ VERIFIED | Read in full, matches SUMMARY claim exactly |
| `src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx` | Non-modal notice, no probe calls, canonical order | ✓ VERIFIED | Read in full: no `window.api` call, no `position: absolute/fixed` in its scss, store names only via `{{store}}` |
| `src/frontend/screens/Login/loginOpenParam.ts`, `signInTileState.ts` | `?open=` routing, 5-tile selector | ✓ VERIFIED | Both exist; `signInTileState.test.ts` and `loginOpenParam.test.ts` both pass |
| `src/backend/signInProbe/{pass,classify,verdict,outcomes,sessionEpoch,runnerProbes}.ts` | Bounded parallel probe, single writer, epoch fencing | ✓ VERIFIED | All exist, all have passing test suites; `applySignInVerdict` confirmed as the sole writer by the plan's own grep-count self-checks (re-confirmed: test suite passes) |
| `src/backend/sidecar/bootstrap.ts` wiring | Handler before READY, pass after READY | ✓ VERIFIED | Line numbers confirmed directly: handler `:1339`, READY write `:1341`, pass start `:1349` |
| `src/backend/storeManagers/legendary/epicOfflineMode.ts` | Can only enable offline mode, never blocks launch | ✓ VERIFIED | Read in full; call site in `launcher.ts:528-534` confirmed |
| `src/backend/storeManagers/steam/authTrigger.ts` boot-probe trigger | Sticky, deliberate, unreachable from renderer | ✓ VERIFIED (not independently re-derived beyond SUMMARY + grep; see note) | `'boot-probe'` trigger referenced from `signInState.ts`/`pass.ts` import graph; full line-level audit of `DELIBERATE_TRIGGERS` not independently re-opened given strong corroborating test-suite evidence (`runnerProbes.test.ts`, `classify.test.ts` pass) |
| 49 locale `gamelib.json` files, 8 new keys | All 49 locales carry the new keys | ✓ VERIFIED | Full-directory grep for `notConnected` found zero `MISSING` locales |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `LibrarySignInNotice` | `common/signInState` | direct import, `resolveSignInStates`/`collectSignInInputs` | WIRED |
| `Login/index.tsx` | `common/signInState` | same selector, confirmed by import grep | WIRED |
| `Library/index.tsx` | `LibrarySignInNotice` | mounted at line 1181, sibling of `GamesList` | WIRED |
| `launcher.ts` prepareLaunch | `epicOfflineMode.resolveEpicOfflineMode` | direct call at `:528-534`, reads `legendaryConfigStore.get_nodefault('expired')` | WIRED |
| `bootstrap.ts` init() | `signInProbe/pass.startSignInProbePass` | called post-READY at `:1349` | WIRED |
| `bootstrap.ts` init() | `signInProbe/outcomes.registerSignInProbeOutcomesHandler` | called pre-READY at `:1339` | WIRED |
| `GlobalState.componentDidMount` | `window.api.requestAppSettings()` dismissal hydration | added by `aea939456`, read in full diff | WIRED |
| `GlobalState.componentDidMount` | `window.api.getUserInfo()` (Epic) | made unconditional by `7419d4dc7`, read in full diff | WIRED |

No NOT_WIRED or PARTIAL links found among the links checked.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `LibrarySignInNotice` rows | `states` / `rows` | `collectSignInInputs(context)` → `resolveSignInStates` → `resolveLibrarySignInRows` → live per-store config-store reads (`legendaryConfigStore`, `gogConfigStore`, `nileConfigStore`, `steamConfigStore`, `humble` context) | Yes — live-verified against real binaries (legendary, gogdl) in the macOS gate, not just unit fixtures | ✓ FLOWING |
| `GamesList` library contents | `libraryToShow` | Unrelated selector chain, confirmed not gated by any sign-in read | Yes | ✓ FLOWING |
| `epicOfflineMode` decision | `offlineMode` | `legendaryConfigStore.get_nodefault('expired')`, read once per launch | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

All 18 sign-in-related Jest suites were run once (not filtered from a full-suite run):

```
npx jest --testPathPattern="signIn"
Test Suites: 18 passed, 18 total
Tests:       432 passed, 432 total
```

| Behavior | Command | Result | Status |
|---|---|---|---|
| D-07 precedence (expired beats not-connected) | `common/__tests__/signInState.test.ts` | pass | ✓ PASS |
| Dismiss survives a running probe pass | `signInProbe/__tests__/dismissBackstop.test.ts` | pass | ✓ PASS |
| READY-before-pass boot ordering | `sidecar/__tests__/signInProbeBootWire.test.ts`, `bootstrapWirings.test.ts` | pass | ✓ PASS |
| Tile/notice selector parity (R7) | `Library/__tests__/signInStateParity.test.ts` | pass | ✓ PASS |
| Notice structural gates (non-modal, probe-free, interpolation-only) | `Library/__tests__/librarySignInNoticeSource.test.ts` | pass | ✓ PASS |

`pnpm planning-gates`: 12/12 passed (confirms todo frontmatter shape for all 6 pending + 2
completed Phase 49 todos, among others).

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention-named probes; its
equivalent is the macOS live-gate contract (`49-LIVE-GATE.md`), which was run by a human operator
on 2026-10-09 per the task's given facts and is treated as recorded evidence (not re-run — it
requires a real macOS Keychain, real Epic/GOG/Amazon credentials, and destructive OS-level
induction steps that this verifier cannot and should not reproduce).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| R1 | 49-01, 49-03, 49-07 | Consolidated Library sign-in surface | ✓ SATISFIED | See Observable Truths #1 |
| R2 | 49-02, 49-04, 49-05, 49-06, 49-09, 49-10, 49-11, 49-12 | Boot-time probe detects expiry per store | ⚠ PARTIAL | Epic/GOG/Humble/Steam fully satisfied; Amazon fails under zero-installed-games (see gap) |
| R3 | 49-01, 49-04, 49-06, 49-07, 49-08, 49-09, 49-11, 49-12 | Bounded, parallel, single-flight, edge-triggered pass | ✓ SATISFIED | `pass.ts`, boot wiring, live-verified bound (45.009s measured in UAT item 8) |
| R4 | 49-03, 49-04, 49-06, 49-09 | Notice structural contract (non-modal, in-flow) | ✓ SATISFIED | See Observable Truths #4 |
| R5 | 49-01, 49-05, 49-07, 49-08, 49-09, 49-11, 49-12 | Dismiss persistence, expired never dismissible | ✓ SATISFIED | See Observable Truths #5, F-49-R1-3 closed |
| R6 | 49-01, 49-09, 49-10, 49-11, 49-12 | Single-overlay sign-in routing, idempotent | ✓ SATISFIED | See Observable Truths #6 |
| R7 | 49-10, 49-12 | Tile/notice selector parity | ✓ SATISFIED | See Observable Truths #7 |
| R8 | 49-03, 49-09 | Library never gates; Epic offline-capable games launchable | ✓ SATISFIED | See Observable Truths #8 |
| R9 | 49-02, 49-03, 49-09 | i18n interpolation-only store names | ✓ SATISFIED | See Observable Truths #9 |

No orphaned requirements: `.planning/REQUIREMENTS.md` carries no Phase 49 rows at all (checked,
expected per Phase 48's precedent), so there is nothing to cross-reference beyond 49-SPEC.md's
own R1-R9, all nine of which are claimed by at least one plan.

### Anti-Patterns Found

Scanned 16 core phase-touched source files (`signInState.ts`, `signInDismissal.ts`,
`signInInputs.ts`, `librarySignInRows.ts`, `LibrarySignInNotice/index.tsx`, `loginOpenParam.ts`,
`signInTileState.ts`, `classify.ts`, `sessionEpoch.ts`, `outcomes.ts`, `verdict.ts`, `pass.ts`,
`runnerProbes.ts`, `epicOfflineMode.ts`, `authTrigger.ts`, `GlobalState.tsx`) for
TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/"not yet implemented"/"not available" patterns.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/frontend/state/GlobalState.tsx` | 1294 | `placeholder` | none | False positive — inside a comment describing correct behavior ("never an empty/stale placeholder"), not a stub marker |

No debt markers (TBD/FIXME/XXX) found in any phase-touched file. No stub returns, no empty
handlers, no hardcoded-empty data flowing to render found in the files read in full.

### Human Verification Required

None. All items with a human-judgment component (visual tone across themes, real Keychain
behaviour, real runner binary output, real sign-in flows) were already discharged by the
operator-run macOS live gate on 2026-10-09, which this verification treats as recorded evidence
per the task's given facts rather than re-litigating.

### Gaps Summary

**One structural gap, narrow in scope:** the boot sign-in probe cannot detect an expired Amazon
(nile) credential when the user has zero Amazon games installed, because nile's only available
probe command (`list-updates`) exits on "No games installed" before attempting any authenticated
call. This was discovered live on real binaries (not a test artifact), is already triaged with a
correctly-shaped pending todo (`2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md`,
`severity: medium`, `ready: code`), and does not affect the other four stores or the phase's R8
"library never gates" guarantee. It is a genuine, if narrow, shortfall against R2/R3's intent
("detects expiry for every store") that was not pre-accepted as a boundary in 49-SPEC.md's edge
coverage table, so it is reported here as a gap rather than silently absorbed into a passing
score. The remaining live-gate findings (F-49-R1-2 mid-session re-derivation, F-49-R1-5 nile
stdout/stderr-order classification flip, F-49-R1-6 nord_light contrast) are real but did not fail
any of the 11 scored UAT items, are already correctly tracked as open todos, and are reported as
advisory rather than blocking. Item 5 (Amazon expiry induction) is an operator-made deferral
decision, not a gap, per the task's given facts.

Everything else — the consolidated notice, the four-value selector and its D-07 precedence, the
bounded/parallel/single-flight/edge-triggered probe pass and its boot-wiring order, dismiss
persistence (after the live `aea939456` fix), single-overlay sign-in routing, tile/notice parity,
the "cached library renders, installed games launch regardless of sign-in state" guarantee
including Epic's explicit offline-mode carve-out, and the 49-locale i18n rollout — was verified
directly against the codebase (not merely against SUMMARY claims): files were read in full,
import/wiring graphs were traced, line numbers for the critical boot-ordering and launch-gating
invariants were confirmed directly, both post-run-disposition fix commits were read in full via
`git show` and their diffs substantively match their claims, and all 18 sign-in-related Jest
suites (432 tests) were executed and passed in this verification session.

---

_Verified: 2026-10-10_
_Verifier: Claude (gsd-verifier)_
