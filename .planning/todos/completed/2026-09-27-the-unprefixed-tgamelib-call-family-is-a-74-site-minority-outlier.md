---
created: 2026-09-27
title: "The unprefixed tGamelib('setting.eosOverlay.*'…) call family is a 74-site minority outlier — reconcile it toward the prefixed house convention"
found_during: quick 260927-q9t (minting gamelib:setting.eosOverlay.updatingStatus)
severity: minor
platform: any
ready: code
area: i18n
files:
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
---

## Problem

`AdvancedSettings/index.tsx` calls `tGamelib` in two styles simultaneously: `:211` and `:299` call
`tGamelib('gamelib:settings.eosOverlay…')` **with** the namespace prefix; `:157`, `:533`, and now
`:161` (this task's own `updatingStatus` call) call
`tGamelib('setting.eosOverlay.unavailable'/'…unavailableDetail'/'…updatingStatus')` **without** it.

The file's own comment at `:68-70`, near where `tGamelib` is wired up
(`const { t: tGamelib } = useTranslation('gamelib')`), calls the prefixed form "the house
convention." That comment is **substantially accurate**, not wrong — see the census below.

**The census: 182 prefixed vs 74 unprefixed, 256 real `tGamelib(` call sites across `src/`, 71%
prefixed.** Measured 2026-09-27. Method matters here: regex over every `src/**/*.ts*` file with
block and line comments stripped, matching `tGamelib\(\s*(['"])(.*?)\1` with `re.S` (dot-matches-
newline) so a key literal that Prettier has wrapped onto a following line is still counted as one
call site.

**The grep trap worth recording, because an earlier draft of the plan that filed this todo got
this backwards:** a naive same-line `grep -rho "tGamelib('gamelib:"` returns **67**, which makes the
prefixed form look like a minority against an apparent ~93 unprefixed sites. That reading is wrong
— it undercounts the prefixed family specifically, because Prettier wraps the majority of these
calls onto a following line, and a same-line grep silently drops every wrapped one. **The prefixed
form is the majority, not the minority.** Any future census of this call family must be
multi-line-aware (strip comments, use `re.S` or an equivalent) or it will be confidently wrong in
this exact direction.

`AdvancedSettings/index.tsx` is a live example of both styles coexisting in one file, and the
outlier is specifically the unprefixed **`setting.eosOverlay.*` family**, not the file or the
prefixed majority in general.

## Why the outlier family was joined rather than fixed, in `quick-260927-q9t`

`quick-260927-q9t` deliberately used the unprefixed form for its new
`setting.eosOverlay.updatingStatus` call, joining this outlier family rather than reconciling it.
The census above does **not** motivate that choice and must not be cited as if it did — the reasons
were local:

- the unprefixed form is the one **empirically proven to land this exact key family** in
  `gamelib.json` — `setting.eosOverlay.unavailable` and `.unavailableDetail` were already there,
  written by unprefixed calls;
- the new key is a direct sibling of those two, and local consistency within the family reads
  better at the call site than matching a repo-wide majority the family already departs from;
- `quick-260927-q9t` verified the landed nested path in `en/gamelib.json` directly after `pnpm i18n`
  rather than relying on an assumption either way.

## Proposed solution

Reconcile the **`setting.eosOverlay.*` family as a whole** toward the prefixed form — all of
`:157`/`:161`/`:533` together, so no straggler is left behind — rather than fixing one call site at
a time. Leave the `:68-70` comment calling the prefix "the house convention" as it stands; it is
correct.

`severity: minor` because both call styles resolve to the same catalog entries and nothing is
user-visible. `ready: code` because this is a mechanical sweep (rename the key literal at each call
site to include the `gamelib:` prefix) needing no live gate, no other OS, and no decision beyond
"do the whole family at once."

## Resolution

**(a) What shipped.** `quick-260927-snd` prefixed all three `setting.eosOverlay.*` key literals in
`AdvancedSettings/index.tsx` — `unavailable`, `updatingStatus`, and `unavailableDetail` — with
`gamelib:`, in commit `refactor(quick-260927-snd): prefix the three unprefixed tGamelib calls in
AdvancedSettings`. Zero catalog churn: `pnpm i18n` reported gamelib `Unique keys: 318`, `Added
keys: 0`, `Restored keys: 0`, `Unreferenced keys: 7` — all unmoved — and left `public/locales`
untouched. That is the direct evidence that both call styles already resolved to the same
namespace before this change; the prefix only made the resolution explicit.

**(b) The corrected premise.** This todo's title and Problem section called the unprefixed
`setting.eosOverlay.*` family "the" outlier. That framing was wrong, and this Resolution corrects
it rather than restating it: measured 2026-09-27 over `src/**/*.ts*` with comments stripped and a
multi-line-aware (`re.S`) scan, there are **75 unprefixed `tGamelib` calls across 19 files**, and
the eosOverlay family was only **3 of those 75**. What was genuinely anomalous — the thing this
task actually eliminates — is that `AdvancedSettings/index.tsx` was the **only file in the entire
repo mixing both `tGamelib` call styles** (4 prefixed + 3 unprefixed). The delivered
post-condition is therefore an invariant, not a style preference: **mixed-style files went 1 -> 0**
(unprefixed calls 75 -> 72, prefixed 182 -> 185, 257 total unchanged); every one of the 56 files
that call `tGamelib` is now internally consistent. This todo's census (182 prefixed vs 74/75
unprefixed), its same-line-grep undercount warning, and its reading of the `:68-70` comment as
"substantially accurate" all **stand** — only the which-thing-is-the-outlier claim needed
correcting.

**(c) The other 72, disposed of — no follow-up todo filed.** They sit in 18 files that are each
internally consistent (all-unprefixed, zero mixed): the largest are
`WebView/components/TauriLoginPanel.tsx` (28), `Winetricks/WinetricksBrowse/index.tsx` (7),
`WebView/components/WebviewUnavailablePanel.tsx` (6), `UI/RedeemSteamKeyDialog/index.tsx` (6), and
`Winetricks/WinetricksBrowse/Row/index.tsx` (6). `useTranslation('gamelib')` already scopes the
hook in every one of them, so the `gamelib:` prefix is functionally redundant there, and converting
them would be 18 files of pure churn that restores no invariant — per-file internal consistency,
not repo-wide prefix uniformity, is the accepted resting state, and this task makes that hold
repo-wide. Filing a follow-up todo for the other 72 would park permanent, purposeless churn in the
backlog and re-open a question this Resolution is closing on the record. Anyone re-measuring this
family later must use a multi-line-aware, comments-stripped scan (strip `/* */` and `//` comments,
match with `re.S`) or they will reproduce the exact inverted, same-line-grep answer this todo
already warned against.
