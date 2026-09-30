---
created: 2026-09-30
title: "`pnpm planning-gates` crashes on Windows unless PYTHONUTF8=1 — planning-frontmatter-gate.py pipes frontmatter to node through a cp1252 text-mode subprocess and dies on a `→`"
found_during: Phase 38 sitting 13 bookkeeping (quick 260930-o75, Windows 11, 2026-09-30)
severity: minor
platform: windows
ready: code
status: RESOLVED
resolved: 2026-09-30
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

## Result (quick-260930-te5, 2026-09-30)

**Before and after.** Measured on this Windows 11 host at `utf8_mode 0` / cp1252, with `PYTHONUTF8` and
`PYTHONIOENCODING` unset. The pre-edit plain `pnpm planning-gates` exited 1 at `11/12 planning gates
passed.`, with `UnicodeEncodeError: 'charmap' codec can't encode character` for U+2192 raised from
`run_parser`. The post-edit plain run exits 0 at `12/12 planning gates passed.` with no Traceback,
`UnicodeEncodeError` or `UnicodeDecodeError`. `PYTHONUTF8=1 pnpm planning-gates` also reports 12/12.

**The three edits and why each exists** (all in `.planning/planning-frontmatter-gate.py`):

- (a) `run_parser` passes `encoding="utf-8", errors="strict"` to `subprocess.run`. The pre-fix gate was
  silently corrupting non-ASCII in both directions, not only crashing: a cp1252-encodable character
  such as the em-dash reached node as invalid UTF-8 and became U+FFFD, and node's UTF-8 reply was
  mojibaked on the way back. The pre-fix self-test "passed" on mojibake.
- (b) `NODE_YAML_PARSE_JS` calls `process.stdin.setEncoding("utf8")`, so a multi-byte character split
  across a ~64 KiB stdin chunk is carried over instead of replaced. A synthetic 100000 x U+2192 payload
  came back with 5 U+FFFD before, and 0 after.
- (c) `main()` reconfigures stdout with `errors="backslashreplace"` and leaves the encoding alone. This
  was measured as REQUIRED, not optional: edits (a) and (b) alone moved the crash into the self-test's
  `tab-indented mapping entry` case, because js-yaml renders a TAB as U+2192 in its error snippets and
  the gate prints those to a cp1252 pipe. With (c), the marker prints as a literal backslash escape.

**Per-site audit** (census re-run against the live tree; the text-mode subprocess sites are exactly
these four and there is no bare `open(`, `check_output`, `Popen`, `universal_newlines` or `os.popen`):

| Site | Verdict and reason |
|---|---|
| frontmatter gate, `run_parser` `subprocess.run` | FIX. Its data carries non-ASCII: 10 of 89 ledger frontmatters are non-cp1252, and node's reply embeds raw non-ASCII. |
| frontmatter gate, `NODE_YAML_PARSE_JS` stdin handling | FIX. Chunk-boundary U+FFFD: 5 on the synthetic payload, 0 after. The 35 and 38 ledgers span several chunks but are not corrupted today. |
| frontmatter gate, stdout | FIX, with `backslashreplace`. The encoding is deliberately unchanged. |
| `meta/runPlanningGates.py`, `subprocess.run(text=True)` | NO CHANGE. Locale code page at both ends is self-consistent. Switching the runner alone to utf-8 strict would crash on the cp1252 em-dash byte 0x97 that gates print today, for example the frontmatter gate's `OK: ... — frontmatter` line. Child stderr is always `backslashreplace`. |
| `planning-envelope-tag-gate.py` `discover()`, `git ls-files` with `text=True` | NO CHANGE. `core.quotePath` is unset, and its default octal-escapes every non-ASCII path, so the output is pure ASCII. There are 0 non-ASCII tracked paths under `.planning`. |
| `planning-envelope-tag-gate.py` self-test `git init` / `git add` | NO CHANGE. There is no capture and no text mode. |
| `phases/34.4.1-.../ported-channels-gate.py`, `git diff --stat` with `text=True` | NO CHANGE. `--stat` emits the path and counts only, never content, and the path is ASCII. |
| every `read_text` / `write_text` in all 12 gates | Already `encoding="utf-8"`. `state-sdk-field-anchor-gate.py` additionally has one explicit `errors="replace"`. |
| bare `open(`, `check_output`, `Popen`, `universal_newlines`, `os.popen` | 0 occurrences. |

**Ablation results** (`te5-ablate.py`, run under `-X utf8=0` with both env vars scrubbed):

```
control: exit=0 marker_found=n/a OK
no-utf8-pipe: exit=1 marker_found=yes OK
no-setEncoding: exit=1 marker_found=yes OK
no-stdout-backslashreplace: exit=1 marker_found=yes OK
```

**Honest limits.**

- macOS and Linux were not run; PYTHONUTF8=1 pnpm planning-gates reporting N/N is the stand-in, and ubuntu CI will be the first real non-Windows run.
- Self-test Case A cannot discriminate on a UTF-8-locale host, so CI cannot see the cp1252 half of this defect; only a Windows run can.
- The runner was deliberately left unchanged.

Case B's failure without edit (b) was measured on this Windows machine only; its discrimination in CI
has not been measured.

**Residuals, recorded but not fixed.**

- The envelope-tag gate's `git ls-files` discovery would silently exclude a non-ASCII tracked path. Git
  would quote it, and the quoted form fails the `.md` suffix test. This is a discovery-class defect,
  not an encoding one, and it is latent at 0 instances.
- When the runner echoes a failing gate's output into a cp1252 pipe that a UTF-8 terminal reads,
  non-ASCII displays as U+FFFD. Both halves of that pipe are the locale code page, so this is
  display-only and never a crash.

## Resolution

Fixed by quick 260930-te5. The fix is 1077019aa (UTF-8 declared at both ends of the node pipe, stdout
made crash-proof), pinned by 13779d81f (two self-test transport cases and the ablation harness
`.planning/quick/260930-te5-fix-planning-gates-cp1252-crash-on-windo/te5-ablate.py`). `PYTHONUTF8` is
not set anywhere, and `meta/runPlanningGates.py` is unchanged.
