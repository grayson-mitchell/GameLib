---
phase: quick-260820-i18n-gate-scope-dialog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/genI18nGateScope.test.ts
autonomous: true
requirements: [QUICK-260820-I18NSCOPE]

must_haves:
  truths:
    - "`npx jest genI18nGateScope hardcodedStringGate` exits 0 with 155 total tests, 154 passed, 1 skipped, 0 failed (baseline at HEAD is 153 passed / 1 failed / 1 skipped)."
    - "`meta/i18nForkTouchedFiles.json` lists `src/frontend/components/UI/Dialog/components/Dialog.tsx` and has exactly 181 entries in `files`."
    - "`meta/i18nGateScope.json` is byte-identical to HEAD — the hand-curated scanned set stays at 162 files and its `generatedBy` hand-edited marker survives."
    - "`meta/i18nGateAllowlist.json` is byte-identical to HEAD (repaired at 5b7481b2e, must not be disturbed)."
    - "The A-03 ratchet is still armed: its two non-vacuity specs still prove it goes RED for a file drifting out of scope and for a new unlisted fork-touched file."
    - "No file under `src/` is modified by this plan."
  artifacts:
    - path: "meta/i18nForkTouchedFiles.json"
      provides: "CI-readable fork-touched input to the A-17 / A-03 ratchets, regenerated to 181 entries"
      contains: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
    - path: "meta/__tests__/genI18nGateScope.test.ts"
      provides: "DECLARED_UNSCANNED_DEBT grown 18 -> 19, and the four fixture-sanity 180 pins re-pinned to 181"
      contains: "DECLARED_UNSCANNED_DEBT"
  key_links:
    - from: "meta/i18nForkTouchedFiles.json"
      to: "meta/__tests__/genI18nGateScope.test.ts DECLARED_UNSCANNED_DEBT"
      via: "A-03 RATCHET: forkTouched.files minus i18nGateScope.json files must equal DECLARED_UNSCANNED_DEBT exactly"
      pattern: "unscanned\\.sort\\(\\)"
    - from: "meta/i18nForkTouchedFiles.json"
      to: "live git derivation against upstream baseCommit b5b5cad3fa2e822602d320b70788d87240fc056e"
      via: "A-17 ANTI-ROT equality check"
      pattern: "freshSnapshotFiles\\(\\)"
---

<objective>
Repair the `genI18nGateScope` A-17 anti-rot failure introduced by quick task `260820-kq0`
(commit `1b7fa0eaa`), returning `pnpm test:ci` to green.

Purpose: `1b7fa0eaa` made `src/frontend/components/UI/Dialog/components/Dialog.tsx`
fork-touched (a styling-only change: `border-radius: 10px` on `StyledPaper`, plus a
`Slide` `TransitionComponent` at `transitionDuration={500}`) without updating the i18n
gate's scope bookkeeping. `meta/i18nForkTouchedFiles.json` therefore describes a world
one file out of date, and the A-17 ANTI-ROT spec names the discrepancy.

Output: a regenerated fork-touched artifact (180 -> 181), `Dialog.tsx` declared as
unscanned debt, and the four fixture-sanity count pins moved from 180 to 181.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

Files you will edit:
@meta/__tests__/genI18nGateScope.test.ts

Files you will regenerate but must NOT hand-edit:
@meta/i18nForkTouchedFiles.json

Files that must remain byte-identical to HEAD (do not open for writing):
- `meta/i18nGateScope.json` — hand-curated, 162 files, `generatedBy` records "hand-edited"
- `meta/i18nGateAllowlist.json` — just repaired at `5b7481b2e`
- `meta/genI18nGateScope.ts` — the generator itself is correct; nothing here is a generator bug
- `src/frontend/components/UI/Dialog/components/Dialog.tsx` — the trigger, but not the fix

<verified_baseline>
Measured at HEAD `426046130` before planning, by running the real command:

```
npx jest genI18nGateScope hardcodedStringGate
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 1 skipped, 153 passed, 155 total
```

The single failure is `meta/__tests__/genI18nGateScope.test.ts:376` — the A-17 ANTI-ROT
spec — and its diff names exactly one missing entry:
`src/frontend/components/UI/Dialog/components/Dialog.tsx`. The regeneration delta is
therefore exactly +1. `meta/__tests__/hardcodedStringGate.test.ts` PASSES at HEAD and
contains no `162`/`180` literal; it reads `meta/i18nGateScope.json` (line 1324) for D-18
allowlist purposes only, and this plan does not modify that file, so it stays green.
</verified_baseline>

<mechanism_correction priority="read-before-task-2">
The task brief's locked decision — **declare `Dialog.tsx` as debt, do NOT bring it into
the scanned set** — is correct and is implemented in full by this plan. Its stated
*mechanism* ("add it to `excluded.deferred`") is factually wrong and MUST NOT be followed.
Verified against source:

1. `meta/i18nGateScope.json`'s `excluded.deferred` carries exactly TWO entries, not 19:
   `src/frontend/screens/Login/components/SteamLogin/index.tsx` and
   `src/frontend/screens/WebView/useTauriOAuthLogin.ts`.
2. Those two are the D-17 deferrals, and they are **generated**, not hand-maintained:
   `meta/genI18nGateScope.ts:109` defines `const DEFERRED_FILES: Record<string, string>`
   with exactly those two keys, and `buildScopeSnapshot` emits
   `excluded.deferred = [...Object.keys(DEFERRED_FILES)].sort()` at line 207.
3. `meta/__tests__/genI18nGateScope.test.ts:226` pins
   `scopeSnapshot.excluded.deferred` to exactly `[DEFERRED_OAUTH_LOGIN, DEFERRED_STEAM_LOGIN].sort()`.
   Adding a third entry by hand would turn one red test into two.
4. `excluded.deferred` is not an operand of the A-03 ratchet at all, so editing it would
   not have fixed anything.

The 19-file debt list the brief was thinking of is `DECLARED_UNSCANNED_DEBT`, a
hand-maintained literal array at `meta/__tests__/genI18nGateScope.test.ts:53-72`
(currently 18 entries, lines 54-71). **That** is where the locked decision lands.
</mechanism_correction>

<ratchet_disposition priority="read-before-task-2">
Required finding, since this repo has ledgered lessons about gates filed down until they
guard nothing. Each assertion touched by this plan was read before being scheduled:

| Assertion | Line @HEAD | Kind | Disposition |
|-----------|-----------|------|-------------|
| A0 `scopeSnapshot.files.length` `toBe(162)` | 535 | **Genuine protection** — pins the hand-curated SCANNED set | **UNCHANGED.** The locked decision does not widen the scanned set, so 162 stays 162. This is the assertion that would go red if anyone tried to silently widen the blocking gate, and it stays armed. |
| A0 `forkTouchedSnapshot.files.length` `toBe(180)` | 536 | Fixture-sanity pin (test is literally named "A0 fixture sanity") | Re-pin to 181. |
| A0 `freshSnapshot().files.length` `toBe(180)` | 537 | Fixture-sanity pin; `freshSnapshot()` copies `forkTouchedSnapshot.files`, so this guards the fixture builder, not scope growth | Re-pin to 181. |
| A3 `rewritten.files.length` `toBe(180)` | 599 | Fixture-sanity pin inside a positive control. The load-bearing assertions are `result.wroteScope === scopePath` and `result.refusal === null` (i.e. the writer CAN write) — those are untouched | Re-pin to 181. |
| A4 `.files.length` `toBe(181)` | 617 | Same, on the bootstrap/absent-file path | Re-pin to 181. |
| A2 `refusal.added` vs `DECLARED_UNSCANNED_DEBT` | 580 | **Genuine ratchet** | Stays armed. It is satisfied by declaring the debt (Task 2), not by weakening the comparison. Its `existingCount`/`nextCount` assertions are DERIVED (`scopeSnapshot.files.length`, `forkTouchedSnapshot.files.length`) and self-adjust — no literal edit needed. |
| A-03 RATCHET `unscanned` vs `DECLARED_UNSCANNED_DEBT` | 111 | **Genuine ratchet** | Stays armed. Appending to `DECLARED_UNSCANNED_DEBT` is the ratchet's own sanctioned "declare it as debt" branch — the constant's name and its doc comment ("The DECLARED, measured debt") show it is designed to be appended to. There is no monotonic "may only shrink" clause anywhere in the file. Its two non-vacuity specs (lines 114 and 131) are untouched and still prove it fails by name. |
| A5 provenance ratchet | 621 | Genuine ratchet on the hand-edited marker | **UNCHANGED** — this plan never writes `i18nGateScope.json`. |

**Verdict: the four `180` literals are fixture-sanity pins, not ratchets.** The three
genuine ratchets in this file (A-03, A2, A5) are all either satisfied by the locked
decision or entirely untouched by it.
</ratchet_disposition>

<line_number_warning>
Task 2 inserts one line near the top of `genI18nGateScope.test.ts`, shifting every line
number below it by +1. All line numbers in this plan are stated **as of HEAD**. Anchor
every edit on unique surrounding text, never on a bare line number.
</line_number_warning>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Regenerate the fork-touched artifact and prove the clobber guard held</name>
  <files>meta/i18nForkTouchedFiles.json</files>
  <action>
Run `pnpm gen-i18n-gate-scope`. Do NOT pass `--rewrite-scope`. Do NOT hand-edit the JSON.

A default run is safe by construction — spec A1 ("A1 DEFAULT RUN IS SAFE") proves the
writer leaves `i18nGateScope.json` byte-identical when `rewriteScope` is false — but
prove it happened rather than assuming it:

Immediately after the run, execute `git status --short` and `git diff --stat`. The ONLY
tracked file under `meta/` showing as modified must be `meta/i18nForkTouchedFiles.json`.

STOP CONDITIONS — halt and report instead of proceeding if any holds:
  - `meta/i18nGateScope.json` or `meta/i18nGateAllowlist.json` appears as modified.
  - Any file under `src/` appears as modified.
  - `git diff meta/i18nForkTouchedFiles.json` shows any added or removed `files` entry
    other than the single line `src/frontend/components/UI/Dialog/components/Dialog.tsx`.
    (`generatedAt` will legitimately change; `baseCommit` must remain
    `b5b5cad3fa2e822602d320b70788d87240fc056e`.)

A concurrent quick task `260820-u29` is editing
`src/frontend/screens/Login/components/SteamLogin/index.tsx` and `index.scss` right now.
Those two files will very likely appear as modified in `git status` and are NOT yours —
leave them completely alone, do not stage them, and never run `git stash` or
`git checkout --` in this repo.
  </action>
  <verify>
    <automated>node -e "const j=require('./meta/i18nForkTouchedFiles.json'); const p='src/frontend/components/UI/Dialog/components/Dialog.tsx'; if(j.files.length!==181) throw new Error('expected 181 files, got '+j.files.length); if(!j.files.includes(p)) throw new Error('Dialog.tsx missing'); if(j.baseCommit!=='b5b5cad3fa2e822602d320b70788d87240fc056e') throw new Error('baseCommit drifted: '+j.baseCommit); console.log('OK 181 entries, Dialog.tsx present, baseCommit pinned')"</automated>
    <automated>git diff --name-only -- meta/ | grep -v '^meta/i18nForkTouchedFiles.json$' | grep -q . &amp;&amp; { echo "FAIL: a meta/ file other than i18nForkTouchedFiles.json was modified"; exit 1; } || echo "OK clobber guard held: only i18nForkTouchedFiles.json changed under meta/"</automated>
  </verify>
  <done>`meta/i18nForkTouchedFiles.json` has 181 `files` entries including `Dialog.tsx`, `baseCommit` unchanged, and no other file under `meta/` and no file under `src/` was modified by the generator.</done>
</task>

<task type="auto">
  <name>Task 2: Declare Dialog.tsx as unscanned debt and correct the two stale prose counts</name>
  <files>meta/__tests__/genI18nGateScope.test.ts</files>
  <action>
This task implements the locked decision: `Dialog.tsx` is declared as debt and is NOT
brought into the scanned set. Read `<mechanism_correction>` and `<ratchet_disposition>`
above before editing — in particular, do NOT touch `meta/i18nGateScope.json` or its
`excluded.deferred`.

Edit 1 — grow the debt list. `DECLARED_UNSCANNED_DEBT` begins at line 53 (`const
DECLARED_UNSCANNED_DEBT = [`) and its 18 entries run to line 71. Insert one new entry so
the array stays alphabetically sorted: it goes immediately after
`'src/frontend/components/UI/ActionIcons/index.tsx'` (line 54) and before
`'src/frontend/components/UI/LanguageSelector/index.tsx'` (line 55):

    'src/frontend/components/UI/Dialog/components/Dialog.tsx',

The array becomes 19 entries. This single edit satisfies BOTH the A-03 RATCHET (line 111,
`unscanned.sort()` vs the debt) and A2 (line 580, `refusal.added` vs the debt) — they
share the same operand.

Edit 2 — the prose count at line 346, inside the doc comment above the ratchet, currently
reads:

    * The remaining eighteen are pre-existing debt from 34.11 and earlier.

Leave the historical statement true but record the addition. Replace that sentence with a
form that keeps the 34.13 history intact and names the nineteenth explicitly and why it is
here — for example:

    * The remaining eighteen are pre-existing debt from 34.11 and earlier.
    *
    * quick-260820-i18n-gate-scope-dialog added a NINETEENTH:
    * `components/UI/Dialog/components/Dialog.tsx`, made fork-touched by
    * quick-260820-kq0 (commit 1b7fa0eaa) — a styling-only change (StyledPaper
    * border-radius, a Slide TransitionComponent) that introduced no strings.
    * Declared as debt rather than scanned: its only i18n-relevant string is
    * `aria-label="close"` at Dialog.tsx:123, and scanning it would mean minting
    * a key and editing the markup of a primitive with 25 consumers.

Edit 3 — the prose count at line 390, in the comment above the SKIPPED end-state spec,
currently reads:

    // RED against real HEAD, naming the 18 files listed in

Change `18` to `19`.

Both prose edits are mandatory, not cosmetic. This exact file already carries a ledgered
lesson about a count comment rotting silently — the comment at line 337 records that a
prior comment "named SIX files 'as of 34.11'" while "the real count at 34.13 was TWENTY".
Leaving `eighteen` and `18` behind would recreate that defect.

Do NOT weaken, skip, or delete any assertion. Do NOT touch the non-vacuity specs at lines
114 and 131 — they are what keep the ratchet armed.
  </action>
  <verify>
    <automated>npx jest genI18nGateScope -t "A-03 RATCHET" 2>&amp;1 | tail -12</automated>
    <automated>node -e "const s=require('fs').readFileSync('meta/__tests__/genI18nGateScope.test.ts','utf-8'); const m=s.match(/const DECLARED_UNSCANNED_DEBT = \[([\s\S]*?)\n\]/); if(!m) throw new Error('debt array not found'); const n=(m[1].match(/'src\/frontend/g)||[]).length; if(n!==19) throw new Error('expected 19 debt entries, got '+n); if(!m[1].includes('UI/Dialog/components/Dialog.tsx')) throw new Error('Dialog.tsx not declared'); if(/\beighteen\b/.test(s)&amp;&amp;!/NINETEENTH|nineteenth/.test(s)) throw new Error('stale eighteen prose left uncorrected'); if(/naming the 18 files/.test(s)) throw new Error('stale \"18 files\" prose at line ~390'); console.log('OK 19 declared, prose corrected')"</automated>
    <automated>git diff --name-only -- meta/i18nGateScope.json meta/i18nGateAllowlist.json | grep -q . &amp;&amp; { echo "FAIL: a protected meta artifact was modified"; exit 1; } || echo "OK protected artifacts untouched"</automated>
  </verify>
  <done>`DECLARED_UNSCANNED_DEBT` holds 19 alphabetically-sorted entries including `Dialog.tsx`; the A-03 RATCHET and A2 specs pass; both stale prose counts are corrected; `i18nGateScope.json` and `i18nGateAllowlist.json` are unmodified.</done>
</task>

<task type="auto">
  <name>Task 3: Re-pin the four fixture-sanity 180 literals to 181 and run the real verification</name>
  <files>meta/__tests__/genI18nGateScope.test.ts</files>
  <action>
Per `<ratchet_disposition>`, exactly four assertion literals are fixture-sanity pins on
the fork-touched count and move 180 -> 181. Line numbers are as of HEAD; Task 2 shifted
them by +1, so anchor on the surrounding text.

  - In `A0 fixture sanity` (line 534): `expect(forkTouchedSnapshot.files.length).toBe(180)`
    (line 536) and `expect(freshSnapshot().files.length).toBe(180)` (line 537) -> `181`.
  - In `A3 NON-VACUITY / POSITIVE CONTROL` (line 586):
    `expect(rewritten.files.length).toBe(180)` (line 599) -> `181`.
  - In `A4 BOOTSTRAP` (line 604):
    `expect(JSON.parse(readFileSync(scopePath, 'utf-8')).files.length).toBe(180)`
    (line 617) -> `181`.

CRITICAL: `expect(scopeSnapshot.files.length).toBe(162)` at line 535 must stay `162`. It
pins the hand-curated SCANNED set, and the locked decision deliberately does not widen it.
Changing that number would be the actual scope creep this plan exists to avoid.

Then correct the now-stale prose so it does not rot. The strings `180` appear in test
names and comments as well as assertions; update these to describe the new reality:

  - line 451: `(160 -> 178 at 34.13; 162 -> 180 at 34.15-09, when this phase's own two new`
    — append the new step, e.g. `...; 162 -> 181 at quick-260820-i18n-gate-scope-dialog,
    when Dialog.tsx became fork-touched and was declared as debt rather than scanned)`.
  - lines 505-509: the `freshSnapshot()` doc comment ("the 180 files of the committed
    fork-touched artifact ... the REAL 162 -> 180 delta") -> 181.
  - line 534: the A0 test name "...and the fresh snapshot is the REAL 180" -> `181`.
  - line 563: the A2 test name "...refuses with the real 162 -> 180 diff and writes
    nothing" -> `162 -> 181`. A2's assertions are derived and need no change; only the
    name is stale.

After the edits, run the real verification command and report its real output verbatim:

    npx jest genI18nGateScope hardcodedStringGate

Expected: 2 suites passed, 154 passed / 1 skipped / 0 failed / 155 total (HEAD baseline
was 153 passed / 1 failed / 1 skipped). The 1 skipped is the pre-existing skipped
end-state spec described at line 388 — it was skipped at HEAD too and must stay skipped;
do not un-skip it.

Then confirm nothing else regressed and nothing outside scope was touched:

    npx tsc --noEmit
    git status --short

`git status` must show `meta/i18nForkTouchedFiles.json` and
`meta/__tests__/genI18nGateScope.test.ts` as the only files this plan modified. Files
belonging to the concurrent `260820-u29` task under
`src/frontend/screens/Login/components/SteamLogin/` may also appear — leave them alone.

If any assertion still fails after these edits, STOP and report which one, with its
expected/received values. Do not weaken, skip, or delete it to reach green.
  </action>
  <verify>
    <automated>npx jest genI18nGateScope hardcodedStringGate 2>&amp;1 | tail -10</automated>
    <automated>node -e "const s=require('fs').readFileSync('meta/__tests__/genI18nGateScope.test.ts','utf-8'); if(!/expect\(scopeSnapshot\.files\.length\)\.toBe\(162\)/.test(s)) throw new Error('the 162 scanned-set pin was altered — scope creep'); const stale=(s.match(/\.toBe\(180\)/g)||[]).length; if(stale) throw new Error(stale+' assertion(s) still pin 180'); const pins=(s.match(/\.toBe\(181\)/g)||[]).length; if(pins!==4) throw new Error('expected 4 fixture pins at 181, got '+pins); console.log('OK 162 intact, 4 pins at 181, 0 left at 180')"</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>`npx jest genI18nGateScope hardcodedStringGate` reports 2 suites passed and 154 passed / 1 skipped / 0 failed / 155 total; `npx tsc --noEmit` is clean; the `162` scanned-set pin is intact; no assertion was weakened, skipped or deleted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none introduced) | This plan modifies one generated JSON artifact and one jest spec file. No runtime code path, no network input, no user input, no new dependency crosses any boundary. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QI18N-01 | Tampering | `meta/i18nGateScope.json` (blocking gate input) | mitigate | The gate's scanned set could be silently widened, or its hand-edited provenance marker destroyed, by an accidental `--rewrite-scope`. Task 1 forbids the flag and asserts via `git diff --name-only` that only `i18nForkTouchedFiles.json` changed; Task 3 asserts the `toBe(162)` scanned-set pin still reads 162. |
| T-QI18N-02 | Repudiation | `DECLARED_UNSCANNED_DEBT` | mitigate | Debt added without a recorded reason becomes invisible. Task 2 requires a comment naming `Dialog.tsx`, the originating commit `1b7fa0eaa`, and why it is debt rather than scanned. |
| T-QI18N-03 | Elevation of Privilege | A-03 / A2 ratchets | accept | Growing a declared-debt list is the ratchet's own sanctioned decision branch, not a bypass; the two non-vacuity specs remain untouched and still prove the ratchet fails by name. Rationale recorded in `<ratchet_disposition>`. |
| T-QI18N-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs no packages. No `package.json` dependency change; `pnpm gen-i18n-gate-scope` runs an existing in-repo script. Package Legitimacy Gate does not apply. |
</threat_model>

<verification>
Run the real command and report its real output:

```
npx jest genI18nGateScope hardcodedStringGate
```

- HEAD baseline: `1 failed, 1 skipped, 153 passed, 155 total` (1 suite failed, 1 passed)
- Required after this plan: `1 skipped, 154 passed, 155 total`, 2 suites passed, exit 0

Then:
```
npx tsc --noEmit          # must be clean
git status --short        # only the 2 files in files_modified are this plan's
```

Optional wider confirmation that nothing else regressed, if context allows:
```
pnpm test:ci
```
Compare against the documented suite baseline in `.planning/STATE.md` rather than
expecting an absolute number — a concurrent session (`260820-u29`) is committing to this
tree, so a green count is only meaningful relative to this plan's own base commit.
</verification>

<success_criteria>
- `npx jest genI18nGateScope hardcodedStringGate` exits 0 with 154 passed / 1 skipped / 0 failed / 155 total.
- `meta/i18nForkTouchedFiles.json` has 181 entries including `src/frontend/components/UI/Dialog/components/Dialog.tsx`, with `baseCommit` still `b5b5cad3fa2e822602d320b70788d87240fc056e`.
- `DECLARED_UNSCANNED_DEBT` has 19 entries; the A-03 and A2 ratchets pass by satisfaction, not by weakening.
- `expect(scopeSnapshot.files.length).toBe(162)` is unchanged — the scanned set did not grow.
- `meta/i18nGateScope.json`, `meta/i18nGateAllowlist.json`, `meta/genI18nGateScope.ts` and every file under `src/` are byte-identical to their state at the start of this plan.
- No assertion was weakened, skipped or deleted; the pre-existing skipped spec is still skipped.
- `npx tsc --noEmit` clean.
</success_criteria>

<deferred>
**Follow-up i18n candidate (not in scope for this plan):**
`aria-label="close"` at `src/frontend/components/UI/Dialog/components/Dialog.tsx:123` is
the only i18n-relevant string in the file. Bringing `Dialog.tsx` into the scanned set
would require wrapping it in `t()`, minting a new catalog key, and editing the markup of
a primitive with 25 consumers. It is recorded as declared debt in
`DECLARED_UNSCANNED_DEBT` so it is visible rather than buried, and should be picked up by
whichever phase next reduces the i18n debt list.

Note for that future work: per the ledgered lesson, renaming or introducing a label via
the `t()` DEFAULT argument is a silent no-op when the key already exists — a new key must
be minted.
</deferred>

<output>
Create `.planning/quick/260820-i18n-gate-scope-dialog/SUMMARY.md` when done, recording the
verbatim output of `npx jest genI18nGateScope hardcodedStringGate` before and after.
</output>
