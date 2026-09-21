---
created: 2026-09-20
title: "--dialog-margin-horizontal is declared on a bare .Dialog class that no element ever carries"
area: ui-dialogs
severity: medium
platform: any
ready: live-gate
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Library/components/InstallModal/index.scss
  - src/frontend/components/UI/Winetricks/index.scss
---

# `.Dialog` (bare) is never applied to any element — its one surviving token likely resolves nowhere

## Measured facts

`Dialog/index.css` declares `--dialog-margin-horizontal` on `.Dialog`, but **no element in `src/`
is ever given the bare class `Dialog`**: `Dialog.tsx` does not add it, and all ~25 consumers pass a
different literal through `PaperProps={{ className }}` (`notLoggedIn`, `uninstall-modal`,
`AboutDialog`, `InstallModal__dialog`, `errorDialog`, `progressDialog`, `ModifyInstall__dialog`).

So the token is declared in a scope that matches nothing, and its two external references resolve
to nothing at runtime:

- `InstallModal/index.scss:27` — `margin: var(--space-md) var(--dialog-margin-horizontal) 0` on
  the anticheat banner
- `Winetricks/index.scss:3` — `margin: 0 var(--dialog-margin-horizontal)` on the installWrapper

Both are non-inherited `margin` shorthands, so they are invalid at computed-value time and fall
back to `0` rather than the intended 32px.

## Why the gate stays green

This is `cssTokenSweep.test.ts`'s own documented **blind spot B** ("this gate checks NAMES, not
SCOPES"), the same class as its worked `--search-bar-border` example. The gate is green and will
stay green — it can prove every `var(--x)` names something declared somewhere, but it cannot prove
the declaration's selector ever matches an element. The declaration must NOT be deleted to "fix"
this, because deleting it turns the gate red for the two references above
(`cssTokenSweep.test.ts`'s `ALLOWLIST` is `[]`).

## Severity and readiness reasoning

`severity: medium`: this is a real defect with a live consequence on two surfaces (both margins
collapse to `0` instead of the intended `32px`), bounded to two `margin` declarations — not a
`minor` polish item, but not `major` either since neither surface is broken, just unmargined.

`ready: live-gate`: any remedy — re-scoping the token to a class that IS applied, moving the
declaration to `:root`, or fixing the two consumers to reference a token that resolves — changes
rendered margins on the anticheat banner and the Winetricks install wrapper, and needs a live run
to score. It cannot be decided or verified from source alone.

## Not fixed here

Quick task `260921-nub` kept the declaration exactly as it was (see the in-situ comment above it in
`Dialog/index.css`) and did not attempt a remedy.
</content>
