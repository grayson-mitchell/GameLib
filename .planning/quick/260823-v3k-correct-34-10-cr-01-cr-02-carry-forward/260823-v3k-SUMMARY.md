---
quick_id: 260823-v3k
slug: correct-34-10-cr-01-cr-02-carry-forward
date: 2026-08-23
status: complete
description: "Correct ROADMAP.md's stale Phase 34.10 carry-forward record: CR-02 is CLOSED (source-verified-only, permanently), CR-01 is only PARTIALLY closed — 34.11 fixed the one scored theme, 7 theme blocks and the missing fallback chain remain"
type: docs
commits:
  - (see commit trailer below)
files_touched:
  - .planning/ROADMAP.md
  - .planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md
  - .planning/todos/pending/2026-08-23-navbar-active-undefined-in-7-of-11-themes.md
  - .planning/STATE.md
---

# 260823-v3k — the carry-forward record was stale in two different directions

**Phase 34.10 is not blocked and was never blocked.** It closed 2026-08-09 on live gate run 4's
5/5; `34.10-VERIFICATION.md` is `status: passed` with `human_verification: []`. The question that
started this task ("what is blocking 34.10?") had a stale document as its only supporting evidence.

## What was wrong

`ROADMAP.md`'s 34.10 block described CR-01 and CR-02 as *"two CONFIRMED Critical findings,
deliberately NOT fixed in this phase [...] deferred on the operator's explicit decision"* — 14 days
after Phase 34.11 had taken both, under a CONTEXT.md heading literally reading "Carried forward
from Phase 34.10", as decisions **D-31** and **D-32**, implemented by plan `34.11-03`.

The block's own **sibling paragraph for WR-01 had been updated** when WR-01 closed earlier the same
day (quick task `260823-tct`). So the CR paragraphs were inconsistent with a neighbour three lines
below them — which is exactly why they read as authoritative.

## The correction that would have been wrong

The obvious fix — "mark both CLOSED" — was caught and rejected by re-grepping the landmarks instead
of trusting the review's prose.

`34.10-REVIEW.md`'s CR-01 heading scopes the finding to **8 of 11 themes**. Plan `34.11-03`
declared `--navbar-active` in **`gruvbox_dark` only** — the scored theme, which is precisely what
D-31 undertook and delivered. It did not touch the other 7 and did not add a fallback chain at the
consuming site.

**Recording CR-01 as flatly closed would have retired a finding whose majority is still live, in the
phase's own permanent record.** This is the `threat-register-ranges-hide-uncovered-ids` shape: the
audit unit was the finding ID, but the defect's unit is the **theme block**.

## Measured at HEAD — not taken from any summary

**CR-02 — CLOSED, permanently source-verified-only.**
- `NavShell/index.scss:85` declares `-webkit-app-region: drag` (commit `75e3785da`), with `no-drag`
  on `.NavTabs` and `.NavShell__navRight .DownloadsRing`.
- `34.11-09-SUMMARY.md` records it as a **permanent accepted limitation, not a gap awaiting future
  closure**: `-webkit-app-region` is inert under WKWebView and the live-gate host is macOS/Tauri, so
  the source-text gate is its only possible evidence, by construction. Both records now say this
  explicitly so it cannot be restated as live-confirmed later.

**CR-01 — scored-theme half closed and genuinely live-adjudicated; 7 themes open.**
- `themes.scss:210` declares `--navbar-active: var(--navbar-accent)` in `body.gruvbox_dark`
  (commit `126b9c458`).
- `34.11-09`'s live three-theme sweep returned **APPROVED 6/6** for `gruvbox_dark`, with the
  operator answering the contrast question *deliberately* rather than as a side effect of a general
  check — superseding plan 03's own "recommendation, not a measured result" hedge. This half is
  measured, not inferred.
- **Census at HEAD (script in this task, 11 blocks declaring navbar tokens): 7 still lack
  `--navbar-active`** — `classic`/`cyberSpaceOasis`/`cyberSpaceOasisAlt`, `high-contrast`,
  `nord-dark`, `marine`/`marine-classic`, `zombie`/`zombie-classic`, `old-school`,
  `sweet`/`sweet-dark`. `NavTabs/index.scss:246` still reads `color: var(--navbar-active)` with **no
  fallback chain** (the line moved 229 → 246; the declaration did not change).

**Corrected diagnosis, preserved in both records.** At `NavItem/index.scss:20-23` the fallback chain
never breaks, so the symptom *there* is a WRONG colour (`--accent-overlay`, mustard `#d79921`), not a
dropped declaration. The review's "illegible / inherited" analysis holds for `NavTabs`, which has no
chain. Two elements, two failure modes, one shared root token — and the user-visible severity sits
in the half still open.

## What changed

1. **`ROADMAP.md`** — header sentence and both CR bullets rewritten. CR-02 marked CLOSED with its
   permanence caveat; CR-01 marked PARTIALLY CLOSED with the 7 theme names spelled out so the
   residual is findable by grep rather than by inference. Matches the WR-01 paragraph's
   discharge phrasing, including its **"does not reopen the phase"** clause.
2. **`34.10-REVIEW.md`** — a closure blockquote under each CR heading, in the exact form WR-01
   already uses at :215.
3. **New todo** — `2026-08-23-navbar-active-undefined-in-7-of-11-themes.md`, owning the residual.
4. **`STATE.md`** — one row appended to the Quick Tasks Completed table.

## Deliberate non-changes

- **`34.10-REVIEW.md`'s `findings:` counts and `status: issues_found` left untouched.** Precedent
  from this same file: WR-01's closure did not decrement them, so the counts record the review's
  original census rather than open counts. And `issues_found` remains correct on its own terms —
  WR-02, IN-01 and CR-01's residual are all open.
- **`STATE.md`'s "Pending Todos" prose list not appended to.** It has not been maintained since
  2026-08-03; no todo filed on 2026-08-22 or 2026-08-23 appears in it. Adding one entry would imply
  a completeness the list does not have. Flagged rather than silently followed.
- **No `gsd-sdk state.*` verb invoked**, per the standing known-corruption defect. STATE.md was
  snapshotted before editing and diffed after: **exactly 1 line added, 0 removed, 7507 → 7508.**

## Verification

- `themeTokens.test.ts` at HEAD: **31/31 pass** — both `describe('gruvbox_dark theme tokens (CR-01,
  D-31)')` and `describe('navbar app-region (CR-02, D-32)')`.
- Every claim re-derived from source or git at HEAD, not from any SUMMARY's restatement: the fix
  commits (`126b9c458`, `75e3785da`, `1afef37e5`), the `themes.scss` census, and
  `NavTabs/index.scss:246`'s unchanged declaration.
- STATE.md diffed against a pre-edit snapshot.

## Note for whoever picks up the residual

`themeTokens.test.ts:127` pins **one theme by name**. It will keep passing while 7 themes stay
broken — which is what it did for the last 14 days. The todo asks for it to become a census
assertion over all 11 blocks. A guard that names a landmark instead of the property is the
`appearance-gate-must-name-the-property-not-a-landmark` failure mode.
