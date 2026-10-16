# Phase 37: Steam defect cluster — depot decode failure, false-delisted games, and install-error reporting - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-22
**Phase:** 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
**Areas discussed:** Orphan scan design (37-07), Installdir rejection + existing residue (37-10), Failure copy + affordances (37-02 / 37-04), Delisted facet placement + label (37-03)

The first three areas were completed in an earlier session and resumed from
`37-DISCUSS-CHECKPOINT.json`. The fourth was completed in the session of 2026-08-22.

---

## Orphan scan design (37-07)

**Question:** Given 425 MB of real residue against 35 GB of false positives — what happens to 37-07?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop it; I clean up by hand | Nothing ships in the app | ✓ |
| Drop it, but I want a throwaway script | One-off, not app code | |
| Keep it, scoped to `app_*` only | Narrowest shipping form | |
| Keep it as originally scoped | Full filesystem scan | |

**User's choice:** Drop it; user cleans up by hand after 37-10 lands. Nothing ships in the app.
**Notes:** Signal ratio measured at 1.2%. The external user population is empty by construction — the `260821-rb5` breadcrumb fix shipped 2026-08-21, so any future user's first install postdates it.

---

## Installdir rejection + existing residue (37-10)

**Question 1:** How should `sanitizeInstalldir` decide what's acceptable?

| Option | Description | Selected |
|--------|-------------|----------|
| Containment, plus a narrow denylist | Containment against the install root + separators/`..`/dots/control chars | ✓ |
| Widen the allow-list only | Add `'` to `SAFE_INSTALLDIR` | |
| Containment only | No explicit denylist | |

**User's choice:** Containment validation plus a narrow explicit denylist. Apostrophes and ordinary filename punctuation pass. Both callers keep the single shared funnel.

**Question 2:** How should the two fallback triggers behave once containment validation is in?

| Option | Description | Selected |
|--------|-------------|----------|
| Split them: fail hostile, surface unresolved | Containment violation aborts; absent installdir falls back but logs + surfaces | ✓ |
| Keep both on the fallback | Current behaviour, better logging | |

**User's choice:** Split them. A containment violation is a security event → ABORT the install, message names the rejected value, no silent fallback write. An absent/unresolved installdir keeps the `app_<id>` fallback but logs WARNING and surfaces in the install result.

**Question 3:** What happens to `app_8930` / `app_25900` / `app_257350` — 16.2 GB of working but mis-named installs?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave them | ACF and directory agree; they work | ✓ |
| Rewrite the ACFs | Restore portable layout | |

**User's choice:** Leave them. Only harm is a non-portable layout. No ACF-rewrite code, no incursion into Phase 23's manifest-write path.

---

## Failure copy + affordances (37-02, 37-04)

**Question 1:** How should a non-retryable failure (e.g. plan-build aborting with no stored refresh token) present itself?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured field drives the UI | Classifier returns a retryability/action signal alongside key+message | ✓ |
| Keep it in the message strings | Cheaper, no type change | |

**User's choice:** Structured field. "Retry to continue" comes OUT of the message strings entirely. The auth case gets its own message plus a "Sign in to Steam" affordance; retryable causes keep Retry.

**Question 2:** What happens to the `failed after \d+ attempts` term in the network branch?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove it from the network alternation entirely | Branch on cause, not on failure shape | ✓ |
| Keep it, add a decode exclusion | Narrower edit | |

**User's choice:** Remove it. `fetchChunk`'s exhaustion wrapper carries the underlying cause forward so the classifier branches on WHY retries ran out. Genuine network exhaustion still matches `ECONNRESET`/`ETIMEDOUT`/`CDN \d`.

**Question 3:** 37-04 — how much of the root cause has to land in this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback ships; root cause investigated but not gated | Title falls back to `appName` | ✓ |
| Hold 37-04 open until the cause is found | | |

**User's choice:** Fallback ships. If the cause widens the phase, record a todo rather than holding 37-04 open.

---

## Delisted facet placement + label (37-03)

Preceded by a scouting report: `is_delisted` was found to be load-bearing in six places, not one,
and removing the `filterEngine` clause alone would re-hide and permanently trap the target game
via `isGameAvailable()` → `nonAvailableGames`. That was reported as a forced implementation
dependency, not put to the user as a choice.

**Question 1:** Where should the delisted filter live in the Games filter panel?

| Option | Description | Selected |
|--------|-------------|----------|
| Tri-state row in "More filters" | One new descriptor kind, no new group; inherits chip row, badge, zero-result handling | ✓ |
| Its own "Availability" group | More room to grow, more prominent; new group header for one row | |
| Row in the Store facet group | Rejected on inspection — that group's rows are runners with per-store counts | |

**User's choice:** Tri-state row in "More filters".

**Question 2:** What should the delisted row's three states be, given the default must be "everything visible, no chip"?

| Option | Description | Selected |
|--------|-------------|----------|
| `off` / `only` / `hide` | Neutral `off` = not filtering; descriptor rule stays uniform with its neighbours | ✓ |
| `show` / `hide` / `only`, default `show` | Keeps neighbours' phrasing; needs a per-row exception in `describeActiveFilters` | |
| Two-state "Delisted only" checkbox | Simplest, but drops the ability to hide delisted games at all | |

**User's choice:** `off` / `only` / `hide`.
**Notes:** Driven by a concrete consequence — `describeActiveFilters` emits a descriptor whenever a tri-state is `!== 'off'`, so a row defaulting to `'show'` would show a chip and "1 selected" for every user on a virgin library with zero action taken.

**Question 3:** What should the filter row and the card badge say?

| Option | Description | Selected |
|--------|-------------|----------|
| "No store page" for both | Literally what `success: false` means; true for all nine without PICS; survives the deferred option-3 refinement | ✓ |
| "Delisted" row, keep the existing badge | Zero i18n churn | |
| "Delisted" row, badge "Not on Steam store" | Familiar filter vocabulary, checkable per-card claim | |

**User's choice:** "No store page" on both surfaces.
**Notes:** Two of the nine (`Starbound - Unstable`, `Rust - Staging Branch`) are branch entries that were never listed, so "no longer available" asserts a claim the data cannot support. Flagged during the question that the rename needs a NEW i18n key — changing the `t()` default alone is inert once the key exists.

**Question 4:** Which other `is_delisted` gates lift in this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Console mode: show + allow launch | Same forced-hide defect on a second screen | ✓ |
| Install-with-options doors: reopen | Unverified whether a delisted depot install succeeds; 34.13 C-04 closed the third door on purpose | |

**User's choice:** Console mode only. Install doors stay closed pending measurement.

---

## Claude's Discretion

- 37-05 (abort-controller lookup miss) and 37-06 (platform-precedence clock skew) — offered as
  additional gray areas at the close of the session and declined. Both are pure-implementation
  defects with no product call inside them; the planner decides the shape, subject to the
  constraints already recorded in ROADMAP.md.
- The mechanical follow-ons of the delisted change (the stale `!game.is_delisted` term in
  `gameCount.findSilentlyExcludedGames`, and the doc comment at `hooks/constants.ts:156` that
  goes false) were left to the planner to sequence.

## Deferred Ideas

- PICS/appinfo discrimination of "withdrawn" vs "never listed" — the todo's option 3. Not urgent
  once nothing is hidden; "No store page" was chosen as the parent term so this can be added
  underneath later.
- Measuring whether a delisted Steam game can actually be installed from depots. If it succeeds,
  re-opening the install-with-options doors becomes a small evidence-backed follow-up.
- 37-04's root cause — why `title` is empty on the Steam error path.
- 37-07's orphan scan, dropped rather than deferred: its user population is empty by construction.
