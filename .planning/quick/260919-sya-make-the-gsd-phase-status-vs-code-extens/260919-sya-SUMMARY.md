---
phase: quick/260919-sya
plan: 01
subsystem: tooling
tags: [vscode-extension, gsd-phase-status, todo-triage, host-aware, javascript]

requires: []
provides:
  - Host-aware todoTriage platform rung in the gsd-phase-status VS Code extension (driven by process.platform, not a hardcoded macOS assumption)
  - Actionable-only tallyTodos, derived from todoTriage's colour verdict rather than a second copy of the readiness vocabulary
  - A frozen, disk-based fixture (fixtures/todos-pending-260919/) so the 24-row live-census assertions do not read the live, concurrently-mutated .planning/todos/pending directory
affects: [gsd-phase-status extension itself; any future change to the todo triage vocabulary]

tech-stack:
  added: []
  patterns:
    - "Derive a tally/count from a single source of truth's verdict (triageActionable(todoTriage(...))) instead of forking the vocabulary into a second function, so two call sites cannot silently disagree again."
    - "Freeze a disk-based test fixture from a live, concurrently-mutated directory rather than reading that directory at test time."

key-files:
  created:
    - ~/.vscode/extensions/gsd-phase-status/fixtures/todos-pending-260919/ (24 frozen .md snapshots)
    - ~/.vscode/extensions/gsd-phase-status/fixtures/todos-pending-260919-README.md
  modified:
    - ~/.vscode/extensions/gsd-phase-status/parse.js
    - ~/.vscode/extensions/gsd-phase-status/extension.js
    - ~/.vscode/extensions/gsd-phase-status/test-parse.js
    - ~/.vscode/extensions/gsd-phase-status/package.json (0.10.0 -> 0.11.0)
    - ~/.vscode/extensions/gsd-phase-status/README.md

key-decisions:
  - "tallyTodos returns {total, parked, unparked, open}: unparked is the OLD open (total-parked), kept only so the todos/pending row's badge colour is unaffected by the open narrowing."
  - "actionable is colour-keyed (TRIAGE_STOOD_DOWN_COLORS = {purple, red}), not a new field on todoTriage's return object, to avoid widening ~20 existing JSON.stringify-pinned assertions."
  - "Mid-flight correction from the orchestrator: do not assert against the live .planning/todos/pending directory (a concurrent session is mutating it). Froze a fixture instead — see Deviations."

requirements-completed: [SYA-01, SYA-02, SYA-03, SYA-04]

duration: ~12min
completed: 2026-09-20
---

# Quick Task 260919-sya: Host-aware todo triage + actionable tally Summary

**Fixed two defects in the `gsd-phase-status` VS Code extension's todo counting: the platform rung was hardcoded to treat only macOS as "not a blocker," and `tallyTodos` never learned `ready: blocked` — together they inflated the actionable count from 13 to 22 on this machine.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3/3 completed
- **Files modified:** 5 (outside this git repo) + 1 planning artifact (this SUMMARY)

## Accomplishments

- `todoTriage(fm, folder, host)` now compares a todo's `platform:` against the HOST passed in from `extension.js` (`process.platform`, mapped to `macos`/`windows`/`linux`), not a hardcoded macOS exemption. A new `M` badge letter joins `W`/`L` for "macOS only — not this machine" when the host isn't macOS.
- `tallyTodos(fms, host)` derives `open` from `todoTriage`'s verdict (via a new `triageActionable()` helper, colour-keyed on `TRIAGE_STOOD_DOWN_COLORS = {charts.purple, charts.red}`) instead of `total - parked`, so `ready: blocked` and wrong-platform todos are excluded too.
- `.planning/todos` badge, the status-bar `☐`, and every todo tooltip now report the actionable number (13 on this Mac); `.planning/todos/pending`'s badge and colour are unchanged (still 24, still orange — pinned via the new `unparked` field).
- New assertions were proven RED against the pristine, unmodified `parse.js` before any fix existed (15 FAILUREs — see Red-Proof Evidence below), then landed and made GREEN.
- README's `todos/` row and surrounding prose now describe the actionable rule and that the host comes from `process.platform`.

## Before / After Numbers

| | macOS | Windows | Linux |
|---|---|---|---|
| **Before** (`open`, ignoring `ready: blocked` and host) | 22 | 22 | 22 |
| **After** (`open`, actionable) | **13** | **12** | **11** |

`total: 24`, `parked: 2`, `unparked: 22` — host-independent, confirmed by direct measurement against both the hand-built cross-tab fixture and the frozen on-disk fixture (see below).

## Red-Proof Evidence (Task 1)

Per `<not_committable>`, this extension has no git history, so a pristine snapshot + checksums were the only "revert":

- `/private/tmp/.../scratchpad/pristine/{parse.js,extension.js,test-parse.js,package.json}` + `SHA256SUMS.txt`. `parse.js` sha256 = `8db496ba76fae9277ffa73cca378d1296abbeccbc8007c58b96d8337eab8ec17`, matching the value independently re-measured by the orchestrator.
- Baseline: `node test-parse.js` against the pristine files — **exit 0, 260 `ok` lines, "All parser tests passed."** — matched the orchestrator's pre-measured baseline exactly.
- Redproof: pristine `parse.js` + a copy of `test-parse.js` extended with the target-API assertions (host-aware rung, `triageActionable`, frozen-shape `tallyTodos`), run via `node <scratchpad>/redproof/test-parse.js` → **exit 1, 15 FAILURE(S)**, captured verbatim to `RED.txt`. Failures spanned both defects independently:
  - Hardcoded rung: `platform: windows` at host `windows` stayed red (`3W`) instead of green (`3.`); `platform: macos` at host `windows`/`linux` stayed green instead of red `3M`; three falsy-host cases also failed (the pristine rung ignores `host` entirely, so it can't disable itself either).
  - `ready: blocked` blind spot: `tallyTodos` over the 24-row fixture returned `{total:24, parked:0, open:24}` at every host (pristine treats the new frontmatter-object argument as a status-string array, so its `s === 'parked'` filter never matches — a second, different-shaped confirmation that the old signature/logic could not produce 13/12/11).
  - `triageActionable` itself doesn't exist on pristine `parse.js` (`TypeError`), caught and converted to a controlled `FAIL` rather than crashing the run.

## Task Commits

**None.** Per the commit policy for this quick task, zero commits were created. Every source file under edit (`~/.vscode/extensions/gsd-phase-status/`) lives outside this git repository and is not committable — `git add`/`git commit` were never invoked against it. The only repo-tracked artifact this task produces is this SUMMARY.md, left staged-free for the orchestrator to commit.

## Files Created/Modified

- `~/.vscode/extensions/gsd-phase-status/parse.js` — `HOST_PLATFORMS` map (`macos`→`M`, `windows`→`W`, `linux`→`L`), `TRIAGE_STOOD_DOWN_COLORS` set + `triageActionable()`, `todoTriage(fm, folder, host)` third parameter replacing the two hardcoded platform branches, `tallyTodos(fms, host)` rewritten to the `{total, parked, unparked, open}` shape derived from the triage verdict. Still zero `require('vscode')`.
- `~/.vscode/extensions/gsd-phase-status/extension.js` — `HOST_PLATFORM` constant (the one and only `process.platform` read), `scanTodos` collects raw `fm` objects instead of pre-mapped status words, `decorateTodoFile` and `scanTodos` pass the host through, `todoSummary()` and the `todos/pending` row's tooltip report "N actionable, M stood down," the `todos/pending` row's **colour** now pins on `pending.unparked` (not the narrowed `pending.open`) so it is unaffected by this change, `updateStatusBar()`'s comment rewritten.
- `~/.vscode/extensions/gsd-phase-status/test-parse.js` — landed the red-proofed host-aware rung assertions, precedence/regression guards, falsy-host and any/missing/unrecognised-platform actionability checks, case/whitespace check, `triageActionable` non-vacuous colour-mapping sweep, the 24-row live-census fixture (both a hand-built in-memory reproduction AND a disk-based read of the frozen fixture — see Deviations), and updated the cap sweep to 2048 combos (added the host dimension). Suite: **291 `ok` (before adding the frozen-fixture block) → 295 `ok` final, exit 0, 0 FAIL** (up from the 260 baseline).
- `~/.vscode/extensions/gsd-phase-status/package.json` — `version` `0.10.0` → `0.11.0`.
- `~/.vscode/extensions/gsd-phase-status/README.md` — `todos/` row and surrounding prose rewritten for the actionable rule and host-dependence; status-bar paragraph updated.
- `~/.vscode/extensions/gsd-phase-status/fixtures/todos-pending-260919/` — new, 24 `.md` files frozen from the live `.planning/todos/pending` tree at 2026-09-19 21:0x local.
- `~/.vscode/extensions/gsd-phase-status/fixtures/todos-pending-260919-README.md` — new, provenance + the "don't put this file back inside the snapshot dir" note (see Deviations).

## Deviations from Plan

### 1. [Mid-flight orchestrator correction] Froze a disk-based fixture instead of asserting against the live `.planning/todos/pending` directory

The plan's Task 3 said to "re-assert against the live tree" as part of landing the assertions. Partway through Task 3, the orchestrator sent a mid-flight correction: a concurrent session (`quick-260919-sch`) was actively mutating `.planning/todos/pending` (closed one todo, re-filed another; commits `92f8a1225`, `2ace8d6f5`), and pinning a persisted test assertion against that live, mutable path would be flaky by construction — the failure mode is that a future reader sees a mismatch and wrongly concludes the parser regressed.

**What I did instead:**
- Copied the 24 files present in the live tree at that moment into `~/.vscode/extensions/gsd-phase-status/fixtures/todos-pending-260919/`, with a README documenting it as a frozen snapshot (not a mirror).
- Independently re-derived 13/12/11 from that frozen fixture (not copied from the plan) before pinning it in `test-parse.js`: `{macos:13, windows:12, linux:11}`, `total:24, parked:2, unparked:22` at every host — see command output in this session.
- Added a new assertion block in `test-parse.js` that reads the frozen fixture directory from disk and asserts the same 13/12/11, as a second, independent confirmation alongside the plan's original hand-built in-memory cross-tab fixture (kept, since it is not disk-dependent and therefore not flaky either).
- Ran one live, unpinned **observation** (not a test) against the real tree at 2026-09-20T04:10Z: still 24 files, still 13/12/11 at that instant — reported here as a point-in-time measurement only, per the correction's guidance.

**A gotcha caught by re-deriving rather than trusting**: the fixture README was first written *inside* `fixtures/todos-pending-260919/`. `test-parse.js`'s `*.md` glob over that directory picked it up as a 25th file (`parseFrontmatter` returns a mostly-empty object for it rather than throwing), inflating `total` to 25 and failing the exact assertions this fixture exists to stabilize. Moved the README to `fixtures/todos-pending-260919-README.md`, a sibling of the snapshot directory rather than a member of it, and reran to confirm 24/13/12/11. Left a note in the moved README explaining why it must stay there.

### 2. [Rule 1 — test correctness] Two more stale assertions than the plan's named three

The plan named three known-stale assertions to update (the two `tallyTodos` shape tests and the cap sweep's `512`→`2048`). Running the suite against the fixed `parse.js` with only those three updated surfaced two more, both under the "Rungs 4-5" and "macOS is not a blocker" comments (~line 679-710 of the pristine file): they called `todoTriage({...}, 'pending')` with **no host argument**, so under the new host-aware behavior a falsy host disables the platform rung entirely and both assertions flipped (rung 4/5 expected red but got green; unaffected by design, not a bug). Updated both to pass an explicit mismatching/matching host, preserving their original intent (platform beats readiness; macOS is not a blocker **on a macOS host**) rather than silently degrading them to "host-agnostic" checks that no longer exercise the rung. Rewrote the accompanying comments to say so. Confirmed both are legitimate consequences of the signature change, not bugs, by inspection of `parse.js`'s new platform-rung logic.

### 3. [Documented, not fixed — pre-existing, out of scope] Second README table is stale independently of this change

README's "Individual todo files" table (`| In pending/ | ○ | grey |`) predates v0.10.0's severity+readiness triage badge and was already wrong before this task — the README never mentions `severity:`, `platform:`, or `ready:` anywhere except in the section this task just edited (confirmed: grep for those three tokens elsewhere in README.md returns zero hits). Left as-is per the plan's explicit instruction; noting it here so it isn't lost.

## Verification Results (verbatim)

**Final `node test-parse.js`** (in `~/.vscode/extensions/gsd-phase-status`):
```
EXIT=0
ok count: 295
FAIL count: 0
...tail: "All parser tests passed."
```
(291 `ok` immediately after landing the plan's originally-scoped assertions; 295 after also adding the frozen on-disk fixture block per the mid-flight correction. Both exit 0 with zero FAIL. Baseline before this task: 260 `ok`.)

**Three-host live replay** (Task 3's automated verify, run against the live tree at verify time):
```
live actionable: 13,12,11 total 24
```

**Point-in-time observation, live tree, 2026-09-20T04:10:06Z** (informational only, not a persisted assertion):
```
file count now: 24
{"macos":{"total":24,"parked":2,"unparked":22,"open":13},
 "windows":{"total":24,"parked":2,"unparked":22,"open":12},
 "linux":{"total":24,"parked":2,"unparked":22,"open":11}}
```

**Purity / plumbing checks:**
- `grep -c "require('vscode')" parse.js` → `0`
- `grep -c 'process.platform' extension.js` → `1`
- `diff -rq <scratchpad>/pristine ~/.vscode/extensions/gsd-phase-status` — names exactly the four intended source files as differing (`parse.js`, `extension.js`, `test-parse.js`, `package.json`); README.md and the unrelated `.claude/` dir are the only other differences, both expected (README was intentionally edited; `.claude/` was never part of the pristine snapshot).
- Cap sweep: 2048 combos (8 severities × 8 readiness × 8 platforms × 4 hosts), 0 violations, widest badge 2 chars.
- `pending.total`, `pending.parked`, `pending.unparked` confirmed host-independent (`24`, `2`, `22` at every host); only `pending.open` varies by host.

## Manual Verification Still Required

**VS Code must be reloaded (`Developer: Reload Window`) before any of this takes effect.** The extension is loaded once at startup — without a reload, `.planning/todos` will keep showing the old (22) count and it will look like this fix failed, when it simply hasn't been picked up yet. After reloading, expect:
- `.planning/todos` badge: `13` (on this Mac)
- Status bar: `☐ 13`
- `.planning/todos/pending` badge: `24`, colour unchanged (orange)

This could not be exercised headlessly in this session (no running VS Code instance); it is the one item in the plan's `<verification>` list not independently confirmed here.

## Self-Check

- `~/.vscode/extensions/gsd-phase-status/parse.js` — FOUND, contains `host` (grep confirms `HOST_PLATFORMS`, `host` parameter throughout).
- `~/.vscode/extensions/gsd-phase-status/extension.js` — FOUND, contains `process.platform` exactly once.
- `~/.vscode/extensions/gsd-phase-status/test-parse.js` — FOUND, 295 `ok` at exit 0.
- `~/.vscode/extensions/gsd-phase-status/fixtures/todos-pending-260919/` — FOUND, 24 `.md` files, independently re-tallies to 13/12/11.
- `/private/tmp/.../scratchpad/pristine/` — FOUND, four files + `SHA256SUMS.txt`.
- `/private/tmp/.../scratchpad/redproof/RED.txt` — FOUND, 15 FAILURE(S), exit 1.
- No commits created (per commit policy); `git status --short` in the GameLib repo shows no changes attributable to this task other than the new, untracked `.planning/quick/260919-sya-make-the-gsd-phase-status-vs-code-extens/` directory this SUMMARY lives in.

## Self-Check: PASSED
