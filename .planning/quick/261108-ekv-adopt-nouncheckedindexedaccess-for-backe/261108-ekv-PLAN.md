---
phase: quick-261108-ekv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/engine/perGameBottle.ts
  - src/backend/engine/__tests__/defined.ts
  - src/backend/engine/__tests__/engineDecision.test.ts
  - src/backend/engine/__tests__/engineSwitch.test.ts
  - src/backend/engine/__tests__/fallbackEngine.test.ts
  - src/backend/engine/__tests__/gameProcessWatch.test.ts
  - src/backend/engine/__tests__/gameEngineState.test.ts
  - meta/indexedAccessRatchet.cjs
  - meta/__tests__/indexedAccessRatchet.test.ts
  - meta/indexedAccessBaseline.json
  - .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md
autonomous: true
requirements:
  - todo-2026-11-07-nouncheckedindexedaccess-remaining-buckets

must_haves:
  truths:
    - "`node meta/indexedAccessRatchet.cjs` reports no failure for src/backend/engine, and its FAIL lines are exactly the pre-existing set captured before editing (exit 0 if that set was empty)"
    - "Every file under src/backend/engine/ (tests included) type-checks with noUncheckedIndexedAccess on: the bucket is at 0, listed in ADOPTED_BUCKETS, absent from the baseline"
    - "No engine site was fixed with a non-null `!` or a widening cast"
    - "encodeAppName produces byte-identical bottle names for every input (perGameBottle jest suite passes unchanged)"
    - "No test assertion got weaker: a missing element or call makes the test fail loudly, never pass vacuously"
  artifacts:
    - path: "src/backend/engine/__tests__/defined.ts"
      provides: "Local test helper `defined(value, what)` that throws a clear Error on undefined"
      exports: ["defined"]
    - path: "meta/indexedAccessRatchet.cjs"
      provides: "ADOPTED_BUCKETS includes src/backend/engine"
      contains: "'src/backend/engine'"
    - path: "meta/indexedAccessBaseline.json"
      provides: "Baseline without the src/backend/engine key"
  key_links:
    - from: "meta/indexedAccessRatchet.cjs ADOPTED_BUCKETS"
      to: "meta/indexedAccessBaseline.json"
      via: "adopted bucket must be 0 and absent from baseline"
      pattern: "src/backend/engine"
    - from: "src/backend/engine/__tests__/*.test.ts"
      to: "src/backend/engine/__tests__/defined.ts"
      via: "import { defined } from './defined'"
      pattern: "from './defined'"
---

<objective>
Adopt `noUncheckedIndexedAccess` for the `src/backend/engine` bucket (todo
`.planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md`), mirroring
quick 261108-d3t (humble): local `defined()` test helper, ADOPTED_BUCKETS + exact ratchet-test
assertion, baseline key deleted, todo updated.

Output: ONE commit — 2 source sites (perGameBottle.ts) + 43 test sites + adoption + todo.
Engine is the bottle/engine-selection code (CrossOver vs Wine-Staging); valid-input behaviour
must not change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261108-d3t-adopt-nouncheckedindexedaccess-for-backe/261108-d3t-PLAN.md

Load `Skill("gamelib-conventions")` before committing: the `<verify>` prettier rule and the
todo-frontmatter rule both apply.

**The ratchet is ALREADY RED on the working tree at planning time, for buckets other than
engine** (measured 2026-11-08; `pnpm codecheck` is green):

    FAIL: 14 new site(s) in meta: 342 found, baseline is 328
    FAIL: 1 new site(s) in src/backend/scanners: 4 found, baseline is 3
    FAIL: 10 new site(s) in src/backend/sidecar: 165 found, baseline is 155
    FAIL: 4 new site(s) in src/backend/testUtils: 15 found, baseline is 11

That drift is not this task's. Do NOT fix those sites and do NOT raise their baseline numbers.
Before editing anything, snapshot the FAIL lines:
`node meta/indexedAccessRatchet.cjs 2>&1 | grep '^FAIL' | sort > <scratchpad>/ekv-ratchet-pre.txt`
(use the session scratchpad dir). If any pre-existing FAIL line names `src/backend/engine`,
stop and report. The gate after editing is: the post-edit FAIL set equals the pre set exactly
(none mention engine). If the pre set is empty when you run, the gate is a plain exit 0.

**Dirty working tree.** The user has unrelated uncommitted changes (`src/common/types/ipc/*.ts`,
spike logs, `.planning/phases/73-*`, a `.dxvk-cache` file, etc.). Stage ONLY the
`files_modified` paths by name (`git add <path> ...`); never `git add -A` / `git add .` /
`git commit -a`.

**Shared files — read fresh at execution time.** Append `'src/backend/engine'` to whatever
`ADOPTED_BUCKETS` (meta/indexedAccessRatchet.cjs ~line 39) currently holds — at planning time
it is `[steam, gog, legendary, humble, 'src/backend/storeManagers/steam (tests)']`; keep the
existing order and append engine at the end unless the list has a clear grouping convention by
then. Append the same string to the exact `expect(ADOPTED_BUCKETS).toEqual([...])` assertion in
`meta/__tests__/indexedAccessRatchet.test.ts` (~line 42), same position. Delete the
`"src/backend/engine"` key from `meta/indexedAccessBaseline.json` (two-space JSON, no trailing
comma).

Ratchet facts: `node meta/indexedAccessRatchet.cjs --list src/backend/engine` prints the bucket
table then one `path:line:col TSxxxx` per site. Engine is not split into tests/non-tests.
Backend jest `testMatch` is `**/__tests__/**/*.test.ts`, so a non-`.test.ts` helper inside
`src/backend/engine/__tests__/` is not collected as a suite (humble's `__tests__/defined.ts`
relies on the same rule; knip reported nothing for it in d3t).

**Measured sites (45; re-list at execution time):**

Source (2) — `perGameBottle.ts` `encodeAppName`, a `for (let i = 0; i < bytes.length; i++)`
loop over `const bytes = Buffer.from(appName, 'utf8')`:
- :59:36 TS2345 `String.fromCharCode(b)` where `const b = bytes[i]`
- :65:18 TS18048 `b.toString(16)`
(`bytes[i - 1] === 0x2e` / `bytes[i + 1] === 0x2e` are comparisons, not sites — leave them.)

Tests (43):
- engineDecision.test.ts (30): almost all TS2322 at `mkDeps({ probe, ... })` / `probe:` lines
  (132, 146, 158, 174, 189, 198, 209, 218, 228, 240, 352, 363, 374, 387, 576, 589, 604, 618,
  681, 698, 707, 726, 737, 752, 767, 781, 794, 894, 978). Root cause is ONE helper at ~line 35:
  `const seq = (...results: DemoStatusProbe[]) => { let i = 0; return jest.fn(() =>
  Promise.resolve(results[Math.min(i++, results.length - 1)])) }` — its return type became
  `Promise<DemoStatusProbe | undefined>`, which no longer fits `EngineDecisionDeps['probe']`.
  Plus :660:12 TS2532 `expect(opts[1].available).toBe(true)`.
- engineSwitch.test.ts (6): :258/:636/:840 `deps.killWith.mock.calls[0][1]` in `.toBe(...)`;
  :623:39 `expect(resolveOrder).toBeLessThan(deps.killWith.mock.invocationCallOrder[0])`
  (resolveOrder = `deps.ensurePinEngine.mock.invocationCallOrder[0]`); :811 `cxKills[0][2]` in
  `.toEqual({...})`; :815:7 `.toBeGreaterThan((deps.installRemove as jest.Mock).mock.invocationCallOrder[0])`.
- fallbackEngine.test.ts (5): :322/:351/:373/:375/:388 `expect(seen[0].aborted).toBe(true|false)`.
- gameEngineState.test.ts (1): :280 `expect(opts[opts.length - 1].kind).toBe('legacy')`.
- gameProcessWatch.test.ts (1): :97:9 TS2322 at `processListing: listing` — root cause is the
  `make` helper (~line 85): `const next = listings[Math.min(i++, listings.length - 1)]`, then
  `if (next instanceof Error) return Promise.reject(next); return Promise.resolve(next)`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix all 45 engine sites, adopt the bucket, update the todo (one commit)</name>
  <files>src/backend/engine/perGameBottle.ts, src/backend/engine/__tests__/defined.ts, src/backend/engine/__tests__/engineDecision.test.ts, src/backend/engine/__tests__/engineSwitch.test.ts, src/backend/engine/__tests__/fallbackEngine.test.ts, src/backend/engine/__tests__/gameProcessWatch.test.ts, src/backend/engine/__tests__/gameEngineState.test.ts, meta/indexedAccessRatchet.cjs, meta/__tests__/indexedAccessRatchet.test.ts, meta/indexedAccessBaseline.json, .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</files>
  <action>
**0. Pre-flight.** Snapshot the ratchet FAIL lines to the scratchpad as described in context;
re-list engine sites with `node meta/indexedAccessRatchet.cjs --list src/backend/engine`.
Absolute rules for every site: never a non-null `!`, never a widening cast (`as any`,
`as unknown`, `as T` that hides `undefined`), never weaken an assertion. `?.` is allowed only
on a positive matcher whose expected value is not `undefined`; never inside a call argument or
a condition. Pre-existing `!`/casts in these files are not sites — leave them.

**1. Source — perGameBottle.ts `encodeAppName`.** Remove the undefined at its source rather
than invent a value: iterate with `for (const [i, b] of bytes.entries())` (Buffer.entries()
yields `[number, number]`, no `undefined`) and keep the body identical, so `b`, `i`,
`bytes[i - 1]`, `bytes[i + 1]` and the output are byte-for-byte unchanged. If the project's
TS target/lib rejects iterating `entries()` (it should not — codecheck will say), fall back to
keeping the index loop with `const b = bytes[i]; if (b === undefined) continue` (unreachable
inside `i < bytes.length`). Do not touch the docstring or any other function.

**2. Helper.** Create `src/backend/engine/__tests__/defined.ts` — same content as
`src/backend/humble/__tests__/defined.ts` (one generic `defined<T>(value: T | undefined, what:
string): T` that throws `new Error(\`expected ${what} to be defined\`)` on `undefined`, plus its
one-line docstring). Copy, do not import across buckets; keep it out of `src/backend/testUtils`
(separate ratchet bucket). Import it as `import { defined } from './defined'` only in the test
files that use it.

**3. Test sites** (apply by shape; re-check lines):
- engineDecision `seq` helper (fixes ~29 sites in one place): bind the element and pass it
  through `defined`, e.g. `const r = results[Math.min(i++, results.length - 1)]` then
  `return Promise.resolve(defined(r, 'seq() probe result'))`, so a `seq()` call with no results
  throws loudly instead of resolving `undefined`. Do not change the replay semantics (last result
  repeats). Make sure the jest.fn's inferred return type is now `Promise<DemoStatusProbe>`; if a
  `mkDeps` site still errors after this, fix that site individually with `defined`.
- engineDecision :660 `opts[1].available` → `defined(opts[1], 'opts[1]').available`.
- gameProcessWatch `make` helper: `const next = defined(listings[Math.min(i++, listings.length -
  1)], 'listing')` (keep the `instanceof Error` reject branch) so `processListing: listing` types
  as `Promise<string>`.
- engineSwitch `mock.calls[0][1]` (x3) → `defined(deps.killWith.mock.calls[0], 'first killWith
  call')[1]`; `cxKills[0][2]` → `defined(cxKills[0], 'cxKills[0]')[2]`.
- engineSwitch :623 / :815 (invocationCallOrder in an ORDER comparison — MANDATORY `defined`, a
  missing call must fail, and `?.` would pass undefined as a matcher argument): wrap both
  operands' `[0]` reads in `defined(...)` (`resolveOrder` included, since it feeds
  `toBeLessThan`/`toBeGreaterThan`), e.g. `defined(deps.killWith.mock.invocationCallOrder[0],
  'killWith call order')`.
- fallbackEngine `seen[0].aborted` (x5): MANDATORY `defined` where the expected value is
  `false` (`?.` + `toBe(false)` would still fail on undefined, but use `defined` throughout for
  one consistent style): `defined(seen[0], 'seen[0]').aborted`. Each test already asserts
  `expect(seen).toHaveLength(1)` before or nearby — keep those.
- gameEngineState :280 → `defined(opts[opts.length - 1], 'last option').kind` (or `opts.at(-1)`
  wrapped in `defined` — either is fine).
Do not delete, skip or merge any test; test count per suite must stay the same.

**4. Adopt the bucket** per context: append `'src/backend/engine'` to `ADOPTED_BUCKETS` and to
the exact `toEqual([...])` assertion in the ratchet test; delete the `"src/backend/engine"` key
from the baseline JSON. Do not touch any other baseline number.

**5. Todo** (`.planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md`;
stays in pending/; frontmatter byte-identical, `severity:`/`platform:`/`ready:` in that order):
extend the Problem intro sentence with "and for all of `src/backend/engine/`, tests included
(quick 261108-ekv)" in the same style as the existing clauses; remove the `src/backend/engine: 45`
line; set "(N in all)" to the sum of baseline JSON values after the key deletion (the verify
one-liner prints it — expect 1698 - 45 = 1653 if nothing else moved). In the drift Note, drop
`src/backend/engine` from the list of grown buckets (it is now fixed). Leave other text alone.

**6. Commit** (stage only the listed paths by name):
`refactor(quick-261108-ekv): adopt noUncheckedIndexedAccess for backend/engine`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && S=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/468fb1e4-2792-425b-914a-c636112ea41d/scratchpad && node meta/indexedAccessRatchet.cjs 2>&1 | grep '^FAIL' | sort > $S/ekv-ratchet-post.txt; diff $S/ekv-ratchet-pre.txt $S/ekv-ratchet-post.txt && ! grep -q 'src/backend/engine' $S/ekv-ratchet-post.txt && ! node meta/indexedAccessRatchet.cjs --list src/backend/engine | grep -q '^src/backend/engine/' && node -e "const b=require('./meta/indexedAccessBaseline.json');if('src/backend/engine' in b)process.exit(1);console.log(Object.values(b).reduce((a,c)=>a+c,0))" && grep -q "'src/backend/engine'" meta/indexedAccessRatchet.cjs && pnpm codecheck && npx jest src/backend/engine meta/__tests__/indexedAccessRatchet.test.ts && npx eslint src/backend/engine/perGameBottle.ts src/backend/engine/__tests__/defined.ts src/backend/engine/__tests__/engineDecision.test.ts src/backend/engine/__tests__/engineSwitch.test.ts src/backend/engine/__tests__/fallbackEngine.test.ts src/backend/engine/__tests__/gameProcessWatch.test.ts src/backend/engine/__tests__/gameEngineState.test.ts meta/__tests__/indexedAccessRatchet.test.ts && ! git diff HEAD~1 -- src/backend/engine | grep '^+' | grep -v '^+++' | grep -q '[A-Za-z0-9_)\]]!\($\|[.;,)\[ ]\)' && ! git diff HEAD~1 -- src/backend/engine | grep '^+' | grep -v '^+++' | grep -qE '\bas (any|unknown)\b' && pnpm boundaries && pnpm find-deadcode 2>&1 | tee $S/ekv-knip.txt; ! grep -qE 'src/backend/engine/(perGameBottle\.ts|__tests__/(defined|engineDecision\.test|engineSwitch\.test|fallbackEngine\.test|gameProcessWatch\.test|gameEngineState\.test)\.ts)|meta/(indexedAccessRatchet\.cjs|__tests__/indexedAccessRatchet\.test\.ts)' $S/ekv-knip.txt && pnpm planning-gates && npx prettier --file-info src/backend/engine/perGameBottle.ts src/backend/engine/__tests__/defined.ts src/backend/engine/__tests__/engineDecision.test.ts src/backend/engine/__tests__/engineSwitch.test.ts src/backend/engine/__tests__/fallbackEngine.test.ts src/backend/engine/__tests__/gameProcessWatch.test.ts src/backend/engine/__tests__/gameEngineState.test.ts meta/indexedAccessRatchet.cjs meta/__tests__/indexedAccessRatchet.test.ts meta/indexedAccessBaseline.json .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md && npx prettier --check src/backend/engine/perGameBottle.ts src/backend/engine/__tests__/defined.ts src/backend/engine/__tests__/engineDecision.test.ts src/backend/engine/__tests__/engineSwitch.test.ts src/backend/engine/__tests__/fallbackEngine.test.ts src/backend/engine/__tests__/gameProcessWatch.test.ts src/backend/engine/__tests__/gameEngineState.test.ts meta/indexedAccessRatchet.cjs meta/__tests__/indexedAccessRatchet.test.ts meta/indexedAccessBaseline.json .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</automated>
  </verify>
  <done>
Ratchet FAIL set identical to the pre-edit snapshot and none mentions engine; `--list` shows no
engine sites; engine in ADOPTED_BUCKETS and in the ratchet-test assertion, absent from the
baseline; printed baseline sum equals the todo's "(N in all)"; `pnpm codecheck` passes; engine
jest suites (same test count as before) and the ratchet test pass; eslint clean (meta/*.cjs is
eslint-ignored, so not passed); no added non-null `!` and no added `as any`/`as unknown` in the
engine diff (the `HEAD~1` diffs assume the commit exists — use `git diff HEAD` if checking
before committing); `pnpm boundaries` green; `pnpm find-deadcode` may be red from unrelated
phase-65 findings (schemaTypes.ts, stale baseline lines — some mention other engine files):
do not fix those, only confirm no finding names a file this task touched or created;
`pnpm planning-gates` green with the todo still in pending/ and frontmatter intact; prettier
`--file-info` run first, then `--check` on the exact paths (drop and note any path reported
ignored). Only the listed paths are in the commit (`git show --stat HEAD`).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| store appName (remote/catalogue id) -> perGameBottle.ts encodeAppName | Untrusted string becomes an on-disk bottle directory name |
| engine __tests__ | Test integrity: assertions must not pass vacuously |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261108-ekv-01 | Tampering | perGameBottle.ts encodeAppName | mitigate | Iterate `bytes.entries()` so every byte is a defined number; encoding (injective `_xx` escaping, dot-run rule) byte-identical, guarded by the existing perGameBottle suite |
| T-261108-ekv-02 | Repudiation (test integrity) | engine __tests__ | mitigate | `defined()` throws on a missing element/call; `?.` banned in arguments, order comparisons and on matchers `undefined` satisfies |
| T-261108-ekv-03 | Tampering (repo state) | commit staging | mitigate | Stage only listed paths by name; user's unrelated dirty files stay uncommitted |
</threat_model>

<verification>
- Ratchet FAIL set unchanged from the pre-edit snapshot; engine at 0 and adopted.
- `pnpm codecheck`, `npx jest src/backend/engine meta/__tests__/indexedAccessRatchet.test.ts` pass.
- One commit containing only the 11 listed paths.
</verification>

<success_criteria>
- engine bucket at 0, in ADOPTED_BUCKETS and the ratchet-test assertion, key gone from baseline.
- No `!` or widening casts introduced; bottle names unchanged; no assertion weakened.
- Todo updated in place with accurate remaining list and total recomputed from the baseline.
</success_criteria>

<output>
Create `.planning/quick/261108-ekv-adopt-nouncheckedindexedaccess-for-backe/261108-ekv-SUMMARY.md` when done.
</output>
