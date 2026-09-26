---
created: 2026-09-26T02:46:07.000Z
title: "`notify.uninstallError` has no catalog home, so `pnpm i18n --fail-on-update` blocks every pre-push on this machine"
area: i18n
severity: medium
platform: any
ready: human
source: "quick 260926-ju4 push attempt, 2026-09-26 — predicted in quick 260926-jes's SUMMARY and never tracked anywhere"
files:
  - src/backend/utils/uninstaller.ts
  - public/locales/en/translation.json
  - public/locales/en/gamelib.json
---

## Problem

**This was predicted in writing and tracked nowhere, which is why it is being filed.** Quick
`260926-jes`'s SUMMARY says the next person to run `pnpm i18n` and commit "will make that decision
by accident". Six commits later that is exactly what nearly happened: it surfaced as a blocked
`git push` during an unrelated task (quick `260926-ju4`), not as anything anyone chose to look at.

`e71757335` renamed the structurally-unresolvable key `notify.uninstalled.error` to the sibling
`notify.uninstallError` at `src/backend/utils/uninstaller.ts:123`. That rename was correct and is
not in question. Its side effect is: **the structural string-vs-parent conflict had been silently
suppressing the i18next-parser's write, and removing the conflict unblocked it.** `pnpm i18n` now
wants to add one line to `public/locales/en/translation.json`:

```diff
  "uninstalled": "Uninstalled",
+ "uninstallError": "Error uninstalling",
```

`.husky/pre-push` runs `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update
&& pnpm find-deadcode`, so the parser's refusal-to-be-clean **fails every push from this machine**
until the key has a home. Measured 2026-09-26: the other four gates all exit 0; only the i18n step
fails.

**Scope, measured rather than assumed: this is LOCAL friction, not a red CI.**
`.github/workflows/test.yml` runs `pnpm test:ci` (jest) and `pnpm smoke:sidecar`. Nothing in
`.github/workflows/` invokes `pnpm i18n` or `--fail-on-update`. The churn guard's live-tree test
(`meta/__tests__/i18nCatalogChurnGuard.test.ts`) reads `git diff` with no `--cached`, so a clean CI
checkout never sees it either. **Do not escalate this as a CI outage; it is not one.**

**Interim state:** quick `260926-ju4` pushed with `git push --no-verify` rather than resolve this
as a side effect of wanting to push. That is a deferral, not a fix — the hook is still red.

## Solution

**This is a decision, not a defect to be coded around — which is why it is `ready: human`.** Both
available homes have a real, measured cost, and picking one on autopilot is the failure mode this
todo exists to prevent.

**Option A — accept the parser's write into `public/locales/en/translation.json`.**
One line; unblocks the hook permanently; CI stays green because the churn guard's live-tree check
is unstaged-only and a committed change is invisible to it. Cost: it puts a fork-added string in an
upstream Heroic catalog, against the standing convention that fork strings live under `gamelib:`.
Note the trap before citing the neighbours as precedent: `notify.uninstallNotConfirmed`
(`translation.json:693`) is plainly fork-added too, and it is *exactly* the "looks like precedent
and isn't" shape that the `humbleKeys` sweep already had to undo once.

**Option B — re-namespace the call site to `t('gamelib:notify.uninstallError', …)`.**
Convention-correct, and puts the key inside both gates instead of outside them. Cost, measured:
`meta/i18nCatalogPresenceBaseline.json` sits at `totalPairs: 0`, so one English-only `gamelib` key
turns R13 red with 48 unfilled (locale, key) pairs. **Do NOT regenerate the baseline to clear that**
— the file's own `reason` string says it is a record of a known gap, not permission to grow one.
That leaves a 48-locale hand fill for a single notification string, and `machine-fill-gamelib` is
still returning HTTP 401 on the key in `~/.gamelib.env` (re-tested 2026-09-15; do not re-diagnose
the env wiring, ask for a live key).

**Option C — revert `e71757335`.** Named for completeness and NOT recommended: the old key could
never resolve in any of the 47 locales, so reverting reinstates a dead key to keep a hook quiet.

Whichever is chosen, verify in **both** directions afterwards: `pnpm i18n` must stop reporting
`Added keys: 1` for the affected namespace, **and** the three unrelated `same keys different values`
warnings (`box.shortcuts.title`, `setting.eosOverlay.updating`, `wine.manager.settings`) must still
appear — a run with no warnings at all means the parser silently no-opped and proves nothing.
