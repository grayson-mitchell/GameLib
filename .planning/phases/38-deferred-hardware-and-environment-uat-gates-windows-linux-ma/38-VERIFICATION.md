---
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
verified: null
status: human_needed
score: N/A — collection phase, no must-haves. 6 relocated items, 0 discharged.
audit_tool_note: >
  `status` MUST stay `human_needed`. `gsd-sdk query audit-uat` admits a VERIFICATION.md when
  status is `human_needed` OR `gaps_found`, but `parseVerificationItems` only emits items when
  status === 'human_needed' — so `gaps_found` is admitted and then always yields ZERO items, and
  the phase disappears from the audit entirely. Verified live on Phase 34.1 (2026-08-13):
  switching that field dropped it from 10 open items to 0. The tool also counts EVERY entry in
  `human_verification` regardless of any `result:` field, so a discharged item must be MOVED to
  `human_verification_discharged` rather than annotated in place. Both failure modes are silent.
  This matters more here than anywhere else: this phase's ENTIRE content is that array. Break it
  and the project's whole deferred-hardware backlog vanishes with nothing turning red.
purpose: >
  A collection phase. Every item below was relocated from a phase that could otherwise not close,
  because the item needs hardware or an OS this project does not have. Nothing here ships code.
created: 2026-08-22
relocation_rules: >
  (1) The destination must exist in ROADMAP.md BEFORE an item is relocated into it — Phase 34.9
  routed 8 items to a phase that never existed and every gate read green.
  (2) Every item names a `platform_gate` as a source-level expression, never a prose blocker.
  Phase 34.1's item 5b sat blocked four sessions on `blocked_by: "a sub-1200px-wide display"`,
  which misdescribed its own predicate (`window.screen.availWidth < 1200`, which follows the
  window across displays); it passed on the first attempt once someone read the code.
  (3) Relocation is two-way: the origin phase keeps a `human_verification_relocated` receipt
  naming this phase and the item ID, and every item here names its origin.
  (4) Items are split at their branch boundary, never compounded. A compound item resolves to a
  single pass/fail and the un-run half disappears — Phase 34.1 proved this twice (items 5 and 6).

human_verification:
  - id: "38-W02"
    test: "Tray — Windows/Linux dark/light tray icon swap. With GameLib running, toggle Settings > 'Use Dark Tray Icon' and watch the tray/notification-area image."
    expected: "The visible tray image swaps within ~500ms: ON gives a BLACK glyph (for a light taskbar), OFF gives a WHITE one. Both must be a legible cat silhouette, not a smudge."
    why_human: "Requires a Windows or Linux tray/notification area to render into. The asset-level property (the two files differ, and are a black and a white glyph respectively) is already gated without hardware by trayIconAssets.test.ts; what cannot be automated is whether the swap is VISIBLE and LEGIBLE at real tray size against a real taskbar."
    blocked_by: "a Windows or Linux machine"
    platform_gate: "src-tauri/src/main.rs — `tray_image` returns TRAY_ICON_TEMPLATE on macOS REGARDLESS of the `dark` argument (AppKit tints template images itself), so `darkTrayIcon` is vestigial on macOS BY DESIGN. The toggle is therefore unobservable on this project's hardware for a documented reason, not an accidental one."
    origin_phase: "34.1"
    origin_item: "6d / Gap G3"
    prior_state: >
      Blocked on ARTWORK, not hardware, until 2026-08-22 — which is why it correctly did NOT move
      here with the first six items. `icon-dark.png` and `icon-light.png` were byte-identical for
      the project's entire history (verified by md5 at all three scales), so `darkTrayIcon` was a
      switch wired to nothing and the item would have FAILED on a Windows machine too. That is now
      fixed: `meta/trayIconVariants.ts` generates `icon-tray-{dark,light}{,@2x,@3x}.png` from the
      same hue-segmented mask as the macOS template, differing only in fill, and refuses to write
      an identical pair at any scale. Both that gate and the asset tests are RED-proven against
      known-bad input. So this item is now genuinely runnable the moment hardware exists — which
      was NOT true of it before.
    watch_out: >
      macOS is NOT a valid substitute even to smoke-test the toggle: it will correctly show no
      change at all. Do not record that as a FAIL.
  - id: "38-W01"
    test: "Window buttons — Windows/Linux. With framelessWindow ON, GameLib's own custom-titlebar buttons sit at the window's top edge and minimize/maximize/restore/close the real OS window."
    expected: "Each click causes the real OS window to minimize / maximize / restore / close, exactly as the equivalent native title-bar button would."
    why_human: "Live Tauri webview window-manager behaviour against a real OS window; jest cannot run one."
    blocked_by: "a Windows or Linux machine"
    platform_gate: "src/frontend/App.tsx:79 — WindowControls is rendered under an unconditional !isMac gate, so the component structurally cannot render on this project's macOS-only hardware."
    origin_phase: "34.1"
    origin_item: "1a"
    prior_state: "STATICALLY FIXED, NEVER LIVE-CONFIRMED. Root cause (WindowControls/index.scss:2 anchored to the stale sidebar-era `grid-area: content`) was fixed by plan 34.1-09 and is gated by windowControlsPlacement.test.ts, which recomputes the expected row from .App's own live grid-template-areas rather than a pinned literal. Strong static evidence; never observed on a real Windows or Linux window in five sessions."

  - id: "38-C01"
    test: "Gamepad — directional focus. With a controller connected, navigate the /console routes using the d-pad and the left stick, in all four directions."
    expected: "Focus moves in the expected direction with no wrap. Specifically includes Up/Left from a COLD START with nothing focused — broken as WR-02/WR-03 and fixed unit-only during code review, never observed live."
    why_human: "Requires a physical controller; the Gamepad API polling loop is the only dispatch path."
    blocked_by: "a game controller"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — window.api.gamepadAction is dispatched ONLY from the navigator.getGamepads() polling loop (rAF-driven at :593,628, gated on the gamepadconnected event). There is no keyboard entry point into src/preload/api/tauriGamepadInput.ts."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C02"
    test: "Gamepad — right-stick scroll sign convention."
    expected: "The page scrolls in the SAME direction the stick is pushed, not the reverse. The phase ledger names this as the single case most likely to be inverted."
    why_human: "Requires a physical controller."
    blocked_by: "a game controller"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — see 38-C01."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C03"
    test: "Gamepad — Tab / Shift+Tab traversal, driven FROM THE CONTROLLER."
    expected: "The mapped controller inputs traverse focusable elements forward and backward."
    why_human: "Requires a physical controller."
    blocked_by: "a game controller"
    cannot_be_discharged_at_a_keyboard: >
      READ THIS BEFORE RUNNING. Phase 34.1's item 7 listed 'Tab/Shift+Tab' among the things to
      exercise, which reads keyboard-runnable. It is NOT. `gamepadAction` is dispatched only from
      the navigator.getGamepads() polling loop (gamepad.ts:559,678), so pressing the physical Tab
      key exercises WKWebView's native focus traversal and never reaches
      src/preload/api/tauriGamepadInput.ts at all. A keyboard run would produce a GREEN result
      over the largest never-executed surface in Phase 34.1. Same class as the recorded lesson
      that a UAT pass can cover a surface which cannot render at all.
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — see 38-C01."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C04"
    test: "Gamepad — B/back navigation and stick clicks (activate)."
    expected: "B/back navigates back. Left/right stick clicks (the click-equivalents) activate the element currently under focus or cursor."
    why_human: "Requires a physical controller."
    blocked_by: "a game controller"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — see 38-C01."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C05"
    test: "Gamepad — focus-scroll regression: scrollCardIntoView still works after the scroll-container relocation."
    expected: "Controller-driven focus movement through the library scrolls the focused card into view, against the post-34.10 scroll container rather than the retired sidebar-era one."
    why_human: "Requires a physical controller."
    blocked_by: "a game controller"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — see 38-C01."
    origin_phase: "34.10"
    origin_item: "deferred[0] — 'Gamepad focus-scroll regression (scrollCardIntoView) survives the scroll-container relocation'"
    prior_state: >
      NOT ATTEMPTED across four consecutive live gate runs. This item was NOT in 34.10's
      `human_verification` array — that phase is `status: passed` with `human_verification: []`,
      and the item sat in `deferred:` recorded as a 'named permanent residual risk... not
      scheduled to a numbered future phase'. It was therefore invisible to `gsd-sdk query
      audit-uat` entirely. Relocating it here gives it an owner that resolves for the first time.
    scope_note: >
      34.1's item 7 note already identified this as THE SAME unmeasured surface as 38-C01..C04,
      not a coincidence — no phase since has had a controller available. Run C05 in the same
      sitting as the other four.

sweep_notes:
  re_derive_before_running: >
    Do NOT run these items against the action list as written. `src/frontend/helpers/gamepad.ts`
    and `src/frontend/helpers/gamepad_layouts/nintendo.ts` were under active modification on
    2026-08-22 (the nintendo-layout + key-repeat todo closed that day), so the set of actions and
    layouts has moved since Phase 34.1 wrote these items. Re-derive the action list from the code
    at sweep time. A gate literal here would go stale by BEHAVIOUR long before the hardware
    arrives — the failure mode where a check still exists in source but no longer fires on the
    route the item drives.
  why_the_module_is_high_risk: >
    tauriGamepadInput.ts is not a port. Electron injected synthetic input via
    webContents.sendInputEvent (main.ts:1377), which fed Chromium's own built-in spatial
    navigation; WKWebView and WebView2 implement none of it, so all twelve action cases plus a
    hand-written geometric nearest-in-direction focus algorithm were re-derived from scratch
    against DOM semantics. This is the largest untested surface left in Phase 34.1.
  windows_linux_dependency: >
    38-W01 needs Phase 34's Windows/Linux builds to exist. The five controller items do not —
    they are gated only on hardware access and can be discharged earlier, independently.

human_verification_discharged: []
---

# Phase 38 — Deferred hardware and environment UAT gates

This phase holds UAT items that cannot run on this project's hardware. It ships no code.

**The frontmatter above is the source of truth**, because it is what `gsd-sdk query audit-uat`
reads. This prose section is for narrative only; never record a result here alone.

## How to close an item

1. Run it and record the observation in `38-HUMAN-UAT.md` with a verbatim artifact — a log line,
   not a recollection. Prefer instrumenting the branch under test and reading the emitted value
   over asking an operator what they saw; on GameLib the DevTools console accepts no input at all
   (paste fails and Enter does not submit), so route any instrumentation through the `logInfo`
   listener into `~/Library/Logs/GameLib/gamelib.log` rather than `console.*`.
2. **Prove the branch was armed** before recording a pass. An item whose gate never executed is
   indistinguishable, in every green result, from one that passed.
3. Move the entry from `human_verification` to `human_verification_discharged`. Do not annotate it
   in place — the audit counts array membership and ignores any `result:` field.
4. Update the origin phase's `human_verification_relocated` receipt with the outcome, so the
   origin's record does not rot. A park is a promise with no receipt unless someone walks back.

## Adding to this phase

Append to `human_verification` with an `id`, an `origin_phase`, an `origin_item`, and a
`platform_gate` written as a source-level expression. Leave the matching
`human_verification_relocated` receipt in the origin phase in the same change — one-way
relocation is how items get orphaned.
