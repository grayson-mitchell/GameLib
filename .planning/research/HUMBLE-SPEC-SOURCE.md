# Feature Spec: Humble Bundle Integration

**Status:** Draft · **Owner:** _(you)_ · **Target:** Cross-store game launcher

> This document is a grounding spec for implementation (including AI-assisted work in
> Claude Code). Treat the **Constraints** section as hard rules, not suggestions. When a
> requirement and a constraint appear to conflict, the constraint wins.

---

## 1. Context & goal

The launcher already integrates Steam (official Web API), with GOG/Epic/Amazon in scope.
Humble Bundle is different: **there is no official public API**. Access to a user's library
is via an *undocumented, session-authenticated* order API (the same one the Humble app and
website use), which mature community libraries already wrap.

The primary value of Humble integration is **key management**, not game launching. A Humble
library is mostly a pile of third-party keys (predominantly Steam), many **unclaimed**. The
feature exists to solve two concrete user pains:

1. **Never re-buy a game you already own** (as a redeemed game *or* as an unclaimed key).
2. **Never lose a key** to expiration or to being buried in Humble's order history — and make
   claiming or gifting it easy.

Non-goal: reselling Humble as a storefront inside the launcher. Store surface is read-only
plus deep-links (see §3).

---

## 2. Domain model (key lifecycle)

Every Humble entitlement is modelled as a **key** with a lifecycle **state** plus an
orthogonal **ownership overlay**. Getting this model right is the core of the feature.

### 2.1 States

| State | Meaning | Detection | Giftable? |
|---|---|---|---|
| `UNPICKED` | Humble Choice/Monthly month where the user hasn't selected games yet | `product.category == 'subscriptioncontent'` with a `choice_url`, no key allocated | n/a |
| `UNREVEALED` | Key allocated but not exposed; gift link still available | `redeemed_key_value` absent **and** not locally marked revealed | **Yes** |
| `REVEALED` | Key string exposed to the user, not yet confirmed activated on target store | Locally tracked after a reveal action | No (typically) |
| `REDEEMED` | Activated on the target store; now in the owned library there | `redeemed_key_value` present | No |
| `UNREDEEMABLE` | Expired, revoked, or a bundle whose choices are exhausted | Expiration passed / flagged by Humble | No |

> **Note on `REVEALED`:** Humble itself only distinguishes "has `redeemed_key_value`" vs not.
> The app must persist its own `REVEALED` flag locally, because a revealed-but-not-yet-activated
> key still lacks `redeemed_key_value` and would otherwise look identical to `UNREVEALED`.

### 2.2 Transitions

```
UNPICKED ──pick choice──▶ UNREVEALED ──reveal (DESTRUCTIVE)──▶ REVEALED ──activate──▶ REDEEMED
                              │
                              ├──gift (uses gift link)──▶ [leaves user's actionable set]
                              │
UNREVEALED / REVEALED ──expiration hits──▶ UNREDEEMABLE
```

### 2.3 Ownership overlay (orthogonal to state)

Each key also carries an `owned_elsewhere` boolean, derived by matching against the launcher's
unified library (primarily Steam ownership via the Steam Web API). This overlay — not the key
state — drives the app's *recommendation* for each key:

- `owned_elsewhere == false` and state ∈ {`UNPICKED`,`UNREVEALED`,`REVEALED`} → **"Claim this."**
- `owned_elsewhere == true` and state == `UNREVEALED` → **"Keep as a giftable spare — do not redeem."**

### 2.4 Key attributes to capture

Per key: `title`, `key_type` (target service: Steam/Epic/Ubisoft/GOG/Battle.net/…),
`state`, `owned_elsewhere`, `gift_link` (if unrevealed), `expiration` (if any),
`source_bundle`, `humble_gamekey` (order id), and the local `revealed_at` timestamp.

---

## 3. Functional requirements

### F1 — Library sync
Authenticate to Humble, fetch the gamekey/order list, then fetch each order and enumerate
`tpkd_dict.all_tpks[]`. Normalize into the domain model (§2). **Cache aggressively** to a local
store; do not re-hit Humble when a valid cache exists.

### F2 — Claim-status classification
Classify every entitlement into a §2.1 state. Persist the local `REVEALED` flag so
revealed-but-unactivated keys don't regress to `UNREVEALED`.

### F3 — Ownership-aware dedup
Cross-reference every key against the unified library (Steam first, via owned-games list).
Set `owned_elsewhere`. Dedup so a Humble Steam key already redeemed into Steam is not shown as
a separate "game" — it collapses onto the Steam library entry, annotated with its Humble origin.

### F4 — "Keys waiting" view
Surface entitlements that are **not owned** and **not redeemed** (`owned_elsewhere == false`
and state ∈ {`UNPICKED`,`UNREVEALED`,`REVEALED`}). This is the headline anti-loss / anti-re-buy
list. Sort by expiration urgency (see F8), then title.

### F5 — Guided claim flow
For a selected `UNREVEALED` Steam key: on explicit user action only, reveal the key, then hand
off to Steam activation via `steam://open/activateproduct` (or the web `registerkey` URL).
After the user confirms activation, mark `REDEEMED`. See constraints C1 and C2.

### F6 — Giftable-spares view
List keys where `owned_elsewhere == true` and state == `UNREVEALED`. Expose/copy the Humble
gift link. This turns duplicates into a usable feature rather than waste.

### F7 — Store overlay (ownership-aware browsing)
When the user browses any store surface in the launcher (Humble deals or otherwise), badge each
title with one of: **Owned** / **Unclaimed key available** / **New**. Store integration is
otherwise read-only: show current bundles/deals via the public bundle-listing data, and
"Buy on Humble" deep-links to Humble's site. No in-app checkout.

### F8 — Expiration & urgency alerts
Flag keys with an `expiration` date and `UNPICKED` Choice months at risk of lapsing. Provide an
"expiring soon" surface and (optionally) notifications. Expirations may be applied
retroactively, so recompute on each sync.

### F9 — Non-Steam key handling
Keys with `key_type` other than Steam (Epic, Ubisoft, GOG, Battle.net, non-game software) are
shown with a "redeem on {platform}" link and marked **out of scope for one-click claim** in v1.
Do not attempt auto-activation for these.

---

## 4. Constraints (hard rules)

- **C1 — Never auto-reveal.** Revealing a key is semi-destructive: it forfeits the gift link and
  can start expiration/return clocks. Reveal happens only on an explicit, per-key user action,
  behind a clear warning. No "reveal all."
- **C2 — Guard against wasting keys.** Before revealing/redeeming, check `owned_elsewhere`. If the
  game is already owned, intercept and offer the giftable-spare path (F6) instead of redeeming.
- **C3 — Respect rate limits; no hands-free bulk redeem.** Cache everything; back off on fetches;
  keep claim/reveal actions user-initiated and throttled. Bulk unattended activation is exactly
  the pattern that gets Steam accounts rate-limited or flagged.
- **C4 — Protect secrets.** Store the Humble session encrypted at rest. Never write key values or
  gift links to logs. Treat revealed key strings as sensitive.
- **C5 — Isolate behind an adapter.** The Humble API is undocumented and may break without notice.
  Put all Humble access behind a single adapter interface so a Humble-side change can't ripple
  through the launcher.
- **C6 — Reveal/redeem are user-initiated and auditable.** Every reveal and redeem is triggered by
  the user and recorded locally (what, when, outcome) so the user can review actions taken.

---

## 5. Non-functional considerations

- **Authentication.** No OAuth. Login is email/password → session cookie, and "Humble Guard" may
  email a one-time code. Support the emailed-code step; persist the session so users log in once.
- **Caching & politeness.** Cache orders/purchases/memberships locally. Concurrency for the
  initial fetch is fine, but bound it and back off; never spam on routine refresh.
- **Matching.** Use `key_type` for the target store and match to the unified library by Steam
  AppID where possible; fall back to fuzzy name matching, guarding against DLC/edition
  false-matches.
- **Fragility & errors.** Assume periodic breakage of the undocumented API. Fail soft: show the
  cached library and a clear "couldn't refresh" state rather than erroring the whole launcher.
- **ToS.** Automated reveal/redeem lives in a grey zone. Keeping actions user-initiated and
  throttled (C1, C3, C6) is both the safer product design and the more defensible one.

---

## 6. Out of scope (v1)

- In-app Humble checkout / purchasing.
- One-click activation for non-Steam key types (F9 links out instead).
- Automated/unattended bulk redemption.
- Managing DRM-free Humble downloads (installers hosted by Humble) — can be a later phase; this
  spec is key-focused.

---

## 7. Open decisions

1. **Language / stack + community library.** The launcher's stack determines which wrapper to
   build on (Python and Node.js Humble libraries exist). Confirm the chosen library is currently
   maintained and that its login flow still works against Humble Guard before committing.
2. **Local persistence.** Where/how to store the local `REVEALED` flag, action audit log, and
   library cache.
3. **Unified-library match key.** Confirm Steam AppID is reliably available for matching; define
   the fuzzy-match fallback and its confidence threshold.
4. **DRM-free downloads.** Decide whether/when to add the DRM-free installer management phase.

---

## 8. Acceptance criteria (v1)

Given an authenticated Humble account synced into the launcher:

- Every entitlement is classified into exactly one §2.1 state, and `owned_elsewhere` is set by
  cross-referencing Steam ownership.
- The "keys waiting" view (F4) lists unowned, unredeemed entitlements and surfaces expiring ones
  first.
- No key is ever revealed without an explicit user action (C1); attempting to redeem a key for an
  already-owned game routes to the giftable-spare path (C2, F6).
- The guided claim flow (F5) reveals a Steam key on demand and deep-links to Steam activation,
  then records the outcome.
- Humble Steam keys already redeemed into Steam collapse onto the existing Steam library entry
  rather than appearing twice (F3).
- All Humble access sits behind the adapter interface (C5); a simulated Humble failure degrades to
  the cached library without breaking the launcher (fail-soft).

---

## Appendix A — API reference notes (unofficial)

- **No official public API.** Access mirrors the Humble app/website's private endpoints.
- **Order list:** returns the user's gamekeys.
- **Order by gamekey:** returns `subproducts[]` and `tpkd_dict.all_tpks[]`.
- **Key fields:**
  - `tpkd_dict.all_tpks[n].redeemed_key_value` — present ⇒ `REDEEMED`; absent ⇒ not yet redeemed.
  - `tpkd_dict.all_tpks[n].key_type` — target service (Steam/Epic/Ubisoft/…).
  - `product.category == 'subscriptioncontent'` + `product.choice_url` — Humble Choice content
    (used to detect `UNPICKED` months and group by bundle).
- **Auth:** session-cookie based; "Humble Guard" may require an emailed one-time code.
- All of the above is undocumented and may change without notice — see constraint C5.
