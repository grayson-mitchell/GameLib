# Store embed lags the window during a fast drag-resize (40 ms trailing debounce)

**Found:** 2026-09-05, Phase 40 plan `40-11` live gate, Item 3. **Verdict: FAIL.**
**Commit under test:** `54ca5b400` (macOS 26.5.2, backing scale 2.0)
**Evidence:** `.planning/phases/40-.../40-LIVE-GATE.md` Item 3; session
`/tmp/gamelib-gate-20260904T183948Z`

## Symptom (operator's verbatim words)

"resize lags behind. tested with browser. the difference is that in browser is smooth on mouse
move, whilst in gamelib is resized only on mouse stopping or maybe being quite slow movement."

The browser A/B on the same hardware is the load-bearing part: the lag is NOT an inherent cost of
resizing a native web surface on this machine.

## Cause (diagnosed, not inferred)

`src/frontend/screens/WebView/useStoreEmbedHost.ts`:

    const scheduleFlush = () => {
      if (debounceHandle !== null) clearTimeout(debounceHandle)   // every tick RESTARTS the timer
      debounceHandle = setTimeout(flush, BOUNDS_SYNC_DEBOUNCE_MS) // 40
    }
    const observer = new ResizeObserver(scheduleFlush)

A pure trailing-edge debounce: every `ResizeObserver` tick cancels the pending flush, so during a
continuous drag `flush()` never runs until the drag pauses for 40 ms. No leading-edge call and no
max-wait ceiling exist anywhere in the file (grep-confirmed). A SLOW drag leaves inter-tick gaps
longer than 40 ms and therefore looks smooth — which is why the operator's first report on this
item was "resize is smooth", before running it wider/narrower and slow/fast as the item specifies.

## This is a design limitation, not a coding error

The 40 ms debounce is implemented exactly as specified and its comment cites spike 017's
`tauri-embedded-store-browser.md` "Bounds sync": "ResizeObserver on the slot div, debounced ~40 ms".
The spike measured a bounds-sync INTERVAL. It never evaluated drag-resize latency — deliberately
left open, per `MANIFEST.md`'s "Open before shipping" bullet and ledger item `38-E04`. This gate is
the FIRST time that question was answered on hardware, and the answer is that the specified design
lags visibly under a fast drag.

## Why no fix was attempted mid-gate

Each flush is an IPC round-trip (renderer -> sidecar -> Rust), which is the reason the debounce
exists at all. Choosing among: leading-edge + max-wait throttle; a rAF-driven sync; or a Rust-side
follow that repositions the child without a renderer round-trip — is a real design decision with
different cost/smoothness trade-offs. It needs deciding, not patching under a running gate.

Whatever is chosen must preserve **D-18's single-writer rule**: the renderer stays the ONLY owner of
the embed's geometry. Two writers silently last-write-wins with no error (spike 017). A Rust-side
follow is the option most at risk of violating this and needs the most care.

## Relationship to 38-E04

`38-E04` covers drag-resize latency on hardware/backends OTHER than this macOS host, and does NOT
close on this gate. This finding is the macOS-host answer; `38-E04` remains open for everything else.

---

## RESOLVED — 2026-09-05, commit `b4517366e`

Fixed by replacing the trailing-edge debounce with a **leading-edge throttle + max-wait + trailing
flush**, keeping spike 017's 40 ms interval and D-18's single-writer rule intact (`flush()` remains
the only rect reader; no fallback rect anywhere, including the null-ref path).

Verified on real macOS hardware, live gate launch 4. Operator's verbatim verdict:
**"resize is smooth now, tracks like the browser."** The same browser A/B that detected the defect
was used to confirm the fix, and the operator confirmed a MATCH rather than merely an improvement —
so the 40 ms interval needs no retune.

Regression coverage: `useStoreEmbedHost.test.tsx` Property `3b` models sustained motion (20 ticks,
10 ms apart, never pausing) and asserts sends occur DURING the drag. Mutation-proven: restoring the
debounce drives it to ZERO sends. Property 3 (the pre-existing coalescing test) still PASSES under
that same mutation — which is exactly why the original suite was green over a visible defect, and
the reason 3b had to be written rather than relying on the existing one.

`38-E04` (drag-resize latency on hardware/backends other than this macOS host) remains OPEN and does
NOT close on this fix.
