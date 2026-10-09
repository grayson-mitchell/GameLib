---
phase: 49-cross-store-signed-out-offline-mode
verified: 2026-10-10T01:00:00Z
status: passed
score: 9/9 requirements verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/IPC-PORT-INVENTORY.md
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
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-CONTEXT.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-RESEARCH.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-REVIEW-DISPOSITION.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-REVIEW.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-SECURITY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-SPEC.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-UAT.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-VALIDATION.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/deferred-items.md
  - .planning/todos/completed/2026-10-10-dismissed-sign-in-notice-returns-after-relaunch.md
  - .planning/todos/completed/2026-10-10-epic-expiry-deletes-user-json-and-the-ui-never-rebuilds-user-info.md
  - .planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md
  - .planning/todos/pending/2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md
  - .planning/todos/pending/2026-10-10-authtrigger-origin-lookup-is-an-unguarded-bracket-access.md
  - .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md
  - .planning/todos/pending/2026-10-10-library-sign-in-rows-placement-and-banner-height.md
  - .planning/todos/pending/2026-10-10-nile-probe-joins-list-updates-in-flight-spawn-and-never-observes-output.md
  - .planning/todos/pending/2026-10-10-not-connected-row-illegible-in-nord-light.md
  - public/locales/en/gamelib.json
  - src/backend/config.ts
  - src/backend/humble/user.ts
  - src/backend/launcher.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/outcomes.ts
  - src/backend/signInProbe/pass.ts
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/signInProbe/sessionEpoch.ts
  - src/backend/signInProbe/verdict.ts
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/legendary/epicOfflineMode.ts
  - src/backend/storeManagers/legendary/user.ts
  - src/backend/storeManagers/nile/user.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/user.ts
  - src/common/signInDismissal.ts
  - src/common/signInState.ts
  - src/common/types.ts
  - src/common/types/ipc.ts
  - src/common/types/storePolicy.ts
  - src/frontend/helpers/electronStores.ts
  - src/frontend/helpers/signInInputs.ts
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
  - src/frontend/screens/Library/components/SteamSyncNotice/index.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/librarySignInRows.ts
  - src/frontend/screens/Library/librarySyncIndicator.ts
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/Login/loginOpenParam.ts
  - src/frontend/screens/Login/signInTileState.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
covered_digest: "v2:sha256:a832d1fdc0cfadafda031c323537757b63428f6110f39140fe2e284020ce625b"
re_verification:
  previous_status: gaps_found
  previous_score: 8/9 requirements verified
  gaps_closed:
    - "R2/R3's Amazon (nile) zero-installed-games probe gap — not fixed in code, but converted from an unanticipated shortfall into an explicit, operator-accepted boundary, documented in 49-SPEC.md's Edge Coverage table (`🚧 boundary`, 'ACCEPTED 2026-10-09 (operator)'), with the same remediation path (the pending `ready: code` and `ready: live-gate` todos) this report already cited. Verified directly by reading the amended 49-SPEC.md edge-coverage row, not merely accepted on the coordinator's word."
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "The sign-in probe pass detects an expired Amazon (nile) credential regardless of how many Amazon games are installed"
    addressed_in: "49-SPEC.md Edge Coverage table, row added 2026-10-09 (category: empty, requirements: R2/R3, status: 🚧 boundary) — operator-accepted, gated on .planning/todos/pending/2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md (ready: code) and .planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md (ready: live-gate)"
    evidence: "49-SPEC.md Edge Coverage line now reads '24/24 applicable edges resolved · 1 accepted boundary'; the new row's text: 'ACCEPTED 2026-10-09 (operator): with zero Amazon games installed, nile list-updates exits before any auth call, so an expired Amazon credential is not detectable by the boot probe and the store reads healthy. Found live (49-LIVE-GATE.md Run 1 item 6, F-49-R1-4). Not a Phase 49 deliverable...because any replacement probe command's expired-token output is unmeasurable until then.' Read directly in this re-verification, not accepted on report alone."
  - truth: "Amazon expiry classification is verified against a real 400/401/403 refresh failure (A3/A6)"
    addressed_in: "tracked by .planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md (ready: live-gate), not a later roadmap phase"
    evidence: "Operator declined server-side Amazon device deregistration during the live gate (UAT item 5, 'skipped — not scorable'); deferred by explicit operator decision recorded in 49-LIVE-GATE.md Post-run disposition and deferred-items.md #3, not a gap in Phase 49's own delivered scope"
advisory:
  - finding: "Mid-session signInProbe verdict=cleared is picked up by the Library notice only on the next mount/push/pull trigger, not continuously"
    category: other
    reason: "Recorded as F-49-R1-2 / deferred-items.md #5 and as WR-03 in 49-REVIEW-DISPOSITION.md, tracked in .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md (severity: medium, ready: code). Did not fail any of the 11 scored live-gate UAT items (item 11's 'completed sign-in leaves no row' path is a different trigger and passed); narrower than a blocking gap; 49-REVIEW-DISPOSITION.md states no open warning blocks closure."
    evidence_status: "triaged by operator, open todo exists, not yet fixed"
  - finding: "nile's healthy/unknown classification can flip because the boot probe and listUpdateableGames() race on the same callRunner dedup key, not because of stdout/stderr interleaving order"
    category: other
    reason: "Originally recorded as F-49-R1-5 and filed under .planning/todos/pending/2026-10-10-nile-classifier-flips-on-stdout-stderr-interleaving.md; the code review (49-REVIEW.md, finding WR-01) corrected the root-cause hypothesis — the real cause is a callRunner dedup-key collision between the probe and listUpdateableGames(), not stdout/stderr ordering — and the todo was renamed accordingly to .planning/todos/pending/2026-10-10-nile-probe-joins-list-updates-in-flight-spawn-and-never-observes-output.md (confirmed on disk: old filename absent, new filename present, severity: medium, ready: code, disposition: open in 49-REVIEW-DISPOSITION.md). Did not cause a false 'expired' latch in the live gate; classification noise between unknown/healthy only."
    evidence_status: "root cause corrected by code review, open todo exists under its new name, not yet fixed"
  - finding: "The not-connected row is low-contrast (black text on a dark banner) in the nord_light theme"
    category: other
    reason: "Recorded as F-49-R1-6, tracked in .planning/todos/pending/2026-10-10-not-connected-row-illegible-in-nord-light.md (severity: minor, ready: code). Cosmetic, theme-scoped, not a functional gap."
    evidence_status: "triaged by operator, open todo exists, not yet fixed"
  - finding: "src/backend/storeManagers/steam/authTrigger.ts's ORIGIN_TO_TRIGGER[origin] lookup is a plain-object bracket access on renderer-supplied input with no own-property guard"
    category: security
    reason: "New finding, independently confirmed in this re-verification: discovered by the Phase 49 code review (49-REVIEW.md, finding WR-04) and NOT present in this report's prior pass. Tracked by the new .planning/todos/pending/2026-10-10-authtrigger-origin-lookup-is-an-unguarded-bracket-access.md (severity: minor, ready: code, disposition: open per 49-REVIEW-DISPOSITION.md, which states no open warning blocks closure). Not scored as a gap because it is a hardening finding on an input path, not an observed functional failure against any of R1-R9; 49-SECURITY.md's threat register (46/46 closed, threats_open: 0) does not flag this line as an open security threat, suggesting it falls below the register's threshold, not that it was missed — flagged here independently rather than deferred to that claim."
    evidence_status: "open todo exists, not yet fixed, explicitly non-blocking per code review disposition"
human_verification: []
---

# Phase 49: Cross-store signed-out / offline mode Verification Report

**Phase Goal:** Warn the user which stores they are not signed in to (Epic, GOG, Amazon, Humble,
Steam) from one consolidated surface, while cached libraries still render and installed games
remain launchable. The Steam client is the reference UX: it tells you plainly that you are
offline, and then gets out of the way so you can still play what is already on disk.

**Verified:** 2026-10-10 (re-verification)
**Status:** passed
**Re-verification:** Yes — after gap closure (operator-accepted boundary, not a code change)

## Re-verification Summary

The initial pass (2026-10-10T00:00:00Z) scored 8/9 and reported one gap: the boot sign-in probe
cannot detect an expired Amazon (nile) credential when zero Amazon games are installed, and
49-SPEC.md's edge-coverage table had no row anticipating that state — so it was reported as an
unanticipated shortfall rather than an accepted boundary.

Since that pass, 49-SPEC.md's `## Edge Coverage` table was amended (committed) to add exactly the
row this report's gap entry named as sufficient: a `🚧 boundary` row for category `empty`,
requirements R2/R3, reading "ACCEPTED 2026-10-09 (operator)" and citing the same two pending
todos this report already cited (`ready: code` for the probe replacement, `ready: live-gate` for
the Amazon induction that would let a replacement probe's output be measured). The coverage
summary line now reads "24/24 applicable edges resolved · 0 unresolved (17 explicit · 1 backstop
· 5 dismissed · 1 accepted boundary, added 2026-10-09)".

This re-verification independently read that amended table (not accepted on the coordinator's
word alone — see `## Verification of Amended Artifacts` below) and confirms it matches exactly.
No code changed for this gap; an operator decision converted an unanticipated shortfall into a
documented, scoped, remediation-tracked boundary. That is the disposition this report's own
original gap entry proposed as sufficient ("...or an explicit accepted-limitation note added to
49-SPEC.md's edge coverage table"), so the gap is now recorded as `deferred`, not `gaps`.

This re-verification also independently examined the new 49-REVIEW.md / 49-REVIEW-DISPOSITION.md
/ 49-SECURITY.md / 49-VALIDATION.md artifacts (not present at the time of the initial pass) and
found one additional finding (WR-04, authTrigger.ts origin lookup) not previously reported here;
it is added as a new advisory entry above. All four open code-review warnings (WR-01 through
WR-04) are explicitly non-blocking per 49-REVIEW-DISPOSITION.md's own text ("none blocks
closure"). With the one prior gap now a documented accepted boundary, no remaining FAILED truth,
and no human-verification items, overall status moves from `gaps_found` to `passed`.

## Verification of Amended Artifacts (this re-verification round)

| Claim | Independently checked | Result |
|---|---|---|
| 49-SPEC.md Edge Coverage gains a `🚧 boundary` row, R2/R3, "ACCEPTED 2026-10-09 (operator)" | Read `49-SPEC.md` lines ~300-345 directly | Confirmed verbatim, including the coverage summary line and both cited todo paths |
| 49-REVIEW.md exists, standard depth, 34 files reviewed | Read frontmatter | Confirmed: `reviewed: 2026-10-09T22:41:57Z`, `depth: standard`, `files_reviewed: 34` |
| 49-REVIEW-DISPOSITION.md: 0 critical, 4 warning, all open, none blocking | Read frontmatter and body in full | Confirmed: WR-01..WR-04, all `severity: warning`, all `disposition: open`; body states "none blocks closure" |
| WR-01 corrected root cause; todo renamed to the dedup-collision title | `ls` on both old and new todo filenames | Confirmed: old filename absent, new filename present |
| New finding WR-04 (authTrigger.ts bracket access) exists and is tracked | Read the new todo's frontmatter | Confirmed: `severity: minor`, `ready: code`, references `49-REVIEW.md WR-04`, file matches `src/backend/storeManagers/steam/authTrigger.ts` |
| 49-SECURITY.md: 46 threats, 0 open | Read frontmatter | Confirmed: `threats_total: 46`, `threats_open: 0`, `status: verified` |
| 49-VALIDATION.md: validated, Nyquist-compliant | Read frontmatter and the UAT disposition line (135) | Confirmed: `status: validated`, `nyquist_compliant: true`; body matches the "10 fixed and verified, item 5 deferred" disposition this report already recorded |
| Hardcoded-string gate green at `2a385fb4f` | `git show --stat 2a385fb4f` | Confirmed real commit, matches session's git status snapshot |
| `pnpm planning-gates` still green after the rename/new-todo churn | Re-ran | 12/12 passed |
| Full jest suite (11101 tests) passing | Not independently re-executed this round | Accepted as coordinator-reported, not re-run — the behavior-relevant surfaces (18 sign-in suites, 432 tests) were already independently executed and passed in the initial pass and are unchanged by this round's artifact-only changes; re-running the full suite here would add cost without new evidence on the one item that changed (a SPEC doc edit, not code) |

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
| 3 | R2/R3 — The same boot probe detects expiry for Amazon (nile), with the zero-installed-games state an explicit, operator-accepted boundary rather than an open failure | ✓ VERIFIED (accepted boundary) | Live-finding FINDING A4 (`49-LIVE-GATE.md` Run 1, UAT item 6 "issue") is unchanged in the code; what changed is that `49-SPEC.md`'s Edge Coverage table now carries a `🚧 boundary` row (added 2026-10-09, read directly in this re-verification) documenting and scoping the exact same limitation this report's prior pass found, with a tracked remediation path. See Deferred |
| 4 | R4/R5 — The notice is non-modal, in normal document flow, never covers the grid, and never blocks cached library rendering | ✓ VERIFIED | `LibrarySignInNotice/index.scss` has zero `position` declarations; component returns `null` for zero rows; mounted as a sibling of `GamesList`/`FocusRowStrip` in `Library/index.tsx`, never gating `libraryToShow` |
| 5 | R5 — A dismissed never-connected row stays dismissed across a relaunch; an expired row is never dismissible | ✓ VERIFIED | `resolveLibrarySignInRows` (read in full): `expired` rows always `dismissible: false`, dismissed set only consulted for `not-connected`. Relaunch-persistence bug (F-49-R1-3) found live, fixed by `aea939456`, live re-checked by operator 2026-10-09 ("Humble row absent" — confirmed in the closed todo's own text) |
| 6 | R6 — Sign-in from a row opens exactly one Manage Accounts overlay, and a completed sign-in clears the row in the same launch and after relaunch | ✓ VERIFIED | Live-verified (UAT item 11, pass): exactly two `oauthLoginCapture` windows (cancel + real sign-in), no third window on tab/back; `loginOpenParam.ts`/`signInTileState.ts` exist and their test suites pass |
| 7 | R7 — The Login screen's five tiles and the Library notice derive sign-in state from the same selector (no drift) | ✓ VERIFIED | `signInStateParity.test.ts` exists and passes; both `LibrarySignInNotice` and `Login/index.tsx` import `resolveSignInStates`/`collectSignInInputs` from the same modules (confirmed by import grep) |
| 8 | R8 — Cached library still renders and installed games remain launchable for every store in `expired`, with Epic's offline-capable games explicitly kept launchable | ✓ VERIFIED | `resolveEpicOfflineMode` (read in full) can only turn offline mode on, never blocks a launch; call site in `launcher.ts:528-534` confirmed, reads `storeExpired` once per launch. Notice never gates `GamesList`/`libraryToShow` (see truth 4) |
| 9 | R9 — Store names enter every new string only through `{{store}}` interpolation, never concatenation, across all 49 locales | ✓ VERIFIED | `gamelib.json` `library.signIn.{dismiss,expired,notConnected,reconnect,signIn}` and `login.{epic,gog,amazon}Reconnect` keys confirmed present in `en`; `notConnected` key confirmed present in all 49 locale directories by a full-directory grep (zero MISSING lines) |

**Score:** 9/9 requirements verified. R2/R3's Amazon arm is now an operator-accepted, documented
boundary rather than a failure (see truth 3 and Deferred). 0 present-but-behavior-unverified.

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
disposition: PASS 9/11 scored, 1 finding (item 6), 1 deferred (item 5)."** Item 6 (the Amazon
zero-installed-games finding) is now additionally backed by the 49-SPEC.md accepted-boundary row
(see Deferred), closing the one point this report's initial pass left open about item 6 not being
pre-accepted in the spec.

### Todo/Documentation Reconciliation

The task's given facts stated "five files" of pending todos; six were found in the initial pass.
This re-verification round adds one new pending todo (`authtrigger-origin-lookup...`, from
49-REVIEW.md WR-04) and renames one existing pending todo (`nile-classifier-flips-on-stdout...` →
`nile-probe-joins-list-updates...`, from 49-REVIEW.md WR-01) — net seven pending todos now on
disk, all correctly shaped (`pnpm planning-gates`: 12/12 passed, re-run this round). The original
reconciliation (eight live-gate findings-derived todos, two fixed same-day and moved to
`.planning/todos/completed/`) still holds; the review-derived todos (WR-01 through WR-04) are a
separate, additional set from the code-review pass, not live-gate findings, and are tracked by
49-REVIEW-DISPOSITION.md rather than 49-LIVE-GATE.md.

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
| `src/backend/storeManagers/steam/authTrigger.ts` boot-probe trigger | Sticky, deliberate, unreachable from renderer | ✓ VERIFIED (trigger logic); hardening gap flagged separately | `'boot-probe'` trigger referenced from `signInState.ts`/`pass.ts` import graph; full line-level audit of `DELIBERATE_TRIGGERS` not independently re-opened beyond the prior pass's corroborating test-suite evidence. This round's code review (49-REVIEW.md WR-04) separately flags `ORIGIN_TO_TRIGGER[origin]` as an unguarded bracket access on untrusted input — a hardening finding, not a functional defect in the trigger logic itself; see Advisory |
| 49 locale `gamelib.json` files, 8 new keys | All 49 locales carry the new keys | ✓ VERIFIED | Full-directory grep for `notConnected` found zero `MISSING` locales |
| `49-SPEC.md` Edge Coverage table | Documents the accepted Amazon zero-installed-games boundary | ✓ VERIFIED (new this round) | Read directly: new `🚧 boundary` row, category `empty`, R2/R3, dated 2026-10-09, cites both remediation todos |
| `49-REVIEW.md` / `49-REVIEW-DISPOSITION.md` | Standard-depth code review, all findings tracked and dispositioned | ✓ VERIFIED (new this round) | 34 files reviewed, 0 critical / 4 warning, all `open` and tracked to pending todos, disposition text states none blocks closure |
| `49-SECURITY.md` | Threat register verified, 0 open | ✓ VERIFIED (new this round) | `threats_total: 46`, `threats_open: 0`, `status: verified`, `asvs_level: 1` |
| `49-VALIDATION.md` | Validation pass complete | ✓ VERIFIED (new this round) | `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true` |

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
| `49-REVIEW-DISPOSITION.md` findings | pending todos (WR-01..WR-04) | each finding row maps 1:1 to a todo path, confirmed by reading the disposition table and checking each todo exists | WIRED |

No NOT_WIRED or PARTIAL links found among the links checked.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `LibrarySignInNotice` rows | `states` / `rows` | `collectSignInInputs(context)` → `resolveSignInStates` → `resolveLibrarySignInRows` → live per-store config-store reads (`legendaryConfigStore`, `gogConfigStore`, `nileConfigStore`, `steamConfigStore`, `humble` context) | Yes — live-verified against real binaries (legendary, gogdl) in the macOS gate, not just unit fixtures | ✓ FLOWING |
| `GamesList` library contents | `libraryToShow` | Unrelated selector chain, confirmed not gated by any sign-in read | Yes | ✓ FLOWING |
| `epicOfflineMode` decision | `offlineMode` | `legendaryConfigStore.get_nodefault('expired')`, read once per launch | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

All 18 sign-in-related Jest suites were run once in the initial pass (not filtered from a
full-suite run); not re-run this round since no sign-in-surface code changed (only planning docs
and todo files):

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

`pnpm planning-gates`: 12/12 passed, re-run this round (confirms todo frontmatter shape for all 7
pending + 2 completed Phase 49 todos, among others, including the new and renamed WR-tracking
todos).

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
| R2 | 49-02, 49-04, 49-05, 49-06, 49-09, 49-10, 49-11, 49-12 | Boot-time probe detects expiry per store | ✓ SATISFIED (with an operator-accepted boundary) | Epic/GOG/Humble/Steam fully satisfied; Amazon's zero-installed-games edge is documented and scoped as an accepted boundary in 49-SPEC.md's Edge Coverage table, not an open failure (see Deferred) |
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
handlers, no hardcoded-empty data flowing to render found in the files read in full. No code in
`authTrigger.ts` changed this round — WR-04 is a hardening finding on an existing unguarded
bracket-access pattern, not a newly introduced debt marker.

### Human Verification Required

None. All items with a human-judgment component (visual tone across themes, real Keychain
behaviour, real runner binary output, real sign-in flows) were already discharged by the
operator-run macOS live gate on 2026-10-09, which this verification treats as recorded evidence
per the task's given facts rather than re-litigating. The Amazon zero-installed-games boundary is
now a documented, operator-made decision, not an open item needing further human judgment.

### Gaps Summary

**No gaps remain.** The one gap reported in the initial pass — the boot sign-in probe's inability
to detect an expired Amazon (nile) credential when zero Amazon games are installed — has not been
fixed in code, but has been converted into an explicit, operator-accepted boundary, documented in
49-SPEC.md's Edge Coverage table and gated on two already-correctly-shaped pending todos (`ready:
code` for a replacement probe strategy, `ready: live-gate` for the Amazon credential induction
that would let that replacement be measured). That is precisely the resolution this report's own
original gap entry proposed as sufficient, and it was independently verified against the amended
spec document in this round rather than accepted on the coordinator's assertion alone.

The remaining live-gate and code-review findings (F-49-R1-2/WR-03 mid-session re-derivation,
WR-01 nile dedup-collision classification flip — root cause corrected and todo renamed this
round, F-49-R1-6 nord_light contrast, and the newly discovered WR-04 authTrigger.ts unguarded
bracket access) are real but did not fail any of the 11 scored UAT items, are already correctly
tracked as open todos, and 49-REVIEW-DISPOSITION.md's own text states none of them blocks
closure. They are reported as advisory, not blocking. Item 5 (Amazon expiry induction) remains an
operator-made deferral decision, not a gap, per the task's given facts.

Everything else — the consolidated notice, the four-value selector and its D-07 precedence, the
bounded/parallel/single-flight/edge-triggered probe pass and its boot-wiring order, dismiss
persistence (after the live `aea939456` fix), single-overlay sign-in routing, tile/notice parity,
the "cached library renders, installed games launch regardless of sign-in state" guarantee
including Epic's explicit offline-mode carve-out, and the 49-locale i18n rollout — was verified
directly against the codebase (not merely against SUMMARY or coordinator claims): files were read
in full, import/wiring graphs were traced, line numbers for the critical boot-ordering and
launch-gating invariants were confirmed directly, both post-run-disposition fix commits were read
in full via `git show` and their diffs substantively match their claims, all 18 sign-in-related
Jest suites (432 tests) were executed and passed, and — new in this round — the amended
49-SPEC.md edge-coverage row, 49-REVIEW.md/49-REVIEW-DISPOSITION.md, 49-SECURITY.md,
49-VALIDATION.md, the renamed todo, and the new WR-04 todo were each read directly and confirmed
to match their claimed content, with `pnpm planning-gates` re-run and still 12/12 green.

---

_Verified: 2026-10-10 (re-verification)_
_Verifier: Claude (gsd-verifier)_
