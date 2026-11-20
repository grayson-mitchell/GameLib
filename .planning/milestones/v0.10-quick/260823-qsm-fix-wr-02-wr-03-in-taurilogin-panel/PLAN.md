---
quick_id: 260823-qsm
slug: fix-wr-02-wr-03-in-taurilogin-panel
description: Close Phase 34.4's code-review WR-02 (runner display names) and WR-03 (i18next interpolation) at their real location, TauriLoginPanel.tsx
created: 2026-08-23
status: in-progress
---

# Quick Task 260823-qsm — close 34.4's WR-02 / WR-03

Both warnings were filed against `WebviewUnavailablePanel.tsx`. **34.4.1 plan 05 rewrote that
file**, moving the login case out to `TauriLoginPanel.tsx` and leaving the store/wiki panel with no
runner name and no dynamic default — so the findings are stale *at the named file* and live *at the
successor*. Re-filed by quick task `260823-qmc` earlier today; this task fixes them.

## WR-02 — internal runner codenames leak to users

`TauriLoginPanel.tsx` capitalizes the raw runner id at three sites (`:79`, `:120`, `:171`) instead
of using `getStoreName()` (`frontend/helpers/index.ts:140-153`). Users see **"Legendary"** instead
of "Epic Games", **"Gog"** instead of "GOG", **"Nile"** instead of "Amazon Games".

**The existing tests PIN the defect** — `expect(text).toContain('Signing in to Gog')` (`:243`,
`:320`) and `toContain('Nile')` (`:282`). That is why it survived a whole phase. Those assertions
get corrected, not deleted.

**Import caution.** The review prescribed `import { getStoreName } from 'frontend/helpers'`, but
that module's first statement is a side-effecting `import '../../preload/tauriAttach'` plus
`./library` — heavy for a component deliberately kept invocable as a plain function under this
repo's jsdom-less jest config. **Measure before adopting**: if the import breaks or bloats the
DOM-less test, extract the mapping instead. Do not assume the prescribed fix is safe
([[review-prescribed-fix-can-carry-the-same-defect]]).

## WR-03 — dynamic values baked into `t()` defaults

Eleven `t()` calls interpolate a runtime value into the *default* argument via a JS template
literal. Once any locale supplies these keys, i18next returns the translated string looked up by
key alone and the runner/channel/message silently vanishes.

**Verified precondition:** none of these keys exist in `public/locales/*/` today — only
`webview.controls.*` does. So the defaults are live, the bug is latent rather than active, and
**editing the defaults is NOT a no-op here** ([[t-default-arg-is-inert-when-key-exists]] does not
apply — that trap needs an existing key).

**Two keys per branch, not one.** Every site is `runnerLabel ? 'text with the runner' : 'text
without'` under a SINGLE key. Interpolation alone cannot express that: with no runner, `{{runner}}`
renders empty and yields "Signing in to  was cancelled". Each branch therefore gets a distinct
generic key.

## Tasks

**T1 — `TauriLoginPanel.tsx`.** One `displayNameFor()` helper replacing all three capitalize sites,
preserving `humble → 'Humble Bundle'` (deliberate, documented) and falling back to today's
capitalization for runners `getStoreName` doesn't know, so nothing outside Epic/GOG/Amazon/Steam
changes. Convert all eleven defaults to `{{placeholder}}` + an options object, splitting each
two-branch call into a named key and a generic key.

**T2 — `TauriLoginPanel.test.tsx`.** The mock is `t: (_key, defaultValue) => defaultValue` — it
drops the options argument entirely, which is *exactly* the blindness WR-03 called out. Make it
interpolate like real i18next, then correct the assertions that pinned the old labels.

**T3 — a regression gate, proven in both directions.** A source scan asserting no `t()` default
contains a `${` template substitution, plus a self-test proving the scan catches a planted one —
the shape the `navigator.clipboard` gate in this same suite already uses
([[grep-assertion-must-fail-against-known-bad-input]]).

## Constraints

- `TauriLoginPanel.tsx` is **not** in `meta/i18nGateAllowlist.json`, so it is in scope for the
  BLOCKING hardcoded-string gate and currently sits at zero violations. It must stay there.
- Keys stay in their current default namespace. They are inline-default-only, so no catalog is
  orphaned; re-homing them under `gamelib:` is a separate concern, not this fix.
- Do **not** run `pnpm i18n` ([[localisation-standing-requirement]] — it is a landmine).
- Concurrent session active: commit with `git commit --only <path>`.
