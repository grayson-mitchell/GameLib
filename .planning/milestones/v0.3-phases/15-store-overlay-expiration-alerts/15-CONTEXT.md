# Phase 15: Store Overlay + Expiration Alerts - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Store browsing surfaces show Humble ownership context as additive badges, and users are alerted when keys gain new expiration deadlines detected on sync. Covers HSTORE-01 (ownership badges on store surfaces) and HSTORE-03 (expiring-soon surface + optional OS notifications for newly-expiring keys). Depends on Phase 12's ownership/dedup machinery; reuses Phase 13's urgency system.

</domain>

<decisions>
## Implementation Decisions

> Numbering continues from Phase 14 to keep v0.3 decision IDs unambiguous. Phase 14 closed at D-77 per its context/verification artifacts — planner should confirm the last used ID in `.planning/phases/14-guided-claim-flow/` and renumber if this range collides.

### Badge surfaces & states (HSTORE-01)
- **D-78:** Ownership badges appear on the **native Discounts screen only** (`src/frontend/screens/Discounts/`, `DiscountCard` components). The Steam Store WebView is untouched — no script injection into Valve's pages.
- **D-79:** **No "New" badge.** Cards badge only when there's something to say: "Owned" or "Key available". Unowned/unkeyed cards stay clean — the Discounts screen already has an owned-filter. This consciously narrows success criterion 1's "each title" wording; the criterion should be read as "each title with ownership context shows a badge".
- **D-80:** Badges reuse the **existing pill-badge visual language** (Phase 13 status-color pills), keeping ownership signaling consistent across the app. No new corner-ribbon or overlay treatment.
- **D-81:** Badges are **informational only** — no click targets; DiscountCard interaction behavior is unchanged.

### Badge ↔ ownership/key matching (HSTORE-01)
- **D-82:** Store badges use **exact Steam appid matches only** — no fuzzy title matching on store surfaces. A missing badge beats a wrong one. (Phase 12's fuzzy tier stays where it is; it does not drive store badges.)
- **D-83:** **"Owned" = owned anywhere GameLib knows about** — in the Steam library or Humble-derived (Phase 12 `ownedElsewhere` already unifies the Humble→Steam direction). The badge answers "do I already have this?"
- **D-84:** **"Key available" = exactly the D-53 `selectKeysWaiting` membership** (`src/common/humble/viewFilters.ts`). Badge and Keys-waiting view can never disagree — what's badged is exactly what's listed.
- **D-85:** When a title is both owned and has an unclaimed spare key, **"Owned" wins — single badge per card**. Spare-key info remains the Giftable Spares view's job (Phase 13).

### Expiring-soon surface (HSTORE-03)
- **D-86:** The expiring-soon surface is a **pinned section at the top of the existing "Keys waiting" view** — no 4th tab, no new sidebar entry.
- **D-87:** Membership reuses **Phase 13 urgency thresholds unchanged** (D-61: badge live at ≤30 days; `warning` ≤30d, `danger` ≤7d). A key enters the pinned section exactly when its urgency badge is live. Zero new threshold logic.
- **D-88:** **Move, don't duplicate** — expiring keys are lifted out of their normal grouping into the pinned section, sorted soonest-expiration-first. Each key has exactly one row.
- **D-89:** When no keys are within the window, the section is **hidden entirely** — consistent with Phase 13's `{ kind: 'none' }` no-render convention.

### Expiration notifications (HSTORE-03)
- **D-90:** **Digest per sync**, not per-key: one OS notification summarizing newly-expiring keys ("3 Humble keys gained expiration dates"); when exactly one key is affected, name the game. Avoids notification storms when a bundle's keys gain deadlines together.
- **D-91:** **Clicking the notification focuses the app on the "Keys waiting" view**, where the pinned Expiring-soon section holds the affected keys.
- **D-92:** **Transition-based dedup, once per distinct deadline:** persist the last-notified expiration value per key (survives restarts). null→date fires; date→*different* date fires again (a moved deadline is new information); re-syncing the *same* date never re-fires.
- **D-93:** Notifications are **on by default with a Settings toggle** ("Notify when Humble keys gain expiration dates") placed alongside GameLib's existing notification/behavior settings. This satisfies HSTORE-03's "optional".

### Claude's Discretion
- Exact pill copy/i18n keys, badge placement within DiscountCard layout, and the persisted notified-state storage shape (follow the existing electron-store patterns).
- How the digest notification body reads for 2+ keys.
- Where in Settings the toggle lands (nearest existing notification-adjacent group).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Key model & sync (expiration detection)
- `src/common/types/humble.ts` — `HumbleKeyState` (UNREVEALED/REVEALED/REDEEMED/UNREDEEMABLE/...), `expiration: string | null`, terminal-state precedence rules (Phase 14 gap-closure comments).
- `.planning/phases/14-guided-claim-flow/14-CONTEXT.md` — D-30 realignment (REDEEMED is local-only; redeemed_key_val = revealed) and end-of-sync gate parity (`getSteamGate` helper, WR-01).

### Urgency & view membership (reused wholesale)
- `src/common/humble/urgencyBadge.ts` — D-61/D-62/D-63 tiers and countdown copy; the ≤30d/≤7d thresholds Phase 15 reuses for pinned-section membership.
- `src/common/humble/viewFilters.ts` — D-53 `selectKeysWaiting` membership that defines the "Key available" badge set and hosts the pinned section.
- `.planning/phases/13-keys-waiting-giftable-spares-views/13-CONTEXT.md` — tab structure and urgency-badge decisions carried forward.

### Ownership matching (badge data source)
- `.planning/phases/12-ownership-dedup/12-CONTEXT.md` — D-35 (Humble-origin annotation lives on Steam details page only) and the exact/fuzzy two-tier matcher; Phase 15 uses the exact tier only.

### Surfaces & notification precedent
- `src/frontend/screens/Discounts/` — the badge host (`DiscountCard`, `DiscountFilters` including the existing owned-filter, `helpers.ts`).
- `src/backend/utils.ts` (~line 192) — existing Electron `new Notification({...})` pattern (Epic-offline notification) to follow for the digest.

### Planning docs
- `.planning/ROADMAP.md` — Phase 15 goal, success criteria, HSTORE-01/HSTORE-03 mapping.
- `.planning/REQUIREMENTS.md` — HSTORE-01, HSTORE-03 wording; HSTORE-02 explicitly deferred to Future (do not build a bundle/deals listing).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/common/humble/urgencyBadge.ts`: pure tier/countdown helpers — pinned-section membership and sorting can be derived from the same expiration math; frontend `UrgencyBadge` component already maps tiers to colors.
- `src/common/humble/viewFilters.ts`: `selectKeysWaiting` (D-53) — both the "Key available" badge set and the view the pinned section modifies.
- Phase 13 pill-badge components (`src/frontend/screens/Humble/Keys/components/`): visual language to reuse on DiscountCard.
- Phase 12 `ownedElsewhere` + exact appid matching: the "Owned" badge data source.
- `src/backend/utils.ts` Electron `Notification` usage: pattern for the OS digest notification.
- electron-store config pattern (per project conventions): persistence for the per-key last-notified-expiration map and the settings toggle.

### Established Patterns
- No-render convention: `{ kind: 'none' }` / null tier → render nothing (applies to empty pinned section and unbadged cards).
- Pure helpers live in `src/common/humble/` (no React, no i18n, no I/O) so they're unit-testable from the backend jest project — new badge/section/dedup logic should follow this split.
- The Steam Store tab is a WebView (Phase 8) — native React store surface is Discounts only, which is why D-78 scopes badges there.

### Integration Points
- `DiscountCard` render path: needs an appid → {owned, keyAvailable} lookup (exact-match only).
- Humble sync completion (Phase 11/14 sync pipeline): the hook point for detecting null→date / date-change transitions and firing the digest.
- "Keys waiting" view (`src/frontend/screens/Humble/Keys/Waiting/`): hosts the pinned Expiring-soon section; keys move out of normal groups into it.
- Settings screen: new toggle near existing notification/behavior options.
- Notification click → navigate/focus the Humble Keys waiting route.

</code_context>

<specifics>
## Specific Ideas

- User's rationale for dropping the "New" badge: badges live only on Discounts, and "there is a filter option for owned anyhow" — the existing owned-filter already covers the discovery need a "New" badge would serve.
- Digest notification single-key form should name the game (e.g., "Celeste's Humble key now expires on ...").

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (HSTORE-02 bundle/deals listing remains deferred at the requirements level, predating this discussion.)

</deferred>

---

*Phase: 15-store-overlay-expiration-alerts*
*Context gathered: 2026-07-09*
