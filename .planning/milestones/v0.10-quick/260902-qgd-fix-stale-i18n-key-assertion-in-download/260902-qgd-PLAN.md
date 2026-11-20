---
phase: quick-260902-qgd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - .planning/quick/260902-qgd-fix-stale-i18n-key-assertion-in-download/260902-qgd-PLAN.md
  - .planning/quick/260902-qgd-fix-stale-i18n-key-assertion-in-download/260902-qgd-SUMMARY.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "The 'honest copy' spec pins the EXACT key production calls -- gamelib:box.error.install.stalled -- not a substring or regex"
    - "The spec's own title names the same key it pins, so the title cannot drift from the assertion"
    - "src/backend/downloadmanager/utils.ts is NOT touched -- the production call site is already correct"
    - "No i18n key is added, renamed, moved or removed, and nothing under public/locales/ changes"
    - "The second assertion (dialog message does not match /connection may be stale/) is unchanged"
  artifacts:
    - path: "src/backend/downloadmanager/__tests__/utils.test.ts"
      provides: "stall-watchdog honest-copy spec pinning the namespaced key"
      contains: "gamelib:box.error.install.stalled"
  key_links:
    - "src/backend/downloadmanager/__tests__/utils.test.ts :: honest copy spec"
    - "src/backend/downloadmanager/utils.ts:266 :: i18next.t('gamelib:box.error.install.stalled', ...)"
    - "public/locales/en/gamelib.json :: box.error.install.stalled"
---

<objective>
`src/backend/downloadmanager/__tests__/utils.test.ts:494` pins the bare key
`'box.error.install.stalled'`. Production calls
`i18next.t('gamelib:box.error.install.stalled', ...)` at
`src/backend/downloadmanager/utils.ts:266`. **The test is stale; production is correct.**

Quick task `260901-ud5` (commit `c2f567064`, "resolve i18n catalog drift blocking pre-push
leg 4") deliberately re-namespaced 67 fork-authored strings into the `gamelib` namespace under
its **Bucket R**, to satisfy D-05's requirement that `pnpm i18n` write only
`gamelib.json`/`gamelib.mt.json`. It updated the call site and left this key assertion behind.

Output: a one-literal fix plus an honest title, in one commit.
</objective>

<evidence>
Verified, not assumed:

- `public/locales/en/gamelib.json` **contains** `box.error.install.stalled` =
  `"No download progress for {{minutes}} minutes — the install was stopped"`, alongside its
  siblings `box.error.install.failed` and `box.error.install.signInToSteam`. All three are
  called with the `gamelib:` prefix by `utils.ts` (lines 266, 387, 397). The key resolves —
  this is not [[lint-translations-is-blind-to-an-absent-key]].
- `git log -S` dates the divergence exactly: the assertion was written **2026-08-17** in quick
  `260817-dib` (commit `4d2b319e8`), correct at that time; the prefix landed **2026-09-01** in
  `c2f567064`.
- **Bidirectional census, already run — do not redo it.** All 335 test files scanned against
  all 147 `gamelib:`-prefixed production keys, in both directions ("test pins a BARE key that
  production now prefixes" AND "test pins a `gamelib:` key that production does not"). Exactly
  **one** hit: this line. The defect is isolated; there are no siblings to hunt.
</evidence>

<execution_context>
@CLAUDE.md
</execution_context>

<task_1>
**Re-pin the stall-watchdog honest-copy spec to the namespaced key.**

files: `src/backend/downloadmanager/__tests__/utils.test.ts`

action:
1. Line 494: `'box.error.install.stalled'` → `'gamelib:box.error.install.stalled'`.
2. Line 487: update the spec's title so it names the namespaced key rather than the bare one —
   the title is what a future reader greps, and it must not claim to pin something it doesn't.

verify:
- `npx jest --selectProjects Backend --testPathPattern 'downloadmanager/__tests__/utils\.test\.ts'` → 34/34
- `npx tsc --noEmit` clean
- `eslint` + `prettier --check` clean on the changed file
- `pnpm i18n --fail-on-update` still exits 0

done: the suite is green, and the assertion still pins one exact key string.
</task_1>

<constraints>
- Do NOT touch `src/backend/downloadmanager/utils.ts`. Its call site is correct and is the
  reason this test fails.
- Do NOT add, rename, move or remove any i18n key; do NOT touch anything under
  `public/locales/`.
- Do NOT run `pnpm gen-i18n-gate-scope` — regenerating that artifact turns 1 failure into 5.
- Do NOT weaken the assertion to a substring or regex match. Pinning the exact key IS the
  "honest copy" spec's purpose; a loosened matcher would keep the suite green while dropping
  the guarantee.
- Leave the second assertion (`dialog message does not match /connection may be stale/`)
  untouched.
</constraints>
