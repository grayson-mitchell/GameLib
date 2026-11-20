---
phase: 260921-rmj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - public/locales/fr/gamepage.json
  - src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
  - .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md
  - .planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md
  - .planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "A French-locale render of the production wikiLink <Trans> shows 'Ouvrir la page', not 'Open page'"
    - "That same render contains no '&amp;nbsp' in any form"
    - "That same render still carries U+00A0 immediately before the colon"
    - "The widened A4 assertion goes RED against the pre-fix French value and GREEN against the repaired one — proven by an executed mutation, not by reasoning"
    - "German coverage in the test file is retained, not replaced"
    - "The 15-locale empty-wikiLink finding survives the todo's closure as a new pending todo carrying a re-measured, corrected census"
  artifacts:
    - path: "public/locales/fr/gamepage.json"
      provides: "repaired fr wikiLink value"
      contains: "Ouvrir la page"
    - path: "src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts"
      provides: "A4 widened to the malformed-entity family AND parameterised over de+fr"
      contains: "fr"
    - path: ".planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md"
      provides: "the closed todo"
    - path: ".planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md"
      provides: "the re-filed, corrected sibling finding"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts"
      to: "public/locales/fr/gamepage.json"
      via: "i18next-fs-backend loadPath with lng: 'fr'"
      pattern: "'fr'"
---

<objective>
Repair the single malformed `wikiLink` value in `public/locales/fr/gamepage.json` — a broken
`&nbsp` entity and untranslated English link text — and widen the gate that was written for this
exact defect but cannot currently see it.

Purpose: French users visibly render the literal text `&nbsp ;` and an English `Open page` link on
every GamePage that has a known-fixes wiki link. The test named for this bug passes against it.

Output: one repaired catalog value, one widened + mutation-proven test, one closed todo, one
re-filed sibling finding with a corrected census.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md
@src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
@meta/i18nCatalogChurnGuard.ts

<measured_facts>
<!-- Measured during planning on 2026-09-21. Do NOT re-derive. Do not contradict without -->
<!-- re-measuring and saying so explicitly in the summary. -->

**M1 — the defect, rendered through real i18next + react-dom/server (orchestrator-measured):**

```
en:  Important information about this game, read this: <a …>Open page</a>
de:  Wichtige Informationen zu diesem Spiel, bitte lies dies: <a …>Öffne Seite</a>
fr:  Information importante au sujet de ce jeu, lisez ceci<U+00A0>: &amp;nbsp<U+202F>;<a …>Open page</a>
```

**M2 — the current `fr` value, read with `json.load`, codepoints explicit:**

```
Information importante au sujet de ce jeu, lisez ceci<U+00A0>: &nbsp<U+202F>;<1>Open page</1>
```

A literal `&nbsp`, then NARROW NO-BREAK SPACE (U+202F), then a bare `;`. Not a well-formed entity,
so the production `<Trans>`'s `shouldUnescape` has nothing to decode.

**M3 — sibling catalogs, for structural reference (planner-measured):**

```
en => Important information about this game, read this:&nbsp;<1>Open page</1>
de => Wichtige Informationen zu diesem Spiel, bitte lies dies:&nbsp;<1><U+00D6>ffne Seite</1>
es => Informaci<U+00F3>n importante sobre este juego, leer esto:&nbsp;<1>Abrir p<U+00E1>gina</1>
it => Informazioni importanti su questo gioco, leggi qui:&nbsp;<1>Apri la pagina</1>
```

Every one of them is `…:&nbsp;<1>` — colon, entity, tag, with no space between. `fr` is the outlier.

**M4 — `fr/gamepage.json`'s exact on-disk formatting (planner-measured, round-trip verified):**
`json.dumps(obj, indent=4, ensure_ascii=False)` + a single trailing `\n` reproduces the file
BYTE-IDENTICALLY. The file has 32 top-level keys; `wikiLink` is top-level, not nested.
`public/locales/` is listed in `.prettierignore` (line 5), so Prettier will never reformat it —
the round-trip above is the only formatting authority.

**M5 — the existing gate is blind to this variant.** A4 asserts
`expect(markup).not.toContain('&amp;nbsp;')`. Against French that **PASSES**, because U+202F sits
between `nbsp` and `;` so the exact substring `&amp;nbsp;` never occurs. A4 also only ever runs
against `lng: 'de'` — `createRealInstance()` hardcodes it.

**M6 — the churn guard reads the UNSTAGED working tree, and TWO things read it.**
`meta/i18nCatalogChurnGuard.ts:106-110` runs `git diff --name-only -- public/locales` with **no
`--cached`**. Any changed path under `public/locales/` that is not a `gamelib.json`/`gamelib.mt.json`
leaf is classified `upstream` and throws. Two consumers:
  1. the CLI, `pnpm i18n-churn-guard`
  2. `meta/__tests__/i18nCatalogChurnGuard.test.ts`'s `live tree` case — which runs under
     **`pnpm test:ci`**
So while `public/locales/fr/gamepage.json` is modified-but-UNSTAGED, BOTH go RED. Once `git add`ed,
`git diff` (worktree-vs-index) no longer lists it and both go GREEN. **Staging is the difference.**
This is not a workaround — it is what the guard measures. It exists to catch `pnpm i18n` parser
churn left lying in the tree, not to forbid committed hand-edits.

**M7 — hand-editing a legacy catalog is SETTLED. Do not re-open it.**
Precedent: `474c26c02` ("rebrand product self-references in 46 non-English catalogs") deliberately
hand-edited 87 catalog files including `public/locales/fr/gamepage.json` itself, and shipped green.
`a9436fa9d` did likewise. CLAUDE.md: GameLib is an independent project, not a fork tracking Heroic;
upstream mergeability is not a constraint and must not be raised as a caveat. The words
"upstream-owned catalog" in `REQ-34.8-*` and in the churn guard's docstring are LEGACY NAMES, not a
live ownership claim.

**M8 — ROUTE REJECTED, recorded here so it is not re-proposed.** Re-namespacing `wikiLink` into the
`gamelib` namespace is rejected as disproportionate: it would mean deleting a key from 49 locale
files and back-filling 48, to fix one malformed entity, and it carries three separately-recorded
traps (bulk namespace sweeps strand key pins invisibly; removing a locale key lands on 47 not 49
and breaks `da`/`id`/`nl`; `machine-fill-gamelib` is dead under a gateway-scoped key).

**M9 — THE TODO'S SIBLING FINDING IS WRONG ABOUT ITS MECHANISM (planner-measured, this session).**
The todo says 15 locales have "no `wikiLink` key at all". Measured across all 49 locale dirs:

```
wikiLink KEY ABSENT:            0 locales
wikiLink PRESENT but == "":    15 locales  (az bs eu fa he hr ka ko ml ro sk sr th uz zh_Hant)
no gamepage.json FILE at all:   2 locales  (br, sl)
wikiLink PRESENT and non-empty:32 locales
                                --
                                49
```

The 15 named locales are the right 15 and the *effect* the todo describes is right (they fall back
to English, because the test harness and the app both init i18next with `returnEmptyString: false`).
The *mechanism* is wrong: the key is present carrying an empty string, not absent. `br` and `sl` are
a third, unnamed condition the todo missed entirely. Zero locales are byte-identical-to-`en`.

**M10 — `pnpm lint-translations` cannot see the empty values.** It checks all four namespaces, but
only `gamelib` is in `FORK_OWNED_NAMESPACES` and only `gamelib` has a presence baseline
(`meta/lintTranslations.ts:413-424` states this in source). It is a must-stay-green regression gate
for this task, **not** a gate that covers the `gamepage` empty-value condition. Do not claim it does.

**M11 — jest project name** for the test file is `Frontend`
(`src/frontend/jest.config.js:16 displayName: 'Frontend'`).
</measured_facts>

<interfaces>
<!-- Read out of the test file during planning. The executor does not need to go find these. -->

`src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts` today:

- `createRealInstance(): Promise<I18nInstance>` — hardcodes `lng: 'de'`, `fallbackLng: 'en'`,
  `ns: ['translation','gamepage','gamelib']`, `returnEmptyString: false`, `initImmediate: false`.
- `renderReconstructed(instance): string` — builds the `<Trans>` from `EXTRACTED`
  (`i18nKey`/`ns`/`shouldUnescape` scraped out of `GamePage/index.tsx`) with `TEXT_SENTINEL` and an
  `<a>{LINK_SENTINEL}</a>` as children, then `renderToStaticMarkup`.
- `readGermanCatalogValue(): string` — joins `LOCALES_DIR/de/<ns>.json`, throws a locale-specific
  message if absent.
- `escapeLikeReact(text)`, `getNestedCatalogValue(catalog, dottedKey, ns)`.
- Tests: A1 (source has one Trans with i18nKey+ns), A2 (resolves to German text), A2b (`<1>` maps to
  child index 1), A3 (no sentinel fallback), A4 (`not.toContain('&amp;nbsp;')`).

`src/frontend/screens/Game/GamePage/index.tsx:466` (the element under test — **do not edit it**):
```
<Trans i18n={i18n} i18nKey="wikiLink" ns="gamepage" shouldUnescape>
```
Its preceding JSX comment states the accepted trade: `shouldUnescape` decodes `&nbsp;` to an
ordinary space (U+0020), not a true U+00A0. That trade is unchanged by this task and the comment
stays as written.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task A: Repair the fr wikiLink value, verified by a real render</name>
  <files>public/locales/fr/gamepage.json</files>
  <action>
Change exactly one value in `public/locales/fr/gamepage.json`. In Python escape notation, the
`wikiLink` value must become EXACTLY:

```python
"Information importante au sujet de ce jeu, lisez ceci :&nbsp;<1>Ouvrir la page</1>"
```

Three changes, each with its reason — state all three in the summary:

1. `&nbsp` + U+202F + `;`  →  a well-formed `&nbsp;` entity. The stray NARROW NO-BREAK SPACE and
   the ordinary space that preceded the broken entity both go, making the value structurally
   identical to `en`/`de`/`es`/`it` (`…:&nbsp;<1>`, per M3). This is what gives `shouldUnescape`
   something to decode.
2. `Open page`  →  `Ouvrir la page`. Cf. `de` = `Öffne Seite`, `es` = `Abrir página`,
   `it` = `Apri la pagina`.
3. The U+00A0 BEFORE the colon (`ceci :`) is **PRESERVED UNCHANGED**. It is correct French
   typography — a non-breaking space before a colon is standard French style — and is explicitly
   NOT part of the defect. Normalising it away would be WRONG.

**Edit it with a round-trip-verified Python script, not by hand and not with sed.** The script must,
in this order: (a) read the file's raw bytes; (b) `json.load` it; (c) assert that
`json.dumps(obj, indent=4, ensure_ascii=False) + "\n"` is BYTE-IDENTICAL to the raw bytes read in
(a), and abort if not — this is the guard that stops the diff swamping the commit; (d) assert the
current `wikiLink` value equals the M2 string exactly, and abort if not; (e) mutate; (f) write with
the same `indent=4, ensure_ascii=False` and the same trailing newline. M4 records that settings pair
as measured, but keep assertion (c) anyway — it is what makes the write safe if the file has moved
since planning.

**Preserve two byte-for-byte copies in the scratchpad before and after, they are needed by Task B:**
`cp public/locales/fr/gamepage.json $SCRATCH/fr-gamepage.PRE.json` BEFORE the edit, and
`cp public/locales/fr/gamepage.json $SCRATCH/fr-gamepage.POST.json` AFTER it.

**Then render it.** Write a temporary probe at
`src/frontend/screens/Game/GamePage/__tests__/frRenderProbe.scratch.test.ts` — it must live inside
the repo, because esbuild/jest module resolution walks up from the entry file and a scratchpad entry
cannot resolve `react-dom/server` or `i18next-fs-backend`. The probe imports nothing from the file
under test; it stands up its own real i18next instance (same init options as `createRealInstance()`,
per the `<interfaces>` block, but `lng: 'fr'`), renders the same reconstructed `<Trans>`, and
`console.log`s the markup with every non-ASCII codepoint made explicit as `<U+XXXX>`. Run it WITHOUT
`--silent` (the default `jest` run is not silent; `test:ci` is — do not use `test:ci` here).

**Delete the probe when Task A's verification is recorded**, and prove the deletion with
`git status --porcelain src/`. Leaving it behind would add an untracked test file to the Frontend
project and burn lint budget.

**Then stage the catalog edit immediately: `git add public/locales/fr/gamepage.json`.** Per M6, an
unstaged catalog change turns `pnpm i18n-churn-guard` AND the `live tree` case inside `pnpm test:ci`
RED. Staging is what makes them green, and it must happen before any full gate run.

Do NOT run `pnpm i18n`. Nothing here needs the parser and it would churn catalogs.
Do NOT use `git checkout -- public/locales/...` at any point — it fires this repo's post-checkout
hook. Do NOT use `git stash` — it disturbs concurrent sessions.
  </action>
  <verify>
    <automated>
Verification is a RENDER, not a grep. Run the probe:

```
npx jest --selectProjects Frontend --runInBand \
  src/frontend/screens/Game/GamePage/__tests__/frRenderProbe.scratch.test.ts
```

Paste the codepoint-explicit markup into the summary. PASS requires all three, simultaneously:
  1. markup CONTAINS `Ouvrir la page`
  2. markup contains NO `&amp;nbsp` — in ANY form, with or without a trailing `;`
  3. markup STILL carries `<U+00A0>` immediately before the colon

Then, as a separate check on blast radius:
```
git diff --cached --numstat -- public/locales/fr/gamepage.json
```
must report exactly `1  1` (one insertion, one deletion) against that one file, and
`git status --porcelain -- public/locales` must list only that one path.
    </automated>
  </verify>
  <done>
`public/locales/fr/gamepage.json` carries the exact target string; the fr render shows
`Ouvrir la page`, no `&amp;nbsp` in any form, and U+00A0 before the colon; the diff is one line
changed in one file; the probe file is deleted; the catalog edit is staged; PRE and POST copies
exist in the scratchpad.
  </done>
</task>

<task type="auto">
  <name>Task B: Widen A4 to the malformed-entity family AND to French, then prove it by mutation</name>
  <files>src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts</files>
  <action>
A4 cannot see the French shape (M5) for two independent reasons, and BOTH must be fixed or the gate
stays blind:

1. **It matches one exact string.** `not.toContain('&amp;nbsp;')` misses `&amp;nbsp<U+202F>;`.
   Widen it to the malformed FAMILY: assert the markup contains no `&amp;nbsp` at all, any suffix.
2. **It only ever runs against German.** `createRealInstance()` hardcodes `lng: 'de'`.

Parameterise the instance by locale — `createRealInstance(lng: string)` — and run A4 over a named,
explicit locale set: **`['de', 'fr']`**. Both are required; do not replace German with French.

**Keep A1, A2, A2b and A3 on German, unchanged in meaning.** `readGermanCatalogValue()` and A2's
`fullValue.split('&nbsp;')[0]` are German-shaped: pointing A2 at the PRE-fix French value would make
the split no-op and return the whole string including `<1>Open page</1>`, producing a confusing
failure that is a harness bug, not a finding. Restrict the widening to A4.

**Do NOT widen A4 to all 49 locale dirs.** Per M9, 15 carry an empty `wikiLink` and fall back to
`en`, and `br`/`sl` have no `gamepage.json` at all — a 49-locale A4 would be green for reasons that
have nothing to do with what it claims to measure. `de` + `fr` is the honest set.

**Update the file's header comment** to match the widened behaviour. Today it describes A4 as
pinning `&nbsp;` decoding against a single locale. It must now also say: that A4 matches the
malformed FAMILY rather than one exact string, because the French value carried
`&nbsp` + U+202F + `;` and the exact-string form passed against it; and that A4 runs over a named
locale set, because the German-only form could never have seen it. Preserve the file's existing
explanatory-comment style and its existing LIMITATION paragraph verbatim.

**MUTATION PROOF — MANDATORY, and the task is not done without it.** This repo has recorded,
repeatedly, that a test named for a bug can sit upstream of its own symptom and pass unfixed. A
"the suite passes" verification is insufficient and will be rejected. Execute, in this order, and
record the ACTUAL output of each step:

  1. Run the widened test against the REPAIRED catalog. Record GREEN.
  2. `cp $SCRATCH/fr-gamepage.PRE.json public/locales/fr/gamepage.json` — restore the malformed
     value. Use `cp` from the Task A copy; do NOT use `git checkout --` (post-checkout hook) and do
     NOT use `git stash` (disturbs concurrent sessions).
  3. Run the widened test file ALONE. Record it going **RED**, with the actual assertion output
     pasted into the summary — including the received markup, so the recorded evidence shows the
     `&amp;nbsp` the gate now catches.
  4. `cp $SCRATCH/fr-gamepage.POST.json public/locales/fr/gamepage.json` — restore the fix.
  5. Re-run. Record GREEN.
  6. Confirm the tree is back where Task A left it: `git status --porcelain -- public/locales` must
     be EMPTY (the staged content and the worktree content are identical again). If it is not,
     `git add public/locales/fr/gamepage.json` and re-check.

**During step 2–4 the working tree carries an unstaged upstream-catalog change, so per M6 both
`pnpm i18n-churn-guard` and the `live tree` case inside `pnpm test:ci` WILL be RED in that window.
That red is the churn guard doing its job on a deliberately-dirtied tree — it is NOT the mutation
proof and it is NOT a defect. Do not run `pnpm test:ci` or the churn guard between steps 2 and 6,
and do not report anything from that window as a gate failure.**

Do not edit `src/frontend/screens/Game/GamePage/index.tsx`. A1's extractor reads it, and its
`shouldUnescape` trade comment remains accurate.

`pnpm lint` has TWO ceilings with ONE free slot — do not introduce new warnings. An orphaned
`eslint-disable` costs +2.
  </action>
  <verify>
    <automated>
Targeted run (this is the gate under test):
```
npx jest --selectProjects Frontend --runInBand \
  src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
```
PASS requires: A1, A2, A2b, A3 green on German; A4 green for BOTH `de` and `fr` as separately-named
cases in the jest output (the locale must be visible in the test name, so the report shows French
actually ran).

The mutation proof above is itself a required verification artifact: RED at step 3 with pasted
output, GREEN at steps 1 and 5. A recorded GREEN-only run does not satisfy this task.

Then, with the tree clean per step 6, run the full gate set:
```
pnpm codecheck
npx jest --selectProjects Frontend --runInBand
pnpm test:ci
pnpm lint
pnpm lint-translations
pnpm i18n-churn-guard
```
`pnpm test:ci` and `pnpm i18n-churn-guard` are the two that read the working tree (M6) — they are
meaningful only once the catalog edit is staged and step 6 has confirmed a clean `git status`.
`pnpm lint-translations` is a must-stay-green regression check here; per M10 it has no presence
baseline for `gamepage` and does NOT cover the empty-value condition — do not claim that it does.
    </automated>
  </verify>
  <done>
A4 asserts against `&amp;nbsp` (family, not exact string) and runs over `de` and `fr` as separately
named cases; A1/A2/A2b/A3 still cover German; the header comment describes the widened behaviour and
why; the mutation proof is recorded RED-then-GREEN with actual output; all six gates above are green
on a clean tree.
  </done>
</task>

<task type="auto">
  <name>Task C: Re-file the corrected sibling finding, then close the todo</name>
  <files>.planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md, .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md, .planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md</files>
  <action>
**Order matters: re-file FIRST, close SECOND.** Closing a todo whose body carries an unfixed sibling
finding discards it — that is a recorded failure mode in this repo.

**C1 — re-measure, do not copy the number on trust.** The todo's body records 15 locales with "no
`wikiLink` key at all". M9 measured that claim and it is WRONG ABOUT ITS MECHANISM. Re-run the
census yourself (a short Python sweep over every directory in `public/locales/`, bucketing each into
key-absent / key-present-but-empty / no-`gamepage.json`-file / non-empty) and reproduce the buckets
before writing anything. Expect M9's numbers; if you get different ones, say so explicitly and go
with your measurement.

**C2 — create `.planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md`.**
Frontmatter must carry `severity:`, `platform:`, `ready:` in that order, bare lowercase and exact,
per CLAUDE.md's "Todo triage frontmatter (enforced by CI)" — the `/gsd-add-todo` template does not
emit them, so add them by hand. Use:

```yaml
severity: minor
platform: any
ready: human
```

`minor` because the fallback renders correct English and nothing is broken or lost; `human` because
closing it needs 15 real translations, not code. Also set `found_by: "quick-260921-rmj"` and
`area: i18n`.

The body must state, as measurement:
  - the corrected mechanism — key PRESENT carrying `""`, not absent — and that the effect (falling
    back to English) is real because i18next is initialised with `returnEmptyString: false`
  - the 15 named locales
  - the third condition the original todo missed: `br` and `sl` have no `public/locales/*/gamepage.json`
    file at all
  - the full bucket counts, summing to the 49 locale dirs, so the census is checkable rather than
    asserted
  - that `pnpm lint-translations` cannot detect this (M10: only `gamelib` has a presence baseline),
    so nothing in CI is watching it
  - that this is NOT the `fr` malformed-entity defect and must not be conflated with it

**C3 — correct the old todo's body before moving it.** Its "Separate, deliberately-untouched
pre-existing condition" paragraph asserts the wrong mechanism. Leaving it uncorrected in
`completed/` leaves a false measurement in the record. Edit that paragraph to state the corrected
finding and to point at the new pending todo by filename. Add a short closing note recording what
shipped (the one-value repair and the widened A4) and that the `gamelib` re-namespace route was
considered and REJECTED as disproportionate, with M8's three traps named — the rejection belongs in
the todo, not only in this plan.

**C4 — move it with plain `mv` + `git add`, NOT `git mv`.** The body IS edited by C3, and `git mv`
commits HEAD content and silently drops unstaged working-tree edits — that has happened twice in
this repo, once running undetected for seven days. So:

```
mv .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md \
   .planning/todos/completed/
git add -A .planning/todos/
```

Then PROVE the edited content actually made it into the index, rather than assuming:
```
git show :.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md \
  | diff - .planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md
```
must produce no output.

Check the new todo's last line is not a stray closing tag — agents have left orphaned closing tags
as a todo's final line across six files in this repo, and the frontmatter gate is body-blind by
design and will not catch it.
  </action>
  <verify>
    <automated>
```
pnpm planning-gates
```
must pass — it discovers and runs `.planning/todos/todo-frontmatter-gate.py`, which enforces the
`severity`/`platform`/`ready` triple on everything in `pending/` (scope is `pending/` only;
`completed/` is exempt), plus the UAT-visibility gate.

Then prove the move and the census, not just the gate:
```
ls .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md
```
must fail (file gone from pending), and
```
git status --porcelain .planning/todos/
```
must show the delete/add pair for the moved file plus the new pending todo, and nothing else.
The `git show :<path> | diff -` check in C4 must produce no output.
Paste the re-run census buckets into the summary alongside the numbers the new todo claims — the
two must agree.
    </automated>
  </verify>
  <done>
The corrected 15-locale finding exists at `.planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md`
with `severity: minor` / `platform: any` / `ready: human` in that order; the original todo is in
`completed/` with its sibling paragraph corrected, the rejected route recorded, and its edited
content proven present in the index; `pnpm planning-gates` is green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| catalog JSON → React render | Catalog text reaches the DOM through `<Trans shouldUnescape>`, which DECODES HTML entities in translator-supplied strings |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rmj-01 | Tampering | `fr/gamepage.json` wikiLink value under `shouldUnescape` | accept | `shouldUnescape` decodes entities in catalog text, so a catalog string is a partial injection surface. The value written here is a fixed `&nbsp;` and plain French prose — no `<`, no `>`, no attribute context, and the `<1>` marker is an i18next child-index token resolved by `Trans`, not markup. The surface is pre-existing and every other locale already carries `&nbsp;`; this change does not widen it. |
| T-rmj-02 | Tampering | unreviewed churn across 48 other catalogs | mitigate | Task A's round-trip assertion aborts before mutating if re-dump is not byte-identical; verification pins `git diff --cached --numstat` to exactly `1 1` on exactly one path, and `git status --porcelain -- public/locales` to that one path. |
| T-rmj-03 | Repudiation | a gate that passes without measuring | mitigate | Task B's mandatory mutation proof: the widened A4 must be shown RED against the pre-fix value with actual output, not merely green after the fix. |
| T-rmj-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs NO packages. No `package.json` dependency change, no lockfile change. No legitimacy checkpoint required. |
</threat_model>

<verification>
Gates that are genuinely relevant to this change, and what each can and cannot see:

| Gate | Sees | Does NOT see |
|------|------|--------------|
| `npx jest --selectProjects Frontend` | the widened A4 against real `de` + `fr` catalogs through real i18next | anything about a full component render — the Frontend project is `testEnvironment: node` with no DOM renderer |
| `pnpm test:ci` | the `live tree` churn assertion (M6) plus every project | nothing about the French render beyond what the Frontend project already runs |
| `pnpm codecheck` | TypeScript errors from the test-file changes | lint errors — `tsc --noEmit` cannot see them |
| `pnpm lint` | new warnings against its TWO ceilings, ONE free slot | — |
| `pnpm lint-translations` | regression across all four namespaces | the empty-`wikiLink` condition: only `gamelib` has a presence baseline (M10) |
| `pnpm i18n-churn-guard` | an UNSTAGED catalog change (M6) | a staged or committed one — by design |
| `pnpm planning-gates` | the new pending todo's `severity`/`platform`/`ready` frontmatter | the todo BODY, including a stray trailing closing tag |

Deliberately NOT run: `pnpm i18n` (would churn catalogs, and nothing here needs the parser);
`pnpm smoke:sidecar` (no backend or sidecar code is touched).
</verification>

<success_criteria>
- A French render of the production `<Trans>` shows `Ouvrir la page`, contains no `&amp;nbsp` in any
  form, and still carries U+00A0 before the colon — shown as codepoint-explicit output.
- The catalog diff is exactly one line in exactly one file.
- A4 matches the malformed family and runs over both `de` and `fr` as separately named cases.
- The mutation proof is recorded RED-with-output then GREEN. A green-only run fails this plan.
- German coverage is retained, not replaced.
- The 15-locale finding survives closure as a new pending todo with a RE-MEASURED, corrected census
  (present-but-empty, not absent) and correct triage frontmatter.
- All gates in `<verification>` green on a clean, staged tree.
</success_criteria>

<output>
Create `.planning/quick/260921-rmj-fix-fr-gamepage-wikilink-entity/260921-rmj-SUMMARY.md` when done.

The summary must carry, as pasted evidence rather than claims: the codepoint-explicit French render;
the mutation proof's RED output; the re-run census buckets; and the three reasons for the three
changes to the `fr` value, including why the U+00A0 before the colon was deliberately left alone.
</output>
