---
quick_id: 260901-vuy
slug: close-phase-35-records-blockers-live-gat
created: 2026-09-01
type: records-only
ships_code: false
---

# Quick Task 260901-vuy: Close Phase 35's three records blockers

## Premise (verified at HEAD, not assumed)

Phase 35 is **17/17** after six adjudication passes, live-proven on a **genuine release artifact**
(not debug-packaged). No code change and no gesture is owed. Three records propagations block
closure, all re-verified today:

| # | Blocker | Evidence at HEAD |
|---|---------|------------------|
| 1 | `35-LIVE-GATE.md` never written back | 1793 lines; **0** occurrences of `bea07cd17`, `b5b3464bd`, `total=31`, `22:54`, `post-clear verification`. Criterion 21's record ends at the 2026-08-31 18:15 run, predating both behaviour-changing commits. `blocking: true`, so this is an `R-34.5-G1-PKG` violation inside the phase's own gate doc. |
| 2 | Phase 38 inheritance unledgered | `38-VERIFICATION.md` mentions Epic once, in `38-W03`'s login-window *title* item. No item makes a Windows/Linux operator perform an Epic **logout**. |
| 3 | `REQUIREMENTS.md:429` / `:1143` | Both still condition REQ-35-07 on `D-35-19-15`'s sibling-apex seeding. |

Plus two status propagations: `STATE.md` `stopped_at` and `ROADMAP.md:73` both still say
`gaps_found` / **NOT YET CLOSED**, predating the last six commits.

## Locked constraints

- **DO NOT reopen `D-35-19-15`.** Closed but unreproducible, confirmed three times. `b5b3464bd`
  removed the hidden window that seeded the sibling cookies, so no gesture can recreate them.
- **`35-VERIFICATION.md` `status:` STAYS `human_needed`.** Not a default — measured. Flipping to
  `gaps_found` makes Phase 35 vanish from `audit-uat` entirely, taking criterion 14's genuinely
  open UI-repaint item with it. 7 human items remain; the phase is not `passed` either.
- **Do not soften any `Expected`.** The four original FAILs cleared because code landed.

## Tasks

### Task 1 — Write `35-LIVE-GATE.md` back to the post-fix artifact

**Action:** Append a dated post-fix addendum to the criterion-21 section and update the frontmatter
`verdict:`. Record, from the release-artifact run (2026-08-31 22:54, `/Applications/GameLib.app`,
SEA sidecar confirmed running via `ps` — PID 9781 shell → PID 9787 **bundled** `gamelib-sidecar`,
not `node build/main/sidecar.js`):

- `epicgames.com before(total=31, matched=8, verdict=SUPPORTED_NONEMPTY) → after(total=23, matched=0)`
- `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)`, five NUMERIC zeroes
  with five `SUPPORTED_NONEMPTY` verdicts
- Independent index-walking parse (not `strings`, not the orchestrator's `bc.js`): BEFORE 23
  records / 0 Epic, AFTER 23 records; set difference **empty in both directions**; 23 + 8 = 31
- `D-35-29-02` **RESOLVED** — the two competing explanations the original record left
  undistinguished are now distinguished. Explanation (ii) was right: the logout's own hidden
  webview loaded Epic's live login page and re-seeded the cookies the sweep had just removed.

**Do NOT rewrite the original 18:15 record.** Append. It is the honest record of what was measured
that day, and the phase's history is evidence.

**Verify:** all five staleness markers present; `criteria_total: 21` unchanged; `grep -c "^Verdict:"`
unchanged.

### Task 2 — Ledger the Epic-logout inheritance into `38-VERIFICATION.md`

**Action:** Add item **`38-W06`** to the `human_verification` array, in the corrected `blocked_by`
convention from quick `260901-vm1` (cost, not blocker) and with a source-level `platform_gate`.

**State the consequence HONESTLY — do not overclaim.** `bea07cd17` made an unreadable jar
**throw** (`user.ts:571-575`), and `35-22` routes a failed Epic logout to `gamelib.log` plus a
user-visible `showDialogModal` ERROR. But whether the reads reject off-macOS is **UNVERIFIED**:
Windows and Linux still open a real window (the default-data-store fallback is
`#[cfg(target_os = "macos")]`), now pointed at `https://gamelib.invalid/`. Whether
`cookies_for_domain` succeeds against a non-resolving-page window is exactly the unknown. So the
item is "observe an Epic logout off-macOS", not "confirm a known failure".

That is why `38-W04`/`38-W05` do not cover it: both are smoke-launch items a Windows operator
passes verbatim without ever touching a logout.

**Verify:** `audit-uat` phase 38 goes **29 → 30**, total **54 → 55**. An increment proves the array
parsed; a flat count would mean the item was silently dropped.

### Task 3 — Decondition REQ-35-07 in `REQUIREMENTS.md`

**Action:** At `:429` (status row) and `:1143` (requirement body), strike the `D-35-19-15`
sibling-apex condition and mark REQ-35-07 **Complete**, citing the release-artifact run. Preserve
the D-35-19-15 note as a *residual of its own*, not as a REQ-35-07 clause — two adjudication passes
ruled it is not one.

### Task 4 — Propagate the closed status

**Action:** `STATE.md` `stopped_at` and `ROADMAP.md:73`. Both must record: 17/17, release-artifact
proven, `status: human_needed` **by design** (7 human items open), D-35-19-15 still open and
unreproducible, lint → Phase 39, Windows/Linux → Phase 38.

`STATE.md` **by hand only** — no `gsd-sdk state.*` verb; they corrupt this file.

### Task 5 — Resolve the three `gaps:` entries in `35-VERIFICATION.md`

**Action:** Mark the three `SIXTH PASS`-prefixed gap entries resolved, naming this task's commit.
`status:` stays `human_needed`.

## Success criteria

- [ ] All five staleness markers present in `35-LIVE-GATE.md`; original 18:15 record intact
- [ ] `38-W06` added; `audit-uat` reports **30 / 55** (proving the array still parses)
- [ ] REQ-35-07 Complete at both `:429` and `:1143`, D-35-19-15 preserved as its own residual
- [ ] `STATE.md` +N lines with 0 removed; ROADMAP:73 updated
- [ ] `35-VERIFICATION.md` `status:` still exactly `human_needed`
- [ ] D-35-19-15 NOT reopened anywhere
- [ ] Commit touches only Phase 35/38 records + this task dir
