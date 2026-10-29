---
phase: quick-261029-pbv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
autonomous: true
requirements: [A-17]

must_haves:
  truths:
    - "genI18nGateScope 'A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation' passes"
    - "steamIncompleteCard.ts is in the blocking hardcoded-string gate scope, and the gate reports zero violations for it"
    - "DECLARED_UNSCANNED_DEBT is unchanged, and no allowlist, ignore-list or glossary entry was added"
  artifacts:
    - path: "meta/i18nForkTouchedFiles.json"
      provides: "Fork-touched set refreshed by `pnpm gen-i18n-gate-scope` (288 files)"
      contains: "GameCard/steamIncompleteCard.ts"
    - path: "meta/i18nGateScope.json"
      provides: "Hand-curated scope, 242 files, generatedBy extended by one 261029-pbv clause"
      contains: "GameCard/steamIncompleteCard.ts"
    - path: "meta/__tests__/genI18nGateScope.test.ts"
      provides: "A0/A2/A3/A4 pins at 242 / 288, plus a dated 261029-pbv history entry"
  key_links:
    - from: "meta/__tests__/genI18nGateScope.test.ts (A2)"
      to: "DECLARED_UNSCANNED_DEBT"
      via: "refusal.added must equal the debt array, so the new file has to be in BOTH artifacts"
      pattern: "refusal.added"
---

<objective>
Turn the red genI18nGateScope `A-17 ANTI-ROT` test green. The committed `meta/i18nForkTouchedFiles.json` is missing
`src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts`, which quick 261029-ocq added in
c288ad64f / e704b397e. Refresh that artifact with the repo's generator, then promote the file into the blocking scope.

Purpose: keep the committed fork-touched artifact equal to git, so the CI ratchet measures the current tree and not an older one.
Output: both artifacts updated, the test pins moved, the suites green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261029-oog-widen-hardcoded-string-gate-for-key-tabl/261029-oog-SUMMARY.md

## Planner measurements (2026-10-29, HEAD e625650c4)

**Live derivation vs committed artifact.** I ran `buildScopeSnapshot()` against
`git diff --name-status <upstream.baseCommit> HEAD -- src/frontend` with `JEST_WORKER_ID` set. The result: live 288,
committed 287, scope 241. **Added: exactly one file**, `src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts`.
**Removed: none.** No other file differs.

**Audit.** `scanScope({ extraFiles: ['src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts'] })`
scanned 242 files and found **0 violations**. `fileExempt` is still `['src/frontend/bootErrorSurface.ts']` alone. The file
is a 19-line pure predicate, `isSteamIncompleteCard({ runner, status, statusContext })`. Its only string literals are the
comparison operands `'steam'`, `'notInstalled'` and `'steam-incomplete'`. It has no user-facing text. Verdict: **PROMOTE
into scope.** It needs no source fix, no debt entry and no todo.

**Why the working tree cannot leak in.** `main()` in `meta/genI18nGateScope.ts` derives from
`git diff --name-status <baseCommit> HEAD -- src/frontend`, which compares two commits. Uncommitted and untracked files from
other sessions (src-tauri/src/main.rs, ROADMAP.md, gamepage.json, the 261029-osq, 57 and 58 dirs) are invisible to it. The
one risk is a concurrent session **committing** a new `src/frontend` file between planning and execution: HEAD moves and
the generator picks that file up. Task 1 step 2 guards against this by requiring that the regenerated diff is exactly one
added line.

## Mechanics (from the generator and the test, no exploration needed)

- `pnpm gen-i18n-gate-scope` rewrites `meta/i18nForkTouchedFiles.json` only. It never opens `i18nGateScope.json` without
  `--rewrite-scope`. **Never pass `--rewrite-scope`**: the scope file is hand-curated, so the generator would refuse anyway.
- The regenerated fork-touched file differs from the committed bytes in `generatedAt` and in the new `files` line, nothing
  else. (The test history at ~L985 measured that `purpose` stays byte-identical.) Precedent at test ~L321 and ~L979:
  regenerate for real, then restore `generatedAt` by hand to the committed value `2026-10-29T04:10:56.267Z`.
- Test A2 asserts `refusal.added` (fork-touched minus scope) equals `DECLARED_UNSCANNED_DEBT`. The new file therefore has to
  land in BOTH artifacts, which leaves the debt array unedited. Refreshing fork-touched without promoting would turn A2 red.
- Sorted slot in `meta/i18nGateScope.json`: directly after `"src/frontend/screens/Library/components/GameCard/index.tsx",`
  (currently L138) and before `"src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx",`.
- `generatedBy` in `i18nGateScope.json` currently ends with `...then quick 261029-oog promoted buttonClassName.ts, ...
  steamBridgeRouteLine.ts after widening the gate for bare key-path, class-list-return and typed-diagnostic-logger shapes
  -- still NOT a pnpm gen-i18n-gate-scope run`. Insert the new clause before the trailing
  `-- still NOT a pnpm gen-i18n-gate-scope run`, so `isHandCuratedProvenance()` still holds.
- Pins in `meta/__tests__/genI18nGateScope.test.ts` that read 241 / 287: L1122 (A0 title), L1123, L1124, L1165 (A2 title
  "241 -> 287"), L1188 (A3 title), L1201, L1206 (A4 title), L1219. The dated history comment block ends at ~L361, just above
  `const DECLARED_UNSCANNED_DEBT = [`.
- prettier `--file-info` accepts ONE path per call (the multi-path form in the 261029-oog plan errors). All three files
  touched here report `ignored: false`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Regenerate the fork-touched artifact, promote steamIncompleteCard.ts, re-pin the counts</name>
  <files>meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json, meta/__tests__/genI18nGateScope.test.ts</files>
  <action>
    1. From the repo root, run `pnpm gen-i18n-gate-scope`, with no flags. Do not hand-derive the file list.
    2. Run `git diff meta/i18nForkTouchedFiles.json`. It must show exactly two changes: the `generatedAt` line and ONE added
       line, `"src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts",`. If more lines changed (a concurrent
       session committed another src/frontend file), STOP: re-audit every extra file with
       `scanScope({ extraFiles: [...] })` (throwaway script in the session scratchpad, run with
       `node meta/runTs.cjs --bundle --platform=node --target=node21 <script>`), then apply the same promote-or-fix rule to each
       one and adjust the counts below. Do not silently absorb unaudited files.
    3. Restore `generatedAt` in `meta/i18nForkTouchedFiles.json` to `2026-10-29T04:10:56.267Z`, following the "regenerated for
       real, generatedAt restored" precedent. Afterwards `git diff` on it must show the single added line only.
    4. In `meta/i18nGateScope.json`, hand-insert `"src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts",`
       directly after the `GameCard/index.tsx` entry. Extend `generatedBy` by inserting, before the trailing
       `-- still NOT a pnpm gen-i18n-gate-scope run`, the clause: `, then quick 261029-pbv promoted
       GameCard/steamIncompleteCard.ts (added by quick 261029-ocq) after an audit-mode scanScope({ extraFiles }) showed 0
       violations `. Leave `generatedAt` untouched. Do not run `--rewrite-scope`.
    5. In `meta/__tests__/genI18nGateScope.test.ts`, re-pin every 241 to 242 and every 287 to 288 at the lines listed in
       context (titles and `toBe` values together). Append one dated entry to the history comment above
       `DECLARED_UNSCANNED_DEBT`, in the style of the 261029-nmt entry: "2026-10-29 (quick 261029-pbv): fork-touched 287 ->
       288, scope 241 -> 242. `steamIncompleteCard.ts` (261029-ocq, D-UAT-12), a pure predicate whose only literals are
       comparison operands, audited ZERO violations with `scanScope({ extraFiles })` and was hand-inserted into
       `meta/i18nGateScope.json` in sorted position; `meta/i18nForkTouchedFiles.json` regenerated with
       `pnpm gen-i18n-gate-scope`, `generatedAt` restored. DECLARED_UNSCANNED_DEBT needs no edit." Leave
       DECLARED_UNSCANNED_DEBT, `meta/i18nGateAllowlist.json` and `meta/i18nGlossary.json` untouched.
    6. Run `graphify update .`.
    7. Commit by staging ONLY the three paths by explicit name (never `git add -A`, `.` or `-u`). The working tree carries
       unrelated uncommitted work from other sessions (src-tauri/src/main.rs, .planning/ROADMAP.md,
       public/locales/en/gamepage.json, .planning/spikes/049-*, untracked 261029-osq / phase 57 / phase 58 dirs). Run
       `git diff --cached --name-only` before committing and confirm it lists exactly the three files. Message:
       `fix(quick-261029-pbv): refresh i18nForkTouchedFiles.json and promote steamIncompleteCard.ts into gate scope`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && for f in meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts; do npx prettier --file-info "$f" | grep -q '"ignored": false' || exit 1; done && node -e "const s=require('./meta/i18nGateScope.json').files,k=require('./meta/i18nForkTouchedFiles.json');const n='src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts';if(s.length!==242||k.files.length!==288||!s.includes(n)||!k.files.includes(n)||JSON.stringify(s)!==JSON.stringify([...s].sort())||k.generatedAt!=='2026-10-29T04:10:56.267Z')process.exit(1)" && test -z "$(git diff HEAD --name-only -- meta/i18nGateAllowlist.json meta/i18nGlossary.json)" && npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts && npx tsc -p tsconfig.meta.json --noEmit && pnpm planning-gates && npx prettier --check meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts</automated>
  </verify>
  <done>
    Both jest suites are fully green, including A-17 ANTI-ROT, A0, A2, A3 and A4. The scope holds 242 files, sorted, with
    steamIncompleteCard.ts. The fork-touched artifact holds 288, with `generatedAt` unchanged. DECLARED_UNSCANNED_DEBT,
    the allowlist and the glossary are unchanged. Meta tsc and planning-gates are clean, and prettier is clean on the three
    paths. The commit contains exactly those three files.
  </done>
</task>

<task type="auto">
  <name>Task 2: SUMMARY and STATE row</name>
  <files>.planning/quick/261029-pbv-refresh-i18nforktouchedfiles-json-for-st/261029-pbv-SUMMARY.md, .planning/STATE.md</files>
  <action>
    Write the SUMMARY: the audit result (0 violations, 242 scanned), the counts (287 -> 288, 241 -> 242), the commit hash,
    and the note that the generator reads only `<baseCommit>..HEAD`. Add a 261029-pbv row to the STATE.md quick-tasks table
    and update the "Last activity" line. The 261029-oog row flags the A-17 red as pre-existing; this row records it closed.
    STATE.md may hold concurrent edits from other sessions. Edit only your own row and the last-activity line, and stage
    both files by explicit name in a `docs(quick-261029-pbv): ...` commit.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .planning/quick/261029-pbv-refresh-i18nforktouchedfiles-json-for-st/261029-pbv-SUMMARY.md && grep -q '261029-pbv' .planning/STATE.md && pnpm planning-gates</automated>
  </verify>
  <done>The SUMMARY exists, STATE.md has the 261029-pbv row, and planning-gates is green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Offline meta artifacts and tests only. No runtime input and no new dependency. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pbv-01 | Tampering | meta/i18nGateScope.json | mitigate | Hand-insert one audited path. Never `--rewrite-scope`. `isHandCuratedProvenance` is kept by appending inside `generatedBy`. |
| T-pbv-02 | Repudiation | gate integrity | mitigate | No allowlist, ignore-list or glossary edit. The verify asserts those files are unchanged against HEAD. |
</threat_model>

<verification>
`npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts` is fully green.
`npx tsc -p tsconfig.meta.json --noEmit` is clean, and `pnpm planning-gates` is green.
</verification>

<success_criteria>
The A-17 ANTI-ROT test passes. steamIncompleteCard.ts is in blocking scope with 0 violations, and the counts are 242 / 288.
The debt and the allowlist are unchanged, and only this task's paths were committed.
</success_criteria>

<output>
Create `.planning/quick/261029-pbv-refresh-i18nforktouchedfiles-json-for-st/261029-pbv-SUMMARY.md`.
</output>
