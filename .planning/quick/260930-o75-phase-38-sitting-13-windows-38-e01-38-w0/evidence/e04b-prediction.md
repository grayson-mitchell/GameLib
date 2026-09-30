# 38-E04 branch (b), Windows WebView2 drag-resize: pre-registered criteria

Written 2026-09-30, sitting 13, BEFORE the drag run. Host: Windows 11, DPI 120 (1.25).

**Harness:** spike 027 `app/`, with ONE change made for this branch. The panel's slot sync now uses
the shipped app's `useStoreEmbedHost.ts` `scheduleFlush` (a leading-edge throttle with a trailing
flush, 40 ms) instead of the harness's pure trailing debounce. That debounce is the exact defect
plan 40-11's live gate found, and it would make any continuous drag lag by construction. 38-E01 was
scored on the unmodified source before this edit.

**Instruments:**
- `hwnd_sampler.ps1 -NoShots` at the fastest loop the host allows. It records, per change, the
  top-level client size and the embed `WRY_WEBVIEW` container rect (physical px).
- The operator's eyes, for tearing and stale frames. That is the item's own wording ("no visible
  lag, tearing, or stale-geometry frames").

**Derived measures:**
- M1, tracking during motion: over the drag interval, the gap in ms between consecutive changes to
  the embed container rect while the client size is changing. A throttle working as intended gives
  about 40–80 ms (the interval plus IPC). A debounce-style stall would show gaps of hundreds of ms
  or more.
- M2, settle: the time from the last client-size change to the last embed-rect change. Expected
  under about 150 ms.
- M3, overflow: samples where the embed container extends past the client area (right or bottom
  edge beyond clientW/clientH). This is stale geometry that is visible while shrinking. It is
  recorded; brief transient overflow while shrinking is inherent to any async sync and is only a
  FAIL if the operator sees it as a visible artefact.

**PASS** needs the operator to report no visible lag, tearing or stale frames, AND a median M1
≤ 100 ms, AND M2 ≤ 250 ms. Otherwise it is FAIL, with the numbers.

**Claim limit:** the spike harness, not the shipped app (the shipped app does not compile the embed
for Windows). One host, one DPI. This scores branch (b) only, and 38-E04 stays OPEN for branch (a),
other macOS hardware, and branch (c), the unbuilt Linux layout.
