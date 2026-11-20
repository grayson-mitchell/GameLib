# Deferred items — quick 260926-8j9

Out-of-scope discoveries found while executing this plan. Not fixed here (documentation-only plan,
scope limited to `files_modified`); logged per the SCOPE BOUNDARY deviation rule.

## `pnpm planning-gates` fails on unrelated, pre-existing files (`planning-envelope-tag-gate.py`)

**Found during:** Task 4 verify (`pnpm planning-gates` run as part of the todo-frontmatter check).

**What:** `.planning/planning-envelope-tag-gate.py` (added 2026-09-22, commit `e5e684847`) FAILS
against three files that are unrelated to this plan and already committed on `main`:

- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-SUMMARY.md` (2 orphan lines)
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-VERIFICATION.md` (1 orphan line)
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/deferred-items.md` (1 orphan line)

These were committed in `20ffb98e7` (`docs(quick-260925-uok): Windows gamelib:// self-heal on
launch`), which predates this session and is not part of this plan's `files_modified`. The gate's
own message states the fix ("delete the stray tag(s) from the file, and nothing else"), but doing
so is out of scope for this documentation-only plan against a different quick task's artifacts —
per the SCOPE BOUNDARY rule, out-of-scope pre-existing failures are logged, not fixed, here.

**Effect on this plan's gates:** every task in this plan whose `<verify>` block runs
`pnpm planning-gates` (Tasks 4, 5, 7) will report this same pre-existing failure alongside its own
(unrelated) passing checks. The gates SPECIFIC to this plan's own files —
`.planning/todos/todo-frontmatter-gate.py` and `.planning/uat-visibility-gate.py` — both PASS on
their own. `12/13 planning gates passed`; the 1 failure is `planning-envelope-tag-gate.py`, entirely
unrelated to this plan's content.

**Recommended follow-up:** a separate quick task to delete the three stray trailing envelope tags
from the 260925-uok artifacts.

## Task 6's automated verify script has an unscoped `grep -c "^    outcome: "` (not fixed — verified correct by hand instead)

**Found during:** Task 6 verify.

**What:** Task 6's verify block counts `outcome:` keys with `grep -c "^    outcome: " "$FILE"` over
the WHOLE file, expecting 3 in `34.1-VERIFICATION.md` and 1 in `34.4.1-VERIFICATION.md`. Both files
already carried unrelated, pre-existing `outcome:` keys at the same 4-space indent under a
DIFFERENT array before this plan touched them: `34.1-VERIFICATION.md`'s `live_uat_sessions:` (4
pre-existing entries at lines 40/43/46/49) and `34.4.1-VERIFICATION.md`'s live-gate-summary array (4
pre-existing entries at lines 130/133/136/139). The unscoped grep therefore reports 7 and 5
respectively instead of 3 and 1.

**Verified correct by hand instead of fixing the script** (this is a plan-authored verify command,
not project source — out of scope to edit): scoping the same grep to the `human_verification_relocated:` ..
`human_verification_resolved:` line range in each file confirms exactly 3 `outcome:` keys in
`34.1-VERIFICATION.md` and exactly 1 in `34.4.1-VERIFICATION.md`, matching the plan's own `<done>`
criteria ("Three `outcome:` keys in 34.1 (two new plus `260925-r8j`'s gamepad one), one in
34.4.1"). No file content was changed to work around this; the verify command in the plan text is
simply unscoped and this note records why its raw output should not be read literally.
