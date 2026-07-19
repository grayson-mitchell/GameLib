# Feature Research: Humble Bundle Key Management (v0.3)

**Domain:** Third-party key management integration in a multi-store game launcher
**Researched:** 2026-07-05
**Confidence:** HIGH (ecosystem well-studied; multiple community tool implementations examined)

> This file replaces the v0.1 Steam Store Manager FEATURES.md. The v0.1 Steam feature
> analysis is preserved in the Phase 1–5 planning artifacts. This document covers
> Humble Bundle key management only.

---

## Research Scope: 5 Specific Questions

### Q1 — Key Lifecycle & Claim-Status Detection

**Finding: The REVEALED state with a local flag is the right design, but no reference implementations exist.**

Every community tool examined (Playnite HumbleKeysLibrary, FailSpy humble-steam-key-redeemer,
castanley humble-steam-redeem) uses a binary model:

- `redeemed_key_val` present → key revealed/redeemed ("Key: Redeemed" in Playnite)
- `redeemed_key_val` absent → key not yet touched ("Key: Unredeemed" in Playnite)

None of them distinguish "revealed but not yet activated" from "unrevealed." They conflate
the two because the Humble API gives no way to distinguish them without local state.

**The spec's local-REVEALED-flag approach is correct and is the standard one in theory, but
no existing tool implements it in practice.** This is a complexity driver: there are no
reference implementations to draw from for the three-way split.

**Edge case the spec must accept:** If a user reveals a key on Humble's website (outside the
launcher), the local REVEALED flag won't be set. That key will appear as UNREVEALED in the
launcher until the user actually activates it (at which point `redeemed_key_val` becomes
present → transitions to REDEEMED automatically on next sync). This is the accepted
limitation of a locally-tracked state. The spec should document this.

**UNREDEEMABLE detection** is straightforward via the `is_expired` field in the Humble API.
Note: expirations are being retroactively applied (see Q3) — the `is_expired` flag must be
recomputed on every sync, not cached.

**UNPICKED detection** via `product.category == 'subscriptioncontent'` + `choice_url` is
reliable and unambiguous.

---

### Q2 — Ownership-Aware Dedup

**Finding: AppID-first is the standard approach, and `steam_app_id` IS in the Humble API data.**

The FailSpy humble-steam-key-redeemer reads `steam_app_id` directly from the Humble order
API (`tpkd_dict.all_tpks[n].steam_app_id`). This means for Steam-type keys, AppID-based
matching is both available and authoritative. The matching hierarchy used in practice:

1. **AppID primary** — check `steam_app_id` field in Humble key against `getOwnedApps()`
   (already fetched by the existing Steam integration from v0.1). This is exact, no ambiguity.
2. **Fuzzy name fallback** — used when `steam_app_id` is absent (can happen with older
   bundles). Community norm: fuzzywuzzy `token_set_ratio` / `token_sort_ratio` at ~70%
   similarity threshold.

**DLC/edition false-match risk is real.** At 70% similarity, "Vampire Survivors: Operation
Tides of the Foscari DLC" can match "Vampire Survivors" and flag ownership incorrectly.
This wastes a gift opportunity: the user sees "you own this" (via the DLC), doesn't reveal
the full-game key, and then can't easily recover.

**Recommendation for the spec:** Raise the fuzzy threshold to 85%+ for the `owned_elsewhere`
determination. False negatives (saying you don't own something you actually do) are safe
(you'll see the key in "Keys waiting" and can decide). False positives (saying you own
something you don't) waste the gift link opportunity.

**Dedup collapse (F3) is a genuine gap in the ecosystem.** Playnite's HumbleKeysLibrary
does NOT dedup — it imports Humble keys as separate library entries even for keys already
redeemed to Steam, causing visible duplicates. GameLib's dedup (collapsing redeemed Steam
keys onto their existing Steam library entry with a "Humble source" annotation) is
materially better than any existing tool.

---

### Q3 — "Keys Waiting" / Expiration-Urgency Surfacing

**Finding: Table stakes, not differentiator — the expiration crisis makes this urgent.**

Humble Bundle altered its TOS in December 2024 to impose a 3-year expiration on unrevealed
keys, applied retroactively to all prior purchases — without email notice. The AlexanderTheGrey
GitHub repository tracks 400+ title-specific expiration issues through early 2027. Expirations
are being retroactively shortened without warning, and Humble's own interface does not surface
expiring keys prominently.

Community users on SteamGifts have been manually maintaining shared expiration lists. The
explicit user request in community threads is: "a filter/dedicated page that lists expiring
keys from purchases."

**The "Keys waiting" view (F4) is now table stakes.** Users who install a Humble integration
without this will immediately notice they can't find expiring keys. The pain is real and
current.

**Sort by expiration urgency** is the essential complement — without sorting, a large Humble
library (hundreds of orders) buries the urgent keys.

**Notification** (optional in the spec) would be differentiating on top of the mandatory view.

---

### Q4 — Giftable-Spares Handling

**Finding: Gift links are real, destructive-if-missed, and no launcher surfaces them proactively.**

Gift link mechanics confirmed from community discussions:
- Gift links exist only for UNREVEALED keys. Once a key is revealed (you see the key string),
  the gift link is consumed/void. This is the mechanism that makes revealing irreversible.
- Sending a gift link delivers a secondary link to the recipient via email; the recipient visits
  it and receives the key. The original owner never sees the key value.
- The gift link URL is in the Humble API data for unrevealed keys.

**No existing launcher surfaces "you own this elsewhere — here's the gift link" proactively.**
The castanley humble-steam-redeem tool preserves unrevealed keys when it detects ownership
(doesn't reveal them), but it doesn't present a "giftable spares" view — it just skips those
keys during bulk processing.

**F6 (giftable-spares view) is a genuine differentiator.** The combination of:
- `owned_elsewhere == true` (Steam ownership detected)
- `state == UNREVEALED` (gift link still available)
- Proactive surface of the gift link + 1-click copy

...is not implemented by any existing tool in a launcher context.

**Presentation norm**: "You already own [Game] on Steam. Gift this key to a friend →
[Copy gift link]" with a warning that reveals cannot be undone if they choose to reveal
instead.

---

### Q5 — Guided Claim Flow: Steam Activation Deep-Link

**Finding: `steam://open/activateproduct` does NOT pre-fill the key. Use the web URL.**

Confirmed from multiple Steam community discussions: `steam://open/activateproduct` opens
Steam's activation dialog but the key field is blank. The user must manually paste the key.
Some users report the protocol stopped working entirely in newer Steam client versions.

**The web URL `https://store.steampowered.com/account/registerkey?key=XXXXX` CAN pre-fill the
key via the `?key=` query parameter.** The user lands on the page with the key pre-filled and
just clicks "Continue." This works in any browser on Windows, macOS, and Linux.

**Recommended claim flow for F5:**

1. User clicks "Reveal & Claim" on an UNREVEALED Steam key (with warning shown).
2. Launcher calls Humble API to reveal the key (gets `redeemed_key_val`).
3. Launcher immediately copies the key to clipboard.
4. Launcher opens `https://store.steampowered.com/account/registerkey?key=[KEY_VALUE]` in
   the default browser. (Pre-filled; user just clicks Continue.)
5. Toast: "Key copied to clipboard — browser opened with key pre-filled."
6. UI shows a "Mark as redeemed" button. User clicks after activation.
7. Launcher sets local state to REDEEMED + writes audit record.

**Why not `steam://open/activateproduct`:**
- Does NOT pre-fill the key (user must paste manually)
- Unreliable on some Steam installations, especially Linux Flatpak/Snap installs
- Some users report it stopped working in recent Steam client versions

**Spec adjustment needed:** F5 currently lists `steam://open/activateproduct` as the primary
with the web URL as parenthetical fallback. This should be reversed. The spec's approach is
correct in principle (user-initiated, explicit, auditable) but the implementation detail
needs updating.

**Cross-platform reliability:** Web URL works on all three platforms. `steam://` reliability
varies especially on Linux where Steam may be installed via Flatpak/Snap (different protocol
handler registration). Web URL is the safe default.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the Humble integration to feel complete. Missing = product
feels broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Library sync (F1) | Nothing works without it | MEDIUM | Humble auth (email+OTP) + order API pagination + aggressive caching behind adapter (C5) |
| Claim-status classification (F2) | Users need to know what's claimable vs. already gone | MEDIUM | Binary API detection is easy; local REVEALED flag + persistence adds complexity; no reference implementations for 3-way split |
| "Keys waiting" view (F4) | Retroactive expirations make this urgent; Humble's own UI is inadequate | LOW | Filter + sort on existing data model; depends on F2 + F3 |
| Expiration urgency sort (F8) | 400+ documented titles with expiration issues; community explicitly requests this | LOW-MEDIUM | Recompute on each sync (retroactive expirations mean cached dates can change) |
| Guided claim flow (F5) | Users need a path to actually claim keys | MEDIUM | Web URL pre-fill preferred over steam://; clipboard copy mandatory; user-confirms REDEEMED (can't auto-detect) |
| Non-Steam key handling (F9) | Non-Steam keys are "dark matter" without this; confusing UX | LOW | Display key_type, show key, link out to platform; no activation logic |
| Owned-elsewhere dedup (F3) | Without dedup, the unified library gains noise duplicates — counter to core value prop | MEDIUM-HIGH | AppID-first (steam_app_id available in API); fuzzy fallback; collapse onto Steam entry |
| Auth persistence (F1 dependency) | Users expect to log in once | MEDIUM | Email + OTP flow; persist session encrypted (C4); no OAuth available |

---

### Differentiators (Competitive Advantage)

Features that set GameLib apart from Playnite plugins and CLI tools. Not expected, but
valued and visibly better than alternatives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Local REVEALED flag tracking (F2 enhancement) | Prevents revealed-but-unactivated from regressing to UNREVEALED; no tool does this | MEDIUM | Local-only; edge case: keys revealed on Humble's site appear UNREVEALED until activated |
| Giftable-spares view (F6) | Turns duplicates into value (gift links); no launcher does this proactively | LOW-MEDIUM | owned_elsewhere + UNREVEALED → surface gift link + copy; warn about irreversibility |
| Dedup collapse onto Steam library entry (F3 advanced) | Redeemed keys appear as annotations on Steam entries, not as duplicates; Playnite doesn't do this | HIGH | Requires careful data model — Steam entry carries "Humble origin" metadata; UI for annotated entries |
| Reveal/redeem audit record (C6) | Accountability; helps users who want to review actions | LOW | Local timestamped log; what key, when, what platform, outcome |
| Store overlay with ownership badges (F7) | "Owned / Unclaimed key / New" badges while browsing — saves re-buy mistakes | HIGH | Requires cross-referencing unified library in real-time as user browses; badge rendering on existing store surface |
| owned_elsewhere intercept on claim path (C2) | Intercepts potentially wasteful reveal with "you own this — gift instead?" | LOW | Guard in the guided claim flow; routes to F6 instead of proceeding |
| Expiration notifications (F8 extension) | Proactive alert before keys expire; no tool provides this in a launcher context | MEDIUM | Optional notification; requires OS notification API integration |

---

### Anti-Features (Explicitly Avoid)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-reveal / "reveal all" | Users want to quickly see all keys | Forfeits gift links permanently; sacrifices giftable-spares path; can start expiration clocks | Per-key explicit reveal only (C1); "Keys waiting" view makes individual reveals easy |
| Automated/unattended bulk redemption | Saves time for users with hundreds of keys | Steam rate-limits at ~50 successful/~10 failed keys per hour; bulk automation triggers flagging; ToS grey zone (C3) | User-initiated, per-key flow with clipboard + browser; satisfies the same goal safely |
| `steam://open/activateproduct` as primary activation | Familiar Steam protocol; seems natural for a launcher | Does NOT pre-fill the key; unreliable on Linux (Flatpak/Snap Steam installs); some users report it broken in recent Steam versions | Web URL `registerkey?key=` as primary; clipboard copy as mandatory companion |
| DRM-free Humble download management | Some Humble purchases are DRM-free installers | Separate download manager with version tracking, platform detection, delta updates — full feature scope; audience overlap unclear | Out of scope v1; if needed later, implement as a separate phase with its own research |
| In-app Humble checkout / purchasing | Single interface for discovery + purchase | Requires Humble partnership or purchase-flow reverse-engineering; ToS risk; read-only store surface is defensible | Read-only bundle listing + "Buy on Humble" deep-link (F7) |
| One-click activation for non-Steam key types | Convenience for GOG/Epic/Ubisoft keys | Each platform has its own auth flow, activation API, and ToS; scope of 4–5 platform integrations is enormous | "Redeem on {platform}" link-out (F9); copy key to clipboard; user completes in their own client |
| Automated REDEEMED state detection | Launcher knows automatically when you activated a key | Steam provides no callback; polling `redeemed_key_value` only changes after Humble's server updates (can lag hours); creates false confidence | User-initiated "Mark as redeemed" button after they complete activation in browser |

---

## Feature Dependencies

```
F1 — Library sync + Humble auth
  └── everything below depends on F1

F2 — Claim-status classification
  └── requires: F1 (order data)
  └── requires: local state store (REVEALED flag, audit log)
  └── blocks: F4, F5, F6, F9

F3 — Ownership-aware dedup
  └── requires: F1 (Humble library data, including steam_app_id field)
  └── requires: existing Steam library (getOwnedApps() from v0.1 Steam integration)
  └── blocks: F4 (owned_elsewhere filter), F6 (owned_elsewhere + UNREVEALED), F7 (owned badge)

F4 — "Keys waiting" view
  └── requires: F2 (state), F3 (owned_elsewhere)
  └── enhances: F8 (expiration sort on the same view)

F5 — Guided claim flow
  └── requires: F2 (UNREVEALED state detection)
  └── requires: C2 guard (check owned_elsewhere before proceeding → routes to F6)
  └── depends on: web URL activation (registerkey?key=) + clipboard copy

F6 — Giftable-spares view
  └── requires: F2 (UNREVEALED state), F3 (owned_elsewhere)
  └── enhances: F5 (intercept path from claim flow)

F7 — Store overlay / ownership badges
  └── requires: F3 (owned_elsewhere for any game in any store context)
  └── requires: Humble public bundle-listing API (separate from order API)
  └── independent of F4, F5, F6

F8 — Expiration & urgency alerts
  └── requires: F1 (expiration field from Humble API, recomputed on each sync)
  └── enhances: F4 (sort dimension on "Keys waiting" view)
  └── optional extension: OS notification (Electron notification API)

F9 — Non-Steam key handling
  └── requires: F2 (key_type classification)
  └── no dependency on F3 (ownership dedup only covers Steam keys in v1)
```

### Key Dependency Notes

- **F3 depends on v0.1 Steam integration**: The `owned_elsewhere` flag uses `getOwnedApps()`
  from the existing Steam store manager. If the Steam account is not connected, `owned_elsewhere`
  falls back to name-match-only or degrades gracefully to `false` (keys appear as unowned).
- **F5 cannot auto-confirm REDEEMED**: Steam provides no callback. The "mark as redeemed"
  step is a deliberate user action, not an automated detection. This is correct per C6.
- **F7 is the most isolated feature**: Store overlay does not require the key lifecycle model;
  it only needs the `owned_elsewhere` cross-reference. But it has its own data source dependency
  (Humble's public bundle-listing endpoint, separate from the order/key API).

---

## Spec Model Validation / Adjustment Flags

### Validated

| Spec Element | Verdict | Basis |
|---|---|---|
| 5-state model (UNPICKED/UNREVEALED/REVEALED/REDEEMED/UNREDEEMABLE) | VALID | More complete than any existing tool; necessary for correctness |
| Local REVEALED flag (no API backing) | VALID | Confirmed: no tool has found a better approach; API simply does not distinguish revealed-but-unactivated |
| C1 (never auto-reveal) | VALID | Gift link loss is real and permanent; all careful tools preserve unrevealed keys |
| C3 (no bulk unattended redeem) | VALID | Steam rate-limit confirmed at ~50 successful/~10 failed keys/hour |
| owned_elsewhere overlay (orthogonal to state) | VALID | Correct model; community tools implement a weaker version of this |
| AppID-first matching | VALID | `steam_app_id` IS in the Humble API response (confirmed from FailSpy source code) |
| Fuzzy name fallback with DLC/edition guard | VALID (threshold too low) | 70% threshold too permissive; recommend 85%+ for owned_elsewhere determination |
| Expiration recomputed on each sync | VALID | Retroactive expiration policy makes cached dates stale |

### Needs Adjustment

| Spec Element | Issue | Recommendation |
|---|---|---|
| F5: `steam://open/activateproduct` as primary | Does NOT pre-fill the key; unreliable on Linux | Flip to web URL `registerkey?key=` as primary; clipboard copy mandatory; `steam://` removed or listed as secondary only |
| F5: REDEEMED marking after "user confirms activation" | Correct intent, but needs explicit UI | Add a prominent "I activated it" confirmation button in the post-reveal flow; do not auto-detect |
| §5 Matching: "guarding against DLC/edition false-matches" | Fuzzy threshold unspecified | Define threshold explicitly at 85%+ for ownership determination; document that false negatives are safe, false positives waste gift links |
| §2.1 REVEALED state edge case | Not acknowledged | Add explicit note: keys revealed outside the launcher appear as UNREVEALED until activated (when `redeemed_key_val` becomes present). This is an accepted limitation, not a bug. |
| Appendix A: API reference | Missing `steam_app_id` field | Add `tpkd_dict.all_tpks[n].steam_app_id` — this is the primary match key for Steam-type keys, available directly in the order response |

---

## Prioritization Matrix

| Feature | User Value | Impl Cost | Priority | Phase Candidate |
|---------|------------|-----------|----------|-----------------|
| Humble auth + library sync (F1) | HIGH | MEDIUM | P1 | Phase 1 |
| Claim-status classification (F2) | HIGH | MEDIUM | P1 | Phase 1 |
| Owned-elsewhere dedup — AppID path (F3) | HIGH | LOW-MEDIUM | P1 | Phase 2 |
| "Keys waiting" view (F4) | HIGH | LOW | P1 | Phase 2 |
| Expiration urgency sort (F8) | HIGH | LOW | P1 | Phase 2 |
| Guided claim flow — web URL path (F5) | HIGH | MEDIUM | P1 | Phase 3 |
| Non-Steam key link-out (F9) | MEDIUM | LOW | P1 | Phase 3 |
| Giftable-spares view (F6) | MEDIUM | LOW-MEDIUM | P2 | Phase 3 |
| Local REVEALED flag + audit record (C6) | MEDIUM | LOW | P1 (correctness) | Phase 1 (with F2) |
| Dedup collapse onto Steam entry (F3 full) | MEDIUM | HIGH | P2 | Phase 4 |
| Store overlay / ownership badges (F7) | MEDIUM | HIGH | P2 | Phase 4 |
| Expiration notifications (F8 extension) | LOW-MEDIUM | MEDIUM | P3 | Phase 4+ |
| Owned_elsewhere intercept (C2 guard) | HIGH (safety) | LOW | P1 (in F5) | Phase 3 (in claim flow) |

---

## Competitor Feature Analysis

| Feature | Playnite HumbleKeysLibrary | castanley humble-steam-redeem | FailSpy humble-steam-key-redeemer | GameLib Target |
|---------|----------------------------|---------------------------------|-----------------------------------|----------------|
| Key state model | Binary (Redeemed/Unredeemed/Unredeemable) | Binary (redeemed/skipped/failed) | Binary (revealed/unrevealed) | 5-state with local REVEALED flag |
| Ownership detection | None (duplicates are known issue) | Fuzzy name match (Steam Web API key required) | AppID + fuzzy (70%) | AppID-first (from Humble API) + fuzzy (85%+) |
| Dedup collapse | No (duplicates appear) | N/A (CLI tool, not launcher) | N/A | Yes — collapse onto Steam library entry |
| "Keys waiting" view | No (tag-based filter in Playnite) | No | No | Yes — dedicated view, sorted by expiration |
| Gift link surfacing | No | Preserves (doesn't reveal) but no view | Preserves (doesn't reveal) but no view | Yes — giftable-spares view with copy button |
| Activation deep-link | Not implemented | N/A | steam://open/activateproduct | Web URL registerkey?key= (pre-filled) |
| Audit record | No | CSV output | No | Yes — local reveal/redeem log |
| Expiration urgency | No | No | No | Yes — sort + optional notification |
| REVEALED state persistence | No | No | No | Yes — local flag (novel in ecosystem) |

---

## Sources

- [Playnite HumbleKeysLibrary GitHub](https://github.com/Dasmius007/HumbleKeysLibrary) — tag model, binary state detection confirmed — HIGH confidence
- [HumbleKeysLibrary source (JustinHardage fork)](https://github.com/JustinHardage/HumbleKeysLibrary/blob/master/HumbleKeysLibrary.cs) — `GetOrderRedemptionTagState()` implementation; no REVEALED state — HIGH confidence
- [FailSpy humble-steam-key-redeemer](https://github.com/FailSpy/humble-steam-key-redeemer) — confirmed `steam_app_id` field in Humble API; 70% fuzzy threshold — HIGH confidence
- [castanley humble-steam-redeem](https://github.com/castanley/humble-steam-redeem) — ownership detection, giftable-spares preservation, rate-limit handling — HIGH confidence
- [AlexanderTheGrey/humble-bundle-redemption-issues](https://github.com/AlexanderTheGrey/humble-bundle-redemption-issues) — 400+ documented expiration issues; retroactive policy — HIGH confidence
- [Steam Community: steam://open/activateproduct reliability discussion](https://steamcommunity.com/discussions/forum/1/4362375983952654017/) — confirmed does not pre-fill key — HIGH confidence
- [Steam Community: registerkey web activation](https://steamcommunity.com/discussions/forum/1/3729575905262032515/) — confirmed `?key=` parameter pre-fills field — HIGH confidence
- [SteamGifts: Humble Bundle expiration warning](https://www.steamgifts.com/discussion/QbyR5/warning-humble-bundle-shortens-key-expiry-without-warning) — community expiration crisis evidence — MEDIUM confidence
- [ResetEra: Humble Bundle 3-year expiration policy](https://www.resetera.com/threads/humble-bundle-unused-not-revealed-game-codes-expire-after-3-yrs-now-humble-is-not-obligated-to-provide-keys-in-case-of-them-being-out-of-stock.1112754/) — TOS change December 2024 — HIGH confidence
- [SteamGifts: Humble gift link discussion](https://www.steamgifts.com/discussion/sYPGI/humble-bundle-key-or-gift-link) — gift link mechanics confirmed — MEDIUM confidence

---

*Feature research for: Humble Bundle key management integration (GameLib v0.3)*
*Researched: 2026-07-05*
