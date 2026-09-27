---
created: 2026-09-26T02:46:07.000Z
title: "`notify.uninstallError` given an `en` catalog entry in `translation.json` (Option A) - pre-push green again, key English-only and outside both gamelib-scoped gates"
status: "RESOLVED 2026-09-27 as Option A by quick task 260927-mh4, recording a decision a CONCURRENT session had already shipped and pushed as 75df75e2e on 2026-09-26. Cost accepted and paid: the key is English-only in 1 of 49 locale directories and sits outside both gamelib-scoped l10n gates, so nothing will ever report the gap. NOT precedent for adding further fork strings to a legacy catalog."
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

**This was predicted in writing and tracked nowhere, which is why it was filed.** Quick
`260926-jes`'s SUMMARY said the next person to run `pnpm i18n` and commit "will make that decision
by accident". Six commits later that is exactly what nearly happened: it surfaced as a blocked
`git push` during an unrelated task (quick `260926-ju4`), not as anything anyone chose to look at.

`e71757335` renamed the structurally-unresolvable key `notify.uninstalled.error` to the sibling
`notify.uninstallError` at `src/backend/utils/uninstaller.ts:123`. That rename was correct and was
not in question. Its side effect was: **the structural string-vs-parent conflict had been silently
suppressing the i18next-parser's write, and removing the conflict unblocked it.** `pnpm i18n` then
wanted to add one line to `public/locales/en/translation.json`:

```diff
  "uninstalled": "Uninstalled",
+ "uninstallError": "Error uninstalling",
```

`.husky/pre-push` runs `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update
&& pnpm find-deadcode`, so the parser's refusal-to-be-clean **used to fail every push from this
machine** until the key had a home. Measured 2026-09-26 before the fix: the other four gates all
exited 0; only the i18n step failed. **That headline claim is now superseded** — see Solution.

**Scope, measured rather than assumed: this was LOCAL friction, not a red CI.**
`.github/workflows/test.yml` runs `pnpm test:ci` (jest) and `pnpm smoke:sidecar`. Nothing in
`.github/workflows/` invokes `pnpm i18n` or `--fail-on-update`. The churn guard's live-tree test
(`meta/__tests__/i18nCatalogChurnGuard.test.ts`) reads `git diff` with no `--cached`, so a clean CI
checkout never saw it either. This was never a CI outage.

**Interim state:** quick `260926-ju4` pushed with `git push --no-verify` rather than resolve this
as a side effect of wanting to push. That was a deferral, not a fix, at the time it happened — the
hook was red until `75df75e2e` resolved it properly. No push from this machine is blocked now.

## Solution

**Option A was CHOSEN, SHIPPED and PUSHED — by a concurrent session, not by this task.** It landed
as `75df75e2e`, `fix(i18n): add missing en catalog entry for notify.uninstallError`, one insertion
into `public/locales/en/translation.json`. The added line, `"uninstallError": "Error uninstalling",`,
sits at `translation.json:693`, immediately after `"uninstalled": "Uninstalled",` — exactly the diff
this todo's Problem section predicted. This closure task did not make that choice; it records one
that had already landed on its own commit, author date 2026-09-26. The call site was NOT
re-namespaced (`src/backend/utils/uninstaller.ts:123` still reads
`i18next.t('notify.uninstallError', 'Error uninstalling')`), so Option B was not partially applied,
and `e71757335` was not reverted, so Option C was not taken.

**Record the price honestly and do not celebrate it.** The key now lives in a catalogue that
neither l10n gate reads: `pnpm lint-translations:gamelib` walks each catalogue's own keys and so
never examines an absent one, and R13's presence baseline (`meta/i18nCatalogPresenceBaseline.json`,
`totalPairs: 0`) is likewise scoped to the `gamelib` namespace. Measured: the key exists in exactly
1 of 49 locale directories (`en` only). The consequence is that it is English-only and **no gate
will ever report that gap**. That is the cost, and it was paid.

**The cost is gate coverage and the `gamelib:` convention — explicitly NOT mergeability.**
CLAUDE.md is explicit that GameLib is an independent project, not a fork tracking Heroic, that
upstream mergeability is not a constraint, and that deviation from upstream Heroic must not be
raised as a concern or caveat. `translation.json` is a legacy NAME for a catalogue GameLib wholly
owns, not a merge target. The cost being recorded here is that this key sits outside both gates
that would otherwise catch an English-only string, and outside the `gamelib:` convention that
fork-added strings are supposed to follow — nothing about upstream compatibility.

**Preserve the not-precedent warning and sharpen it.** `notify.uninstallNotConfirmed` — now at
`translation.json:694`, pushed down one line by this very insertion — is plainly fork-added and is
itself English-only in 1 of 49 locale directories. It is the "looks like precedent and isn't"
shape: a reader could point at it and reason "one more key next to the others is obviously fine."
It is not. The `humbleKeys` block that used to sit in this same file and make that reasoning look
even more plausible is **GONE from `translation.json`** — swept (30 dead) and migrated into
`gamelib` (54 live, all locales filled) by quick `260919-9gu`, with the baseline still correct at
`totalPairs: 0` without regeneration. Do not cite `humbleKeys` as a present worked example for
filling this catalog in place; cite it as the precedent-shaped trap whose remedy was **relocation
into the gated namespace, not filling in place**. Filling in place, as Option A did here, leaves a
key outside every gate forever. A future reader must not cite this closure as licence to add more
fork strings to a legacy-named catalogue.

**Options B and C were NOT TAKEN. Their costs remain accurate as analysis and are preserved rather
than deleted.**

**Option B — re-namespace the call site to `t('gamelib:notify.uninstallError', …)`.**
Convention-correct, and puts the key inside both gates instead of outside them. Cost, measured:
`meta/i18nCatalogPresenceBaseline.json` sits at `totalPairs: 0`, so one English-only `gamelib` key
would turn R13 red with 48 unfilled (locale, key) pairs. **Do NOT regenerate the baseline to clear
that** — the file's own `reason` string says it is a record of a known gap, not permission to grow
one. That would leave a 48-locale hand fill for a single notification string, and
`machine-fill-gamelib` is still returning HTTP 401 on the key in `~/.gamelib.env` (re-tested
2026-09-15; do not re-diagnose the env wiring, ask for a live key).

**Option C — revert `e71757335`.** Named for completeness and never recommended: the old key could
never resolve in any of the 47 locales, so reverting would have reinstated a dead key purely to
keep a hook quiet.

**Both-directions verification, recorded as PASSED in both directions.** `grep -c 'Added keys:
[1-9]'` over the `pnpm i18n` output → 0; and the three unrelated `same keys different values`
warnings (`box.shortcuts.title`, 3 occurrences; `setting.eosOverlay.updating`, 1;
`wine.manager.settings`, 1) still appear — the control proving the parser did not silently no-op.
`pnpm i18n --fail-on-update` exits PASS, and the full `.husky/pre-push` chain ran green end to end
on a real `git push origin main` (`75df75e2e..8e520b7a0`), with `find-deadcode` reporting
`unreachable: 46 OK | used-in-module: 0 OK`.
