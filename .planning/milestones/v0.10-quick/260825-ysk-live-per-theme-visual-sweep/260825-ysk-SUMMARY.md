---
quick_id: 260825-ysk
slug: live-per-theme-visual-sweep
date: 2026-08-25
status: complete
description: "The live per-theme visual sweep owed by 260823-w2f: RUN, all 17 theme classes, real app / real renderer, live BEFORE-and-AFTER. Verdict PASS — and it FALSIFIES CR-01's central claim"
type: verification
verdict: PASS
files_touched:
  - .planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
---

# 260825-ysk — the owed live sweep, RUN. Verdict PASS, with a correction.

Discharges the item `260823-w2f` recorded as owed in four places. **17 theme classes, the real
Electron app, the real renderer, a real rebuilt bundle — measured both BEFORE and AFTER the fix.**

## Headline: the fix is confirmed live, and CR-01's severity claim is FALSE

`34.10-REVIEW.md`'s CR-01 heading reads *"Active tab's text colour is undefined (**illegible**) in
8 of 11 themes"*. That was a code-read prediction: an undefined custom property with no fallback
invalidates `color`, so the label takes the inherited value — and the review assumed the inherited
value would be unusable.

**Measured live, it is `#eae8e5`, a light neutral, and those 7 themes rendered at 13.32:1 – 16.82:1
— comfortably legible.** The defect in the 7 was **cosmetic**: a neutral where the theme's accent
was intended. Not illegibility.

**Exactly one theme was genuinely illegible: `nord-light`, at 1.18:1 — and CR-01 never covered it**,
because it *has* the declaration. The one BLOCKER-grade instance sat in the theme the finding
excluded, while the 8 it named were a cosmetic issue.

I had repeated the review's "illegible in those 7" framing into the ROADMAP, the review's
`open_findings`, the todo and two commit messages. Those are corrected in this task.

## Live BEFORE → AFTER, every theme class

Colour and background are the **browser's own** `getComputedStyle` output, not a hand-resolved chain.

| Theme | BEFORE | ratio | AFTER | ratio | what actually changed |
|---|---|---|---|---|---|
| midnightMirage | `#a5edfd` | 15.26:1 | `#a5edfd` | 15.26:1 | unchanged |
| classic | `#eae8e5` | 14.51:1 | `#ffbb33` | 10.48:1 | wrong colour → accent |
| cyberSpaceOasis | `#eae8e5` | 14.51:1 | `#ffbb33` | 10.48:1 | wrong colour → accent |
| cyberSpaceOasisAlt | `#eae8e5` | 14.51:1 | `#ffbb33` | 10.48:1 | wrong colour → accent |
| gruvbox_dark | `#f9f5d7` | 13.39:1 | `#f9f5d7` | 13.39:1 | unchanged |
| high-contrast | `#eae8e5` | 13.32:1 | `#36ddff` | 10.04:1 | wrong colour → accent |
| dracula | `#bd93f9` | 5.91:1 | `#bd93f9` | 5.91:1 | unchanged |
| dracula-classic | `#bd93f9` | 5.91:1 | `#bd93f9` | 5.91:1 | unchanged |
| **nord-light** | **`#d0ddff`** | **1.18:1** | **`#30444a`** | **8.88:1** | **WAS ILLEGIBLE** |
| nord-dark | `#caf3fd` | 14.42:1 | `#cbeef8` | 13.92:1 | wrong colour → accent |
| marine | `#eae8e5` | 14.51:1 | `#d39f37` | 7.42:1 | wrong colour → accent |
| marine-classic | `#eae8e5` | 14.51:1 | `#d39f37` | 7.42:1 | wrong colour → accent |
| zombie | `#eae8e5` | 13.54:1 | `#83da5b` | 9.58:1 | wrong colour → accent |
| zombie-classic | `#eae8e5` | 13.54:1 | `#83da5b` | 9.58:1 | wrong colour → accent |
| old-school | `#eae8e5` | 13.54:1 | `#ffc44f` | 10.46:1 | wrong colour → accent |
| sweet | `#e9eaeb` | 16.82:1 | `#eea6e8` | 10.86:1 | wrong colour → accent |
| sweet-dark | `#e9eaeb` | 16.82:1 | `#eea6e8` | 10.86:1 | wrong colour → accent |

**Themes below AA before: exactly one (`nord-light`). After: none.** Worst case after is `dracula`
at 5.91:1 — pre-existing, untouched, human-approved in `34.11-09`.

**An honest trade this makes visible:** in the 7, contrast *decreases* (≈14.5:1 → ≈10.5:1), because
an accent colour is less extreme than a near-white neutral. Still far above AA, and it is the
intended design, but the fix is a design-correctness win rather than an accessibility win. Only
`nord-light` was an accessibility fix.

## The jest gate's arithmetic is validated

The contrast-floor census added by `260823-w2f` resolves `var()` chains with a hand-written
resolver. Its numbers match the browser's to **2 decimal places on all 17 classes** — an
independent cross-check of that resolver against a real engine.

## Evidence

`evidence/` holds the decisive pairs and both raw result sets:

- `nord-light-BEFORE.png` — "LIBRARY" in pale blue on near-white. Barely readable.
- `nord-light-AFTER.png` — dark slate on the same tab. Clearly readable.
- `old-school-BEFORE.png` — white, **legible**; this is the image that falsifies "illegible in 8".
- `old-school-AFTER.png` — amber, the intended accent.

**Pixel verification, not just computed style.** Each `.NavTabs` screenshot was PNG-decoded and
scanned for the expected colour: all 17 themes contain the computed label colour as **exact** pixel
matches (1719 px each — the same glyphs, so a constant count is expected). Negative controls all
score 0 exact, including **`nord-light` scanned for the old `#d0ddff` → 0**, proving the old colour
is absent from the shipped render rather than merely overridden in source.

## Method, and what it cost

Driven with the repo's existing Playwright + Electron harness (`_electron.launch` on
`build/main/main.js`), stepping `document.body.className` through every theme.

Three obstacles, all recorded because each would recur:

1. **The e2e harness is broken at HEAD, independently of this work.** `e2e/api.spec.ts` — a control
   I ran precisely to tell "my spec is wrong" from "the harness is wrong" — fails identically.
   Cause: the app resolves `publicDir` to `build/main/build`, which does not exist, so
   `archSpecificBinary` throws for `comet` and no window ever opens. Worked around with a symlink
   (`build/main/build` → `build`), **removed afterwards**. This is the `publicdir-getapppath-chunking`
   defect class again, and it means **`pnpm test:e2e` cannot pass for anyone right now.** Not fixed
   here — it is not this task's scope — but it should be filed.
2. **`electron-vite build` deletes that symlink**, so it must be re-created after every rebuild.
   Cost one confusing "no window" failure mid-run.
3. **The first sweep produced entirely wrong numbers.** Reading two rAFs after the class change
   captured the app's colour *transition* mid-flight — it reported `nord-light` on a **dark**
   background and `nord-dark` on a light one. Replaced with a poll that waits for the computed
   colour and background to be byte-identical across 3 consecutive samples ~100ms apart. **Had I
   not noticed the light/dark inversion, this sweep would have produced a confident, fully wrong
   table** — and every value in it would have looked plausible.

## Scope limit, stated rather than glossed

This ran under **Electron/Chromium. The ship target for v0.8 is Tauri/WKWebView.** For *this*
property that is a small gap — `var()` fallback resolution and contrast are engine-independent per
spec, and the pixel scan confirms painting — but it is not zero. `34.11-09` found a case where
Chromium painted a 1px divider that WKWebView did not. That was a **rasterization** defect on a
fractional grid boundary; text colour is not that class. A WKWebView pass would still be stronger.

## Cleanup

The throwaway spec (`e2e/navtab-theme-sweep.spec.ts`) and the `build/main/build` symlink are both
removed. `NavTabs/index.scss` restored byte-identical to HEAD
(`shasum ef38be43b2acc8cbcab2842882a8ccfd8c5d21ba`, `git status` clean); the bundle was rebuilt from
the restored source; NavShell suites **24/24, 355 tests** green afterwards.

Only my own orphaned Electron processes were killed — the concurrent session's `gamelib-shell`,
sidecar and `tauri dev` were identified by start time and left running.
