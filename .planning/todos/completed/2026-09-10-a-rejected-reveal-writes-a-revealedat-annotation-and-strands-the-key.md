---
created: 2026-09-10
title: "A server-rejected reveal writes a `revealedAt` annotation and strands the key — the claim path becomes permanently unreachable for any key Humble declines"
area: humble-claim
severity: major
platform: any
ready: code
source: "observed live during Phase 43's D-43-11 probe (43-03), on the operator's real library"
---

## What happened, measured

Phase 43's D-43-11 probe drove one real `gog_keyless` entitlement (Racine, `racine_gog`,
gamekey `U55dBC8dVKUvUyts`) through `revealKey()`. Preconditions were verified before the click:
`state: UNREVEALED`, `ownedElsewhere: false`, no pre-existing reveal annotation.

Humble's server returned a **definitive denial**:

```
Humble reveal: rejected by server (definitive denial, keeping REVEALED flag): U55dBC8dVKUvUyts racine_gog
Humble adapter: /humbler/redeemkey reveal rejected by server success=false keyPresent=false errorMsgLength=32
```

Afterwards:

- `humble_revealed.json` gained `racine_gog` → `{"revealedAt": 1788999862004}`, written at the
  exact moment of the rejection.
- The cached key state moved `UNREVEALED` → `REVEALED` on the next sync.
- **The operator checked gog.com directly: the game was never granted.**

So nothing was revealed and nothing was delivered, yet the app recorded a success annotation.

## Why it matters

`doRevealKey` (`src/backend/humble/library.ts`) refuses any key whose state is not `UNREVEALED`.
Because the rejection moved the key to `REVEALED`, **the operator can no longer attempt this claim
through GameLib at all.** One failed attempt permanently removes the only in-app path to a key the
user owns and has not received.

This is not specific to `gog_keyless`. Any key Humble declines — for any reason, including
transient policy or an unlinked downstream account — gets stranded the same way. The blast radius
is every future declined reveal.

## The inference that is wrong

The log message "keeping REVEALED flag" shows this is deliberate: a definitive denial is being
read as evidence the key was already revealed or redeemed upstream, so local state is advanced to
match.

That inference is refuted by this observation. The server declined **and** the game was never
granted. "Humble said no" and "Humble already gave it to you" are different facts, and the current
code cannot tell them apart — it assumes the second whenever it sees the first.

## What a fix has to decide

The honest fix is not simply "don't write the annotation". A denial genuinely is ambiguous — it
*can* mean already-redeemed. The code needs a state that means **"attempted, refused, cause
unknown"** rather than collapsing it into `REVEALED`, and the claim path must stay reachable from
that state so the user can retry or route to the store page.

Note the diagnostic constraint: Humble's actual error message is redacted under the C5 isolation
wall (only `errorMsgLength=32` survives). Any fix that tries to branch on *why* the server said no
has to confront that the reason is deliberately unavailable. Widening the C5 redaction to read it
is a separate decision and should not be smuggled in as part of this fix.

## Reproduction

Not repeatable on the original sample — the annotation moved it out of `UNREVEALED`, which is the
bug. Reproducing needs another key the server will decline, or a test that stubs the adapter to
return `success=false` and asserts that no `revealedAt` is written and that the key remains
claimable.

## Related

- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-11.md`
  — full evidence, both attempts, and the residual unknowns.
- Phase 43's `43-09` ships candidate B (embedded store browser) as the `gog_keyless` destination,
  which sidesteps this path but does not fix it for other stores.
