---
phase: quick-260922-iyj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/languages.ts
  - src/backend/sidecar/bootstrap.ts
  - src/frontend/index.tsx
  - src/frontend/components/UI/LanguageSelector/index.tsx
  - .planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md
  - .planning/todos/completed/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md
autonomous: true
requirements:
  - TODO-2026-09-21-43-language-list-four-places
must_haves:
  truths:
    - "Exactly one 43-code language list literal exists under src/ (src/common/languages.ts)"
    - "src/frontend/index.tsx's i18next init reads supportedLngs from the shared constant"
    - "Adding or removing a key in languageLabels or languageFlags without matching the shared constant fails `pnpm codecheck`"
    - "Both failing directions of that compiler gate are demonstrated, not asserted"
    - "The language dropdown renders in exactly the same order as before (hu before hr)"
    - "The todo is in completed/ and states which half was closed by which task"
  artifacts:
    - path: "src/common/languages.ts"
      provides: "`supportedLanguages as const` + `SupportedLanguage` union type"
      contains: "as const"
    - path: "src/frontend/index.tsx"
      provides: "i18next init consuming the shared constant"
      contains: "from 'common/languages'"
    - path: "src/frontend/components/UI/LanguageSelector/index.tsx"
      provides: "label/flag maps typed as Record<SupportedLanguage, string>"
      contains: "Record<SupportedLanguage, string>"
    - path: ".planning/todos/completed/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md"
      provides: "honest close-out naming 260922-hjb as the closer of weakness 2"
  key_links:
    - from: "src/frontend/index.tsx"
      to: "src/common/languages.ts"
      via: "import { supportedLanguages } from 'common/languages'"
      pattern: "from 'common/languages'"
    - from: "src/frontend/components/UI/LanguageSelector/index.tsx"
      to: "src/common/languages.ts"
      via: "import type { SupportedLanguage }"
      pattern: "SupportedLanguage"
    - from: "src/backend/sidecar/bootstrap.ts"
      to: "src/common/languages.ts"
      via: "existing import at :41, consumed at :1005"
      pattern: "supportedLngs: supportedLanguages"
---

<objective>
Collapse the duplicated 43-language literals onto `src/common/languages.ts`'s
`supportedLanguages`, and make the one remaining duplication — the `LanguageSelector`
label/flag maps — compiler-enforced instead of hand-maintained.

Purpose: four hand-maintained copies of the same 43 codes, all agreeing today, with
nothing that would notice when they stop agreeing. A missing `languageFlags` entry
renders `undefined` into the option label under `FlagPosition.PREPEND`.

Output: one list literal under `src/`, one derived union type, and two maps whose key
sets `tsc` proves equal to it in both directions.

Actions `.planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md

Working directly on `main` (`workflow.use_worktrees=false`).

<scope_already_shipped>
**The todo's "Suggested fix" step 2 is ALREADY DONE. Do not plan or build it again.**

Commit `03e196fdb` (quick task 260922-hjb, same day the todo was filed) added
`meta/__tests__/pruneUnofferedLocales.test.ts`, which already carries:

- the named exclusion ledger `UNREACHABLE_CODES = ['br','da','ka','sl','th','uz']`,
  hand-written on purpose with a comment saying why;
- a live pin asserting `computeUnofferedLocaleDirs(public/locales, supportedLanguages)`
  equals exactly that ledger;
- the reverse direction — every offered code has a directory under `public/locales`.

That closes the todo's weakness 2. **Do not add a second copy of that ledger anywhere.**
A duplicated ledger is precisely the trap this task exists to remove. The sibling todo
`2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` is already in
`completed/`.

Remaining work: weakness 1 (the frontend's own copy) plus the labels/flags half.
</scope_already_shipped>

<measured_state>
Measured 2026-09-22 against `cdc69c1ca`. Re-check any line number before you edit it —
these were true at planning time.

| location | what | count |
|---|---|---|
| `src/common/languages.ts:1` | `supportedLanguages`, plain `string[]` (no `as const` today) | 43 |
| `src/frontend/index.tsx:164-208` | inline `supportedLngs:` array inside the i18next `.init({...})` | 43 |
| `LanguageSelector/index.tsx:24-68` | `languageLabels: { [key: string]: string }` | 43 keys |
| `LanguageSelector/index.tsx:70-114` | `languageFlags: { [key: string]: string }` | 43 keys |

All four agree exactly today. This is a latent trap, not a live defect.

Consumers of the shared constant — the complete set:

- `src/backend/sidecar/bootstrap.ts:41` (import) → `:1005` `supportedLngs: supportedLanguages`
- `meta/pruneUnofferedLocales.ts:68` (import) → `:196` `offered: readonly string[] = supportedLanguages`
- `meta/__tests__/pruneUnofferedLocales.test.ts:31` (import) → `for..of`, spread, `.filter`, `.slice`, and passed as `readonly string[]`
- `meta/__tests__/viteRendererConfig.test.ts:140` — a comment only, no code reference

Every one of those uses is already `readonly`-safe. `as const` is expected to need **no**
downstream edits; `pnpm codecheck` is the gate that proves it.

**Path alias resolves — verified, do not re-litigate.** `tsconfig.json` sets
`baseUrl: "./src/"` for the whole repo (one tsconfig, `include: ["src"]`), and
`vite.config.ts:69` aliases `['backend','frontend','common']` to `src/<name>`. The frontend
already imports `common/types` in dozens of files. `import ... from 'common/languages'`
resolves from `src/frontend/index.tsx`.

**`pnpm codecheck` has no `noUncheckedIndexedAccess`.** So `languageLabels[lang]` is
`string` both before (index signature) and after (`Record`). No new `undefined` handling.
</measured_state>

<baselines>
Gate baselines measured 2026-09-22 at `cdc69c1ca`. All GREEN. If any of these is red
before you touch a file, stop and report — do not attribute a pre-existing red to this task.

| gate | command | result at HEAD |
|---|---|---|
| typecheck | `pnpm codecheck` | exit 0, no output |
| lint | `pnpm lint` | exit 0 — `production: PASS \| tests: PASS` |
| lint counts | (from the same run) | src **1119** warnings (ceiling 1124, 5 headroom) · tests **638** (ceiling 638, **ZERO headroom**) |
| prettier | `pnpm prettier` | exit 0, "All matched files use Prettier code style!" |
| meta tests | `pnpm exec jest --selectProjects Meta --testPathPattern "pruneUnofferedLocales\|viteRendererConfig"` | exit 0, 2 suites, 49 tests |
| frontend consumer | `pnpm exec jest --selectProjects Frontend --testPathPattern "loginInFlightUiReachability"` | exit 0, 1 suite, 7 tests |

**The tests lint ceiling has ZERO headroom (638/638).** This is a hard constraint, and it
independently corroborates the decision to use the type system rather than a new test:
a new test file that trips even one warning turns `pnpm lint` red.

**Do not touch `SRC_CEILING` / `TESTS_CEILING` in `meta/lintScoped.cjs`.** The 1119-vs-1124
src gap is pre-existing drift, not this task's business. If your change moves the src count,
report the new number and stop rather than editing the ceiling.
</baselines>

<jest_invocation_trap>
`jest.config.js` uses `projects`, and the project names are **capitalised**:
`Backend`, `Common`, `Frontend`, `Preload`, `Meta`.

`--selectProjects meta` (lowercase) fails with *"You provided values for --selectProjects
but no projects were found matching the selection"* and exits **1** — which reads exactly
like a test failure. Use `--selectProjects Meta`.
</jest_invocation_trap>

<census_grep>
The census command for "how many 43-code list literals remain under `src/`", proven at HEAD:

```
grep -rnE "^[[:space:]]*'[a-z]{2}(_[A-Za-z]{2,4})?',?$" src --include="*.ts" --include="*.tsx" \
  | cut -d: -f1 | sort | uniq -c | sort -rn | awk '$1 >= 40 {print}'
```

At HEAD this prints exactly two lines — `43 src/frontend/index.tsx` and
`43 src/common/languages.ts`. The regex matches only lines that are *nothing but* a quoted
code, so `//`- and `*`-prefixed comment lines cannot inflate it. The `_[A-Za-z]{2,4}` tail
covers `nb_NO`, `pt_BR`, `zh_Hans`, `zh_Hant`.

**Do not substitute a naive sentinel grep.** `grep -rn "'zh_Hant'" src` returns **three**
hits at HEAD, not two: `src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts:124`
carries a deliberate, unrelated **15**-item `FILLED_LOCALES` list that happens to include
`zh_Hant`. The `>= 40` threshold is what keeps that out (next-highest file is 15).
</census_grep>

<interfaces>
Current, from `src/common/languages.ts`:

```typescript
export const supportedLanguages = [ /* 43 codes, 'ar' .. 'zh_Hant' */ ]
```

Target:

```typescript
export const supportedLanguages = [ /* same 43 codes, same order */ ] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]
```

`i18next@22.5.1` declares (`node_modules/i18next/index.d.ts:344`):

```typescript
supportedLngs?: false | readonly string[];
```

**Already `readonly`.** See Task 2 for what this means for the spread.

`LanguageSelector/index.tsx:137` today:

```typescript
const renderOption = (lang: string) => { ... }
```
rendered from `:175` as `{Object.keys(languageLabels).map((lang) => renderOption(lang))}`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make supportedLanguages a const-asserted union source</name>
  <files>src/common/languages.ts</files>
  <action>
Per locked decision D-01. Append `as const` to the `supportedLanguages` array literal and
add `export type SupportedLanguage = (typeof supportedLanguages)[number]` directly below it.
Do not reorder, add, or remove a single code — the 43 codes and their order stay byte-identical.

Add a header comment above the array recording that **`as const` is load-bearing, not
stylistic**: without it, `(typeof supportedLanguages)[number]` widens to `string`,
`Record<SupportedLanguage, string>` in `LanguageSelector` degrades into a plain index
signature, and the compiler gate this task installs silently stops catching a missing or
extra language key. Name `src/frontend/components/UI/LanguageSelector/index.tsx` as the
consumer that depends on the narrowness. State plainly that nothing enforces this — it is
discipline, in the same register as this repo's other unenforceable invariants. Do not
claim a gate exists.

Do NOT add a type-level assertion variable to guard the narrowness. An unused binding costs
`@typescript-eslint/no-unused-vars` warnings against an src ceiling with 5 headroom, and the
failing-direction exercise in Task 3 already proves narrowness empirically — if
`SupportedLanguage` were `string`, deleting a map key would not be a type error.

Expect zero downstream edits (every consumer is already `readonly`-safe — see
`<measured_state>`). If `pnpm codecheck` disagrees, fix the *consumer* with
`[...supportedLanguages]` at that call site and record which one and why; do not weaken
`as const`.
  </action>
  <verify>
    <automated>
# All must be run WITHOUT piping to head/tail -- that masks the exit code, and this
# repo has drawn three wrong conclusions from exactly that habit.
pnpm codecheck; echo "codecheck exit=$?"     # expect exit=0, no diagnostics
pnpm exec jest --selectProjects Meta --testPathPattern "pruneUnofferedLocales|viteRendererConfig"; echo "meta exit=$?"
# expect exit=0, "Test Suites: 2 passed", "Tests: 49 passed"
grep -c "as const" src/common/languages.ts   # expect 1
    </automated>
  </verify>
  <done>
`supportedLanguages` is `as const`; `SupportedLanguage` is exported; the 43 codes and their
order are unchanged (`git diff` shows no line touched inside the array body); `pnpm codecheck`
exits 0; the two Meta suites still report 49 passing tests. Actual pasted output for each.
  </done>
</task>

<task type="auto">
  <name>Task 2: Point the renderer's i18next init at the shared constant</name>
  <files>src/frontend/index.tsx, src/backend/sidecar/bootstrap.ts</files>
  <action>
**2a — `src/frontend/index.tsx` (the main deliverable, per locked decision D-02).**
Add `import { supportedLanguages } from 'common/languages'` to the import block
(alongside the existing `common/`-alias convention used throughout the frontend — the
alias is verified to resolve, see `<measured_state>`; place it with the other non-relative
imports, and leave the two load-order-critical leading imports at lines 6 and 19 exactly
where they are — both carry comments explaining why they must be first).

Replace the entire inline `supportedLngs: [...44 lines...]` block at `:164-208` with
`supportedLngs: supportedLanguages`.

**Pass the constant directly — no spread.** D-01 and D-02 anticipated needing
`[...supportedLanguages]` and explicitly instructed checking the use site before assuming.
Checked: `i18next@22.5.1` types `supportedLngs` as `false | readonly string[]`
(`node_modules/i18next/index.d.ts:344`), and the sibling site `bootstrap.ts:1005` already
passes the bare constant. A spread here would be a defensive copy whose stated reason does
not exist — a trap for the next reader, and the shape this repo deletes on sight. If
`pnpm codecheck` reports an assignability error, then and only then use
`[...supportedLanguages]` and record the verbatim error text as the justification.

**2b — `src/backend/sidecar/bootstrap.ts:1006-1010` (per locked decision D-04).**
Rewrite that comment to say what is true now, keeping the provenance paragraph rather than
deleting it. It currently reads: *"Plan 34.6-19 (REQ-34.6-05, T-34.6-51): fork strings live
in their own `gamelib` namespace ... Both i18next init sites (this one and main.ts's
Electron leg) must change together -- a one-sided change is a build divergence."*

Three things measured about that comment, all of which the rewrite must respect:

1. **Keep** the `gamelib`/`translation` provenance and the Plan 34.6-19 / REQ-34.6-05 /
   T-34.6-51 identifiers. That is the paragraph's real value.
2. **The `main.ts` Electron leg no longer exists** — `src/backend/main.ts` is absent
   (Rust/Tauri rearchitecture). Name the live sibling instead: `src/frontend/index.tsx`.
3. **Say the language half is closed, and do NOT claim the `ns` half is.** After 2a both
   init sites read `supportedLanguages` from `common/languages`, so the *language list*
   divergence is structurally gone. The `ns` list is a different matter and is genuinely
   **not** mirrored in the renderer: `src/frontend/index.tsx`'s `.init({...})` sets no `ns`
   and no `defaultNS` at all. That is correct, not a gap — the renderer loads the namespace
   lazily via `useTranslation('gamelib')` (react-i18next calls `loadNamespaces`), used at
   `src/frontend/App.tsx:189` and ~30 further sites. Write that as the reason the `ns`
   array does not need mirroring, so the next reader does not "fix" the asymmetry by
   copying `ns` into the renderer.

Writing "both init sites must change together" about `ns` would be false. Writing "the
divergence hazard is gone" unqualified would be false. Be specific about which half.
  </action>
  <verify>
    <automated>
pnpm codecheck; echo "codecheck exit=$?"     # expect exit=0

# Exactly ONE 43-code list literal left under src/ -- expect a single line reading
# "  43 src/common/languages.ts". See <census_grep> for why a 'zh_Hant' sentinel grep
# is NOT a substitute (it returns 3 at HEAD, one of them a deliberate 15-item list).
grep -rnE "^[[:space:]]*'[a-z]{2}(_[A-Za-z]{2,4})?',?$" src --include="*.ts" --include="*.tsx" \
  | cut -d: -f1 | sort | uniq -c | sort -rn | awk '$1 >= 40 {print}'

# The import landed, and the dead reference is gone
grep -n "from 'common/languages'" src/frontend/index.tsx        # expect 1 hit
grep -n "supportedLngs" src/frontend/index.tsx                   # expect 1 hit, no array
grep -c "main.ts" src/backend/sidecar/bootstrap.ts               # expect 0

pnpm exec jest --selectProjects Frontend --testPathPattern "loginInFlightUiReachability"; echo "frontend exit=$?"
# expect exit=0, "Tests: 7 passed"
    </automated>
  </verify>
  <done>
The census prints exactly one line (`43 src/common/languages.ts`). `src/frontend/index.tsx`
imports the constant and its init block is 43 lines shorter. The bootstrap comment names
`src/frontend/index.tsx`, no longer names `main.ts`, states the language half is closed, and
does not claim the `ns` half is. `pnpm codecheck` exits 0 and the Frontend consumer suite
still passes 7/7. Actual pasted output for each.
  </done>
</task>

<task type="auto">
  <name>Task 3: Make the label/flag maps compiler-enforced, exercise both failing directions, close the todo</name>
  <files>src/frontend/components/UI/LanguageSelector/index.tsx, .planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md</files>
  <action>
**3a — `Record` typing (per locked decision D-03).**
Import `SupportedLanguage` as a type-only import from `common/languages` and change BOTH
map annotations from `{ [key: string]: string }` to `Record<SupportedLanguage, string>`.
Leave all 86 entries and their order untouched.

The compiler is the gate here, chosen deliberately over a new unit test: `Record` catches a
missing key AND an extra key at typecheck time, which is strictly stronger than a
set-equality test, adds nothing to the test-count ceiling, and — see `<baselines>` — the
tests lint ceiling is at 638/638 with zero headroom. **Do not add a test that re-asserts
what the type already proves.**

**Keep the render source as `Object.keys(languageLabels)`.** Do not switch it to
`supportedLanguages`: `languages.ts` orders `hr` before `hu` while the maps order `hu`
before `hr`, so switching would silently reorder two entries in the visible dropdown — an
unrequested UI change.

`renderOption` at `:137` currently takes `lang: string` and indexes both maps with it, which
will not typecheck against a `Record` keyed by a union. Narrow it:

- change the signature to `(lang: SupportedLanguage)`;
- at the call site `:175`, assert the key list: `(Object.keys(languageLabels) as SupportedLanguage[]).map((lang) => renderOption(lang))`.

That single assertion is the correct resolution and is **sound**: `Object.keys` is typed
`string[]` by TypeScript design regardless of the object's key type, and the
`Record<SupportedLanguage, string>` annotation is what proves the literal carries exactly
those keys at runtime. It is not `any`, not a non-null `!`, and it does not widen the
`Record` back to an index signature — all three of which are forbidden by D-03 because each
would defeat the gate. Add a one-line comment saying why the assertion is there, so it is
not mistaken for a papered-over error.

`handleChangeLanguage(newLanguage: string)`, `currentLanguage`, and the `SelectField`
`onChange` value all stay `string` — they do not index the maps and need no change.

**3b — Exercise BOTH failing directions. Required, not optional.**
D-03's claim is that `Record` catches a missing key *and* an extra key. A gate whose failing
direction is never exercised proves nothing, and an assertion only in one direction cannot
see the other. Run both, capture verbatim `tsc` output, restore, and re-prove green:

1. **Missing key:** delete `zh_Hant: '正體字'` from `languageLabels`. `pnpm codecheck` must
   be RED with a *"Property 'zh_Hant' is missing"*-class error naming the `Record`. Restore.
2. **Extra key:** add `xx: 'Nonesuch'` to `languageFlags`. `pnpm codecheck` must be RED with
   an *"Object literal may only specify known properties"*-class error. Restore.
3. `pnpm codecheck` green again, and `git diff` for `LanguageSelector/index.tsx` must show
   only the intended annotation/narrowing changes — no residue from either experiment.

Direction 1 doubles as the proof that Task 1's `as const` is load-bearing: if
`SupportedLanguage` had widened to `string`, deleting a key would not error at all. Say so
when you report it.

**3c — Close the todo.**
Move `.planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md`
to `.planning/todos/completed/`.

`git mv` trap — this repo has been bitten 3×: `git mv` stages HEAD content, so editing the
file before the move drops your edits. Sequence: `git mv` FIRST, then edit the file at its
NEW path, then `git add` it, then prove the staged blob actually carries your text with
`git show :.planning/todos/completed/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md | grep -c 260922-hjb` (expect ≥ 1) BEFORE committing.

Record honestly in the moved file, appended as a `## Resolution (quick-260922-iyj)` section
— do not rewrite the original Observed/Measured body:

- **Weakness 2 was closed by quick task 260922-hjb, not by this task.** Name commit
  `03e196fdb` and `meta/__tests__/pruneUnofferedLocales.test.ts`, which already carries the
  `UNREACHABLE_CODES` ledger and pins it live in both directions. State that this task
  deliberately added no second copy of that ledger.
- **Weakness 1 is closed by this task:** `src/frontend/index.tsx` now imports
  `supportedLanguages`; the census under `src/` went from two 43-code list literals to one.
- **The labels/flags half is enforced by the type system, not by a test** — and why:
  `Record<SupportedLanguage, string>` catches a missing key and an extra key at compile time
  (both directions demonstrated, quote the two `tsc` errors), which is strictly stronger
  than a set-equality test; and the tests lint scope is at 638/638 with zero headroom, so a
  new test file is a live risk of turning `pnpm lint` red. Record that the enforcement
  depends on `as const` staying on `supportedLanguages`, and that nothing gates *that* —
  only the comment in `languages.ts`.
- **Final shape:** one list literal + two compiler-checked maps, down from four
  hand-maintained literals. The maps are still 86 hand-written label/flag *values* — that
  is by design; only their key sets are now enforced.
- **One incidental correction, recorded not fixed:** `bootstrap.ts`'s divergence comment
  named an `src/backend/main.ts` Electron leg that no longer exists, and its
  "both init sites must change together" line was about the `ns` list, which the renderer
  legitimately does not mirror (it lazy-loads `gamelib` via `useTranslation('gamelib')`).
  The comment was corrected in Task 2. No new todo is warranted — this was a stale comment,
  not a defect.

**3d — Full gate run and commit.**
Run the complete gate set (below), then commit. Conventional prefix
`refactor(quick-260922-iyj): ...` for the code, `docs(quick-260922-iyj): ...` for the todo
move. End every commit message with:
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

If `pnpm lint`'s src warning count moved off 1119, report the new number and the file that
changed — do NOT edit `SRC_CEILING`/`TESTS_CEILING` in `meta/lintScoped.cjs`.
  </action>
  <verify>
    <automated>
# --- the gate, in its passing direction ---
pnpm codecheck; echo "codecheck exit=$?"          # expect 0
pnpm lint; echo "lint exit=$?"                     # expect 0, "production: PASS | tests: PASS"
pnpm prettier; echo "prettier exit=$?"             # expect 0
pnpm exec jest --selectProjects Meta --testPathPattern "pruneUnofferedLocales|viteRendererConfig"; echo "meta exit=$?"
pnpm exec jest --selectProjects Frontend --testPathPattern "loginInFlightUiReachability"; echo "frontend exit=$?"

# --- the gate, in BOTH failing directions (transcripts required in the summary) ---
# 1. remove languageLabels' zh_Hant  -> pnpm codecheck MUST be nonzero, error names the Record
# 2. restore; add languageFlags xx   -> pnpm codecheck MUST be nonzero, "known properties"
# 3. restore; pnpm codecheck exit=0 AND `git diff --stat src/frontend/components/UI/LanguageSelector/index.tsx`
#    shows only the intended change

# --- shape assertions ---
grep -c "Record<SupportedLanguage, string>" src/frontend/components/UI/LanguageSelector/index.tsx  # expect 2
grep -c "\[key: string\]: string" src/frontend/components/UI/LanguageSelector/index.tsx            # expect 0
grep -c "Object.keys(languageLabels)" src/frontend/components/UI/LanguageSelector/index.tsx        # expect 1
grep -rn "any\b" src/frontend/components/UI/LanguageSelector/index.tsx                             # expect no new hits

# --- close-out landed in the STAGED blob, not just the worktree ---
ls .planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md 2>&1  # expect "No such file"
git show :.planning/todos/completed/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md | grep -c 260922-hjb  # expect >= 1
    </automated>
  </verify>
  <done>
Both maps are `Record<SupportedLanguage, string>` with no index signature left; `renderOption`
is narrowed with one commented, justified assertion and no `any`/`!`; the dropdown still
renders from `Object.keys(languageLabels)` (order unchanged, `hu` still before `hr`); both
failing directions of the compiler gate are demonstrated with verbatim `tsc` output and then
restored to green; all six gates exit 0; the todo is in `completed/` with the resolution
section above and its staged blob verified to contain it. Actual pasted output for every
command, including the two RED transcripts.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none newly crossed | Type-level refactor of an in-repo constant. No new input, no new network or filesystem surface, no package installs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iyj-01 | Tampering | `supportedLanguages` as the single source feeding `meta/pruneUnofferedLocales.ts`'s build-time delete | mitigate | Task 1 forbids reordering/adding/removing any code; the prune's own guards (refuse when the offered list is implausibly small, lacks `en`, or would delete `en`) and its 49-test suite run in Tasks 1 and 3 |
| T-iyj-02 | Information disclosure | — | accept | No secrets, credentials, or user data in scope |
| T-iyj-SC | Tampering | npm/pip/cargo installs | n/a | **No package installs.** No `package.json` change; no Package Legitimacy Gate applies |
| T-iyj-03 | Repudiation | The compiler gate silently widening to a vacuous index signature if `as const` is later dropped | accept (documented) | Task 1 records it as an unenforceable invariant in `languages.ts`; Task 3b demonstrates the gate's live failing direction. Honest statement: **nothing gates the `as const` itself** |
</threat_model>

<verification>
Never pipe a build or a gate to `head`/`tail` — that masks the exit code and this repo has
drawn three wrong conclusions from that habit. Capture to a file and `grep` it, or print the
exit code explicitly.

All six gates green, measured against the `<baselines>` table (all were green at
`cdc69c1ca`, so any red here belongs to this task):

1. `pnpm codecheck` → exit 0
2. `pnpm lint` → exit 0, `production: PASS | tests: PASS`, src count reported
3. `pnpm prettier` → exit 0
4. `pnpm exec jest --selectProjects Meta --testPathPattern "pruneUnofferedLocales|viteRendererConfig"` → 49 passed
5. `pnpm exec jest --selectProjects Frontend --testPathPattern "loginInFlightUiReachability"` → 7 passed
6. Census grep prints exactly one line: `43 src/common/languages.ts`

Plus the two RED transcripts from Task 3b, each followed by a restored green.
</verification>

<success_criteria>
- Exactly one 43-code language list literal under `src/` (was two), proven by the census grep in `<census_grep>`, not by a sentinel grep.
- `src/frontend/index.tsx` reads `supportedLngs` from `common/languages`; its inline array is gone.
- `languageLabels` and `languageFlags` are `Record<SupportedLanguage, string>`; no index signature remains in that file.
- The compiler gate is demonstrated RED for a missing key AND for an extra key, with verbatim `tsc` output, and green after restore.
- Dropdown render order is byte-identical to before (`Object.keys(languageLabels)` retained; `hu` before `hr`).
- No new test file, and no change to `SRC_CEILING`/`TESTS_CEILING`.
- `bootstrap.ts`'s comment is true: names `src/frontend/index.tsx`, not the absent `main.ts`; claims the language half closed, not the `ns` half.
- The todo is in `completed/`, its resolution credits 260922-hjb for weakness 2, and the staged blob is verified to contain that text.
</success_criteria>

<output>
Create `.planning/quick/260922-iyj-collapse-43-language-literals/260922-iyj-SUMMARY.md` when done.
</output>
