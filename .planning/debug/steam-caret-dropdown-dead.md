---
slug: steam-caret-dropdown-dead
status: investigating
trigger: "The Steam install-options caret dropdown is ~90% dead to the mouse — Dropdown.toggle() fires a synthetic Tab before its own expand lands, and the container's onBlur slams it shut"
created: 2026-09-24
updated: 2026-09-24
source: .planning/todos/pending/2026-09-23-steam-install-caret-dropdown-closes-itself-via-synthetic-tab.md
severity: major — one of three doors to Steam install options responds ~10% of the time, and it blocks scoring 38-C08
---

# Debug: the Steam install-options caret opens roughly 1 click in 10

## Symptoms

**Expected behavior.** Clicking the `SteamInstallCaret` chevron beside the primary Install half
of the split button expands the `Dropdown` panel, showing the single "Install with options…"
button, which opens the Steam install-options dialog.

**Actual behavior.** The panel expands roughly **once in ten clicks**. Operator, verbatim:
*"dropdown seems 'mostly dead' I did see the dropdown once, but 10+ further clicks and could not
reproduce."*

**Error messages.** None reported. No console error, no dialog.

**Timeline.** Observed during a live Phase 38 sitting on the operator's **Windows 11** machine,
2026-09-23 — the deferred controller/environment UAT gates. The caret shipped in 34.13. It has
never been scored working on any platform; `38-C08` (is the caret CONTROLLER-reachable?) could
not be answered in that sitting precisely because the mouse could not reliably open it.

**Reproduction.** Windows 11 build, GamePage for an owned, not-installed, not-delisted Steam
title, click the chevron half of the split button. The operator's environment was a
**controller-connected** sitting (Phase 38 is the controller UAT phase) — this has not been
confirmed but is likely and is material to hypothesis 3 below.

**Cleanly isolated by the reporter.** The same dialog opens reliably through the `GameCard`
context-menu door (D-27 row 3) and renders its section-gating correctly once reached — `38-S06`
passed through that door in the same sitting. So the dialog, the gating and
`openSteamInstallOptions` are all fine. The fault is in the caret's `Dropdown` alone.

## Critical context — DO NOT REPEAT THIS WORK

### REFUTED — the todo's own headline hypothesis (`hasZeroArea` drops the collapsed children)

The filed todo's mechanism was, in its own words, "a hypothesis with a strong evidence chain, not
a measured cause". **It was measured on 2026-09-24 and it is false.** The chain it proposed:

1. `Dropdown.toggle()` dispatches `gamepadAction({ action: 'tab' })` before `setIsExpanded(true)`
   commits, so at dispatch time the panel is still `collapsed`;
2. `getFocusableElements()` drops any element failing `hasZeroArea(getBoundingClientRect())`, and
   *"a collapsed dropdown's children have zero area, so the Tab skips them entirely"*;
3. focus therefore lands outside `.dropdownContainer`;
4. the container's `onBlur` sees `relatedTarget` outside itself and calls `setIsExpanded(false)`.

**Step 2 is false**, which breaks the chain at the second link.

**Measurement.** `src/frontend/components/UI/Dropdown/index.scss` was reproduced verbatim
(`.dropdownContainer`, `.dropdown`, `.dropdown.expanded`) alongside `tauriGamepadInput.ts`'s
`FOCUSABLE_SELECTOR`, `hasZeroArea`, `getFocusableElements` and `doTab` copied verbatim, and run
in **real Chromium** — `~/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-gpu --no-sandbox --virtual-time-budget=6000 --dump-dom file://…`.
Chromium is the right engine: the symptom is on Windows 11, whose webview is WebView2, i.e.
Chromium. (`@playwright/test` is an EMPTY directory in `node_modules` — only the downloaded
browser binaries under `~/Library/Caches/ms-playwright` are usable. Drive them with `--dump-dom`
plus `--virtual-time-budget`, and avoid `requestAnimationFrame` in the probe: rAF never fires in
the headless shell with no compositor, which silently hangs the page before it writes its result.)

Result:

```
collapsed  panel=800.0x16.0  opt=176.3x31.6  focusables=main,caret,opt,after
t0 (same task, forced layout, transition just started)
           panel=800.0x16.0  opt=176.3x31.6  focusables=main,caret,opt,after
transition:none (settled geometry)
           panel=800.0x47.6  opt=176.3x31.6  focusables=main,caret,opt,after
```

The collapsed panel's child button measures **176.3 × 31.6** and **is present in
`getFocusableElements()`**. `max-height: 0; overflow: hidden` clips the *parent's* paint; it does
not zero the *child's* border box, because a flex item's `min-height: auto` holds it at content
size and `getBoundingClientRect()` is not affected by an ancestor's overflow clipping.

Replaying the interaction end-to-end, with the caret focused first (which is what a real mouse
click on a `<button>` does under Chromium/WebView2), the **current source ordering settles
expanded**:

```
## REPLAY mode=current caretFocusedByClick=true
   click (isExpanded=false) | focusout relatedTarget=opt | tab->opt | commit(true)
   settled: panelClass="dropdown expanded" active=opt
```

`focusout` does fire, but `relatedTarget` is `opt`, which **is** inside `.dropdownContainer`, so
`container.contains(relatedTarget)` is true and the collapse branch is never taken. The same
holds with the caret unfocused (`tab->main`, no focusout at all, settles expanded).

**Consequences.**

- The todo's prescribed fix direction — "move the synthetic Tab to AFTER the expand has
  committed" — is a **no-op** against this defect. It was also measured (`mode=effect-tab`) and
  settles identically to the current code. Do not ship it as the fix and call this closed.
- `GamePage/index.css:345-374` was checked for a `.SteamInstallCaret`-scoped rule that could zero
  the panel children. There is none; it only sets a 44px min box on the `.dropdownButton` itself.
- The **symptom remains real and unexplained**. The operator measured it; this refutes the
  proposed cause, not the report.

## Hypotheses to instrument (none tested)

Ordered by prior. All require evidence before any edit.

1. **The `Dropdown` subtree is unmounted/remounted, resetting `isExpanded`.** `MainButton.tsx:369`
   renders the `Dropdown` behind `showSteamMainButtonInstallOptions({ runner, isInstalled,
   isQueued, isDelisted, installDisabled: disabledInstallButtons })`. A flicker in that gate — or
   a remount of an ancestor during a library/download refresh — discards the `useState` and reads
   exactly as "mostly dead, opened once in 10+". This shape has bitten this repo before
   (`refresh()` rebuilding from disk and wiping flagless state). Instrument mount/unmount of
   `Dropdown` and every input to that predicate.
2. **`useSuppressStoreEmbedWhile(isExpanded)`** (`Dropdown/index.tsx:28`, Phase 40 Plan 06,
   D-18/D-20) acquires store-embed suppression *on expand*. If acquiring it disturbs focus or the
   React tree — it drives a native webview overlay — the expand could tear itself down. This was
   added after the caret shipped in 34.13, so it is in scope for a defect first seen 2026-09-23.
3. **`gamepad.ts`'s `closeDropdown()`** (`src/frontend/helpers/gamepad.ts:223`, `:491-499`) firing
   from the controller polling loop. The sitting was Phase 38 controller UAT, so a pad was
   plausibly connected and polled every frame. `closeDropdown()` walks
   `el.closest('.dropdownContainer')` and clicks the `.dropdownButton` — i.e. it can toggle the
   caret shut. Confirm whether a pad was connected before spending much here.

## Platform triage

The todo carries `platform: any`. That is an assumption, not a measurement — the symptom has only
ever been seen on Windows 11/WebView2 and the desk reproduction above did **not** reproduce it in
Chromium. If the cause turns out to need the operator's Windows machine to confirm, say so
explicitly and re-triage the todo's `platform:`/`ready:` keys rather than guessing; do not leave
`ready: code` standing on a defect that cannot be closed at the desk.

## Current Focus

```yaml
hypothesis: "checkNintendo() binds 'back' to buttons[0] unconditionally; on a non-standard-mapping Nintendo pad (raw HID order Y,B,A,X) buttons[0] is the physical Y cap, so pressing Y fires 'back' -> closeDropdown() while focus sits inside .dropdownContainer immediately after a mouse click opens it"
test: "NEGATIVE CONTROL first, on the Windows machine: UNPLUG the pad, then click the caret 10x. 10/10 open = hypothesis 3 confirmed as the family; still ~1/10 = eliminated outright, no recollection needed. Only if the pad cannot be unplugged, fall back to: was a gamepad connected during the Phase 38 sitting, and does gamelib.log carry a [GAMEPAD] line with its mapping?"
expecting: "If a pad was connected AND its logged mapping is non-standard (empty string, not 'standard'), this confirms the mechanism as root cause. If no pad was connected in that sitting, this hypothesis is eliminated and hypothesis 1 (weak, unresolved) is the only remaining open lead."
next_action: "CHECKPOINT — awaiting operator confirmation of controller presence/mapping for that sitting; do not apply 260923-qe5's fix here duplicatively, and do not fabricate a live-verified outcome"
```

## Evidence

- timestamp: 2026-09-24
  what: "Real-Chromium reproduction of Dropdown/index.scss + tauriGamepadInput.ts's focus collector"
  found: "A COLLAPSED panel's child button measures 176.3x31.6 and IS in getFocusableElements(); the current toggle() ordering settles `dropdown expanded` with activeElement=opt. The todo's hasZeroArea chain does not arm."
  means: "The filed hypothesis is refuted and its prescribed remedy is a no-op. Cause unknown."

- timestamp: 2026-09-24
  what: "Hypothesis 2 (useSuppressStoreEmbedWhile disturbs focus on expand) — read StoreEmbedSuppressionContext.tsx (227 lines), useStoreEmbedHost.ts (421 lines), GamePage/index.tsx (740 lines) in full"
  found: "The only consumer that reads `suppressed` and acts on it (calling storeEmbedHide()/storeEmbedShow()) is useStoreEmbedHost.ts, invoked exclusively from screens/WebView/index.tsx — a different router route, never mounted while GamePage is. GamePage is `React.memo(function GamePage(){...})` with no props and does not itself consume StoreEmbedSuppressionContext, so a Provider re-render triggered by the Dropdown's own acquire/release dispatch does not propagate into GamePage/MainButton/Dropdown (children reference stays stable; React.memo bails on unchanged props)."
  means: "No plausible focus-disturbance mechanism exists for hypothesis 2 while on GamePage. Treated as refuted; moved to Eliminated below."

- timestamp: 2026-09-24
  what: "Hypothesis 1 (Dropdown subtree unmount via showSteamMainButtonInstallOptions gate flicker) — read MainButton.tsx (420 lines) and helpers/steamInstallOptionsEntry.ts (117 lines) in full"
  found: "showSteamMainButtonInstallOptions({runner,isInstalled,isQueued,isDelisted,installDisabled}) = runner==='steam' && !isInstalled && !isQueued && !isDelisted && !installDisabled. For the repro's stated game state (owned Steam title, not installed, not queued, not delisted, install not disabled) every input should be stable across a caret click; no concrete near-always flicker trigger was found in disabledInstallButtons's constituent flags (playing/updating/repairing/moving/uninstalling/notSupportedGame/notInstallable/importing/steam-installing/settingUpBottle) that would be tripped merely by clicking the caret."
  means: "Weakened but not conclusively eliminated — no confirming or disconfirming evidence found; left open at low prior, no further desk-testable angle identified."

- timestamp: 2026-09-24
  what: "Hypothesis 3 — read gamepad.ts's checkAction/closeDropdown/insideDropdown (edge-triggered 'back', repeatDelay:false), then read the concurrently-filed quick-task 260923-qe5-PLAN.md in full and confirmed live tree state via grep: HID_DUMP is still `true` and checkNintendo (nintendo.ts:80-105) still hard-binds back=buttons[0] with NO mapping parameter (the qe5 fix's Task 3 has not landed)"
  found: "260923-qe5's own live measurement (2026-09-23, SAME DAY as this bug's sighting) on the operator's PowerA Advantage Wired Controller for Nintendo Switch 2 found Chromium reports mapping '' (non-standard) for that device and passes raw HID through untouched; raw HID face order is Y,B,A,X, so buttons[0] (bound to 'back' in the still-unpatched checkNintendo) is the physical Y cap, not B. gamepad.ts's 'back' case calls closeDropdown() whenever insideDropdown() is true, and the already-established Chromium replay (see first Evidence entry) shows activeElement sits inside .dropdownContainer immediately after a mouse click opens the caret. Combining these: a genuine press of physical Y on a connected non-standard-mapping Nintendo pad, in the same window right after a mouse-opened caret, would slam the dropdown shut via closeDropdown() -- a real, code-confirmed, currently-live mechanism, not a deduction."
  means: "Mechanism is confirmed reachable and coherent with the symptom's exact shape (opens then immediately closes). The one fact this needs to become a confirmed root cause -- whether a gamepad was actually connected during the observed Phase 38 sitting -- is not derivable from source; the debug session's own text already flags this as 'likely but not confirmed.' Cannot close further at the desk without fabricating that fact."

- timestamp: 2026-09-24
  what: "Orchestrator cross-check of hypothesis 3's FREQUENCY against gamepad.ts:140-166 (the checkAction edge/repeat logic)"
  found: "`back` carries `repeatDelay: false` (gamepad.ts:75). A HELD button therefore fires EXACTLY ONCE: `triggeredAt` is only reset to 0 on a `!pressed` frame (:140-145), and with `repeatDelay` falsy `shouldRepeat` can never become true (:151), so the `!wasActive || shouldRepeat` gate (:166) admits only the rising edge."
  means: "Hypothesis 3 as WRITTEN — 'the operator pressed the physical Y cap' — does not explain a ~9-in-10 failure rate, and neither does a permanently stuck buttons[0] (that fires once, then never again). The variant that DOES fit the observed rate is an OSCILLATING buttons[0]: an analog/hat input whose resting value flickers across the pressed threshold resets triggeredAt on every !pressed frame and re-fires on every rising edge, dispatching `back` many times per second. That would call closeDropdown() within ~16ms of any mouse-opened caret, nearly every time, with the occasional success being a click that landed in a gap — which is exactly the reported shape. This refinement does not change the suspected FIX (still 260923-qe5's mapping-aware face-index table), but it does change the decisive TEST: unplugging the pad is a cleaner and cheaper discriminator than asking what was pressed, and 260923-qe5's own per-frame button dump would show the oscillation directly."

## Eliminated

- hypothesis: "Dropdown.toggle()'s synthetic Tab lands outside .dropdownContainer because the collapsed panel's children fail hasZeroArea, and the container's onBlur then collapses it"
  refuted_by: "Direct measurement in Chromium (the WebView2 engine): collapsed child rect is 176.3x31.6, non-zero on both axes, and is collected by getFocusableElements(). The Tab lands on the panel's own button, inside the container, so the onBlur collapse branch never runs."
  date: 2026-09-24

- hypothesis: "useSuppressStoreEmbedWhile(isExpanded) disturbs focus or the React tree when the caret's Dropdown expands"
  refuted_by: "The only reader of `suppressed` that acts on it (useStoreEmbedHost.ts) is scoped to the WebView route, never mounted alongside GamePage. GamePage is React.memo-wrapped, takes no props, and does not consume StoreEmbedSuppressionContext itself, so the Provider's own re-render (from the Dropdown's acquire/release) does not propagate into the Dropdown's subtree via React's stable-children-prop optimization. No consumer with DOM/focus-affecting behavior is reachable from this trigger while on GamePage."
  date: 2026-09-24

## Resolution

```yaml
root_cause: "UNCONFIRMED CANDIDATE, not yet closed. checkNintendo() (nintendo.ts:80-105) hard-binds the 'back' action to buttons[0]. On a non-standard-mapping Nintendo pad (Chromium mapping '', raw HID face order Y,B,A,X -- measured live on the operator's own PowerA Advantage Wired Controller for Nintendo Switch 2 by the concurrent quick-task 260923-qe5, same day as this bug's sighting), buttons[0] is the physical Y cap, not B. Pressing Y therefore dispatches 'back', and gamepad.ts's back handler calls closeDropdown() whenever focus is inside .dropdownContainer -- which it is, immediately after a mouse click opens the caret (already measured in the Chromium replay above). This is a real, code-confirmed, currently-unpatched mechanism (HID_DUMP still true, checkNintendo still has no mapping parameter as of 2026-09-24) whose shape matches the symptom exactly (opens, then immediately closes). It is NOT yet confirmed as root cause because the one missing fact -- whether a gamepad was actually connected during the Phase 38 sitting where this was observed -- is not derivable from source and was already flagged in this file as 'likely but not confirmed.'"
fix: "NOT APPLIED. If confirmed, the fix is 260923-qe5's already-staged Task 3 (a shared, mapping-aware face-index table consumed by checkNintendo), not a new edit in this session -- applying a duplicate/overlapping fix here without being able to verify it against the real symptom (no Windows machine, no physical controller) would violate this repo's standing rule against a green check that proves nothing."
verification: "NOT PERFORMED — blocked on operator confirmation of controller presence/mapping for that sitting."
files_changed: []
```
