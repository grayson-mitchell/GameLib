---
quick_id: 260819-s8p
slug: seed-steam-bottle-name-in-install-modal
date: 2026-08-19
status: complete (code) / conflict on Task 3 commit — see below
closes_gap: G-D05-BOTTLENAME (and its already-FAILED sibling G-ROW-1), CODE ONLY
phase_ref: 34.13-steam-install-time-wine-bottle-form-gog-parity
---

# Quick Task 260819-s8p — Summary

## One-liner

Seeded the Steam install-modal's read-only CrossOver bottle-name field with `DEFAULT_STEAM_BOTTLE_NAME`, gated on `isSteamManagedApp`, and proved the gate RED by hand against the pre-fix shape.

## What changed

1. **`src/frontend/screens/Library/components/InstallModal/index.tsx`** (commit `83866f847`)
   - Imported `DEFAULT_STEAM_BOTTLE_NAME` from `frontend/screens/Game/GamePage/components/steamBottleDefaults`.
   - Inside the existing `showWineSelector` effect, added `if (isSteamManagedApp) { setCrossoverBottle((current) => current || DEFAULT_STEAM_BOTTLE_NAME) }` before the `getWine` declaration.
   - Added `isSteamManagedApp` to the effect's dependency array (`[showWineSelector, isSteamManagedApp]`).
   - The plain non-Steam `hasWine` arm is untouched: `isSteamManagedApp` is `false` there, so the seed block never fires and `crossoverBottle` stays exactly as before (`useState('')`, never written by this effect).

2. **`src/frontend/screens/Library/components/InstallModal/__tests__/installModalBottleSeeding.test.ts`** (new file, commit `0e91e6471`)
   - Comment-stripped source gate (never imports `../index` — `index.tsx` imports `./index.scss` at line 15 and this repo's Frontend jest has no jsdom).
   - 8 specs: seed-present (open-paren call form), dedicated-constant-imported (not locally redefined), shared-bottle-never-seeded with a non-vacuity specimen, Steam-only guard placement with a non-vacuity specimen, read-only preserved (exactly one `bottleNameReadOnly`), and a pre-fix specimen control proving spec 1's matcher goes red on the known-bad shape.
   - All 8 pass against the fixed source.

3. **`.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md`** — edited but **NOT committed**. See "Task 3 conflict" below.

## This closes the gap in CODE ONLY

`G-ROW-1` (electron + tauri, already scored `**FAIL**`) and `G-D05-BOTTLENAME` (electron + tauri, `pending`) remain owed to 34.13's blocking human UAT gate on both runtimes. The fix above is unverified by any live render — this repo's Frontend jest project cannot import or render `InstallModal/index.tsx` (no jsdom, no react-test-renderer; the file imports `./index.scss` as its first import). The previously-scored `G-ROW-1` wine-section observations, and any other wine-section row a developer scores before rebuilding the app on this commit, were made against **pre-fix** code and need re-observation.

## Manual RED proof (performed by hand, no git)

Per the plan's verification requirement, the seed block was reverted **by hand-editing the file directly** (Edit tool, not `git checkout`/`git stash`), the gate suite was run, the failure was observed, and the file was hand-edited back to the fix — verified byte-identical to the committed state via `git diff` (empty output) afterward.

Reverted block (removed):
```
if (isSteamManagedApp) {
  setCrossoverBottle((current) => current || DEFAULT_STEAM_BOTTLE_NAME)
}
```

Observed result running `pnpm jest --selectProjects Frontend --testPathPattern 'installModalBottleSeeding' --verbose`:

```
Tests:       2 failed, 6 passed, 8 total
✕ spec 1 -- the stripped source contains a setCrossoverBottle( CALL (open-paren form)
    expect(received).toBeGreaterThan(expected)
    Expected: > 0
    Received: 0
✕ spec 4 -- the seed sits within an isSteamManagedApp guard (Steam-only, never on the plain hasWine arm)
    expect(received).not.toBe(expected)
    Object.is('', '')
```

Specs 2, 3 (+ non-vacuity), 4-non-vacuity, 5, and 6 stayed green — they check properties (constant import, absence of the shared-bottle name, read-only count, and the pre-fix control itself) that are independent of the seed line, exactly as designed. Specs 1 and 4 — the two that directly assert the seed's existence and placement — correctly went RED. File was then hand-edited back; `git diff` on `index.tsx` after restoration showed **no output** (byte-identical to the committed fix).

## Verification (fixed source)

- `pnpm jest --selectProjects Frontend --testPathPattern 'InstallModal/__tests__' --verbose` — **6 suites, 202 tests, all passed**, including the new `installModalBottleSeeding.test.ts` (8/8) and the pre-existing `installModalSource.test.ts` (unchanged, still green — the `crossoverOnly` zero-occurrence gate at `:272` still passes; that literal token was never introduced).
- `pnpm codecheck` (`tsc --noEmit`) — clean, no output.
- Manual `eslint --rule '{"react-hooks/exhaustive-deps": "error"}'` spot-check on `index.tsx` — no findings (the added `isSteamManagedApp` dependency satisfies the rule; it was not suppressed with a disable comment).

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2. Task 3's conflict (below) was explicitly anticipated and handled per the plan's own instructions, not a deviation.

## Task 3: UAT ledger note — written but conflict prevented committing it

Per the plan's binding instruction, I located the four rows by `grep -n` (not by trusting the plan's estimated line numbers) and appended a short, clearly-labelled note to the **Observation** cell of each:

- `G-ROW-1` electron (line 141 at time of edit)
- `G-ROW-1` tauri (line 142)
- `G-D05-BOTTLENAME` electron (line 172)
- `G-D05-BOTTLENAME` tauri (line 173)

Each note records: **FIX LANDED `83866f847` (quick 260819-s8p) — code change, NOT a runtime observation**; the one-sentence description of the change; a mid-gate integrity warning that any wine-section observation predating this commit needs re-observation on a rebuilt app; and, on the two tauri rows, a restatement of ground rule 2 (runtime-independent React state invites an inferred PASS — an independent observation is still required).

**Verified before attempting to commit:**
- All four edited rows still parse as 5 pipe-delimited cells (`awk -F'|'` gives 7 fields on each, matching an untouched control row).
- Disposition counts unchanged by my edit: `**FAIL**` count is 2 both before and after (my edit changed no Disposition — only appended to Observation cells).
- `## Gaps` `status: failed` untouched (still present, unedited).
- No row's Disposition value was touched; no `resolved` status was written anywhere.

**Could not commit — conflict surfaced rather than absorbed.** The working tree's `34.13-UAT.md` already carried a **concurrent, actively-running UAT session's** uncommitted edits (confirmed via `git diff` before I touched the file: a resume-block rewrite at `@@ -37,12 +37,18 @@` recording progress at "row 17 of 72" plus a new scoring-rule paragraph, and a `G-ROW-3` tauri row flipped from `pending` to `PASS` with a full observation). My four edits land in a different part of the file (lines ~141-173) and do not textually overlap those hunks, but staging the whole file for commit would still bundle both sets of changes into one commit under my authorship — exactly what the plan forbids ("if `git diff --cached` shows hunks you did not author, unstage that file... reporting the conflict rather than absorbing someone else's work. Do not try to separate the hunks yourself.").

I staged the file, confirmed via `git diff --cached | grep '^@@'` that the concurrent session's `@@ -37,12 +37,18 @@` hunk was included, and then ran `git reset HEAD -- <file>` (a safe unstage, not a revert) to back it out of the index. **The file was NOT committed.** My four Observation-cell notes remain in the working tree, uncommitted, alongside the concurrent session's own uncommitted progress. Nothing was reverted, discarded, stashed, or checked out.

**Resolution owed:** whoever next commits `34.13-UAT.md` (the concurrent live-UAT session, or a follow-up quick task once that session's own work lands) will naturally pick up both sets of changes together in one commit — my notes are purely additive to Observation cells and do not conflict at the text level with the concurrent session's edits. No manual reconciliation of content is needed, only of *authorship/sequencing* of the commit itself.

## Self-Check

```
FOUND: src/frontend/screens/Library/components/InstallModal/index.tsx
FOUND: src/frontend/screens/Library/components/InstallModal/__tests__/installModalBottleSeeding.test.ts
FOUND commit 83866f847 in git log
FOUND commit 0e91e6471 in git log
```

`git status --short` at completion:
```
 M .planning/STATE.md
 M .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
?? .planning/quick/260819-p2d-uat-3413-bottle-prefill-note/
?? .planning/quick/260819-s8p-seed-steam-bottle-name-in-install-modal/
```
`.planning/STATE.md` and `.planning/quick/260819-p2d-uat-3413-bottle-prefill-note/` are exactly as found at task start — untouched. `34.13-UAT.md` carries both the concurrent session's pre-existing edits and my four new notes, none committed.

## Self-Check: PASSED
