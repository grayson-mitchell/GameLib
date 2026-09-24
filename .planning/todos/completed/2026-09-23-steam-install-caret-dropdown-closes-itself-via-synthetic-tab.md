---
created: 2026-09-23T00:00:00.000Z
title: "The Steam install-options caret dropdown is ~90% dead to the mouse — `Dropdown.toggle()` fires a synthetic Tab before its own expand lands, and the container's `onBlur` slams it shut"
area: library-ui
severity: major
platform: windows
ready: live-gate
status: completed
resolved: 2026-09-24
resolved_by: debug-steam-caret-dropdown-dead
found_by: "Live Phase 38 sitting on the operator's Windows 11 machine, 2026-09-23, trying to reach the Steam install-options dialog via the split-button caret"
files:
  - src/frontend/components/UI/Dropdown/index.tsx:30-36
  - src/frontend/components/UI/Dropdown/index.tsx:41-46
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx:369-411
  - src/frontend/preload/api/tauriGamepadInput.ts:50-62
---

# The install-options caret opens roughly 1 click in 10

## Resolution (2026-09-24): FIXED, verified live on Windows

**Root cause: none of the three survivors below.** It was a React batching self-cancellation in
`Dropdown.toggle()`. WebView2 focuses the caret on click, so the synthetic Tab lands on the panel's
own child and synchronously fires the panel's `onFocus` -> `setIsExpanded(true)`. `toggle()` then
queued `prev => !prev`, and in the one click batch that went false -> true -> false, so no expand was ever
committed. WKWebView does not focus the button on click, so on macOS the Tab lands outside the
panel and the updater alone yields `true`. That is the entire platform split. The desk Chromium
replays missed it because they reproduced the CSS and focus collector but not React's batching.

**Measured** over CDP against the running Windows dev build (`--remote-debugging-port=9222`, real
`Input.dispatchMouseEvent` clicks). The click reached the handler and focus stayed inside the
container, yet no `aria-expanded` mutation was ever recorded. **Control:** hiding only the panel's
focusin from React made the identical click open.

**Fix:** `toggle()` uses `const next = !isExpanded; setIsExpanded(next)`, and the Tab is still
dispatched on expand (38-C08). Two RED->GREEN cases were added to `dropdownDisclosure.test.tsx`.
Verified live: the click opens, the option is hittable, and a second click closes. The full record
is `.planning/debug/resolved/steam-caret-dropdown-dead.md`. 38-C08 is now scorable.

Everything below is the pre-resolution history.

---

## ▶ DO THIS NEXT — on the Windows machine, ~5 minutes

Everything below this block is history and reasoning. This is the whole job.

**1. Run a dev build.** `pnpm tauri:dev`. It has to be the dev build: `src-tauri/Cargo.toml`
requests no `devtools` feature, so a packaged build has no console to paste into.

**2. Open a game page that shows the caret** — an owned Steam title that is not installed, not
queued and not delisted. If no caret is visible, the gate is off and there is nothing to test.

**3. Open DevTools** (F12, or right-click → Inspect) and paste this into the Console, whole:

```js
;(() => {
  const c = document.querySelector('.SteamInstallCaret')
  if (!c) return 'no caret on this page — need an owned, not-installed, not-delisted Steam title'
  const btn = c.querySelector('.dropdownButton')
  const panel = c.querySelector('.dropdown')
  const R = (el) => {
    const r = el.getBoundingClientRect()
    return `${r.width.toFixed(1)}x${r.height.toFixed(1)}@${r.left.toFixed(0)},${r.top.toFixed(0)}`
  }
  const t0 = performance.now()
  const L = (s) => console.log(`[CARET +${(performance.now() - t0).toFixed(0)}ms] ${s}`)
  const optBtn = panel.querySelector('button')
  L(`caret=${R(btn)} panel=${R(panel)} opt=${optBtn ? R(optBtn) : 'NONE'} panelClass=${panel.className}`)
  const b = btn.getBoundingClientRect()
  const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
  L(`elementFromPoint(caret centre) = ${hit ? hit.tagName + '.' + hit.className : 'null'}`)
  L(`computed: pointerEvents=${getComputedStyle(btn).pointerEvents} visibility=${getComputedStyle(panel).visibility} display=${getComputedStyle(panel).display}`)
  btn.addEventListener('click', () => L('CLICK reached the caret handler'), true)
  c.addEventListener('focusin', (e) => L(`focusin -> ${e.target.className || e.target.tagName}`), true)
  c.addEventListener(
    'focusout',
    (e) =>
      L(
        `focusout rel=${e.relatedTarget ? e.relatedTarget.className || e.relatedTarget.tagName : 'null'} inside=${c.contains(e.relatedTarget)}`
      ),
    true
  )
  new MutationObserver((ms) =>
    ms.forEach((m) =>
      L(`MUT ${m.attributeName} -> ${m.target.getAttribute(m.attributeName)} | panelClass=${panel.className} panelBox=${R(panel)}`)
    )
  ).observe(c, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-expanded'] })
  return 'instrumented — now click the caret once'
})()
```

**4. Click the caret once.** Copy every `[CARET]` line, including the two printed at paste time.
That is the deliverable — paste them back and the diagnosis follows from the table below.

### What the lines mean (you do not need to work this out — just grab them)

| what the log shows                                                               | verdict                                                                                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| no `CLICK reached the caret handler` line at all                                 | the click never reaches the button — hit-testing/overlap. `elementFromPoint` names the thief. Nothing to do with focus.        |
| `CLICK` fires, `MUT aria-expanded -> true`, non-zero `panelBox`, nothing on screen | it opens and fails to paint — a WebView2 paint/compositing problem.                                                            |
| `CLICK` fires, then `focusout ... inside=false`, then `aria-expanded -> false`    | focus escapes the container; the todo's ORIGINAL STRUCTURE was right and only its zero-area justification was wrong.           |
| `CLICK` fires, `aria-expanded -> true`, and it stays true                        | it is working at the DOM level in the dev build — which would mean the dev/packaged builds differ and that is the next thread. |

If DevTools will not open at all, say so and this becomes a `console.log` patch + rebuild
instead — slower, same questions.

---

**Observed live**: clicking the `SteamInstallCaret` beside the primary Install half produced the
dropdown **once in 10+ clicks**. Operator's words: "dropdown seems 'mostly dead' I did see the
dropdown once, but 10+ further clicks and could not reproduce."

**Cleanly isolated.** The same install-options dialog opens reliably through the `GameCard`
context-menu door (D-27 row 3), and the dialog and its section-gating render correctly once
reached — `38-S06` passed through that door in the same sitting. So the dialog, the gating and
`openSteamInstallOptions` are all fine. The fault is in the caret's `Dropdown` alone.

## Suspected mechanism — UPDATED 2026-09-24, debug session `steam-caret-dropdown-dead`

**REFUTED (measured 2026-09-24, see `.planning/debug/steam-caret-dropdown-dead.md`):**
the `hasZeroArea` chain below, exactly as originally written. `Dropdown/index.scss` plus
`tauriGamepadInput.ts`'s focus collector were reproduced verbatim and run in real Chromium
(WebView2's engine): a *collapsed* panel's child button measures 176.3×31.6, is non-zero on both
axes, and **is** collected by `getFocusableElements()` — `max-height:0; overflow:hidden` clips the
parent's paint, not the child's border box. Replaying the click end-to-end, the current source
ordering settles `dropdown expanded` with `activeElement=opt` (the child button), inside
`.dropdownContainer` — the `onBlur` collapse branch never runs. **Do not re-test this chain and do
not ship "move the Tab after the expand" as the fix; it was also measured and is a no-op against
the real behaviour.** The four numbered steps and code block that used to sit here are the refuted
version, kept below only for the historical record:

```js
const toggle = () => {
  // focus first component only when expanding
  if (!isExpanded) {
    window.api.gamepadAction({ action: 'tab' })
  }
  setIsExpanded((prev) => !prev)
}
```

1. ~~The synthetic `tab` is dispatched before `setIsExpanded(true)` commits, so the dropdown is
   still `collapsed` at dispatch time.~~
2. ~~`getFocusableElements()` drops the collapsed children as zero-area.~~ — **false**, measured.
3. ~~Focus lands outside `.dropdownContainer`.~~ — **false**, measured (`activeElement=opt`, inside).
4. ~~The container's `onBlur` sees an outside `relatedTarget` and collapses it.~~ — never runs.

**ELIMINATED 2026-09-24 by an operator-run negative control, on both machines.** Verbatim: *"on
macos caret open everytime, on windows machine carot does not work... does not matter if
controller plugged in or not"*. The symptom is **invariant to the controller's presence**, so no
gamepad path can cause it — and `260923-qe5` does **not** close this defect as a side effect. The
two are unrelated. The superseded gamepad hypothesis is kept below for the record only:

> `src/frontend/helpers/gamepad_layouts/nintendo.ts:80-105`'s `checkNintendo()` binds
`back` unconditionally to `buttons[0]` on the (unproven) premise, stated in its own header comment,
that "Chromium reports these with the 'standard' mapping by physical position". That premise is
independently known to be **false** for at least one real device: the concurrent, still-in-flight
quick-task `.planning/quick/260923-qe5-fix-checknintendo-trusting-chromium-stan/260923-qe5-PLAN.md`
measured, on the operator's own PowerA Advantage Wired Controller for Nintendo Switch 2, that
Chromium reports mapping `''` (non-standard) and passes raw HID through untouched — on that pad
`buttons[0]` is the **Y** cap, not B (raw HID SNES-style order is Y, B, A, X). `HID_DUMP` is still
`true` and no `mapping` parameter has landed on `checkNintendo` (checked 2026-09-24), so this bug
is live in the tree today, unpatched.

Chain: pressing the physical **Y** button on such a pad dispatches `checkAction('back', ...)`
(`gamepad.ts`'s `back` binding is edge-triggered, `repeatDelay: false` — fires once per genuine
press, never spontaneously while idle). `gamepad.ts`'s `back` case calls `closeDropdown()`
whenever `insideDropdown()` is true — and it *is* true in exactly the relevant window: the
now-refuted replay above already established that a mouse click on the caret settles with
`activeElement` **inside** `.dropdownContainer` immediately after opening. So: click opens the
dropdown correctly (confirmed by the Chromium replay), and if a non-standard-mapping Nintendo pad
was connected and its physical Y button was pressed (or read as pressed) in that same window,
`closeDropdown()` fires and slams it shut — reading exactly as "opened once, mostly dead."

## What is actually measured, 2026-09-24

- **Windows/WebView2: dead, not flaky.** The filed "~1 in 10" overstates it. The single sighting
  of it ever opening on Windows remains the only one; the negative control found it simply does
  not work. The title's "~90% dead" is therefore generous and the `severity: major` stands.
- **macOS/WKWebView: opens 10/10** — and this arm is now fully *explained*. WKWebView does not
  focus a `<button>` on mouse click, so `doTab` starts from `activeElement === null`, takes the
  `currentIndex === -1` branch and focuses `list[0]` somewhere up the document. Focus is never
  inside `.dropdownContainer`, so the container's `onBlur` never fires and nothing can collapse
  the panel. macOS works *by accident of a focus quirk*, not by design — worth knowing before
  anyone "fixes" the Tab ordering and takes that accident away.
- **The Windows arm is not reproducible at the desk.** A faithful Chromium reproduction — the
  real `.installButtons` flex-wrap geometry, the 44px caret box, `Dropdown/index.scss` verbatim
  and the focus collector verbatim — opens in the Windows focus condition too
  (`collapsed container=208.3x68.0 panel=208.3x24.0 opt=176.3x31.6`, `opt` collected, settles
  `expanded`). So the cause is something WebView2 does that the reproduced CSS/DOM does not
  capture.

**Three survivors, needing different fixes.** (a) the click never reaches the handler — an
overlapping box / hit-testing problem under `flex-wrap`; (b) it opens but paints nothing; (c)
focus genuinely escapes the container on WebView2, which would restore the todo's *original
structure* while leaving its step-2 justification refuted. The "DO THIS NEXT" block at the top of
this file discriminates all three in a single click.

## Why this is `major`

- The caret is one of three documented doors to install options (D-27 rows 3 and 5 plus this
  one). The other two work, so a workaround exists — but a control that responds ~10% of the time
  reads as a broken app, not a missing feature.
- **It contaminated a live measurement**, which is the second count: `38-C08` asks whether this
  caret is CONTROLLER-reachable. A control the mouse cannot reliably open makes that question
  unanswerable, so the item could not be scored in this sitting.
- `Dropdown` is a SHARED primitive. Its other current consumers are the NavShell tier-2 filter
  dropdowns (`FilterFacetGroup`) per the component's own comment, so any fault here is not
  confined to the caret. **Check whether the filter dropdowns show the same flakiness** —
  `38-C06` covers tier-2 filter panel traversal and may be affected by the same root cause.

## Fix direction — not prescriptive

**Superseded 2026-09-24, twice.** The original direction ("move the synthetic Tab to after the
expand commits") targeted the refuted `hasZeroArea` chain and is a measured no-op — do not ship
it. The gamepad direction that briefly replaced it is eliminated too; `260923-qe5` is unrelated
work and does not touch this.

**Do not write a fix before the Windows instrumentation comes back.** Two of the three survivors
have nothing to do with focus or the synthetic Tab, so any edit chosen now is a guess with a
one-in-three prior. If survivor (c) is the one, note that the measured
`mode=direct-focus` replay — focusing the panel's own first focusable child post-commit instead
of delegating to the generic Tab walker — is the only variant that landed inside the container in
**both** focus conditions, i.e. the only one invariant to the WKWebView/WebView2 difference this
platform split implicates. That is a candidate, not a decision. Do not simply delete the
`gamepadAction({action: 'tab'})` call — it is what makes the dropdown reachable by controller in
the first place, which is the very property `38-C08` exists to verify. Equally, do not loosen
`hasZeroArea`: that filter is load-bearing for the gamepad focus collector and was measured
correct in the Chromium replay above.

## Cross-reference

`38-C07`'s ledger entry already anticipated trouble in exactly this neighbourhood, describing the
caret as "a small icon-only half of a split button inside a `flex-wrap: wrap` container —
precisely the shape whose measured box can collapse to zero on one runtime and not the other."
That note was about the CARET's own box; this defect is about its dropdown CHILDREN's boxes, via
the same `hasZeroArea` predicate. Related reasoning, different element.
