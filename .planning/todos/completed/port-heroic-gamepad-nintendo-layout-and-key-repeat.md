---
created: 2026-08-15T08:50:00.000Z
revised: 2026-08-22
title: 'Port Heroic gamepad fixes — Nintendo face buttons (A confirms) + key-repeat tuning'
area: input
needs: port-then-hand-merge
status: CLOSED
closed: 2026-08-22
closed_by: "part (a) c60eb9776/a1eddb5c3 then re-decided to A-confirms 2026-08-22; part (b) ported 2026-08-22"
severity: minor
upstream:
  - 8eb7fe7f9 (Heroic v2.22.1 — Improved gamepad key repeat, #5059) — PORTED 2026-08-22, see below
  - 0ee91ab2f (Heroic v2.22.1 — Correct reversed A/B and X/Y on Nintendo controllers, #5747) — ADOPTED 2026-08-22 (convention, not a cherry-pick), see below
files:
  - src/frontend/helpers/gamepad.ts
  - src/frontend/helpers/gamepad_layouts/nintendo.ts
  - src/frontend/helpers/__tests__/nintendoLayout.test.ts
  - src/frontend/screens/ConsoleMode/controller.ts
  - src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/components/ConfirmDialog/index.tsx
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/helpers/__tests__/gamepadRepeatTiming.test.ts
  - src/frontend/components/UI/SliderField/index.tsx
  - src/frontend/components/UI/SliderField/index.css
  - src/frontend/screens/Settings/components/GamePadDelayRepeat.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
  - src/backend/config.ts
  - src/common/types.ts
  - public/locales/en/gamelib.json
---

## Status as of 2026-08-22 — CLOSED

Both upstream commits are now resolved. Part (b) was ported earlier the same day; part (a)'s
convention question went to the operator, who chose **A confirms**, and that is implemented.

### Part (a) — Nintendo face buttons: RESOLVED as **A CONFIRMS** (operator, 2026-08-22)

The convention question this todo held open is decided: **the printed label is
authoritative.** On a Nintendo pad the physical **A** cap (right position, `buttons[1]`)
confirms and the physical **B** cap (bottom, `buttons[0]`) goes back — matching a Switch
owner's muscle memory from the console itself, and matching upstream Heroic.

**This was a reversal of GameLib's shipped behaviour, not an addition.** `c60eb9776` had
swapped the *labels* to keep the bottom cap confirming on every brand. That swap was
**reverted** and replaced with an index swap. Applying both would have cancelled out and
reintroduced the original defect — the trap this todo warned about.

What landed:

| | mechanism | result |
|---|---|---|
| was (`c60eb9776`) | `'nintendo'` branch in the two label helpers | bottom cap confirms, glyph `B` |
| now | `checkNintendo` layout + `getActionButtonIndex`/`getBackButtonIndex` | **A cap confirms, glyph `A`** |

- Label helpers reverted to plain (`'A'`/`'B'`); the `'nintendo'` branch is gone.
- `BTN_ACTION`/`BTN_BACK` demoted to module-private so nothing can bind a raw index again.
- `InstallOverlay`, `ConfirmDialog` and `LaunchOverlay` now resolve indices via
  `useGamepadInfo()` + the index helpers.
- X/Y swap adopted too (Switch prints X on the top cap, Y on the left — mirrored from
  Xbox), so `altAction` follows the printed Y on both.

**Deviation from upstream — one shared predicate instead of two.** Upstream dispatches
`checkNintendo` on a narrow `057e.*(2006|2007|2009)` while Console Mode picks glyphs from a
much broader regex. A pad reporting `"Nintendo Switch Pro Controller"` with no product code
therefore gets the Nintendo *glyph* and the standard *bindings* — i.e. upstream still
contradicts itself for that id, which is the very defect the commit set out to fix.
GameLib routes both through `isNintendoControllerId` in
`helpers/gamepad_layouts/nintendo.ts`. **Keep it that way**; duplicating the predicate
re-opens the split.

## Part (b) — Key repeat tuning: PORTED 2026-08-22

All 8 upstream files from `8eb7fe7f9` are in, plus two deviations forced by GameLib's
own gates and one defect fix. Advanced Settings now carries two sliders (initial repeat
delay, repeat frequency) that retune `gamepad.ts` live via `updateGamepadActions()`.

### Deviation 1 — i18n keys went to `gamelib.json`, NOT `translation.json`

This is the localisation gate the previous revision warned about, and it does not just
"cost budget" — it **rejects the upstream file outright**. `pnpm i18n-churn-guard`
(D-04/D-05/D-06) fails the build if `pnpm i18n` touches any catalog other than
`gamelib.json`. Upstream's two keys land in `translation.json`, which is upstream-owned.

Ported as `gamelib:settings.gamepadInitialRepeatDelay` / `...gamepadRepeatFrequency` in
`public/locales/en/gamelib.json`, read through `useTranslation('gamelib')`. Guard is
green and `translation.json` is untouched.

**Trap for the next person:** running `pnpm i18n` in this repo today dirties
`translation.json`, `gamepage.json` and `login.json` with ~116 lines of churn from
*other* unprefixed `t()` call sites — including test sentinels like
`INLINE-DEFAULT-SENTINEL` and `no.such.key.anywhere`. That churn is pre-existing and
unrelated. Restore with `git show HEAD:public/locales/en/<file> > public/locales/en/<file>`
and keep only the `gamelib.json` delta. Do NOT commit the sweep.

### Deviation 2 — `actions` is seeded synchronously (fixes a defect upstream ships)

Upstream moves `actions` out of `initGamepad()` into the async `updateGamepadActions()`,
which leaves it **undefined for every frame between `initGamepad()` and the settings
promise resolving**. `checkAction`'s only caller wraps it in a `try/catch` that logs and
swallows, so the symptom is *silently dropped input*, not a crash.

This is not theoretical: applying upstream verbatim turned part (a)'s own
`gamepadDisconnect.test.ts` red (2 cases, both "Received array: []").

Fixed by extracting `buildGamepadActions(repeatDelay, activationDelay)` and seeding
`actions` at module scope from `DEFAULT_REPEAT_DELAY` / `DEFAULT_INITIAL_REPEAT_DELAY`
(mirroring `config.ts`'s factory defaults). `updateGamepadActions()` now only *retunes*.
It also `??`-defaults each setting, so a config missing these keys can't set
`repeatDelay: undefined` and disable repeat entirely.

### Deviation 3 — default alignment

Upstream's `GamePadDelayRepeat.tsx` passes `250` as the `useSetting` fallback while
`config.ts` seeds `300`, so a pre-existing config (key absent) and a fresh one disagree.
Aligned to `300`.

### Tests

New `src/frontend/helpers/__tests__/gamepadRepeatTiming.test.ts`, 2 behavioural cases,
both proven RED against their own known-bad build before being accepted:

| case | known-bad input it was proven to catch |
|---|---|
| input dispatches on a frame before settings resolve | upstream's async-only `actions` — RED |
| configured delays reach the repeat logic | a build that ignores settings and keeps its seeded defaults — RED |

The second case deliberately uses **20 / 120 ms, not the 50 / 300 defaults** — had it
used the defaults, a build that ignored the settings entirely would still have passed.

For part (a): `src/frontend/helpers/__tests__/nintendoLayout.test.ts` (6 cases) drives the
real rAF loop rather than unit-testing `checkNintendo`, because the likely defect is the
**routing**, not the mapping. Removing the dispatch turns all 4 Nintendo cases red while
the 2 Xbox contrast cases stay green — verified. `controllerButtonLabels.test.ts` was
rewritten to pin **labels and indices together**, since the original defect was precisely a
disagreement between those two halves and a suite checking one half can go green while the
bug is live.

### Gate status at close (both parts, measured 2026-08-22)

- `tsc --noEmit`: clean (0 errors).
- `pnpm i18n-churn-guard`: clean.
- eslint on touched files: 0 errors; the port adds **no new warnings**.
- prettier: clean.
- jest: **6492 passed / 315 suites**, **1 pre-existing failure**: `meta/__tests__/genI18nGateScope.test.ts`.
  `meta/i18nForkTouchedFiles.json` is stale against 5 files committed by *other* work
  (`ProgressDialog/index.tsx`, `LauncherArgs.tsx`, `SyncSaves/gog.tsx`,
  `SyncSaves/legendary.tsx`, `humbleLoginChromeCss.ts`) — all present at HEAD, none
  touched here. **Deliberately not regenerated**: `pnpm gen-i18n-gate-scope` would sweep
  those 5 unrelated files into this change. Whoever re-baselines that ratchet must also
  add this work's new files (`SliderField/index.tsx`, `GamePadDelayRepeat.tsx`,
  `nintendoLayout.test.ts`, `gamepadRepeatTiming.test.ts`) in the **same commit** — the
  generator diffs against the fork base via git, so it cannot see them while untracked.

### Still unmeasured

The **gamepad focus-scroll** item was again not measured. It has now been carried across
three phases. The sliders make it cheap to reproduce, so it remains the natural pairing.

Related: [[port-heroic-small-polish-trio]] (same upstream review), and the store-page
gamepad seed in `.planning/seeds/` for the console-mode-drives-store-browser feature.
