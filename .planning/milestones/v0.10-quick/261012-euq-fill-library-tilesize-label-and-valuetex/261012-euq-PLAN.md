---
phase: quick-261012-euq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - public/locales/*/gamelib.json (48 non-en catalogs; library.tileSize.{label,valueText} appended as the last key of library)
  - public/locales/*/gamelib.mt.json (48 manifests; two keys inserted into the sorted keys[] array)
autonomous: true
requirements: [REQ-41-01, REQ-41-02]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "A user running GameLib in any of the 48 non-English locales sees the Library tile-size slider's <label> and its <output>/aria-valuetext in their own language, with no English fallback for gamelib:library.tileSize.*"
    - "pnpm lint-translations:gamelib exits 0 with 0 hard failures (BEFORE: exit 1, 816 findings, 96 hard failures; AFTER: 720 findings, which are the 15 baseline-recorded keys x 48, left untouched)"
    - "meta/__tests__/lintTranslations.test.ts (REQ-41-02 and REQ-41-01 R13) and meta/__tests__/gamelibCatalogParity.test.ts pass with 0 failed"
    - "A direct key-set diff en vs each of the 48 locales shows no library.tileSize key missing, and both values are non-empty strings in all 49 catalogs; each locale's other en-only keys are exactly the set it had before the fill"
    - "Every one of the 48 gamelib.mt.json manifests lists library.tileSize.label and library.tileSize.valueText at their sorted position, with locale/model/filledAt byte-unchanged"
    - "Exactly the 96 locale files changed, in ONE commit, with the predicted per-file diff shape (catalog 5 1, manifest 2 0 at planning time); meta/i18nCatalogPresenceBaseline.json unchanged; .planning/milestone.lock not committed"
  artifacts:
    - path: "public/locales/<loc>/gamelib.json (x48, loc = ls public/locales minus en)"
      provides: "library.tileSize object with label then valueText, appended after the locale's own current last library key"
      contains: "{{width}}"
    - path: "public/locales/<loc>/gamelib.mt.json (x48)"
      provides: "MT provenance stamp for the two in-session model-authored keys"
      contains: "library.tileSize.valueText"
    - path: ".planning/quick/261012-euq-fill-library-tilesize-label-and-valuetex/261012-euq-SUMMARY.md"
      provides: "48-row values table with source parallels and per-locale confidence; in-session authorship + D-09 disclosure; before/after control captures"
  key_links:
    - from: "src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.tsx"
      to: "public/locales/<loc>/gamelib.json"
      via: "tGamelib('gamelib:library.tileSize.label', 'Tile size') and tGamelib('gamelib:library.tileSize.valueText', '{{width}} px', { width })"
      pattern: "\\{\\{width\\}\\}"
    - from: "meta/lintTranslations.ts missingPairs() / R13"
      to: "meta/i18nCatalogPresenceBaseline.json"
      via: "live (locale,key) missing pairs must equal the committed baseline exactly (totalPairs 720, 15 keys)"
      pattern: "library\\.tileSize"
---

<objective>
Fill `gamelib:library.tileSize.label` ("Tile size") and `gamelib:library.tileSize.valueText` ("{{width}} px") in all 48 non-English `public/locales/<loc>/gamelib.json` catalogs, and stamp both keys into each locale's `gamelib.mt.json` provenance manifest, in ONE commit.

Purpose: fa3f581ce (quick 261011-t4y) added the two keys to `en` only. CI run 38176505164 is red on `lintTranslations` REQ-41-02 (96 hard failures) and R13 (96 unrecorded pairs) — 48 locales x 2 keys. Non-English users currently see the slider in English.

Output: 48 catalogs + 48 manifests changed byte-preservingly; gates green; SUMMARY with per-locale values, source parallels and confidence.

Locked decisions honoured (orchestrator-supplied, numbered LD-1..LD-6 here):
- LD-1 Fill the locales; never regenerate `meta/i18nCatalogPresenceBaseline.json` (its `reason` string: a record of a gap, not permission to grow it).
- LD-2 `pnpm machine-fill-gamelib` is unavailable (hard-coded api.anthropic.com, gateway-scoped key gives HTTP 401). Do not run it, do not modify it to honour ANTHROPIC_BASE_URL, and the `!` prefix is not an escape. The executor authors the 96 strings in-session, deriving from each locale's OWN in-repo parallels before translating from English.
- LD-3 Write programmatically with one Python script; per file detect the (indent, ensure_ascii, trailing-newline) combo that reproduces the bytes exactly; refuse to write ANY file until all 48 catalogs and 48 manifests pass.
- LD-4 Append `tileSize` as the LAST key of each locale's own `library` object (label, then valueText); never re-sort anything else; predict and assert the per-file numstat from each file's actual structure; halt on mismatch; never loosen to ignore deletions.
- LD-5 Add both keys to each `gamelib.mt.json` `keys[]` preserving its order discipline; leave `model` and `filledAt` untouched; SUMMARY discloses in-session model authorship, per-locale confidence, and that D-09 never-overwrite means a future machine-fill will not revisit these.
- LD-6 ONE commit for all 96 files; stage explicit paths only; `.planning/milestone.lock` (untracked) must not be committed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

Load `Skill("gamelib-conventions")` — the `<verify>` prettier rule applies (see Task 2 for how it resolves here).

Planning-time measurements (2026-10-12, HEAD 99e61737c, branch quick-261002-b63) — re-derive live, do not trust blindly:
- `ls public/locales` = 49 dirs; 48 non-en, each with `gamelib.json` and `gamelib.mt.json`; `en` has no `gamelib.mt.json`.
- All 48 catalogs round-trip as indent=4, ensure_ascii=False, trailing newline. All 48 manifests round-trip as indent=2 with trailing newline; their content is pure ASCII so ensure_ascii True and False both reproduce — either is acceptable as long as it reproduces.
- In ALL 48 locales the last key of `library` is `storeOther` and its value is a STRING (not an object). So appending `tileSize` turns the `"storeOther": "..."` line into `"storeOther": "...",` — predicted catalog numstat `5 1` (4 new lines for the tileSize object + the comma'd storeOther line; the 1 deletion is the old storeOther line, equal to the new one modulo a trailing comma). This matches en's own fa3f581ce diff (`6 +-`).
- All 48 manifests: `keys[]` is Python-sorted; both new keys land between `library.storeOther` and `login.amazonReconnect` (mid-array), so predicted manifest numstat `2 0`. If a key ever landed last, the shape would be `3 1` — compute, don't assume.
- BEFORE control (measured): `pnpm lint-translations:gamelib` exits 1 with `lint-translations[gamelib]: 816 findings, 96 hard failures`; 192 output lines mention tileSize (each pair appears as a finding AND a hard failure). The other 720 findings are 15 en keys x 48 locales already recorded in the presence baseline (`totalPairs: 720`) — OUT OF SCOPE, do not fill or touch them. `pnpm exec jest meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts` = 2 failed, 229 passed (REQ-41-02 and R13). NOTE: jest truncates the received array (~10 pairs shown), so count named pairs from the CLI output, never from jest output.
- `lintTranslations` treats an EMPTY value as missing but does not flag a value identical to English, so `{{width}} px` verbatim is legal; placeholder parity and glossary-term survival are what `validateTranslation()` enforces (no glossary term occurs in either source string).
- Pixel-unit and spacing evidence: no locale's `gamelib.json` or `translation.json` contains a pixel-unit rendering (px / pixel / localized equivalents), and all 48 `gamelib.json` contain 0 NBSP (U+00A0) and 0 NNBSP (U+202F). The only placeholder-then-unit sibling is `winetricksBrowse.phaseDownloading` (`{{percent}}%`, glued in every locale, same as en). Therefore valueText = `{{width}} px` (ASCII space) everywhere unless the live re-scan finds otherwise.
- In-repo parallels (en key -> meaning): translation.json `dlc.size` and `wine.size` ("Size" — strongest parallel for the size noun); `accessibility.all_tiles_in_color` ("Show all game tiles in color" — the locale's own tile noun); `library.toggleLayout.grid` ("Toggle to a grid layout"); `tour.library.viewToggle` ("Switch between grid and list view..."); `options.gamescope.gameWidth` ("Game Width"). gamelib.json `library.storeOther` and `library.filterPanel.*` string leaves give the locale's label register and capitalisation in the SAME namespace being written.
- Known parallel hazards seen at planning: `br` and `sl` have NO translation.json; `ml` and `nl` pass several parallels through as English; some locales render "tiles" as a different concept in `all_tiles_in_color` (ca "títols", pl "tytuły", ro "titlurile" = titles; es "juegos" = games; pt_BR "capas" = covers — covers is the same visual object, titles/games are not). `ka` and several others may have empty or EN-passthrough cells.
- `public/locales/` is line 5 of `.prettierignore`; `node_modules/.bin/prettier --file-info` reports `"ignored":true` for all 96 target paths (probed in ~4 s).
- `pnpm i18n-churn-guard` lists changes via `git status` (staged, unstaged and untracked under public/locales) — it is vacuous after the commit, so it must run BEFORE committing.

Shell note: shell state does not persist between Bash calls and the executor's shell is zsh, so every command that references `$SCRATCH` (including the `<automated>` lines) must set it inline first, e.g. `SCRATCH=<session scratchpad path>; ...`. The `${SCRATCH:?}` guard makes an unset value fail loudly instead of writing to `/`.

Consumer: src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.tsx — `label` is the slider's `<label>`; `valueText` is both the visible `<output>` and the range input's `aria-valuetext` (screen readers read it), interpolated with `{ width }` (e.g. "240 px").
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Fill script + BEFORE control + `de` end-to-end (uncommitted) — gate drops 96 to 94</name>
  <files>public/locales/de/gamelib.json, public/locales/de/gamelib.mt.json</files>
  <read_first>
    - public/locales/en/gamelib.json (the `library` object, tileSize source strings)
    - public/locales/de/gamelib.json (`library` object: storeOther, filterPanel labels) and public/locales/de/translation.json (dlc.size, wine.size, accessibility.all_tiles_in_color, library.toggleLayout.grid)
    - public/locales/de/gamelib.mt.json (first 10 lines: field order, indent)
    - src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.tsx (how the two strings render)
  </read_first>
  <action>
Pre-flight state (halt and report on any failure — another session may own the tree): `git rev-parse --abbrev-ref HEAD` is the branch the orchestrator dispatched on (quick-261002-b63 at planning time) and `git merge-base --is-ancestor 99e61737c HEAD` succeeds; `git status --porcelain -- public/locales meta/i18nCatalogPresenceBaseline.json` is empty; `git ls-files public/locales/en/gamelib.json` shows en already carries tileSize (label "Tile size", valueText "{{width}} px").

BEFORE control (LD-1 non-vacuity): with `$SCRATCH` = this executor session's scratchpad directory (never /tmp, never inside the repo), save `pnpm lint-translations:gamelib` stdout+stderr to `$SCRATCH/lint-before.txt` and the jest run of meta/__tests__/lintTranslations.test.ts plus meta/__tests__/gamelibCatalogParity.test.ts to `$SCRATCH/jest-before.txt`. Assert from the CLI capture: exit 1; summary line reads `96 hard failures`; exactly 96 hard-failure lines of the form `<loc>.gamelib.library.tileSize.(label|valueText): a new key is not localised and was not recorded`; their locale set equals live `ls public/locales` minus en (48). Assert jest shows exactly 2 failed (REQ-41-02, R13). Also snapshot, per locale, the set (en keys minus locale keys) over flattened dotted gamelib leaves to `$SCRATCH/enonly-before.json` (expected at planning: the 2 tileSize keys + the same 15 baseline-recorded keys in every locale).

Write ONE Python script `$SCRATCH/fill_tilesize.py` (per LD-3, LD-4, LD-5) with a `VALUES` dict locale -> (label, valueText) and a `--only <loc>` flag (default: all). Behaviour, in order:
1. Locale scope derived live: sorted dirs of public/locales minus en; assert 48, each has both files; assert en has no gamelib.mt.json. Selected locales = `--only` set or all; every selected locale must have a VALUES entry (refuse otherwise).
2. Value validation per selected locale: both strings are str, non-empty, equal to their own strip(); label contains no `{{`; valueText contains `{{width}}` exactly once and no other `{{`; neither contains `<` or `>`; neither contains NBSP/NNBSP unless that locale's own gamelib.json already contains that character (live check).
3. Catalog pre-flight for EVERY one of the 48 catalogs (not only selected): read bytes; try indent in {4, 2, tab} x ensure_ascii in {False, True} x trailing newline in {True, False}; record a combo whose dumps equals the bytes exactly; halt if none. Assert `library` is a dict. If `tileSize` is absent: record the current last library key and predict numstat `5 1` (the last key's final line gains a comma — whether that value is a string, as measured, or an object whose closing brace gains the comma). If `tileSize` is present: it must equal {label, valueText} from VALUES exactly with keys in that order — then it is a verified no-op (no write); any other content halts.
4. Manifest pre-flight for EVERY one of the 48 manifests: detect its combo the same way, separately; assert top-level key order is locale, model, filledAt, keys and that `keys` is sorted (Python default ordering) with no duplicates. If both new keys are absent: insert each with bisect.insort; predict numstat `2 0` if neither lands at the array end, `3 1` if one does. If both are present: verified no-op. Exactly one present halts. Assert locale/model/filledAt are unchanged after the mutation.
5. Only after ALL 48 catalogs and 48 manifests pass pre-flight, write the selected locales' mutated files with each file's own detected combo; a catalog insert appends `tileSize` (label, then valueText) as the last key of `library` via dict insertion order — no re-sorting anywhere. Re-read every written file and assert it parses and re-serialises to its own bytes under the same combo.
6. Post-write shape assertion: for each written path, `git diff HEAD --numstat -- <path>` equals the prediction; for catalogs, parse `git diff HEAD -U0 -- <path>` and assert the single deleted line plus a trailing comma equals one added line, and the other four added lines are exactly the tileSize object. Any mismatch: print it and exit non-zero (do NOT loosen to ignore deletions).
7. Print a per-file table: path, combo, predicted, actual.

Tracer slice — author `de` only. Derive from de's own parallels: size noun from `dlc.size`/`wine.size` ("Größe"), tile noun from `accessibility.all_tiles_in_color` ("Spielkacheln") and `library.toggleLayout.grid` ("Kachelansicht"); expected derivation label "Kachelgröße", valueText "{{width}} px" (confirm against the live files; de gamelib.json has 0 NBSP, so ASCII space). Run `python3 $SCRATCH/fill_tilesize.py --only de`.

Do NOT commit (LD-6: a partial fill is itself presence drift). Do NOT revert de afterwards — Task 2's run treats it as a verified no-op; never use `git checkout --` on these files (it destroys uncommitted work).
  </action>
  <verify>
    <automated>pnpm lint-translations:gamelib > "${SCRATCH:?}/lint-de.txt" 2>&1; grep -E 'hard failures' "$SCRATCH/lint-de.txt" | grep -q ', 94 hard failures' && ! grep -qE '(^| )de\.gamelib\.library\.tileSize' "$SCRATCH/lint-de.txt" && D=$(git diff HEAD --numstat -- public/locales) && test "$(printf '%s\n' "$D" | awk '{print $1" "$2" "$3}' | sort | tr '\n' '|')" = "2 0 public/locales/de/gamelib.mt.json|5 1 public/locales/de/gamelib.json|" && pnpm exec jest meta/__tests__/gamelibCatalogParity.test.ts 2>&1 | grep -qE 'Tests: +[0-9]+ passed' && echo TRACER-OK</automated>
  </verify>
  <acceptance_criteria>
    - `$SCRATCH/lint-before.txt` shows exit 1, `96 hard failures`, 96 named tileSize pairs across exactly the 48 live non-en locales; `$SCRATCH/jest-before.txt` shows 2 failed.
    - After `--only de`: lint summary reads `94 hard failures` (not 96, not 0) and no line names `de.gamelib.`; only the two de files differ from HEAD with shapes `5 1` and `2 0`; gamelibCatalogParity passes.
    - The script printed a pre-flight pass for all 48 catalogs and 48 manifests before writing anything.
  </acceptance_criteria>
  <done>The fill script is proven end-to-end on one locale: format-preserving write, predicted diff shape, manifest stamp, and the gate counting the fill (96 to 94). Nothing committed.</done>
</task>

<task type="auto">
  <name>Task 2: Derive and author the other 47 locales from their own parallels, fill all 48, run the verify battery, ONE commit</name>
  <files>public/locales/*/gamelib.json (47 more non-en), public/locales/*/gamelib.mt.json (47 more non-en)</files>
  <read_first>
    - $SCRATCH/fill_tilesize.py (from Task 1)
    - $SCRATCH/parallels.txt (generated in step 1 below; one block per locale)
  </read_first>
  <action>
1. Parallels table (LD-2: derive before translating). Generate `$SCRATCH/parallels.txt` with one block per locale (all 48, sorted) printing: translation.json `dlc.size`, `wine.size`, `accessibility.all_tiles_in_color`, `library.toggleLayout.grid`, `tour.library.viewToggle`, `options.gamescope.gameWidth` (each marked ABSENT when the file or key is missing, `=EN` when identical to en); gamelib.json `library.storeOther`, every string leaf of `library.filterPanel`, `winetricksBrowse.phaseDownloading`; and counts of U+00A0 and U+202F in that locale's gamelib.json. Re-run a live scan of every locale's gamelib.json and translation.json for any pixel-unit rendering (px, pixel and localized forms) and append hits.

2. Author VALUES for the remaining 47 locales (de is already filled; keep its entry in VALUES so the run verifies it as a no-op). Rules, applied per locale and recorded per locale for the SUMMARY:
   - label = the locale's natural noun phrase for "size of the tiles", built from that locale's OWN size noun (`dlc.size`/`wine.size`) and its own tile noun (`all_tiles_in_color`, else `toggleLayout.grid`/`viewToggle` grid wording) — inflected correctly (genitive/compound/particle as the language requires), in sentence case matching the locale's sibling labels in gamelib `library.*` (e.g. capitalised nouns in de, lowercase after the first word in fr/es/it, no case in CJK).
   - When the tile parallel renders a DIFFERENT concept (titles, games) do not import it; use the language's standard UI word for a grid tile and mark confidence medium. When it renders the same visual object under another name (pt_BR "capas" = covers) using it is acceptable — record the choice. When parallels are ABSENT (br, sl) or EN passthrough (ml, nl in places), translate from English directly and mark confidence low or medium accordingly.
   - valueText = `{{width}} px` with one ASCII space, unless step 1's live scan found that locale's own catalogs showing a pixel-unit word or a non-ASCII space convention — then follow the locale's own evidence and record it. `{{width}}` stays verbatim (never translated, never re-spaced, never wrapped in bidi marks; ar/fa/he keep the same source order as their `{{percent}}%` sibling).
   - Self-consistency pass before any write: print all 48 (label, valueText) pairs side by side with their size noun and tile noun parallels and re-read them; every label must contain that locale's chosen size noun (or its correct inflection) — fix before writing.
   - Assign confidence per locale: high (both nouns from native in-repo parallels), medium (one noun from parallels, or tile concept substituted), low (no usable parallels / minor-coverage locale).

3. Run `python3 $SCRATCH/fill_tilesize.py` over all 48. It must pre-flight all 96 files, report de as verified no-op, write the other 94 files, and pass its own per-file shape assertions. If it halts, fix the cause — never loosen a check.

4. Verify battery BEFORE staging/committing (save each output under $SCRATCH): run the `<verify>` command below; additionally run `pnpm i18n-churn-guard` (exit 0 — must be pre-commit, it reads git status); confirm `git diff HEAD --quiet -- meta/i18nCatalogPresenceBaseline.json` (LD-1: unchanged); confirm the key-set diff against `$SCRATCH/enonly-before.json`: for every locale, after-set equals before-set minus exactly the two tileSize keys.

5. Prettier (gamelib-conventions `<verify>` rule): probe every written path with `node_modules/.bin/prettier --file-info <path>` and match `"ignored":[[:space:]]*true` space-tolerantly. At planning time all 96 are ignored (`public/locales/` is in .prettierignore), so `npx prettier --check` over them would be vacuous and is OMITTED — state that explicitly in the SUMMARY. If any path reports `"ignored": false`, run `npx prettier --check` over exactly those paths instead. The PLAN/SUMMARY files under .planning are likewise prettier-ignored.

6. ONE commit (LD-6). Stage the 96 explicit paths (the 48 non-en `public/locales/<loc>/gamelib.json` and 48 `public/locales/<loc>/gamelib.mt.json`, enumerated from the live locale list — no `git add -A`, no `git add .`, no directory adds). Assert `git diff --cached --name-only` lists exactly those 96 paths and nothing else (in particular not `.planning/milestone.lock`, not any en file, not the baseline). Commit message: `fix(261012-euq): fill gamelib library.tileSize label and valueText in all 48 non-English catalogs`, with a body stating the strings are model-authored in-session (machine-fill-gamelib unavailable under the gateway-scoped key), stamped in each gamelib.mt.json keys[], that D-09 never-overwrite means a future machine-fill will not revisit them, and the gate delta (96 hard failures to 0). Let the pre-commit hook run (no `--no-verify`). Do not push.

7. Post-commit: run the post-commit check in `<verify>` (committed bytes of every catalog and manifest round-trip under their combos via `git show HEAD:<path>`; `git show --numstat --format= HEAD` shows 96 locale paths, 48 x `5 1` and 48 x `2 0` as predicted).

8. SUMMARY (`261012-euq-SUMMARY.md`): a 48-row table — locale | label | valueText | size-noun source | tile-noun source | confidence — plus a list of low-confidence locales flagged for native review; the disclosure that the 96 strings are model-authored in-session, not via machine-fill, stamped in the manifests with the manifests' pre-existing global `model`/`filledAt` left as-is (a known inaccuracy: those fields describe the original fill run); D-09 never-overwrite; BEFORE/AFTER control captures (96/816 to 0/720; jest 2 failed to 0 failed; 94 at the tracer midpoint); the prettier omission statement; and that the 15 baseline-recorded keys (720 findings) were intentionally left out of scope.
  </action>
  <verify>
    <automated>pnpm exec jest meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts 2>&1 | grep -E 'Tests:' | grep -vq failed && pnpm lint-translations:gamelib > "${SCRATCH:?}/lint-after.txt" 2>&1 && grep -q '720 findings, 0 hard failures' "$SCRATCH/lint-after.txt" && ! grep -q 'tileSize' "$SCRATCH/lint-after.txt" && python3 -c "import json,os;b='public/locales';F=lambda d,p='':{x for k,v in d.items() for x in (F(v,p+k+'.') if isinstance(v,dict) else {p+k})};J=lambda l:json.load(open(f'{b}/{l}/gamelib.json',encoding='utf-8'));E=F(J('en'));L=sorted(os.listdir(b));assert len(L)==49 and 'en' in L;miss=[l for l in L if any('tileSize' in k for k in E-F(J(l)))];T={l:J(l)['library'].get('tileSize') for l in L};bad=[l for l in L if not isinstance(T[l],dict) or list(T[l])!=['label','valueText'] or not all(isinstance(T[l][k],str) and T[l][k].strip() for k in T[l]) or T[l]['valueText'].count('{{width}}')!=1 or T[l]['valueText'].count('{{')!=1];last=[l for l in L if list(J(l)['library'])[-1]!='tileSize'];print('missing',miss,'bad',bad,'notlast',last);assert not miss and not bad and not last;print('KEYSET-OK 49')" && D=$(git diff HEAD --numstat -- public/locales) && test "$(printf '%s\n' "$D" | awk '{s[$1" "$2" "($3 ~ /\.mt\.json$/ ? "mt" : "cat")]++; n++} END {for (k in s) print s[k], k; print n, "files"}' | sort | tr '\n' '|')" = "48 2 0 mt|48 5 1 cat|96 files|" && python3 -c "import subprocess as s;d=s.run(['git','diff','HEAD','-U0','--','public/locales'],capture_output=True,text=True,check=True).stdout.splitlines();m=[x[1:] for x in d if x.startswith('-') and not x.startswith('---')];p=[x[1:] for x in d if x.startswith('+') and not x.startswith('+++')];bad=[x for x in m if x+',' not in p];print(len(m),'deleted',len(p),'added',bad);assert len(m)==48 and len(p)==336 and not bad;print('SHAPE-OK')" && pnpm i18n-churn-guard && git diff HEAD --quiet -- meta/i18nCatalogPresenceBaseline.json && F=$(git diff HEAD --name-only -- public/locales) && test -n "$F" && test -z "$(for f in $(printf '%s\n' "$F"); do node_modules/.bin/prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*true' || echo "$f"; done)" && echo "PRE-COMMIT-BATTERY-OK (all 96 written paths prettier-ignored; --check omitted as vacuous)"</automated>
    <automated>N=$(git show --name-only --format= HEAD) && S=$(git show --numstat --format= HEAD -- public/locales) && test "$(printf '%s\n' "$S" | awk '{s[$1" "$2" "($3 ~ /\.mt\.json$/ ? "mt" : "cat")]++; n++} END {for (k in s) print s[k], k; print n, "files"}' | sort | tr '\n' '|')" = "48 2 0 mt|48 5 1 cat|96 files|" && test -z "$(printf '%s\n' "$N" | grep -Ev '^public/locales/[A-Za-z_]+/gamelib(\.mt)?\.json$')" && test -z "$(printf '%s\n' "$N" | grep '^public/locales/en/')" && python3 -c "import json,subprocess as s;P=s.run(['git','show','--name-only','--format=','HEAD'],capture_output=True,text=True,check=True).stdout.split();bad=[]
for p in P:
  raw=s.run(['git','show','HEAD:'+p],capture_output=True,check=True).stdout.decode('utf-8');d=json.loads(raw);ok=any(json.dumps(d,indent=i,ensure_ascii=a)+n==raw for i in (4,2) for a in (False,True) for n in ('\n',''))
  bad+=[] if ok else [p]
print(len(P),'committed',bad);assert len(P)==96 and not bad;print('COMMIT-ROUNDTRIP-OK')"</automated>
  </verify>
  <acceptance_criteria>
    - jest: lintTranslations.test.ts and gamelibCatalogParity.test.ts report 0 failed (was 2 failed, 229 passed).
    - `pnpm lint-translations:gamelib` exits 0 and prints `720 findings, 0 hard failures`; no output line mentions tileSize.
    - KEYSET-OK: all 49 catalogs carry library.tileSize with exactly [label, valueText], non-empty, one `{{width}}`, and tileSize is the last key of library; per-locale en-only sets equal the BEFORE snapshot minus the two keys.
    - Numstat summary pre-commit: `48 5 1 cat`, `48 2 0 mt`, `96 files` (or the script's per-file predicted table, with any deviation explained in the SUMMARY); SHAPE-OK: 48 deleted lines each equal to an added line minus its trailing comma, 336 added lines.
    - `pnpm i18n-churn-guard` exit 0 before commit; presence baseline unchanged; the prettier probe counts 96 of 96 written paths `"ignored": true` (so `--check` is omitted as vacuous, and the SUMMARY says so).
    - Exactly one new commit touching exactly 96 paths, all `public/locales/<loc>/gamelib(.mt).json`, non-en; COMMIT-ROUNDTRIP-OK against `git show HEAD:<path>`; `.planning/milestone.lock` still untracked.
    - SUMMARY carries the 48-row table with per-locale confidence, the low-confidence list, the in-session authorship + D-09 disclosure, before/after captures, and the prettier omission statement.
  </acceptance_criteria>
  <done>All 48 non-English locales render the tile-size slider label and value text in their own language; CI's two red lintTranslations tests are green; one commit holds the 96 files; the SUMMARY discloses provenance and confidence.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| script -> shipped catalogs | A programmatic rewrite of 96 tracked JSON files that ship in two bundle trees (build/locales and build/renderer/locales) |
| model-authored text -> UI and provenance record | In-session strings rendered as a label, visible output and aria-valuetext; provenance must not read as human translation |
| working tree -> commit | A shared tree where other sessions and untracked files (.planning/milestone.lock) exist |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261012-euq-01 | Tampering | fill_tilesize.py rewriting 96 locale files | high | mitigate | Per-file combo detection with exact byte round-trip; refuse all writes until all 96 pre-flight; per-file predicted numstat plus deleted-equals-added-modulo-comma assertion; post-commit `git show HEAD:<path>` round-trip |
| T-261012-euq-02 | Repudiation | gamelib.mt.json provenance | medium | mitigate | Both keys stamped into every manifest keys[]; SUMMARY and commit body state in-session model authorship, per-locale confidence, D-09 never-overwrite, and the stale global model/filledAt caveat |
| T-261012-euq-03 | Information Disclosure | meta/machineFillGamelib.ts endpoint | medium | mitigate | Per LD-2 the script is neither run nor modified to honour ANTHROPIC_BASE_URL; no catalog content leaves the session through a new endpoint |
| T-261012-euq-04 | Tampering | commit staging in a shared tree | medium | mitigate | Pre-flight clean-tree check on public/locales; explicit 96-path staging; `git diff --cached --name-only` must equal exactly those paths; milestone.lock never staged |
| T-261012-euq-05 | Tampering | meta/i18nCatalogPresenceBaseline.json | high | mitigate | Per LD-1 never regenerated; `git diff HEAD --quiet` on it in the verify battery |
| T-261012-euq-06 | Tampering | translated strings in React text / aria-valuetext | low | mitigate | Value validation rejects `<`, `>`, stray `{{`, empty or whitespace-padded strings; `{{width}}` must occur exactly once |
| T-261012-euq-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager install in this plan; only existing repo scripts and the Python standard library are used |
</threat_model>

<verification>
- BEFORE: lint-translations:gamelib exit 1, 816 findings / 96 hard failures; jest 2 failed (captured in $SCRATCH).
- MIDPOINT (tracer, de only, uncommitted): 94 hard failures, no de line.
- AFTER: jest 0 failed; lint-translations:gamelib exit 0, 720 findings / 0 hard failures; KEYSET-OK over 49 catalogs; per-locale en-only sets = before minus the two keys; numstat 48 x `5 1` + 48 x `2 0`; SHAPE-OK; i18n-churn-guard exit 0 pre-commit; baseline unchanged; prettier probe shows all 96 ignored (check omitted, stated); one commit of exactly 96 paths; COMMIT-ROUNDTRIP-OK.
</verification>

<success_criteria>
- All 48 non-English gamelib catalogs carry library.tileSize.label and library.tileSize.valueText, authored from each locale's own in-repo parallels, appended as the last key of `library`, byte-preserving elsewhere.
- All 48 manifests list both keys in sorted position with locale/model/filledAt unchanged.
- The two CI-red lintTranslations tests pass; lint-translations:gamelib reports 0 hard failures; the presence baseline is untouched.
- ONE commit, exactly 96 paths; SUMMARY discloses in-session model authorship, per-locale confidence (low-confidence locales flagged), and D-09.
</success_criteria>

<output>
Create `.planning/quick/261012-euq-fill-library-tilesize-label-and-valuetex/261012-euq-SUMMARY.md` when done
</output>
