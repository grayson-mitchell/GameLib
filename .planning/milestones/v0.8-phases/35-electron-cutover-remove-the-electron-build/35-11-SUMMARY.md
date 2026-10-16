---
phase: 35-electron-cutover-remove-the-electron-build
plan: 11
subsystem: ui-dialogs
tags: [d-05, d-18, dialogs, download-queue, auto-resume, seam, req-35-17, t-35-45, t-35-46, t-35-47, t-35-48]
status: COMPLETE — blocking checkpoint PASSED, operator-driven dev build, macOS arm64, 2026-08-29

# Dependency graph
requires: [35-02, 35-06]
provides:
  - "Boot-time download-queue auto-resume ported to the sidecar (appShellFlowRegistration.ts frontendReady), so the capability survives main.ts's deletion at plan 35-14"
  - "A content-sized error dialog — `.errorDialog.error-box`'s fixed `height: 25em` replaced by `max-height`, fixing all 31 `type: 'ERROR'` call sites at the root rather than the two path-rejection ones"
  - "Dated Phase 35 dispositions in SEAM.md for Phase 32 D-05 (boot auto-resume, CLOSED) and Phase 31 D-02 (settings divergence, CLOSED on a grep)"
  - "The measured refutation of this plan's own dialog premise, both halves, and of its ~14/~25 census"
  - "D-35-11-01 — the structural reason the EOS remove confirmation cannot be app-styled without a decision, recorded rather than silently skipped"
affects: [35-14, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Establish a UI-sizing defect from a DECLARATIVE rule (`height: 25em`, unconditional and content-independent) rather than from a screenshot — then close the one confound a static read cannot cover, instead of asking for a live run that would only re-observe the same rule"
    - "When a flag's NAME suggests risk, read what it does before measuring around it: `isStartup=true` is itself the Steam suppression, so a live Steam-resume gate would have measured a path the ported code never executes"
    - "A/B a suspected self-inflicted test-harness regression against a `cp` snapshot of the pre-change file, so 'is this mine?' is answered by observation rather than by memory"
    - "`.unref()` a boot-time timer in a plain-`node` sidecar; the RPC stdin stream keeps the process alive, so the timer still fires while giving up its claim on the event loop"
    - "When a port removes a suppression, rewrite the log line that ANNOUNCED that suppression in the same commit — a log asserting a state that no longer exists is worse than no log"

key-files:
  created: []
  modified:
    - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/downloadQueueFlowRegistration.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
    - .planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md

key-decisions:
  - "THE PLAN'S DIALOG PREMISE IS INVERTED ON BOTH HALVES, established by measurement. Path-rejection is app-styled but oversized; EOS is native but correctly sized. The `must_haves` line calling both 'native system dialogs sized wrong for their content' is crossed on both counts."
  - "The plan's census is also inverted: its '~14 other dialogs that already use the app pattern' is the source todo's count of NATIVE `showMessageBox` sites — the ones that do NOT use the app pattern, EOS among them. The app-styled population is the ~25 `Dialog` consumers."
  - "EOS was NOT restyled. `remove()` awaits a boolean that gates a destructive removal; the app-styled path returns `void` and `ButtonOptions.action` is a closed enum with one literal, so no choice can return to the backend. Filed as D-35-11-01 — a decision, not a polish task."
  - "REQ-35-17 is therefore satisfied on the path-rejection dialog and NOT on EOS. Recorded explicitly so the requirement is not read as fully discharged."
  - "The path-rejection fix is CSS, not a string change and not a `type` downgrade. `height: 25em` -> `max-height: 25em` fixes the root cause for all 31 ERROR call sites; the plan's listed `gamelib.json` edit proved unnecessary."
  - "BRANCH A: the boot auto-resume was ported ENABLED. Both blockers measured CLOSED — and, more decisively, both are Steam-only while `isStartup=true` IS the Steam suppression, so they were structurally unreachable from this call whatever their status."
  - "The plan's SEAM id is wrong: this is Phase 32 D-05, not Phase 33 D-04. And the suppression was already coded, logged and test-enforced in `downloadQueueFlowRegistration.ts`, where the plan assumed nothing existed."
  - "`.unref()` is the one intentional divergence from `main.ts:613`, added after the ported timer held the sidecar's event loop open — a defect this plan introduced and fixed within it."

requirements-completed: [REQ-35-17]

# Metrics
duration: ~2h
completed: 2026-08-29
commits: [cf28d48f4, 1428dbecc, b534645c9]
---

# Plan 35-11 — two dialogs whose defect descriptions were crossed, and the one feature that would have died with `main.ts`

## What this plan did

Fixed the path-rejection dialog's sizing at its root, ported the boot-time download-queue
auto-resume to the sidecar before `main.ts` is deleted, and closed both SEAM convergence items with
dated notes. It did **not** restyle the EOS remove confirmation, for a structural reason recorded
below rather than skipped.

Two of this plan's premises did not survive contact with the code. Both are recorded here in place.

---

## The dialog premise was INVERTED, on both halves

The plan's `must_haves` says the EOS remove dialog and the path-rejection dialog "stop being
**native system dialogs sized wrong for their content**". Measured, that sentence is crossed:

| Dialog | Native or app-styled? | Sized wrong? |
|---|---|---|
| EOS remove (`eos_overlay.ts:161`) | **Native** — `dialog.showMessageBox` from `'electron'`; an `NSAlert`, confirmed on BOTH shells by 35-02 Item 6(a) | **No** — an `NSAlert` auto-sizes to its content |
| Path-rejection (`installFlowRegistration.ts:319`, `:442`) | **App-styled already** — `showDialogBoxModalAuto` -> `MessageBoxModal` | **Yes** — measured below |

So each dialog has exactly one of the two defects, and the plan attributed both to both.

### The sizing defect, measured from the rule rather than a screenshot

35-02's Item 6(b) confirmed the Tauri path-rejection dialog EXISTS but explicitly left its size
unscored, parking the question for this plan. It is now answered.

`type: 'ERROR'` routes `MessageBoxModal.getContent()` into
`<div className="errorDialog error-box">`, whose only height rule was:

```css
.errorDialog.error-box { ... height: 25em; overflow: auto; ... }
```

`height` is **unconditional and content-independent**. The only other rule matching that selector
(`themes.scss:452`) sets `background-color` alone, so nothing overrode it. Combined with
`.errorDialog { max-width: min(700px, 85vw); width: 100% }` on the Paper — which IS live, since
`Dialog.tsx` forwards `className` via `PaperProps` — every ERROR dialog rendered as a ~700x400px
scrollable console box regardless of message length. Both path-rejection bodies are plain
two-sentence prose containing no `\n`.

This is a **declarative** fixed height, not an emergent layout property, which is why it is
soundly established from source. The recorded trap it avoids is the opposite one — asserting a
class name in a mock render tree, which passes against a dead stylesheet.

**Fix:** `height: 25em` -> `max-height: 25em`. Long error dumps are unchanged (still capped at
25em, still scrolling on the existing `overflow: auto`); short messages size to their content. This
fixes the defect at its root for all **31** `type: 'ERROR'` call sites rather than only the two
named ones, and touches **no** string, **no** call site and **no** rejection condition.

The plan's listed `public/locales/en/gamelib.json` edit was therefore **not needed** — the source
todo's first suggested option was to shorten the body strings, which the root-cause fix makes
unnecessary. Nothing was added to `translation.json`.

### The census inversion

The plan says the dialogs should become "consistent with the ~14 other dialogs that already use the
app pattern". The ~14 in the source todo is the count of **native** `showMessageBox` /
`showMessageBoxSync` sites — the population that does NOT use the app pattern, of which EOS is one.
The app-styled population is the **~25** `Dialog` consumers. Recorded so it is not re-derived
wrongly.

---

## EOS was NOT restyled — a structural blocker (`D-35-11-01`)

`eos_overlay.ts`'s `remove(): Promise<boolean>` **awaits** the dialog and gates the destructive
`legendary eos-overlay remove` on `response === 1`. The boolean is load-bearing twice: in the
backend as the destructive gate, and in the renderer at `AdvancedSettings/index.tsx:210`
(`setEosOverlayInstalled(!result.value)`).

The app-styled path cannot carry it:

- `showDialogBoxModalAuto` (`dialog/dialog.ts:8`) returns **`void`**. It is one-way:
  `sendFrontendMessage('showDialog', ...)`.
- A button's `onClick` does not survive the structured-clone hop, and its serializable replacement
  `ButtonOptions.action` (`common/types.ts:48`) is a **closed enum with exactly one literal**,
  `'steamSignIn'`, resolved renderer-side in `DialogHandler`.

There is no mechanism to return a user's choice to the backend. Migration therefore requires either
a new request/response IPC channel, or moving a destructive-action gate into the renderer — which
changes the very return contract the plan's constraints and **T-35-45** exist to protect. That is a
decision, not a polish task, so it was not taken unilaterally. Full detail, including the house
pattern a future plan would use (`AllowInstallationBrokenAnticheat.tsx:19`), is in
`deferred-items.md` as `D-35-11-01`.

One thing here did improve independently: the "dead stylesheet" trap the source todo warns about is
**gone**. `Dialog.tsx:49`'s `StyledPaper` (quick task `260820-kq0` round 3) landed the todo's step
2, so the in-app primitive is genuinely styled. The todo's **step 1** — deciding the native-vs-in-app
policy across all ~14 native sites — has not, and the todo is explicit that fixing only the EOS site
"narrows the inconsistency without resolving it".

> **`REQ-35-17` is satisfied on the path-rejection dialog and NOT on EOS.** Stated plainly so the
> requirement is not read as fully discharged. `grep -c "showDialogBoxModalAuto"
> eos_overlay.ts` prints `0` — but it always did; that file's dialogs are
> `dialog.showMessageBox` (2 sites), and the plan's criterion was aimed at the wrong symbol.

---

## Boot-time auto-resume — the real feature gap (SEAM **Phase 32 D-05**, not "Phase 33 D-04")

`main.ts:613`'s 5-second `initQueue(true)` had no sidecar equivalent, and `main.ts` dies at plan
35-14. Either it was ported or the app would permanently stop resuming interrupted downloads at
startup.

### Both blockers measured CLOSED

| Blocker | Status | Document that established it |
|---|---|---|
| **G-30-02** (Steam install-hang) | **CLOSED** | `.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md` — `status: resolved`, fixed 2026-07-24, hardware-proven at the Phase 33 plan 33-05 D-13 live gate |
| **CrossOver-bottle startup-resume auto-launch** | **CLOSED** | `.planning/todos/completed/steam-startup-download-resume-autoopens-crossover.md` — fixed 2026-08-16 (quick task `260816-i8a`), which removed the startup auto-resume outright; verified still absent in the live tree at `steam/library.ts:818` |

G-30-02's status was treated with suspicion rather than trust, since it was declared fixed twice
(30-05, 30-07) while the live build hung. Both false declarations predate Phase 33; the third fix
was the one made hardware-proven, and that is why the debug ledger, not the SEAM prose, was read as
the authority.

### The contingency was MIS-FRAMED, and reading beat measuring

The plan frames the port as risky: auto-resuming into a known-broken resume path "surfaces the bug
more often". **The opposite is true.** `initQueue`'s doc comment and body
(`downloadqueue.ts:116`) show that `isStartup=true` **is itself the Steam suppression** — the loop
`break`s before `installQueueElement()` for any persisted `runner === 'steam'` head and surfaces it
as resumable instead. The flag *only ever changes behaviour for Steam*.

Both named blockers are **Steam-only**. They were therefore **structurally unreachable** from this
call whatever their open/closed status, and the port re-enables boot auto-resume for
**GOG/Epic/Amazon only** — exactly what `main.ts` did.

**Why this is stronger evidence than the live resume gate that was asked for.** A live
ACF-move-and-resume run (the recorded 71.5s technique) would have exercised the Steam resume path —
a path this ported code never executes. It could only ever have produced a true result about an
irrelevant path. A structural argument that the code *cannot reach* the hazard dominates a
measurement of the hazard, and it is enforced by a test rather than by a one-off observation. Both
blockers were independently confirmed CLOSED anyway, so Branch A holds on either reading.

Defence in depth for the runners this DOES auto-resume: `installQueueElement`'s stall watchdog
(`downloadmanager/utils.ts`) force-terminates a never-settling install — the generic guard that
actually fixed G-30-02.

### What the plan assumed did not exist, but did

The plan's Branch B says to "port the code DISABLED behind an explicit flag ... add a test asserting
the disabled path does NOT call `initQueue(true)`". That was **already built**:
`downloadQueueFlowRegistration.ts` carried a logged suppression, and two tests enforced it
(`downloadQueueFlows.test.ts:508`'s D-05 source gate; `appShellFlows.test.ts`'s exclusion
assertion). Branch A therefore required *removing* an enforced suppression, not adding one — and
the log line that announced it was rewritten in the same commit, because a log asserting a
suppression that no longer exists is worse than none.

---

## Deviations

### 1. [Rule 1 - Bug, self-inflicted] The ported timer held the sidecar's event loop open

- **Found during:** Task 2, immediately after the port.
- **Issue:** `appShellFlows.test.ts` began reporting *"Jest did not exit one second after the test
  run has completed"*. `main.ts`'s timer lived in a process Electron kept alive; the sidecar is
  plain `node`, so a ref'd 5s timer keeps the loop alive after all work is done.
- **Confirmed as mine, not inherited:** A/B'd against a `cp` snapshot of the pre-change file. The
  baseline run of the same four `frontendReady`-firing suites was clean; the message returned with
  the change and disappeared when `.unref()` was added. No `git stash`/`reset`/`restore` was used.
- **Fix:** `.unref()` on the timer — the one intentional divergence from `main.ts:613`. The
  sidecar's RPC stdin stream keeps the process alive in production, so the timer still fires; only
  its claim on the loop is released.
- **Commit:** `1428dbecc`.

### 2. [Scope] The fix landed in a file the plan did not list

`files_modified` names `gamelib.json` and expects backend edits. The defect was in
`MessageBoxModal/index.css`, which the plan could not have named because it predates knowing the
mechanism. Conversely `installFlowRegistration.ts`, `eos_overlay.ts` and `gamelib.json` are listed
but **unmodified** (0 diff lines each) — the root-cause fix made string and call-site edits
unnecessary, and EOS is deferred.

### 3. [Documentation] The plan's SEAM id and its "~14" census are both wrong

Recorded above and in `SEAM.md`. The auto-resume item is **Phase 32 D-05**; SEAM's own bullet says
so at the line range the plan cites.

### 4. Per the orchestrator's standing instruction, `STATE.md` and `ROADMAP.md` were not touched and no `gsd-sdk` `state.*` / `roadmap.*` / `phase.complete` verb was invoked.

---

## SEAM dispositions (both appended as bullets; **0** new `###` headings)

**Phase 32 D-05 (boot-time auto-resume) — CLOSED**, not re-homed, since Branch A fired. Records the
branch, both blockers' measured status with their source documents, the mis-framing correction, and
the `.unref()` divergence.

**Phase 31 D-02 (settings divergence) — CLOSED as moot by construction**, resting on a grep rather
than a research assertion, per **T-35-48**. The literal command and result, carried into the note:

```
$ grep -rn "settingsChanged" src/
(no output — zero matches, exit 1)
```

No `settingsChanged` channel, emitter, listener or constant exists anywhere under `src/`, so there
is **no dead cross-build reflect code to clean up**. A companion
`grep -rni "reflect.*electron\|electron.*reflect\|cross-build" src/backend/` also returned zero.

`grep -c "Phase 35" SEAM.md`: **11 -> 13**.

---

## Verification

`pnpm codecheck` exits 0.

| Project | Suites | Tests | Failures |
|---|---|---|---|
| Backend | 183 | **4295 passed** | 3 — the known `decompressPool.test.ts` LZMA trio |
| Frontend | 130 | **2101 passed** | 0 |
| Meta | 29 | **628 passed** | 1 — `genI18nGateScope.test.ts`, deferred `D-35-03-01` (4 stale files; the changed CSS is not among them) |
| Common + Preload | 9 | **181 passed** | 0 |

Suites were confirmed present by name in the output rather than trusted from `--selectProjects`,
which is case-sensitive and exits 0 matching nothing. The sub-config `displayName`s are capitalised
(`Backend`/`Frontend`/`Meta`/`Common`/`Preload`), so the plan's casing is correct.

**Observed flake, matching its own todo exactly.** The first Backend run also failed
`enrichmentFlows.test.ts` (2 suites / 4 tests). The second run reproduced only the LZMA trio (1
suite / 3 tests). `.planning/todos/pending/2026-08-25-getanticheatinfo-sidecar-frame-drops-intermittently-under-load.md`
records precisely this alternation — its "Run A: 2 failed, 4 failed tests" / "Run B: 1 failed, 3
failed" is the same pair of shapes. Not chased.

**New test, RED-proven.** `appShellFlows.test.ts` asserts `initQueue` is not called before 5s, then
exactly once with `true`. RED-proven by flipping the argument to `false`, which failed with
`Expected: true / Received: false`, then restored. `isStartup=true` is load-bearing rather than
cosmetic parity: a regression to `false` would silently start auto-driving Steam installs on every
boot.

`pnpm lint-translations` exits 0 with pre-existing `zh_Hant` empty-key noise. It has no bearing
here — no string was added, changed or removed, so there is no dangling `t()` call for its known
blind spot to miss.

---

## Task 3 — the blocking human-verify gate: PASSED

Operator-driven, 2026-08-29, dev build, macOS arm64.

The gate as written was **half-moot**, and was run accordingly: its steps 1-3 and the EOS half of
step 5 test a restyle that deliberately did not happen. They were skipped as inapplicable, not
failed.

1. **Path-rejection sizing — PASS.** The dialog hugs its two-sentence message.

2. **Long-error scrolling — VERIFIED BY CONSTRUCTION, with the confound named and closed. NOT a
   live observation, and must not be read as one.** The operator ruled the live trigger
   unnecessary, and the reasoning is recorded rather than an observation being claimed:
   - The rule changed from `height: 25em` + `overflow: auto` to `max-height: 25em` + the same
     `overflow`.
   - For content **taller** than 25em the two declarations are identical — capped at 25em, scrolls.
   - For content **shorter** than 25em the old rule forced 25em and the new one sizes down.
   - `max-height` cannot make a box **taller** than `height` did, so no regression is expressible in
     that direction.
   - **The one confound** a static read cannot cover is flex-stretch behaving differently between
     the two declarations. Step 1's live PASS **closes it**: the dialog visibly sized to its
     content, which cannot happen if the box were being stretched.

3. **Boot auto-resume — PASS.** GOG/Epic/Amazon resume confirmed, and the persisted Steam queue head
   did **not** auto-start — the `isStartup=true` guarantee observed live rather than only asserted.

### A new live defect found during step 3, filed separately

`.planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md` —
the game page's Pause/Cancel button opens the install modal mid-download for non-Steam games.
`MainButton.tsx:305`'s onClick guards on `!is_installed && !is.queued && runner !== 'steam'` but
not `!is.installing`, while the same component's `getButtonLabel()` **does** consult it, so the
label and the action disagree. Steam is the only runner that works. Shared frontend code, so it
survives 35-14. Filed by the coordinator; referenced here, not re-diagnosed.

---

## Threat register outcomes

| Threat | Outcome |
|---|---|
| **T-35-45** — restyle breaks the EOS confirm/cancel distinction | **Not exercised.** EOS was not restyled; `eos_overlay.ts` has 0 diff lines, so the return contract is untouched by construction |
| **T-35-46** — enabling auto-resume into an open `G-30-02` | **Mitigated twice over.** Both blockers measured CLOSED, and both are Steam-only while `isStartup=true` is the Steam suppression, so the hazard is structurally unreachable. Pinned by a RED-proven test |
| **T-35-47** — Phase 32 D-05 vanishing with `main.ts` | **Mitigated.** The capability was ported, not dropped; `SEAM.md` carries a dated closure naming the new carrier |
| **T-35-48** — closing Phase 31 D-02 on a research assertion | **Mitigated.** The note carries the literal grep and its result, and states the closure rests on it |
| **T-35-49** — a path echoed into a screenshot | **Accepted, unchanged.** Message content was not touched, only its presentation |
| **T-35-SC** — dependency installs | **Accepted.** This plan added no dependency |

## Self-Check

- `src/backend/main.ts` unmodified — **0** diff lines.
- `git diff --name-only | grep -c translation.json` — **0**.
- `git diff SEAM.md | grep -c '^+### '` — **0**.
- `grep -rc "initQueue" src/backend/sidecar/ | grep -v ':0'` — 5 files.
- `grep -c "Phase 35" SEAM.md` — **13** (>= 2 required).
- All three commits present on `fix/steam-native-install-stability`; working tree clean.

## Self-Check: PASSED
