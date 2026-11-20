# Prediction pinned BEFORE any measurement — 2026-09-21, quick 260921-qru live gate

## The claim under test

With `7cc01a936`, a Dialog whose subtree contains `.logs-wrapper` now receives
`max-height: 80%` on its MUI Paper. Before the fix it received no height constraint at all from
`Dialog.tsx` (`:56` deliberately excludes the log case, `:59` was malformed).

## Arithmetic that makes a short viewport discriminating

- `LogSettings/index.css:5` sets `.logs-wrapper { height: 25em }`. At a 16px root that is **400px**,
  a FIXED height — this is what drives the dialog today.
- At a **500px-tall viewport**, `max-height: 80%` resolves to **400px**.
- The Paper also carries dialog chrome (header/title, close button, content padding, footer).
  So unfixed, Paper height should be ~400px of logs PLUS chrome = **materially more than 400px**.

## Predictions (pinned, falsifiable)

At a 500px-tall viewport, Settings dialog open on the Logs section:

| # | quantity | UNFIXED (`7cc01a936^`) | FIXED (`7cc01a936`) |
|---|---|---|---|
| P1 | `getComputedStyle(paper).maxHeight` | `none` (or a non-400px value) | **`400px`** |
| P2 | `paper.getBoundingClientRect().height` | **> 400px** | **<= 400px** |
| P3 | paper height vs viewport | exceeds 80% of 500px | at or under 80% |

## Controls that make this a result rather than a coincidence

- **C1 negative control.** The UNFIXED arm must be measured in the SAME harness at the SAME
  viewport. If both arms read the same, the harness is not sensitive to this rule and the FIXED
  reading proves nothing.
- **C2 sentinel / instrument-liveness.** A sibling declaration from the same `styled()` object that
  was NEVER broken — `borderRadius: '10px'` — must read `10px` in BOTH arms. If it reads empty, the
  probe is not looking at the right element and every other number is noise.
- **C3 selector-reachability.** `paper.querySelector('.logs-wrapper')` must be non-null in both
  arms, else the dialog under measurement is not the log dialog.

## Failure modes that would INVALIDATE the run (declare, do not explain away)

- The app does not boot under bare Vite (no Tauri IPC) and the Settings dialog never mounts.
- The Settings dialog mounts but `.logs-wrapper` is absent (wrong section).
- `maxHeight` reads `400px` in the UNFIXED arm too — would mean some OTHER rule supplies the cap
  and the paren was never the operative cause of anything.

## Scope limit, stated in advance

This measures the app's real React tree and emotion-injected styles in WebKit at a controlled
viewport. It does NOT run the Tauri shell, so anything depending on the Rust/sidecar IPC is absent.
If the dialog renders, that is sufficient for a CSS height question; if app state is needed to reach
the Logs section and IPC blocks it, this harness cannot close the gate and I say so.
