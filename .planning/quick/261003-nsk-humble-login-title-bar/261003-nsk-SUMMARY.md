---
phase: quick-261003-nsk
plan: 261003-nsk
subsystem: ui
tags: [tauri, rust, webview, humble, login, injected-js, title-bar]

requires:
  - phase: quick-261003-h7b
    provides: "Humble overlay panel removal (the two corner pills this task restyles)"
provides:
  - "Humble login sheet's two injected corner pills (cancel pill + origin banner) replaced with one themed title bar: origin centred, bare close glyph flush right, GameLib-dark palette"
  - "Humble login sheet's visible start width narrowed from 900 to 572"
affects: [humble-login, tauri-shell-injected-scripts]

actuals:
  tokens: 4461
  tasks: 2
  commits: 2
  plan_head_before: 3f95a9086
  plan_head_after: 44e0b8a12

tech-stack:
  added: []
  patterns:
    - "Two cooperating injected scripts kept as separate functions (never merged) to preserve independent survivability/inertness guarantees"
    - "RED-proven cargo/jest guards: every new test confirmed to fail against the pre-edit source before the production edit lands"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts

key-decisions:
  - "Kept login_cancel_strip_script and login_origin_banner_script as two separate functions rather than merging them into one bar-building function — preserves the banner's by-construction keyboard-listener inertness and the glyph's independent survivability if the banner's own build() ever fails (per plan decision record, inherited from CONTEXT.md D-1/D-2)"
  - "Fixed, non-theme-reactive palette (#161c1e background / #caf3fd text / #272f31 rule) per CONTEXT.md D-1 — the injected chrome lives in humblebundle.com's own document and cannot read GameLib's CSS custom properties"
  - "572px width applies only to humble_login_open's visible arm; open_pristine_epic_login_window's own 900-wide call is explicitly out of scope (CONTEXT.md D-3) since that window's zero-injection property defeats an anti-bot 403 and is a different login form layout"

patterns-established: []

requirements-completed: []

duration: ~90min
completed: 2026-10-03
status: complete
---

# Quick Task 261003-nsk: Humble login title bar Summary

**Replaced the Humble login sheet's two corner pills with one themed title bar (centred origin, flush-right close glyph, fixed dark palette) and narrowed the sheet from 900px to 572px wide.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 2/2 complete
- **Commits:** 2

## Accomplishments

### Task 1 — One themed title bar (tracer, TDD)

`login_cancel_strip_script` and `login_origin_banner_script` in `src-tauri/src/main.rs` were restyled into cooperating halves of one visual bar, **kept as two separate functions** (not merged) per the plan's decision record. Merging was explicitly rejected because it would have collapsed two independently-important guarantees into one build path:

- The origin banner is provably inert (no listener at all, read-only `textContent` write) — this is an anti-phishing property, not cosmetic, and a merged build() would make that harder to audit in isolation.
- The cancel glyph's own background/sizing is deliberately self-contained so it survives even if the banner's build() throws — a merged function would make the glyph's fate depend on the banner's code path.

What changed instead: both scripts' inline styles were rewritten so the two independently-built elements visually compose into one 32px bar — same `top:0`, same height (`32px` literal shared by both), banner spans `left:0 / right:0` with the glyph's box (`32px` wide) carved out via `padding: 0 36px` + `overflow:hidden` + `textOverflow:ellipsis`, glyph sits flush at `top:0 / right:0`. The cancel control's **visible text** changed from the string `"Cancel sign-in"` to the bare glyph `×` (written as the Rust-escaped sequence, never the literal character) while its accessible name (`aria-label="Cancel sign-in"`, `aria-keyshortcuts="Escape"`) and click/iframe-exfil delivery mechanism were left untouched.

The banner's doc comment previously claimed the two elements sit in "opposite corners [and] can never overlap" (T-34.5-C7-05) — now false under the new full-width layout. That claim was replaced with the three invariants that now hold instead: lower z-index than the strip, load-bearing (not just polite) `pointerEvents: 'none'`, and horizontal padding ≥ glyph width so centred text truncates before it could run under the glyph.

Resolved palette chain (GameLib's `midnightMirage` theme, fixed per CONTEXT.md D-1 since the injected chrome cannot read GameLib's live CSS custom properties):

| Role | Value | Source |
|---|---|---|
| Bar/glyph background | `#161c1e` | `--navbar-background` → `--background` → `--neutral-02` |
| Bar/glyph text | `#caf3fd` | `--text-default` → `--brand-text-01` |
| 1px bottom rule | `#272f31` | `--divider` → `--neutral-03` |

**Five new cargo tests, each RED-proven against the pre-edit source before the production edit landed.** Observed failure output, captured verbatim:

- `login_origin_banner_script_spans_the_full_width_and_centres_its_text` — panicked: `assertion failed: script.contains("banner.style.left = '0'")`
- `login_origin_banner_script_reserves_horizontal_room_for_the_close_glyph` — panicked: `banner script must set a horizontal padding`
- `login_origin_banner_and_cancel_strip_agree_on_one_bar_height` — panicked: `banner script must set height`
- `login_cancel_strip_script_shows_a_bare_glyph_and_keeps_its_accessible_name` — panicked: `assertion failed: !script.contains("strip.textContent = 'Cancel sign-in'")`
- `login_cancel_strip_script_glyph_box_is_flush_with_the_bar_corner` — panicked: `assertion failed: script.contains("strip.style.top = '0'")`

After the production edit, all 5 passed, and the full `login_` filtered cargo suite ran 81 passed / 0 failed.

Committed as `10cf29f77`.

### Task 2 — Narrow the visible sheet to 572 wide

`humble_login_open`'s `if visible` block narrowed its `.inner_size(900.0, 700.0)` call to `.inner_size(572.0, 700.0)`, with an inline comment recording that 572 is a measurement (`CGWindowListCopyWindowInfo([.optionOnScreenOnly])` against the live `gamelib-shell` pid, 2026-10-03), not a taste call. `open_pristine_epic_login_window`'s own separate `.inner_size(900.0, 700.0)` call was confirmed untouched — per CONTEXT.md D-3, that window is a different login form layout whose zero-`initialization_script` property defeats an anti-bot 403, and injecting/resizing it is out of scope.

Two new jest guards added to `src/backend/__tests__/tauriShellSource.test.ts`, in the existing WR-07 describe block, each with a RED self-test against a synthetic counter-source proving the guard is non-vacuous:

- Guard 1: `humble_login_open`'s `if visible` block carries `.inner_size(572.0, 700.0)` and no longer carries `.inner_size(900.0, 700.0)` — plus a self-test proving a synthetic block still carrying the old 900-wide call fails the positive clause.
- Guard 2 (D-3 scope guard): `open_pristine_epic_login_window` still carries its own `.inner_size(900.0, 700.0)` — plus a self-test proving a synthetic body narrowed to 572 fails the positive clause.

Two small local helper functions (`extractHumbleLoginOpenArmBody`, `extractPristineLoginFnBody`) were added to the WR-07 describe block to slice out the relevant source spans, mirroring the shape of equivalent helpers already duplicated per-describe-block elsewhere in the same file (an established house convention in this file, not a new pattern).

`npx prettier --write` was run on this test file after adding the new tests; `git diff` confirmed the only change was quote-style normalization (single- to double-quoted strings containing apostrophes in test names) — no unrelated reformatting.

Committed as `44e0b8a12`.

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell login_` — 81 passed, 0 failed (after Task 1; held through Task 2, which touched no Rust tests).
- Three-suite jest run — 299 passed (baseline 295 + 2 Task 2 guards + 2 Task 2 RED self-tests), 0 failed.
- `npx prettier --check src/backend/__tests__/tauriShellSource.test.ts` — passes (confirmed `--file-info` reports `{"ignored": false, "inferredParser": "typescript"}` first, so the check is real assurance, not vacuous).
- `npx prettier --file-info src-tauri/src/main.rs` reports no inferable parser (`--check` on this file exits 2, an ERROR, not a pass) — correctly excluded from verification per CLAUDE.md's formatter-check convention; never relied on as assurance.
- `pnpm planning-gates` — 12/12 passing.
- `cargo fmt -- --check` was **not** run against the production file (would bury this diff in unrelated pre-existing drift from ~line 10113) — this is a documented pre-existing red, not mine to fix, and is excluded from this plan's scope by instruction.

**Every one of the checks above asserts a property of a generated string (a Rust `String` built by `concat!`, or a slice of `main.rs`'s stripped source text) — none of them render or measure a pixel.** Live visual confirmation that the Humble login sheet now shows one legible bar with a centred origin and a clickable flush-right glyph, and that the sheet opens at the new 572 width, is **outstanding by construction** and requires running `pnpm tauri:dev` plus a real Humble sign-in attempt. This summary makes no claim that the bar has been seen rendered.

## Deviations from Plan

None — plan executed exactly as written. The only executor-discretion choice was adding two local helper functions (`extractHumbleLoginOpenArmBody`, `extractPristineLoginFnBody`) to the WR-07 describe block in the jest test file; this mirrors an existing house convention of per-describe-block-local helper duplication already present elsewhere in the same file, and is an implementation detail within the plan's instructions, not a deviation from them.

## Known Stubs

None — no stubs introduced.

## Self-Check: PASSED

- `src-tauri/src/main.rs` — FOUND (modified)
- `src/backend/__tests__/tauriShellSource.test.ts` — FOUND (modified)
- Commit `10cf29f77` — FOUND in `git log`
- Commit `44e0b8a12` — FOUND in `git log`
