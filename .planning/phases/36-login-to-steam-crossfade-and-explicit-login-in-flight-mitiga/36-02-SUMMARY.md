---
phase: 36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga
plan: 02
subsystem: docs/threat-register
tags: [threat-register, requirements, documentation-only, append-and-supersede, T-34.4.2-39, T-34.4.2-41]

dependency-graph:
  requires:
    - phase: 36-01
      provides: "the shipped loginInFlight guard mechanism this plan documents (co-mounted overlay, three-layer guard, crossfade), verified against real source before writing"
  provides:
    - "Fourteenth update to 34.4.2-PLATFORM-SCOPE.md §5 recording T-34.4.2-39/-41's basis change"
    - "Forward pointer on Truth 8 in 34.4.2-VERIFICATION.md"
    - "REQ-36-01..05 minted in REQUIREMENTS.md"
  affects:
    - ".planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md"
    - ".planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-VERIFICATION.md"
    - ".planning/REQUIREMENTS.md"

tech-stack:
  added: []
  patterns:
    - "append-and-supersede threat register convention (Fourteenth ordinal, prior 13 byte-unchanged)"
    - "additive-only forward pointer on a closed gate's locked scorecard, never editing the verdict"

key-files:
  created:
    - .planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/36-02-SUMMARY.md
  modified:
    - .planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md
    - .planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-VERIFICATION.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Fourteenth was confirmed as the next free ordinal by re-reading the tail of §5 before writing, not trusted from the plan's own prose (this repo's ledgered stale-init-snapshot lesson)"
  - "REQ-36-02 and REQ-36-03 are minted UNTICKED — 36-VALIDATION.md's own Manual-Only table scores both against plan 36-03's not-yet-run BLOCKING human gate; ticking them now would tick on intention, which this repo's own T-34.9-37 lesson forbids"
  - "REQ-36-01 and REQ-36-04 are minted TICKED — neither carries a live-gate row in 36-VALIDATION.md and both are fully discharged by plan 36-01's own mutation-proven automated gates"
  - "ROADMAP.md was left untouched — its Phase 36 Requirements/Plans lines already matched the five minted IDs exactly, verified by diff before deciding not to write"
  - "Live discharge for T-34.4.2-39/-41's original item-5 contract was NOT reopened, per the operator's documentation-only resolution of 36-RESEARCH.md Open Question 1 — recorded as a deliberate non-goal inside the Fourteenth update's own narrative preamble"

requirements-completed: [REQ-36-05]

metrics:
  duration: ~35min
  completed: 2026-08-20
---

# Phase 36 Plan 02: Threat-register basis change and requirement minting Summary

Records, in the living 34.4.2 threat register, that T-34.4.2-39/-41's UI-pinned mitigation basis moved from an incidental route-unmount to plan 36-01's explicit three-layer `loginInFlight` guard — disposition unchanged, still WITHDRAWN from live discharge — and mints REQ-36-01..05 in REQUIREMENTS.md, with REQ-36-02/03 deliberately left unticked pending plan 36-03's live gate.

## What Was Built

**Task 1** (`530fc4575`) — Appended the **Fourteenth update** to `34.4.2-PLATFORM-SCOPE.md` §5, immediately before `## 6. Package legitimacy`. Before writing, re-confirmed the highest existing ordinal was still Thirteenth (verified via `grep -n` across §5, ordinals Second through Thirteenth all present, no concurrent-session collision). The narrative preamble states, in order: what changed mechanically (route-unmount retired, `SteamLogin` now a co-mounted overlay dismissed via callback), why it matters to these two threats (the unmount was the entire prior mitigation, per the pre-rewrite gate's own header), what replaced it (the explicit `loginInFlight` boolean feeding `disabled={oldMac || loginInFlight}` on all six tiles, consumed by `Runner.handleLogin()`'s `if (props.disabled) return` — confirmed by direct read of shipped source, not the plan's assumption — plus `pointer-events: none` and React-18 string-form `inert`), that the disposition itself is unchanged (still `mitigate`, still WITHDRAWN, still unit-proven + UI-pinned — only the basis changed), the deliberate non-goal (live discharge is no longer structurally foreclosed by the UI and is nonetheless not reopened this phase), and the honest limitation (the replacement gate is a `testEnvironment: 'node'` source-text gate that proves shape, never a real click). The table carries four rows: `T-34.4.2-39 / T-34.4.2-41` (basis-changed, disposition unchanged), `F-36-01 (NEW)` (Epic/SIDLogin hole — `accept, OPEN`), `F-36-02 (NEW)` (`inert` platform-floor gap on macOS 12.0-12.3 — `accept`), and `T-34.4.2-SC` (still CLOSED, no src changed). Closed with a bolded Summary sentence: no threat moves to a fresh CLOSED disposition, two new findings enter as accepted-and-open.

**Task 2** (`69aeefffb`) — Added an additive, clearly-marked forward-pointer blockquote immediately after Truth 8's Score paragraph in `34.4.2-VERIFICATION.md`, naming the Fourteenth update as the current living record and stating explicitly that Truth 8's own verdict and score are unchanged — the row itself was never touched. Minted REQ-36-01 through REQ-36-05 in `.planning/REQUIREMENTS.md` under a new "Phase 36" group, inserted after the last existing checkbox item (`REQ-34.11-17`, line 928) and before the traceability count block, following the established paragraph-then-checkboxes convention exactly. Verified `.planning/ROADMAP.md`'s Phase 36 `**Requirements**:` line and `**Plans:** 3 plans` count were already present and byte-identical to the five minted IDs (`git diff --stat` on ROADMAP.md is empty) — no edit was needed or made, consistent with the plan's own instruction to verify rather than rewrite.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues encountered. This is a pure documentation task; no `src`/`src-tauri/src` files were touched at any point (`git diff --stat -- src src-tauri/src` empty for both commits).

### Judgment calls not explicitly dictated by the plan

**1. [Not a deviation — plan silence resolved by cross-referencing 36-VALIDATION.md] REQ-36-02 and REQ-36-03 minted unticked**

The plan's Task 2 action text did not specify tick state for the five new checkboxes; it only said "mint these five" with body text. Rather than tick all five (which the plan's own body text, read literally, could support since plan 36-01 already shipped and gated the source), I cross-referenced `36-VALIDATION.md`'s own Per-Task Verification Map, which explicitly scores REQ-36-02 and REQ-36-03 against plan 36-03's BLOCKING human gate (`T1 | 36-03 | 3 | REQ-36-02, REQ-36-03 | ... | manual-only + full suite`). This repo has a ledgered lesson (T-34.9-37, and the whole 34.4.2/34.9 convention of leaving live-gated boxes unticked until a live PASS) against ticking a box on intention rather than measurement. REQ-36-01 and REQ-36-04 carry no such row in `36-VALIDATION.md` and are fully discharged by 36-01's own automated, mutation-proven gates, so those two are ticked. This is a plan-silence resolution, not a deviation from any stated instruction — flagged here for the record since a future reader comparing against the plan text alone might expect all five ticked.

## Verification (real output)

```
$ grep -c 'Fourteenth update' 34.4.2-PLATFORM-SCOPE.md
1
$ grep -c 'Thirteenth update' 34.4.2-PLATFORM-SCOPE.md
5
$ grep -c 'F-36-01\|F-36-02' 34.4.2-PLATFORM-SCOPE.md
4
$ grep -n '^## 6. Package legitimacy' 34.4.2-PLATFORM-SCOPE.md
996:## 6. Package legitimacy
$ grep -o 'REQ-36-0[1-5]' .planning/REQUIREMENTS.md | sort -u
REQ-36-01
REQ-36-02
REQ-36-03
REQ-36-04
REQ-36-05
$ grep -n 'Requirements\*\*: TBD' .planning/ROADMAP.md
(3 hits, none for Phase 36 — lines 1448/3531/3694 belong to phases 34.13/34.12/other)
$ git diff --stat -- src src-tauri/src
(empty)
```

All five `<verification>` checks from the plan and all four `<must_haves><artifacts>`/`<key_links>` entries pass.

## Known Stubs

None.

## Threat Flags

None. This plan is documentation-only — it introduces no new network endpoints, auth paths, file access patterns, or schema changes. Its own `<threat_model>` (T-36-07, T-36-08, T-36-09, T-36-SC) covers the only risk class present (misrecording a threat register / amending a closed gate), and all four are mitigated per the task actions above.

## Self-Check

- `.planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md` — FOUND, Fourteenth update present
- `.planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-VERIFICATION.md` — FOUND, forward pointer present, Truth 8 verdict untouched
- `.planning/REQUIREMENTS.md` — FOUND, REQ-36-01..05 present
- Commit `530fc4575` — FOUND in `git log`
- Commit `69aeefffb` — FOUND in `git log`

## Self-Check: PASSED
