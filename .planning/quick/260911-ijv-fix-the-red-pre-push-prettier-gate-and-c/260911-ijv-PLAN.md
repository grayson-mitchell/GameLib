---
phase: quick-260911-ijv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/__tests__/quitTeardownWiring.test.ts
  - src/backend/__tests__/shellDiagPersistence.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/longLivedChildren.ts
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx
  - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.tsx
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md
  - .planning/todos/completed/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md
autonomous: true
requirements: [QUICK-260911-ijv-01]

must_haves:
  truths:
    - "pnpm prettier exits 0 at HEAD"
    - "pnpm lint still exits 0 and still prints production: PASS | tests: PASS after the formatting write"
    - "pnpm i18n --fail-on-update leaves public/locales clean - the key reorder is a committed fixpoint, not a per-push dirty write"
    - "git push --dry-run origin fix/steam-native-install-stability succeeds WITHOUT --no-verify"
    - "The lint-ratchet todo is closed with an accurate record that credits quick 260909-s8x for the lint half"
  artifacts:
    - path: ".planning/todos/completed/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md"
      provides: "Honest closure record; file no longer in pending/"
      contains: "status: CLOSED"
    - path: "public/locales/en/gamelib.json"
      provides: "Committed i18next serialisation order for settledFromOwnership"
  key_links:
    - from: ".husky/pre-push"
      to: "pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update"
      via: "all four legs green"
      pattern: "pnpm prettier"
---

<objective>
Make the pre-push hook green without `--no-verify`, and close the stale lint-ratchet todo honestly.

Purpose: `.husky/pre-push` runs `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update`.
Three legs pass. `pnpm prettier` fails on 12 committed files. Two pushes have already bypassed the
gate with `--no-verify`, so the branch's protection is currently theatre.

Output: two code commits (formatting; i18n catalog order), two record commits (todo edit; todo move),
and a `git push --dry-run` that fires the REAL hook and passes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

**Do not re-measure these to decide what to do. They were measured live at HEAD `86f350837` on 2026-09-11.**

| pre-push leg | status now |
|---|---|
| `pnpm codecheck` (`tsc --noEmit`) | PASS |
| `pnpm lint` (`node meta/lintScoped.cjs`) | PASS - `production: PASS \| tests: PASS` |
| `pnpm prettier` (`prettier --check .`) | **FAIL - 12 files** |
| `pnpm i18n --fail-on-update` | exits 0 but WRITES a 2-line reorder |

**The lint half of the todo is ALREADY FIXED. Do not re-fix it, and do not touch any ceiling.**
Quick `260909-s8x` (commits `1c1345064`, `8f0d7ff20`, `7392244d0`) replaced
`eslint --max-warnings 4157 .` with `node meta/lintScoped.cjs`. `--max-warnings` no longer exists in
package.json. The todo's "4253 vs 4157", its "Fix direction", and its top-offenders table are obsolete.

**Lint headroom is nearly zero - this is the whole risk of Task 1:**

| scope | current warnings | ceiling (`meta/lintScoped.cjs:58-59`) | headroom |
|---|---|---|---|
| production | 1123 | `SRC_CEILING = 1124` | **1** |
| tests | 638 | `TESTS_CEILING = 638` | **ZERO** |

ESLint v9 flat config defaults `reportUnusedDisableDirectives` to `warn`. So if a prettier rewrap
moves an `eslint-disable-next-line` off its target line, the cost is **+2 warnings**: the suppressed
warning comes back AND the now-orphaned directive is itself reported. Either scope breaches instantly.
Two of the 12 files carry directives: `src/backend/sidecar/__tests__/appShellFlows.test.ts` (22
occurrences, tests scope, zero headroom) and `src/frontend/screens/Humble/Keys/index.tsx` (1,
production scope, 1 slot). See `[[prettier-rewrap-can-defeat-an-eslint-disable-next-line]]`.

**`.prettierignore` contains `public/locales/`, `.planning`, and `.claude`.** So the i18n catalog, the
todo edits, this plan, and the untracked `.claude/skills/archify/` are all invisible to
`prettier --check`. The prettier and i18n halves are fully decoupled.

**`src/preload/.prettierrc` sets `printWidth: 120`, overriding the root default of 80.** NONE of the
12 files live under `src/preload/`. A bare `npx prettier --write .` would bake that split in -
**scope every write to the explicit 12-path list.**

**Working tree state:** `public/locales/en/gamelib.json` is modified (the i18n reorder, produced by the
orchestrator's measurement). `.claude/skills/archify/` and `skills-lock.json` are untracked. Nothing
else. There is no concurrent session's work at risk - which is what makes a bulk format safe here.

<commit_recipes>
PROVEN in a scratch repo during planning. Do not improvise around these.

`gsd-sdk query commit` is BANNED in this repo - it stages the ENTIRE working tree and absorbs
foreign work. Commit by explicit path only. Do NOT invoke any `gsd-sdk` `state.*` or `roadmap.*`
verb, and do not hand-edit `.planning/STATE.md` or `.planning/ROADMAP.md`. The orchestrator owns
STATE.md and will hand-apply the delta.

Modified tracked files:

    git commit -m "msg" --only -- <path> <path>

Verified: leaves an unrelated dirty tracked file dirty, leaves untracked files untracked, and leaves
the index empty afterward.

Renames (moving the todo) need TWO steps, and `-m` MUST come before the `--`:

    git add -- <newpath>
    git commit -m "msg" --only -- <oldpath> <newpath>

The path-scoped `git add` is required. `git commit --only -- <old> <new>` ALONE fails with
`error: pathspec '<new>' did not match any file(s) known to git`, because the new path is untracked.
Verified this recipe scores R100 and sweeps nothing.

Use plain `mv`, NEVER `git mv` - `git mv` stages the rename the instant it runs, and a staged rename
sitting in the index gets swept into whatever commits next.

**Never use `git checkout --` or `git restore` to undo anything** - `.husky/post-checkout` fires and
throws. Restore a file with `git show HEAD:<path> > <path>`.
</commit_recipes>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Format the 12 prettier offenders, and prove the rewrap did not break lint</name>
  <files>src/backend/__tests__/quitTeardownWiring.test.ts, src/backend/__tests__/shellDiagPersistence.test.ts, src/backend/humble/__tests__/library.test.ts, src/backend/longLivedChildren.ts, src/backend/sidecar/__tests__/appShellFlows.test.ts, src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts, src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx, src/frontend/screens/Humble/Keys/__tests__/index.test.tsx, src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx, src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx, src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx, src/frontend/screens/Humble/Keys/index.tsx</files>
  <action>
Run `npx prettier --write` against EXACTLY the 12 paths listed in the files field, passed explicitly on
the command line. Do NOT run `npx prettier --write .` - see the `src/preload/.prettierrc` printWidth
trap in context.

This is a pure-formatting change. Do not fix a lint warning, rename anything, or tidy adjacent code
while you are in these files - that would contaminate a formatting-only commit with behaviour.

Then re-run `pnpm lint` and read the COUNTS, not just the exit code. The two `problems (` lines in its
output are the production scope (first) and the tests scope (second). Production must be at most 1124
and tests must be at most 638. Tests has ZERO headroom, so tests must come back at exactly 638.

The `.eslintcache-src` / `.eslintcache-tests` caches are content-keyed, so the files you just rewrote
are re-linted automatically. Do not delete the caches.

IF a count went up, a rewrap orphaned an `eslint-disable-next-line` from its target line. Fix it by
re-attaching the directive to the line it is meant to suppress, or by fencing that one construct with
a `// prettier-ignore` comment so prettier stops rewrapping it. **Do NOT raise `SRC_CEILING` or
`TESTS_CEILING`.** A ratchet that widens to admit whatever failed is not a ratchet - that is the exact
principle this todo was filed to defend, and the same principle the todo-frontmatter gate convention in
CLAUDE.md states.

Commit as a formatting-only commit, by explicit path, using the modified-files recipe in
commit_recipes. Keep `public/locales/en/gamelib.json` OUT of this commit - it is Task 2's.
Suggested message: `style(quick-260911-ijv): prettier-format 12 committed-debt files`
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm lint > /tmp/ijv-lint.txt 2>&1; echo "LINT_EXIT=$?"; grep -n "problems (" /tmp/ijv-lint.txt; grep -n "production:" /tmp/ijv-lint.txt; pnpm prettier; echo "PRETTIER_EXIT=$?"</automated>
  </verify>
  <done>
`pnpm prettier` exits 0. `pnpm lint` exits 0, prints `production: PASS | tests: PASS`, and its two
counts are at most 1123/1124 (production) and exactly 638 (tests). The formatting commit contains ONLY
the 12 source paths - `git show --stat HEAD` lists 12 files, and neither `public/locales/en/gamelib.json`
nor any `.claude/` or `skills-lock.json` path appears in it.
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit the i18n catalog key reorder and prove it is a fixpoint</name>
  <files>public/locales/en/gamelib.json</files>
  <action>
`pnpm i18n --fail-on-update` exits 0 but rewrites `public/locales/en/gamelib.json` on every run: the key
`settledFromOwnership` moves into alphabetical position between `searchPlaceholder` and
`sortAlphabetical`. That write is already sitting in the working tree from the orchestrator's
measurement. Because it is never committed, the hook dirties the tree on every single push.

First CONFIRM the diff is purely a serialisation reorder before committing it - run
`git diff --stat public/locales/en/gamelib.json` and expect 2 insertions / 2 deletions, and confirm via
`git diff` that no key name and no string VALUE changes. If the diff is anything larger than that,
STOP and report rather than committing; something other than the parser touched the catalog.

Committing the parser's own ordering is the CORRECT fix. It is NOT the "hand-edit the catalog to paper
over it" that `pnpm i18n-churn-guard` (D-05) warns about - no key and no value changes, and `gamelib.json`
is precisely the one catalog D-05 permits `pnpm i18n` to touch. Per CLAUDE.md, new strings belong in
`gamelib.json`, which is what this file is.

Commit that ONE path using the modified-files recipe. The untracked `.claude/skills/archify/` and
`skills-lock.json` must not appear.
Suggested message: `chore(quick-260911-ijv): commit i18next key ordering for gamelib.json`

Then prove the fixpoint: run `pnpm i18n --fail-on-update` AGAIN and confirm it now leaves
`public/locales` clean. A fix that still rewrites the file on the second run has not fixed anything.
Also run `pnpm i18n-churn-guard` and confirm it still passes.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm i18n --fail-on-update; echo "I18N_EXIT=$?"; echo "PORCELAIN_BELOW_MUST_BE_EMPTY:"; git status --porcelain public/locales; pnpm i18n-churn-guard; echo "CHURN_EXIT=$?"</automated>
  </verify>
  <done>
`pnpm i18n --fail-on-update` exits 0 and `git status --porcelain public/locales` prints NOTHING.
`pnpm i18n-churn-guard` exits 0. The commit touches exactly one file.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the lint-ratchet todo honestly, then prove the real pre-push hook passes</name>
  <files>.planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md, .planning/todos/completed/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md</files>
  <action>
Close `.planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md`
in TWO commits, edit first and move second. This ordering is deliberate: a content edit bundled with a
rename drops git's rename detection from R100 to borderline R051, which breaks `git log --follow`.

Commit 3a - EDIT IN PLACE, still in `pending/`. Append a `## Resolution (2026-09-11, quick 260911-ijv)`
section. It must record, accurately:
  - The LINT half was NOT fixed by this task. Quick `260909-s8x` fixed it on 2026-09-09, the same day
    this todo was filed, via commits `1c1345064`, `8f0d7ff20`, `7392244d0`. It replaced
    `eslint --max-warnings 4157 .` with `node meta/lintScoped.cjs` and its two independent ceilings
    (`SRC_CEILING`, `TESTS_CEILING`), each with a `minFiles` scope-collapse floor. This todo must not
    claim credit for that work.
  - The todo's central number is obsolete, not merely stale: `--max-warnings` no longer exists in
    package.json, so "4253 vs 4157" describes a gate that is gone. The 4253 -> ~1761 drop was NOT a
    cleanup - the test override already set `no-explicit-any: 'off'` while the five `no-unsafe-*` rules
    stayed on globally, so the config was warning about a construct it also permitted. That
    contradiction was resolved, not papered over.
  - The PRETTIER half is what this task actually fixed, and it had GROWN from the 7 files the todo
    recorded to 12. The 5 extra are the `src/frontend/screens/Humble/Keys/**` files, committed 09-10
    and 09-11 - i.e. the debt was still accruing while the todo sat open.
  - A leg the todo never recorded: `pnpm i18n --fail-on-update` exits 0 but rewrote
    `public/locales/en/gamelib.json` on every run. Fixed here by committing the parser's own key order.
  - Measured baseline after the fix: production 1123/1124, tests 638/638.
  - The two `--no-verify` bypasses (quicks `260909-r4h`, `260909-rvx`) are now discharged: the gate is
    green, so no further bypass is needed.

Set frontmatter `status: OPEN` -> `status: CLOSED` and add `closed: 2026-09-11` plus a `closed_by:`
naming the Task 1 and Task 2 commit shas and `quick-260911-ijv`. This matches the house style of
existing `completed/` files such as `switch-gog-user-api-off-userdata-json.md`.

LEAVE `severity:`, `platform:` and `ready:` in place with their existing bare lowercase values. The
`.planning/todos/todo-frontmatter-gate.py` gate scopes to `pending/` ONLY, so the file must still carry
all three for as long as it sits there - do not strip them in this commit.

Suggested message: `docs(quick-260911-ijv): close the lint-ratchet todo, crediting 260909-s8x for the lint half`

Commit 3b - MOVE ALONE, no content change. Use plain `mv` (never `git mv`) to
`.planning/todos/completed/`, then the two-step rename recipe from commit_recipes. Confirm it scored a
rename with `git show --stat -M HEAD`.
Suggested message: `docs(quick-260911-ijv): move closed lint-ratchet todo to completed/`

FINALLY, prove the whole thing end to end. Run all four hook legs and then `git push --dry-run origin
fix/steam-native-install-stability`. The dry run fires the REAL pre-push hook and publishes nothing; it
must succeed WITHOUT `--no-verify`. That is the actual success condition of this entire task. Also run
`pnpm planning-gates` to confirm the todo move left the planning gates green.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update; echo "HOOK_LEGS_EXIT=$?"; git status --porcelain public/locales; pnpm planning-gates; echo "GATES_EXIT=$?"; git push --dry-run origin fix/steam-native-install-stability; echo "PUSH_DRYRUN_EXIT=$?"</automated>
  </verify>
  <done>
`git push --dry-run origin fix/steam-native-install-stability` exits 0 with the hook running and no
`--no-verify`. All four legs exit 0, `git status --porcelain public/locales` is empty, and
`pnpm planning-gates` is green. The todo is gone from `pending/`, present in `completed/` with
`status: CLOSED`, and its Resolution credits `260909-s8x` for the lint half. `git status --porcelain`
still shows `.claude/skills/archify/` and `skills-lock.json` as untracked - they were never swept into
any commit.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none crossed | Formatting, a catalog key reorder, and a markdown record. No untrusted input is parsed, no network call is made, no runtime code path changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ijv-01 | Tampering | `prettier --write` scope | mitigate | Write is scoped to 12 explicit paths, never `.`, so `src/preload/.prettierrc` printWidth 120 cannot leak into root-config files. |
| T-ijv-02 | Tampering | git index | mitigate | All commits use `git commit --only -- <explicit paths>`; `gsd-sdk query commit` is banned. Verified to leave untracked `.claude/skills/archify/` and `skills-lock.json` alone. |
| T-ijv-03 | Repudiation | todo closure record | mitigate | Resolution explicitly credits quick `260909-s8x` for the lint half so the record cannot be read as this task having fixed it. |
| T-ijv-04 | Denial of Service | lint ceilings | mitigate | Ceilings are never raised; an orphaned directive is re-attached or prettier-ignored instead. Counts are asserted numerically, not by exit code alone. |
| T-ijv-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs NO packages. No package-manager invocation occurs, so the legitimacy gate does not arm. |
</threat_model>

<verification>
1. `pnpm prettier` exits 0.
2. `pnpm lint` exits 0 AND still reports `production: PASS | tests: PASS`, with production at most 1124
   and tests exactly 638 (the rewrap check).
3. `pnpm codecheck` exits 0.
4. `pnpm i18n --fail-on-update` exits 0 and leaves `git status --porcelain public/locales` EMPTY.
5. `git push --dry-run origin fix/steam-native-install-stability` succeeds WITHOUT `--no-verify`.
6. `pnpm planning-gates` green; todo in `completed/`, absent from `pending/`.
7. No commit in this task contains `.claude/skills/archify/` or `skills-lock.json`.
</verification>

<success_criteria>
The pre-push hook is green on `fix/steam-native-install-stability` and a normal `git push` needs no
`--no-verify`. Four atomic commits: formatting, i18n ordering, todo edit, todo move. No behavioural
change anywhere. No ceiling raised. No STATE.md or ROADMAP.md write.
</success_criteria>

<output>
Create `.planning/quick/260911-ijv-fix-the-red-pre-push-prettier-gate-and-c/260911-ijv-SUMMARY.md` when done.

Record in it: the post-fix lint counts, the four commit shas, the `git push --dry-run` result, and the
fact that the lint half was already shipped by `260909-s8x` (so the summary does not repeat the credit
error the todo would otherwise have propagated).
</output>
