---
phase: quick/260813-ssg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/STATE.md
autonomous: true
requirements: [QT-260813-ssg-01]

must_haves:
  truths:
    - "`.planning/STATE.md` contains no claim that a human retest of the Avernum 5 launch is owed"
    - "The Phase 24 closed-phase bullet lists the three real deferred items (D-UAT-24-09, WR-01, D-UAT-24-08)"
    - "The Phase 24 row of the Native-Install Arc Phase Map lists the same deferred items in its own terser register"
    - "Phase 24 is still marked ✅ Complete 2026-07-21 in both places"
    - "No file other than `.planning/STATE.md` is modified"
  artifacts:
    - path: ".planning/STATE.md"
      provides: "Corrected Phase 24 status prose (bullet + phase-map row)"
      contains: "D-UAT-24-08"
  key_links:
    - from: ".planning/STATE.md Phase 24 bullet"
      to: "24-UAT.md RETEST RUN 3 / Summary Table"
      via: "Gate 3 recorded against Avernum 6, not Avernum 5"
      pattern: "Avernum 6"
    - from: ".planning/STATE.md Phase 24 bullet"
      to: "24-REVIEW-FIX.md (status: partial, WR-01 skipped)"
      via: "deferred helper-concurrency item"
      pattern: "24-REVIEW-FIX"
---

<objective>
Correct a stale claim in `.planning/STATE.md` that Phase 24 still owes a "human retest of the
Avernum 5 launch". RETEST RUN 3 (2026-07-21, `.app` rebuilt 19:02 with gap plan 24-17) superseded
it: `24-UAT.md` is `status: complete`, `pending_gates: 0`, and its Summary Table records **Gate 3
PASS against Avernum 6** — not Avernum 5. No Avernum 5 retest is owed anywhere in the planning tree.

Replace the two stale `Remaining:` / `Open:` clauses with the three items that genuinely carry
forward, all deferred/out-of-scope rather than open phase work.

Purpose: STATE.md is the project's status source of truth; a phantom open gate misdirects the next
planning session into re-running hardware UAT that already passed.
Output: Two edited prose regions in `.planning/STATE.md`. No source-code changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

**Scope lock — read before editing:**
- The ONLY file you may modify is `.planning/STATE.md`.
- Do NOT touch `24-UAT.md` or `24-REVIEW-FIX.md`. They are the authoritative sources; STATE.md is
  the thing that drifted.
- Do NOT edit STATE.md's "Quick Tasks Completed" table and do NOT commit — the orchestrator handles
  both separately.
- Locate both edit targets by **content match**, not by line number. STATE.md is large and
  frequently appended; the cited line numbers (~3763-3767, ~3776) will drift.

**Facts already verified against the source docs — do not re-derive, just use them:**

| Fact | Source |
|------|--------|
| `24-UAT.md` frontmatter: `status: complete`, `pending_gates: 0`, `passed_gates: 3`, `failed_gates: 0`, `blocked_gates: 1` | `24-UAT.md:5-11` |
| Gate 3 PASS is **Avernum 6** (206060), reached playable single-player on real HW in RETEST RUN 3 | `24-UAT.md:546-550`, Summary Table row 3 (`:583`) |
| Gate 4 / Hoard BLOCKED **out-of-scope** as D-UAT-24-09; shim+helper cover only ISteamUser + ISteamFriends; Hoard imports 8 bare accessors, aborts on `unimplemented function steam_api.dll.SteamUtils`; HOARD removed from allowlist in commit `30cdda6a`; full coverage needs 6 new interface proxies (ISteamUtils/ISteamApps/ISteamUserStats/ISteamRemoteStorage/ISteamMatchmaking/ISteamNetworking) = follow-on milestone, not a gap cycle | `24-UAT.md:12`, `:552-554`, Summary Table row 4 (`:584`) |
| WR-01 skipped at code-review-fix time; `24-REVIEW-FIX.md` is `status: partial` (7 in scope, 6 fixed, 1 skipped); single-threaded helper serializes a second concurrent bridge game; both the `pthread`-per-connection and `poll()`-multiplexer paths were deferred as unverifiable without live hardware | `24-REVIEW-FIX.md:8-10`, `:21`, `:70-81` |
| D-UAT-24-08 teardown half IS wired — `shutdownBridgeHelper()` is called from `app.on('before-quit')` | `src/backend/main.ts:716-722` |
| D-UAT-24-08 reuse half was never built — no EADDRINUSE / "healthy helper already listening on 127.0.0.1:54550 → reuse instead of spawning a duplicate that FATALs on bind" path exists | `src/backend/storeManagers/steam/bridge/helperProcess.ts` (grep for `EADDRINUSE`/`reuse` returns only in-process handle reuse, `:6`, `:222`) |
| D-UAT-24-08 was never formally dispositioned — its only occurrence in the whole `.planning/` tree is the RETEST RUN 2 finding paragraph | `24-UAT.md:544` |

**Baseline counts in `.planning/STATE.md` before the edit (these make the verify gates non-vacuous —
each gate is proven to fail against the current file):**

```
grep -c 'Avernum 5'    .planning/STATE.md   → 2   (must become 0)
grep -c 'human retest' .planning/STATE.md   → 2   (must become 0)
grep -c 'D-UAT-24-09'  .planning/STATE.md   → 0   (must become 2)
grep -c 'D-UAT-24-08'  .planning/STATE.md   → 0   (must become 2)
```

Note `grep -c 'WR-01'` is already 27 across the file (other phases use the same finding ID), so
WR-01 alone is NOT a usable gate. Use the D-UAT counts.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace the stale "Remaining:" clause in the Phase 24 closed-phase bullet</name>
  <files>.planning/STATE.md</files>
  <action>
Find the closed-phase bullet under the "Closed/parked native-install phases:" heading that begins
`- **Phase 24** (macOS native Steam bridge, out-of-process steam_api proxy) — ✅ Complete`.

Preserve everything up to and including `...the bridge proxies only ISteamUser + ISteamFriends.`
**byte-for-byte** — including the existing `gap cycles 24-11..24-16` text. Do NOT "improve" it to
24-17; that is out of scope for this task and would widen the diff.

Replace ONLY the trailing sentence `Remaining: human retest of the Avernum 5 launch on the rebuilt
.app` with the deferred-items prose below. Keep the surrounding flat-prose register (the neighbouring
Phase 22 bullet is flat prose with bolded labels — do NOT introduce nested sub-bullets), keep the
existing ~90-column wrap and two-space continuation indent, and keep the ✅ Complete marker intact.

Replacement text for that trailing sentence:

    No open phase work — RETEST RUN 3 (2026-07-21, `.app` rebuilt 19:02 with gap plan 24-17) closed
    Gates 2/3 against **Avernum 6**, and `24-UAT.md` is `status: complete` / `pending_gates: 0`.
    Three items carry forward as deferred, not open: **D-UAT-24-09** — Hoard imports 8 bare
    interface accessors and aborts on `unimplemented function steam_api.dll.SteamUtils`; it was
    removed from `bridge-allowlist.json` (`30cdda6a`), and covering it needs 6 new interface proxies
    (ISteamUtils/ISteamApps/ISteamUserStats/ISteamRemoteStorage/ISteamMatchmaking/ISteamNetworking)
    — a follow-on phase, not a gap cycle. **WR-01** — helper concurrency, skipped at
    code-review-fix time (`24-REVIEW-FIX.md` is `status: partial`, 6 fixed / 1 skipped): the
    single-threaded helper serializes a second concurrent bridge game, and the multiplexer rewrite
    was deferred as unverifiable without live hardware. **D-UAT-24-08** — half unimplemented: the
    teardown IS wired (`shutdownBridgeHelper()` from `app.on('before-quit')`,
    `src/backend/main.ts:716-722`), but the recommended second half — detect a healthy helper
    already listening on 127.0.0.1:54550 and REUSE it instead of spawning a duplicate that FATALs on
    bind — was never built (no EADDRINUSE/reuse path in
    `src/backend/storeManagers/steam/bridge/helperProcess.ts`), and it was never formally
    dispositioned in `24-UAT.md`.

Re-wrap that block to match the file's existing width and indentation rather than pasting the
indentation above verbatim. Do not alter any other bullet in the block.
  </action>
  <verify>
    <automated>grep -A14 'Phase 24\*\* (macOS native Steam bridge' .planning/STATE.md | grep -c 'Avernum 5\|human retest'</automated>
  </verify>
  <done>The Phase 24 bullet still opens with `✅ Complete 2026-07-21 (17 plans)`, contains no
  "Avernum 5" and no "human retest", and names D-UAT-24-09, WR-01, and D-UAT-24-08 as deferred
  items. The grep above returns 0.</done>
</task>

<task type="auto">
  <name>Task 2: Replace the stale "Open:" clause in the Native-Install Arc Phase Map row</name>
  <files>.planning/STATE.md</files>
  <action>
Find the phase-24 row of the `## Native-Install Arc Phase Map (21–25)` table — the line starting
`| 24 | macOS native Steam bridge (steam_api proxy) | 17 | 17 | ✅ Complete 2026-07-21`.

Preserve the row byte-for-byte up to and including
`Gate 4 (Hoard) out of scope — bridge proxies only ISteamUser + ISteamFriends.` (again keeping
`24-11..24-16` as-is), then replace ONLY the trailing `Open: human retest of Avernum 5 launch` clause.

This row is a single line and denser than the bullet — do NOT restate the Gate-4 scope fact that the
row already carries, and do NOT paste Task 1's paragraph. Emit a compact clause on one line:

    Gate 3 = **Avernum 6** (RETEST RUN 3, 19:02 rebuild w/ 24-17); `24-UAT.md` `status: complete`, `pending_gates: 0`. Deferred (not open): **D-UAT-24-09** full Hoard support needs 6 more interface proxies (follow-on phase; Hoard delisted `30cdda6a`); **WR-01** helper concurrency skipped at review-fix (`24-REVIEW-FIX.md` partial — single-threaded helper serializes a 2nd concurrent bridge game); **D-UAT-24-08** helper-reuse-on-bind never built (teardown wired at `main.ts:716-722`; no 127.0.0.1:54550 reuse path in `helperProcess.ts`), never dispositioned in `24-UAT.md`

Keep it on ONE physical line so the markdown table does not break, keep the trailing ` |` cell
delimiter, and leave rows 21/22/23/25 untouched.
  </action>
  <verify>
    <automated>grep -c 'Avernum 5\|human retest' .planning/STATE.md; grep -c 'D-UAT-24-09' .planning/STATE.md; grep -c 'D-UAT-24-08' .planning/STATE.md; git -C . diff --name-only</automated>
  </verify>
  <done>First grep prints `0`; the D-UAT-24-09 and D-UAT-24-08 greps each print `2` (one hit in the
  bullet, one in the table row); `git diff --name-only` lists `.planning/STATE.md` and nothing else.
  The table still renders as a 5-column table with rows 21–25 intact.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Doc-only edit to a local planning artifact. No untrusted input, no runtime code path, no network, no credentials touched. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QT-ssg-01 | Tampering | `.planning/STATE.md` | mitigate | Scope-locked to one file; `git diff --name-only` gate in Task 2 fails if any other file changed |
| T-QT-ssg-02 | Information disclosure | corrected prose | accept | Text cites only commit SHAs, localhost port 54550, and repo-relative paths already public in the planning tree — no SteamID64, tokens, or account identifiers introduced |
| T-QT-ssg-SC | Tampering | package installs | accept | No package-manager operation in this plan |
</threat_model>

<verification>
1. `grep -c 'Avernum 5' .planning/STATE.md` → `0` (was `2`).
2. `grep -c 'human retest' .planning/STATE.md` → `0` (was `2`).
3. `grep -c 'D-UAT-24-09' .planning/STATE.md` → `2` (was `0`).
4. `grep -c 'D-UAT-24-08' .planning/STATE.md` → `2` (was `0`).
5. `grep -c '✅ Complete 2026-07-21' .planning/STATE.md` → unchanged (Phase 24 still Complete in both
   the bullet and the table row).
6. `git diff --name-only` → `.planning/STATE.md` only.
7. Visually confirm the `## Native-Install Arc Phase Map (21–25)` table still has 5 columns and 5
   data rows (21, 22, 23, 24, 25).
</verification>

<success_criteria>
- No text anywhere in `.planning/STATE.md` claims an Avernum 5 retest or any human retest is owed.
- Both Phase 24 locations name the same three deferred items (D-UAT-24-09, WR-01, D-UAT-24-08),
  each at the density of its own surrounding context.
- Phase 24 remains ✅ Complete 2026-07-21 in both locations; nothing reopens the phase.
- `.planning/STATE.md` is the only modified file; no commit made by the executor.
</success_criteria>

<output>
Create `.planning/quick/260813-ssg-fix-stale-avernum-5-retest-claim-in-stat/260813-ssg-SUMMARY.md` when done.
</output>
