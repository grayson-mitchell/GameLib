# Phase 13: Keys-Waiting + Giftable-Spares Views - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 13-keys-waiting-giftable-spares-views
**Areas discussed:** Tab structure & default view, View membership edge cases, Gift-link mechanics, Urgency badge & recommendation copy

---

## Tab structure & default view

| Option | Description | Selected |
|--------|-------------|----------|
| 3 tabs: Waiting/Spares/All | New views as tabs; Phase 11 state-grouped list survives as "All keys" | ✓ |
| 2 tabs, All keys demoted | Full inventory behind a link or removed | |
| Filter pills, one list | Filter chips instead of tabs | |

**User's choice:** 3 tabs: Waiting/Spares/All (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Keys waiting | Action-oriented view first | ✓ |
| All keys | Preserve Phase 11 behavior | |
| Remember last tab | Persist last-selected tab | |

**User's choice:** Keys waiting as default tab (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Sub-routes per tab | Real router paths; Phase 14 redirect is plain navigate() | ✓ |
| Query param | ?view=spares on one route | |
| Local state + imperative API | Component state, bespoke deep-linking | |

**User's choice:** Sub-routes per tab (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Counts on Waiting + Spares | Actionable tabs show counts; All keys uncounted | ✓ |
| No counts | Plain labels | |
| Counts on all three tabs | Including inventory total | |

**User's choice:** Counts on Waiting + Spares (recommended)

---

## View membership edge cases

| Option | Description | Selected |
|--------|-------------|----------|
| UNPICKED+UNREVEALED+REVEALED | Spec §2.3 "Claim this" set exactly | ✓ |
| UNREVEALED + REVEALED only | Exclude Choice pseudo-entries | |
| UNREVEALED only | Strictest reading | |

**User's choice:** UNPICKED+UNREVEALED+REVEALED in Keys waiting (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Spares, with override | ownedElsewhere is the single source of truth; D-42 override is the escape hatch | ✓ |
| Keys waiting, flagged | Only exact matches qualify as spares | |
| Both views | Duplicate until user resolves | |

**User's choice:** Fuzzy "Likely owned" keys go to Spares with override (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| All keys only | Neither claimable nor giftable — focused views stay honest | ✓ |
| Spares, marked not-giftable | Greyed rows for full duplicate picture | |
| Keys waiting, deprioritized | Bottom of the waiting list | |

**User's choice:** Owned+REVEALED keys in All keys only (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Dated first, then A–Z | Urgency owns the top, browsing owns the rest | ✓ |
| Two visible sections | Labeled "Expiring" / "No deadline" sections | |
| Flat, no-expiry interleaved | Single uninterrupted sort | |

**User's choice:** Dated first, then A–Z (recommended)

---

## Gift-link mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Cached-first, deep-link fallback | Verify passive availability; copy from cache if present, else "Gift on Humble" deep-link; no write-style API calls | ✓ |
| In-app generation via API | Undocumented write endpoint — C5 risk class | |
| Deep-link only | Zero risk but weakens HVIEW-02's one-click copy | |

**User's choice:** Cached-first, deep-link fallback (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm dialog every copy | States consequence before clipboard write; no "don't ask again" | ✓ |
| Dialog once per key | First copy only | |
| Inline warning, direct copy | Permanent warning text, immediate copy | |

**User's choice:** Confirm dialog every copy (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Local copied-at note | Per-key timestamp, machine_name-keyed, D-04 wipe exemption | ✓ |
| Stateless copy | Clipboard write only | |
| Full audit-log entry | Phase 14-style audit log now | |

**User's choice:** Local copied-at note (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Spares view only | All keys stays D-22 read-only; single actionable destination for Phase 14 C2 | ✓ |
| Everywhere the key shows | Copy button in All keys too | |

**User's choice:** Copy affordance in Spares view only (recommended)

---

## Urgency badge & recommendation copy

| Option | Description | Selected |
|--------|-------------|----------|
| 2 tiers: ≤7d danger, ≤30d warning | Reuses --status tokens, Phase 7 tier→color convention | ✓ |
| Single warning style | One yellow badge for ≤30 days | |
| 3 tiers: 48h/7d/30d | Finer granularity, third visual class | |

**User's choice:** 2 tiers (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| "{N} days left" | Compact countdown; "Expires {date}" stays alongside | ✓ |
| "Expires in {N} days" | Fuller sentence, replaces date text | |
| Date + countdown combined | Merged element | |

**User's choice:** "{N} days left" (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| All three tabs | Urgency is a property of the key, not the view | ✓ |
| Keys waiting only | Badge as that view's signature | |
| Waiting + Spares, not All keys | Calm inventory view | |

**User's choice:** All three tabs (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| View-level header blurb | One line per focused tab; the tab IS the recommendation | ✓ |
| Per-row microcopy | Recommendation on every row | |
| Header blurb + All-keys row hints | Hybrid | |

**User's choice:** View-level header blurb (recommended)

---

## Claude's Discretion

- Exact route path segments, tab component construction/styling, count-badge styling
- Confirmation-dialog component choice and exact warning copy; i18n keys (consumed namespace)
- Copied-at store shape/location (`electronStores.ts` conventions)
- Empty states per tab
- Weeks/hours phrasing thresholds; badge spatial coexistence with state/owned badges
- Per-row handling when gift-link availability is mixed across keys

## Deferred Ideas

- In-app gift-link generation via undocumented write endpoint — rejected for v1.2 (C5 risk)
- WR-01..WR-04 accept-or-remediate decision (12-REVIEW.md) — due before Phase 14; WR-02/WR-04 become more visible once Spares ships
- "Remember last tab" preference — rejected in favor of fixed Keys-waiting default
