---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 11
subsystem: verification
tags: [live-gate, human-verify, macos, tauri, webview, phase-38-ledger, pixel-measurement]

requires:
  - phase: 40-03
    provides: the suppression context and its two consumer hooks, the surface D-33's gesture exercises
  - phase: 40-04
    provides: the placeholder the embed is replaced by while suppressed
  - phase: 40-07
    provides: the Rust store_embed_* commands the gesture drives
  - phase: 40-08
    provides: the renderer-side geometry sync (single writer, D-18) this gate found a defect in
  - phase: 40-09
    provides: the store embed host wiring under test
  - phase: 40-10
    provides: the forward half of the 38-E03/38-E04 non-closure, and the /store/epic embed gate that put Epic out of this run's scope
provides:
  - "40-LIVE-GATE.md: a pre-authored contract with three recorded RESULTs from a run on real macOS hardware"
  - "A pixel-measured geometry claim for the D-33 suppression gesture (0 px delta), not an eyeballed one"
  - "Verbatim operator verdicts for input/scroll feel and drag-resize latency"
  - "The return half of the 38-E03/38-E04 non-closure, in ROADMAP.md's Phase 38 section"
  - "A named boundary list: six things this run does NOT establish, each with the queue that owns it"
affects: [38-verification, 40-verification]

tech-stack:
  added: []
  patterns:
    - "Author-runner separation: the contract is written before the run by an agent that is forbidden to fill in any verdict, so it cannot grade its own homework"
    - "Pixel measurement by edge-energy profile (Pillow, isolated venv) as the geometry evidence, replacing visual judgement"
    - "A failing item is fixed and re-run, with the original FAIL retained in full rather than overwritten"

key-files:
  created:
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-LIVE-GATE.md
    - .planning/todos/completed/2026-09-05-store-embed-lags-window-during-fast-drag-resize.md
  modified:
    - .planning/ROADMAP.md
    - meta/fixtures/store-embed-wire-args.json
    - src/backend/sidecar/storeEmbedFlowRegistration.ts
    - src/frontend/screens/WebView/useStoreEmbedHost.ts

key-decisions:
  - "Retained Item 3's original FAIL in full alongside its PASS-on-re-run, rather than replacing it: a re-run passing does not make the failure not have happened, and a reader must not be able to mistake this for a clean first pass"
  - "Recorded the scale-factor discrepancy (measured at 2.0; the spike tolerance was derived at 1.0) instead of silently applying the tolerance -- and used it as an explicit reason 38-E03 stays open despite a PASS"
  - "Filed the drag-resize failure as a todo with an owner and FIXED it, rather than shipping the phase with the failure written up as a caveat on a pass"
  - "Recorded the uncaptured screen recordings for Items 2 and 3 as a named evidence gap rather than omitting them silently, since neither item's PASS CONDITION depends on one"
  - "Wrote the non-closure in both directions (gate artifact and ROADMAP) so a reader finding either document learns it, rather than depending on them finding the other"

requirements-completed: [REQ-40-13]

duration: ~3h across four launches (two blocked/aborted, two scoring), plus the fix cycle for Item 3
completed: 2026-09-05
---

# Phase 40 Plan 11: Live Gate — Embedded Store Suppression, Feel, and Resize (macOS) Summary

**The gate passed 3/3 on real macOS hardware, and it earned its keep: it found three defects that ~1,647 tests and eight planning gates had all missed, one of which made every store tab blank in a packaged build.**

## The three results

| Item | Result | Evidence |
|---|---|---|
| 1 — D-33 suppression gesture | **PASS** | Slot rect measured at origin (204, 82) logical, 1076x718 logical, identical across captures A/B/C — **0 px delta**, exact. All four pass conditions met. Hit-test verified separately from paint. |
| 2 — Input and scroll feel | **PASS** | Operator verdict, all four sub-gestures exercised (scroll, click, typing, trackpad momentum). |
| 3 — Drag-resize latency | **PASS on re-run** | Originally **FAIL**. Fixed in `b4517366e`, re-run, operator verdict reversed. |

### Item 1 — measured, not eyeballed

Programmatic pixel measurement over the PNGs with Pillow 12.3.0 in an isolated venv: vertical and horizontal edge-energy profiles to locate the slot boundary, then a single-row/single-column argmax to resolve the edge to exactly 1 physical px. Not a Preview ruler pass.

The slot's TOP edge measured y=164 physical and its LEFT edge x=408 physical in captures A, B **and** C — a **0 px delta**, so the one-logical-pixel tolerance was never actually exercised.

**Hit-test verified separately from paint.** WKWebView will not paint a visible child of a hidden ancestor yet still hit-tests it, so "embed not visible" alone cannot distinguish a correctly hidden subview from an invisible one still swallowing input. The operator clicked inside the placeholder region while the dialog was open; the dialog dismissed and the embed re-showed, proving the click reached the scrim rather than a hidden-but-live embed. That also exercised the suppression RELEASE path a second time by a different route.

**Recorded discrepancy.** The tolerance is justified by spike measurements taken at scale factor **1.0**; this run measured at **2.0**. Recorded rather than silently applied. It did not affect the result — the delta was 0 px, so no rounding behaviour was exercised in either direction — and that same fact is why the item does not close `38-E03`.

**Incidental observation, not folded into the verdict.** The top nav bar's glyphs render exactly 1 logical px higher in capture C than in capture A: identical x-spans, identical bright-pixel counts (3968 in both), i.e. a pure translation, not a re-render, and the nav container's own bottom edge is y=122 in both. Not a layout shift and not in the embed. It was invisible to the eye and found only by measurement — which is precisely why this contract forbids eyeballing geometry.

### Items 2 and 3 — the operator's own words

Item 2, verbatim: **"scroll and click feel fine"**, and after the fuller pass, **"typing works, momentum fine"**.

Item 3's original FAIL, verbatim: **"resize lags behind. tested with browser. the difference is that in browser is smooth on mouse move, whilst in gamelib is resized only on mouse stopping or maybe being quite slow movement."**

Item 3 after the fix, verbatim: **"resize is smooth now, tracks like the browser."**

Note the shape of Item 3's history. The operator's *earlier* report in the same session was "resize is smooth" — the FAIL came from the same person reversing themselves once the gesture was run in the shape the item specifies (fast, continuous motion, compared against a real browser). A less specific item would have recorded the first answer and shipped the defect.

## What the gate caught

Three defects, none visible to any automated check:

1. **`store_embed_open:bad-args` — every embed call rejected.** The sidecar sent positional arrays; the Rust side parsed objects. Store tabs were blank in a packaged build. This blocked the gate's first attempt entirely (no verdict recorded, embed never opened) and is written up in the artifact's BLOCKED RUN section. Fixed with a shared fixture (`meta/fixtures/store-embed-wire-args.json`) now asserted from *both* sides, including a regression test that the positional shape is rejected.
2. **The drag-resize lag** (Item 3's FAIL), diagnosed as a pure trailing-edge debounce: `clearTimeout` and re-arm on every tick means `flush()` never runs during continuous motion. Replaced with a leading-edge throttle at a fixed 40 ms interval. `flush()` is untouched and remains the only `getBoundingClientRect()` call site, so D-18's single-writer rule is preserved.
3. **The 1 px glyph translation** above — real, benign, and undetectable by eye.

**Why the existing suite was blind to the resize defect.** Mutating the fix back to the debounce sends the new regression test to **zero** sends while the pre-existing coalescing test still **passes**. Every prior test advanced timers past the window and asserted the settled result; none modelled motion. The suite was not merely silent about the bug, it was structurally incapable of seeing it.

**Why the suite was blind to the wire mismatch.** `storeEmbedFlows.test.ts` drives the real transport into a JS test handler — a real transport with a fake counterparty — and two of its assertions had *pinned the broken shape*. The Rust parsers had no tests at all.

## Boundaries — what this run does NOT establish

Six items, each with a queue owner, recorded in the artifact's "What this run establishes, and what it does not" section:

| Not established | Owner |
|---|---|
| Retina/HiDPI geometry at any scale factor other than 2.0, or at 2.0 on any other host | `38-E03` |
| Drag-resize latency on any other hardware or backend | `38-E04` |
| Whether `Window::add_child` works on the Windows WebView2 backend | `38-E01` |
| The same for the Linux webkit2gtk backend | `38-E02` |
| Epic's posture inside an embed | Spike `024`, status PLANNED |
| Anything a screen recording of Items 2 or 3 would have shown | This artifact's own Items 2 and 3 |

`38-E01`/`38-E02` are untouched for a stronger reason than "untested": `src-tauri/Cargo.toml` target-gates the `unstable` feature to `cfg(target_os = "macos")`, so no Windows or Linux code path exists for any gate to exercise.

**The phase does not ship with a known failure.** Item 3's FAIL was fixed, not caveated — a todo was filed against it, the defect was fixed, and the item was re-run on hardware with the operator's verdict reversing. Had it stayed red, the artifact would say so in those words instead.

## The non-closure, recorded in both directions

`40-10` wrote the forward half before the gate ran, predicting `38-E03`/`38-E04` would not close on it. Task 3 wrote the return half into ROADMAP.md's Phase 38 section, recording that the prediction held: the gate passed 3/3 and **both items remain OPEN**, with the specific reason each survives a passing gate. The gate artifact carries the same statement from its own side. A reader who finds either document learns the non-closure without having to find the other.

## Environment

Built from `54ca5b400` (Items 1 and 2) and `b4517366e` (Item 3's re-run) via `pnpm exec vite build && pnpm build:sidecar-sea && pnpm build:decompress-worker-dev && pnpm exec tauri build --bundles app`. macOS 26.5.2. Backing scale factor **2.0 exactly** (2560x1600 physical capture of a 1280x800 logical window). Session directory `/tmp/gamelib-gate-20260904T183948Z`.

**Single-instance asserted at all three points** on every scoring launch — empty pre-launch, exactly 1 at window appearance, exactly 1 at teardown, 0 after `pkill` with no orphaned node sidecar. This matters because the dev command exits 0 without replacing a running instance, so a gate can otherwise be served by a stale process.

Captures, all window-targeted by id, none a dotfile, none full-screen: `item1-capture-A.png` (3,683,752 B), `item1-capture-B-overlay.png` (622,923 B), `item1-capture-C.png` (3,632,333 B). Both sinks archived per the dual-sink standard: `terminal.log` plus four per-launch `gamelib-launch-N.log` files.

## Deviations

- **CONTRACT CORRECTION 1** — the contract prescribed launching `bundle/macos/GameLib.app`, but `tauri build` *cleans* that directory after rolling the DMG, so the prescribed binary did not exist. Corrected to `--bundles app` and recorded in the artifact rather than silently substituted.
- **A BLOCKED first attempt** at `c78ff3d30` is recorded as its own section with no verdict, since the embed never opened. No item's evidence is drawn from it.
- **Item 3's fix was made mid-gate**, which is a deviation from a clean "run and record" shape. It is recorded as such: the FAIL stands in the artifact, the fix commit is named, and the PASS is labelled "PASS on re-run" in the frontmatter, the item and the verdict summary alike.

## Known-outstanding, not blocking this plan

- `pnpm lint` is red at 4159 warnings against a `--max-warnings 4157` ratchet. Verified **pre-existing** at `c78ff3d30` against a stashed tree with a cleared `.eslintcache`, so it is not from this plan's commits. Several Phase 40 summaries reported it green at exactly 4157; `eslint --cache` serving stale counts is the plausible explanation and is worth confirming.
- The five `webview.unavailable.*` keys minted by `40-10` are **en 5/5, de/fr 1/5**. The machine-fill never ran (HTTP 401 on a placeholder API key).
- One test failed on an intermediate run and passed on re-run; its name was not captured.
