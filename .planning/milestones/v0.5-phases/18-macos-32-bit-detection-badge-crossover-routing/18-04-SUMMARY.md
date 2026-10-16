---
phase: 18-macos-32-bit-detection-badge-crossover-routing
plan: 04
subsystem: ui
tags: [react, react-i18next, fontawesome, gamepage, mac-arch, badge, i18n]

# Dependency graph
requires:
  - phase: 18-macos-32-bit-detection-badge-crossover-routing (Plan 01)
    provides: GameInfo.mac_arch ('32' | '64' | 'unknown') type contract on common/types.ts
provides:
  - MacArchBadge presentational component (renders a "32" mark only for 32-bit mac builds)
  - components barrel export for MacArchBadge
  - GamePage left-panel render site (sibling of .store-icon) + .macArchBadge CSS rule
  - gamepage.json badge.macArch32 i18n key
affects: [18-02, 18-03, phase-verifier-human-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pure presentational badge component mirroring PlatformSupport.tsx's { gameInfo } prop shape, host-OS actionability passed down as an isMac prop (never re-derived in the component)"
    - "DOM-less RTL test: invoke the function component directly and inspect the returned React element's props (no jsdom — mirrors HumbleOriginInfo.test.tsx)"
    - "host-OS-gated styling: warning variant only on macOS host, informational/neutral otherwise"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/index.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - public/locales/en/gamepage.json

key-decisions:
  - "Badge is pure presentational: isMac is received as a prop from GamePage/index.tsx's existing local isMac (L166), not re-derived — keeps parity with PlatformSupport and avoids a second platform-derivation source of truth."
  - "Badge positioned top-right (mirrors .store-icon's absolute top-left convention) so it never overlaps the store logo."
  - "Warning styling (--status-warning) gated strictly on isMac; informational (--neutral-05) otherwise — implements T-18-04-02 (a non-macOS host never shows a non-actionable 'warning')."
  - "The '32' text mark is the required signal (faApple glyph optional per CONTEXT); shipped text-only for clarity."

patterns-established:
  - "host-OS actionability as a prop, not an in-component platform read"
  - "false-flag-safe render gate: renders ONLY on mac_arch === '32'; '64'/'unknown'/undefined render null"

requirements-completed: [MAC32-04]

# Metrics
duration: ~20min
completed: 2026-07-12
---

# Phase 18 Plan 04: macOS OS/Arch Badge (MacArchBadge) Summary

**A pure presentational `MacArchBadge` that renders a "32" mark beside the game logo only for 32-bit-only macOS Steam builds — warning-styled on a macOS host (where it is actionable/CrossOver-routed) and informational elsewhere — wired into the GamePage left panel and covered by a DOM-less RTL test.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-12
- **Tasks:** 3 (2 auto executed + committed; 1 human-verify checkpoint deferred to HUMAN-UAT)
- **Files modified:** 4 modified, 2 created

## Accomplishments

- `MacArchBadge.tsx` renders `null` unless `gameInfo.mac_arch === '32'` (the false-flag-safe contract from Plan 01 — `'64'`/`'unknown'`/`undefined` show nothing), and renders a visible "32" mark otherwise.
- Host-OS actionability gate: `macArchBadge--warning` (`--status-warning`) only when the `isMac` prop is true; `macArchBadge--informational` (`--neutral-05`) otherwise — mitigates T-18-04-02.
- Accessible `title`/`aria-label` "32-bit macOS build" via a new `badge.macArch32` key in `public/locales/en/gamepage.json`.
- Barrel-exported alongside `PlatformSupport`; rendered as a sibling of `.store-icon` inside `.mainInfo` in `GamePage/index.tsx`, reusing the existing local `isMac` (L166) rather than recomputing.
- `.macArchBadge` CSS rule positioned top-right (opposite the store icon's top-left) so it never overlaps the logo/store icon.
- RTL test covers every `<behavior>` case: non-'32' → null (`unknown`/`64`/`undefined`), '32' → "32" mark present, warning class only when `isMac` true, informational class when false, accessible title. 7/7 pass.

## Task Commits

1. **Task 1: MacArchBadge component + barrel export + RTL test (MAC32-04)** — `f58fc047` (feat)
2. **Task 2: Render MacArchBadge beside .store-icon in GamePage + CSS (MAC32-04)** — `3b0db376` (feat)
3. **Task 3: Visual UAT — badge placement and host-OS styling** — DEFERRED-TO-HUMAN-UAT (see below)

**Plan metadata:** committed with this SUMMARY.

## Files Created/Modified

- `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` — new pure presentational badge; render gated on `mac_arch === '32'`, host-OS-gated warning/informational variant class, accessible title.
- `src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx` — new DOM-less RTL test (7 cases).
- `src/frontend/screens/Game/GamePage/components/index.tsx` — barrel export for `MacArchBadge`.
- `src/frontend/screens/Game/GamePage/index.tsx` — import + render `<MacArchBadge gameInfo={gameInfo} isMac={isMac} />` beside `.store-icon`; reuses existing `isMac` (L166).
- `src/frontend/screens/Game/GamePage/index.css` — `.macArchBadge` rule (top-right position, warning/informational variant modifiers).
- `public/locales/en/gamepage.json` — new `badge.macArch32` key.

## Verification

- `npm test -- --testPathPattern=MacArchBadge` → 7/7 pass.
- `npm run codecheck` (tsc --noEmit) → clean.
- `eslint` on all touched files → 0 errors (only pre-existing, unrelated warnings in `GamePage/index.tsx`).
- Grep gates: `MacArchBadge` present in `components/index.tsx` barrel and rendered with `gameInfo` + `isMac` props in `GamePage/index.tsx`; `macArchBadge` CSS rule present in `index.css`; single `const isMac` (L166) reused, not recomputed.

## Decisions Made

See frontmatter `key-decisions`. In brief: `isMac` passed as a prop (not re-derived); badge top-right (no store-icon overlap); warning styling strictly `isMac`-gated (T-18-04-02); "32" text mark is the required signal (faApple glyph left optional per CONTEXT).

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes (Rules 1-3) were needed; no architectural decisions (Rule 4) arose. No packages installed (FontAwesome/react-i18next already direct deps, per T-18-04-SC).

## Task 3 — DEFERRED-TO-HUMAN-UAT (not visually verified)

Task 3 is a `checkpoint:human-verify` for visual placement/styling over `.gamePicture`, which unit tests cannot assert (RESEARCH.md marks this manual-only, consistent with PlatformSupport/AppleWikiInfo precedent). The coordinator (with user consent) **deferred** this to a phase-level HUMAN-UAT item — it is **NOT** recorded as passed/verified.

**Deferral reason:**
1. Requires a built + running Electron app (GameLib) — cannot be exercised headlessly in this execution environment.
2. Depends on Plans 18-02 (store-API min-OS pre-install hint) and 18-03 (post-install Mach-O ground truth) landing before any game's cached `mac_arch` is set to `'32'` — until then, the actionable '32' badge is not reachable in a live build.

**Manual verification steps to carry into HUMAN-UAT:**
1. Build and run GameLib.
2. Open the game page for a Steam title whose cached `mac_arch` is `'32'` (e.g. Age of Wonders III, AppID 226840, a Plan 01 fixture title — available once 18-02/18-03 detection populates `mac_arch`).
3. Confirm the "32" mark renders beside the game logo (top-right over `.gamePicture`, opposite the store-icon top-left) and does not overlap/clip the logo or store icon.
4. On a macOS host, confirm the actionable/warning (`--status-warning`, orange) styling; on a non-macOS host confirm informational (neutral grey) or omitted.
5. Open a 64-bit / unknown title and confirm NO badge renders.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The badge UI is complete and compiles/tests green; it is ready to display the moment 18-02/18-03 populate `GameInfo.mac_arch === '32'`.
- Carry-forward: the Task 3 visual UAT (steps above) must be run by a human once 18-02/18-03 are merged and a real 32-bit-flagged game is available in a built app.

## Self-Check: PASSED

- `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` — FOUND.
- `src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx` — FOUND.
- Commit `f58fc047` — FOUND in git log.
- Commit `3b0db376` — FOUND in git log.

---
*Phase: 18-macos-32-bit-detection-badge-crossover-routing*
*Completed: 2026-07-12*
