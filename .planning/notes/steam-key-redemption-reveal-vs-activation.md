---
title: Steam key redemption — reveal ≠ activation, and the redeemKey() path
date: 2026-07-20
context: /gsd-explore session — can a Steam activation key be passed to Steam without the user typing it into the Steam client? Established what GameLib does today (reveal only) vs. what redeeming into Steam requires.
related_phase: 26 (candidate — Steam Key Redemption)
---

# Steam Key Redemption — Reveal ≠ Activation

## The question

Can a Steam activation key be handed to Steam **without the user entering it into the
Steam client directly**? Yes — but not the way you'd guess.

## Two paths, one dead end

- **`steam://` protocol — dead end.** `steam://open/activateproduct` opens Steam's
  "Activate a Product" wizard but takes **no key argument** — it just launches the empty
  dialog. There is no documented protocol form that pre-fills or auto-submits a key. This
  cannot deliver "without entering it directly."

- **`steam-user.redeemKey()` — the real path.** Sends a `RegisterKey` message over the
  authenticated CM connection and activates the key **on the logged-in account**, no
  client UI, no manual entry. GameLib already holds this session for library ownership.

## What GameLib does today (verified in code)

- **No `redeemKey` anywhere in `src/`.** GameLib does not push keys to Steam at all.
- Humble's `doRevealKey()` (`src/backend/humble/library.ts:1085`) only asks **Humble** to
  *reveal* the previously-hidden key value. It surfaces the string; it never talks to Steam.
- Phase 14's own note already captured the distinction: **"redeemed_key_val = revealed,
  not activated."** So historical key-activation testing = GameLib revealed the key and the
  **user typed it into Steam manually**.

## The building blocks (verified 2026-07-20)

- `steam-user@5.3.0` installed; `redeemKey` is a real function on the prototype.
- Typed at `@types/steam-user/index.d.ts:790`:
  ```ts
  redeemKey(key: string): Promise<{
    purchaseResultDetails: EPurchaseResult
    packageList: Record<string, string>   // packageid → package name
  }>
  ```
- `EPurchaseResult` distinguishes success / already-owned / invalid key / region-locked /
  rate-limited — exactly the taxonomy a manual-entry UX must branch on. `packageList` gives
  the redeemed game name to show back.
- **Home:** the authenticated Steam client lives in
  `src/backend/storeManagers/steam/user.ts` (`SteamUser` class, set up via
  `clientSetup.ts`, feeding `recomputeOwnership()`). Natural home for a `redeemKey()`
  wrapper. After a successful redeem, trigger `recomputeOwnership()` so the newly-owned
  game appears in the library immediately.

## The one real risk

Steam **aggressively rate-limits invalid-key activations** — too many bad keys in a window
trips a temporary activation cooldown on the *account*. A manual entry point must guardrail
this (throttle, validate/format-check before send, surface the cooldown state), not pass
raw input straight to `redeemKey`. See research question in `.planning/research/questions.md`.

## Desired scope (from the session)

1. **Manual entry point first** — paste any loose Steam key (Fanatical / GMG / physical
   box / a friend) → GameLib redeems via `redeemKey`. User has test keys ready.
2. **Any-store loose keys** — same entry point, generalized.
3. **Auto-redeem revealed Humble keys into Steam** — chain reveal → redeemKey.
   See `.planning/seeds/humble-auto-redeem-into-steam.md`.
