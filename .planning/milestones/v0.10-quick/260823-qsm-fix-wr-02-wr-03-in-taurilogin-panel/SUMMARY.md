---
quick_id: 260823-qsm
slug: fix-wr-02-wr-03-in-taurilogin-panel
description: Closed Phase 34.4's WR-02 and WR-03 at their real location, TauriLoginPanel.tsx
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Quick Task 260823-qsm — SUMMARY

**WR-02 and WR-03 are CLOSED.** With them, Phase 34.4's only remaining item is
`/gsd-secure-phase 34.4`.

Commits: `cab8c1e69` (the fix), `df4de4691` (gate-scope bookkeeping).

## WR-02 — internal codenames shown to users

Three sites capitalized the raw runner id, so a user signing in saw **"Legendary"** rather than
Epic Games, **"Gog"** rather than GOG, **"Nile"** rather than Amazon Games — on a panel reachable
from every OAuth login route.

**The review's prescribed fix does not work, and that was established by measurement.** It said to
`import { getStoreName } from 'frontend/helpers'`. That module's first statement is a
side-effecting `import '../../preload/tauriAttach'` which dereferences `window` at module scope;
importing it hard-fails this repo's jsdom-less frontend jest project with
`ReferenceError: window is not defined`, and this panel is deliberately invocable as a plain
function. Probed with a throwaway test before committing to a design.

Resolved by extracting `helpers/storeDisplayName.ts` — one type-only import, nothing else — and
having `helpers/index.ts`'s `getStoreName` delegate to it. One source of truth, four existing
consumers untouched, and a module that is safe to import from anywhere.

Unknown runners keep the old capitalize fallback, so exactly four labels changed. `humble` keeps
its explicit `'Humble Bundle'`, and that literal is now a `meta/i18nGlossary.json` do-not-translate
term — the same mechanism D-21 used for the other store names, two of which (`Epic Games`,
`Amazon Games`) were already there.

## WR-03 — dynamic values baked into `t()` defaults

Eleven calls interpolated a runtime value into the *default* argument. i18next resolves by key
alone, so the first locale to supply one of these keys wins and the runner/channel/message
disappears from every translated locale while still working in English.

Verified precondition: **none of these keys exist in `public/locales/*` today** (only
`webview.controls.*`), so the defaults are live and editing them is not a no-op.

Each site was `runnerLabel ? 'text with runner' : 'text without'` under a SINGLE key.
Interpolation alone cannot express that — with no runner, `{{runner}}` renders empty and yields
"Signing in to  was cancelled" — so each branch got its own generic key.

## What made this defect survivable, and what now stops it

**The tests asserted the bug.** `toContain('Signing in to Gog')`, `toContain('Nile')` — and the
finalizing table computed its expected label by capitalizing the id, so it asserted only that the
component did whatever the test did. A tautology cannot fail. The table now DECLARES the expected
store name per runner.

**The i18n mock was blind by construction.** `t: (_key, defaultValue) => defaultValue` drops the
options argument, so it cannot distinguish a `{{placeholder}}` default from a baked-in one — it
could never have caught WR-03. It now interpolates like real i18next, which is what makes every
assertion in the file exercise the real path.

**A new source gate**, self-tested in both directions: it catches a planted baked-in default and
does not fire on a correct interpolated one
([[grep-assertion-must-fail-against-known-bad-input]]).

## Two things the gates caught that a green suite did not

1. **The hardcoded-string gate flagged `return 'Humble Bundle'`** on the first run. Recorded and
   fixed via the glossary rather than worked around. Note the shape-dependence: the identical
   literal as a `switch`-case return in `storeDisplayName.ts` is *not* flagged.
2. **A new file is invisible to that gate until it is listed in `i18nGateScope.json`** — and the
   generator derives its list from `git diff <merge-base> HEAD`, so an uncommitted file cannot
   appear at all. Hence two commits: the file had to exist in HEAD before the bookkeeping could be
   generated. Adding it invalidated four pinned count literals
   ([[regenerating-an-artifact-breaks-the-pins-that-guard-it]] — exactly as that memory predicts).

## Verification

`tsc --noEmit` clean · `prettier --check` clean on every touched file · frontend **122 suites /
1994 tests** green · meta **22 suites / 521 tests** green, hardcoded-string gate included ·
`TauriLoginPanel` suite 28 → **31 tests**.

Not run: `pnpm i18n` (a landmine per [[localisation-standing-requirement]]), and no live app run —
this change is unit-covered and has no runtime seam.
