# Deferred Items

Out-of-scope discoveries logged here per the executor's scope-boundary rule (only auto-fix
issues directly caused by the current task's changes).

## Phase scope — Epic pristine login surface deferred by user decision (2026-08-04)

**Disposition: deferred to a follow-up phase, not fixed here.**

Epic is implemented LAST, after all other accounts/runners (Humble/GOG/Amazon) are ported and
proven — a locked user decision, not a planner judgement. See `34.4.2-PLATFORM-SCOPE.md`'s
**EPIC-DEFERRED** section for the full record: the decision text, why (the parked deterministic
pre-auth 403, the zero-injection constraint the pristine surface exists to satisfy, the standing
hCaptcha/UA constraint), the six things consequently not built (one per plan), what stays true for
Epic in the meantime (its login window is byte-unchanged, machine-enforced by
`PHASE_34_4_2_NEW_SYMBOLS`), and what a future Epic phase inherits. Not duplicated here.

## Plan 05 — `helperProcess.test.ts` full-suite-only flake, reproduced again (2026-08-04)

- **Found during:** Task 2's `npm run test:ci` verification run (189 passed / 190 suites, 1
  failed — 3715/3716 tests).
- **Symptom:** `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` — test
  `HEALTH never answers at all (probe timeout every attempt) -> unreachable, ready:false` exceeded
  its 10000ms Jest timeout under full-suite timing pressure.
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs` —
  never accept a baseline flake without running the single-file repro first): `npx jest
  src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` in isolation →
  **9/9 passed**, including this exact test, in 6.2s.
- **This is the SAME flake already recorded** in
  `34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/deferred-items.md`
  ("Plan 18 — `helperProcess.test.ts` full-suite-only flake"), reproducing again on this phase's
  own verification run.
- **Scope:** the Steam bridge helper process and its test file are entirely outside this plan's
  `files_modified` (`src/backend/__tests__/dummyStoreHarnessContainment.test.ts`,
  `src/backend/sidecar/__tests__/testContainment.test.ts`, `34.4.2-LIVE-GATE.md`,
  `34.4.2-PLATFORM-SCOPE.md`, this file). Not fixed here per the scope-boundary rule.
- **Disposition:** logged, not fixed. A future session touching `helperProcess.test.ts` or its
  suite-ordering/timing assumptions should re-run this repro before assuming it is unrelated.

## Plan 05 — `seam-parity-sweep.py` real-tree run fails on a site outside this phase's diff (2026-08-04)

- **Found during:** Task 2's Electron-unchanged evidence gathering — `34.4.2-PLATFORM-SCOPE.md`'s
  own instruction to run `seam-parity-sweep.py` and record its exact output.
- **Symptom:** the script exits 1 with `GATE FAILED: Axis A site
  src/backend/sidecar/humbleLoginFlowRegistration.ts:449 matched none of the mechanical tiers
  (wipeSteps/configStore/return-snippet/ternary) AND has no SITE_PROFILES entry`. Its own
  `--self-test` harness passes clean (13/13 checks confirmed capable of rejecting bad input),
  so the script's own logic is not in question — its `SITE_PROFILES` table is stale relative to
  a site this phase never touches.
- **This is the SAME class of staleness** already logged and resolved-then-recurring in
  34.4.1's own `deferred-items.md` (Plan 18 → re-forwarded by Plan 19 → finally fixed by Plan 28,
  for a *different* pair of sites: `clearHumbleStorage`/`clearEpicStorage`). The lesson recorded
  there applies unchanged: **"the file was never listed in a plan's `files_modified`"** is why it
  keeps recurring, not a defect in the fix discipline itself.
- **Scope:** `seam-parity-sweep.py` and any generated `34.4.2-SEAM-PARITY-SWEEP.md` are not in
  this plan's `files_modified`. This phase's own `git diff --stat` (scoped to its base commit,
  recorded in `34.4.2-PLATFORM-SCOPE.md` §4) confirms `humbleLoginFlowRegistration.ts` is
  untouched by plans 01-05 — the stale site is pre-existing, not introduced by this phase. Not
  fixed here.
- **Disposition:** logged, not fixed, no owning plan yet. A future plan that DOES declare
  `seam-parity-sweep.py` in its `files_modified` should add a `SITE_PROFILES` entry for
  `humbleLoginFlowRegistration.ts:449` (or classify it as a legitimate mechanical-tier miss) before
  trusting the sweep's completeness again.

## Plan 05 — pre-existing REQUIREMENTS.md checkbox/prose mismatches found, not fixed (2026-08-04)

**Disposition: CLOSED 2026-08-04 by plan 09, Task 3.**

Plan 09's own Task 3 corrected every premature `[x]` this entry named, plus two more mismatches the
mechanism swap (plans 07-08) itself introduced: REQ-34.4.2-04, -05, -06 and -09 are all now `[ ]`,
each row naming the specific item in `34.4.2-LIVE-GATE-RERUN.md` (not plan 06's failed, now-stale
contract) as its precondition. REQ-34.4.2-07's premature-`[x]`-before-its-own-artifact question
(the second bullet below) was investigated no further by plan 09 — it is a distinct, narrower
question (temporal ordering of a single commit, not a live-proof mismatch) and plan 09's own scope
(`files_modified`: `.planning/REQUIREMENTS.md`, this file) covers the live-proof class of mismatch
only. REQ-34.4.2-07 remains `[x]` and is left as found; whoever next re-derives its git history can
answer the original "how did this get checked before plan 05 ran" question independently of this
closure.

- **Found during:** Task 2, cross-checking this phase's requirement rows against the artifacts
  that are supposed to close them.
- **Symptom:** two rows in `.planning/REQUIREMENTS.md` are marked `[x]` while their own prose
  states the box should stay UNCHECKED until a later plan's artifact lands:
  - **REQ-34.4.2-06** ("Cmd+V paste continues to work... **Live-only claim — box stays UNCHECKED
    until plan 06's live gate observes it.**") is `[x]` even though plan 06 has not yet run.
  - **REQ-34.4.2-07** ("No credential store is built or read... **Plan 05's containment-guard
    deliverable — box stays UNCHECKED until then.**") was already `[x]` before this plan's own
    Task 1 (the containment guard) had been written.
- **This is the same class of defect** `34.4.1-.../deferred-items.md` recorded as D-29-09
  ("REQUIREMENTS checkboxes were `[x]` while their own riders said 'stays UNCHECKED'"): a claim
  not matched by its artifact. Unlike D-29-09 (found after a gate had FAILED twice), the precondition
  gap here is temporal — the checkbox was set before its own stated precondition plan had run at
  all, most likely a copy/paste of an adjacent already-closed row's `[x]` state during phase
  planning or a subsequent checker-fix commit.
- **Scope:** `.planning/REQUIREMENTS.md` is not in this plan's `files_modified` (`34.4.2-05-PLAN.md`
  frontmatter). This plan's own end-of-execution `requirements mark-complete` step is scoped
  narrowly to avoid compounding the problem: only `REQ-34.4.2-07` is passed (genuinely satisfied by
  this plan's own Task 1), and `REQ-34.4.2-09` is deliberately withheld from that call despite
  appearing in this plan's frontmatter `requirements:` list, because REQ-34.4.2-09's own row text
  is explicit that it is "Plan 06's deliverable — box stays UNCHECKED until then," and this plan
  writes only the gate CONTRACT, not a gate RESULT. REQ-34.4.2-06's pre-existing incorrect `[x]` is
  left as found — fixing it would require editing a row this plan's own scope does not cover, and
  toggling one bit without addressing the underlying "why was this checked early" question would
  not be a real fix.
- **Disposition:** logged, not fixed. A future plan (ideally plan 06, which DOES touch
  `REQUIREMENTS.md` per the phase's own established convention) should correct REQ-34.4.2-06's
  premature `[x]` back to `[ ]` if plan 06's live gate has not yet recorded a PASS for item 4 by the
  time that plan starts, and should investigate how REQ-34.4.2-07 came to be checked before this
  plan (05) had produced any artifact at all.

## Plan 07 — `.planning/STATE.md`'s "Next action" line points at an unrelated Phase 34.5 gap cycle (2026-08-04)

- **Found during:** Task 3's `state_updates` step, while hand-correcting the `gsd-sdk` state-write
  corruption this cluster's own STATE.md notes document repeatedly (see the `NOTE (34.4.2-07)`
  added alongside this session's `state.advance-plan`/`state.update-progress` calls).
- **Symptom:** immediately below `Phase: 34.4.2 ... — EXECUTING` / `Plan: 8 of 10` sits
  `**Next action:** \`/gsd-plan-phase 34.5 --gaps\` — gap cycle 6...` — a next-action pointer for a
  completely different phase (34.5), not for 34.4.2's own next step (plan 08's close affordance,
  per T-34.4.2-33). Reads as though it is 34.4.2's own next action given its position directly
  under the Current Position header.
- **Scope:** `STATE.md` is not in this plan's `files_modified`
  (`src-tauri/src/main.rs`, `src/backend/__tests__/tauriShellSource.test.ts`,
  `.planning/REQUIREMENTS.md`); the `Next action:` line's own content predates this session (it was
  not introduced by this session's `gsd-sdk` writes, confirmed by diffing against the pre-session
  snapshot) and rewriting stale cross-phase narrative is outside this executor's scope-boundary
  rule for a single-plan execution.
- **Disposition:** logged, not fixed. A future session (ideally the one that opens Phase 34.4.2's
  own live-gate work, plans 09/10) should replace that line with 34.4.2's actual next action, or
  relocate the 34.5 gap-cycle-6 pointer to wherever Phase 34.5's own current-position block lives.

## Plan 09 — the autofill glyph's un-gated cross-platform injection remains unfixed, now with a macOS-gated sibling for contrast (2026-08-04) — **CLOSED 2026-08-05 by plan 13's deletion**

**CLOSED 2026-08-05 (plan 13, operator decision D-A).** Not fixed by gating the call site to macOS
— the entry below's own recommended fix — but by deleting `autofill_glyph_script` and its call site
outright, as part of the whole in-field autofill mechanism's removal (`34.4.2-LIVE-GATE-RERUN-2.md`
item 3, F-34.4.2-09). Worth recording the irony for future sessions: an inert, unlabelled key icon
that did nothing when clicked on Windows/Linux was logged as owed work across three plans (05, 08,
09), and the fix that finally landed was deleting the icon everywhere, including macOS, rather than
ever gating or shipping a cross-platform poster for it.

- **Found during:** Task 2's platform-scope record update, re-examining `34.4.2-PLATFORM-SCOPE.md`
  § 1's own standing finding while adding plan 08's new symbols to the same table.
- **Symptom:** `autofill_glyph_script`'s injection call site (`main.rs:3649-3657`, inside
  `humble_login_open`'s `if visible` block) still carries **no** `#[cfg(target_os = "macos")]`
  guard, exactly as plan 05 first recorded. This gap cycle (plans 07-09) did not touch that call
  site at all -- confirmed by the scoped `git diff --stat fc38d229c^..95f631fe3 -- src/backend
  src/frontend src/common` recorded in `34.4.2-PLATFORM-SCOPE.md` §4's gap-cycle subsection, which
  shows only a test file changed, and by direct inspection of `main.rs:3649-3657` this session.
- **What is new, for contrast:** plan 08 added a SECOND injected control, the cancel strip
  (`login_cancel_strip_script`), whose call site (`main.rs:3668-3675`) IS deliberately
  `#[cfg(target_os = "macos")]`-gated -- a considered choice recorded in `34.4.2-08-SUMMARY.md`'s
  own key-decisions ("only macOS presents a login window as a sheet in the first place"), not an
  oversight. The same login form now has one injected control that is platform-gated and one that
  is not, for principled but different reasons (the strip has no reason to exist off macOS; the
  glyph was never scoped to macOS in the first place, per plan 03's own original design). This
  asymmetry is recorded in `34.4.2-PLATFORM-SCOPE.md` § 1's finding, updated this plan.
- **Scope:** `src-tauri/src/main.rs`'s `autofill_glyph_script` call site is not in this plan's
  `files_modified` (`34.4.2-LIVE-GATE-RERUN.md`, `34.4.2-PLATFORM-SCOPE.md`,
  `deferred-items.md`, `REQUIREMENTS.md` -- docs only, this plan touches no Rust source). Gating
  it would also be an out-of-scope behavioural change for a docs-only gap-cycle plan whose entire
  job is to write and reconcile records, not alter shipped behaviour.
- **Disposition:** logged, not fixed, no owning plan yet. Whoever next builds a Windows or Linux
  poster for the AutoFill affordance (out of scope for this whole phase, per the skill's own
  Constraints section) should gate `autofill_glyph_script`'s call site to macOS at the same time,
  or ship a real cross-platform poster so the icon is no longer inert off macOS. Until then, an
  unlabelled key icon that does nothing when clicked remains a worse experience than no icon at
  all on Windows/Linux -- this phase's own finding, still true.

## Plan 11 — seven `34.4.2-REVIEW.md` findings deliberately OUT of scope this cycle (2026-08-05)

**Disposition: deferred, not fixed. Operator decision D-A scoped this cycle to exactly five
findings (WR-07, WR-03, WR-04, WR-01, IN-02) that sit directly on gate items 2/3/5's own routes;
the seven below sit adjacent but are not on those routes.**

- **WR-02 — use-after-free race on raw `NSWindow` addresses across the worker→main hop.**
  **File:** `src-tauri/src/main.rs` (`present_login_window_as_sheet`'s and
  `dismiss_login_window_sheet`'s `login_window_ns_window` resolution, present's crossing a real
  thread boundary). **Symptom:** the address is resolved on a worker thread and reconstructed
  into a live reference inside a queued main-thread closure; if the login window closes between
  resolution and execution, the `NSWindow` may already be released, producing a dangling
  dereference (a hard crash in the shell process). **Why out of scope:** not on any of items
  2/3/5's own routes -- it is a narrow, timing-dependent race with no reported live occurrence.
  **Disposition:** logged, not fixed, no owning plan. **NARROWED 2026-08-05 (plan 13):** the
  poster's own worker-to-main `NSWindow` address hop (`post_autofill_right_click`'s resolution of
  `login_window_wk_webview`, a sibling race of the same shape) is gone with the deleted mechanism
  — this threat's remaining sites are `present_login_window_as_sheet` and
  `dismiss_login_window_sheet` only, strictly fewer than before. Still OPEN, still not fixed here.
- **WR-05 — the strip route destroys the window synchronously inside its own WKWebView
  navigation-policy callback.** **File:** `src-tauri/src/main.rs` (the sentinel branch inside
  `humble_login_open`'s `.on_navigation(` closure, `request_login_sheet_cancel`). **Symptom:**
  `request_login_sheet_cancel` runs `endSheet:` and `window.close()` inline, from inside
  `decidePolicyForNavigationAction`'s own call stack -- undefined-order teardown inside a WebKit
  delegate, a latent crash of the same shape as the minimize/restore unresponsiveness class this
  phase exists to fix. **Why out of scope:** the fix shape (defer the close out of the delegate
  frame via `tauri::async_runtime::spawn` or a queued main-thread task) is itself a structural
  change to the dismissal call graph, not one of this cycle's five named findings, and no live
  crash has been observed. **Disposition:** logged, not fixed, no owning plan.
- **WR-06 — arbitrary (not-oldest) debounce eviction, and refusals arm the debounce.** **File:**
  `src-tauri/src/main.rs` (`post_autofill_right_click`'s `LAST_AUTOFILL_POST` eviction and
  ordering). **Symptom:** `map.keys().next()` on a `HashMap` yields an arbitrary key, not the
  oldest, so a burst of new labels can evict the *hot* label's timestamp; the timestamp is also
  written before the `PRESENTED_LOGIN_SHEETS` membership check, so a refused request still
  consumes the label's rate-limit window. **Why out of scope:** not on items 2/3/5's own routes
  (it affects debounce fairness, not sheet dismissability, strip rendering, or the WR-01
  registry). **Disposition:** logged, not fixed, no owning plan. **MOOT 2026-08-05 (plan 13)** —
  its subject (`post_autofill_right_click`'s `LAST_AUTOFILL_POST` debounce map, and the poster
  itself) no longer exists.
- **WR-08 — harness-containment Test 1 never walks `src-tauri/src/`; unguarded `statSync`.**
  **File:** `src/backend/__tests__/dummyStoreHarnessContainment.test.ts` (Test 1's offenders
  list; `listAllFilesRecursive`'s `statSync` call). **Symptom:** Test 2 scans both `src/` and
  `src-tauri/src/` for the port literal, but Test 1 (the harness path string) scans only `src/`
  -- a harness-path reference in the Rust shell would ship undetected. Separately, `statSync`
  lacks the try/catch `readFileSync` has, so a broken symlink throws an unrelated error.
  **Why out of scope:** a test-harness hygiene fix, not one of this cycle's five review-finding
  fixes, and this plan's `files_modified` does not include that test file. **Disposition:**
  logged, not fixed, no owning plan.
- **IN-01 — `PRESENTED_LOGIN_SHEETS` cap eviction drops a still-presented label without ending
  its sheet.** **File:** `src-tauri/src/main.rs` (`register_presented_login_sheet`'s eviction,
  formerly inline in `present_login_window_as_sheet`). **Symptom:** at cap (50), `list.remove(0)`
  evicts the oldest presented label; every later dismissal of that label is membership-gated to a
  no-op, so its `endSheet:` never runs. **Why out of scope:** unreachable in practice (at most 1-2
  login windows are ever open at once, per the cap's own doc comment); the same failure class as
  WR-01, but WR-01's own fix (re-registration on a failed hop) does not touch the eviction path
  itself. **Disposition:** logged, not fixed, no owning plan.
- **IN-03 — `is_login_cancel_request` ignores the URL scheme.** **File:** `src-tauri/src/main.rs`
  (`is_login_cancel_request`). **Symptom:** host + path only; any scheme matches. **Why out of
  scope:** practically inert (the host is the reserved `gamelib.invalid`, and a hostile page
  force-cancelling its own window is the accepted T-34.4.2-34 threat); not on items 2/3/5's own
  routes. **Disposition:** logged, not fixed, no owning plan.
- **IN-04 — the entire automated surface for this phase is source-text assertion; no test can
  observe presentation ordering or attachment.** **File:**
  `src/backend/__tests__/tauriShellSource.test.ts` (every Jest gate); `src-tauri/src/main.rs`
  (every cargo test, all AppKit-free pure helpers). **Symptom:** nothing in the automated suite
  executes `beginSheet:`/`endSheet:` or observes their effect -- exactly how cargo 131/131 +
  jest 3735/3735 stayed green through a 0/6 live gate (the project's "live gate beats a green
  suite" pattern, fourth instance). **Why out of scope:** this is a structural limitation of the
  testing approach, not a fixable finding within a single plan's `files_modified` -- CR-02's
  `attachedSheet()` read-back (already landed, outside this plan) is the cheapest partial
  mitigation, giving the LIVE gate a trustworthy machine signal; a real fix would mean building
  AppKit-executing test infrastructure, out of scope for this phase entirely. **Disposition:**
  logged, not fixed, no owning plan -- accepted as a standing limitation, mitigated by the live
  gate's own `attached=` requirement (`34.4.2-LIVE-GATE-RERUN-2.md` item 1).

## Plan 11 — the debug arc's three commits landed with no phase plan documenting them (2026-08-05)

- **Found during:** Task 3's own propagation work, cross-referencing
  `.planning/debug/resolved/white-window-not-sheet-cr01.md` against this phase's plan ledger.
- **Symptom:** commits `751521663` (CR-01/CR-02), `56d4986f8` (F-34.4.2-04 diagnostics +
  watchdog), and `8b2fdb315` (F-34.4.2-05 the 250ms `dispatch2` deferral) all landed between plan
  34.4.2-10's failed rerun and this plan (34.4.2-11) via a standalone debug session
  (`/gsd-debug`-style investigation), not via a numbered phase plan. Before this task, no
  `34.4.2-NN-SUMMARY.md`, `34.4.2-PLATFORM-SCOPE.md` row, threat-register entry, or
  `REQUIREMENTS.md` note named any of the three commits.
- **Scope:** this task (34.4.2-11 Task 3) IS the documentation -- `34.4.2-PLATFORM-SCOPE.md`'s
  per-symbol table and its fourth §5 update table, plus `34.4.2-LIVE-GATE-RERUN-2.md`'s own "What
  changed" section, plus REQ-34.4.2-01/-02's dated notes, all now name the three commits and
  quote the round-3 evidence transcript verbatim. Not a gap requiring a future plan.
- **Disposition:** CLOSED by this same plan's Task 3. Recorded here as a process note for future
  arcs: a debug session that lands commits mid-phase should route its documentation through the
  next phase plan (as this one did) rather than leaving the phase's own records silently stale
  about work that already shipped.

## Plan 13 — what the deletion deliberately did NOT do (2026-08-05)

**Not a gap — a scope boundary, recorded so a future session does not read the deletion's silence
on these four points as an oversight.**

- **Did NOT fix F-34.4.2-08.** `String.fromCharCode(128273)` truncating U+1F511 to a PUA tofu box
  (`autofill_glyph_script`, the deleted key-glyph generator) is MOOT, superseded by the deletion —
  applying `String.fromCodePoint` would have been work on a corpse. Explicitly instructed against
  in this plan's own `<action>` block.
- **Did NOT touch the cancel strip or sheet presentation (D-B/D-C).** `login_cancel_strip_script`'s
  generated JS, the Esc monitor, `present_login_window_as_sheet`,
  `dismiss_login_window_sheet`, `register_presented_login_sheet` and
  `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` are all confirmed byte-identical (extraction diff, this
  plan's SUMMARY) — only comments naming the now-deleted mechanism nearby were rewritten. D-B/D-C
  stand: child-window attachment is off the table forever, the cancel strip has no kill switch by
  design.
- **Did NOT touch Epic (D-D).** `open_pristine_epic_login_window` (18423 bytes) and
  `EpicPristineNavDelegate` (7706 bytes) are byte-identical before/after, confirmed by extraction
  diff, not merely by the coarser whole-file `git diff | grep` proxy this plan's own verify command
  also runs (which shows 3 removed lines that are stale mentions of Epic's function name inside the
  DELETED mechanism's OWN comments — see this plan's SUMMARY for the full explanation of that
  proxy's false positive).
- **Did NOT attempt any alternative autofill trigger.** D-A is a binding decision to delete, not
  disable, and forbids re-proposing the affordance under a different synthesis approach, a
  different trigger event, or behind a kill switch. No such attempt was made in this plan, and none
  should be proposed by a future session without a new operator decision superseding D-A.

## Plan 14 — the nile spawn tax that motivates the guard, and one silently-swallowed refusal path (2026-08-05)

**Disposition: both logged, neither fixed here. The guard this plan ships mitigates the
CONSEQUENCE of the first entry (an unrequested sheet), not its CAUSE (the upstream spawn delay).
The second entry is a real, recordable outcome for the new gate's own single-flight item, not
something to pre-empt with an out-of-scope fix.**

- **F-34.4.2-06 — the nile/PyInstaller-onefile spawn tax that creates the pre-presentation
  window T-34.4.2-39 closes.** **File:** `src/backend/storeManagers/nile/user.ts:30` (obtains the
  Amazon login URL by exec'ing `nile`, a PyInstaller onefile binary). **Symptom:** this project's
  own recorded measurement (`pyinstaller-onefile-spawn-tax` project memory) puts
  gogdl/legendary/nile's macOS spawn cost at 5-13s per exec — random `_MEI`
  extraction defeating the Gatekeeper signature cache. Clicking Amazon triggers this exec; the
  shell (and this plan's own guard) learn nothing about a login starting until `humble_login_open`
  is actually called, ~7-8s later on the Amazon path specifically. **Pre-existing, NOT a 34.4.2
  regression** — this phase (specifically Plan 07's sheet presentation) merely made the delay
  VISIBLE by putting a modal in front of it; before sheets existed, the same 7-8s gap produced a
  free-floating window that simply appeared late, with no queued-sheet consequence to notice.
  **Why out of scope:** the only in-repo lever is call-count reduction (per the project's own
  memory record), which is a different-shaped fix (caching/pre-warming the nile exec, or avoiding
  the CLI spawn on the hot path entirely) than anything this plan's `files_modified`
  (`src-tauri/src/main.rs`, `src/backend/__tests__/tauriShellSource.test.ts`,
  `34.4.2-PLATFORM-SCOPE.md`, this file) touches. **Disposition:** logged, not fixed, no owning
  plan. This plan's guard mitigates the CONSEQUENCE (an unrequested sheet arriving over a
  dismissed one) by making the pre-presentation window a REFUSAL instead of a silent queue — it
  does not, and is not intended to, shorten the 7-8s window itself.

- **Silent-refusal path: Humble's own `startLogin()`/`reconnect()` swallow a T-34.4.2-39 refusal
  with no user-visible signal, while the four OAuth runners (GOG/Amazon/Zoom, and Epic on
  non-macOS) surface it.** Task 1 step 6 traced BOTH consumers of a rejected `seam.open()`, per
  the plan's own instruction to verify rather than trust the registration comments' claims:
  - **`captureOAuthLogin` (GOG/Amazon/Zoom via `oauthCaptureLogin`) — SURFACES the refusal.**
    `captureOAuthLogin`'s `.open(...).catch((err) => { settle({ status: 'error', message:
    err.message }) })` (`src/backend/sidecar/oauthLoginCapture.ts:326-331`) resolves — never
    rejects — confirming `oauthLoginFlowRegistration.ts`'s own comment ("captureOAuthLogin()
    itself never rejects") is accurate for THIS refusal, not merely asserted. The frontend
    (`useTauriOAuthLogin.ts:283-287`) checks `outcome.status === 'error'` and calls
    `safeSetState({ phase: 'error', message: outcome.message })`; `TauriLoginPanel.tsx`'s
    `phase === 'error'` branch (line 188) renders `webview.login.oauth.error.heading` /
    `webview.login.oauth.error.body` with `Something went wrong while signing in:
    humble_login_open:login-already-in-progress` — the user sees an explicit, readable error.
  - **Humble's own `startLogin()`/`reconnect()` (via `humbleStartLogin`/`humbleReconnect`) —
    SWALLOWS the refusal silently.** `HumbleUser`'s watch (`src/backend/humble/user.ts:553-579`)
    has the identical `.open(...).catch((err) => { settle({ status: 'error' }) })` shape, so the
    refusal DOES reach the frontend as `{ status: 'error' }` — but `WebView/index.tsx`'s
    `runHumbleLoginWatch()` (lines 303-314) only branches on `result.status === 'done'`; there is
    no `'error'` branch at all. A refused Humble login therefore produces no toast, no navigation,
    no state change of any kind — the effect completes silently and the user is left looking at
    whatever they were already looking at, with zero indication a second login attempt was even
    made, let alone refused.
  - **Why out of scope:** REQ-34.4.2-08 requires all new behaviour in this phase to be
    `#[cfg(target_os = "macos")]`-gated; wiring an `'error'` branch into `runHumbleLoginWatch()`
    would be a cross-platform TypeScript change with no such gate available (the frontend cannot
    tell which platform refused it from here), and this phase has already recorded one standing
    wart against an un-gated cross-platform surface (the Plan 09 autofill-glyph finding, CLOSED
    2026-08-05 by Plan 13's deletion) — it must not acquire a second. The gate item
    `34.4.2-LIVE-GATE-RERUN-3.md`'s own single-flight item will measure what the user actually
    sees on both paths; a silent refusal on the Humble path is a real, recordable outcome for that
    item, not something to pre-empt with an out-of-scope fix here.
  - **Disposition:** logged, not fixed, no owning plan. A future plan wiring a Humble-side
    `'error'` phase into `runHumbleLoginWatch()` (or a shared error-surfacing convention across
    both login paths) should treat this entry as the starting trace.

- **WR-02, WR-05, WR-08, IN-01, IN-03, IN-04 — deliberately NOT re-opened.** This plan edits the
  same `humble_login_open` arm WR-02 (`present_login_window_as_sheet`'s and
  `dismiss_login_window_sheet`'s raw-`NSWindow`-address worker→main hop) sits in, which could read
  as an opportunity to revisit it — it is not. This plan adds no new raw-`NSWindow`-address hop of
  its own (`PENDING_VISIBLE_LOGIN_WINDOW` stores a `String` label and an `Instant`, never a
  pointer), so WR-02's own surface is unchanged, not narrowed and not widened. WR-05/WR-08/IN-01/
  IN-03/IN-04 are untouched by this plan's diff entirely (confirmed: none of the four new symbols
  or the refuse-or-arm check reference `request_login_sheet_cancel`, the harness-containment test,
  `PRESENTED_LOGIN_SHEETS`' eviction path, or `is_login_cancel_request`'s scheme handling). Stated
  here explicitly so the non-action is visible as a deliberate scope decision, not an oversight.
