---
created: 2026-08-14T00:00:00.000Z
title: "Design: move nav tabs onto the same line as the macOS traffic lights"
area: design
needs: sketch
resolves_phase:
files:
  - src/frontend/components/UI/NavShell/index.scss
  - src/frontend/App.tsx
---

## Idea

Raised by the human operator during the Phase 34.1 gap-cycle-1 live gate (plan 34.1-14),
2026-08-14: "I think you could change titlebar to have tabs on same line as traffic
lights."

Today, with `framelessWindow` ON on macOS, the traffic lights are overlaid on the app
content and the navbar reserves 78px of leading space to clear them — the tabs begin
after that reserve, on their own visual line. The proposal is to bring the card/folder
tabs up onto the traffic-light row itself, reclaiming that vertical band.

## Why this is a design task, not a CSS tweak

The 78px inset is not an arbitrary number — it comes from the validated navigation-redesign
sketches (see `Skill("sketch-findings-gamelib")`, the macOS traffic-light inset decision).
Moving tabs onto that row changes the two-tier nav structure those sketches settled, so it
needs to go back through sketching rather than being applied directly. Specifically
unresolved:

- Does the tab row have enough height to sit on the traffic-light line without clipping the
  card/folder tab shape?
- What happens on Windows/Linux, where there are no traffic lights and no reserve?
- What happens in macOS fullscreen, where the lights vanish entirely (see
  [[fullscreen-traffic-light-reserve-not-collapsed]])?
- Multi-theme survival — never evaluate nav appearance in `midnightMirage` alone; `dracula`
  makes the navbar lighter than the body and is the usual reveal.

## Route

`/gsd-sketch` first, then a phase if it survives. Related: Phase 34.12 (onboarding tour
rework) is already queued against the same nav shell, so there may be sequencing value in
deciding this before that lands.

## Discovered in

`.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-14-SUMMARY.md`
(Section B, live gate). Explicitly non-blocking — Section B was recorded as PASS.

## Closed 2026-08-21 — already shipped by the nav redesign, confirmed against source + operator

The tab strip already lands on the same navbar row as the traffic lights, no further
sketch needed. `NavShell/index.scss:170-171` gives `.App.macOverlayTitlebar .NavShell__navbar`
(the one shell row that also holds `.NavTabs`) `padding-inline-start: var(--traffic-light-inset)`
— the tabs start immediately after the 78px reserve, on the traffic-light row itself, not
on a separate line below it. `260815-j24`'s STATE.md record confirms this explicitly:
unmounting the brand icon dropped the tab strip to the navbar's inline start with zero CSS
change, and the user's own decision on that task was to **keep** the 78px reserve rather
than relocate the traffic lights — i.e. the "tabs on the traffic-light line" outcome this
todo asked for was reached as a side effect of that work, not via a dedicated sketch pass.

Operator confirmed live 2026-08-21. The three open questions this todo raised are
resolved as a result: Windows/Linux never carry the reserve (platform-scoped selector,
unchanged); multi-theme survival was covered by `260815-lta`'s live UAT across
midnightMirage/dracula/gruvbox_dark; the fullscreen case is [[fullscreen-traffic-light-reserve-not-collapsed]],
closed separately the same day (with a source/observation discrepancy recorded there —
worth reading if this todo is ever revisited).
