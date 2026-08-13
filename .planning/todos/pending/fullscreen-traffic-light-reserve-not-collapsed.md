---
created: 2026-08-14T00:00:00.000Z
title: "78px traffic-light reserve is not collapsed in macOS fullscreen — navbar reads too tall"
area: ui
needs: fix
resolves_phase:
files:
  - src/frontend/components/UI/NavShell/index.scss:151-153
  - src/frontend/App.tsx:118
  - src/frontend/components/UI/NavShell/__tests__/shellTokens.test.ts
---

## Problem

Found by the human operator during Phase 34.1 gap-cycle-1 live gate (plan 34.1-14,
Section B), 2026-08-14. Reported as "when going to full screen mode the traffic lights
disappear from the titlebar (normal mac behavior), however that makes the titlebar look
too large."

In macOS fullscreen the OS hides the traffic lights. The 78px leading reserve that exists
solely to clear them is **not** scoped out of that state, so it becomes 78px of dead
inline-start padding and the navbar reads as too tall/too indented.

## Root cause — a missing exclusion its own sibling rule already has

`src/frontend/components/UI/NavShell/index.scss:151-153`:

```scss
.App.macOverlayTitlebar .NavShell__navbar {   // <-- no :not(.fullscreen)
  padding-inline-start: var(--traffic-light-inset);
}
```

The trailing-reserve rule immediately below it (`index.scss:179`) DOES carry the
exclusion:

```scss
.App:not(.macOverlayTitlebar).frameless:not(.fullscreen) .NavShell__navbar { ... }
```

`src/frontend/App.tsx:118` already sets `fullscreen: isFullscreen` on `.App`, so the hook
exists and needs no new plumbing.

## Fix

One token:

```scss
.App.macOverlayTitlebar:not(.fullscreen) .NavShell__navbar {
  padding-inline-start: var(--traffic-light-inset);
}
```

## Why no test caught it

`shellTokens.test.ts` (retuned by plan 34.1-11) pins `--traffic-light-inset` at `78px`,
proves the assertion fails against the pre-reversal `0px`, and proves the reserve is
scoped to `.App.macOverlayTitlebar` rather than applied unconditionally. All three
assertions are non-vacuous and all three pass. **None of them exercises the fullscreen
state**, because the suite's model of "scoped correctly" was `.macOverlayTitlebar` vs
not-`.macOverlayTitlebar` — a two-state model of a three-state problem.

Generalizable: this is the fourth time on this project a live gate has found something a
green suite could not. The gate did not beat the suite by being more thorough at the same
question; it asked a question the suite's state model did not contain.

Any fix should add a fullscreen case to `shellTokens.test.ts`, RED-proven against the
current (unexcluded) selector first.

## Discovered in

`.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-14-SUMMARY.md`
(Section B, live gate). Operator explicitly classified it as non-blocking for the gate —
Section B was recorded as PASS.
