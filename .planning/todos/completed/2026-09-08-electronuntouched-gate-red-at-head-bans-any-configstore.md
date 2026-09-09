---
created: 2026-09-08
title: "`electronUntouched.test.ts`'s by-construction gate is RED at HEAD — it bans the identifier `configStore` outright, so an unrelated Epic/GOG store use convicts correct code"
area: backend-sidecar-containment
severity: major
platform: any
ready: code
files:
  - src/backend/sidecar/__tests__/electronUntouched.test.ts (the gate, ~:298-307)
  - src/backend/sidecar/bootstrap.ts (:91 the import, :390 the only use)
status: "RESOLVED 2026-09-09 by quick-260909-iz2. Reading 1 taken (the gate is over-broad); reading 2 refuted -- both gated files already legitimately import from the Steam token surface (keyringTokenStore.ts:6 binds the TokenStore type, bootstrap.ts:73 binds setTokenStore, D-04's own seam), so a specifier-level ban would have been red on arrival. Shipped: the bare `configStore` substring ban became a binding-level check (`findSteamTokenSurfaceViolations`, matched on the imported name so aliasing cannot evade); `TOKEN_STORE_KEY`/`TOKEN_PREFIX` stayed bare-banned anywhere in source. Guard tests (`steam token surface binding gate helper`) pin that a real Steam-surface `configStore` import -- direct, aliased, via require(), via dynamic import() -- still trips, and that bootstrap.ts's real Epic/GOG import, the real D-04 seam import, a real type-only import, a real GOG electronStores import and a trailing-comment-only mention do not. Measured Backend result: before 1 failed / 4744 passed / 2 skipped / 211 suites (the single failure was this gate); after 0 failed / 4755 passed / 2 skipped / 211 suites."
resolved_by: quick-260909-iz2
resolves_phase: null
---

# The Backend suite is red at HEAD on a gate that outlaws more than its decision

## What is failing

`npx jest --selectProjects Backend` fails **deterministically** — 8/8 runs on 2026-09-08,
before any edit — with exactly one failing test:

```
FAIL Backend src/backend/sidecar/__tests__/electronUntouched.test.ts
  ● Electron-untouched byte-comparison proof (D-04, REQ-28-02/REQ-28-04)
    › by-construction gate: keyringTokenStore.ts and bootstrap.ts never reference
      configStore/TOKEN_STORE_KEY/TOKEN_PREFIX (comments stripped)

    Expected pattern: not /TOKEN_STORE_KEY|TOKEN_PREFIX|configStore/
```

It reads source text only, so it is not a flake.

## Why it went red

`204025b39 2026-09-08 feat(quick-260908-fre): restore boot-time Epic/GOG user reconciliation`
added to `bootstrap.ts:91`:

```ts
import { configStore } from '../constants/key_value_stores'
```

Its single use is `configStore.delete('userInfo')` inside `reconcileStoreUsersWhenOnline()`
(~:390) — clearing a stale **Epic** user record.

## The gate is broader than the decision it enforces

The suite's own header states the invariant: the Steam keyring token store must never write
the refresh token into the shared Electron config store. Every other test in the file proves
that **behaviourally**, by byte-comparing `configStore` from
`../../storeManagers/steam/electronStores` before and after each operation.

The by-construction gate is the one exception, and it does not encode that invariant — it
bans the bare identifier `configStore` anywhere in `bootstrap.ts`, regardless of which module
it came from or what it is used for. `constants/key_value_stores` is a different store
serving a different runner, and `delete('userInfo')` is not a token write, so the gate is
convicting correct code. Compare memory notes `a-gate-can-convict-correct-code` and
`negative-gate-can-outlaw-more-than-its-decision`.

## Two readings — needs a decision, do not guess

1. **The gate is over-broad** (likely). Narrow it to what D-04 actually decided: ban the
   Steam `electronStores` import and the `TOKEN_STORE_KEY`/`TOKEN_PREFIX` identifiers, rather
   than the substring `configStore`. Keep it a *negative* gate, and add a self-test proving a
   synthetic Steam-token write still trips it — otherwise narrowing risks widening a blind
   spot, exactly the failure mode in `narrowing-a-negative-gate-by-region-leaves-a-widening-blind-spot`.
2. **The import genuinely violates containment.** If `bootstrap.ts` is meant to stay free of
   ALL Electron key-value stores (not just Steam's), then `204025b39` is the regression and
   the reconciliation should reach the store through a seam instead. The header does not say
   this, but the header is also not the decision record — check D-04 / REQ-28-02 before
   narrowing.

Read D-04's actual wording first. Whichever way it goes, the fix must not simply delete the
gate.

## Not related to the debug session that found it

Surfaced incidentally while measuring the base rate for
`.planning/debug/bootstrapwirings-log-drop.md` (it contaminated the run-level pass/fail
counts there, which had to be read per-suite instead). Nothing in that session's `LogWriter`
fix touches this.
