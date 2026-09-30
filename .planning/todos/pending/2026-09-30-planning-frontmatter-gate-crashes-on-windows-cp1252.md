---
created: 2026-09-30
title: "`pnpm planning-gates` crashes on Windows unless PYTHONUTF8=1 — planning-frontmatter-gate.py pipes frontmatter to node through a cp1252 text-mode subprocess and dies on a `→`"
found_during: Phase 38 sitting 13 bookkeeping (quick 260930-o75, Windows 11, 2026-09-30)
severity: minor
platform: windows
ready: code
area: planning-gates
files:
  - .planning/planning-frontmatter-gate.py
  - meta/runPlanningGates.py
---

## Mechanism

`.planning/planning-frontmatter-gate.py:365` calls `subprocess.run([node, "-e", NODE_YAML_PARSE_JS],
input=<frontmatter text>, text=True, ...)` without an `encoding=`. On Windows, Python's text-mode
default is the ANSI codepage (cp1252), so encoding the stdin payload raises `UnicodeEncodeError` on
any character outside cp1252. The `→` already present in `08.1-VERIFICATION.md`'s frontmatter
triggers it, and that file was not touched by the sitting that found this. The gate crashes instead
of reporting. With `PYTHONUTF8=1` all 12 gates pass (measured 2026-09-30).

This is not new. STATE.md's `260930-iws` row already records "plain invocation still crashes with
the pre-existing cp1252 `UnicodeEncodeError`". No todo tracked it until now.

## Fix direction

Pass `encoding="utf-8"` (and `errors="strict"`) to that `subprocess.run`, and audit the other
`subprocess.run(..., text=True)` sites in `.planning/*-gate.py` and `meta/runPlanningGates.py` for
the same omission. Setting `PYTHONUTF8` in the runner would hide the problem rather than fix it.

## Verification (once fixed)

On Windows, plain `pnpm planning-gates` (no `PYTHONUTF8`) reports 12/12 with no traceback. On
macOS/Linux, the result is unchanged.
