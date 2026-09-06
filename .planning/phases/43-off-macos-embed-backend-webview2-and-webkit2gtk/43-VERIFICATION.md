---
phase: 43-off-macos-embed-backend-webview2-and-webkit2gtk
verified: null
status: human_needed
score: N/A — collection ledger inside an implementation phase, no must-haves yet. 4 items as of 2026-09-06 (plan 38-01, Task 2): 38-E01, 38-E02, 38-E03, 38-E04 relocated from Phase 38. Confirmed at the tool: `audit-uat` reports by_phase["43"] == 4.
audit_tool_note: >
  `status` MUST stay `human_needed`. `gsd-sdk query audit-uat` admits a VERIFICATION.md when
  status is `human_needed` OR `gaps_found`, but `parseVerificationItems` only emits items when
  status === 'human_needed' — so `gaps_found` is admitted and then always yields ZERO items, and
  the phase disappears from the audit entirely. Verified live on Phase 34.1 (2026-08-13):
  switching that field dropped it from 10 open items to 0. The tool also counts EVERY entry in
  `human_verification` regardless of any `result:` field, so a discharged item must be MOVED to
  `human_verification_discharged` rather than annotated in place. Both failure modes are silent.

  THE `id:` FIELD DOES NOT SURVIVE INTO THE AUDIT OUTPUT. `audit-uat` emits each item with a
  POSITIONAL integer as `test:` and the `test:` prose as `name`; the `id:` is dropped entirely, so
  there is no key to join the audit back to this file except the prose. Positions do not track
  ids, because this array is in ARRIVAL order, not id order. CROSS-REFERENCE BY THE `test:`
  PROSE, NEVER BY POSITION, and never quote an audit position as if it were an ID.

  THIRD FAILURE MODE — THE PHANTOM-ITEM HAZARD (recorded in STATE.md under quick `260823-pzq`):
  with `status: human_needed` and an EMPTY `human_verification` array, `parseVerificationItems`
  falls through to a BODY SCRAPE looking for a `## human_verification` heading and reports that
  section's table rows as PHANTOM items. A phase enters the report only when `items.length > 0`.
  This file therefore carries NO `## human_verification` (or `## Human Verification`) heading
  anywhere in its prose body, by construction, so it stays correctly invisible to the audit until
  items are populated — that is the intended intermediate state while `human_verification: []`,
  not a defect.
purpose: >
  An implementation phase, not a pure collection phase: its work is to widen
  `src-tauri/Cargo.toml`'s `[target.'cfg(target_os = "macos")'.dependencies]` table (the table
  carrying the `unstable` feature that enables `Window::add_child`) so the in-app store/wiki
  embed code path exists on Windows (WebView2/wry) and Linux (webkit2gtk/wry), and only then
  answer `38-E01` through `38-E04` — the four questions relocated here from Phase 38 on
  2026-09-06 (plan `38-01`), per relocation rule (1): the destination must exist in ROADMAP.md
  BEFORE anything is relocated into it.

  FOR THE PHASE 43 PLANNER: planning this phase converts `38-E01`/`38-E02` (does `add_child` work
  at all on the Windows/Linux wry backends) into requirements — they are implementation tasks
  before they are verification tasks, per Phase 38's D-38-09. `38-E03`/`38-E04` (retina/HiDPI at
  scale_factor 2.0, and drag-resize latency, on hardware/backends other than the single macOS
  host Phase 40's plan `40-11` verified) remain human-verification items behind those
  requirements — they cannot be observed until the Windows/Linux embed code path exists at all.
created: 2026-09-06
relocation_rules: >
  Inherited in substance from `38-VERIFICATION.md`, which minted them:
  (1) The destination must exist in ROADMAP.md BEFORE an item is relocated into it — Phase 34.9
  routed 8 items to a phase that never existed and every gate read green.
  (2) Every item names a `platform_gate` as a source-level expression, never a prose blocker.
  (3) Relocation is two-way: the origin phase keeps a `human_verification_relocated` receipt
  naming this phase and the item ID, and every item here names its origin.
  (4) Items are split at their branch boundary, never compounded. A compound item resolves to a
  single pass/fail and the un-run half disappears.

human_verification:
  - id: "38-E01"
    test: "Windows backend feasibility — does `Window::add_child` (the Tauri API GameLib's in-app store/wiki embed calls, behind the `unstable` cargo feature) actually work on the Windows WebView2 wry backend the way it does on macOS's WKWebView backend?"
    expected: "A child webview can be attached to a parent `Window` on Windows via `add_child`, sized/positioned to a slot rect, and receives ResizeObserver-visible geometry updates the same way the macOS implementation does — OR a documented, named reason it cannot (a different API shape, a missing capability, a WebView2-specific limitation)."
    why_human: "There is no code path to observe yet, on any host: `src-tauri/Cargo.toml` gates the `unstable` feature (and therefore every `add_child` call site) inside `[target.'cfg(target_os = \"macos\")'.dependencies]`. This is not a case of existing behaviour that only a Windows machine can render — the feature is compiled out entirely for non-macOS targets. Resolving this item means first landing a Windows-gated `add_child` implementation, then verifying it on real WebView2, which is why it is filed as a NAMED UNKNOWN (D-04) rather than a pending observation."
    blocked_by: "no Windows implementation exists yet -- this is an implementation task before it is a verification task; the machine (owned, available) is not the blocker"
    platform_gate: "src-tauri/Cargo.toml — the `unstable` feature enabling `Window::add_child` sits under `[target.'cfg(target_os = \"macos\")'.dependencies]`; on any non-macOS target build the dependency, and therefore the embed code path, does not exist."
    origin_phase: "40"
    origin_item: "40-10 Task 2 (D-04)"
    prior_state: >
      Never attempted on any platform other than macOS. Phase 40 (this item's origin) scoped the
      live embed to macOS only for its entire 7-wave plan; D-03 target-gates the `unstable` feature
      accordingly. Plan 40-11's live hardware gate (wave 7) verifies the macOS implementation only
      and does not touch this item — see 38-E03/38-E04 for the two sub-questions plan 40-11 DOES
      overlap, and the anti-conflation note on both explaining why even a full macOS PASS there
      does not close this Windows-specific item.
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 43 on 2026-09-06 by plan 38-01 under D-38-09, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-E02"
    test: "Linux backend feasibility — does `Window::add_child` work on the Linux webkit2gtk wry backend the way it does on macOS's WKWebView backend?"
    expected: "A child webview can be attached to a parent `Window` on Linux via `add_child`, sized/positioned to a slot rect, and receives ResizeObserver-visible geometry updates the same way the macOS implementation does — OR a documented, named reason it cannot (a webkit2gtk API gap, a windowing-system limitation under X11 vs Wayland, or similar)."
    why_human: "Same structural gap as 38-E01: `src-tauri/Cargo.toml` gates the `unstable` feature (and every `add_child` call site) to `cfg(target_os = \"macos\")`, so no Linux code path exists to observe yet. Resolving this item means landing a Linux-gated implementation first, then verifying it on real webkit2gtk (and ideally both X11 and Wayland), which is why it is filed as a NAMED UNKNOWN (D-04) rather than a pending observation."
    blocked_by: "no Linux implementation exists yet -- this is an implementation task before it is a verification task; the machine (owned, available) is not the blocker"
    platform_gate: "src-tauri/Cargo.toml — the `unstable` feature enabling `Window::add_child` sits under `[target.'cfg(target_os = \"macos\")'.dependencies]`; on any non-macOS target build the dependency, and therefore the embed code path, does not exist."
    origin_phase: "40"
    origin_item: "40-10 Task 2 (D-04)"
    prior_state: >
      Never attempted on any platform other than macOS, for the same reason as 38-E01. Plan
      40-11's live hardware gate (wave 7) verifies the macOS implementation only and does not
      touch this item.
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 43 on 2026-09-06 by plan 38-01 under D-38-09, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-E03"
    test: "Retina/HiDPI behaviour of the embedded child webview at a display `scale_factor` of 2.0, on hardware/scaling configurations other than the specific Apple Silicon Retina display plan 40-11 verifies against."
    expected: "The embed's slot geometry, ResizeObserver-driven resize, and rendered content stay pixel-crisp and correctly positioned at scale_factor 2.0 on the widest reasonable set of displays and OS scaling settings — Windows/Linux HiDPI (which use different scaling models than macOS Retina), external displays, and mixed-DPI multi-monitor setups."
    why_human: "Requires physical displays and OS scaling configurations plan 40-11 does not cover. Plan 40-11's live gate (Item 1 in its `40-LIVE-GATE.md`) tests suppression/geometry at scale_factor 2.0 on ONE macOS Retina configuration; it cannot speak to Windows/Linux HiDPI scaling models (which differ mechanically from macOS's) or to other physical displays."
    blocked_by: "machine switch + display availability -- boot the Windows or Linux machine, and/or test against additional physical displays beyond the one plan 40-11 verifies"
    platform_gate: "src-tauri — the `unstable` `Window::add_child` feature is macOS-only (see 38-E01/38-E02), so the Windows/Linux side of this question is additionally blocked on those items landing first; the display-variety side is orthogonal and can be tested on macOS today."
    origin_phase: "40"
    origin_item: "40-10 Task 2 (D-04); coordinates with plan 40-11's live gate Item 1"
    prior_state: >
      ANTI-CONFLATION NOTE (required by 40-11-PLAN.md lines 92-95): plan 40-11 verifies retina
      behaviour at scale_factor 2.0 on macOS hardware only. A PASS on that gate does NOT close
      this item — this item covers the Windows/Linux and additional-display cases 40-11 does not
      reach. 40-11's own `40-LIVE-GATE.md` artifact carries the matching statement from its side,
      so the non-closure is recorded in both places per relocation_rules (3).
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 43 on 2026-09-06 by plan 38-01 under D-38-09, reason "one host
      per item; Phase 38 retains Windows plus controller only".
  - id: "38-E04"
    test: "Drag-resize latency of the embedded child webview's slot, on hardware/backends other than the macOS host plan 40-11 verifies against."
    expected: "Resizing the window (and therefore the embed's slot) via drag stays responsive — no visible lag, tearing, or stale-geometry frames — on Windows WebView2 and Linux webkit2gtk once those backends exist, and under any additional macOS hardware configurations not covered by 40-11's single test host."
    why_human: "Requires the Windows/Linux backends to exist first (see 38-E01/38-E02) and then a live drag-resize gesture on that hardware; plan 40-11's live gate (Item 3 in its `40-LIVE-GATE.md`) measures this on macOS only, on one test host."
    blocked_by: "no Windows/Linux implementation exists yet (see 38-E01/38-E02); the macOS-hardware-variety side is a machine-switch/additional-hardware cost only"
    platform_gate: "src-tauri — the `unstable` `Window::add_child` feature is macOS-only (see 38-E01/38-E02); drag-resize latency on Windows/Linux cannot be measured until those backends land."
    origin_phase: "40"
    origin_item: "40-10 Task 2 (D-04); coordinates with plan 40-11's live gate Item 3"
    prior_state: >
      ANTI-CONFLATION NOTE (required by 40-11-PLAN.md lines 92-95): plan 40-11 measures
      drag-resize latency on one macOS test host. A PASS on that gate does NOT close this item —
      this item covers the Windows/Linux backends (which do not exist yet) and any additional
      macOS hardware configurations 40-11 does not reach. 40-11's own `40-LIVE-GATE.md` artifact
      carries the matching statement from its side, per relocation_rules (3).
    relocation_history: >
      Filed in Phase 38 on its original date (see origin_phase/origin_item above);
      relocated to Phase 43 on 2026-09-06 by plan 38-01 under D-38-09, reason "one host
      per item; Phase 38 retains Windows plus controller only".

human_verification_discharged: []
---

# Phase 43 — Off-macOS embed backend (Windows WebView2 and Linux webkit2gtk)

This phase widens the in-app store/wiki embed (`Window::add_child`, gated `unstable` in
`src-tauri/Cargo.toml`) past its current macOS-only target gate, then answers the four
verification items that depend on that work existing.

**The frontmatter above is the source of truth**, because it is what `gsd-sdk query audit-uat`
reads. This prose section is for narrative only; never record a result here alone.

## How to close an item

1. Run it and record the observation with a verbatim artifact — a log line, not a recollection.
   Prefer instrumenting the branch under test and reading the emitted value over asking an
   operator what they saw.
2. **Prove the branch was armed** before recording a pass. An item whose gate never executed is
   indistinguishable, in every green result, from one that passed.
3. Move the entry from `human_verification` to `human_verification_discharged`. Do not annotate
   it in place — the audit counts array membership and ignores any `result:` field.
4. Update the origin phase's `human_verification_relocated` receipt with the outcome, so the
   origin's record does not rot. A park is a promise with no receipt unless someone walks back.

## Adding to this phase

Append to `human_verification` with an `id`, an `origin_phase`, an `origin_item`, and a
`platform_gate` written as a source-level expression. Leave the matching
`human_verification_relocated` receipt in the origin phase in the same change — one-way
relocation is how items get orphaned.
