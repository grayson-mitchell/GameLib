---
quick_id: 260926-jes
type: execute
mode: quick
title: Rename the structurally-unresolvable i18n key `notify.uninstalled.error` to the sibling `notify.uninstallError`
area: i18n
files_modified:
  - src/backend/utils/uninstaller.ts
  - .planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md
autonomous: true
tasks: 2
---

<objective>
`src/backend/utils/uninstaller.ts:123` calls `i18next.t('notify.uninstalled.error', 'Error uninstalling')`.
That key requires `notify.uninstalled` to be an **object** with an `error` child. In all 47 locale
`translation.json` files it is a **string** (`'Uninstalled'` in English) — census: 47 string, 0 object,
0 absent — and 0 of 47 carry the `error` child. The key therefore can never resolve in any language,
and i18next always falls through to the hardcoded English default.

Rename the key to the sibling `notify.uninstallError`. This removes the string-vs-parent structural
conflict that `pnpm i18n` reports, and changes nothing a user sees: neither the old nor the new key
exists in any catalog, so both fall through to the same hardcoded English string before and after.

Purpose: eliminate a live hazard for any catalog regenerated from source, without dissolving the
separate (human) question of whether to translate the string at all.
Output: one-token source edit; todo moved to `completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md
@src/backend/utils/uninstaller.ts
</context>

<scope_boundaries>
**HARD PROHIBITION — do NOT add the new key (or any key) to `public/locales/**`.** Not to
`translation.json`, not to `gamelib.json`, not even to English. The todo defers that namespace
decision to a human explicitly (in `gamelib.json` an English-only key is gated at 48 hard failures
against the `totalPairs: 0` baseline and `machine-fill-gamelib` is unavailable under a gateway-scoped
key; in `translation.json` it would ship untranslated). `pnpm i18n` runs an i18next-parser that CAN
write catalogs — if it does, revert those writes.

**Do NOT touch the sibling call sites of the plain `notify.uninstalled` key.** They resolve fine:
- `src/backend/utils/uninstaller.ts:141`
- `src/backend/wine/manager/ipc_handler.ts:58`
- `src/backend/sidecar/wineToolsFlowRegistration.ts:222`
- `src/backend/storeManagers/steam/library.ts:3007`
- `src/backend/storeManagers/sideload/games.ts:128`

The second argument `'Error uninstalling'` stays exactly as-is.
</scope_boundaries>

<measured_baseline>
`pnpm i18n` was run on the unmodified tree at plan time (exit 0). Its warning lines were:

```
Found same keys different values: translation:box.shortcuts.title     (repeated 3 times)
Found translation key already mapped to a map or parent of new key already mapped to a string:
  translation:notify.uninstalled.error
Found translation key already mapped to a map or parent of new key already mapped to a string:
  translation:notify.uninstalled
Found same keys different values: translation:setting.eosOverlay.updating
Found same keys different values: translation:wine.manager.settings
```

`git status --porcelain public/locales` was **empty** before the change.

The three `same keys different values` warnings (`box.shortcuts.title`, `setting.eosOverlay.updating`,
`wine.manager.settings`) are the **non-vacuity control**: they are unrelated to this change and MUST
still appear afterwards. A run with zero warnings of any kind means the parser silently no-opped —
that is a FAILED verification, not a passing one.
</measured_baseline>

<tasks>

<task type="auto">
  <name>Task 1: Rename the key at the single call site</name>
  <files>src/backend/utils/uninstaller.ts</files>
  <action>
At `src/backend/utils/uninstaller.ts:123`, inside the `catch (error)` block of the uninstall try,
change the i18next key string `'notify.uninstalled.error'` to `'notify.uninstallError'`. Leave the
second argument `'Error uninstalling'` byte-identical. This is the only call site of the old key in
the repo (verified). Do not edit any other line, any other file, or anything under `public/locales/`.

Before editing, re-run `pnpm i18n` yourself and capture its warning lines to a scratch file so the
after-comparison is against a value you measured in this session, not the one transcribed above.
  </action>
  <verify>
    <automated>
# 0. Capture the BEFORE baseline (run this before the edit).
pnpm i18n 2>&1 | tr ' ' '\n' | grep -c . > /dev/null   # warm-up; real capture below
pnpm i18n 2>&1 | grep -Eo 'translation:[a-zA-Z.]+' | sort -u > /tmp/i18n-before.txt
cat /tmp/i18n-before.txt

# --- make the edit, then run everything below ---

# 1. The old key is gone and the new key is present, exactly once each.
test "$(grep -c "notify\.uninstalled\.error" src/backend/utils/uninstaller.ts)" -eq 0
test "$(grep -c "notify\.uninstallError" src/backend/utils/uninstaller.ts)" -eq 1

# 2. The hardcoded default and the sibling call site are untouched.
grep -q "i18next.t('notify.uninstallError', 'Error uninstalling')" src/backend/utils/uninstaller.ts
test "$(grep -c "i18next\.t('notify\.uninstalled')" src/backend/utils/uninstaller.ts)" -eq 1

# 3. Exactly one line of the file changed.
test "$(git diff --numstat src/backend/utils/uninstaller.ts | awk '{print $1"/"$2}')" = "1/1"

# 4. Formatter — scoped to the exact path written, never a bare '.'  (CLAUDE.md convention:
#    no other gate in this repo sees formatting).
npx prettier --check src/backend/utils/uninstaller.ts

# 5. Typecheck.
pnpm codecheck

# 6. i18next-parser, asserted in BOTH directions.
pnpm i18n 2>&1 | tee /tmp/i18n-after.txt
#    6a. POSITIVE: the structural warning no longer names either key.
grep -E 'already mapped' /tmp/i18n-after.txt | grep -E 'notify\.uninstalled(\.error)?\b' && exit 1
#    6b. NON-VACUITY CONTROL: the three unrelated value-collision warnings MUST still be there.
grep -q 'translation:box.shortcuts.title'        /tmp/i18n-after.txt
grep -q 'translation:setting.eosOverlay.updating' /tmp/i18n-after.txt
grep -q 'translation:wine.manager.settings'       /tmp/i18n-after.txt

# 7. The parser wrote NO catalogs. Must be empty output.
test -z "$(git status --porcelain public/locales)"
    </automated>
  </verify>
  <done>
`uninstaller.ts:123` reads `i18next.t('notify.uninstallError', 'Error uninstalling')`; the diff is
1 insertion / 1 deletion in that one file; prettier and `pnpm codecheck` pass; `pnpm i18n` no longer
names `notify.uninstalled` or `notify.uninstalled.error` under the `already mapped` warning while the
three `box.shortcuts.title` / `setting.eosOverlay.updating` / `wine.manager.settings` value-collision
warnings still appear; `git status --porcelain public/locales` is empty.

If step 6b finds no control warnings, STOP — the parser did not really run and step 6a proved nothing.
If step 7 is non-empty, `git checkout -- public/locales` and re-verify; do not commit catalog writes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Close the todo</name>
  <files>.planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md</files>
  <action>
Move the todo to completed using **`git mv`** (a plain `mv` crashes a planning gate until the move is
staged):

`git mv .planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md .planning/todos/completed/`

Do not edit the todo body or frontmatter — completed todos keep their frontmatter as-is and
`completed/` is exempt from the todo-frontmatter gate.

Note in the quick-task record that only the rename shipped: the namespace question (whether to add
`notify.uninstallError` to `gamelib.json` or `translation.json` at all) is still open and still
belongs to a human, per the todo's Solution section.
  </action>
  <verify>
    <automated>
test -f .planning/todos/completed/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md
test ! -e .planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md
# The move must be STAGED (git mv, not mv) or the planning gate crashes.
git status --porcelain | grep -q '^R.*todos/completed/2026-09-26-notify-uninstalled-error'
pnpm planning-gates
# Still no catalog writes.
test -z "$(git status --porcelain public/locales)"
    </automated>
  </verify>
  <done>
The todo file lives in `.planning/todos/completed/`, the rename is staged as a git rename,
`pnpm planning-gates` passes, and `public/locales` is still clean.
  </done>
</task>

</tasks>

<success_criteria>
- `src/backend/utils/uninstaller.ts` line 123 uses `notify.uninstallError`; nothing else in the repo changed except the todo move.
- `pnpm i18n` structural `already mapped` warning no longer names `notify.uninstalled` or `notify.uninstalled.error`.
- The three unrelated value-collision warnings still appear (non-vacuity control).
- `git status --porcelain public/locales` is empty.
- `npx prettier --check src/backend/utils/uninstaller.ts`, `pnpm codecheck`, and `pnpm planning-gates` all pass.
- Todo moved to `completed/` via `git mv`.
</success_criteria>
