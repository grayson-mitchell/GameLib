---
quick_id: 260926-jes
type: execute
mode: quick
subsystem: i18n
tags: [i18next, i18n-parser, notifications, uninstaller]

key-files:
  modified:
    - src/backend/utils/uninstaller.ts
    - .planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md (moved to completed/)

key-decisions:
  - "Renamed notify.uninstalled.error to notify.uninstallError rather than adding the error child under notify.uninstalled, avoiding the string-vs-object structural conflict entirely"
  - "Did not add the new key to any locale catalog (public/locales/**) — the namespace/translation decision stays open for a human, per the todo's Solution section"

completed: 2026-09-26
---

# Quick Task 260926-jes: Rename notify.uninstalled.error to notify.uninstallError Summary

**Renamed a structurally-unresolvable i18next key at its single call site so `pnpm i18n` no longer reports a string/object collision, with no user-visible behavior change.**

## Performance

- **Tasks:** 2/2 completed
- **Files modified:** 2 (1 source file edited, 1 todo file moved)
- **Completed:** 2026-09-26

## Accomplishments

- `src/backend/utils/uninstaller.ts:123` now calls `i18next.t('notify.uninstallError', 'Error uninstalling')` instead of `i18next.t('notify.uninstalled.error', 'Error uninstalling')`.
- The `pnpm i18n` structural warning (`Found translation key already mapped to a map or parent of new key already mapped to a string`) no longer names `notify.uninstalled` or `notify.uninstalled.error`.
- Confirmed via non-vacuity control that the parser genuinely re-ran (three unrelated `Found same keys with different values` warnings for `box.shortcuts.title`, `setting.eosOverlay.updating`, and `wine.manager.settings` still appear, unchanged).
- Todo `2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md` moved from `pending/` to `completed/` via `git mv`.

## Task Commits

1. **Task 1: Rename the key at the single call site** - `e71757335` (fix)
2. **Task 2: Close the todo** - `19ff19bf2` (docs)

_No plan-metadata commit for quick tasks — orchestrator handles the docs commit separately per this task's constraints._

## Files Created/Modified

- `src/backend/utils/uninstaller.ts` - Line 123 key renamed from `notify.uninstalled.error` to `notify.uninstallError`; the hardcoded fallback string (`'Error uninstalling'`) and all sibling call sites of the plain `notify.uninstalled` key were left untouched.
- `.planning/todos/pending/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md` → `.planning/todos/completed/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md` - moved via `git mv`, body/frontmatter untouched.

## Decisions Made

- Followed the plan's prescribed fix exactly: rename to the sibling key rather than restructuring `notify.uninstalled` into an object, since the latter would be an architectural change affecting the object shape consumed by the three other call sites listed in the plan's scope boundaries.
- Left the namespace/translation question (whether `notify.uninstallError` should ever be added to `gamelib.json` or `translation.json`) unresolved, as directed — that decision belongs to a human per the todo.

## Deviations from Plan

None — plan executed exactly as written. One expected/anticipated event occurred and was handled per the plan's own contingency instructions (not a deviation from the plan, but worth recording explicitly since it touched files outside the plan's stated `files_modified` list):

**`pnpm i18n` wrote a catalog on the after-run.** Running `pnpm i18n` after the source edit caused the i18next-parser to write `"uninstallError": "Error uninstalling"` into `public/locales/en/translation.json` (confirmed via `git diff` before reverting). This is exactly the hazard the plan's Task 1 `<done>` block anticipated and pre-authorized a remedy for ("If step 7 is non-empty, `git checkout -- public/locales` and re-verify; do not commit catalog writes"). I ran `git checkout -- public/locales`, re-ran `git status --porcelain public/locales` (empty), and re-ran `pnpm planning-gates` and the catalog-cleanliness check after the Task 2 todo move as well — both confirmed clean. No catalog write was staged or committed at any point.

## Issues Encountered

None beyond the anticipated catalog-write event described above, which was resolved per the plan's own instructions.

## Verification Detail (as actually run this session)

**Task 1:**
- Baseline `pnpm i18n` (before edit): exit 0; `already mapped` warnings named exactly `translation:notify.uninstalled.error` and `translation:notify.uninstalled`; non-vacuity control warnings (`box.shortcuts.title` x3, `setting.eosOverlay.updating`, `wine.manager.settings`) present — matched the plan's measured baseline exactly.
- `grep -c "notify\.uninstalled\.error"` on the file: 0 (PASS)
- `grep -c "notify\.uninstallError"` on the file: 1 (PASS)
- `grep -q "i18next.t('notify.uninstallError', 'Error uninstalling')"`: matched (PASS)
- `grep -c "i18next\.t('notify\.uninstalled')"`: 1 (PASS — sibling untouched)
- `git diff --numstat`: `1  1` (PASS — exactly one line changed)
- `npx prettier --check src/backend/utils/uninstaller.ts`: "All matched files use Prettier code style!" (PASS)
- `pnpm codecheck`: exit 0, no errors from either `tsc` invocation (PASS)
- After-run `pnpm i18n`: exit 0; inverted check confirmed no `already mapped` warning names `notify.uninstalled` or `notify.uninstalled.error` (PASS); non-vacuity control confirmed all three unrelated warnings still present (PASS)
- `git status --porcelain public/locales`: initially **non-empty** (`M public/locales/en/translation.json`, adding `"uninstallError": "Error uninstalling"`) — reverted with `git checkout -- public/locales`; re-checked empty (PASS after remediation)

**Task 2:**
- `test -f .planning/todos/completed/2026-09-26-....md`: PASS
- `test ! -e .planning/todos/pending/2026-09-26-....md`: PASS
- `git status --porcelain | grep '^R.*todos/completed/2026-09-26-notify-uninstalled-error'`: matched (PASS — staged as a rename)
- `pnpm planning-gates`: 13/13 gates passed
- `git status --porcelain public/locales`: empty (PASS)

## Next Phase Readiness

No follow-up required from this task. The separate namespace decision (whether/how to translate `notify.uninstallError`) remains tracked as an open human decision referenced in the now-completed todo's Solution section — not reopened as a new todo, since the original todo's text already covers it.

---
*Quick task: 260926-jes*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: `src/backend/utils/uninstaller.ts`
- FOUND: `.planning/todos/completed/2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md`
- FOUND: `.planning/quick/260926-jes-rename-notify-uninstalled-error-to-notif/260926-jes-SUMMARY.md`
- FOUND commit: `e71757335`
- FOUND commit: `19ff19bf2`

---

## Orchestrator addendum — the catalog write is NEW, not incidental

The executor reverted the `public/locales/en/translation.json` write and reported it as an
anticipated hazard. That is accurate but understates it. A control test run by the orchestrator
after both commits landed establishes the sharper fact:

| source state                      | `pnpm i18n` effect on `public/locales`                       |
| --------------------------------- | ------------------------------------------------------------ |
| OLD key `notify.uninstalled.error` | writes **nothing** — tree stays clean                         |
| NEW key `notify.uninstallError`    | writes `"uninstallError": "Error uninstalling"` into `en/`    |

Method: `git checkout e22ec20fe -- src/backend/utils/uninstaller.ts`, `pnpm i18n`,
`git status --porcelain public/locales` → empty. Then restored HEAD and re-ran → dirty. Both
arms confirmed; tree left clean.

**Why this matters.** The string-vs-parent conflict was *silently suppressing* the parser's write.
Removing the conflict did not just quiet a warning — it made the key writable for the first time.
So `pnpm i18n` is now a dirtying command for this key, and **the next person who runs it and
commits will make the deferred namespace decision by accident**, landing an English-only key in
the ungated `translation.json` namespace. That is precisely the outcome the todo reserved for a
human.

This does not undo or weaken the rename: the rename is correct under every branch of the namespace
question, and nothing a user sees changed. It does mean the follow-up decision is now **time-
sensitive in a way the todo did not predict** — previously the key was inert, now it is one
routine command away from being decided silently.

**Not actioned here deliberately.** Adding the key, or adding a parser ignore/exclusion for it, are
both the human decision this task was scoped to avoid making.
