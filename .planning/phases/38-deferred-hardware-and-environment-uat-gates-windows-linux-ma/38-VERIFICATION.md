---
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
verified: null
status: human_needed
score: N/A — collection phase, no must-haves. 29 relocated items, 0 discharged.
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

  THE `id:` FIELD DOES NOT SURVIVE INTO THE AUDIT OUTPUT. `audit-uat` emits each item with a
  POSITIONAL integer as `test:` and the `test:` prose as `name`; the `id:` is dropped entirely, so
  there is no key to join the audit back to this file except the prose. Worse, positions do not
  track ids, because this array is in ARRIVAL order, not id order. Measured 2026-08-23: audit
  position 1 is `38-W02` (the tray item) and position 2 is `38-W01` (window buttons) — off by one
  in a way that silently reverses. Positions 3..8 happen to line up with W03 and C01..C05 today,
  which is exactly what makes the hazard easy to miss: a spot-check anywhere but the first two rows
  confirms a mapping that is false. CROSS-REFERENCE BY THE `test:` PROSE, NEVER BY POSITION, and
  never quote an audit position as if it were an ID. This bites hardest on relocation receipts:
  rule (3) below has each origin phase name an item ID in its `human_verification_relocated`
  receipt, so a reader who follows that ID by counting rows in the audit output lands on the wrong
  item. Adding an item to this array renumbers every position after it; the IDs never move.
purpose: >
  A collection phase. Every item below was relocated from a phase that could otherwise not close,
  because the item cannot be observed on the macOS development machine — it needs a different OS,
  or a game controller. Nothing here ships code.

  THE HARDWARE IS OWNED AND AVAILABLE. Corrected 2026-09-01 (quick `260901-vm1`): a Windows
  machine, a Linux machine and an Xbox controller (plus a second controller) are all on hand.
  NOT ONE of the 29 items below is blocked on an acquisition. The only reason they are batched is
  the SWITCHING COST — booting another machine, pairing a controller, and on four items
  registering a second Steam library. This phase is schedulable at will.

  This correction matters because the two framings behave differently. "Needs an OS this project
  does not have" reads as indefinitely blocked and unfalsifiable, so it is never scheduled and
  never re-examined; "costs a machine switch" is a known price that competes for time like any
  other task. The prior text asserted the former, and it was wrong.
deferral_note: >
  The `blocked_by:` KEY NAME IS HISTORICAL. Its values no longer name a missing capability — as of
  2026-09-01 each one states the COST of running that item (a machine switch, a controller
  pairing, or a two-library Steam setup step). The key was deliberately NOT renamed: `audit-uat`
  does not read it, but origin-phase `human_verification_relocated` receipts reference the
  concept, so a rename has a wider blast radius than the correction warranted. Read `blocked_by`
  as "deferral cost", not as "blocker".

  Relocation rule (2) below is what caught this. Its own cautionary example — an unfalsifiable
  prose blocker that "rots without anyone noticing" — is precisely what all 29 values had become.
  The rule was right and the ledger had violated it 29 times.
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
    blocked_by: "machine switch -- boot the Windows or the Linux machine (both OWNED and available; the cost is the switch, not the hardware)"
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
    blocked_by: "machine switch -- boot the Windows or the Linux machine (both OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/App.tsx:79 — WindowControls is rendered under an unconditional !isMac gate, so the component structurally cannot render on this project's macOS-only hardware."
    origin_phase: "34.1"
    origin_item: "1a"
    prior_state: "STATICALLY FIXED, NEVER LIVE-CONFIRMED. Root cause (WindowControls/index.scss:2 anchored to the stale sidebar-era `grid-area: content`) was fixed by plan 34.1-09 and is gated by windowControlsPlacement.test.ts, which recomputes the expected row from .App's own live grid-template-areas rather than a pinned literal. Strong static evidence; never observed on a real Windows or Linux window in five sessions."

  - id: "38-W03"
    test: "Login window provisional title — Windows/Linux. Open any store login (Manage Accounts → Humble/GOG/Epic/Amazon) and watch the window's TITLE BAR from the instant it appears."
    expected: "The title bar NEVER reads the framework default 'Tauri app'. It shows the ORIGIN (e.g. https://www.humblebundle.com) from the moment the window is presented, and is then REPLACED by the loaded document's own title (e.g. 'Humble Bundle - Log In'). Both halves matter: an origin that never gives way to the document title is a WR-07 REGRESSION introduced by the fix itself, not a pass."
    why_human: "A sub-second, one-way visual transition on a real OS title bar. Source can prove the title ARGUMENT is origin-derived — main.rs's own WR-07 CORRECTION records that a grep gate can establish the ABSENCE of a prohibited hard-coded title but structurally CANNOT establish the PRESENCE of the required one. Only a human watching the bar can."
    blocked_by: "machine switch -- boot the Windows or the Linux machine (both OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src-tauri/src/main.rs — on macOS the login window is presented as an AppKit SHEET (`present_login_window_as_sheet`, live-confirmed `sheet_presented=true attached=true` on 2026-08-23), and main.rs:1551 states it outright: 'AppKit sheets structurally render NO title bar UI at all, so that string is never user-visible on macOS' (F-34.5-G6-16). The `.title(login_window_title(&origin, None))` call added by plan 34.4.1-33 therefore sets an NSWindow title this project's hardware never displays. FALSIFIABLE: if the login window ever stops being presented as a sheet on macOS, this item becomes observable here and must move back."
    origin_phase: "34.4.1"
    origin_item: "D-29-05 (gap cycle 3)"
    prior_state: >
      STATICALLY FIXED AND SOURCE-GATED, LIVE-UNOBSERVABLE ON THIS HARDWARE. Plan 34.4.1-33 built the
      visible login window with `login_window_title(&origin, None)` — origin-derived, NEVER a static
      string, which is what keeps WR-07 intact (WR-07 prohibits a hard-coded APPLICATION title, not an
      origin-derived one). Two source gates in tauriShellSource.test.ts cover it: a PRESENCE gate
      asserting the visible block builds that exact call, and an AMENDED WR-07 negative gate. The
      negative gate previously banned `.title(` outright, which could not distinguish
      `.title("GameLib")` from `.title(login_window_title(...))` because it rejected BOTH; it now
      forbids a string literal in all three Rust forms plus `format!` AND requires every surviving
      `.title(` argument to contain `login_window_title(`. Four red-proofs, including one confirming
      `.title("GameLib")` still FAILS — so the amendment did not weaken WR-07's negative half.
      Live gate run 4 (2026-08-23) attempted this item on macOS and found it UNSCOREABLE, which is how
      it reached this phase.
    watch_out: >
      macOS is NOT a valid substitute and must not be recorded as a pass OR a fail. The operator will
      see NO title bar at all — the sheet shows an in-page ORIGIN BANNER instead (Phase 34.5 Plan 52,
      F-34.5-G6-16), which is the deliberate macOS replacement and satisfies the same anti-phishing
      intent by a different mechanism. Observing the banner is NOT observing this item. The run-4
      contract mis-specified exactly this and the error is recorded there against the contract.

  - id: "38-W04"
    test: "Smoke-launch the CI-produced WINDOWS installer artifact. Download the NSIS installer from the `release-tauri.yml` workflow run for the commit under gate, install it, and launch the resulting GameLib.exe."
    expected: "The installer completes without error. GameLib launches, a window appears, and the process survives at least 10 seconds without crashing — the same bar `35-LIVE-GATE.md` criterion 1 applies to the macOS artifact."
    why_human: "Requires a Windows host. `.github/workflows/release-tauri.yml` builds and uploads the NSIS installer to a draft release (`tauri-apps/tauri-action@v1`, last step at :429) but performs no runtime check of its own — the artifact has never been executed by anything, human or CI, since the Tauri rearchitecture began."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src-tauri/tauri.conf.json `bundle.targets` includes `nsis` — an `.exe`/NSIS installer cannot execute on macOS at all; this is a binary-format boundary, not an unreached code branch."
    origin_phase: "35"
    origin_item: "35-19 Task 2, option-c"
    reduction_note: >
      THIS ITEM IS A RECORDED SCOPE REDUCTION AGAINST D-16, NOT A ROUTINE DEFERRAL. D-16's own
      wording requires "the CI matrix producing installable artifacts PLUS A SMOKE LAUNCH" before
      Windows counts as proven out. Phase 35's blocking gate (`35-LIVE-GATE.md`) closed on macOS
      artifact measurement plus Windows/Linux artifact PRODUCTION only — the smoke-launch half of
      D-16 was NOT satisfied before that phase closed. It is relocated here, to the phase that
      already owns every UAT item this project's hardware cannot run, rather than left as a silent
      gap in Phase 35's closing record. See `35-LIVE-GATE.md`'s Windows/Linux disposition section
      and `REQUIREMENTS.md` REQ-35-20 for the matching acknowledgment on the origin side.
    prior_state: >
      Never attempted. `35-PREFLIGHT.md` OQ-4 measured that `release-tauri.yml` performs no runtime
      check of its own; D-00c independently records the Windows and Linux Tauri builds as
      code-complete and CI-wired but never live-verified, because plan `34-07` (the all-platform,
      live tag-push gate) is user-deferred.

  - id: "38-W05"
    test: "Smoke-launch the CI-produced LINUX installer artifact. Download the AppImage from the `release-tauri.yml` workflow run for the commit under gate, mark it executable, and launch it."
    expected: "The AppImage launches directly (no separate install step, per D-11/D-12's AppImage-only decision). A window appears, and the process survives at least 10 seconds without crashing — the same bar `35-LIVE-GATE.md` criterion 1 applies to the macOS artifact."
    why_human: "Requires a Linux host. Same gap as 38-W04: `release-tauri.yml` builds and uploads the AppImage but never executes it."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src-tauri/tauri.conf.json `bundle.targets` includes `appimage` — an AppImage binary cannot execute on macOS at all; this is a binary-format boundary, not an unreached code branch."
    origin_phase: "35"
    origin_item: "35-19 Task 2, option-c"
    reduction_note: >
      THIS ITEM IS A RECORDED SCOPE REDUCTION AGAINST D-16, NOT A ROUTINE DEFERRAL. Same reduction
      as 38-W04, for the Linux leg specifically — D-16 said "artifacts plus a smoke launch"; Phase
      35 closed on artifact production alone for this leg. See `35-LIVE-GATE.md`'s Windows/Linux
      disposition section and `REQUIREMENTS.md` REQ-35-20.
    prior_state: >
      Never attempted. Same `35-PREFLIGHT.md` OQ-4 / D-00c basis as 38-W04.

  - id: "38-C01"
    test: "Gamepad — directional focus. With a controller connected, navigate the /console routes using the d-pad and the left stick, in all four directions."
    expected: "Focus moves in the expected direction with no wrap. Specifically includes Up/Left from a COLD START with nothing focused — broken as WR-02/WR-03 and fixed unit-only during code review, never observed live."
    why_human: "Requires a physical controller; the Gamepad API polling loop is the only dispatch path."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — window.api.gamepadAction is dispatched ONLY from the navigator.getGamepads() polling loop (rAF-driven at :593,628, gated on the gamepadconnected event). There is no keyboard entry point into src/preload/api/tauriGamepadInput.ts."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C02"
    test: "Gamepad — right-stick scroll sign convention."
    expected: "The page scrolls in the SAME direction the stick is pushed, not the reverse. The phase ledger names this as the single case most likely to be inverted."
    why_human: "Requires a physical controller."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — see 38-C01."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C03"
    test: "Gamepad — Tab / Shift+Tab traversal, driven FROM THE CONTROLLER."
    expected: "The mapped controller inputs traverse focusable elements forward and backward."
    why_human: "Requires a physical controller."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
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
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — see 38-C01."
    origin_phase: "34.1"
    origin_item: "7 (split)"

  - id: "38-C05"
    test: "Gamepad — focus-scroll regression: scrollCardIntoView still works after the scroll-container relocation."
    expected: "Controller-driven focus movement through the library scrolls the focused card into view, against the post-34.10 scroll container rather than the retired sidebar-era one."
    why_human: "Requires a physical controller."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
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

  - id: "38-C06"
    test: "Gamepad — focus traversal INTO and WITHIN the tier-2 filter panel, and whether a focused row below the fold is scrolled into view."
    expected: "Controller-driven focus reaches the panel's rows (views, collections, the three collapsed facet groups and their checkboxes), moves within an expanded group, and a row that sits below the panel's visible area is scrolled into view rather than left clipped."
    why_human: "Requires a physical controller."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
    platform_gate: >
      `.NavShell__tier2Portal` (src/frontend/components/UI/NavShell/index.scss:499-505) is the
      panel's OWN scroll container -- `overflow-y: auto`, nested inside `.NavShell__tier2`'s
      `overflow: hidden` (:401), and outside `main.content` entirely. No focus-scroll handler is
      bound to it: `grep -rn "scrollIntoView|addEventListener('focus'|onFocus"` over `NavShell/`
      and `Header/` returns ZERO hits. Focus dispatch itself is the same gate as 38-C01..C05 --
      `gamepadAction` is dispatched only from the `navigator.getGamepads()` polling loop
      (src/frontend/helpers/gamepad.ts:559,678), so nothing here is reachable from a keyboard.
    origin_phase: "34.11"
    origin_item: "34.11-VERIFICATION.md 'Carried-forward risk, not a phase blocker' — gamepad focus-scroll in the tier-2 panel"
    not_covered_by_c05: >
      READ THIS BEFORE MARKING IT A DUPLICATE. 38-C05 covers `scrollCardIntoView`
      (GamesList/index.tsx:46), which is attached to the GAMES LIST at :139 and hardcodes
      `document.querySelector('main.content')` as its container. The tier-2 panel is a different
      element in a different scroll container with no handler of its own, so C05 passing says
      nothing about this surface -- and `scrollCardIntoView` would scroll the wrong element even
      if it did fire here. Two items, not one, per relocation rule (4): a compound item resolves
      to a single pass/fail and the un-run half disappears.
    prior_state: >
      Deferred TWICE without ever being scheduled -- no controller in 34.10 or 34.11.
      `34.11-VERIFICATION.md` flags it as "the one item worth escalating... risks becoming an
      invisible standing gap if deferred a third time", yet that file has NO `human_verification`
      key at all, so `gsd-sdk query audit-uat` could not see it. Same invisibility 38-C05's own
      `prior_state` records for 34.10's version. This relocation gives it an owner for the first
      time.
    scope_note: >
      Run in the same sitting as 38-C01..C05 -- one controller discharges all six, and C05 and
      C06 are best run back to back so the two scroll containers are compared under identical
      input.

  - id: "38-C07"
    test: "Gamepad — the D-21 Steam install-options caret is controller-reachable, on ELECTRON. Two surfaces, both required: (a) the split-button caret beside the primary Install half on the game page's MainButton, and (b) the 'Install with options…' entry in the GameCard context menu."
    expected: "The caret is reachable by controller-driven focus; reaching it does NOT make the primary install half unreachable (the split button's two halves are both focusable, in a stable order); and the focus order around the caret is stable across repeated traversals in both directions."
    why_human: "Requires a physical controller. Focus dispatch has no keyboard entry point."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
    surface_note: >
      READ THIS BEFORE RECORDING A FAIL. The two surfaces do NOT look alike. On MainButton the
      affordance IS a caret — `className="SteamInstallCaret"`
      (src/frontend/screens/Game/GamePage/components/MainButton.tsx:356), a real split-button half.
      On the GameCard there is NO caret: the entry is a CONTEXT-MENU item labelled
      `gamelib:steam.install.withOptionsLabel` ("Install with options…") at
      src/frontend/screens/Library/components/GameCard/index.tsx:386-397. An operator who goes
      looking for a caret on the card will find none and would record a false FAIL against a
      surface that was never specified to have one.
    unmount_note: >
      The caret is taken out of the tab order by UNMOUNTING, not by `disabled`
      (MainButton.tsx:334-339 says so in comment form). So on a non-Steam or non-installable game
      the correct observation is that no caret element exists at all — not that a present caret
      refuses focus. Same shape as the recorded lesson that a tile can be unreachable by unmount
      rather than by disable.
    platform_gate: "src/frontend/helpers/gamepad.ts:559,678 — `window.api.gamepadAction` is dispatched ONLY from the `navigator.getGamepads()` polling loop; there is no keyboard entry point. Same gate as 38-C01..C06."
    origin_phase: "34.13"
    origin_item: "G-GAMEPAD-CARET / electron (34.13-UAT.md, PART C)"
    electron_cutover_risk: >
      Phase 35 removes the Electron build. If 35 lands before a controller is available, this item
      becomes unobservable BY CONSTRUCTION — the same shape as 38-W03, which is a correct fix on a
      surface this hardware cannot render. It would then be retired as unscoreable, NOT recorded as
      a pass and NOT silently dropped. 38-C08 (the tauri half) is unaffected and remains the
      load-bearing observation. Recorded here so the decision is deliberate when it arrives.

  - id: "38-C08"
    test: "Gamepad — the D-21 Steam install-options caret is controller-reachable, on TAURI (`pnpm tauri:dev`, never bare `tauri dev`). Same two surfaces as 38-C07."
    expected: "Same as 38-C07: caret reachable, the primary install half is not lost, focus order stable across repeated traversals."
    why_human: "Requires a physical controller."
    blocked_by: "controller pairing -- pair the Xbox controller (OWNED and available; the cost is the pairing, not the hardware)"
    not_covered_by_c07: >
      READ THIS BEFORE MARKING IT DUPLICATE. An Electron PASS is NOT evidence for this cell, and
      34.13's ledger says so explicitly on the row itself. Tauri does not use the webview's native
      focus traversal: `getFocusableElements()` (src/preload/api/tauriGamepadInput.ts:50-62) builds
      its own list and DROPS any element failing `hasZeroArea(el.getBoundingClientRect())` (:57,
      defined :46-48 as `rect.width <= 0 || rect.height <= 0`), plus `disabled` and
      `aria-hidden="true"`. Electron's native traversal applies no such filter. The caret is a
      small icon-only half of a split button inside a `flex-wrap: wrap` container
      (MainButton.tsx:356-374) — precisely the shape whose measured box can collapse to zero on one
      runtime and not the other. Two items, not one, per relocation rule (4).
    platform_gate: "src/preload/api/tauriGamepadInput.ts:57 (`hasZeroArea` filter in `getFocusableElements`) — the Tauri-only predicate that makes this an independent observation. Dispatch gate is shared: src/frontend/helpers/gamepad.ts:559,678."
    origin_phase: "34.13"
    origin_item: "G-GAMEPAD-CARET / tauri (34.13-UAT.md, PART C)"
    scope_note: >
      Run in the same sitting as 38-C01..C06 — one controller discharges all eight. Run C07 and C08
      back to back on the same game so the two runtimes' focus orders are compared under identical
      library state.

  - id: "38-S01"
    test: "Steam quick install on a WINDOWS host, electron runtime — native install ON and >1 registered Steam library. Click the PRIMARY half of Install (the button face, not the caret)."
    expected: "NOTHING opens — no dialog, modal, overlay or picker, and no flash-and-close — and the install lands in the PRIMARY Steam library. Verify the landing ON DISK (content plus appmanifest_<appId>.acf in the primary), not from the badge."
    why_human: "Requires a Windows host. The equivalent macOS row (G-QUICK-DEFAULT) is PASS on both runtimes, but the Windows path takes a different platformRow branch."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-QUICK-WIN / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S02"
    test: "Steam quick install on a WINDOWS host, tauri runtime — native install ON and >1 registered Steam library. Click the PRIMARY half of Install (the button face, not the caret)."
    expected: "NOTHING opens — no dialog, modal, overlay or picker, and no flash-and-close — and the install lands in the PRIMARY Steam library. Verify the landing ON DISK (content plus appmanifest_<appId>.acf in the primary), not from the badge."
    why_human: "Requires a Windows host. The equivalent macOS row (G-QUICK-DEFAULT) is PASS on both runtimes, but the Windows path takes a different platformRow branch."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-QUICK-WIN / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S03"
    test: "Steam quick install on a LINUX host, electron runtime — native installs OFF, or ON with <=1 library. Click the PRIMARY half of Install."
    expected: "NOTHING opens — no dialog, modal, overlay or picker, no flash-and-close."
    why_human: "Requires a Linux host. On Linux the platform row does not render at all (D-18), a branch unreachable on macOS."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-QUICK-LINUX / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S04"
    test: "Steam quick install on a LINUX host, tauri runtime — native installs OFF, or ON with <=1 library. Click the PRIMARY half of Install."
    expected: "NOTHING opens — no dialog, modal, overlay or picker, no flash-and-close."
    why_human: "Requires a Linux host. On Linux the platform row does not render at all (D-18), a branch unreachable on macOS."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-QUICK-LINUX / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S05"
    test: "Section-gating matrix row 5 on a WINDOWS host, electron runtime — native installs OFF, or ON with <=1 library."
    expected: "A read-only 'Windows' platform row (D-19); library dropdown, wine section and free-space line ALL ABSENT; content-light notice PRESENT (D-20/Q6). Check each of the four independently — an absent section inferred from another is exactly what this matrix exists to prevent."
    why_human: "Requires a Windows host for the readonly-windows branch."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-5 / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S06"
    test: "Section-gating matrix row 5 on a WINDOWS host, tauri runtime — native installs OFF, or ON with <=1 library."
    expected: "A read-only 'Windows' platform row (D-19); library dropdown, wine section and free-space line ALL ABSENT; content-light notice PRESENT (D-20/Q6). Check each of the four independently — an absent section inferred from another is exactly what this matrix exists to prevent."
    why_human: "Requires a Windows host for the readonly-windows branch."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-5 / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S07"
    test: "Section-gating matrix row 6 on a WINDOWS host, electron runtime — hasChoice (native installs ON and >1 library)."
    expected: "A read-only 'Windows' platform row (D-19); library dropdown PRESENT; wine section ABSENT; free-space line PRESENT. All four checked independently."
    why_human: "Requires a Windows host AND two registered libraries. `hasChoice` = native Steam installs ON **and** >1 registered library. `getSteamLibraries()` (src/backend/utils.ts:671) filters candidates through `existsSync`, so library COUNT is what the gate reads."
    blocked_by: "machine switch + setup -- boot the Windows machine (OWNED and available), then register a SECOND Steam library on it"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-6 / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S08"
    test: "Section-gating matrix row 6 on a WINDOWS host, tauri runtime — hasChoice (native installs ON and >1 library)."
    expected: "A read-only 'Windows' platform row (D-19); library dropdown PRESENT; wine section ABSENT; free-space line PRESENT. All four checked independently."
    why_human: "Requires a Windows host AND two registered libraries. `hasChoice` = native Steam installs ON **and** >1 registered library. `getSteamLibraries()` (src/backend/utils.ts:671) filters candidates through `existsSync`, so library COUNT is what the gate reads."
    blocked_by: "machine switch + setup -- boot the Windows machine (OWNED and available), then register a SECOND Steam library on it"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-6 / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S09"
    test: "Section-gating matrix row 7 on a LINUX host, electron runtime — native installs OFF, or ON with <=1 library."
    expected: "The platform row does NOT render at all (D-18); library dropdown, wine section and free-space line ALL ABSENT; content-light notice PRESENT (D-20/Q6). All four checked independently."
    why_human: "Requires a Linux host. 'Platform row absent' is a distinct state from 'platform row present but read-only' and cannot be produced on macOS or Windows."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-7 / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S10"
    test: "Section-gating matrix row 7 on a LINUX host, tauri runtime — native installs OFF, or ON with <=1 library."
    expected: "The platform row does NOT render at all (D-18); library dropdown, wine section and free-space line ALL ABSENT; content-light notice PRESENT (D-20/Q6). All four checked independently."
    why_human: "Requires a Linux host. 'Platform row absent' is a distinct state from 'platform row present but read-only' and cannot be produced on macOS or Windows."
    blocked_by: "machine switch -- boot the Linux machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-7 / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S11"
    test: "Section-gating matrix row 8 on a LINUX host, electron runtime — hasChoice (native installs ON and >1 library)."
    expected: "The platform row does NOT render (D-18); library dropdown PRESENT; wine section ABSENT; free-space line PRESENT. All four checked independently."
    why_human: "Requires a Linux host AND two registered libraries. `hasChoice` = native Steam installs ON **and** >1 registered library. `getSteamLibraries()` (src/backend/utils.ts:671) filters candidates through `existsSync`, so library COUNT is what the gate reads."
    blocked_by: "machine switch + setup -- boot the Linux machine (OWNED and available), then register a SECOND Steam library on it"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-8 / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S12"
    test: "Section-gating matrix row 8 on a LINUX host, tauri runtime — hasChoice (native installs ON and >1 library)."
    expected: "The platform row does NOT render (D-18); library dropdown PRESENT; wine section ABSENT; free-space line PRESENT. All four checked independently."
    why_human: "Requires a Linux host AND two registered libraries. `hasChoice` = native Steam installs ON **and** >1 registered library. `getSteamLibraries()` (src/backend/utils.ts:671) filters candidates through `existsSync`, so library COUNT is what the gate reads."
    blocked_by: "machine switch + setup -- boot the Linux machine (OWNED and available), then register a SECOND Steam library on it"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-ROW-8 / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).

  - id: "38-S13"
    test: "Content-light dialog on a WINDOWS host with no library choice, electron runtime — matrix row 5. Run BOTH sub-cases: (a) native installs OFF at any library count, (b) native installs ON with <=1 library."
    expected: "One read-only 'Windows' row, the content-light notice, Cancel + Install, and NOTHING else — no empty-state illustration or heading. Install completes normally. The two sub-cases must render DIFFERENT COPY: (a) gamelib:steam.install.contentLightNotice, (b) gamelib:steam.install.contentLightSingleLibraryNotice. Identical rendering is a FAIL."
    why_human: "Requires a Windows host."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-D20-CONTENTLIGHT / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
      Corrected by 34.13 review A-08: an earlier wording said the two sub-cases render
      IDENTICALLY. Review WR-04 deliberately made them differ, so identical rendering is now the
      FAIL condition. Do not run this against the pre-A-08 wording.

  - id: "38-S14"
    test: "Content-light dialog on a WINDOWS host with no library choice, tauri runtime — matrix row 5. Run BOTH sub-cases: (a) native installs OFF at any library count, (b) native installs ON with <=1 library."
    expected: "One read-only 'Windows' row, the content-light notice, Cancel + Install, and NOTHING else — no empty-state illustration or heading. Install completes normally. The two sub-cases must render DIFFERENT COPY: (a) gamelib:steam.install.contentLightNotice, (b) gamelib:steam.install.contentLightSingleLibraryNotice. Identical rendering is a FAIL."
    why_human: "Requires a Windows host."
    blocked_by: "machine switch -- boot the Windows machine (OWNED and available; the cost is the switch, not the hardware)"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-D20-CONTENTLIGHT / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
      Corrected by 34.13 review A-08: an earlier wording said the two sub-cases render
      IDENTICALLY. Review WR-04 deliberately made them differ, so identical rendering is now the
      FAIL condition. Do not run this against the pre-A-08 wording.

  - id: "38-S15"
    test: "Content-light notice COPY and container, electron runtime — scored per branch, on BOTH matrix row 5 (Windows) and row 7 (Linux)."
    expected: "The notice renders in an `.infoBox`, NOT in ThirdPartyDialog's `.noticeIcon`/`.noticeInfo`. Copy must match the catalogue EXACTLY, per branch: native installs OFF -> gamelib:steam.install.contentLightNotice; native installs ON with <=1 library -> gamelib:steam.install.contentLightSingleLibraryNotice. Verify against public/locales/en/gamelib.json, never by eye."
    why_human: "Requires BOTH a Windows and a Linux host, since the row is scored on matrix rows 5 and 7."
    blocked_by: "machine switch x2 -- boot BOTH the Windows and the Linux machine (both OWNED and available); scored on matrix rows 5 and 7"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-D20-Q6-COPY / electron (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
      Corrected by 34.13 review A-08 into a TWO-BRANCH split (review WR-04). A single-branch run
      does not discharge this item.

  - id: "38-S16"
    test: "Content-light notice COPY and container, tauri runtime — scored per branch, on BOTH matrix row 5 (Windows) and row 7 (Linux)."
    expected: "The notice renders in an `.infoBox`, NOT in ThirdPartyDialog's `.noticeIcon`/`.noticeInfo`. Copy must match the catalogue EXACTLY, per branch: native installs OFF -> gamelib:steam.install.contentLightNotice; native installs ON with <=1 library -> gamelib:steam.install.contentLightSingleLibraryNotice. Verify against public/locales/en/gamelib.json, never by eye."
    why_human: "Requires BOTH a Windows and a Linux host, since the row is scored on matrix rows 5 and 7."
    blocked_by: "machine switch x2 -- boot BOTH the Windows and the Linux machine (both OWNED and available); scored on matrix rows 5 and 7"
    platform_gate: "src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:182-207 — `platformRow` branches on `input.hostPlatform`: `'readonly-windows'` requires `=== 'win32'`, and `'absent'` requires NEITHER `'darwin'` NOR `'win32'` (i.e. Linux). On macOS the branch under test is unreachable by construction, not by accident."
    origin_phase: "34.13"
    origin_item: "G-D20-Q6-COPY / tauri (34.13-UAT.md)"
    prior_state: >
      Pending in 34.13's ledger from 2026-08-15 to 2026-08-28. Never attempted: this project's only
      host is an Apple Silicon Mac, so the branch never rendered. Relocated at gate close-out once
      every macOS-runnable row was resolved (44 PASS / 0 FAIL).
      Corrected by 34.13 review A-08 into a TWO-BRANCH split (review WR-04). A single-branch run
      does not discharge this item.

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
    38-W01, 38-W04 and 38-W05 need Phase 34's Windows/Linux builds to exist; 38-W04/W05
    additionally need a `release-tauri.yml` run against the Phase 35-gated commit to have produced
    the installer/AppImage they launch. The eight controller items do not — they are gated only on
    hardware access and can be discharged earlier, independently.

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
