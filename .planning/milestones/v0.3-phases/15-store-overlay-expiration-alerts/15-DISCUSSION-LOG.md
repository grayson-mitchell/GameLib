# Phase 15: Store Overlay + Expiration Alerts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 15-store-overlay-expiration-alerts
**Areas discussed:** Badge surfaces & the "New" state, Expiring-soon surface shape, Notification behavior, Badge↔key matching

---

## Badge surfaces & the "New" state

| Option | Description | Selected |
|--------|-------------|----------|
| Discounts screen only | Native React DiscountCard; WebView untouched | ✓ |
| Discounts + Steam Store WebView | Script injection into Valve's page — brittle | |
| You decide | Planner picks based on research | |

**User's choice:** Discounts screen only.

| Option | Description | Selected |
|--------|-------------|----------|
| "New" = neither owned nor keyed; every card badges | Literal reading of criterion 1 | |
| Badge only when there's something to say | Owned / Key available only; unowned cards clean | ✓ |
| "New" = recently added to Humble library | Recency reinterpretation | |

**User's choice:** No "New" badge.
**Notes:** User rationale: badges are only on Discounts, and "there is a filter option for owned anyhow." Consciously narrows criterion 1's "each title" wording.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing badge language | Phase 13 status-color pills | ✓ |
| New corner-ribbon treatment | Store-specific overlay on card art | |
| You decide | | |

**User's choice:** Reuse existing pill-badge visual language.

| Option | Description | Selected |
|--------|-------------|----------|
| Informational only | No click targets; card behavior unchanged | ✓ |
| "Key available" deep-links | Jump to Keys waiting / claim wizard | |
| You decide | | |

**User's choice:** Informational only.

---

## Expiring-soon surface shape

| Option | Description | Selected |
|--------|-------------|----------|
| 4th tab on Humble Keys page | Joins Keys waiting / Giftable spares | |
| Pinned section atop "Keys waiting" | No new tab; group sorts to top | ✓ |
| Own sidebar entry | Max visibility, heaviest option | |

**User's choice:** Pinned section atop "Keys waiting".

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Phase 13 thresholds | Section membership = urgency badge live (≤30d, D-61) | ✓ |
| Tighter window (≤7d only) | Critical keys only | |
| Configurable threshold | Settings knob | |

**User's choice:** Reuse Phase 13 thresholds.

| Option | Description | Selected |
|--------|-------------|----------|
| Move, don't duplicate | One row per key; lifted out of normal grouping | ✓ |
| Duplicate (spotlight) | Featured pattern; key also stays below | |

**User's choice:** Move, don't duplicate; sorted soonest-first.

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden entirely when empty | Matches no-render convention | ✓ |
| Always visible with all-clear note | Permanent vertical noise | |

**User's choice:** Hidden entirely when empty.

---

## Notification behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Digest per sync | One notification summarizing newly-expiring keys | ✓ |
| Per-key notifications | One per key; bundle syncs could fire many | |

**User's choice:** Digest per sync; single-key syncs name the game.

| Option | Description | Selected |
|--------|-------------|----------|
| Focus app on "Keys waiting" | Lands on pinned Expiring-soon section | ✓ |
| Just focus/raise the app | User navigates themselves | |
| No click action | Purely informational | |

**User's choice:** Focus app on "Keys waiting".

| Option | Description | Selected |
|--------|-------------|----------|
| Notify on transition, once per distinct deadline | Persist last-notified expiration per key; changed date re-fires | ✓ |
| Strictly once per key, ever | Permanent mute after first alert | |
| You decide | | |

**User's choice:** Transition-based dedup, once per distinct deadline; survives restarts.

| Option | Description | Selected |
|--------|-------------|----------|
| On by default, toggle in Settings | "Notify when Humble keys gain expiration dates" | ✓ |
| Off by default, opt-in | Undiscoverable | |
| No toggle this phase | Rely on OS-level muting | |

**User's choice:** On by default with a Settings toggle.

---

## Badge↔key matching

| Option | Description | Selected |
|--------|-------------|----------|
| Exact appid only | No fuzzy matching on store badges | ✓ |
| Exact + fuzzy (same as Phase 12) | More coverage, false-positive risk | |
| Exact + fuzzy with "Possible key" hedge | Third badge state | |

**User's choice:** Exact appid only — a missing badge beats a wrong one.

| Option | Description | Selected |
|--------|-------------|----------|
| "Owned" wins, single badge per card | Spare-key info stays in Giftable Spares | ✓ |
| Show both badges | Stacked pills on small cards | |

**User's choice:** "Owned" wins.

| Option | Description | Selected |
|--------|-------------|----------|
| Same set as Keys waiting view (D-53) | selectKeysWaiting membership; badge and view never disagree | ✓ |
| Any non-terminal key | Broader than the waiting view shows | |

**User's choice:** D-53 selectKeysWaiting membership.

| Option | Description | Selected |
|--------|-------------|----------|
| Owned in GameLib library, any source | Steam library OR Humble-derived (ownedElsewhere) | ✓ |
| Humble-derived ownership only | Strict phase-goal reading; silent on Steam-owned titles | |

**User's choice:** Owned anywhere GameLib knows about.

---

## Claude's Discretion

- Exact pill copy/i18n keys and badge placement within DiscountCard layout
- Persisted notified-state storage shape (follow electron-store patterns)
- Digest notification body wording for 2+ keys
- Exact placement of the Settings toggle

## Deferred Ideas

None — discussion stayed within phase scope.
