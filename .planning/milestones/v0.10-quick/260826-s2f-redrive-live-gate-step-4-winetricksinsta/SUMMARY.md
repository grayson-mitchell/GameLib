---
quick_id: 260826-s2f
status: complete
completed: 2026-08-26
files_modified:
  - .planning/phases/34.6-.../34.6-LIVE-GATE.md
  - .planning/phases/34.6-.../34.6-UAT.md
  - .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md
---

## Outcome

**Step 4 re-drive: PASS.** Both conjuncts of its original condition met — 0
`UNPORTED_CHANNEL_MARKER`, and the D-11 observable fired
(`[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` → `winetricks -q comctl32ocx`), which is the
conjunct run 1 failed on.

Contract was authored EMPTY-FIRST (`bccbe2eac`) and driven only afterwards, per D-12. Verified by
diff that the closed frontmatter and Step 4's original Result text were byte-unchanged by the
amendment.

`comctl32ocx` was chosen deliberately over `corefonts`: the prefix already held the corefonts set
from the earlier UAT run, so re-picking one risked a no-op that would not have exercised the
channel.

## Operator decision

Accepted the PASS, attributed run 1's failure to the temperamental selection UI, elected to move on.
**`verdict: FAIL 7/9` and `failing_items: [4, 8]` LEFT UNCHANGED** — the document's standing rule
(set at closure under option (c)) is that no SUPERSEDES re-scopes a failing item out of the verdict,
and "move on" was not read as waiving it. Nothing is blocked: verification run 2 already returned
`passed` independently, and Step 8 remains a genuine failure, so the verdict would not have become
clean even had Step 4 been flipped.

## Two corrections made, both to my own prior output

1. **`34.6-UAT.md` test 5's cause was wrong.** It offered the operator's "same 7z message" testimony
   as evidence the original gate ran dependency-less. Step 4's own record refutes it: "Operator
   clicked Install on a real `corefonts` result row" — the list WAS populated in run 1, and the
   "Open Winetricks GUI" button logged normally in that same run. Wrong in the direction that made
   the dependency story look stronger. Test 5's PASS is unaffected; only the cause is retracted.
2. **The UI todo the operator believed existed did not.** A search of `pending/` and `completed/`
   found only the `winetricksInstall` IPC-defect todo and, separately, today's path-rejection dialog
   styling todo — neither covers the selection behaviour. Filed
   `2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`. Without it, the
   cause identified during this re-drive would have gone unowned, which is the whole value the
   re-drive produced.

## What remains unproven

The selection-UI attribution is plausible and fits the parked todo's measured narrowing to (B) — a
row that renders but is not selected is consistent with every one of that todo's eight exclusions at
once. It is still NOT a measured cause: no instrumented run has captured the failing and succeeding
interactions side by side, and two prior explanations for this defect were already disproven. The
gate section and the new todo both say so explicitly.
