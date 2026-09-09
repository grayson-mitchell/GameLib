---
created: 2026-09-09
title: "deletePresence() clears the keep-alive interval but never resets `interval`, so setPresence()'s `if (!interval)` guard stays falsy-blocked and the 5-minute keep-alive can never re-arm in the same process"
area: gog-presence
severity: medium
platform: any
ready: code
source: "quick-260909-k5x triage -- found while porting the boot-time presence call as Block H; deliberately NOT fixed there to keep that task atomic"
files:
  - src/backend/storeManagers/gog/presence.ts (deletePresence's clearInterval, ~:82; setPresence's `if (!interval)` arm, ~:38-40)
resolves_phase: null
---

# deletePresence() never resets `interval`, so the keep-alive cannot re-arm after it runs

## The mechanism

`presence.ts` declares `let interval: NodeJS.Timeout` at module scope. `setPresence()` arms the
5-minute keep-alive exactly once, guarded by `if (!interval) { interval = setInterval(setPresence,
5 * 60 * 1000) }`. `deletePresence()` calls `clearInterval(interval)` — which stops the timer
firing — but never assigns `interval` back to a falsy value. `clearInterval` does not mutate its
argument; `interval` keeps holding the same (now-dead) `Timeout` object, which is still truthy.
From that point on, `setPresence()`'s `if (!interval)` is false forever for the remaining life of
the process, so no replacement interval is ever created — the keep-alive is permanently disarmed,
even though `setPresence()` itself keeps being called and keeps successfully posting presence.

## The reachable path

`presence.ts`'s module-scope `settingChanged` listener calls `deletePresence(true)` when
`disableGOGPresence` flips to `true`, and `setPresence()` when it flips back to `false`. So the
sequence is: user disables GOG presence (interval cleared, but still truthy) → user re-enables it
→ `setPresence()` posts once, sees `interval` is truthy, and never re-arms the timer. Presence is
posted exactly once and then never refreshed again for the rest of the process's life.
`launcher.ts:289`'s game-stop path (`deletePresence()` on game exit) is a second route into the
same defect.

## Blast radius and workaround

Bounded: presence goes stale (stuck at whatever it last was) rather than wrong or leaking data.
The workaround is restarting GameLib, which re-evaluates `interval` from its `undefined` initial
value. That bounded blast radius plus an available workaround is why this is `medium`, not
`major`.

## Likely fix (NOT applied here)

- Null out `interval` immediately after `clearInterval(interval)` in `deletePresence()`. The
  declaration would need to widen to `let interval: NodeJS.Timeout | undefined` to make that
  assignment legal.
- While there, check whether `deletePresence()`'s own early-return guards (`disablePlaytimeSync ||
  (!force && disableGOGPresence) || !GOGUser.isLoggedIn() || !isOnline()`) mean `clearInterval` is
  itself sometimes skipped in a case where it should still run — that interaction was not audited
  as part of this triage and would need its own read before landing a fix.

## Scope note

`presence.ts` was deliberately NOT touched by quick-260909-k5x, which only added a new caller
(`bootstrap.ts`'s Block H) — this defect pre-dates that change and lives entirely inside
`presence.ts` itself.

## quick-260909-k5x's Block H is unaffected

At process start, `interval` is genuinely `undefined` (its declaration has no initializer), so
Block H's boot-time `setPresence()` call DOES correctly arm the keep-alive the first time. This
defect only bites after a *subsequent* `deletePresence()` call re-disarms it without resetting the
guard.
