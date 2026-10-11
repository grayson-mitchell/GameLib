---
created: 2026-10-10T22:51:00.000Z
title: Winetricks tab UX observations from the Phase 45 live gate (label, duplicate titles, re-batching a failed verb, header spacing, Installed section, Suggested collapse, bar overlap)
area: ui
severity: minor
platform: any
ready: human
found_by: "Phase 45 live gate 45-12 operator remarks and captures, 2026-10-10"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
---

Each item is the operator's own wording or a capture; none is a pre-registered bar. `ready: human`
because several are design decisions, not fixes. Split into code todos once decided.

1. **"Everything else" is mislabelled.** It is handed `allComponents`, so its search returns verbs
   that also appear in the groups above. Operator: "is actually Everything". Rename, or filter the
   grouped verbs out when not searching.
2. **Two rows titled "MS GDI+".** Upstream gives `gdiplus` and `gdiplus_winxp` the same title and
   the row never shows the verb id (`data-verb` only), so the operator installed the wrong one in
   G5 attempt 1 (bottle log gained `gdiplus`). Show the verb id in the caption, at least when titles
   collide.
3. **A failed verb cannot be re-batched.** After `bad` failed, its row offered only Retry (which
   runs it alone immediately); it could not be ticked into a new batch between two real verbs
   until a relaunch (or until a later run replaced the sidecar's latest run and the tab
   remounted). Decide whether an errored row should also be tickable. This also broke the
   contract's G7 procedure.
4. **Whitespace between collapsed group headers is "huge".** Operator asks for about half the
   header's own height. Visible in every capture (`G1-launch1-shot4.png`).
5. **Add an "Installed" section** after "Suggested for this game" so everything installed on the
   bottle is visible in one place (operator request).
6. **"Suggested for this game" cannot be collapsed**; operator expects it to behave like the other
   groups, expanded by default.
7. **The sticky bar overlaps content.** At the natural width it sits over the `MEDIA & CODECS`
   header (`G1-launch1-shot4.png`) and over the last visible row's Installed badge
   (`burst-light-26.png`); 45-UAT.md item 13 is `issue` on this.
8. **Row tag wording:** a verb installed in the current run reads `Done`, pre-existing ones
   `Installed` (`burst3-042.png`, `burst3-115.png`). Record only; decide whether one word is wanted.
9. **Window not resizable by dragging** (operator, launch 4), yet captures show three distinct
   window widths across launches 3-4. Unexplained; `tauri.conf.json` has `resizable: true`.
   Worth a live check on its own.

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log` ("Operator observation",
"Operator improvement requests", "G4 attempt-2 BLOCKED", "G5 attempt-1").

## Resolution (2026-10-11, quick 261011-txc)

1. Everything else lists only verbs no tier above shows when not searching; search stays
   catalog-wide (`eef7f6918`).
2. Every row shows its verb id beside the title (`432689f0c`).
3. An errored row is tickable, selected outranks errored, Retry kept (`432689f0c`).
4. The leaked 3em section padding-top is released, the tab's 0.75em gap spaces the groups
   (`eef7f6918`).
5. New collapsed Installed group after Suggested (`eef7f6918`).
6. Suggested is a disclosure, expanded by default (`eef7f6918`).
7. The dock paints opaque with a top divider above the sticky search, 45-UAT item 13 annotated,
   re-capture owed at the next 45-12 run (`eef7f6918`).
8. Kept, recorded: `Done` is this run's live feedback, `Installed` is the steady state, both stay.
   No code change.
9. Split to `.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md`.

Nothing here is live-verified: items 1-7 owe a look at the next 45-12 run.
