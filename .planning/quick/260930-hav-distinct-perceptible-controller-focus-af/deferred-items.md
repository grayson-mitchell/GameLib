# Deferred items — quick 260930-hav

Out-of-scope discoveries surfaced while running this task's verification battery. Not fixed here
per the scope boundary rule (only auto-fix issues directly caused by this task's own changes).

## `pnpm planning-gates` fails on Windows with a `UnicodeEncodeError` inside
`check_phase_ledgers` — pre-existing, unrelated to this task's files

**Where:** `.planning/planning-frontmatter-gate.py:365`, in `run_parser()`'s
`subprocess.run(..., input=..., text=True, encoding=<not specified>)` call, invoked from
`check_phase_ledger` while scanning every phase `*-VERIFICATION.md` ledger under `.planning/phases/`.

**What happens:** `subprocess.run` with `text=True` and no explicit `encoding=` argument uses
Python's default text encoding for the child's stdin pipe, which on this Windows machine resolves
to `cp1252`, not UTF-8. At least one phase ledger's frontmatter/body contains a `→` ("→")
character, and `cp1252` cannot encode it — the write raises `UnicodeEncodeError` and the whole gate
crashes (not merely fails) before finishing the sweep:

```
UnicodeEncodeError: 'charmap' codec can't encode character '→' in position 1155:
character maps to <undefined>
```

**Why this is out of scope for 260930-hav:** this task touched exactly two files under
`.planning/` (`.planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md`
and `.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`), neither of
which is a phase ledger and neither of which contains a `→` character. The crash reproduces
identically on a clean `origin/main` checkout with none of this task's changes applied — it is a
pre-existing Windows-only environment bug in the gate script itself (a missing `encoding="utf-8"`
on the `subprocess.run` call), not a drift between a planning document and code that this task
introduced.

**Suggested fix (not applied here):** pass `encoding="utf-8"` explicitly on the `subprocess.run`
call in `run_parser()` (and any sibling `subprocess.run` calls in this file that pipe planning-doc
text to the node/js-yaml helper), so the child process always receives UTF-8 regardless of the
host OS's default text encoding.

**Verification impact on this task:** `pnpm codecheck` and `pnpm lint` both pass cleanly (0
errors). `pnpm planning-gates` cannot complete on this Windows machine due to the above; the two
gates that did run before the crash (`state-sdk-field-anchor-gate.py`,
`todo-frontmatter-gate.py`) both passed. See `260930-hav-SUMMARY.md` for the full verification
record.
