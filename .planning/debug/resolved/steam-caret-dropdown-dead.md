---
slug: steam-caret-dropdown-dead
status: resolved
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

## Windows instrumentation

**The runnable copy lives in the todo, not here** —
`.planning/todos/pending/2026-09-23-steam-install-caret-dropdown-closes-itself-via-synthetic-tab.md`,
in its "DO THIS NEXT" block at the top of the file: the paste-in DevTools snippet, the dev-build
requirement (`src-tauri/Cargo.toml` requests no `devtools` feature, so a packaged build has no
console), and the table mapping each possible `[CARET]` log shape to its verdict.

It is deliberately NOT duplicated into this file. The todo is what gets opened on the Windows
machine; a second copy here would drift from it silently, and a stale diagnostic recipe is worse
than none because it still looks authoritative.

## Current Focus

```yaml
hypothesis: "CONFIRMED LIVE on Windows/WebView2 (see the 2026-09-24 CDP Evidence entry): a React batching self-cancellation, NONE of the three survivors. toggle() dispatches the synthetic Tab, which synchronously focuses the panel's child button; the panel's `onFocus={() => setIsExpanded(true)}` enqueues `true`; toggle() then enqueues `prev => !prev`. Both batch into the one click event: false -> true -> !true = false. The panel never expands and no aria-expanded mutation is ever committed."
test: "DONE at the desk: fix applied in toggle(), and the regression test went RED then GREEN (see the two TDD Evidence entries). Remaining: live re-verification via Vite HMR in the still-running Windows dev build with the scratchpad CDP driver."
expecting: "Live: one CDP click on the caret gives MUT aria-expanded -> true, the panel stays 'dropdown expanded', and a second caret click collapses it."
next_action: "Orchestrator: click the caret over CDP on port 9222 (GamePage for 752590) and confirm aria-expanded -> true and that it stays expanded, then click again and confirm it collapses. If both hold, commit the two files and archive this session."
reasoning_checkpoint:
  hypothesis: "The panel's onFocus(true), fired synchronously by toggle()'s synthetic Tab, and toggle()'s `prev => !prev` batch into one click and settle false."
  confirming_evidence:
    - "Live CDP: click reaches the handler, focus stays inside the container, and no aria-expanded mutation is ever committed."
    - "Live control: suppressing only the panel focusin from React makes the identical click open."
    - "Jest RED: stubbing gamepadAction to fire the panel's onFocus reproduces aria-expanded=false against the old code."
  falsification_test: "If live CDP after the fix still shows no aria-expanded mutation on click, the hypothesis is wrong or incomplete."
  fix_rationale: "Using a render-time value makes toggle's update idempotent with onFocus(true) rather than inverting it, which removes the cancellation itself, not a symptom."
  blind_spots: "Live WebView2 re-verification not yet run post-fix. The harness models React's queue order, not React itself."
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

- timestamp: 2026-09-24
  what: "OPERATOR ran the negative control, on both machines, and reported the result unprompted"
  found: "Verbatim: 'on macos caret open everytime, on windows machine carot does not work... does not matter if controller plugged in or not'."
  means: "THREE things at once. (1) Hypothesis 3 is ELIMINATED — controller presence makes no difference, so no gamepad path can be the cause, and 260923-qe5 does NOT close this defect as a side effect. (2) The rate is worse than filed: on Windows it is not ~1-in-10, it is DEAD; on macOS it is 10/10. The original 'opened once in 10+' remains the only sighting of it ever working on Windows. (3) The split is a PLATFORM split, WKWebView vs WebView2, which retro-confirms the `platform: windows` re-triage — that key was set before this evidence existed and is now measured, not assumed."

- timestamp: 2026-09-24
  what: "Second Chromium probe, repairing the first one's known infidelity: `.dropdownContainer` rebuilt as a real flex item inside `.installButtons` (display:flex, flex-wrap:wrap, gap) with `.mainBtn{min-width:200px}` and `.SteamInstallCaret .dropdownButton{min-inline-size:44px;min-block-size:44px}`, i.e. the narrow-container geometry the first probe replaced with an 800px block"
  found: "collapsed container=208.3x68.0 panel=208.3x24.0 opt=176.3x31.6 | focusables=nav1,main,caret,opt,after. The container is NOT 44px wide as predicted: `.dropdown{width:100%}` still participates in the flex item's max-content sizing, so the panel sizes the container. `opt` is again non-zero and again collected. Replaying with the caret focused (the WebView2 condition) STILL settles `dropdown expanded` with active=opt; replaying unfocused (the WKWebView condition) settles expanded with active=nav1, focus never having been inside the container so no focusout fires from it at all."
  means: "The macOS arm of the operator's result is now EXPLAINED and predicted: on WKWebView a mouse click does not focus a <button>, so doTab starts from activeElement=null, takes the currentIndex===-1 branch, focuses list[0] somewhere up the document, and the container never blurs — the panel stays open, every time. The WINDOWS arm is NOT explained: this engine, with this CSS and this DOM, opens in the Windows focus condition too. So the cause is something WebView2 does that a faithful Chromium reproduction of the CSS/DOM does not — hit-testing, focus order, or the click never reaching the handler. Say plainly what this instrument can and cannot see: it settles layout and focus-order questions about the reproduced markup, and it CANNOT settle a WebView2-specific behaviour. Further desk probing of this shape has hit its limit."

- timestamp: 2026-09-24
  what: "LIVE Windows/WebView2 measurement over CDP, on the operator's Windows 11 machine. `pnpm tauri:dev` launched with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222, the real profile (owned library of 381 Steam titles), GamePage of A Plague Tale: Innocence (752590: owned, not installed; caret present). The todo's instrumentation was injected, extended with document-level pointer/mouse/click/keydown capture and a wrapper around window.api.gamepadAction, and the caret was clicked with CDP Input.dispatchMouseEvent at its centre. That is the browser's real input pipeline, so hit-testing and click-focus are native."
  found: "Pre-click: caret=82.0x44.0, collapsed panel=194.4x24.0, opt=162.4x26.6, elementFromPoint(caret centre) = the chevron svg inside the button. Sequence: pointerdown/mousedown on svg -> focusin to the caret button (WebView2 DOES focus a button on click) -> click -> 'CLICK reached the caret handler' -> gamepadAction({action:'tab'}) -> keydown Tab not prevented -> focusout rel=<panel's 'Install with options…' button> inside=TRUE -> focusin on that button -> gamepadAction returns. NO MutationObserver record at all: aria-expanded never changes. Final: aria-expanded=false, 'dropdown collapsed'."
  means: "Survivor (a) is refuted (the click reaches the handler), (b) is refuted (the expand is never committed, so there is nothing to paint) and (c) is refuted (focus stays INSIDE the container, so onBlur never collapses anything). The expand is cancelled before commit. The only thing between the click and the commit is two state updates in one batch: the panel's onFocus(true), which fires synchronously inside toggle() because the Tab focuses a panel child, and then toggle's `prev => !prev`."

- timestamp: 2026-09-24
  what: "Discriminating control, same session and page: a window capture-phase focusin listener that calls stopImmediatePropagation() for targets inside `.SteamInstallCaret .dropdown`, which hides the panel focus from React's root listener. Focus was blurred, then the identical CDP click was repeated."
  found: "CLICK -> gamepadAction tab -> focusout inside=true -> 'BLOCKED focusin from React' -> MUT aria-expanded -> true, class -> 'dropdown expanded', panelBox 204.4x24.0. Final aria-expanded=true."
  means: "ROOT CAUSE CONFIRMED. Removing only the panel's onFocus(true) from the batch turns the dead caret into a working one. The macOS arm is explained by the same mechanism: WKWebView does not focus the button on click, so doTab focuses list[0] outside the panel, onFocus never fires, and toggle's updater alone yields true. The earlier Chromium desk replays could not see this because they reproduced the CSS and focus collector but not React's batched onFocus handler. The shared primitive is affected too: any Dropdown whose first Tab target is inside its panel cancels its own open on WebView2."

- timestamp: 2026-09-24
  what: "TDD RED — two new tests in src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx, describe 'Dropdown opens when the synthetic Tab focuses its own panel (steam-caret-dropdown-dead)'. gamepadAction is stubbed to synchronously call the panel's onFocus (the WebView2 doTab condition, caret focused by the click). The harness's useState applies updates in call order, which yields the same final value as React draining the batched queue. Run against the UNFIXED toggle() (`setIsExpanded((prev) => !prev)`)."
  found: "Both FAIL. (1) 'a click expands the panel even when the Tab focuses a panel child mid-click': `expect(button(tree).props['aria-expanded']).toBe(true)` -> Expected: true, Received: false (line 275). (2) 'a second click collapses it, and the collapse path does not call gamepadAction': `expect(gamepadAction).not.toHaveBeenCalled()` -> Expected 0 calls, Received 1: {\"action\": \"tab\"} (line 288). The first click never opened the panel, so the 'collapse' click was really another expand."
  means: "The desk test reproduces the live CDP result exactly: onFocus(true) then prev => !prev settles false. RED confirmed before any source edit."

- timestamp: 2026-09-24
  what: "TDD GREEN — toggle() changed to `const next = !isExpanded; if (next) window.api.gamepadAction({ action: 'tab' }); setIsExpanded(next)`, with the in-code comment explaining why the functional updater must not come back. Re-ran the Dropdown suite, codecheck, and prettier over the two written files."
  found: "dropdownDisclosure.test.tsx: 26/26 pass (both new tests included, all 24 pre-existing disclosure/suppression/geometry tests unchanged). `pnpm codecheck` (tsc --noEmit x2): no errors. `npx prettier --check` on the two paths: clean. The full Frontend run also shows labelSuiteI18nCensus.test.ts failing 2/17. That is PRE-EXISTING and unrelated: it fails identically with both Dropdown files stashed back to HEAD."
  means: "The fix is green at the desk. Live CDP re-verification on the Windows dev build is still outstanding."

## Eliminated

- hypothesis: "Dropdown.toggle()'s synthetic Tab lands outside .dropdownContainer because the collapsed panel's children fail hasZeroArea, and the container's onBlur then collapses it"
  refuted_by: "Direct measurement in Chromium (the WebView2 engine): collapsed child rect is 176.3x31.6, non-zero on both axes, and is collected by getFocusableElements(). The Tab lands on the panel's own button, inside the container, so the onBlur collapse branch never runs."
  date: 2026-09-24

- hypothesis: "checkNintendo() binds 'back' to buttons[0]; on a non-standard-mapping pad that is the physical Y cap, so a gamepad press dispatches 'back' -> closeDropdown() and slams the caret shut"
  refuted_by: "OPERATOR-RUN NEGATIVE CONTROL, 2026-09-24, both machines: 'does not matter if controller plugged in or not'. With no pad attached the Windows caret is still dead and the macOS caret still opens every time. No gamepad code path can produce a symptom that is invariant to the gamepad's presence. Note this also means 260923-qe5's Task 3 does NOT close this defect — the two are unrelated, and the cross-check the session was going to run before closing is answered: no overlap."
  date: 2026-09-24

- hypothesis: "useSuppressStoreEmbedWhile(isExpanded) disturbs focus or the React tree when the caret's Dropdown expands"
  refuted_by: "The only reader of `suppressed` that acts on it (useStoreEmbedHost.ts) is scoped to the WebView route, never mounted alongside GamePage. GamePage is React.memo-wrapped, takes no props, and does not consume StoreEmbedSuppressionContext itself, so the Provider's own re-render (from the Dropdown's acquire/release) does not propagate into the Dropdown's subtree via React's stable-children-prop optimization. No consumer with DOM/focus-affecting behavior is reachable from this trigger while on GamePage."
  date: 2026-09-24

## Resolution

```yaml
root_cause: "React batching self-cancellation in Dropdown.toggle() (src/frontend/components/UI/Dropdown/index.tsx). On WebView2 a mouse click focuses the trigger <button>. toggle() then dispatches the synthetic Tab (window.api.gamepadAction({action:'tab'})), which synchronously focuses the panel's first child. The panel's `onFocus={() => setIsExpanded(true)}` enqueues `true`, and toggle() then enqueues the functional updater `prev => !prev`. Both land in the one click batch: false -> true -> !true = false. The expand is never committed. Measured live over CDP (no aria-expanded mutation ever recorded), and confirmed by the discriminating control: hiding only the panel's focusin from React makes the same click open. On macOS, WKWebView does not focus a button on click, so the Tab lands outside the panel, onFocus never fires, and the updater alone yields true. That is the whole platform split. The gamepad (nintendo back=buttons[0]) candidate was eliminated by the operator's controller-unplugged control. It is unrelated to this defect."
fix: "toggle() now computes `const next = !isExpanded` from the render value, dispatches the Tab only `if (next)`, and calls `setIsExpanded(next)` instead of the functional updater. The onFocus `true` and toggle's `true` now agree, and the collapse path (next=false) never dispatches the Tab. The synthetic Tab is KEPT (38-C08 controller reachability). hasZeroArea is untouched. The in-code comment records why the functional updater must not return. Regression tests: two new cases in dropdownDisclosure.test.tsx under 'Dropdown opens when the synthetic Tab focuses its own panel (steam-caret-dropdown-dead)'. They were RED against the old updater and are GREEN after the fix."
verification: "VERIFIED LIVE 2026-09-24 on the operator's Windows 11 machine. The dev build with the fix was served via Vite (checked with curl on the served module), the page was reloaded clean with no control listener, and the todo instrumentation was re-injected on the GamePage for 752590. One CDP Input.dispatchMouseEvent click on the caret gave CLICK -> gamepadAction tab -> focusout inside=true -> MUT aria-expanded -> true, class dropdown expanded, and elementFromPoint at the option centre returns the option (it is painted and hittable). A second click collapsed it (aria-expanded -> false). Desk: dropdownDisclosure.test.tsx 26/26 (both new cases RED before the fix), pnpm codecheck clean, prettier clean. Side observation, not this defect: the expanded panel is position:static, so opening it reflows the flex-wrap row. The caret moves from y=705 to y=670 and the panel then sits under the cursor, which means the second click lands on the panel div and closes via the container onBlur, not via toggle(). The user-visible close behaviour is correct."
files_changed:
  - src/frontend/components/UI/Dropdown/index.tsx
  - src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx
```
