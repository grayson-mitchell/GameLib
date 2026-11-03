---
created: 2026-11-02
title: "Game-page main button spinner renders black instead of the button's font colour"
area: frontend-ui
files:
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
severity: minor
platform: any
ready: code
---

## Trigger

Operator report, 2026-11-02, during the 59-22 live re-test (Dungeons of Dredmor install on the
built-in engine): the spinner on the game-page install button is black, not the colour of the
button's label text.

## What is known

- `MainButton.tsx` renders the spinner as `<FontAwesomeIcon icon={faSyncAlt} className="fa-spin" />`
  at three sites (L218, L228, L248). The steam "Installing…" branch uses it, and since 59-22
  (`43829dc3e`) so does the engine-phase branch.
- `GameStatus` renders its spinner with `color="inherit"` and was not reported as wrong. Something
  near the button, such as a theme or a button rule, probably sets the icon's colour or fill
  explicitly. This has not been traced.

## Done when

The button spinner matches the label colour in every theme the sketch findings require to
survive.

## Result

Fixed in quick-261103-stm (code commit 843d75b58).

The cause was `.buttons .mainBtn svg { color: var(--neutral-02) }` (#161c1e, not themed) in `GamePage/index.css`. It came from upstream and pinned every main-button icon. The rule now uses `color: currentColor`, so the spinner and the Play/Stop/Pause icons follow the label (`--text-tertiary`, or `--text-secondary` when disabled) in every theme.

Not done: no live visual check across themes was run. On the default theme the icons were already near-black by coincidence (`--text-tertiary` = #070a0b), so the change shows most in the disabled installing state and in non-default themes.
