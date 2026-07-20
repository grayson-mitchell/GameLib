---
title: GOG key redemption + unified "redeem any key" surface
trigger_condition: When Phase 26 (Steam-only key redemption) has shipped AND research Q7 resolves GOG's redeem mechanism (is there an API the existing GOG OAuth session can drive, or is it web-only?). Phase 26's store-aware-ready UI is the hook this plugs into — don't start before Q7 is answered, or the store-routing UX is a guess.
planted_date: 2026-07-20
related_phase: 26 (Steam Key Redemption — this extends it to a second store)
---

# Seed: GOG key redemption + unified redeem surface

## The idea

Extend Phase 26's Steam-only redeem into a second store: let a user redeem a **GOG** code
from inside GameLib too, reusing Phase 26's store-aware-ready entry point. The North Star is
one "redeem a key" surface that covers Steam and GOG (and maybe more later).

## Why it waits

Two hard dependencies, both unresolved today:

1. **No GOG redemption backend exists.** `steam-user.redeemKey()` is Steam-only. GOG
   integration is `gogdl` + OAuth for library/install — not code redemption. GOG codes go
   through GOG's own redeem endpoint. Whether the existing authenticated GOG session can
   drive that via an API (vs. a web-only flow) is **research Q7**.
2. **Format can't reliably pick the store.** Steam's 5-5-5 shape collides with Origin, Uplay,
   Rockstar, Bethesda; GOG has no canonical pattern. So the unified surface almost certainly
   needs an **explicit store choice** (or detect-with-confirm), not silent auto-routing. This
   is exactly why Phase 26's UI was built store-aware-*ready* rather than Steam-hardcoded.

## What Phase 26 already leaves in place for this

- A redeem surface that carries a store field/parameter (Steam is the only wired path today,
  but a GOG path can slot in without a UI rewrite — Phase 26 REQ 6).
- The `EPurchaseResult`-style outcome-branching pattern (success+name / already-owned /
  invalid / rate-limited) to mirror for GOG's own result taxonomy.

## Provenance

Surfaced during /gsd-spec-phase 26 on 2026-07-20 when the user asked whether a key's format
could route it to the right store. Decision: keep Phase 26 Steam-only, design store-aware-
ready, and park GOG here + as research Q7. See `.planning/research/questions.md` Q7 and
`.planning/phases/26-steam-key-redemption/26-SPEC.md`.
