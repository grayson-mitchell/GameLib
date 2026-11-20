---
quick_id: 260906-vdn
slug: write-41-review-fix-md-recording-the-clo
type: execute
date: 2026-09-06
autonomous: true
files_modified:
  - .planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW-FIX.md

must_haves:
  truths:
    - "Every one of the 8 findings in 41-REVIEW.md carries a disposition sourced from the CURRENT code, not from a plan's claim that it was fixed"
    - "The frontmatter `status:` word is one the extension's ARTIFACT_STATUS map actually recognises -- an unmapped word is DROPPED, leaving the badge uncoloured"
    - "`status:` reads `all_fixed` only if all 8 are genuinely closed; otherwise `partial` with every open finding named in `outstanding:`"
    - "41-REVIEW.md's own `status: issues_found` is NOT edited -- it is stale by design"
    - "The badge flip is MEASURED by replaying the real extension parser, not assumed"
  artifacts:
    - path: ".planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW-FIX.md"
      provides: "The fix-pass sibling that lets reviewStatus() report where the review now stands"
---

<objective>
Write `41-REVIEW-FIX.md` — the fix-pass sibling that records where each of `41-REVIEW.md`'s
eight findings now stands.

Purpose: `41-REVIEW.md` is painted **red** in the file explorer. That is not a git state and not
a linter — it is the `gsd-phase-status` VS Code extension's `reviewStatus()` returning `blocked`
because the review declares `findings.critical: 3` and **no `-REVIEW-FIX.md` sibling exists** to
say those criticals were ever addressed. The signal means "a critical was found and nothing in
the planning tree records it being addressed", which is currently a true statement about the
tree and a false statement about the code.

This task changes no behaviour and touches no source. It adds one planning document.
</objective>

<critical_context>
**The mechanism, read from the extension's own source** at
`~/.vscode/extensions/gsd-phase-status/parse.js`:

- `folderArtifactStatuses()` (`:~350`) scans the phase folder for ANY file whose
  `artifactKind()` is `REVIEW-FIX.md`, takes its raw `status:` as `fixValue`, and passes it to
  every `REVIEW.md` in the folder.
- `reviewStatus(fm, fix)` (`:220`): **if a fix value exists it, not the review, decides** —
  `return artifactStatus(fix) || 'inprogress'`. With no fix pass, `findings.critical > 0`
  returns `blocked`.
- `artifactKind()` matches `name === kind || name.endsWith('-' + kind)`, so the file **must** be
  named exactly `41-REVIEW-FIX.md`.

**The vocabulary is closed and unmapped words are silently DROPPED** (`ARTIFACT_STATUS`,
`:157`). `artifactStatus()` lowercases and maps `_`/space to `-`, and `statusWord()` keeps only
the first token. Recognised:

| Intent | Accepted words |
|---|---|
| complete (green) | `complete` `completed` `done` `approved` `validated` `audited` `verified` `secured` `passed` `pass` `all_fixed` `fixed` `resolved` `warnings_resolved` `closed` `shipped` `ready` `accepted` `signed_off` |
| in-progress (yellow) | `partial` `testing` `diagnosed` `in_progress` `executing` `active` `wip` `started` `running` `issues_found` `gaps_found` `open` |
| blocked (red) | `failed` `fail` `error` `broken` `needs_fix` `regressed` |

Anything else returns `null` and the artifact goes **uncoloured**, which is worse than red
because it looks like an unrecognised file rather than an open gate.

**MEASURED BASELINE (orchestrator, replaying the real parser against the real folder):**

```
blocked      REVIEW.md        41-REVIEW.md
complete     VERIFICATION.md  41-VERIFICATION.md
--- folder rollup inputs: ["blocked","complete"]
```

**Do NOT "fix" this by editing `41-REVIEW.md`.** Its `status: issues_found` is stale by design
and is never rewritten when fixes land — 32 of 37 review files in this tree still say it. The
sanctioned remedy is the sibling, which takes precedence.

**Model the format on the three existing fix ledgers**, especially
`.planning/phases/34.9-.../34.9-REVIEW-FIX.md` — frontmatter (`phase`, `review`, `status`,
`findings_total`, `findings_fixed`, `outstanding`), a "Why this file exists" section, then a
disposition table with a per-finding **Evidence** column citing file:line and/or commit sha.

**Standing bans in force (a concurrent Claude session may be live on this branch):**
- NEVER `git stash` in any form. `stash@{0}` is not yours.
- NEVER `git add -A` / `git add .` / `git commit -a`. Stage by explicit path, verify with
  `git diff --cached --name-only`.
- NEVER `git checkout -- <path>` — a post-checkout hook fires a binary download and throws.
- NEVER run `gsd-sdk state.*` / `roadmap.*` / `phase.complete` — they corrupt STATE.md and
  ROADMAP.md. The orchestrator owns those files; leave them untouched.
- NEVER import `meta/genI18nGateScope.ts` or run `pnpm gen-i18n-gate-scope` — no require.main
  guard; importing overwrites `meta/i18nForkTouchedFiles.json`.
</critical_context>

<task id="1" name="Establish each finding's TRUE disposition from the current code">
  <read_first>
    - .planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW.md — all 8 findings
    - .planning/phases/41-.../41-06-SUMMARY.md and 41-07-SUMMARY.md
    - .planning/phases/41-.../deferred-items.md
  </read_first>
  <action>
  The review has 8 findings: CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, IN-01, IN-02.

  For EACH one, open the code it names and decide the disposition **from what is there now**.
  A plan or summary claiming a fix is a lead, not evidence — the previous phase already had an
  executor stall after committing, and a summary can be right while the record is wrong.

  Known leads (VERIFY, do not copy):

  | Finding | Lead |
  |---|---|
  | CR-01 corrupt English catalog crashes the run instead of a named hard failure | `46b8693df` fix(41-06) — look for the `corruptEnglishNamespaces` set and the `missingPairs()` try/catch in `meta/lintTranslations.ts` |
  | CR-02 `comparePresenceBaseline` silently no-ops on a non-canonical `localesPath` or absent baseline | `ce95fb576` fix(41-06) — every skip should now emit a named `findings` entry |
  | CR-03 CLI guard's justification comment is empirically false | `2ac88fcf6` fix(41-07) — the `require.main === module && !process.env.JEST_WORKER_ID` guard and its rewritten comment |
  | WR-01 R5 "import purity" test cannot detect removal of the guard it is named for | `2ac88fcf6` fix(41-07) — R5 rewritten; the plan claims it was RED-proved |
  | WR-02 `isKeyDefaultTupleElement`/`isKeyDefaultObjectProperty` exempt by structural shape alone | no lead — likely OPEN |
  | WR-03 `readCatalog()` treats every read failure as "catalog absent" | partially entangled with CR-01's fix — read it and decide |
  | IN-01 `totalPairs` is documentary and unenforced | no lead — likely OPEN |
  | IN-02 point-in-time numbers baked into a long-lived header comment | no lead — check whether the fill (`68348932e`) left them stale |

  Record for each: FIXED / OPEN / SUPERSEDED, plus the file:line or commit that proves it.

  **Report the tally before writing anything.** If any finding is OPEN, say so plainly — a fix
  ledger that quietly drops a finding is the exact failure this artifact exists to prevent.
  </action>
  <acceptance_criteria>
    - All 8 findings have a disposition backed by a file:line or commit sha you personally read
    - Any finding whose lead does NOT hold up in the current code is reported as OPEN, not FIXED
    - No source file is modified by this task
  </acceptance_criteria>
  <commit>none — investigation only, fold into task 2's commit</commit>
</task>

<task id="2" name="Write 41-REVIEW-FIX.md and MEASURE that the badge flips">
  <read_first>
    - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-FIX.md — the format to follow
  </read_first>
  <action>
  Write
  `.planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW-FIX.md`:

  - Frontmatter: `phase:`, `review: 41-REVIEW.md`, `status:`, `findings_total: 8`,
    `findings_fixed: <n>`, `outstanding: [<ids>]`.
  - `status:` is `all_fixed` **only if** all 8 are closed. If any is open, use `partial` — it
    maps to in-progress (yellow), which is honest and still clears the red.
  - A "Why this file exists" section explaining the `reviewStatus()` pairing, so the next reader
    does not try to fix a red review by editing the review.
  - A disposition table: Finding | Severity | Disposition | Evidence.
  - Name explicitly that this file changes no behaviour and touches no code.

  Then **prove the badge actually flips.** Copy the orchestrator's replay harness from
  `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/13be41c9-ca27-4559-b0f1-3da1fbdef1a2/scratchpad/badge-keep.cjs`
  and run it as a SEPARATE tool call after the write (never chained onto the write — a
  `&&`-chained read after a file write has read stale in this repo before):

      node <scratchpad>/badge-keep.cjs ".planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-"

  Expected: the `41-REVIEW.md` line moves off `blocked`. **If it still says `blocked`, or if
  `41-REVIEW-FIX.md` does not appear in the output at all, the status word was not recognised —
  fix the word, do not rationalise the result.**

  Report the before/after lines verbatim.
  </action>
  <acceptance_criteria>
    - `41-REVIEW-FIX.md` exists in the phase 41 folder with the exact name
    - The replay harness lists `41-REVIEW-FIX.md` (proving `artifactKind()` matched it)
    - The `41-REVIEW.md` line is no longer `blocked`, and the new value is quoted verbatim
    - `git status --porcelain` shows ONLY the new file (plus anything a concurrent session owns —
      name it, do not stage it)
    - `git diff --cached --name-only` before committing lists exactly one path
  </acceptance_criteria>
  <commit>docs(260906-vdn): record the phase 41 review fix pass</commit>
</task>

<task id="3" name="Write the SUMMARY">
  <action>
  Write `SUMMARY.md` in this quick task's directory recording:
  - The disposition tally you MEASURED (fixed / open, by id)
  - The before and after badge lines, verbatim
  - The `status:` word chosen and why

  Do NOT touch `.planning/STATE.md` or `.planning/ROADMAP.md` — the orchestrator owns those.
  </action>
  <acceptance_criteria>
    - SUMMARY.md exists and every number in it came from a measurement, not an inference
    - `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` is EMPTY
  </acceptance_criteria>
  <commit>docs(260906-vdn): summarise the phase 41 review fix pass</commit>
</task>

<verification>
- `node <scratchpad>/badge-keep.cjs .planning/phases/41-...` — `41-REVIEW.md` is not `blocked`
- `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` — EMPTY
- `git diff --stat aff7ddf75..HEAD -- src/ meta/ public/` — unchanged by this task
</verification>
