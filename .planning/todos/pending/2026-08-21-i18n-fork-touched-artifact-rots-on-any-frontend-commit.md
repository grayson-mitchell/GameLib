---
created: 2026-08-21T00:00:00.000Z
title: "meta/i18nForkTouchedFiles.json rots on any src/frontend commit — A-17 ANTI-ROT is RED and nothing regenerates it"
area: tooling
status: OPEN
severity: minor
files:
  - meta/i18nForkTouchedFiles.json
  - meta/genI18nGateScope.ts
  - meta/__tests__/genI18nGateScope.test.ts
---

## Problem

`meta/__tests__/genI18nGateScope.test.ts` → **A-17 ANTI-ROT** currently FAILS. It
asserts the committed `meta/i18nForkTouchedFiles.json` equals the live derivation:

```
git diff --name-status <package.json upstream.baseCommit> HEAD -- src/frontend
```

The live set has **4 files the committed artifact lacks**:

| file | landed |
|---|---|
| `src/frontend/helpers/gamepad.ts` | `a1eddb5c3` (quick 260821-ooq) |
| `src/frontend/screens/ConsoleMode/controller.ts` | `c60eb9776` (quick 260821-ooq) |
| `src/frontend/screens/Login/components/HumbleLogin/index.tsx` | `ce6a54dbf` |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` | `abc2db936` |

**The artifact rots on every commit that touches a file under `src/frontend` that
was not already fork-touched.** Nothing regenerates it and nothing warns. Four
separate commits on 2026-08-21 each rotted it further; none noticed.

Found 2026-08-21 while verifying the repo-wide prettier sweep (`fbbfa852e`).
**Not caused by that sweep** — the derivation reads `HEAD`, never the working
tree, so uncommitted changes are invisible to it. Confirmed by running the git
command directly against each of the four paths.

This is the same family as [[status-doc-can-lag-two-gate-runs-undetected]]: the
guard is correct and non-vacuous (its own non-vacuity test sits right beside it
and passes), it just has no owner and no trigger.

## Solution

Regenerate with `pnpm gen-i18n-gate-scope` and commit the artifact. Then decide
how to stop it rotting again — options, cheapest first:

1. A `pre-commit` check that regenerates and fails if the artifact changed
   (mirrors how the gate already behaves in CI).
2. Fold regeneration into whatever already runs on frontend changes.
3. Leave it manual but make the failure message say
   `run pnpm gen-i18n-gate-scope` — right now the failure is a bare 4-line
   `toEqual` diff that reads like a real regression.

**Check first:** the skipped assertion below A-17 in the same file has a comment
saying "the obvious fix — `pnpm gen-i18n-gate-scope` — is blocked on ...".
Read that comment before running the generator; the block may apply to the
artifact as a whole, not just the skipped guard.

Related: [[pull-upstream-i18n-catalog-refreshes]] and the i18n gate debt tracked
in the pre-push todo.
