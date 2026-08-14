---
created: 2026-08-15T08:50:00.000Z
title: "Port Heroic gamepad fixes: Nintendo face-button layout + key-repeat tuning"
area: input
needs: port-then-hand-merge
status: OPEN
severity: minor
upstream:
  - 0ee91ab2f (Heroic v2.22.1 — Correct reversed A/B and X/Y on Nintendo controllers, #5747)
  - 8eb7fe7f9 (Heroic v2.22.1 — Improved gamepad key repeat, #5059)
files:
  - src/frontend/helpers/gamepad.ts
  - src/frontend/helpers/gamepad_layouts/nintendo.ts
  - src/frontend/helpers/gamepad_layouts/standard.ts
  - src/frontend/screens/ConsoleMode/controller.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/components/ConfirmDialog/index.tsx
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/components/UI/SliderField/index.tsx
  - src/frontend/screens/Settings/components/GamePadDelayRepeat.tsx
---

## Problem

Two upstream gamepad commits from Heroic v2.22.1, reviewed 2026-08-15 against GameLib's fork
base (Heroic v2.22.0 @ `b5b5cad3`). Operator decided to take **both as one task**.

**(a) Nintendo face buttons are reversed — a real user-visible bug.**
Nintendo Switch Pro Controllers and Joy-Cons report the Chromium "standard" mapping **by
physical position**, so the bottom button (labeled **B**) is `buttons[0]` and the right button
(labeled **A**) is `buttons[1]`. GameLib's input handling treats `buttons[0]` as the main action
and `buttons[1]` as back — so on a Switch controller, **pressing A triggers back and pressing B
selects**, directly contradicting the on-screen glyphs. Upstream adds a dedicated Switch Pro
layout that swaps the face buttons for main navigation, and makes Console Mode's confirm/back
button indices layout-aware so the overlays agree.

**(b) Key repeat is sluggish.** Upstream reworks the repeat handling in `gamepad.ts` (+113),
adds a new `SliderField` UI component, and exposes a `GamePadDelayRepeat` control under Advanced
Settings so the user can tune delay/rate.

## Solution

Port both. Merge characteristics verified 2026-08-15:

- `src/frontend/helpers/gamepad.ts` and `src/frontend/helpers/gamepad_layouts/` are **untouched
  by GameLib since fork base** — these merge clean.
- The ConsoleMode overlay half must be **hand-merged**, not cherry-picked: GameLib's
  `InstallOverlay/index.tsx` is +168 and `LaunchOverlay/index.tsx` +98 vs base.

**Trap:** (b) adds new i18n keys, so it **trips GameLib's blocking localisation gate**. Budget for
that. (a) alone does not.

**Opportunity:** GameLib has carried an *unmeasured gamepad focus-scroll* item across two
consecutive phases. This is the natural place to finally measure it rather than carrying it a
third time.

Reference commits are readable locally — the Heroic upstream is git remote `origin`:
`git show 0ee91ab2f`, `git show 8eb7fe7f9`.

Related: [[port-heroic-small-polish-trio]] (same upstream review), and the store-page gamepad
seed in `.planning/seeds/` for the console-mode-drives-store-browser feature.
