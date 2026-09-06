# Phase 38: Deferred hardware and environment UAT gates — Windows/Linux machine and game controller - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-06
**Phase:** 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
**Areas discussed:** Dead-item disposition, Close boundary, W04 provenance, Evidence standard

---

## Dead-item disposition

### Q1 — Where do the 9 retired electron items go, so audit-uat stays honest?

| Option | Description | Selected |
|--------|-------------|----------|
| Move to discharged, `result: unscoreable` | Move all 9 into `human_verification_discharged` with an explicit `result: unscoreable` and a `retired_reason` naming Phase 35's Electron removal. Matches `38-C07`'s own pre-written `electron_cutover_risk` decision verbatim. | ✓ |
| New `human_verification_retired` array | A third array so "discharged" keeps meaning "someone observed it". Cleaner semantics, but `audit-uat` has never seen this key. | |
| Delete the 9 items outright | Smallest ledger, but destroys the record that the observation was ever owed. | |

**User's choice:** Move to discharged, `result: unscoreable`
**Notes:** The ledger specified its own disposition before the fact. Coverage was checked before moving on — all 9 Tauri twins (`S02/S04/S06/S08/S10/S12/S14/S16`, `C08`) are open in `human_verification`, so retiring the Electron halves loses no observation.

### Q2 — Does the ledger repair get a plan file, against the ROADMAP's "No plan files" line?

| Option | Description | Selected |
|--------|-------------|----------|
| `38-01-PLAN.md`, and amend the ROADMAP line | Write the repair as a docs-only plan with an atomic commit and SUMMARY, and edit ROADMAP § Phase 38's `Plans: No plan files` bullet to record the exception. | ✓ |
| `38-01-PLAN.md`, leave the ROADMAP alone | Faster, but leaves a locked roadmap statement that is false the moment the plan file lands. | |
| Direct ledger edit via `/gsd-quick` | Honors "No plan files" literally; Phase 38 keeps 0 plans. | |

**User's choice:** `38-01-PLAN.md`, and amend the ROADMAP line
**Notes:** Raised because it contradicted both a locked ROADMAP line and the user's earlier `/gsd-plan-phase` answer. Chosen so the deviation is recorded in both documents rather than drifted into — the same forward/return-half discipline the `38-E03`/`38-E04` ROADMAP entry already uses.

### Q3 — `38-HUMAN-UAT.md` is also stale. Does 38-01 repair it in the same pass?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — repair both in 38-01 | Header says "6 items seeded" (34 today), Scope block says `38-C01 … 38-C05` (now C01–C08), and it asserts the controller items can run on the macOS machine — disproved by the 2x2. | ✓ |
| No — ledger only, file the rest as a todo | Smaller blast radius, but leaves the sitting protocol lying to the next operator. | |

**User's choice:** Yes — repair both in 38-01

---

## Close boundary

### Q1 — A Windows sitting cannot reach the Linux items. How does Phase 38 close?

| Option | Description | Selected |
|--------|-------------|----------|
| Stays open until Linux runs too | One phase, closed once; preserves a single audit-visible backlog but stays open indefinitely if the Linux box is never booted. | |
| Split: 38 keeps Windows+controller, new phase takes Linux | Relocate the Linux-only items so 38 can close on what this machine can reach. Costs a new ROADMAP phase and a relocation receipt. | ✓ |
| Close partially per-host | Close as `gaps_closed_partially` like Phase 40. **Warning surfaced:** this phase's `audit_tool_note` says any status other than `human_needed` makes `audit-uat` emit zero items. | |

**User's choice:** Split
**Notes:** The partial-close option was presented with its own disqualifying warning attached; it would have silently deleted the remaining backlog from the only tool that counts it.

### Q2 — Where do `38-E01`..`E04` (the embed-backend items) go under the split?

| Option | Description | Selected |
|--------|-------------|----------|
| All four leave 38 — to an embed-backend phase | `E01`/`E02` are named unknowns (D-04) requiring Rust work; `E03`/`E04` are downstream of them. Leaves 38 genuinely closable. | ✓ |
| `E01` to the Linux/backend phase, `E03`/`E04` stay | Both have a macOS-testable residue — but that residue is a different question from the one the item asks, which is the shape that got 40-11's PASS mistaken for a close. | |
| All four stay in 38 | Keeps one audit-visible backlog, but makes the split pointless — 38 still could not close after both sittings. | |

**User's choice:** All four leave 38
**Notes:** Raised as a consequence of the split rather than as a standalone question — `38-E01` is nominally Windows, so the split alone would not have removed it, and 38 would have stayed open regardless of host.

### Q3 — How many new ROADMAP phases does the split create, and when?

| Option | Description | Selected |
|--------|-------------|----------|
| Two — Linux collection + embed implementation | Phase 42 (collection, 0 plans, own VERIFICATION.md) and Phase 43 (widen the Cargo.toml cfg gate, then answer E01–E04). Both created in 38-01 **before** any relocation, per the phase's own rule 1. | ✓ |
| One — a single "deferred, off-Windows" phase | Fewer roadmap entries, but mixes a collection phase with an implementation phase — the shape that made E01/E02 confusing in the first place. | |
| Two, created later by `/gsd-phase` | Violates the phase's own rule 1, written after 6 items dangled 9–11 days pointing at a phase nobody had created. | |

**User's choice:** Two — Linux collection + embed implementation

### Q4 — `38-S16` covers BOTH Windows row 5 and Linux row 7. How does it survive the split?

| Option | Description | Selected |
|--------|-------------|----------|
| Split into two items — S16 stays, S17 goes to 42 | Each item gets exactly one host and can close on its own. Matches the S-series' one-item-per-host-per-row shape and relocation rule (4). | ✓ |
| Keep S16 whole in 38 | Simplest edit, but reintroduces the cross-host coupling the split was meant to remove. | |
| Move S16 whole to Phase 42 | The Windows branch would be observable during the sitting and deliberately not recorded — the "passed but not scored" shape this ledger warns about. | |

**User's choice:** Split into two items

---

## W04 provenance

### Q1 — Where does the NSIS installer for `38-W04` come from?

| Option | Description | Selected |
|--------|-------------|----------|
| `workflow_dispatch` `release-tauri.yml`, install that artifact | The only option satisfying D-16 as written; incidentally exercises the never-run pipeline its own header flags UNPROVEN LIVE. | |
| Local `tauri build`, and rewrite the item | Cheaper, but abandons the CI-provenance half of D-16 — a second scope reduction on an item that already is one. | |
| Both — local first, CI run as the scoring artifact | Local smoke-launch flushes out installer bugs cheaply; `38-W04` scores only on the CI artifact. | ✓ |

**User's choice:** Both — local first, CI run as the scoring artifact
**Notes:** Confirmed at the file before asking: `release-tauri.yml`'s `on:` block carries both `push: tags: v*` and `workflow_dispatch`, so a manual run needs no tag. `38-W04`'s `reduction_note` records it is already a scope reduction against D-16.

### Q2 — `38-W04` says "for the commit under gate". Which commit does the dispatch run target?

| Option | Description | Selected |
|--------|-------------|----------|
| Branch tip after pulling the 4 commits | Ensures quick `260906-hq8`'s `runTs.cjs` win32 esbuild fix is in the very artifact being smoke-launched on Windows. | ✓ |
| Branch tip as-is, do not pull | Builds a Windows artifact missing a Windows-specific fix; evidence would name a commit that is no longer the tip. | |
| Tag a `v*` prerelease | Exercises the real trigger and would close 34-07's gate, but co-triggers two other workflows and opens a draft Release — another phase's work. | |

**User's choice:** Branch tip after pulling the 4 commits

---

## Evidence standard

### Q1 — `38-HUMAN-UAT`'s "DevTools console accepts no input" is a WKWebView observation. Re-test on WebView2?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-test first — it changes the whole method | WebView2's DevTools is Edge DevTools and plausibly accepts input; if so, probes can be evaluated interactively instead of round-tripping through `logInfo`. One check, answer recorded either way. | ✓ |
| Assume it holds, use `logInfo` throughout | Safe and uniform, but carries a macOS-derived constraint onto a different engine without evidence. | |
| `logInfo` regardless of the answer | Durable greppable evidence; console for exploration only, never for scoring. | |

**User's choice:** Re-test first
**Notes:** Located the Windows evidence path before asking — `src/backend/logger/paths.ts:16` resolves to `%LOCALAPPDATA%\GameLib\logs\gamelib.log`, so the `logInfo` route exists here, just not at the macOS path the UAT doc names.

### Q2 — What is the minimum evidence that lets an item move to `human_verification_discharged`?

| Option | Description | Selected |
|--------|-------------|----------|
| Armed-branch proof + operator verdict, both recorded | Positive evidence the code path executed, plus PASS/FAIL, both in a dated session block. Implements the doc's own rule about green results being indistinguishable. | ✓ |
| Operator verdict alone | Fastest, but it is what produced four confident readings off an inert probe page. | |
| Armed-branch proof plus a screenshot for visual items | Strongest record; costs more per item and adds binary artifacts to the planning tree. | |

**User's choice:** Armed-branch proof + operator verdict, both recorded

### Q3 — What proves a probe page or diagnostic surface is live?

| Option | Description | Selected |
|--------|-------------|----------|
| Heartbeat + headless dump-dom before a human reads it | The blocking constraint from `.continue-here.md`, recorded after a missing `</script>` produced four void readings. | ✓ |
| Heartbeat only | Catches a dead script once a human is already looking — later than the recorded failure needs. | |
| No probe pages — instrument the app itself | Removes the failure mode entirely; costs a rebuild cycle for anything the app does not already log. | |

**User's choice:** Heartbeat + headless dump-dom before a human reads it

---

## Claude's Discretion

- Exact `retired_reason` wording on the 9 retired items, and the phrasing of the amended ROADMAP `Plans:` bullet.
- Whether ROADMAP § Phase 38's stale historical counts ("Items: 29 as of 2026-09-01", "Was 8 as of 2026-08-23") are corrected in the same pass or left as marked historical record.
- Sitting order across the 17 remaining items.

## Deferred Ideas

- Retain the `workflow_dispatch` run's AppImage for the Phase 42 Linux sitting rather than spending a second CI cycle.
- Whether a green dispatch run says anything about Phase 34-07's deferred live gate or REQ-35-20 — 34-07's close to claim, not Phase 38's.
- Apple signing / notarization, surfaced while reading `release-tauri.yml`'s signing gates.
- The lint ratchet (`pnpm lint` 4166 vs `--max-warnings 4157`) — Phase 39 owns it, and the push it was blocking has already landed.

## Corrections made during the discussion

- **Dead-item count:** the handoff said "~10 electron items"; the ledger-wide `ELECTRON` grep found exactly **9** (`C07`, `S01`, `S03`, `S05`, `S07`, `S09`, `S11`, `S13`, `S15`). What the handoff called "half of `S15`" and "half of `S16`" is not partial deadness — `S15` is wholly dead and `S16` is a wholly-live item spanning two hosts, which is why it splits.
- **Remaining-item count:** an option description in the close-boundary wrap-up said Phase 38 would end at "~21 open items". The correct figure, after subtracting the 4 Linux relocations as well, is **17**. CONTEXT.md carries the reconciled arithmetic.
- **Push blocker:** `HANDOFF.json` and `.continue-here.md` both describe 17 stranded commits blocked by the lint ratchet. That is stale — the commits are on origin, and this checkout is 4 commits *behind*, not ahead.
