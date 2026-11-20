# Instrument Self-Proof -- Phase 38 branch-(a) macOS sitting

Generated 2026-09-30T18:19:27.903Z by `selfproof.mjs` (Task 2 of 261001-93f-PLAN.md).

**This artifact proves the INSTRUMENT, not the embed.** Every number below is about edgeprobe/analyze.mjs's own correctness against generated ground truth, or about a live environment capability of this machine. **No result for 38-E03 or 38-E04 appears anywhere in this file** — see `<verification>` in 261001-93f-PLAN.md.

## Arm 1 -- edge locator (synthetic, MUST pass)

Ran edgeprobe's own `selftest` subcommand: several internal synth configs (default, odd-column, border-adjacent, near-tolerance), each frame's located edge asserted to equal `truth.json` exactly.

Result: **PASS**
- frames: 21
- worst_error_px: 0
```json
{
  "configs": [
    {
      "frames": 6,
      "mismatches": 0,
      "name": "default"
    },
    {
      "frames": 6,
      "mismatches": 0,
      "name": "odd-column"
    },
    {
      "frames": 4,
      "mismatches": 0,
      "name": "border-adjacent"
    },
    {
      "frames": 5,
      "mismatches": 0,
      "name": "near-tolerance"
    }
  ],
  "mismatches": []
}
```

## Arm 2 -- lag discriminator (synthetic, MUST pass)

Generated a tracking sequence (--lag 0) and a lagging sequence (--lag 15) from the same --step, located every frame's edge with `edges`, reduced both with analyze.mjs's `reduceE04` (imported directly). Asserted the lagging sequence's excess-gap median exceeds the tracking sequence's by the injected lag, within Arm 1's measured resolution (tolerance 1px).

Result: **PASS**
- injected_lag_px: 15
- tolerance_px: 1
- tracking excess_gap_px median: 0
- lagging excess_gap_px median: 15
- observed_delta_px: 15
```json
{
  "tracking_reduced": {
    "samples": 12,
    "unresolved_count": 0,
    "cadence_ms": {
      "median": 50,
      "p90": 50,
      "max": 50,
      "samples": 11
    },
    "tracking_gap_ms": {
      "median": 50,
      "p90": 50,
      "max": 50,
      "samples": 11
    },
    "settle_ms": 0,
    "at_rest_gap_px": {
      "median": 0,
      "p90": 0,
      "max": 0,
      "samples": 1,
      "baseline_available": true,
      "baseline_used": 0
    },
    "excess_gap_px": {
      "median": 0,
      "p90": 0,
      "max": 0,
      "samples": 11
    }
  },
  "lagging_reduced": {
    "samples": 12,
    "unresolved_count": 0,
    "cadence_ms": {
      "median": 50,
      "p90": 50,
      "max": 50,
      "samples": 11
    },
    "tracking_gap_ms": {
      "median": 50,
      "p90": 150,
      "max": 150,
      "samples": 9
    },
    "settle_ms": 0,
    "at_rest_gap_px": {
      "median": 0,
      "p90": 0,
      "max": 0,
      "samples": 1,
      "baseline_available": true,
      "baseline_used": 0
    },
    "excess_gap_px": {
      "median": 15,
      "p90": 15,
      "max": 15,
      "samples": 11
    }
  }
}
```

## Arm 3 -- unresolvable-sample reporting (synthetic, MUST pass)

Generated an all-background frame and an all-foreground frame (via `synth --width` override) and asserted `edges` reports `unresolved: true` with no `edge_px` for both.

Result: **PASS**
```json
{
  "all_background": {
    "bg_run_px": 200,
    "grad_max": 0,
    "reason": "entire band is background -- the embed is nowhere in this band",
    "samples": 200,
    "unresolved": true
  },
  "all_foreground": {
    "bg_run_px": 0,
    "grad_max": 0,
    "reason": "entire band is non-background -- no background reference near the right edge, the edge lies outside the captured band",
    "samples": 300,
    "unresolved": true
  }
}
```

## Arm 4 -- capture cadence and resolution limit (live, ENVIRONMENT-DEPENDENT)

Ran `edgeprobe sample` against a fixed 64x64 screen strip for 3 seconds with no gesture.

Result: **OK**
- samples: 43
- duration_ms: 2951.5581666231155
- unresolved_count: 43
- backend: screencapture
- cadence_ms:

```json
{
  "max": 141.24754166603088,
  "median": 66.73770833015442,
  "p90": 73.21566665172577
}
```

## Arm 5 -- window instrument (live, ENVIRONMENT-DEPENDENT)

Ran `edgeprobe winrect` against a running GUI application's pid (Finder or Dock, never GameLib -- the operator owns GameLib's lifecycle).

Result: **MISSING** — no on-screen layer-0 window found for pid 1356 -- if GameLib's Space is not frontmost this is expected and is the inactive-Space trap, not a real absence

## Limits

- **Cadence ceiling.** the achieved sample cadence measured here is median 66.73770833015442ms / p90 73.21566665172577ms / max 141.24754166603088ms over 43 samples. Any real resize frame shorter than this interval is invisible to the sampler between two consecutive captures -- the operator's own eyes cover that gap, per RUN-SHEET.md step 2's gesture requirement.
- **Pixel-only readback.** The embed's realised geometry is read from screen pixels, never from an RPC call, because `main.rs`'s RPC dispatch exposes no `store_embed_get_bounds` -- the embed is an `NSView` subview (`addSubview`), not a child window, so `CGWindowListCopyWindowInfo` sees the parent window but never the embed itself.
- **Widen-only lag visibility.** The sampler locates the embed's edge scanning inward from the window's right edge. A lag during WIDENING shows as a visible background gap between the embed's edge and the window's edge -- exactly what Arm 2 proves the reducer can see. A lag during SHRINKING instead leaves the embed overflowing past the window's new, smaller edge, where the window itself clips the overflow: the pixels show no gap because there is nothing past the window edge to capture. The instrument cannot see a shrink-direction lag; only a widen-direction one.
- **Inactive-Space hazard.** `CGWindowListCopyWindowInfo` readings are garbage whenever the app's Space is not the active one -- `kCGWindowIsOnscreen` goes absent or the window disappears from the list entirely. This is why every `sample` record and every `winrect` reading carries `onscreenFlagPresent`, and why RUN-SHEET.md step 0 activates the app's Space before any reading is trusted.

## Overall

Synthetic arms 1-3 (instrument correctness against generated ground truth): **ALL PASS**.
Live arms 4-5 (environment capability on this machine, right now): Arm 4 OK, Arm 5 MISSING.

No result for `38-E03` or `38-E04` exists anywhere in this file. This artifact describes the instrument, not the embed.
