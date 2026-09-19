---
created: 2026-09-15T00:00:00.000Z
title: '59 LIVE fork-added `humbleKeys.*` keys in `translation.json` ship English in EVERY non-English locale, outside the gate — the 25 dead keys are SWEPT (260919-8yq) and the 816 `gamelib` keys this todo was filed for are FIXED; what remains is one operator decision (fill in place vs migrate to the `gamelib` namespace) and ~2832 strings'
area: i18n
severity: major
platform: any
ready: human
status: OPEN
found_by: 'quick-260914-vbw, 2026-09-15 — PR #5 was the FIRST pull_request ever opened against fix/steam-native-install-stability, which is the only event that runs the ci/lint workflows. The red had been invisible for the whole of Phase 43.'
files:
  - meta/__tests__/lintTranslations.test.ts
  - meta/lintTranslations.ts
  - meta/i18nCatalogPresenceBaseline.json
  - public/locales
---

> **STATUS 2026-09-15 — the half this todo was filed for is FIXED; the larger half is not.**
>
> Quick `260915-t13` filled all **17** `gamelib` keys across all **48** non-English locales (816
> hand-written strings). `lintTranslations` went from 2 failed / 816 findings to **32 passed**, and
> `gamelibCatalogParity` passes **198**. The presence baseline was **not** regenerated and
> `gamelib.mt.json` was **not** touched.
>
> **What remains open, and why this todo is not closed:** `translation.json` holds **59** further
> fork-added `humbleKeys.*` keys absent from all 46 non-English `translation.json` files
> (`br` and `sl` have none at all). The Humble Keys screen therefore still renders English to
> every non-English user. That half is invisible to the gate by construction and needs an
> operator decision — see the two sections below, which are the live scope.

> **STATUS 2026-09-19 — Direction step 1 is DONE; the fill is still the live scope.**
>
> Quick `260919-8yq` (`074bea408`) deleted the **25 dead** keys: `humbleKeys` went **84 → 59**
> leaves in one file. All 25 were unreferenced in `src/` and `meta/`, and six still carried
> byte-identical English to a surviving live twin (`ownedBlockBody`/`c2Body`,
> `revealTitle`/`revealConfirmTitle`, `yourKey`/`keyShownTitle`,
> `ambiguousOutcome`/`revealAmbiguousBody`, `cooldownRetry`/`revealCooldownBody`,
> `ownedPassiveNote`/`finishOwnedNote`) — 43-07 renamed them and left the originals stranded.
> The presence baseline was **not** regenerated; no locale file was touched.
>
> **Correction to the two traps this todo cited for the sweep:** neither armed. No locale
> carries any of these keys, so the `da`/`id`/`nl` trailing-comma trap and the 47-vs-49
> population trap are both irrelevant to a deletion here — it touched exactly **one** file. The
> trap that did arm was unrecorded: `yourKey` sorts **last** in the block, so deleting it
> stranded a comma on the preceding line.
>
> **The remaining work is now 59 keys, not 84**, and it needs the operator decision in step 3a
> below before anyone starts writing strings.
>
> The filename still says "816" for cross-reference stability; the `title:` field is authoritative.

## Problem (HISTORICAL — resolved by quick `260915-t13`)

`meta/__tests__/lintTranslations.test.ts` **had been failing** two tests against the committed tree:

- `lintTranslations (REQ-41-02) › live tree › zero hard failures for the gamelib namespace` —
  **816** findings
- `comparePresenceBaseline (REQ-41-01) › R13: zero drift between the live tree and the committed
  baseline` — **816** findings

Every finding is a `humbleKeys.*` key, across every locale. The message states the remedy:

```
ar.gamelib.humbleKeys.claimOnHumble: a new key is not localised and was not recorded
  — fill it or regenerate the baseline
```

**Measured 2026-09-15 (quick `260915-srx`): 816 = 17 distinct keys × 48 non-English locales.**
The full 17, not a sample: `claimOnHumble`, `claimOnStore`, `clearFilters`, `columnGame`,
`columnKey`, `columnType`, `emptyBody`, `emptyHeading`, `filteredEmptyBody`,
`filteredEmptyHeading`, `loginAndClaim`, `pickOnHumble`, `redeemableOnly`, `searchPlaceholder`,
`sortAlphabetical`, `sortExpiringSoonest`, `sortLabel`.

These are **Phase 43's unified Humble Keys list** strings, added to the English namespace without
the locale fill or baseline regeneration this project's standing localisation requirement demands.

**Attribution corrected.** This todo originally credited `feat(43-07)` and `feat(43-08)`. Replaying
each commit's `humbleKeys` block gives **13 keys from `feat(43-07)`, 3 from `feat(43-06)`, 1 from
`feat(43-09)`** — `43-08` contributed none. Do not re-derive this with `git log -S`: a file-wide
`git log -S'"emptyHeading"'` blames `feat(34.11-08)`, because `library.filterPanel.emptyHeading`
and `.emptyBody` are same-named leaves elsewhere in the same catalog and `-S` counts occurrences
across the whole file, not within the `humbleKeys` block.

## Why it matters

1. **It is a shipped user-facing gap, not a test-only red.** Every non-English user sees English
   across the Humble Keys screen. **Still true after the `gamelib` fill** — the column headers,
   empty states, filter controls and claim actions are now localised, but the 59 live
   `translation.json` keys on the same screen are not.
2. **It went undetected for the whole of Phase 43 because nothing could see it.** The `ci` and
   `lint` workflows fire on `pull_request` only. `fix/steam-native-install-stability` has **no
   `ci`/`lint` runs at all** — `gh run list --branch fix/steam-native-install-stability` returns
   only stale `CLA Assistant` failures from 2026-09-02. No PR was ever opened for that branch, so
   the gate that exists for exactly this defect never ran. It surfaced only because an unrelated
   macOS-entitlements PR happened to be the first one opened.
3. ~~**816 is a count of findings, not of keys.**~~ **ANSWERED** — 17 keys × 48 locales. Size the
   `gamelib` half of the work from 17, not 816.

## The remedy this todo originally prescribed is NOT sufficient

**Added 2026-09-15 (quick `260915-srx`).** Filling the 17 `gamelib` keys reaches zero findings and
turns CI green **without materially closing the user-facing gap this todo describes.**

`public/locales/*/translation.json` holds a second, larger block of fork-added Humble Keys strings —
inherited Phase 13/14 debt from before the `gamelib` namespace split:

- **84 `humbleKeys.*` keys in `en/translation.json`**, absent from **all 48** non-English locales
  (46 locales have the file but lack every one of the keys; `br` and `sl` have **no
  `translation.json` at all**).
- **59 of those 84 are still referenced in `src/`** after the 43-07 collapse. Those are live
  English strings on the same screen, in every non-English locale.
- ~~**25 appear unreferenced**~~ **CONFIRMED DEAD AND DELETED 2026-09-19** (quick `260919-8yq`,
  `074bea408`) — they were dead after 43-07 collapsed the three tab screens (`tabAll`,
  `tabSpares`, `sparesEmptyTitle`, `ownedBlock*`, `revealTitle`, …). **Do not re-run this sweep.**
  The two counts above are the 2026-09-15 measurement and are now historical: `en/translation.json`
  holds **59** `humbleKeys.*` keys today, all of them live.

**Why no gate sees this.** `meta/lintTranslations.ts:95` sets
`FORK_OWNED_NAMESPACES = ['gamelib']`, and `meta/i18nCatalogPresenceBaseline.json` is
`namespace: gamelib`. The upstream namespaces are excluded by construction, with an in-source
rationale about not surfacing "a wall of unactionable Weblate-sourced gaps". That rationale is
sound for genuine upstream Heroic strings — but these 84 are **fork content that happens to live in
an upstream catalog**, so the exclusion's justification does not cover them. The gate is honest
about what it measures; what it measures is simply not the thing this todo is about. Reaching zero
findings is therefore not evidence the screen is localised.

## Direction

~~**Do the dead-key sweep first, or a third of the translation-namespace work is wasted.**~~
**The sweep is done.** The fill is now the whole of the remaining scope.

1. ~~**Sweep the 25 unreferenced `translation.json` keys.**~~ **DONE** — quick `260919-8yq`
   (`074bea408`), 84 → 59 leaves, one file. Each was confirmed unreachable in `src/` **and**
   `meta/` before deletion, and the file was checked for a duplicate `humbleKeys` block first
   (there is none — the second match is `sidebar.humbleKeys`). The asymmetric-breakage warning
   this step carried **did not apply**: no locale held any of these keys, so neither the 47-vs-49
   population trap nor the `da`/`id`/`nl` trailing-comma trap could arm on a deletion here.
2. ~~**Fill the 17 `gamelib` keys across 48 locales.**~~ **DONE** — quick `260915-t13`. The
   order-preserving warning was load-bearing and is worth reusing for step 3: the 7 locales whose
   key order is not an `en` subsequence came out at 19 insertions / 1 deletion each, where a global
   re-sort would have rewritten the whole block.
3. **DECIDE FIRST, then fill the surviving 59 keys.** This is the half that actually makes the
   screen non-English, and **no gate will tell you when it is done** — diff the key sets directly.
   The two options are not equivalent and the choice changes where the strings go, so it is a
   decision, not a preference:

   - **(a) Fill in place** — 59 × 46 locales, plus creating `translation.json` for `br` and `sl`,
     which have none: ≈ **2,832** strings. Cheapest to start. The keys stay in an upstream catalog
     and therefore stay **permanently outside every gate**, so this exact defect can recur here
     and be invisible again.
   - **(b) Migrate the 59 into the `gamelib` namespace, then fill** — the same string volume
     (59 × 48, and `gamelib.json` already exists in all 49 dirs, so no file creation). It puts
     fork content in the fork namespace, which is what D-06 and the standing convention say
     should have happened in the first place, and the presence baseline at `totalPairs: 0` then
     makes any future gap **CI-visible instead of silent**. Costs: ~7 `src/` call sites
     re-prefixed to `gamelib:`, and CI is red from the moment the English keys land until the
     fill completes — so it **must ship atomically**, not incrementally.

   Note that (b) is **not** the same change as step 5: it relocates fork content into the
   already-gated namespace rather than widening the gate over upstream namespaces. Step 5 stays
   separate either way.
4. **Do not regenerate the presence baseline as the fix.** The failure message offers "fill it or
   regenerate", and the two are **not** equivalent: the baseline's own `reason` string says it is
   "a RECORD of a known gap, not a permission to grow it". Regenerating turns the gate green while
   the user-facing gap remains. It is only appropriate for keys genuinely not intended for
   translation.
5. **Decide, separately and on its merits, whether the gate's namespace scope should widen.**
   Leaving `FORK_OWNED_NAMESPACES = ['gamelib']` means this exact defect can recur in
   `translation.json` and stay invisible. Widening it wholesale would surface the genuine upstream
   Weblate gaps the exclusion was written to suppress. A scoped third option exists — gate only the
   *fork-added* key prefixes within the upstream namespaces — but that needs a decision, not a
   reflex. **This is a separate change from the fill; do not bundle it.**

**Recorded traps that apply to all of the above:** new strings belong in `gamelib.json`, not
`translation.json`; a baseline at `totalPairs: 0` means any unfilled key is an immediate red; the
sanctioned `pnpm machine-fill-gamelib` path was last measured returning **HTTP 401** on the key in
`~/.gamelib.env`, so plan on hand-filling (which is legal and has been done before) rather than
budgeting for the machine fill.

## Verification

- `npx jest --testPathPattern lintTranslations` — no project filter needed; the suite is in the
  `Meta` project, so a `--selectProjects Backend` run **silently matches nothing and exits 0**.
- Both tests must reach 0 findings, not just the first. **As of 2026-09-15 both do** (32 passed) —
  so for the remaining scope this gate is **green and blind**, not a progress signal. The
  `translation.json` half must be verified by diffing key sets directly, never by an exit code.
- Confirm on a real render that a non-English locale shows translated Humble Keys copy — the gate
  measures presence, not correctness, so a green gate does not prove the strings are right.

## Related

- Pre-existing; not introduced by quick-260914-vbw. That task's diff contains **zero** locale files
  (8 files: 6 markdown, 1 plist, 1 `src-tauri` config key).
- `2026-09-15-darwin-asserting-suites-fail-on-the-linux-ci-runner.md` — the other CI red found in
  the same run, different in kind.
- The `lint` job is also red on `ts-prune` dead-code findings across frontend exports; that is a
  separate, already-known lint-ratchet condition.
