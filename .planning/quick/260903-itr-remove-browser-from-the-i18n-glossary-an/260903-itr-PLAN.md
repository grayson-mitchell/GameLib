---
phase: quick-260903-itr
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: []
files_modified:
  - meta/i18nGlossary.json
  - public/locales/<48 non-en locales>/gamelib.json
  - public/locales/<48 non-en locales>/gamelib.mt.json
  - .planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md
  - .planning/STATE.md
  - .planning/quick/260903-itr-remove-browser-from-the-i18n-glossary-an/260903-itr-SUMMARY.md

must_haves:
  truths:
    - "`Browser` is absent from the committed `meta/i18nGlossary.json` terms array."
    - "The glossary rationale records, in the committed file, why `Browser` was removed on 2026-09-03 and still contains `D-02` and `D-21`."
    - "All three glossary-consumer gates are green after the removal: i18nGlossary, hardcodedStringGate, gamelibCatalogParity."
    - "96 locale catalog paths are committed in a commit containing nothing else, and `public/locales/en/gamelib.json` is not among them."
    - "The owning todo's numbers describe 2026-09-03 reality and the todo is still `status: pending`."
    - "The todo's `**Sole owner:**` sentinel line is byte-identical to its HEAD version."
  artifacts:
    - path: "meta/i18nGlossary.json"
      provides: "27-term do-not-translate glossary with Browser removed"
      contains: "D-02"
    - path: ".planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md"
      provides: "Corrected coverage numbers, still pending"
    - path: ".planning/quick/260903-itr-remove-browser-from-the-i18n-glossary-an/260903-itr-SUMMARY.md"
      provides: "Outcome record incl. the deferred machineFillGamelib follow-up"
  key_links:
    - from: "meta/i18nGlossary.json"
      to: "meta/machineFillGamelib.ts validateTranslation"
      via: "glossary terms array consumed by containsTermLoose/containsTermVerbatim"
      pattern: "i18nGlossary"
    - from: "meta/i18nGlossary.json"
      to: "meta/hardcodedStringGate.ts glossarySet.has(text)"
      via: "loadGlossary() exemption for isolated literals"
      pattern: "loadGlossary"
---

<objective>
Remove the common-noun term `Browser` from the i18n do-not-translate glossary, commit the
already-produced machine-filled locale catalogs, and correct the owning todo's now-stale numbers.

Purpose: `Browser` is silently rejecting 185 of 242 outstanding translations. It is the only
glossary entry that is also an everyday English common noun, and `machineFillGamelib.ts` applies
glossary rules case-INsensitively (`containsTermLoose`) but enforces them case-SENSITIVELY
(`containsTermVerbatim`). Any English string containing the ordinary word "browser" therefore
demands the literal ASCII `Browser` in the translation, which no correct translation of
*navigateur* / *navegador* / *selain* / *böngésző* can satisfy. German is at 209/209 purely because
"Browser" happens to be the German noun.

Output: two code/content commits, one todo commit, one closure commit.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

Files in play:
@meta/i18nGlossary.json
@meta/__tests__/i18nGlossary.test.ts
@.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md
</context>

<measured_facts>
Established by measurement at plan time on 2026-09-03. Do NOT re-derive these; they are correct.

**Working tree.** `HEAD` is `ac4f7dda0`. `git status --porcelain -- public/locales/` yields exactly
**96** paths: `de` and `fr` modified (2 catalogs + 2 sidecars), 46 locales' catalogs and sidecars
untracked. Split is **48 `gamelib.json` + 48 `gamelib.mt.json`**. `public/locales/en/` has **zero**
changed paths. There are 49 locale dirs total. The task brief said "~97" — the measured count is 96.

**`Browser` is not required by the glossary test.** `meta/__tests__/i18nGlossary.test.ts` defines
`REQUIRED_TERMS` with 17 entries (GameLib, Steam, Epic, GOG, Proton, CrossOver, Steam Deck, Linux,
macOS, Windows, MB/s, Amazon, ZOOM, Zoom, Epic/Legendary, Amazon/Nile, Amazon Games). `Browser` is
absent. Removing it from the JSON does not fail that suite. The test also asserts `terms` is sorted
ascending and duplicate-free, and that `rationale` contains both `D-02` and `D-21`.

**The glossary has THREE consumers, two of which are gates.** This is the part the brief did not
cover, and it drives the gate list below.

1. `meta/machineFillGamelib.ts` — the intended target.
2. `meta/__tests__/gamelibCatalogParity.test.ts` — reads the real `meta/i18nGlossary.json` and runs
   `validateTranslation(source, target, glossary)` (the *same* function the fill runs) over every
   `public/locales/*/gamelib.json` discovered by glob. It deliberately asserts no locale count, so
   the bulk commit is covered the moment it lands. **It skips `target === ''`**, so the 242 unfilled
   keys are empty strings and do not fail it — meaning this suite is expected to be GREEN both
   before and after the glossary edit. Record its real baseline; do not assert a predicted RED.
3. `meta/hardcodedStringGate.ts` — `loadGlossary()` feeds a `glossarySet`, and
   `if (glossarySet.has(text))` exempts an isolated literal from the blocking hardcoded-string gate.
   **`src/frontend/screens/Library/components/InstallModal/index.tsx` is line 115 of
   `meta/i18nGateScope.json`, and it carries `name: 'Browser'` / `value: 'Browser'` at :247-249.**
   Removing `Browser` from the glossary can therefore flip a blocking gate RED. Its hermetic
   `glossary exemption` fixtures use only the 17 `REQUIRED_TERMS`, so the fixtures are safe; the
   risk is confined to the scope-driven blocks. Task 1 measures this rather than assuming.

**Script invocations.** `pnpm test` is `jest`. `pnpm lint-translations:gamelib` exists
(`package.json:55`) and — measured — `meta/lintTranslations.ts` contains **no** reference to the
glossary, so it is unaffected by Task 1 and belongs to Task 2 as a catalog gate.

**Sentinel.** Exactly two files tree-wide contain `Sole owner`: the todo, and a quoted copy inside
`.planning/quick/260902-ad5-.../260902-ad5-PLAN.md`. The todo's line reads verbatim:
`**Sole owner:** this todo OWNS the 46-locale x 204-key fork-string coverage gap.`
It embeds the stale figure `204`. **Freeze this line byte-identically** — correct the numbers in
surrounding prose instead. Rewording it risks the gate that asserts a single owner.
</measured_facts>

<commit_safety>
Applies to every commit in this plan. A concurrent session is active and holds uncommitted work in
`.planning/ROADMAP.md` and `.planning/STATE.md`.

BANNED, without exception: `git stash`, `git reset`, `git checkout -- <file>` (fires this repo's
post-checkout hook and triggers a binary download — use `cp`), `git add -A`, `git add .`,
`gsd-sdk query commit`, and `git commit -- <path>` (`--only` takes the WORKING TREE, not the index).

**Standard commit recipe** (Tasks 1, 2, 3):

```bash
STAGED=$(git diff --cached --name-only)
[ -z "$STAGED" ] || { echo "ABORT: index not empty, another session may have staged: $STAGED"; exit 1; }
git add <explicit paths>
git diff --cached --name-only | sort > /tmp/itr-staged.txt
# assert /tmp/itr-staged.txt is EXACTLY the expected set before proceeding
git commit -m "<message>"   # bare, never with a pathspec
```

**Content gates read `git show HEAD:<path>`, never the working file.** Earlier today a gate that
read the working tree reported OK while the commit shipped a bare rename. For each committed path
also run the order-independent backstop:

```bash
diff <(git show HEAD:"$f") "$f"    # must be empty
```

**`.planning/STATE.md` (Task 4) uses a prepared index**, because the working file currently carries
the other session's uncommitted lines:

```bash
git show HEAD:.planning/STATE.md > /tmp/itr-state.base
printf '%s\n' "$ROW" >> /tmp/itr-state.base          # our row only, appended at EOF
printf '%s\n' "$ROW" >> .planning/STATE.md            # additive at EOF; disturbs no other line
BLOB=$(git hash-object -w /tmp/itr-state.base)
git update-index --cacheinfo 100644,"$BLOB",.planning/STATE.md
git commit -m "..."                                   # bare
```

The table rows live at EOF (last row is line 8220, format `| YYYY-MM-DD | fast | text | ✅ |`), so
appending is safe. After this commit the working file legitimately still shows the other session's
diff. That is correct — leave it.
</commit_safety>

<tasks>

<task type="auto">
  <name>Task 1: Remove `Browser` from the glossary and prove the three consumer gates</name>
  <files>meta/i18nGlossary.json</files>
  <action>
Record baselines FIRST, before editing anything, so the change has a before/after:
run `pnpm jest meta/__tests__/i18nGlossary.test.ts meta/__tests__/hardcodedStringGate.test.ts
meta/__tests__/gamelibCatalogParity.test.ts` and capture pass/fail counts verbatim. Expect all three
green (see measured_facts #2 on why parity is green even now); if any is already red, record that as
a pre-existing condition and do not attribute it to this change.

Then edit `meta/i18nGlossary.json`, which is `{ "terms": string[28], "rationale": string }`:

1. Delete exactly the one array element `"Browser"`, leaving 27 terms. The array must stay sorted
   ascending with no duplicates. Do NOT add `Browser` to `REQUIRED_TERMS` in the test — the test
   needs no change, per measured_facts #2.
2. Append to the existing `rationale` string (do not replace it — it must still contain the
   substrings `D-02` and `D-21`, which its test asserts). The appended sentence must record: that
   quick task `260903-itr` removed `Browser` on 2026-09-03; that it was the only glossary entry that
   is also an everyday English common noun; that `machineFillGamelib.ts` applies glossary rules via
   the case-INsensitive `containsTermLoose` but enforces them via the case-SENSITIVE
   `containsTermVerbatim`, so every correct translation of the common noun "browser" was silently
   dropped in 46 languages while the run still exited 0; that `de` reached full coverage only because
   "Browser" is the German noun; and that it must not be re-added — the general fix is to make the
   loose matcher case-sensitive.

Do NOT touch `meta/machineFillGamelib.ts`. Making `containsTermLoose` case-sensitive is the more
general fix and would also protect `Mac`, `GE` and `Zoom`, but it changes validator semantics for all
27 remaining terms and needs its own test pass. Carry it to the SUMMARY as a follow-up.

Now run the gates:
- `pnpm jest meta/__tests__/i18nGlossary.test.ts` — report actual output.
- `pnpm jest meta/__tests__/hardcodedStringGate.test.ts` — **the real risk.** If it goes RED at
  `InstallModal/index.tsx`, do NOT re-add `Browser`; that would defeat the task. The correct fix is a
  declaration-scoped exemption marker at the flagged site, because `name: 'Browser'` / `value:
  'Browser'` there are members of the `InstallPlatform` union (`src/common/types.ts:725`) — internal
  identifiers, not user prose. Editing `src/` is permitted. Re-run this suite plus `pnpm codecheck`
  after any such edit, and record the marker in the SUMMARY.
- `pnpm jest meta/__tests__/gamelibCatalogParity.test.ts` — must be green.
- `pnpm lint-translations:gamelib` — report actual output.

Commit `meta/i18nGlossary.json` (plus any exemption-marker file) ALONE, per commit_safety, message
`fix(i18n): drop Browser from the do-not-translate glossary`. Keep `public/locales/` out of it.
  </action>
  <verify>
    <automated>
f=meta/i18nGlossary.json
diff <(git show HEAD:"$f") "$f"                       # must be empty
git show HEAD:"$f" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const g=JSON.parse(s), t=g.terms;
    const bad=[];
    if(t.includes("Browser")) bad.push("Browser still present");
    if(t.length!==27) bad.push("expected 27 terms, got "+t.length);
    if(JSON.stringify(t)!==JSON.stringify([...t].sort())) bad.push("not sorted");
    if(new Set(t).size!==t.length) bad.push("duplicates");
    for(const d of ["D-02","D-21"]) if(!g.rationale.includes(d)) bad.push("rationale lost "+d);
    if(!/2026-09-03/.test(g.rationale)) bad.push("rationale does not date the removal");
    if(bad.length){console.error("FAIL: "+bad.join("; "));process.exit(1)}
    console.log("OK: 27 terms, sorted, unique, Browser absent, rationale intact");
  })'
grep -c "'Browser'" meta/__tests__/i18nGlossary.test.ts   # must be 0 — Browser never added to REQUIRED_TERMS
git show --name-only --format= HEAD | grep -c '^public/locales/'   # must be 0
pnpm jest meta/__tests__/i18nGlossary.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/gamelibCatalogParity.test.ts
pnpm lint-translations:gamelib
    </automated>
  </verify>
  <done>`git show HEAD:meta/i18nGlossary.json` has 27 sorted unique terms without `Browser`, a rationale still carrying `D-02`/`D-21` plus the dated removal note; all three consumer suites and `lint-translations:gamelib` are green; the commit contains no `public/locales/` path.</done>
</task>

<task type="auto">
  <name>Task 2: Commit the 96 machine-filled locale catalog paths</name>
  <files>public/locales/*/gamelib.json, public/locales/*/gamelib.mt.json (48 locales, en excluded)</files>
  <action>
Must run AFTER Task 1 is committed, so the catalogs land under the corrected glossary.

Do NOT run `pnpm machine-fill-gamelib`. Do not set or read `ANTHROPIC_API_KEY`. The catalogs already
exist in the working tree and are already verified; this task commits them and re-proves the
invariants cheaply from git objects.

Stage `public/locales/` per commit_safety. Before committing, assert the staged set is exactly 96
paths, every one under `public/locales/`, split 48 `gamelib.json` + 48 `gamelib.mt.json`, and that
`public/locales/en/gamelib.json` is NOT among them.

Commit message `feat(i18n): machine-fill gamelib.json for 48 locales`. Cite in the body the
verification rather than re-deriving it at length: interpolation-placeholder parity with the English
source, brand-term preservation, and the measured filled/outstanding counts from the gate below.
**Write the MEASURED numbers into the message, not the numbers quoted in the brief.** The brief cites
9,783 filled and 242 outstanding; 209 translatable keys x 48 locales = 10,032, so those two figures
differ by 7 and at most one derivation can be right. Report what the gate actually measures, and note
any delta in the SUMMARY rather than propagating an unverified figure.

The content gate is `meta/__tests__/gamelibCatalogParity.test.ts`, which globs the working tree. To
satisfy the "gates read HEAD" rule, run it only once `git status --porcelain -- public/locales/` is
EMPTY — that emptiness is the proof that the globbed working tree equals HEAD — and add the
per-file `diff <(git show HEAD:"$f") "$f"` backstop.
  </action>
  <verify>
    <automated>
git show --name-only --format= HEAD | sort > /tmp/itr-c2.txt
[ "$(wc -l < /tmp/itr-c2.txt)" -eq 96 ] || { echo "FAIL: expected 96 paths, got $(wc -l < /tmp/itr-c2.txt)"; exit 1; }
[ "$(grep -cv '^public/locales/' /tmp/itr-c2.txt)" -eq 0 ] || { echo "FAIL: non-locale path in commit"; grep -v '^public/locales/' /tmp/itr-c2.txt; exit 1; }
[ "$(grep -c 'gamelib\.json$' /tmp/itr-c2.txt)" -eq 48 ] || { echo "FAIL: catalog count"; exit 1; }
[ "$(grep -c 'gamelib\.mt\.json$' /tmp/itr-c2.txt)" -eq 48 ] || { echo "FAIL: sidecar count"; exit 1; }
grep -q '^public/locales/en/' /tmp/itr-c2.txt && { echo "FAIL: en catalog is in the commit"; exit 1; }
while read -r f; do diff <(git show HEAD:"$f") "$f" > /dev/null || { echo "FAIL: HEAD != worktree for $f"; exit 1; }; done < /tmp/itr-c2.txt
[ -z "$(git status --porcelain -- public/locales/)" ] || { echo "FAIL: public/locales not clean; parity glob would not equal HEAD"; exit 1; }
git show HEAD:public/locales/en/gamelib.json | diff - public/locales/en/gamelib.json   # en untouched
node -e '
  const {execSync}=require("child_process"),fs=require("fs");
  const flat=(o,p="")=>Object.entries(o).reduce((a,[k,v])=>{const K=p?p+"."+k:k;
    return typeof v==="string"?(a[K]=v,a):Object.assign(a,flat(v,K))},{});
  const en=flat(JSON.parse(execSync("git show HEAD:public/locales/en/gamelib.json","utf8")));
  const trans=Object.keys(en).filter(k=>en[k]!=="");
  const locs=fs.readdirSync("public/locales").filter(l=>l!=="en"&&fs.existsSync(`public/locales/${l}/gamelib.json`));
  let filled=0,out=0,mis=0;
  for(const l of locs){
    const t=flat(JSON.parse(execSync(`git show HEAD:public/locales/${l}/gamelib.json`,"utf8")));
    for(const k of trans){
      const v=t[k]??"";
      if(v===""){out++;continue}
      filled++;
      const ph=s=>[...String(s).matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m=>m[1]).sort().join("|");
      if(ph(en[k])!==ph(v))mis++;
    }
  }
  console.log(`locales=${locs.length} translatable=${trans.length} filled=${filled} outstanding=${out} placeholder_mismatches=${mis}`);
  if(locs.length!==48){console.error("FAIL: expected 48 non-en locales");process.exit(1)}
  if(mis!==0){console.error("FAIL: placeholder mismatches");process.exit(1)}
'
pnpm jest meta/__tests__/gamelibCatalogParity.test.ts
pnpm lint-translations:gamelib
    </automated>
  </verify>
  <done>A single commit carries exactly 96 paths, all under `public/locales/`, 48 catalogs + 48 sidecars, without `public/locales/en/gamelib.json`; every committed blob matches the worktree; 48 non-en locales verify with 0 placeholder mismatches; catalog parity and `lint-translations:gamelib` are green; measured filled/outstanding counts are recorded.</done>
</task>

<task type="auto">
  <name>Task 3: Correct the owning todo's numbers in place, keeping it pending</name>
  <files>.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md</files>
  <action>
Rewrite the todo's body so it describes 2026-09-03 reality. It **stays `status: pending`** — the gap
is smaller, not closed.

Preserve byte-identically: the `**Sole owner:**` line (measured_facts #4 — it embeds the stale `204`
and a gate asserts exactly one file tree-wide carries it), and the `status: pending` frontmatter key.

Correct these, using the numbers Task 2 actually MEASURED wherever they differ from the brief:
- All **49** locale dirs now carry a `gamelib.json`; 48 MT sidecars exist. The title and the "46
  locales have never had a single fork string filled" claim are no longer true — reword the body
  (the frontmatter `title:` may be updated to match).
- English is now **209** translatable keys, up from 204 (it grew via `096ee4edb` and the nav/About
  work).
- Record the measured filled count and the **242** outstanding fills, with `de` the only locale at
  209/209.
- Replace the `blocked_by:` framing. The dominant blocker is no longer the API key. Note that the
  `Browser` glossary bug — fixed today by quick `260903-itr`, this task — was silently rejecting
  **185 of the 242** outstanding fills (only 4 English strings use "browser" as a common noun, but
  4 x 46 locales = 185), and that a re-run is required AFTER this fix to collect them.
- Record that the remaining **57** are NOT yet diagnosed and need separate investigation, naming the
  worst offenders: et 37, fi 17, hu 11 (also sk 4, hr 6, sl 5, sv 5, ta 1).
- Add `meta/hardcodedStringGate.ts` and `meta/__tests__/gamelibCatalogParity.test.ts` to the `files:`
  list if a future re-run's glossary changes would touch them.

Do NOT edit `.planning/ROADMAP.md` or `public/locales/en/gamelib.json`. Commit this file ALONE per
commit_safety, message `docs(todo): correct the 46-locale coverage numbers after the machine fill`.
  </action>
  <verify>
    <automated>
f=.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md
diff <(git show HEAD:"$f") "$f"                        # must be empty
git show --name-only --format= HEAD | sort > /tmp/itr-c3.txt
[ "$(cat /tmp/itr-c3.txt)" = "$f" ] || { echo "FAIL: commit is not exactly the todo"; cat /tmp/itr-c3.txt; exit 1; }
SENT='**Sole owner:** this todo OWNS the 46-locale x 204-key fork-string coverage gap.'
git show HEAD:"$f" | grep -Fxq "$SENT" || { echo "FAIL: sentinel line altered"; exit 1; }
[ "$(grep -rlF "$SENT" .planning/todos/ | wc -l)" -eq 1 ] || { echo "FAIL: sentinel not unique under todos/"; exit 1; }
git show HEAD:"$f" | grep -q '^status: pending$' || { echo "FAIL: no longer pending"; exit 1; }
for n in 209 242 185 57; do git show HEAD:"$f" | grep -v '^#' | grep -q "$n" || { echo "FAIL: missing figure $n"; exit 1; }; done
git show HEAD:"$f" | grep -qi 'browser' || { echo "FAIL: does not name the Browser glossary cause"; exit 1; }
git show HEAD:"$f" | grep -qi 'et 37\|fi 17\|hu 11' || { echo "FAIL: undiagnosed 57 not broken out"; exit 1; }
git show HEAD:"$f" | grep -q '204 translatable keys x 46 locales' && echo "WARN: stale scale line may remain outside the sentinel — confirm intentional"
    </automated>
  </verify>
  <done>The committed todo is still `status: pending`, carries the corrected 209/242/185/57 figures, names the `Browser` glossary bug as the dominant blocker and the undiagnosed remainder with et/fi/hu broken out, and its `**Sole owner:**` line is byte-identical and still unique under `.planning/todos/`.</done>
</task>

<task type="auto">
  <name>Task 4: Write the SUMMARY and append the STATE.md row via a prepared index</name>
  <files>.planning/quick/260903-itr-remove-browser-from-the-i18n-glossary-an/260903-itr-SUMMARY.md, .planning/STATE.md</files>
  <action>
Write `260903-itr-SUMMARY.md` recording: the three commits and their SHAs; the diagnosis (loose-apply
/ verbatim-require asymmetry, `de` passing by linguistic accident); the measured filled/outstanding
counts and any delta against the brief's 9,783/242; the baseline-vs-after result of all three
glossary-consumer gates; whether `hardcodedStringGate` needed an exemption marker and where.

Record two explicit follow-ups:
1. **Deferred, deliberately:** make `containsTermLoose` in `meta/machineFillGamelib.ts`
   case-sensitive. It is the general fix and would also protect `Mac`, `GE` and `Zoom` from the same
   class of false rejection, but it changes validator semantics for all 27 remaining terms and needs
   its own test pass.
2. **Owed:** a `pnpm machine-fill-gamelib` re-run to collect the 185 now-unblocked fills, and a
   separate investigation of the undiagnosed 57 (et 37, fi 17, hu 11). Both are tracked by the todo
   updated in Task 3, which remains pending.

Then append one STATE.md row using the prepared-index recipe in commit_safety. Row shape, matching
the existing table at EOF:
`| 2026-09-03 | fast | Removed \`Browser\` from the i18n do-not-translate glossary (it was silently rejecting 185 of 242 outstanding translations via machineFillGamelib's case-insensitive apply / case-sensitive enforce asymmetry); committed 48 locales' machine-filled \`gamelib.json\` + MT sidecars; corrected the owning todo's numbers. | ✅ |`

Commit the SUMMARY and STATE.md together. `.planning/ROADMAP.md` must NOT be in this commit — the
concurrent session owns its uncommitted changes.
  </action>
  <verify>
    <automated>
git show --name-only --format= HEAD | sort > /tmp/itr-c4.txt
grep -q '^\.planning/STATE\.md$' /tmp/itr-c4.txt || { echo "FAIL: STATE.md not committed"; exit 1; }
grep -q 'SUMMARY\.md$' /tmp/itr-c4.txt || { echo "FAIL: SUMMARY not committed"; exit 1; }
grep -q '^\.planning/ROADMAP\.md$' /tmp/itr-c4.txt && { echo "FAIL: ROADMAP absorbed from the other session"; exit 1; }
# STATE.md gained EXACTLY our one row and lost nothing
git show HEAD~1:.planning/STATE.md > /tmp/itr-prev.txt
git show HEAD:.planning/STATE.md   > /tmp/itr-now.txt
diff /tmp/itr-prev.txt /tmp/itr-now.txt | grep -c '^<' | grep -qx 0 || { echo "FAIL: STATE.md lost lines"; exit 1; }
[ "$(diff /tmp/itr-prev.txt /tmp/itr-now.txt | grep -c '^>')" -eq 1 ] || { echo "FAIL: STATE.md gained != 1 line"; exit 1; }
git show HEAD:.planning/STATE.md | tail -1 | grep -q '2026-09-03 | fast' || { echo "FAIL: row not at EOF"; exit 1; }
S=.planning/quick/260903-itr-remove-browser-from-the-i18n-glossary-an/260903-itr-SUMMARY.md
diff <(git show HEAD:"$S") "$S"
git show HEAD:"$S" | grep -q 'containsTermLoose' || { echo "FAIL: deferred follow-up not recorded"; exit 1; }
    </automated>
  </verify>
  <done>SUMMARY records the three commits, the measured counts with any delta flagged, the gate baselines, and both follow-ups incl. the deferred `containsTermLoose` fix; STATE.md gained exactly one row at EOF and lost no line; `.planning/ROADMAP.md` is absent from the commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| glossary JSON -> hardcodedStringGate | A term removal widens a blocking gate's flag surface |
| glossary JSON -> machineFillGamelib | A term removal relaxes translation validation for all locales |
| working tree -> commit | A concurrent session's uncommitted work can be absorbed into our commits |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-itr-01 | Tampering | `.planning/STATE.md` / `ROADMAP.md` | mitigate | Prepared-index commit built from `git show HEAD:`; Task 4 gate asserts exactly +1 line, -0 lines, and ROADMAP absent |
| T-itr-02 | Elevation | `meta/hardcodedStringGate.ts` | mitigate | Removing `Browser` un-exempts `InstallModal/index.tsx:247`, in gate scope. Task 1 runs the suite and prescribes a scoped exemption marker, never re-adding the term |
| T-itr-03 | Information disclosure | 48 committed locale catalogs | mitigate | Task 2 gate asserts placeholder parity vs the English source from `git show HEAD:` and runs `gamelibCatalogParity`, so no locale ships an interpolation the source does not define |
| T-itr-04 | Repudiation | commit scope | mitigate | Every commit gated on `git show --name-only` equalling an exact expected set; `git add -A`/`.` and `gsd-sdk query commit` banned |
| T-itr-05 | Denial of service | Anthropic API spend | mitigate | `pnpm machine-fill-gamelib` explicitly banned; `ANTHROPIC_API_KEY` neither read nor set |
| T-itr-SC | Tampering | package installs | accept | No package-manager install in this plan |
</threat_model>

<verification>
- `git log --oneline -4` shows four commits, in order: glossary, locales, todo, closure.
- No commit mixes `meta/`, `public/locales/` and `.planning/` scopes.
- `git status --porcelain` afterwards shows only the concurrent session's `.planning/ROADMAP.md` /
  `.planning/STATE.md` residue and the untracked `.planning/phases/40-...` dir — nothing of ours.
- `pnpm jest meta/__tests__/i18nGlossary.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/gamelibCatalogParity.test.ts` green.
- `pnpm lint-translations:gamelib` green.
</verification>

<success_criteria>
- `git show HEAD:meta/i18nGlossary.json` has 27 sorted, unique terms; `Browser` absent; rationale
  retains `D-02` and `D-21` and dates the 2026-09-03 removal with its cause.
- 96 locale paths committed alone; `public/locales/en/gamelib.json` untouched and absent from it.
- 48 non-en locales verify with 0 interpolation-placeholder mismatches against the English source.
- The owning todo is still `status: pending`, numerically correct for 2026-09-03, with its
  `**Sole owner:**` line byte-identical and unique.
- The `containsTermLoose` case-sensitivity fix is recorded as a deferred follow-up, not performed.
- `meta/machineFillGamelib.ts`, `public/locales/en/gamelib.json` and `.planning/ROADMAP.md` are
  unmodified by every commit in this plan.
</success_criteria>

<output>
Create `.planning/quick/260903-itr-remove-browser-from-the-i18n-glossary-an/260903-itr-SUMMARY.md` when done.
</output>
</content>
</invoke>
