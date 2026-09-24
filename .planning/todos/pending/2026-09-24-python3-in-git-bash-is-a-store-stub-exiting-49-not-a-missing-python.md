---
created: 2026-09-24T06:41:17.984Z
title: '`python3` in Git Bash resolves to the Microsoft Store stub and exits 49 with "Python was not found" — which reads as "Python is not installed" and already produced a false claim in a planning doc'
area: build
severity: minor
platform: windows
ready: code
needs: none-desk-ready
status: RESOLVED
resolved: 2026-09-24
resolved_by: quick-260924-tjg
resolution: 'VERIFIED-NOT-A-DEFECT — no code change, no CLAUDE.md note (operator decision). Closed as an honest record of a standing trap, not a fix.'
found_by: 'Measured during quick 260924-pm3 while resolving a contradiction: the plan asserted `python3` was absent from PATH and `pnpm planning-gates` therefore unrunnable, yet prior task rows recorded that gate passing 12/12. Both were right about different shells.'
files:
  - package.json:42
---

## Problem

The same bare command name, `python3`, means two different things on this box depending on which
shell invokes it — and the broken resolution is the one in the shell agents and humans actually
type into.

Real Python is 3.12.10 at `C:\Users\grays\AppData\Local\Programs\Python\Python312\`. That install
ships **both** `python.exe` and a `python3.cmd` shim.

- **Under cmd.exe (and therefore pnpm), `python3` works.** `where python3` returns
  `...\Programs\Python\Python312\python3.cmd` **first**, then
  `...\Microsoft\WindowsApps\python3.exe`. cmd resolves `.cmd`, so it gets the real interpreter:
  `python3 --version` → `Python 3.12.10`.
- **Under Git Bash, `python3` is broken.** Bash does not resolve a bare name to a `.cmd` file, so
  it skips `python3.cmd` entirely and falls through to `WindowsApps\python3.exe` — the Store
  App-Execution-Alias stub. Measured: it prints `Python was not found; run without arguments to
  install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app
  settings > App execution aliases.` and exits **49**.
- **Under Git Bash, `python` works.** It resolves
  `/c/Users/grays/AppData/Local/Programs/Python/Python312/python` → `Python 3.12.10`.

## Why it matters — the damage is to reasoning, not to builds

**Nothing is broken.** State this first, because the error string argues otherwise:

- `pnpm planning-gates` (`package.json:42` → `python3 meta/runPlanningGates.py`) runs correctly and
  reported **12/12 PASS**, twice, because pnpm invokes through cmd.
- `.github/workflows/codecheck.yml:33` runs `pnpm planning-gates` on `runs-on: ubuntu-latest`,
  where `python3` is the real interpreter. CI is unaffected on every platform.

The entire cost is a **misleading error string**. Exit 49 with "Python was not found" invites
exactly two wrong conclusions — "Python isn't installed on this box" and "this gate can't be run
here" — and both are false.

**This already happened, which is why this todo exists.** During quick `260924-pm3` a planning
agent checked `python3` from Bash, concluded it was absent from PATH and that `pnpm planning-gates`
would therefore fail for the wrong reason, and wrote that into its plan. The orchestrator relayed
it to the operator as fact and wrote it into the STATE.md Quick Tasks row. It was caught only by
actually running the gate, and corrected in `6204817fb`. The irony is worth recording: that task's
whole subject was a false premise sitting unchallenged in a planning doc, and it came close to
shipping one of its own.

This is the mirror of the standing lesson in memory `gate-failure-mechanisms`. That one says a
green pipeline can certify a broken artifact. This is the inverse — a **red-looking command
certifying a working one** — and it is the more seductive of the two, because a failure message
feels like evidence in a way a passing check does not.

## Direction — the fix is NOT to change the invocation

1. **Do NOT change `package.json:42` from `python3` to `python`.** That would break Linux and
   macOS, where `python` frequently does not exist at all and `python3` is correct. `python3` is
   the right thing for the script to say; the breakage is purely Git Bash name resolution on one
   machine. Changing it would trade a cosmetic local annoyance for a real cross-platform defect.
2. **When running a `.py` gate directly from Git Bash on Windows, invoke `python <script>`** (or
   `py -3 <script>`), not `python3`. Prefer `pnpm planning-gates` over invoking a gate script by
   hand — it goes through cmd and resolves correctly.
3. **Unverified, operator-only, and not a code change:** the Store alias can be turned off at
   Settings > Apps > Advanced app settings > App execution aliases. The intuition is that Bash
   would then fall through to the real `python3.cmd` — but Bash still will not resolve `.cmd` for a
   bare name, so this plausibly does **not** fix Bash at all. Measure it before believing it; do
   not prescribe it on the strength of the reasoning above.
4. **Judgement call, deliberately left open:** whether a one-line note belongs in CLAUDE.md's
   conventions. The failure mode is an agent misreading an error string, which no gate can catch —
   prose is the only available mechanism, which is an argument both for writing it down and for
   being honest that writing it down is weak. Not doing it as part of this todo.

## Verification — do not accept "it printed a version" as proof

- From Git Bash: `python3 --version; echo "exit=$?"` must reproduce the Store-stub text and
  `exit=49`. If it prints a version instead, this box's PATH or app-execution aliases have changed
  and this todo's premise needs re-measuring before anything is acted on.
- From Git Bash: `python --version` must print `Python 3.12.10`.
- `where python3` under cmd/pnpm must still list `python3.cmd` **before** the WindowsApps stub.
  That ordering is the entire reason `pnpm planning-gates` works — if it ever inverts, the gate
  breaks on this box and the diagnosis will look nothing like this todo.
- `pnpm planning-gates` must still report 12/12.

## Resolution

**Re-measured 2026-09-24 — all four Verification bullets reproduce exactly.** From Git Bash,
`python3 --version` still prints the Store-stub text — `Python was not found; run without
arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps >
Advanced app settings > App execution aliases.` — and still exits **49**. From Git Bash, `python
--version` still prints `Python 3.12.10`. Under cmd, `where python3` still lists
`...\Programs\Python\Python312\python3.cmd` **before**
`...\Microsoft\WindowsApps\python3.exe` — ordering intact. `pnpm planning-gates` still reports
**12/12 planning gates passed**.

Beyond the original four, `type -a` was run in Git Bash as extra evidence naming the mechanism
directly: `type -a python3` returns **only**
`/c/Users/grays/AppData/Local/Microsoft/WindowsApps/python3` — the `python3.cmd` shim at
`Programs\Python\Python312\` is invisible to bare-name resolution in Bash. `type -a python`, by
contrast, returns `/c/Users/grays/AppData/Local/Programs/Python/Python312/python` first. This
confirms the todo's original diagnosis exactly: Bash does not resolve a bare name to a `.cmd`
file, so `python3.cmd` is structurally unreachable from a bare `python3` in this shell. It is not
a PATH-ordering accident, and reordering PATH would not fix it.

**Decision: no code change, and no CLAUDE.md note.** Direction items 1 and 2 were already settled
— `package.json:42`'s `python3 meta/runPlanningGates.py` invocation stays exactly as written,
because changing it to `python` would break Linux and macOS, where `python` frequently does not
exist. Item 4, the single open judgement call — whether a one-line conventions note belongs in
CLAUDE.md — has now been decided **against** by the operator. No note was added.

**What enforcement now exists: essentially none.** This file, sitting in `completed/`, is the
entire durable record of the trap. Nothing prevents a future agent from running `python3` in Git
Bash, reading exit 49 and "Python was not found," and concluding Python is absent from the box —
which is exactly what happened in quick `260924-pm3`. Prose in a completed todo is weaker than
prose in CLAUDE.md, and the todo's own Direction section already conceded that CLAUDE.md prose
would itself be weak. This close-out is not a fix, and is not being written up as one: nothing was
fixed, hardened, or prevented by closing this todo. It is a record.

**Direction item 3 remains unverified and untested.** Turning off the Store app-execution alias at
Settings > Apps > Advanced app settings > App execution aliases was **not** measured as part of
this close-out. The todo's own reasoning suggests it plausibly would not fix Bash anyway, since
Bash still would not resolve `.cmd` for a bare name even with the alias disabled. It stays a
hypothesis, not a verified mitigation.

## Related

- Memory `gate-failure-mechanisms` — the standing lesson this inverts.
- Quick `260924-pm3` — where this was measured; its STATE.md row carries the corrected account, and
  `6204817fb` is the correction commit.
