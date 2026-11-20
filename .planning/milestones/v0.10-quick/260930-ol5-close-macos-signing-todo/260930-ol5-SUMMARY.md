---
quick_id: 260930-ol5
slug: close-macos-signing-todo
date: 2026-09-30
status: complete
mode: inline
---

# Quick Task 260930-ol5 — close the macOS signing/notarization todo

## What was done

Closed `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` on the strength of
`## STATUS 2026-09-30 (quick-260930-nt4)`'s measured Keychain ACL result:

1. Frontmatter `status: OPEN` -> `status: RESOLVED`. `severity: minor`, `platform: macos` and
   `ready: human` deliberately left STALE.
2. Added a terminal `## CLOSED 2026-09-30 (quick-260930-ol5)` section naming the two things that
   become untracked by closing.
3. `git mv` from `.planning/todos/pending/` to `.planning/todos/completed/`, same filename.

## Why it ran inline rather than through planner + executor subagents

The change is a rename plus one frontmatter line plus a short prose stamp, and every trap was
already enumerated before starting (the split-rename staging bug, the gate-before-add ordering, the
ragged `status:` vocabulary). Two further subagent round-trips would not have improved accuracy.
Artifacts are the same: this SUMMARY, an atomic commit, and a STATE.md row. Declared rather than
done silently.

## Traps handled, each from a recorded prior failure

- **Single commit naming BOTH pathspecs.** `quick-260930-ivj` split exactly this rename across two
  commits by naming only the destination, leaving the delete side staged and needing a follow-up fix
  commit (`7e3394a24`). `quick-260930-juy` then landed it correctly as one `R100`. This task staged
  `git mv` + `git add` and ran the gates only AFTER staging, because an unstaged rename crashes them.
- **`status: OPEN` was NOT uniquely targetable.** A `grep -n '^status: OPEN'` returned exactly one
  line, but the Edit tool refused with 2 matches: line 737 carries the string inside backticked prose
  (`Recommend moving \`status: OPEN\` to ...`), which is a historical record of the recommendation and
  must not change. The edit was re-anchored on the preceding `needs:` line. The column-anchored grep
  was the misleading instrument here, and the tool's refusal is what caught it.
- **`RESOLVED` is a plurality, not a schema.** Measured across `completed/` at closure time: 48
  `RESOLVED`, 31 `completed`, 25 `CLOSED`, 11 `OPEN`, 6 `resolved`, 2 `complete`, 3 with prose
  appended. A `status: OPEN` census over `completed/` was already wrong by 11 beforehand.
- **No `prettier --check`.** The path is under `.planning/`, which is prettier-ignored
  (`{ "ignored": true, "inferredParser": null }`), so a green would prove nothing. Wrap width was
  checked by hand instead against the file's 106-byte ceiling: 26 candidate lines in the new section,
  0 over.

## Corrections to figures quoted while setting this up

`pending/` held **16** todos at closure time, not the 18 quoted when the task was framed — the two
other sessions that pushed during this work (`260930-iws`, `260930-lyk`) each closed one. 16 -> 15.

## What closing DROPS

Named in the closure section itself, because neither is tracked anywhere else:

1. `nt4` item 5's three residuals — artifact-level read is an INFERENCE not a measurement; updater
   replace-in-place path untested; no real N -> N+1 release run.
2. The operator errand — the three contaminated Keychain items (`steam-refresh-token`,
   `humble-session`, `humble-csrf` under `com.gamelib.launcher`) are still PRESENT with
   ad-hoc-created ACLs and will each prompt once under a signed release. NOT DONE.

No follow-up todo was created for either. That is an explicit decision left to the operator.

## Verification

- Rename lands as a single `R` entry; no file remains at the old path; no twin in `pending/`.
- Body diff is 27 insertions / 1 deletion, the deletion being the `status:` line.
- No column-0 frontmatter-shaped keys in the body.
- `pnpm planning-gates` 12/12, run with the rename staged.
- The parked sibling `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` was NOT touched.
