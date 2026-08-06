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

## Plan 15 — gate run 2's orphaned findings folded into the ledger (2026-08-05)

**Disposition: this section exists because `34.4.2-VERIFICATION.md` flagged a consistency gap —
F-34.4.2-06 through -10, T-34.4.2-39, and the four-instance contract-authoring-defect pattern lived
only inside `34.4.2-LIVE-GATE-RERUN-2.md` and `34.4.2-12-SUMMARY.md`, not in this ledger. Folded in
now, each with the disposition it already carries elsewhere — no new investigation performed here,
no previously-deferred finding (WR-02, WR-05, WR-08, IN-01, IN-03, IN-04) re-opened.**

- **F-34.4.2-06 — the nile/PyInstaller-onefile spawn tax.** Already logged in full in this file's
  own **Plan 14** entry above (the pre-presentation window T-34.4.2-39 closes). Cross-referenced
  here, not duplicated.

- **F-34.4.2-07 — pre-presentation window allows a second login flow to queue behind the first.**
  **File:** `src-tauri/src/main.rs`, `humble_login_open`. **Symptom:** during the upstream nile
  spawn delay (F-34.4.2-06), no sheet is yet up, so nothing blocks input and a second login flow
  can be initiated; when both subsequently call `beginSheet:` on the same parent, AppKit queues the
  second sheet behind the first, so it appears unrequested at the moment the first is dismissed
  rather than at its own request time. Discovered live, `34.4.2-LIVE-GATE-RERUN-2.md`'s IN-RUN
  FINDINGS. **Disposition: MITIGATED by Plan 14** — the `PENDING_VISIBLE_LOGIN_WINDOW` single-flight
  guard refuses a second visible login window at the shell entry point while another is pending or
  presented, so AppKit is never asked to queue a second sheet at all. **Live discharge is pending**
  `34.4.2-LIVE-GATE-RERUN-3.md`'s own single-flight item (item 5). Cross-reference: T-34.4.2-39 (the
  threat this finding discovered; see below).

- **F-34.4.2-08 — the autofill glyph rendered as tofu, not a key.** **File:** `src-tauri/src/main.rs`
  (formerly `autofill_glyph_script`, now deleted). **Symptom:** `String.fromCharCode(128273)` is
  16-bit only; codepoint 128273 (U+1F511 KEY) lies outside the BMP and truncates to U+F511, an
  unassigned Private Use Area codepoint with no assigned glyph — every font rendered it as an empty
  box. One-line fix identified and NEVER applied: `String.fromCodePoint(128273)` (equivalently
  `'\u{1F511}'`). **Disposition: MOOT — superseded by Plan 13's deletion, deliberately NOT fixed.**
  The symbol this fix would have touched (`autofill_glyph_script`) no longer exists in the codebase.
  **Recorded explicitly so a later session does not rediscover this one-line fix and helpfully apply
  it to a symbol that is gone** — there is nothing left in `src-tauri/src/main.rs` for
  `String.fromCodePoint(128273)` to be applied to.

- **F-34.4.2-09 — spike 022's Recommendation #4 falsified; the phase's own design premise did not
  hold.** **File:** `.claude/skills/spike-findings-gamelib/references/login-window-ux-macos.md`
  (design source) and `src-tauri/src/main.rs` (formerly `post_autofill_right_click`, now deleted).
  **Symptom:** the synthesized right-click poster fired correctly, targeted the correct element
  (`hit_tag=Some("INPUT")`, `hit_type=Some("password")`), and popped the real system menu with
  `AutoFill ›` present — but selecting a seeded Passwords entry never filled the field. An identical
  REAL right-click, same sheet, same field, same entry, DOES fill — isolating the failure to the
  synthesized-event path itself and ruling out the sheet context, Humble's page, and the platform.
  Nowhere did spike 022's own evidence measure this last mile; it only ever showed the menu
  appearing. **Disposition: CLOSED by scope correction** — operator decision D-A (delete the
  mechanism, don't re-attempt or gate it), Plan 13's deletion of the mechanism in full, and the
  REQ-34.4.2-04/-05 rewrite stating Cmd+V/Edit ▸ Paste as the sole credential-entry route. **The
  knowledge-artifact half of this closure is this same plan's (15) Task 1 correction** to
  `login-window-ux-macos.md`: Recommendation #4/§4 now marked FALSIFIED at the point of use, before
  a future reader would otherwise act on the stale recommendation.

- **F-34.4.2-10 — Humble disconnect's storage wipe times out (non-fatal, incomplete logout).**
  **File:** `src/backend/humble/user.ts` (the `clearHumbleStorage` wipe step). **Symptom:**
  `Humble partition wipe step clearHumbleStorage failed (continuing): Error:
  humble_login_clear_storage:timeout`, recorded 20 seconds after a successful cookie census
  (`before(total=71, matched=37) after(total=34, matched=0) deleted=37 survivingNonHumble=34` —
  aggregate counts only). Cookies are cleared; localStorage/sessionStorage is NOT. Non-fatal by
  design (the disconnect flow continues past this failure), but the net result is a logout that
  leaves site storage intact. **Disposition: logged, not fixed, no owning plan.** A real functional
  gap in the logout path, independent of and not named by any of this phase's six gate items' PASS
  conditions — outside this phase's scope. **Flagged explicitly for whoever next touches the Humble
  disconnect path**, so this timeout is not silently rediscovered as a surprise.

- **T-34.4.2-39 — cross-reference only, not duplicated.** Spoofing (origin confusion from a second
  login flow queued behind a slow upstream CLI spawn, surfacing as an unrequested sheet arriving at
  the moment a different one is dismissed). Its authoritative record is
  `34.4.2-PLATFORM-SCOPE.md` §5's fifth update table (minted) and seventh update table
  (mitigate/source-fixed by Plan 14, live discharge assigned to `34.4.2-LIVE-GATE-RERUN-3.md`'s
  single-flight item). Not duplicated here; see F-34.4.2-07 above for this finding's own entry.

- **Contract-authoring defects — the four-instance pattern, its own entry (a process finding, not a
  code finding).** `34.4.2-LIVE-GATE-RERUN-2.md` produced four structural impossibilities in its own
  contract, all found DURING execution rather than review:
  1. Items 3 and 4's DummyStore arms required a `http://127.0.0.1:17940/...` origin that
     `login_window_url_arg`'s https-only gate (`src-tauri/src/main.rs:926`, test at `main.rs:5725`)
     can never load in a Tauri-managed login sheet.
  2. Precondition 4's logout preamble required navigating to that same forbidden `http://` origin —
     the identical cause as (1).
  3. Item 6(a)'s concurrency framing ("while a visible sheet is separately open") was structurally
     impossible: a sheet blocks its own parent by AppKit design, so no second flow can be driven
     concurrently through the UI. Measured instead via an alternate route exercising the identical
     `if visible` gate (a Humble disconnect).
  4. Item 2's required log line `status=cancelled reason=window-closed` is emitted by
     `oauthLoginCapture.ts:236`, gated to `OAuthRunner = 'legendary' | 'gog' | 'nile' | 'zoom'` —
     Humble is not an OAuth runner and structurally cannot emit it.

  None of the four caused a false PASS or false FAIL — each was caught and the item was scored on
  an equivalent, honestly-labeled alternate route or amendment — but four independent instances in
  one contract is a pattern, not four one-offs. **Disposition: ADDRESSED by Plan 15 Task 3** — a
  dedicated Structural Reachability Review, applying four defect-class tests (origin/scheme
  reachability, concurrency reachability, log-line emitter reachability, absence-observability) to
  every item and precondition in `34.4.2-LIVE-GATE-RERUN-3.md` BEFORE it is ever run, rather than a
  promise to "be more careful" next time. **This is measurable**: the count of structural
  impossibilities discovered during the next live run (plan 16) should be zero. If it is not, the
  review's own method — not just this one contract — should be revisited.

## Plan 16 — a fifth contract-authoring defect (an interaction, not a single unreachable requirement), plus two live findings (2026-08-05)

**Disposition: the evidence-capture defect is logged, not fixed here (this plan records a gate
result, it does not re-author the contract that produced it); the item-6 wedge is logged and
BLOCKS the phase, routed to gap cycle 4 for diagnosis.**

- **F-34.4.2-11 — Evidence-capture contract defect: mandatory `tee` truncation collides with the
  mandatory item-3(c) relaunch.** **File:**
  `34.4.2-LIVE-GATE-RERUN-3.md`'s own Evidence-capture instruction (mandates `tee
  /tmp/gamelib-dev.log` without `-a`) and item 3(c) (mandates a relaunch with
  `GAMELIB_AUTOFILL_GLYPH=0`). **Symptom:** every `npm run tauri:dev` launch truncates the tee'd
  log to zero before writing; the operator relaunched at least once during this run; only the
  FINAL launch's 214-line transcript survives (confirmed: `/tmp/gamelib-dev.log` at plan-16
  execution time contains exactly two Humble login/cancel cycles and nothing else). **Items 3 and
  5 — the two items this entire gap cycle exists to measure for the first time — are recorded PASS
  on the operator's verbatim word alone, with NO surviving transcript corroboration for either
  item's own decisive evidence** (item 3's zero-log-occurrence and `GAMELIB_AUTOFILL_GLYPH=0`
  no-op sub-checks; item 5's REFUSED line and the specific Amazon-then-Humble scenario) —
  `34.4.2-LIVE-GATE-RERUN-3.md` records this explicitly as LOST/UNAVAILABLE per item, not
  fabricated. **Why plan 15's Structural Reachability Review did not catch this:** the review's
  four defect-class tests examine each item, sub-check, and precondition INDIVIDUALLY; both
  requirements here are, individually, perfectly reachable — the defect is in their INTERACTION,
  a category the review's four tests were never designed to check. This is the fifth instance of
  this phase's contract-authoring-defect pattern, and the first that is an interaction defect
  rather than a single unreachable requirement (see `34.4.2-LIVE-GATE-RERUN-3.md`'s own finding
  for the full mechanism, and `34.4.2-PLATFORM-SCOPE.md` §5's ninth update for the T-34.4.2-42
  threat-register disposition). **Scope:** neither this plan's `files_modified` list nor any prior
  plan's covers re-authoring the gate contract's evidence-capture instruction. **Disposition:**
  logged, not fixed, no owning plan yet. Whoever next authors a live-gate contract for this phase
  should either append `-a` to the `tee` invocation with per-launch markers, or require a
  uniquely-named log file per relaunch — and should add a fifth Structural Reachability Review test
  for requirement-interaction reachability (does satisfying requirement A ever undo requirement
  B's own evidence?) before trusting the review's completeness again.

- **F-34.4.2-12 — Humble disconnect wedges the main thread (NEW, escalates F-34.4.2-10).** **File:**
  the Humble disconnect flow (`src/backend/humble/user.ts`'s hidden-window disconnect path and its
  shell-side counterpart). **Symptom:** clicking Humble's disconnect/logout control produced a
  hard, unbounded macOS main-thread wedge (spinning-wait cursor, unresponsive to all input),
  requiring the operator to force-kill the app — no graceful recovery, no error dialog, no log
  line (the surviving transcript ends before any disconnect-specific line, consistent with either
  a pre-emission wedge or a post-emission force-kill discarding an unflushed write; no claim is
  made about which). **No root cause is asserted.** This is a genuine escalation from
  F-34.4.2-10's own prior symptom (a BOUNDED, non-fatal storage-wipe timeout after which the
  disconnect flow continued) to an UNBOUNDED, fatal hang. Whether this cycle's plans 13/14 caused
  the escalation or merely exposed a pre-existing defect the bounded timeout was previously masking
  is **UNDETERMINED**. **Candidate layers, none preferred** (full reasoning in
  `34.4.2-LIVE-GATE-RERUN-3.md`'s own findings section): (a) plan 13's deletion of the
  `/autofill-request` sentinel arm from the shared `.on_navigation(` closure also carrying
  `/reveal`/`/clear-storage`/`/login-cancel` on `REVEAL_EXFIL_HOST`; (b) plan 14's single-flight
  latch's interaction with the hidden reveal-window path, though the latch's own `if visible ==
  true` scoping and this run's clean visible-path evidence make it a weaker candidate, not an
  eliminated one, since the hidden-window path itself was never reached live this run; (c) the
  pre-existing `humble_login_clear_storage` exfil-channel wait, which already carried a
  bounded-timeout defect (F-34.4.2-10) before this cycle. **New threat T-34.4.2-43 minted**
  (Denial of service, OPEN, BLOCKING — `34.4.2-PLATFORM-SCOPE.md` §5's ninth update). **Scope:**
  this plan records a gate result; it does not diagnose or fix code (author/runner discipline,
  D-E — the plan that recorded this result must not also repair it). **Disposition:** logged, not
  fixed, BLOCKS phase closure. Owed to gap cycle 4: a discriminator test distinguishing the three
  candidate layers before attempting any fix, per this phase's own standing lesson that when two
  readings of a measurement both fit, the next step is to build a discriminator, not ship the
  nicer-sounding cause.

## Plans 17-18 — the wedge closed, its residual closed, and the review method upgraded (2026-08-06)

**Disposition:** one blocking finding CLOSED (F-34.4.2-12), one residual CLOSED (F-34.4.2-13,
newly minted and closed in the same cycle), one process finding whose FIX is now mandated by a
standing reference but not yet applied (F-34.4.2-11, still OPEN), one new process finding minted
and given the same fix-mandated disposition (F-34.4.2-14), and one threat closed at source only
(T-34.4.2-43, live discharge still pending). F-34.4.2-10 is explicitly restated as still open.

**F-34.4.2-12 — CLOSED (diagnosed, fixed, live-verified).** Root cause: reentrancy self-deadlock
on tao's `EventLoopHandler` handler mutex via wry's blocking `WebviewWindow::cookies()` →
`wait_for_blocking_operation` → reentrant `NSRunLoop` pump → CoreAnimation flush → tao's
`handle_redraw` relocking the held mutex. Evidence: `sample` of the hung process, 4185/4185
samples in the identical frame chain, durable at
`.planning/debug/evidence/F-34.4.2-12-hang-sample-2026-08-06.txt`. Fix: commit `6bad86227`, async
`WKHTTPCookieStore.getAllCookies(completionHandler:)` at both implicated call sites
(`humble_login_cookies_for_domain`, `humble_login_clear_cookies`'s `count_matching` closure),
macOS-gated, non-macOS unchanged (D-09). Verified across four independent channels: operator live
repro (no beach-ball, disconnect completes), `cargo test` green (116 passed, 0 failed, 1 ignored)
including the new regression pin, the genuinely-emptied 2-byte `humble_store/config.json`, and a
fresh 197-line launch log reaching store teardown. Candidates (a) plan 13's `.on_navigation(`
shared-closure arm removal and (b) plan 14's single-flight latch are **FALSIFIED** — no
`.on_navigation` frame, no `/clear-storage` arm frame, no `beginSheet` frame anywhere in the
4185-sample capture. Candidate (c) is **SUBSUMED, not eliminated** — execution deadlocks strictly
before `clearHumbleStorage` runs, so (c)'s own bounded-timeout defect is neither confirmed nor
refuted. **F-34.4.2-10's bounded-timeout debt in `clearHumbleStorage` (`src/backend/humble/user.ts:919-1116`)
remains OPEN and unfixed** — it was simply never reached in the run that measured this defect, and
must not be quietly folded into this closure.

**F-34.4.2-13 (NEW, and CLOSED in the same cycle) — the login-poll cookie read shared the
identical hazard.** File: `src-tauri/src/main.rs`, the `humble_login_cookies` dispatch arm (the
`watchForLogin()` poll direction). Symptom: called wry's blocking `.cookies()` unconditionally on
every platform — mechanically identical to F-34.4.2-12, differing only in trigger shape (one call
per poll tick against a settled visible window, versus a four-call burst against a freshly-created
hidden window). **No live failure was ever observed on this path** — stated plainly; this closes a
latent risk, not a measured defect. Minted by the debug session's own `## Residual Risks` section
and brought into scope by operator decision D-F2. Disposition: CLOSED by plan 34.4.2-17 (commit
`83d3f7317`, porting the arm onto the same async pattern) and its shape-robust regression pin
(commits `34515a290`, `9eebcb0c2`) which now scans all three cookie-reading arms — `humble_login_cookies`,
`humble_login_cookies_for_domain`, `humble_login_clear_cookies` — for an exact four-site set across
three arms, per plan 34.4.2-17's own SUMMARY: `cargo test` 116 passed, 0 failed, 1 ignored;
`npm run test:ci` 191 suites, 3748 passed (+1 new self-test), 0 failed.

**The regression pin's structural limitation — CLOSED by plan 34.4.2-17.** The pin
`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` was originally a source scan matching two
exact call-site prefixes and would have missed a differently-shaped call — including the
split-line `window` / `.cookies()` form already present at `main.rs:4237-4238`. Now a shape-robust
substring scan across all three cookie-reading arms, with comment-line skipping, a minimum
found-count of three (later tightened to an exact-set assertion), and a split-line self-test.
Record the pin's REMAINING limitation honestly: it is still a STRUCTURAL scan, not a behavioural
test, and a live end-to-end deadlock reproduction remains unautomatable (it needs a real contended
AppKit/WebKit run loop; a hanging assertion would defeat its own purpose and could hang CI).

**F-34.4.2-11 — fix MANDATED, not yet applied.** Restated: a mandatory truncating `tee` (no `-a`)
colliding with a mandatory mid-run relaunch destroyed the transcript for items 3 and 5's own
decisive evidence in gate run 3. Plan 34.4.2-18 Task 3 writes the standing evidence-capture
standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`,
Section 3) that fixes it; plan 34.4.2-19 is the first contract required to implement it.
**Status stays OPEN until RERUN-4 carries the fixed instruction.**

**F-34.4.2-14 (NEW) — three required log lines were demanded of a sink that structurally cannot
carry them.** File: `34.4.2-LIVE-GATE-RERUN-3.md`'s Evidence-capture instruction plus items 2, 4
and 6(a). Symptom: `Humble sync finished:` (`src/backend/humble/library.ts:954`),
`Humble disconnect: cookie census before(...)` (`src/backend/humble/user.ts:1049`) and
`Humble login-window cookie read UNSUPPORTED_OR_ERROR for window {seamLabel} — aborting watch`
(`src/backend/humble/user.ts:461`) are all emitted by sidecar-side `logInfo`/`logWarning`, which
reach `~/Library/Logs/GameLib/gamelib.log` and never the tee'd terminal transcript (the sidecar's
stdout is the RPC frame pipe — this project's own `sidecar-console-and-logger-are-invisible`
lesson). The contract required them of the transcript. This is why item 4's line was recorded
absent with no cause assigned. **Compounding:** `gamelib.log` has its own relaunch truncation —
`src/backend/logger/log_writer.ts:72-74` (`existsSync(this.logFilePath)` then
`renameSync(this.logFilePath, this.oldLogFilePath)`) renames it to `.old` on first write per
process, so a third launch destroys the first launch's sidecar evidence outright. Disposition:
fixed by the dual-sink standard in Task 3; first implemented by plan 34.4.2-19's contract.
**Note explicitly:** this is a SIXTH instance of this phase's contract-authoring-defect pattern and
the SECOND whose reviewable unit is not a single requirement.

**T-34.4.2-43 (DoS — a user-triggered action wedges the entire application) — CLOSED at source,
pending live re-confirmation.** The source fix (`6bad86227`) is landed and unit-pinned, and the
third call site (`humble_login_cookies`) is now covered too (plan 34.4.2-17). Per
REQ-34.4.2-09 a source fix alone never closes anything in this phase — item 6(a) of RERUN-4 is its
live discharge. **Not marked discharged here.**

## Plan 20 — RERUN-4 RAN, verdict FAIL 1/6; four new findings, three of them contract defects (2026-08-06)

**Disposition: the phase does NOT close (D-08, not a genuine 6/6). Item 6(b) earned this phase's
first-ever measured PASS (Epic absence check) — a real, standalone win inside an otherwise FAILing
gate, reported as such and not inflated. Four findings minted this run, continuing the F-34.4.2-NN
sequence from F-34.4.2-14. All are logged here, none fixed in this plan — this plan records a gate
result, per the same author/runner discipline this phase has held since plans 05/06.**

Full item-by-item Observed/Verdict detail lives in `34.4.2-LIVE-GATE-RERUN-4.md` — not duplicated
here. This section records the four findings and their dispositions.

- **F-34.4.2-15 (F-A) — Capture-integrity defect, a NEW CLASS that generalises beyond this
  phase.** **File:** the evidence-capture instruction in `34.4.2-LIVE-GATE-RERUN-4.md` (Section 2
  of its dual-sink standard) and, by extension,
  `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` (the standing
  reference plan 18 wrote). **Symptom:** two `gamelib-shell` processes ran concurrently during
  launch 2 (PID 6862, ppid 6758 — the captured, idle gate launch; PID 7352, ppid 7241 —
  separately started, operator-driven). The `[shell]` stderr sink SPLIT: the driven instance's
  `[shell]` lines went to an uncaptured terminal, while `gamelib.log` stayed SHARED and kept
  receiving `[Backend]` lines from the driven instance. **Consequence:** an observer sees a
  plausible, populated `gamelib.log` and an apparently-healthy transcript, and can wrongly
  conclude `[shell]`-sourced items were measured when their decisive evidence never reached the
  capture at all — exactly what happened to items 1 and 2's own machine evidence this run. The
  dual-sink append-and-archive standard (plan 18's reference) assumes exactly ONE instance and has
  no check that would have caught this. **Why out of scope for this plan:** the fix (assert
  exactly one `gamelib-shell` PID for the whole launch, recorded at both launch and teardown)
  belongs in the standing reference document, which is not in this plan's `files_modified`.
  **Disposition:** logged, not fixed, no owning plan yet. A future contract-authoring plan should
  add this as a sixth capture-integrity requirement to `live-gate-contract-authoring.md` before
  the next live gate is staged. Associated with new threat **T-34.4.2-44**
  (`34.4.2-PLATFORM-SCOPE.md` §5's eleventh update).

- **F-34.4.2-16 (F-B) — Item 4 unmeasurable by construction; a contract precondition gap.**
  **File:** `34.4.2-LIVE-GATE-RERUN-4.md`'s own launch-plan ordering (item 4 before item 6(a)) and
  its Preflight Results section (which records `humble_store/config.json` state but not the
  WKWebView cookie-jar state). **Symptom:** the contract sequences item 4 (login completes via
  Cmd+V) before item 6(a) (disconnect, which clears cookies), but a pre-existing WKWebView Humble
  session — carried over from BEFORE this gate session began — makes item 4's own premise false:
  the login auto-completes with no credential entry to observe. The app-side store being wiped
  (`humble_store/config.json`, confirmed 2 bytes both before this run's preflight AND before that)
  is NOT sufficient evidence of a logged-out state, because the live WKWebView session cookie is
  what actually drives the auto-login. **Same defect CLASS as the truncating-`tee` (F-34.4.2-11):**
  items 4 and 6(a) are individually valid, defective only in their ordering relative to session
  state that persists OUTSIDE anything the contract's own preflight checks. **Why out of scope for
  this plan:** this plan records a gate result; it does not re-author the contract. **Disposition:**
  logged, not fixed, no owning plan yet. A future contract-authoring plan should add a WKWebView
  cookie-jar-clearing step (or an explicit precondition check for a clean session) before item 4.

- **F-34.4.2-17 (F-C) — Item 5's scenario is UI-unreachable; a contract defect the Structural
  Reachability Review's own Test 2 did not catch.** **File:** `34.4.2-LIVE-GATE-RERUN-4.md`'s item
  5 (the single-flight login-initiation scenario) and its own Structural Reachability Review's Test
  2 (concurrency reachability) row for that item. **Symptom:** the Rust single-flight guard
  (`PENDING_VISIBLE_LOGIN_WINDOW`) cannot be exercised from the UI as this item describes, because
  the frontend disables/clears the other login buttons while one login is already in flight —
  there is no Humble button to click during Amazon's ~7-8s spawn delay. Item 5 as written can
  never PASS. **Why the review missed it:** Test 2, applied at authoring time, reasoned correctly
  about BACKEND timing (the `if visible == true` scoping, when `humble_login_open` actually runs)
  but never checked whether the FRONTEND UI itself permits the described click sequence — a gap in
  what the test checks, not an unlucky miss on a case it was designed to catch. **Why out of scope
  for this plan:** this plan records a gate result; rewriting an item's PASS bar or a review test's
  own coverage is out of scope for the runner plan (D-E). **Disposition:** logged, not fixed, no
  owning plan yet. A future contract-authoring plan must either rewrite item 5 to drive the
  refusal below the UI (e.g., a direct Rust-command invocation with a pending latch already
  armed), restate it as a structural/unit-level assertion, or withdraw it as already covered by
  Plan 14's own mutation-proven guard test (ordering) — this item cannot be re-run as written and
  expect a different result.

- **F-34.4.2-18 (F-D) — Preflight gap: no check for a pre-existing `gamelib-shell` instance.**
  **File:** `34.4.2-LIVE-GATE-RERUN-4.md`'s Task 1 preflight (checks
  `lsof -nP -iTCP:17940 -sTCP:LISTEN` for the DummyStore harness, but nothing for a stray shell
  process). **Symptom:** a stale `gamelib-shell` instance (PID 95499, 56 minutes old) was already
  running when the operator started, forcing launch 1 to be aborted and cleanly re-run before any
  capture began. **Why out of scope for this plan:** a preflight-hygiene gap in a contract this
  plan does not re-author. **Disposition:** logged, not fixed, no owning plan yet. A future
  contract's preflight should add `pgrep -f gamelib-shell` (expect empty) alongside the existing
  port check — this is also the root precondition F-34.4.2-15/F-A's own second (aborted) launch-2
  instance shares in spirit, though F-A's own trigger was a deliberately operator-driven second
  instance, not a stray leftover one.

- **T-34.4.2-42's own scorecard — non-zero this run, a further completeness gap.** The count of
  structural impossibilities/unresolved requirement interactions actually encountered this run is
  **3** (F-34.4.2-15/F-A, F-34.4.2-16/F-B, F-34.4.2-17/F-C — F-D is a preflight-hygiene gap, not
  itself a structural-reachability miss), against this threat's own measurable clause of "should be
  zero." None of the five existing Structural Reachability Review tests, including the newly-added
  pairwise Test 5, anticipated: (a) a concurrent second app instance splitting a sink mid-session;
  (b) a pre-existing EXTERNAL session state (the WKWebView cookie jar) invalidating an item's
  premise independent of anything the contract's own preflight checks; or (c) a backend-reasoned
  concurrency scenario being foreclosed by a FRONTEND-level UI constraint the review never
  inspected. **Two candidate new test classes, named for a future review, neither built here:**
  "pre-existing external state reachability" (does the item's premise assume a fresh state that a
  carried-over external session can invalidate?) and "UI-level reachability distinct from
  backend-logic reachability" (does the backend scenario reviewed actually match what the frontend
  UI permits the user to do?). **Disposition:** logged against T-34.4.2-42
  (`34.4.2-PLATFORM-SCOPE.md` §5's eleventh update), not fixed here — a future review-authoring
  plan should add these two test classes before the next contract is trusted to be complete.

## Plan 23 — gap cycle 5 authoring: owners assigned to RERUN-4's four findings, F-34.4.2-10 deferred with reasons (2026-08-06)

**Disposition: this plan records no gate result — it authors `34.4.2-LIVE-GATE-RERUN-5.md`, the
seventh blocking contract in this phase's history, and assigns an owning plan to each of RERUN-4's
four findings. Applying plan 21's two new Structural Reachability Review tests (Test 6, Test 7) to
this new contract is itself part of what discharges F-34.4.2-15/-16/-17's OWNERSHIP here — but per
this section's own standing rule, an owned finding is not a closed finding until the run measures
the behaviour the fix is supposed to enable.**

- **F-34.4.2-15 (F-A) — Capture-integrity defect.** **Owner:** plan 34.4.2-20's own commit
  `db08bbfc6` (the standing reference fix) — **now IMPLEMENTED, for the first time, in a contract**
  by this plan: `34.4.2-LIVE-GATE-RERUN-5.md`'s Evidence-capture instruction §0 carries the
  `pgrep -f 'target/debug/gamelib-shell'` assertion at three points (before every launch, at
  window-appearance, at teardown) and the explicit abort-and-re-run rule. **Not closed** — closure
  requires a run that actually holds the assertion and reports zero splits; plan 24 owes that
  measurement.
- **F-34.4.2-16 (F-B) — Item 4 (and 1(e)/3(a)) unmeasurable by construction; a contract
  precondition gap.** **Owner:** this plan (34.4.2-23), Task 1. **Fix:** the D-G2 preparatory
  sequence — an unscored step that clears the WKWebView Humble cookie jar (via a confirmed
  two-branch fallback: auto-login-then-disconnect if a live cookie exists, or nothing further if
  the form already renders empty) and requires a POSITIVE observable (a rendered login form) before
  items 1(e), 3(a) and 4 begin. **Not closed** — the fix is written into the contract; closure
  requires plan 24's run to confirm the observable actually holds and the three items' evidence is
  captured this time.
- **F-34.4.2-17 (F-C) — Item 5's scenario is UI-unreachable; a contract defect Test 2 alone did
  not catch.** **Owner:** this plan (34.4.2-23), Task 1, per operator decision **D-G1**. **Fix:**
  item 5 is WITHDRAWN, permanently, not merely for this cycle — its scenario cannot be re-run as
  written and expect a different result. Coverage preserved by plan 14's mutation-proven unit test
  plus plan 22's new frontend pin (`loginInFlightUiReachability.test.tsx`); T-34.4.2-39/-41 restated
  as unit-proven + UI-pinned, NOT live-discharged, permanently. **This IS a closure** — a withdrawn
  item has no future "measured behaviour" to await; the withdrawal itself, with its full reasoning
  preserved in the contract, is the complete disposition. Recorded here as closed, unlike F-A/F-B
  above which remain open pending measurement.
- **F-34.4.2-18 (F-D) — Preflight gap: no pre-existing-instance check.** **Owner:** the same
  §0 fix as F-34.4.2-15 above — a `pgrep` assertion is now a documented PRECONDITION (precondition
  5) in `34.4.2-LIVE-GATE-RERUN-5.md`, not merely a preflight afterthought. **Not closed** —
  closure requires plan 24's preflight to actually run the check and report the result.
- **The T-34.4.2-42 scorecard entry.** **Owner:** plan 21 (Tests 6 and 7 added to the standing
  reference) and this plan (34.4.2-23), Task 2 (both tests APPLIED to a real contract for the first
  time — a per-requirement row for every item/sub-check/precondition/the preparatory
  sequence/the evidence-capture instruction itself, plus a Test 6 dedicated summary and a Test 7
  dedicated summary). **Not closed** — Tests 6 and 7 are derived from RERUN-4's own measured
  findings, not yet validated by a run that applied them and confirmed they hold; that validation
  is plan 24's own first opportunity.

**F-34.4.2-10's deferral, recorded here with the SAME three reasons and taking-condition as
`34.4.2-PLATFORM-SCOPE.md` §5's twelfth update (not duplicated in full, cross-referenced):** the
code path (`clearHumbleStorage`, `src/backend/humble/user.ts:919-1116`) has never been reached
live; it sits inside the one flow item 6(a) must measure, and this cycle's purpose (a clean,
reachable gate run) argues against adding an unmeasured change to it now; a fresh defect here would
risk item 6(a) failing to be reached for a THIRD consecutive cycle. Item 6(a)'s own new record-only
observability sub-check is added instead — confirmed at this authoring to have TWO real emitters
(`user.ts:1125` success, `user.ts:1139` failure/timeout), correcting this plan's own initial
uncertainty about whether any observable exists at all for this code path. **Taking condition:**
once item 6(a) records a measured PASS with the path confirmed reached, F-34.4.2-10 becomes a
normal source-fix candidate with observed behaviour to fix against — not before.

**Note honestly, per this section's own standing discipline: an owned finding is not a closed
finding.** Of the five items above, only F-34.4.2-17/F-C is recorded as closed — its disposition
(withdrawal with preserved reasoning) has no further measurement to await. F-34.4.2-15/F-A,
F-34.4.2-16/F-B, F-34.4.2-18/F-D and the T-34.4.2-42 scorecard entry are all owned and fixed IN THE
CONTRACT, but none is closed until plan 34.4.2-24's run measures the behaviour each fix is supposed
to enable. F-34.4.2-10 remains explicitly deferred, not owned by any fix this cycle.
