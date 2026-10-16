---
phase: 35-electron-cutover-remove-the-electron-build
plan: 02
subsystem: qa
tags: [d-18, ab-retest, electron, tauri, observation-only, uat, cookies, keyring, dialogs]

# Dependency graph
requires: []
provides:
  - "35-AB-RETEST.md — the D-18 A/B observation record: 7 items x 2 shells, every Observed and Verdict field filled, captured while BOTH shells still build"
  - "Item 3 (openDialog 60s INVOKE_TIMEOUT) confirmed TAURI-ONLY and meeting its pre-written BLOCKS D-16 GATE severity call — the one item to be carried into plan 35-19's gate document"
  - "Item 4 (winetricksInstall) narrowed: the cursor does not change over the row until Tab moves focus, which points AWAY from the recorded unmount-on-mousedown theory"
  - "Item 7 (Epic logout) re-characterised: Plan 23's false-report defect is FIXED and confirmed live; the live defect is an INCOMPLETE domain-scoped clear that current instrumentation cannot see"
  - "Addendum A-1..A-5 — five findings outside the seven, including a shared-code rsync failure that survives the cutover"
affects: [35-06, 35-08, 35-09, 35-10, 35-11, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Independent out-of-band measurement of a subsystem's own self-report (sqlite3 on the Chromium cookie store; a hand-written binarycookies page-table parser on the WKWebView jar) — the self-report is the thing under suspicion and cannot be its own witness"
    - "Preserve the rotating log to a stable name at the END OF EACH LEG, before the next launch destroys it"
    - "Verify an item's PRECONDITION was met before scoring its observation — a pass over an unreached surface is not a negative result"

key-files:
  created:
    - .planning/phases/35-electron-cutover-remove-the-electron-build/35-AB-RETEST.md
    - .planning/todos/pending/2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md
  modified: []

key-decisions:
  - "Item 1 verdict BOTH, not NEITHER: the user-visible vanish reproduced on neither shell, but the `stale nonAvailableGames entry` probe the item nominates as its evidence fired on ALL SIX uninstalls across both shells. Shared code, so it survives the cutover."
  - "Item 2 verdict NOT ATTEMPTED, not NEITHER: installed.json has an mtime four days before the run and was untouched on both legs, so the in-memory map could not go stale and the symptom had no opportunity to arise. Both a populated save path AND the absent watcher line are non-evidence without a stimulus."
  - "Item 3 verdict TAURI-ONLY and BLOCKS D-16 GATE — carried forward to plan 35-19. Drop line `response for unknown/timed-out id=4465 (dropped)` observed; LONG_RUNNING_CHANNELS re-derived at this commit (12 entries, openDialog absent) rather than trusted from the todo."
  - "Item 3 correction to the source: the todo says these flows die SILENTLY. They do not — a misleading user-visible 'failed to install' appeared for a move operation, which is arguably worse for diagnosis than silence."
  - "Item 4 verdict TAURI-ONLY, and it kills the source's leading theory as a sole explanation: a shared-frontend MUI Dialog fault predicts BOTH shells fail, but Electron passed on the mouse path. The cursor not changing implies the element is not HIT-TESTED, which is distinguishable from unmount-on-mousedown."
  - "Item 5 verdict NOT ATTEMPTED: the Tauri tray exists but carries exactly two items (Show GameLib / Quit) with an explicit source comment excluding About; showAboutWindow has zero frontend callers. A near-miss was caught — the v0.70 release-notes surface is the CHANGELOG, not the About window, and scoring it would have produced a false PASS."
  - "Item 6 verdict BOTH from sub-item (a); sub-item (b) is TAURI-ONLY INVERTED — the path-rejection dialog is PRESENT under Tauri and ABSENT under Electron, the only surface in the document where Tauri is better. 34.6-19's fix landed sidecar-side only."
  - "Item 7 verdict TAURI-ONLY for an INCOMPLETE clear. The recorded symptom (reports N, removes 0) did NOT reproduce — Plan 23's post-removal delta is honest. EPIC_SESSION_AP is measured ABSENT, so the pre-written severity call's stated mechanism is falsified; six live epicgames.com cookies survive. Flagged for operator decision rather than mechanically escalated or silently downgraded."
  - "D-09 constraint established for plan 35-09: the Tauri jar holds 62 live cookies shared across Humble/GOG/Amazon/Epic, so a wholesale webview-data delete is NOT the equivalent of Electron's per-partition wipe and would sign the user out of three other stores."

requirements-completed: [REQ-35-15]

# Metrics
duration: ~3h45m (operator-driven, two shells in sequence)
completed: 2026-08-28
---

# Plan 35-02 — D-18 A/B re-test across both shells

## What this plan did

Ran every parked bug and folded todo against **both** shells while both still build, and wrote down
which reproduce where. Fixed nothing. The window for this measurement closes permanently at plan
35-14, when `src/backend/main.ts` is deleted and "does this reproduce under Electron?" becomes
unanswerable.

Task 1 (autonomous) authored the protocol. Task 2 was a **blocking human-verify gate**, driven by
the operator across an Electron leg (`pnpm start`) and a Tauri leg (`pnpm tauri:dev`), in sequence,
never concurrently. Both legs are DEV builds and the document says so — these observations carry no
evidence about the packaged artifact.

## Verdicts

| # | Item | Verdict | Blocks D-16? |
|---|---|---|---|
| 1 | Uninstalled game vanishes | `BOTH` (instrumented condition, 6/6) | pre-call says yes; see note |
| 2 | `installed.json` watcher | `NOT ATTEMPTED` | no |
| 3 | `openDialog` 60s timeout | **`TAURI-ONLY`** | **YES — carried to 35-19** |
| 4 | `winetricksInstall` mouse path | `TAURI-ONLY` | no |
| 5 | About window reachability | `NOT ATTEMPTED` | no (known accepted gap) |
| 6 | Dialog styling (a)+(b) | `BOTH` / (b) `TAURI-ONLY` inverted | no |
| 7 | Epic logout cookie clear | `TAURI-ONLY` (incomplete clear) | mechanism falsified — operator decision |

**Only Item 3 is carried forward to plan 35-19's gate document as meeting its pre-written blocking
severity call.** Item 1's pre-written call also says BLOCKS, but its verdict rests on the
instrumented condition rather than the user-visible symptom, which reproduced on neither shell.
Item 7's pre-written call names a surviving `EPIC_SESSION_AP` as the harm, and that cookie is
measured absent.

## Process failures inside this plan, recorded because they nearly changed the output

**Three of the first five items would have been scored wrongly**, and all three errors were the
orchestrator's rather than the operator's — in each case an accurate operator observation was
promoted to a verdict without checking the evidence the item itself nominated.

- **Item 1** was first recorded `NEITHER` from the visual report alone. The named log probe had
  fired on all six uninstalls. The Electron log survived to prove it by **one app launch**; the file
  rotates on every start and `.old` is overwritten by the next.
- **Item 2** was first recorded "DID NOT REPRODUCE ... confirms the source's mechanism claim from
  the working side". The precondition (a legendary write to `installed.json`) had not occurred in
  four days, so nothing was tested and the pass cited itself as confirmation.
- **Item 5** nearly went wrong in the opposite direction: a surface reading v0.70 with clickable
  release notes was nearly scored as the About window. `about.html` is four lines and contains no
  release notes.

Each correction is recorded IN PLACE next to the wrong reading rather than overwritten. Two
predictions the document made before observing were also falsified and left standing with the
correction beside them (Item 6(b)'s "BOTH by construction"; Item 4's shared-frontend theory).

## Deviations

- **The plan's own arithmetic is off by one.** Its prose says "7 sections" while its `<interfaces>`
  block names 8 item groups, and its verify script hard-requires exactly 7. Resolved in Task 1 by
  merging EOS-remove and path-rejection into Item 6 with four sub-item `Observed:` fields. Nothing
  was dropped; the merge was forced, not chosen.
- **The `GAMELIB_DEV_SECRET_VAULT=1` restart did not take** (Addendum A-4). Verified via `ps eww`
  and the absent install banner. This cuts favourably: the Tauri leg ran on the REAL Keychain path,
  so `U-34.5-01`'s bar does not apply to it.
- **Item 7 has a stated measurement limitation:** no BEFORE snapshot of the Tauri cookie jar was
  taken (Electron got one), so the "cleared 9" figure is corroborated by consistency rather than
  verified as a delta. The after-state is independently established.
- **Per the orchestrator's standing instruction for this phase, STATE.md and ROADMAP.md were not
  touched and no `gsd-sdk` `state.*` / `roadmap.*` / `phase.complete` verb was invoked.**

## Evidence

- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-AB-RETEST.md`
- `~/Library/Logs/GameLib/gamelib.log.35-02-ab-electron`
- `~/Library/Logs/GameLib/gamelib.log.35-02-ab-tauri-part1`

## Self-Check: PASSED

- 7 `## Item ` sections, 0 blank `Observed:` fields, 0 blank `Verdict:` fields (verified by script).
- `git status --porcelain -- src src-tauri meta package.json` empty — zero production source
  modified, as an observation-only plan requires.
- All redaction obligations met (T-35-04): cookie names, domains and value LENGTHS only; no cookie
  values, no account identifiers.
