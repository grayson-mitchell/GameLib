---
created: 2026-09-11
title: "Humble Keys row separator is effectively invisible in light themes (RGB delta 2 vs 108 in dark)"
area: humble-keys-ui
status: OPEN
severity: medium
platform: any
ready: code
source: "Phase 43 plan 43-10 Task 2 live gate, REQ-43-19 item 4, operator run 2026-09-11"
files:
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeyRow border-bottom, :214-224)
resolves_phase: null
---

## Problem

The Humble Keys row separator renders at wildly different contrast depending on theme. Measured
from packaged-build screenshot pixels, same 1.0 CSS px full-width line in every case:

| Theme background | Seam colour | Max channel delta vs neighbours | REQ-43-19 threshold ≥3 |
|---|---|---|---|
| dark `[20,23,41]` | `[128,128,128]` | **108–109** | PASS |
| dark `[26,28,33]` | `[31,33,38]`..`[43,46,50]` | **11–19** | PASS |
| light `[237,239,244]` | `[238,240,245]` | **2** | **FAIL** |

In light themes the separator is one step above the background and is, for practical purposes,
not there. The geometry is correct — the line paints, full width, at exactly 1.0 CSS px — it is
purely a colour-contrast failure.

The declaration is `border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.08))`. The
**fallback is white at 8% opacity**, which is a visible hairline over a dark background and
almost nothing over a light one. Either `--divider` is undefined in the light theme (so the
white fallback applies and washes out), or it is defined to a value with the same problem —
worth checking which before fixing, because the remedy differs.

This is exactly the multi-theme survival case GameLib's own styling rules call out: a colour
chosen against one background, shipped against all of them.

## Solution

Establish what `--divider` actually resolves to in the light themes (the measurement above says
the *rendered result* is delta 2; it does not by itself distinguish "token missing, fallback
applied" from "token defined badly").

- If the fallback is what is painting, the fix is to define `--divider` per theme rather than
  relying on a white-biased default.
- A theme-agnostic alternative is a `color-mix()` against the surface colour, or a token pair
  (`--divider-on-light` / `--divider-on-dark`).

Do not fix by darkening the single value — that just moves the failure to the dark themes.

Verification should re-measure the seam delta in at least one light and one dark theme and
require ≥3/255 in both, which is the threshold `43-LIVE-GATE.md` item 4 already defines.

## Related

- Found by the REQ-43-19 gate, which scored item 4 PASS in two dark themes and FAIL in light.
  The absence-after-last-row half PASSED and is unaffected.
- `43-LIVE-GATE.md` § Verdict carries the full measurement.
