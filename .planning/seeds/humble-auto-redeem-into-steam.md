---
title: Auto-redeem revealed Humble keys straight into Steam
trigger_condition: When the manual Steam key redemption entry point (Phase 26) has shipped and is hardware-verified — i.e. redeemKey() is proven to activate a loose key on the account and surface EPurchaseResult correctly. That path is the dependency; chaining it to Humble reveal is the increment.
planted_date: 2026-07-20
related_phase: 26 (candidate — Steam Key Redemption; this is the follow-on increment)
---

# Seed: Auto-redeem revealed Humble keys into Steam

## The idea

Today the Humble flow **reveals** a Steam key (`doRevealKey`, a Humble-side call) and stops
— the user then types it into Steam by hand. Once GameLib can redeem a loose key into Steam
via `steam-user.redeemKey()` (the manual entry point), close the loop: after a Humble Steam
key is revealed, hand it straight to `redeemKey()` so it lands in the user's Steam library
with no manual step.

**Reveal → redeem, in one action.**

## Why it waits

The manual redemption path (paste-a-key → `redeemKey`) is the load-bearing primitive. Build
and verify that first (user has test keys). This seed is just wiring the revealed Humble key
string into that already-proven call — plus the Humble-specific concerns below.

## Extra concerns unique to the Humble chain

- **Only Steam-platform Humble keys.** The reveal covers many platforms (GOG, Origin,
  direct download). Gate `redeemKey` to `platform === 'steam'` rows only.
- **Reveal is irreversible + rate-limited.** Humble reveal already has cooldown/one-shot
  semantics (`getSyncState().cooldownUntil`, C2 ownership block). Don't reveal-then-fail-
  redeem in a way that burns the reveal with nothing to show. Consider: redeem, and only
  mark the row's terminal state on a known `EPurchaseResult`.
- **Ownership dedup interplay.** Phase 12 `ownedElsewhere` / C2 block already gates reveal.
  A key already owned on Steam should surface as owned, not get redeemed into a duplicate-
  key error.
- **Respect Steam's invalid-key cooldown.** Same account-level activation throttle as the
  manual path — a batch "redeem all revealed" must pace itself.

## Provenance

Grew out of the /gsd-explore session on 2026-07-20. Full technical grounding (redeemKey
signature, EPurchaseResult, home in `user.ts`, recomputeOwnership follow-up) in
`.planning/notes/steam-key-redemption-reveal-vs-activation.md`.
