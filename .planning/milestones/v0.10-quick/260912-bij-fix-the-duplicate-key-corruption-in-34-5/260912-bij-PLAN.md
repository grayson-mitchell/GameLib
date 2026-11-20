---
phase: quick-260912-bij
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md
autonomous: true
requirements: []
baseline_head: 8c3eb8ffc

must_haves:
  truths:
    - "Item 18 of 34.5-UAT.md carries exactly one `blocked_by:` and exactly one `reason:` key"
    - "The surviving pair is `blocked_by: prior-phase` with the travelled-to-34.6 narrative body"
    - "`audit-uat` output is byte-identical to baseline (the file stays suppressed; this fixes the RECORD, not the visibility)"
    - "No text is lost: the diff is exactly 0 insertions, 2 deletions"
  artifacts:
    - path: ".planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md"
      provides: "Item 18 with a single, correct blocked_by/reason pair"
      contains: "blocked_by: prior-phase"
  key_links:
    - from: "34.5-UAT.md item 18"
      to: "uat.js:158 first-match-wins `reason:` reader"
      via: "single unambiguous key pair"
      pattern: "blocked_by: prior-phase"
---

<objective>
Delete the two orphaned keys at `34.5-UAT.md` lines 640-641 (`blocked_by: other` and an empty-bodied
`reason: |`) so item 18 carries exactly one `blocked_by`/`reason` pair.

Purpose: `audit-uat`'s body reader is an unanchored first-match-wins regex
(`blockText.match(/reason:\s*(.+)/)`, `uat.js:158`). With the duplicate present it would bind
`blocked_by: other` and the empty `reason`, silently dropping the true `prior-phase` disposition.
Item 18 is the only duplicate-key instance in any UAT file in the repo.

Output: a two-line deletion, committed with explicit pathspecs.
</objective>

<provenance>
**This is a pure DELETION, not a restoration. No text is missing.**

Commit `b8b2eaa96` ("reconcile UAT rows with the fifth blocking live gate") moved the original
`reason` body to a new `history_third_run:` key, added the `blocked_by: prior-phase` pair, and left
the old pair stranded above it. At both `0199a842c` (introduction) and `b8b2eaa96^` there was exactly
one `blocked_by`/`reason` pair with a non-empty body. The original narrative is intact under
`history_third_run:`. Do not attempt to "recover" a body into line 641 — there is nothing to recover.
</provenance>

<scope_fence>
**This fix does NOT make item 18 visible to `audit-uat`, and the SUMMARY must say so.**
`34.5-UAT.md` stays fully suppressed by its 23 body `expected: |` blocks — `parseUatItems`'
`testPattern` requires `expected:` inline with `result:` on the next line. **The repair fixes the
RECORD, not the visibility.** Any claim of restored visibility is false and is forbidden in the
SUMMARY.

**DO NOT flatten `expected: |` at line 637, or any other block scalar anywhere in the file.** That
sweep was measured and deliberately declined in quick `260912-9v7`: flattening body `expected:`
blocks would regress `uat render-checkpoint`, which handles them correctly today. Flattening is out
of scope.

**Do NOT touch `ROADMAP.md` or `STATE.md`** — the orchestrator owns those.
</scope_fence>

<context>
@./CLAUDE.md

Target region at baseline `8c3eb8ffc` (verified byte-exact):

```
636|### 18. GATE ITEM 1 — Epic login from scratch, populated library
637|expected: |
638|  A real Epic login completes from a signed-out state and produces a non-empty library.
639|result: blocked
640|blocked_by: other          <-- ORPHAN, delete
641|reason: |                  <-- ORPHAN (empty body), delete
642|blocked_by: prior-phase    <-- KEEP
643|reason: |                  <-- KEEP (its body is the travelled-to-34.6 narrative)
```
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete the orphaned blocked_by/reason pair from item 18</name>
  <files>.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md</files>
  <action>
    Capture the `audit-uat` baseline FIRST, before editing:
    `gsd-sdk query audit-uat > "$SCRATCH/audit-before.txt"` (use the session scratchpad, not `/tmp`).

    Then use the Edit tool to delete exactly the two lines `blocked_by: other` and the immediately
    following `reason: |` that sit between `result: blocked` (639) and `blocked_by: prior-phase`
    (642). Anchor the edit on the surrounding lines so it cannot match elsewhere — `result: blocked`
    above and `blocked_by: prior-phase` below are both part of the unique anchor.

    Change nothing else. Do not reflow, re-indent, or flatten any block scalar. Do not add a
    trailing note, marker, or comment to the file.
  </action>
  <verify>
    <automated>
UAT=.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md
SCRATCH="${SCRATCH:?set SCRATCH to the session scratchpad}"
set -e

# 1. Key counts scoped to item 18 only. Programmatic — never score this by reading a rendered cat.
ITEM18=$(awk '/^### 18\./{f=1} /^### 19\./{f=0} f' "$UAT")
R=$(printf '%s\n' "$ITEM18" | grep -c '^reason:')
B=$(printf '%s\n' "$ITEM18" | grep -c '^blocked_by:')
[ "$R" = "1" ] || { echo "FAIL reason=$R expected 1"; exit 1; }
[ "$B" = "1" ] || { echo "FAIL blocked_by=$B expected 1"; exit 1; }

# 2. The SURVIVOR is the prior-phase pair, and its body is intact.
printf '%s\n' "$ITEM18" | grep -q '^blocked_by: prior-phase' || { echo "FAIL wrong survivor"; exit 1; }
printf '%s\n' "$ITEM18" | grep -q 'TRAVELLED TO PHASE 34.6' || { echo "FAIL narrative lost"; exit 1; }
printf '%s\n' "$ITEM18" | grep -q '^history_third_run:' || { echo "FAIL history_third_run lost"; exit 1; }

# 3. Diff is exactly 0 insertions, 2 deletions, one file.
git diff --numstat -- "$UAT" | grep -qx "0	2	$UAT" || { echo "FAIL numstat: $(git diff --numstat -- "$UAT")"; exit 1; }

# 4. Pre-registered post-condition: audit-uat output BYTE-IDENTICAL to baseline.
#    The file is suppressed in both states, so ANY change here is a STOP, not a pass.
gsd-sdk query audit-uat > "$SCRATCH/audit-after.txt"
diff "$SCRATCH/audit-before.txt" "$SCRATCH/audit-after.txt" || { echo "STOP: audit-uat output changed"; exit 1; }

# 5. Planning gates were 10/10 at baseline 8c3eb8ffc; they must still be 10/10.
pnpm planning-gates

echo OK
    </automated>
  </verify>
  <done>
    Item 18 has `reason=1, blocked_by=1`; survivor is `blocked_by: prior-phase` with its narrative
    and `history_third_run:` intact; `git diff --numstat` is `0 2` for the single UAT path;
    `audit-uat` output is byte-identical to the pre-edit baseline; `pnpm planning-gates` is 10/10.
  </done>
</task>

</tasks>

<threat_model>
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bij-01 | Tampering | `34.5-UAT.md` record integrity | mitigate | Edit is anchored on `result: blocked` above and `blocked_by: prior-phase` below; `git diff --numstat` pinned to `0 2`; `history_third_run:` body asserted present |

No package installs, no code paths, no network. Planning-doc deletion only.
</threat_model>

<commit>
**Explicit pathspecs only. NEVER `gsd-sdk query commit` — it stages the whole tree.**

Three unrelated paths are dirty at baseline and must stay uncommitted and unmodified:
- `.planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md`
- `.claude/skills/archify/`
- `skills-lock.json`

```
git add .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md \
        .planning/quick/260912-bij-fix-the-duplicate-key-corruption-in-34-5/
git commit -m "docs(quick-260912-bij): delete the orphaned blocked_by/reason pair in 34.5-UAT item 18"
git show --name-only --format= HEAD
```

The `git show` file list must contain ONLY `34.5-UAT.md` plus this quick directory's own
plan/summary. If any of the three dirty paths appears, the commit is wrong — stop and reset.
</commit>

<success_criteria>
- Item 18 carries exactly one `blocked_by:` and one `reason:`, both from the `prior-phase` pair
- Diff is exactly 0 insertions / 2 deletions in one file
- `audit-uat` output byte-identical before and after
- `pnpm planning-gates` 10/10
- Commit file list verified by `git show --name-only --format= HEAD`; the three dirty paths untouched
- SUMMARY explicitly records that item 18 remains INVISIBLE to `audit-uat` (record fixed, not visibility)
</success_criteria>

<output>
Create `.planning/quick/260912-bij-fix-the-duplicate-key-corruption-in-34-5/260912-bij-SUMMARY.md` when done
</output>
