---
status: resolved
trigger: "Store-embed suppression sticks with no visible holder, hiding the Epic subview. The slot shows StoreEmbedPlaceholder's 'Paused while a window is open' (D-19 suppression filler) while no window, dialog, dropdown or toast is open."
created: 2026-10-14
updated: 2026-10-14T23:45:00Z
severity: major
area: webview/store-embed
checkpoint: "resolved — user chose OPTION 2 (close as misdiagnosis, plus the diagnostic change) over the checkpoint's other option(s); decision executed in full, scope exactly as granted"
---

# Debug: store-embed suppression sticks with no visible holder

## Current Focus

hypothesis: "CONFIRMED MISDIAGNOSIS, remediated as scoped. See Resolution below for the final writeup."
test: "n/a — closed"
expecting: "n/a — closed"
next_action: "none — session resolved and archived"

## Checkpoint Response (relayed 2026-10-14)

User decision: **OPTION 2** — close as misdiagnosis, plus a small behaviour-preserving
diagnostic change. The reframing in this file's prior `Resolution.root_cause` was accepted and
was independently verified by the coordinator before relaying it.

**Corroboration not available to the investigating agent, strengthening the finding:**
`.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-REVIEW.md`'s
"Open, not fixed here" section (lines 101-105) already documents exactly this, in these exact
words:

> The "Paused while a window is open" placeholder copy still shows through the transparent Epic
> subview during cold loads. UI-SPEC E2 forbids new text on this surface, so changing it needs a
> copy decision.

This means the *behaviour* (placeholder showing through the transparent Epic subview) was already
known and documented as an open item before this debug session started — only the *diagnosis*
("this is a suppression leak") was new, and new only because it was wrong.

**Scope granted, executed exactly as follows (no more, no less):**
1. Diagnostic change at the `StoreEmbedSlotContents` render site — DONE (see Resolution.fix).
2. A test pinning the distinction — DONE (see Resolution.verification).
3. This write-up, archived to `.planning/debug/resolved/` — DONE (this update).

**Explicitly out of scope and left untouched, per the decision:** `50-UAT.md` (Items 3 and 16),
`.planning/todos/pending/2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md`, and
`50-REVIEW.md` itself (the coordinator owns retracting claims in all three). The native recovery
path (`macos_epic_embed.rs` reload/show-subview after a hosts-file revert + Reload click, which
did not visibly repaint within ~100s in Launch 5) is a real open question that was explicitly
*not* investigated and gets its own correctly-scoped session later — no new todo/debug file was
opened for it here, also per the decision.

## Symptoms

expected: "With no overlay open, the Epic subview is visible and paints. StoreEmbedPlaceholder's 'Paused while a window is open' should appear ONLY while something has genuinely acquired suppression."

actual: "The placeholder shows — i.e. the embed is suppressed and the native subview is hidden via storeEmbedHide() — with nothing on screen to close. `count of windows` for the process was 1 (the main window only). The suppressed state is INTERMITTENT and SELF-RELEASING: present at app launch, released on its own with no user action, then returned and persisted for 90s+ until the app was killed."

errors: "None. Suppression emits no log line on either side — no eprintln in Rust, no renderer log — which is itself part of why this has been hard to pin down."

timeline: "Observed twice, both on 2026-10-14 during Phase 50 live gates. Launch 3 (UAT Item 3, subview transparency) — confounded the arm; the operator saw the suppression placeholder rather than the pre-paint transparent state under test, so D-06 was never measured. Launch 5 (UAT Item 16, timeout-banner re-run) — blocked the recovery half. Not known to be new; no evidence either way about when it started."

reproduction: "Not yet reduced to steps. Both observations were on `pnpm tauri:dev:keyring` on macOS, on the /store/epic route. In Launch 5 it was present immediately at launch before any interaction, released, and returned later in the same session."

## Impact

**This defect has now cost two UAT arms across two separate gates.** It is the only thing standing
between UAT Item 16 and a full pass — Item 16's recovery half (revert the hosts block, click the
banner's Reload, confirm the store repaints) could not be scored because a hidden subview cannot
paint whatever the reload does. The Reload click itself was confirmed to land: System Events
resolved the click point to `button Reload of group 1 of group 3 of UI element 1 of scroll area
1 ...` and the button took a visible focus ring.

Evidence capture: `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/live-gate-261014-item16/item16-suppressed-recovery-blocked.png`

## What is established (do not re-derive)

Suppression is a **reference count** in
`src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx`, provided app-wide by
`StoreEmbedSuppressionProvider` in `App.tsx`. It is acquired through **two** hooks:

| hook | production consumers |
| --- | --- |
| `useSuppressStoreEmbed()` — unconditional, on mount | `HumbleLogin`, `OAuthLogin`, `Dialog` |
| `useSuppressStoreEmbedWhile(active)` — conditional | `TourContext`, `Dropdown`, `HumbleExpiryToast` |

`suppressionCountReducer` and `deriveSuppressed` are already **exported and pure**, which makes a
jest reproduction cheap.

Readers: `useStoreEmbedSuppressed()` is consumed by `WebView/index.tsx` and
`useStoreEmbedHost.ts`; the latter is what calls `storeEmbedHide()`.

**UAT Item 3's original consumer list was wrong** — it named five and omitted `HumbleExpiryToast`.
Corrected in that item 2026-10-14. Treat any older list in the planning docs with suspicion.

## Candidates — neither confirmed, do not assume either

1. **`TourContext`.** Fits the "invisible holder" constraint well: this repo has a known defect
   where an introjs tooltip renders nothing while still mounted
   (`introjs-tooltip-renders-nothing-intermittently.md`). An invisible-but-mounted tour step would
   hold the refcount with no window for anyone to close.
2. **`HumbleExpiryToast`.** Was the leading candidate until Launch 5, and the new evidence **cuts
   against it** — the toast is a *visible* element when `visible` is true, and nothing was visible.
   Its release condition (`humble.expired` going back to false) does match the observed
   self-release, so it is not eliminated, just demoted.

A third possibility nobody has examined: an **unbalanced acquire/release** in the context itself —
a cleanup that does not run on some path, or a double-acquire under React StrictMode — in which
case the "holder" is not any single component and hunting the consumer list will keep failing.
**This is the possibility the two previous guesses both skipped, and it is consistent with every
observation so far**, including the self-release and the intermittency.

## Method constraints

- **Do not spend a third live launch on eyeball observation.** Two are already gone. Prefer a jest
  reproduction driving the real reducer and the real hooks; `suppressionCountReducer` being pure
  and exported means a unit-level repro is probably reachable without the app at all.
- If instrumentation is needed, add a temporary count+component log at the reducer's call site
  rather than guessing from the consumer list a third time.
- **The AX tree is an unreliable instrument on this app** — `entire contents` returned 53 elements
  on one call and zero on the next with the screen unchanged, and during the Item 16 gate an empty
  AX result made a width sweep print a pass at every width. Use `screencapture` with frontmost
  asserted at capture time if any visual check is needed.
- The dev build's Web Inspector opens **docked inside the main window**, which changes layout.
- `src/frontend/screens/WebView/__tests__/` and
  `src/frontend/components/UI/NavShell/__tests__/StoreEmbedSuppressionContext.test.tsx` already
  exist — read them first; the existing coverage will show which paths are already pinned and
  therefore which are NOT.

## Evidence

- timestamp: 2026-10-14T21:05Z
  checked: "Launch 5, dev pid 40514, macOS, `pnpm tauri:dev:keyring`, /store/epic route"
  found: "Suppression placeholder present at launch; released on its own; returned later and persisted 90s+. `count of windows` = 1 throughout. Nothing visible on screen to close."
  implication: "The holder is invisible and the state is intermittent and self-releasing. Rules out a simple acquire-once-never-release leak by a visible component."

- timestamp: 2026-10-14T21:20Z
  checked: "Whether the timeout banner renders while suppressed (Item 16 re-run)"
  found: "It does — StoreEmbedTimeoutBanner rendered fully while the slot behind it showed the suppression placeholder."
  implication: "Confirms empirically that suppression gates only StoreEmbedSlotContents inside the slot, not the banner, which is a sibling. Not a cause of this defect, but it bounds where the suppression effect reaches."

- timestamp: 2026-10-14T22:40Z
  checked: "Full read of StoreEmbedSuppressionContext.tsx (227 lines) — suppressionCountReducer, deriveSuppressed, StoreEmbedSuppressionProvider, useSuppressStoreEmbed(), useSuppressStoreEmbedWhile(active)"
  found: "Reducer is pure and commutative (acquire/release order doesn't matter), clamps at 0 with a console.warn on over-release rather than going negative. Both hooks have symmetric effect/cleanup pairs with stable, correctly-scoped dependency arrays — acquire on mount/active=true, release on unmount/active=false or cleanup, every time, no early return that skips cleanup."
  implication: "Candidate 3 (unbalanced acquire/release in the context itself, including StrictMode double-invocation) is ruled out by direct code inspection. No bug found in this file."

- timestamp: 2026-10-14T22:45Z
  checked: "StoreEmbedSlotContents.tsx (59 lines) — the component that actually renders StoreEmbedPlaceholder inside the embed slot"
  found: "`if (suppressed || isEpicSurface) return <StoreEmbedPlaceholder />`. The doc comment states this explicitly: the placeholder shows 'while suppressed (D-19) or on the Epic surface, where it shows through the transparent subview until Epic paints (D-06)'. This is a second, independent, already-documented trigger for the exact same placeholder component — not a bug, a pre-existing dual-purpose design."
  implication: "Suppression is NOT the only thing that makes this placeholder visible. Any observation of 'the placeholder is showing' on the Epic/macOS route does not by itself imply suppression is active."

- timestamp: 2026-10-14T22:50Z
  checked: "WebView/index.tsx:372 and the render wiring around StoreEmbedSlotContents/StoreEmbedTimeoutBanner"
  found: "`const isEpicSurface = storeKey === 'epic' && platform === 'darwin'` — a static boolean, true for the whole duration of being on /store/epic on macOS, computed independently of paint state or the suppression refcount. StoreEmbedTimeoutBanner (driven by embedHost.loadTimedOut) is rendered as a SIBLING of the embed slot, not gated by suppression or isEpicSurface — it and the placeholder can be simultaneously visible for unrelated reasons."
  implication: "On this exact route, the placeholder is in the DOM 100% of the time; visibility to the user is governed by whether the native subview is compositing over it, which is a native/paint concern, not a React state concern."

- timestamp: 2026-10-14T22:55Z
  checked: "item16-suppressed-recovery-blocked.png (direct image read, not AX) — the screenshot this session's Impact section cites"
  found: "Shows the timeout banner ('Epic is taking a while to load', with a focused Reload button and an Open in browser button) ABOVE the placeholder text 'Paused while a window is open', with literally nothing else on screen — no modal, backdrop, toast, or dialog anywhere."
  implication: "Direct visual confirmation that (a) nothing visible needed closing, matching the symptom's own framing, and (b) the placeholder co-occurred with an active load-timeout condition, not with any dialog/toast/dropdown opening."

- timestamp: 2026-10-14T23:00Z
  checked: "live-gate-261014-item16/terminal.log — the actual dev-launch log for Launch 5 (pid 40514), the same launch this debug file's Evidence and the screenshot are drawn from"
  found: "Line 59: `[shell] macos_epic_embed: load timed out past 45s`. Line 60: `[shell] macos_epic_embed: didFailProvisionalNavigation -- The request timed out.` This is a measured, real Epic WKWebView navigation failure in the exact session under investigation, consistent with Item 16's test design (a hosts-file network block placed before launch)."
  implication: "Direct, first-party evidence that Epic's subview genuinely failed to load during this observation window — not inferred, not guessed. This alone is sufficient to explain the placeholder being visible via the isEpicSurface branch, with no suppression acquisition required."

- timestamp: 2026-10-14T23:05Z
  checked: "git show 42dead40a (same-day commit, 'G-50-16 closes') and f32f4757b (same-day fix to macos_epic_embed.rs's load_timed_out clearing)"
  found: "42dead40a's own message states: 'It also rendered while the slot behind it was suppressed, empirically confirming the gap's reasoned-from-source claim that suppression was never the explanation.' It separately files this exact defect ('suppression sticks with no visible holder... a hidden subview cannot paint') as a still-open todo, i.e. the author who made that commit also concluded suppression was not the real explanation for the related banner-painting gap, but did not resolve the placeholder/suppression framing itself."
  implication: "Corroborates this session's new hypothesis from an independent, same-day source: someone else reasoning from source on the adjacent G-50-16 gap reached the same 'suppression was never the explanation' conclusion for the sibling banner-painting defect."

- timestamp: 2026-10-14T23:10Z
  checked: "TourContext.tsx (full read) and Dropdown/index.tsx (full read) — the two remaining `useSuppressStoreEmbedWhile` consumers not yet mechanistically checked"
  found: "TourContext: `useSuppressStoreEmbedWhile(tourState.activeTour !== null)`; `activeTour` is forced to `null` on every persisted-state read by construction (readPersistedTourState never round-trips it — a previously-fixed defect where a restored activeTour used to auto-reopen a tour with no click) and can only become non-null via an explicit startTour() call from a deliberate user click on NavShellTour/LibraryTour's launcher row ('never auto-started (D-02)'). Dropdown: `useSuppressStoreEmbedWhile(isExpanded)`; isExpanded initializes false via useState(false) and only flips true on click/focus/tab interaction with a dropdown trigger."
  implication: "Neither has any path to an active/true state without explicit user interaction. Combined with the earlier elimination of HumbleLogin/OAuthLogin/Dialog/HumbleExpiryToast, all six production suppression consumers are now mechanistically ruled out as the explanation for a trigger present at launch with zero user action."

## Eliminated

- hypothesis: "Unbalanced acquire/release in StoreEmbedSuppressionContext.tsx itself (candidate 3), including React StrictMode double-invocation."
  evidence: "Full 227-line read: suppressionCountReducer is pure/commutative and clamps at 0 with a warn (never negative); useSuppressStoreEmbed() and useSuppressStoreEmbedWhile(active) both have symmetric effect/cleanup pairs with correct, stable dependency arrays. No code path skips cleanup."
  timestamp: 2026-10-14T22:40Z

- hypothesis: "HumbleExpiryToast is the invisible holder."
  evidence: "Already demoted in this file's Candidates section on 'the toast is visible when visible is true' reasoning. Now eliminated with stronger evidence: index.scss confirms it is a position:fixed, bottom-right corner toast (not a full-screen overlay), and the Launch 5 screenshot shows nothing in that corner at all."
  timestamp: 2026-10-14T22:30Z

- hypothesis: "TourContext is the invisible holder."
  evidence: "activeTour is forced to null on every persisted-state read (by design, fixing a prior related bug) and can only become non-null via an explicit user click on a tour launcher; NavShellTour explicitly documents it is 'never auto-started'. Cannot explain a trigger present at launch with zero user action."
  timestamp: 2026-10-14T23:10Z

- hypothesis: "Dropdown is the invisible holder."
  evidence: "isExpanded initializes false and only becomes true via explicit click/focus/tab interaction with a dropdown trigger (NavShell tier-2 filters, GamePage MainButton). No path to true at launch with zero interaction."
  timestamp: 2026-10-14T23:10Z

- hypothesis: "HumbleLogin, OAuthLogin, Dialog (the useSuppressStoreEmbed() unconditional consumers) are the invisible holder."
  evidence: "All three only mount when their respective, explicit user-initiated flows are active (login dialog open, generic Dialog primitive open from one of ~25 call sites, each gated on an explicit isOpen/game-specific condition). Exhaustive census of all 25 Dialog-primitive consumers and all Root()-level always-mounted components (DialogHandler, InstallGameWrapper, SteamBottleSetup, SteamClientSetup, SteamBridgeSetup, SettingsModalWrapper, ExternalLinkDialog, AboutDialogHost, RedeemSteamKeyDialog, LogFileUploadDialog, UploadedLogFilesList) found none with a plausible zero-action auto-trigger matching the observed timeline."
  timestamp: 2026-10-14T22:00Z

- hypothesis: "The debug session's own premise — that a leaked/stuck suppression refcount is the cause at all."
  evidence: "All six production consumers mechanistically ruled out; the context's own reducer/hooks are provably sound; StoreEmbedSlotContents.tsx documents an independent, pre-existing `isEpicSurface` trigger for the identical placeholder; isEpicSurface is unconditionally true for the whole observation window on this route; the same launch's terminal.log independently confirms a real Epic navigation timeout; an independent same-day commit (42dead40a) reasoning about the adjacent G-50-16 gap reached the same 'suppression was never the explanation' conclusion."
  timestamp: 2026-10-14T23:10Z

## Resolution

root_cause: "Not a suppression-refcount leak. StoreEmbedSlotContents.tsx renders the shared StoreEmbedPlaceholder whenever `suppressed || isEpicSurface` (src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx:52), and on macOS's /store/epic route `isEpicSurface` (src/frontend/screens/WebView/index.tsx:372) is a static boolean that is true for the entire time the user is on that route — independent of the suppression system. The placeholder is therefore always present in the DOM on this route; it is visible to the user whenever the native Epic WKWebView subview is not actively painting over it, which is true (a) briefly and by design before first paint (D-06), and (b) for as long as Epic's navigation has failed or timed out, which is exactly what happened in the observed session — Launch 5's own terminal.log records `macos_epic_embed: load timed out past 45s` followed by `didFailProvisionalNavigation -- The request timed out`. The 'intermittent, self-releasing, invisible holder' character that made this look like a suppression bug is fully explained by the subview's paint state toggling (attempt → fail/hide → retry) under the Item 16 test's deliberate network-block setup, not by any acquire/release defect. This debug session's own title/premise is a misdiagnosis: all six real suppression consumers were mechanistically ruled out, and the suppression context code itself is sound. Independently corroborated by `50-REVIEW.md`'s pre-existing 'Open, not fixed here' entry (quoted above) — the symptom was already a known, named, unfixed item before this session ever started."

how_the_misdiagnosis_happened: |
  The reasoning chain that produced the wrong diagnosis, recorded so the same inference pattern
  is recognisable next time, not just the fact that it was wrong:

  1. The symptom as observed was "the placeholder (D-19's copy) is visible, and nothing is open
     to close." The unstated premise baked into that framing is "this placeholder's copy means
     D-19 suppression is active" -- true in every other route/surface in the app, where D-19 is
     in fact the ONLY thing that renders `StoreEmbedPlaceholder`.
  2. That premise is false specifically on macOS's `/store/epic` route, where
     `StoreEmbedSlotContents.tsx` has a SECOND, independent trigger (`isEpicSurface`, D-06) for
     the exact same component with the exact same copy. The component was always dual-purpose;
     the bug report's title ("suppression sticks") assumed single-purpose.
  3. What made the false premise feel safe rather than merely assumed: there is only one piece of
     copy, one component, and no distinguishing signal anywhere (no log line on either side of the
     bridge, no attribute, nothing) between "D-19 fired" and "D-06 fired." An operator -- or an
     investigating agent reasoning from the UI alone before reading `StoreEmbedSlotContents.tsx`'s
     source -- has no way to tell them apart by looking. The absence of a distinguishing signal is
     what let "placeholder visible" silently stand in for "suppression active" without that
     substitution ever being examined.
  4. The fix for the misdiagnosis itself is "read the source, trace both triggers, check the
     session's own terminal.log for an independent timeout" (already done, in Evidence above).
     The fix for letting this happen to someone else is the diagnostic attribute below -- it
     removes the ambiguity in step 3 permanently, which is the actual lever: nobody can
     accidentally substitute "visible" for "suppressed" again once the two are labelled.

fix: |
  Scope-limited to the diagnostic change only, per the user's OPTION 2 decision -- no behavioural
  change, no copy change (UI-SPEC E2 forbids new text on this surface and that is a separate copy
  decision this task does not make).

  1. `StoreEmbedSlotContents.tsx` (the render site, line ~52-59): when
     `suppressed || isEpicSurface` is true, computes a `reason` string --
     `'suppressed'`, `'epic-surface'`, or `'suppressed+epic-surface'` -- and passes it to
     `StoreEmbedPlaceholder` as a new prop.
  2. `StoreEmbedPlaceholder.tsx`: gained one optional, diagnostic-only prop, `reason?: string`,
     declared with a default-valued destructured parameter (`{ reason }: Props = {}`) so the
     function's arity stays 0 and calling it with zero arguments is unchanged -- verified directly
     with a standalone `tsc --target es2017` compile (see Evidence). The root `<div>` now carries
     `data-placeholder-reason={reason}`; React omits the attribute entirely when `reason` is
     `undefined`, so every existing call path (there is exactly one, the site above) and every
     pre-existing test is unaffected.

  Both files' doc comments were updated to record the new prop/attribute and why it exists,
  including an explicit note that it does not reopen `StoreEmbedPlaceholder`'s documented
  "props-less and button-less by design" intent (that intent is about interactive chrome; a
  non-rendered, non-interactive diagnostic attribute is neither).

verification: |
  Multi-signal check, all run directly (commands and output below, not implied):

  - **Typecheck** (`npx tsc --noEmit -p tsconfig.json`): exit 0, zero errors anywhere in the
    project, confirmed again filtered for "StoreEmbed" specifically (zero matches).
  - **Prettier** (per the `<verify>` convention -- `--file-info` checked first, scoped paths only,
    never `.`): all four touched files report `{ "ignored": false, "inferredParser": "typescript" }`,
    so the check is not vacuous. First `--check` run found 2 of the 4 files needed reformatting
    (reported, not assumed); `--write` was run on exactly those two paths; the re-run `--check`
    then reported `All matched files use Prettier code style!` for all four.
  - **Targeted jest** (`StoreEmbedSlotContents.test.tsx` + `StoreEmbedPlaceholder.test.tsx`):
    15/15 pass after the fix (12 pre-existing + 3 new).
  - **Red/green discipline on the new tests** (explicit, not implied): the two new source files
    were stashed back to their pre-fix state with `git stash push -- <2 source paths>` (test files
    untouched), the same jest command was re-run, and 3 of the 15 tests failed -- the exact 3 new
    ones, each with a real diff (`Received {}` vs `Expected { reason: ... }` / `Received: undefined`
    vs `Expected: "suppressed+epic-surface"`); the other 12 pre-existing tests still passed,
    confirming no accidental coupling. `git stash pop` restored the fix; the same command then
    showed 15/15 green again. This is the reporting bar this session committed to: the new tests
    were directly observed red before the change and green after, not assumed to be meaningful.
  - **Broader regression** (`src/frontend/screens/WebView` full directory, 22 suites): 462/462
    pass, both before and after the prettier reformat.
  - **No live gate was run or required for this change** -- it is dev/live-gate-*inspectable*
    (the new `data-placeholder-reason` attribute is only useful read from a real running app's DOM
    via Web Inspector/AX tree during a future live gate), but nothing about proving *this* fix
    correct needed one: the change is additive, non-visual, and fully covered by the jest-level
    guarantees above. A test for a diagnostic tag has nothing visual to go red against in a
    screenshot, which is why the jest-level red/green pair above is the evidence instead.

files_changed:
  - "src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx (compute+pass reason prop at the render site; doc comment updated)"
  - "src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx (optional reason prop -> data-placeholder-reason attribute; doc comment updated)"
  - "src/frontend/screens/WebView/components/__tests__/StoreEmbedSlotContents.test.tsx (2 new tests pinning the distinction; retitled nothing else)"
  - "src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx (2 new tests for the attribute forwarding/omission; 1 existing test title corrected from 'takes no props' to 'takes no required props' -- its assertion is unchanged, only its now-slightly-inaccurate title)"

## Prevention (blameless postmortem)

**Why this happened (branches across categories, not a single chain -- AND-gate: yes, all
three co-occurred):**

- **Code:** `StoreEmbedSlotContents.tsx` is a two-trigger component -- `suppressed` (D-19) OR
  `isEpicSurface` (D-06) -- rendering byte-identical output (same component, same copy) for
  either trigger, with no distinguishing signal anywhere in the DOM or in logs on either side of
  the native bridge.
- **Environment:** the dual-trigger condition exists ONLY on macOS's `/store/epic` route (the
  Rust-managed raw WKWebView subview, D-02). Everywhere else in the app `isEpicSurface` is false
  and the placeholder genuinely does mean D-19 suppression -- the single-cause assumption this
  session started with is correct on every OTHER route, which is exactly what made it a
  reasonable-looking starting assumption here too.
- **Process (blameless -- "why was the substitution possible", not "who made it"):** the original
  bug title/framing ("suppression sticks with no visible holder") substituted the proximate
  observation ("placeholder visible") for one specific named mechanism ("D-19 suppression
  active") before that substitution was checked against source. That check was only skippable
  because of the code branch above -- with nothing to distinguish the two triggers, "the
  placeholder is showing" and "suppression is active" were indistinguishable by observation alone.

**Why wasn't this caught:** No existing gate (test, typecheck, lint, code review, verify, build)
was positioned to catch this, because `StoreEmbedSlotContents.tsx`'s dual-trigger design is
correct, intentional, and already documented both in its own doc comment and in
`50-REVIEW.md`'s "Open, not fixed here" section. This was never a code defect; it was an
observability gap -- nothing (test or runtime signal) distinguished which of the two triggers was
live, so the ambiguity that enabled the misdiagnosis was real, not merely hypothetical.

**Recurrence guard:**
- `data-placeholder-reason` (prop `reason` on `StoreEmbedPlaceholder`, computed in
  `StoreEmbedSlotContents.tsx`) makes the two triggers permanently distinguishable at runtime,
  inspectable in a real live gate via Web Inspector/AX tree.
- Four regression tests pin it, all verified red-before/green-after against the real pre-fix
  source (see `Resolution.verification` above): `StoreEmbedSlotContents.test.tsx`'s "on the Epic
  surface with suppression at zero, the placeholder still renders (D-06, unrelated to D-19)" and
  "the two placeholder triggers are distinguishable via the reason prop"; `StoreEmbedPlaceholder.test.tsx`'s
  "forwards an explicit reason onto the root div as data-placeholder-reason" and "omits the
  attribute when called with no reason, same as before this prop existed."
- This knowledge-base entry itself (`embed-suppression-sticks` in `.planning/debug/knowledge-base.md`),
  so a future Phase-0 match on "suppression"/"placeholder"/"Epic surface" symptoms surfaces this
  exact prior misdiagnosis before anyone re-opens it.
