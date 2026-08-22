---
quick_id: 260823-dyd
slug: park-34-2-human-uat-nothing-actionable-r
date: 2026-08-23
status: complete
---

# Summary — 260823-dyd

`34.2-HUMAN-UAT.md` is now `status: parked` (⊘, purple) instead of `diagnosed` (amber).

## What changed

One file, frontmatter only. `status: diagnosed` → `parked`, plus `parked_on: 2026-08-23`,
`parked_reason:` and a `superseded_by:` block. `blocked_on:` kept verbatim. No body edits — the
`## Current Test` / `## Tests` / `## Gaps` content is a historical record of a real run and is
untouched.

## Why parked and not green

The user's ask was "a state that says done all you can do here", suggested as green. Green is the
wrong claim: UAT-34.2-01's **packaged half FAILED**, and `complete` would assert a pass that did
not happen, erasing a real finding. `parked` has existed in the extension since v0.4.0 for exactly
this — work stood down on purpose. It is in `SETTLED` (STATE.md cannot repaint it) and `rollup()`
**drops parked children**, so it holds nothing back. No new vocabulary was needed.

## The `superseded_by:` pointer, and why it is worded as it is

The ROADMAP scope note (2026-08-23) homes `R-34.5-G1-PKG` to Phase 35 and says to "mint a
requirement for it". It does **not** say that requirement must carry UAT-34.2-01 step 4's
acceptance criterion. Closing halves (a) — locales absent from `bundle.resources` — and (b) —
`electronStub.ts:207`'s hardcoded `isPackaged: false` — makes packaged locale resolution
*possible*; it does not re-make the observation that the repair-success notification body renders
as a translated sentence rather than the raw key `notify.finished.reparing`.

So `superseded_by:` is written as an explicit TBD **with the criterion spelled out**, to be filled
with the REQ id when Phase 35 is planned. Left implicit, this coverage would vanish with nothing
reporting its absence — the `blocker-records-rot-silently` shape, and `R-34.5-G1-PKG` has already
drifted across three phases without an owner since 2026-08-07.

## Verification

- Badge: `artifactStatus('parked')` → `parked`; `folderArtifactStatuses` returns it; `rollup()`
  filters it out.
- **`gsd-sdk query audit-uat` byte-identical before and after** — 18 items both times, results
  array unchanged. Checked deliberately: a status flip on a UAT file is exactly the kind of edit
  that can hide an item from the cross-phase sweep. 34.2 already contributed **zero** of the 18.
- All 54 phase folders diffed: **zero changed colour**.

## 34.2 stays amber, and that is a prior decision, not a bug

Measured. Four other artifacts hold it, all genuinely unsettled: `34.2-REVIEW.md`,
`34.2-REVIEW-FIX.md`, and gap cycles 1 and 2. `34.2-REVIEW-FIX.md` states in its own body that it
stays `partial` **deliberately** and "will not turn this phase green", because its scope is round 1
only. Flipping one artifact moves its badge, never the folder — measured before promising anything.

## The other two `diagnosed` files: NOT the same shape. Left alone.

Both were checked and both are correctly amber:

- **`08-UAT.md`** — 5 gaps at `status: failed`, four of them named ACTIVE for fixing (A, B, C, D, F)
  with root-cause anchors and file/line fix directions. Genuinely actionable.
- **`30-UAT.md`** — 2 gaps at `status: failed` with `fix_plan: 30-06` and named debug sessions,
  plus 2 `tracked` items carried in `30-VERIFICATION.md`'s `human_verification` block. All three
  of its debug sessions — `steam-install-spinner-hangs-tauri.md`, `settings-unreachable-tauri.md`,
  `electron-steam-sync-fails-phase30.md` — are still in `.planning/debug/`, **not** in
  `debug/resolved/`.

`diagnosed` is the right status for both: root cause found, fix not yet landed. Only 34.2's had
nothing left that anyone could do.

**Worth a separate look, not done here:** 08-UAT was last updated 2026-07-04 and Phase 08.1 has run
since — at least gap B (delisted games) has an `is_delisted` test in `steam/__tests__/games.test.ts`
that may already close it. Reconciling those gaps against current code is a real task, not a
frontmatter flip, and rewriting them unilaterally would be the wrong call.
