---
phase: quick-260928-qmz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .husky/pre-push
  - .planning/quick/260928-qmz-add-graphify-update-to-husky-pre-push-so/pre-push-matrix.sh
autonomous: true
requirements:
  - QUICK-260928-QMZ
estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "**The existing chain is untouched and still decides the push.** Lines 1-2 of `.husky/pre-push` are byte-identical to the pre-change blob `c01fb5c268364253b43f126213ec0058ca248b8c`; line 3 captures the chain's status into `checks_status`; the file's final statement is `exit \"$checks_status\"`. Measured behaviourally, not by reading: a shimmed `pnpm lint` exiting 3 makes the hook exit exactly 3, and a shimmed `pnpm find-deadcode` exiting 5 makes it exit exactly 5 (matrix arms D and E)."
    - "**A missing graphify never blocks a push.** With the checks passing and `graphify` absent from PATH, the hook exits 0 and prints `graphify not found on PATH` to stderr (matrix arm C). The arm carries a negative control: it asserts `command -v graphify` finds nothing under the arm's PATH before running, so a green arm C cannot be a real graphify silently answering."
    - "**A failing graphify never blocks a push.** With the checks passing and `graphify update .` exiting 7, the hook exits 0 and its stderr names `exited 7` (matrix arm B)."
    - "**On a passing push the real graphify refreshes the graph.** With only `pnpm` shimmed, the hook invokes the real `~/.local/bin/graphify` as `graphify update .` from the repo root, exits 0, and graphify reports `Code graph updated.` (Task 1 tracer run). graphify's stdin is closed: fed a pre-push ref line, the graphify shim reads 0 bytes (arm A)."
    - "**graphify never runs when a check fails.** Arms D and E record no graphify invocation at all, so a red push does not pay the measured 39-79s rebuild and graphify's ~20 lines of progress output cannot scroll over the failing check's error."
    - "**The matrix discriminates.** Run against the pre-change blob it reports exactly `2/5 arms PASS` (D and E pass, because the old hook already propagated the chain's status; A, B and C fail, because the old hook never ran graphify) and exits non-zero. Against the new hook it reports `5/5 arms PASS` and exits 0."
  artifacts:
    - ".husky/pre-push — chain unchanged on line 2, `checks_status=$?` on line 3, a comment block stating why the step is best-effort and where it sits, the `command -v graphify`-gated `graphify update . </dev/null` run only when `checks_status` is 0, and `exit \"$checks_status\"` as the final statement. Mode stays 100755."
    - ".planning/quick/260928-qmz-add-graphify-update-to-husky-pre-push-so/pre-push-matrix.sh — the five-arm PATH-shim harness (A pass/pass, B graphify fails, C graphify missing, D lint fails, E find-deadcode fails), taking the hook path as an optional argument so it can be pointed at the pre-change blob."
  key_links:
    - "Line 2's `&&` chain -> `checks_status=$?` on line 3 -> `exit \"$checks_status\"` as the last statement. That is the ONLY path from the chain to the hook's exit code. Anything executed between line 2 and line 3 would overwrite `$?`, which is why line 3 is the capture and nothing else."
    - "`meta/__tests__/tsconfigMeta.test.ts:94` cites `.husky/pre-push:2` as the line that calls `pnpm codecheck`. Keeping the chain on line 2 keeps that anchor true without editing the test."
    - "git runs `.husky/pre-push` directly through its `#!/bin/bash` shebang (husky 8.0.3, `core.hooksPath=.husky`, and the hook does not source `.husky/_/husky.sh`), so nothing wraps it in an errexit shell. The best-effort guarantee depends on the hook never enabling errexit itself; arm B is the behavioural proof, because under errexit a graphify exit of 7 would end the hook with 7."
    - "`graphify update .` resolves `.` against the hook's cwd, which git sets to the worktree root before running any hook in a non-bare repository (githooks(5)). The harness and the tracer both `cd` to the repo root before invoking the hook so they exercise the same cwd git provides."
---

<objective>
Add a best-effort `graphify update .` step to `.husky/pre-push` so the gitignored
`graphify-out/` knowledge graph is refreshed before every push that passes the existing
checks, and prove the step can never, by itself, block or unblock a push.

Purpose: the graph goes stale between manual `graphify update .` runs. A push is a natural
refresh point. But graphify is a per-developer `pip install --user` binary that is absent in
CI, on other contributors' machines, and from PATH for non-login shells and GUI git clients,
so it has to degrade to a warning, never to a red push. Only `pnpm codecheck && pnpm lint &&
pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode` may fail the push.

Output: the edited hook, and a committed five-arm harness that proves exact exit propagation
and both degrade paths, with a negative control against the pre-change hook.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.husky/pre-push
@.husky/pre-commit

Measured at planning time (2026-09-28), do not re-investigate:

- `.husky/pre-push` is 2 lines, mode 100755, blob `c01fb5c268364253b43f126213ec0058ca248b8c`,
  ends with a newline. Line 2 is the whole `&&` chain.
- husky is 8.0.3 with `core.hooksPath=.husky`; `.husky/_/` holds only `husky.sh` and
  `.gitignore`, and pre-push does not source it. git executes the hook through its shebang.
  macOS `/bin/bash` is 3.2.57 (recorded in `.husky/pre-commit`); this Linux box has 5.1.16.
- `graphify` resolves to `/home/graysonmitchell/.local/bin/graphify`, version 0.9.70. Neither
  `/usr/bin` nor `/bin` holds `graphify` or `pnpm` (pnpm is under `~/.nvm/.../bin`).
- `graphify update . </dev/null` from the repo root: exit 0 in 79s with a cold AST cache
  (1569 uncached files after today's install), exit 0 in 39s on a no-change rerun that printed
  `No code-graph topology changes detected; outputs left untouched.` Both runs print
  `Code graph updated.` on success. Output is ~20-28 lines, mostly progress. It writes only
  inside `graphify-out/` (including a dated backup dir `graphify-out/2026-09-28/`); `git status`
  showed nothing new after either run.
- graphify 0.9.70's `update` handler calls its rebuild with `block_on_lock=True`: if another
  graphify rebuild holds the per-repo lock, `update` WAITS for it rather than failing. Its
  "nothing to update or rebuild failed" branch exits 1.
- With `GRAPHIFY_VIZ_NODE_LIMIT` unset (it is unset on this machine), 0.9.70 writes an
  aggregated community view `graph.html` above 5000 nodes rather than deleting the file, so the
  old delete-graph.html trap does not arm here. The hook must not set that variable: it should
  behave exactly like the operator's own manual `graphify update .`.
- `npx prettier --file-info .husky/pre-push` reports `{ "ignored": false, "inferredParser": null }`
  and `npx prettier --check .husky/pre-push` exits 2 with `No parser could be inferred`. There is
  no formatter for this file; the pre-commit hook's stdin path exits 0 for it. The harness lives
  under `.planning`, which prettier ignores (`--file-info` reports `"ignored": true`).
- `meta/__tests__/tsconfigMeta.test.ts:94` cites `.husky/pre-push:2`.

Not in scope, do not add: an opt-out environment variable, a timeout wrapper around graphify,
exporting `GRAPHIFY_VIZ_NODE_LIMIT`, making graphify a gate, any CI change, or edits to
`.husky/pre-commit`, `meta/__tests__/tsconfigMeta.test.ts`, `CLAUDE.md`, `package.json`,
`.gitignore` or `.graphifyignore`. Do not run `graphify hook install`: it installs
post-commit/post-checkout hooks and a merge driver (it would edit the committed
`.husky/post-checkout`), not a pre-push step. Do NOT run `git push` to test anything: the hook
is exercised by direct invocation with PATH shims, and pushing is the operator's call.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Add the best-effort graphify refresh after the pre-push chain, proven end-to-end against the real graphify binary</name>
  <files>.husky/pre-push</files>
  <precondition>`command -v graphify` resolves in the executor's shell (measured at planning: `/home/graysonmitchell/.local/bin/graphify`, 0.9.70). If it does not, halt and report; the tracer's far end is the real binary.</precondition>
  <read_first>.husky/pre-push, .husky/pre-commit (the missing-toolchain skip and the stderr message style to match)</read_first>
  <action>
Edit `.husky/pre-push` with the Edit tool (preserves the 100755 mode; do not rewrite it with
Write or a heredoc). The finished file, in order:

1. Line 1 `#!/bin/bash` and line 2 the existing chain, both byte-for-byte unchanged. The chain
   must stay on line 2 because `meta/__tests__/tsconfigMeta.test.ts:94` cites
   `.husky/pre-push:2`.
2. Line 3 is exactly `checks_status=$?` — nothing may execute between the chain and this
   capture, because any command there would overwrite `$?`. Use the name `checks_status`, not
   `status` (a reserved read-only name in zsh; avoid the trap for anyone who copies this).
3. Then a `#` comment block in the same explanatory register as `.husky/pre-commit`'s header,
   covering, briefly: this is a best-effort local refresh of the gitignored `graphify-out/`
   graph, never a gate, and only line 2 decides the push; it runs only after the checks pass,
   so a red push does not pay the rebuild and graphify's progress output cannot bury the failing
   check's error; the hook deliberately runs without errexit and ends with an explicit exit of
   `checks_status`, because git runs it straight through the shebang (husky 8,
   `core.hooksPath=.husky`) and enabling errexit here would turn a graphify failure into a
   blocked push; `command -v` is the probe because graphify is a per-developer
   `pip install --user` binary in `~/.local/bin`, absent in CI, on other machines, and from
   PATH for non-login shells and GUI git clients; stdin is redirected from `/dev/null` because
   git writes the pushed-ref list to the hook's stdin; the measured cost, dated — graphify
   0.9.70 on 2026-09-28, 39s on a no-change run and 79s with a cold AST cache; and that
   `graphify update` waits on graphify's own per-repo rebuild lock, so a concurrent rebuild
   delays the push rather than failing it. Also note the chain is pinned to line 2 by the
   tsconfigMeta test anchor.
4. The step itself: when `checks_status` equals 0, test `command -v graphify` with its output
   and errors discarded. If found, echo to stderr
   `pre-push: checks passed, refreshing graphify-out/ via 'graphify update .' (best-effort, cannot block the push)`,
   run `graphify update .` with stdin from `/dev/null` (leave its stdout and stderr alone), and
   capture its exit status into `graphify_status`. If `graphify_status` is not 0, echo to
   stderr `pre-push: 'graphify update .' exited <graphify_status>, graphify-out/ may be stale (best-effort, the push continues)`.
   If `command -v` finds nothing, echo to stderr
   `pre-push: graphify not found on PATH, skipping the graphify-out/ refresh (best-effort, the push continues)`.
   When `checks_status` is not 0, run nothing and print nothing extra.
5. The final statement is `exit "$checks_status"`, followed by the file's trailing newline.

Use only constructs bash 3.2 runs identically (macOS `/bin/bash`): `[ ]` tests, `-eq`/`-ne`,
`command -v`, plain `$?` captures, `echo ... >&2`. Keep the 2-space indent `.husky/pre-commit`
uses. There is no formatter for this file (see the context block), so match `.husky/pre-commit`
by hand.

Then run the tracer below from the repo root. It shims ONLY `pnpm` (so the multi-minute chain
is replaced by an instant pass) and leaves the real graphify on PATH, so the hook's refresh
step runs the real binary against the real repo — the true far end of this change. It takes
~40-80s. A real `graphify update .` is also what CLAUDE.md asks for after modifying files, so
this run discharges that too.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && bash -n .husky/pre-push && test -x .husky/pre-push && git cat-file -e c01fb5c268364253b43f126213ec0058ca248b8c && diff <(git show c01fb5c268364253b43f126213ec0058ca248b8c | sed -n 1,2p) <(sed -n 1,2p .husky/pre-push) && [ "$(sed -n 3p .husky/pre-push)" = 'checks_status=$?' ] && [ "$(grep -v '^[[:space:]]*$' .husky/pre-push | tail -n1)" = 'exit "$checks_status"' ] && npx prettier --file-info .husky/pre-push | grep -Eq '"inferredParser":[[:space:]]*null' && d=$(mktemp -d) && printf '#!/bin/bash\nexit 0\n' > "$d/pnpm" && chmod +x "$d/pnpm" && printf 'refs/heads/main %040d refs/heads/main %040d\n' 0 0 | PATH="$d:$PATH" ./.husky/pre-push origin https://example.invalid/repo.git > "$d/out" 2>&1; rc=$?; cat "$d/out"; [ "$rc" -eq 0 ] && grep -q "refreshing graphify-out/ via 'graphify update .'" "$d/out" && grep -q 'Code graph updated' "$d/out" && git check-ignore -q graphify-out/graph.json && echo TRACER-PASS; rm -rf "$d"</automated>
    Prints TRACER-PASS. `test -x` proves the worktree file is still executable, which is the
    mode git stages (after the task commit, `git ls-tree HEAD .husky/pre-push` must still show
    100755 — record it in the SUMMARY). `git cat-file -e` proves the pre-change blob exists
    before the byte-identity `diff` reads it, so a missing blob fails loudly. The prettier probe
    asserts the file still has no inferable parser — `prettier --check` over it exits 2
    ("No parser could be inferred", measured 2026-09-28), so a formatter check is deliberately
    omitted for this path, not forgotten; if the probe ever reports a real parser, add the check.
  </verify>
  <done>`.husky/pre-push` keeps lines 1-2 byte-identical, captures the chain status on line 3,
  runs `graphify update . </dev/null` only when the checks passed and only if `command -v`
  finds graphify, warns on stderr for the missing and the non-zero cases, and ends with
  `exit "$checks_status"`. With `pnpm` shimmed, the hook exits 0 and the real graphify prints
  `Code graph updated.`; `graphify-out/` stays gitignored; mode is still 100755.</done>
</task>

<task type="auto">
  <name>Task 2: Prove the degrade paths and exact exit propagation with a five-arm shim matrix and a negative control</name>
  <files>.planning/quick/260928-qmz-add-graphify-update-to-husky-pre-push-so/pre-push-matrix.sh</files>
  <read_first>.husky/pre-push (as edited in Task 1 — the three stderr messages the arms match on)</read_first>
  <action>
Write `.planning/quick/260928-qmz-add-graphify-update-to-husky-pre-push-so/pre-push-matrix.sh`
(`#!/bin/bash`, run via `bash`, so the executable bit is not required). Precedent for a helper
script inside a quick-task dir: `260912-it4-.../sweep-census.py`, `260901-kl2-.../maskPeVolatile.py`.

Behaviour:

- Usage `bash pre-push-matrix.sh [HOOK]`. HOOK defaults to `<repo root>/.husky/pre-push`, with
  the repo root from `git rev-parse --show-toplevel`. `cd` to the repo root before running any
  arm, because git runs hooks from the worktree root and `graphify update .` depends on it.
- Create a work dir with `mktemp -d` and remove it from an EXIT trap.
- Build two shim dirs with `printf`: WITH (holds `pnpm` and `graphify`) and WITHOUT (holds only
  `pnpm`). The `pnpm` shim appends `pnpm <all args>` as one line to the file named by
  `MATRIX_LOG`, then exits `MATRIX_FAIL_RC` if its first argument equals `MATRIX_FAIL_AT`,
  else 0. The `graphify` shim appends `graphify <all args>`, then reads ALL of its stdin, counts
  the bytes with `wc -c` (strip whitespace — macOS `wc` pads with spaces), appends
  `graphify-stdin-bytes <N>`, and exits `MATRIX_GRAPHIFY_RC` (default 0).
- Run each arm as the hook under `env` with `PATH=<shim dir>:/usr/bin:/bin` plus the `MATRIX_*`
  variables, args `origin https://example.invalid/repo.git`, stdin one pre-push-format line
  (`refs/heads/main <40 zeros> refs/heads/main <40 zeros>`), and combined stdout+stderr to a
  per-arm file. Record the exit code. Set no HOME-family variables: the hook under shims touches
  no profile and spawns no sidecar, so the two-profile rule's isolation half does not apply.
- Compare each arm's log as an EXACT whole-file match against an expected file written with
  `printf` (use `cmp` or `diff`), never with a count — an extra or reordered invocation must fail.
  The five pnpm lines, in order, are `pnpm codecheck`, `pnpm lint`, `pnpm prettier`,
  `pnpm i18n --fail-on-update`, `pnpm find-deadcode`.

The arms:

- A, checks pass and graphify succeeds (WITH, graphify rc 0): exit 0; log is the five pnpm lines,
  then `graphify update .`, then `graphify-stdin-bytes 0` (proves the `/dev/null` redirect
  despite the ref line on the hook's stdin); output contains `refreshing graphify-out/`.
- B, checks pass and graphify fails (WITH, graphify rc 7): exit 0; log identical to A; output
  contains `exited 7`.
- C, checks pass and graphify is missing (WITHOUT): FIRST assert that `command -v graphify` run
  in a subshell with this arm's PATH finds nothing — if it finds something, print
  `ARM C VOID: graphify resolves under the arm PATH` and count the arm as failed. Then: exit 0;
  log is exactly the five pnpm lines; output contains `graphify not found on PATH`.
- D, `lint` fails (WITH, `MATRIX_FAIL_AT=lint`, `MATRIX_FAIL_RC=3`): exit exactly 3; log is
  exactly `pnpm codecheck` then `pnpm lint` — no later check, no graphify line.
- E, `find-deadcode` fails (WITH, `MATRIX_FAIL_AT=find-deadcode`, `MATRIX_FAIL_RC=5`, graphify
  rc 0): exit exactly 5; log is exactly the five pnpm lines — no graphify line.

Print one line per arm, `ARM <X> PASS` or `ARM <X> FAIL: <what differed>` (on a log mismatch,
print the actual log beneath it), then as the LAST line `<N>/5 arms PASS`. Exit 0 only when N
is 5.

Then run it twice: against the edited hook (default), and against the pre-change hook
extracted from blob `c01fb5c268364253b43f126213ec0058ca248b8c` into a temp file made
executable. The second run is the negative control: the old hook never ran graphify, so A, B
and C must fail while D and E pass — exactly `2/5 arms PASS`. If the old hook scores anything
other than 2/5, the harness is not measuring what it claims; fix the harness, not the hook.
Finally run `pnpm planning-gates` (a new file lands under `.planning`).
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && H=.planning/quick/260928-qmz-add-graphify-update-to-husky-pre-push-so/pre-push-matrix.sh && bash -n "$H" && o=$(mktemp -d) && { bash "$H" > "$o/new" 2>&1; new_rc=$?; git show c01fb5c268364253b43f126213ec0058ca248b8c > "$o/orig" && chmod +x "$o/orig" && { bash "$H" "$o/orig" > "$o/old" 2>&1; old_rc=$?; }; cat "$o/new" "$o/old"; [ "$new_rc" -eq 0 ] && [ "$(tail -n1 "$o/new")" = '5/5 arms PASS' ] && [ "$old_rc" -ne 0 ] && [ "$(tail -n1 "$o/old")" = '2/5 arms PASS' ] && grep -q '^ARM D PASS' "$o/old" && grep -q '^ARM E PASS' "$o/old" && echo MATRIX-PASS; }; rm -rf "$o"; pnpm planning-gates</automated>
    Prints MATRIX-PASS and `pnpm planning-gates` exits 0. The harness sits under `.planning`,
    which prettier ignores (`--file-info` reports `"ignored": true`), so `prettier --check` over
    it would be vacuous and is deliberately omitted; it is kept consistent by matching
    `.husky/pre-commit`'s shell style by hand.
  </verify>
  <done>`pre-push-matrix.sh` exists; against the edited hook it prints `5/5 arms PASS` and exits
  0; against blob `c01fb5c` it prints `2/5 arms PASS` with arms D and E passing and exits
  non-zero; `pnpm planning-gates` is green. The SUMMARY records both scores, the tracer's
  measured graphify duration, and that bash 3.2 compatibility is by construction only (no bash
  3.2 on this machine to run the matrix under).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| check chain -> hook exit code | The only thing allowed to decide whether git proceeds with the push |
| PATH -> `graphify` | A PATH-resolved per-developer binary now executed on every passing push |
| git -> hook stdin | git writes the pushed-ref list to the hook's stdin |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qmz-01 | Tampering | `.husky/pre-push` exit status | high | mitigate | A failing check must never be masked as a pass. The chain's status is captured on line 3 as `checks_status` and is the hook's final `exit`; matrix arms D (exactly 3) and E (exactly 5) prove exact propagation, and the negative control proves the harness discriminates. |
| T-qmz-02 | Denial of Service | the graphify step | medium | mitigate | A missing or failing graphify must not block a push: `command -v` gate plus a warning on non-zero, no errexit, explicit `exit "$checks_status"`. Arms B and C prove both paths, and arm C's negative control proves graphify is really absent. |
| T-qmz-03 | Denial of Service | graphify wait or hang | low | accept | `graphify update` waits on graphify's own rebuild lock (bounded by the holder's run) and has no timeout. Wrapping it is out of scope: macOS has no `timeout` by default. Ctrl-C aborts the push and `git push --no-verify` bypasses the hook. |
| T-qmz-04 | Elevation of Privilege | PATH-resolved `graphify` | low | accept | Same trust level as the PATH-resolved `pnpm` already on line 2, on the developer's own machine. graphify already runs on this machine via the manual and agent-driven `graphify update .` that CLAUDE.md prescribes. |
| T-qmz-05 | Information Disclosure | `graphify-out/` contents | low | mitigate | `graphify-out/` is gitignored (`.gitignore:63`) and the rebuild writes only inside it; the Task 1 verify asserts `git check-ignore -q graphify-out/graph.json`. |
| T-qmz-06 | Denial of Service | hook stdin | low | mitigate | graphify runs with stdin from `/dev/null`, so it can neither consume the ref list nor wait on it; arm A asserts the graphify shim reads 0 bytes while the hook is fed a ref line. |
</threat_model>

<verification>
- `bash -n .husky/pre-push` is clean; mode is 100755 (`test -x`, then `git ls-tree HEAD` after the commit); lines 1-2
  byte-identical to blob `c01fb5c`; line 3 `checks_status=$?`; last statement
  `exit "$checks_status"`.
- Tracer: with `pnpm` shimmed, the hook exits 0 and the real graphify prints
  `Code graph updated.`
- Matrix: `5/5 arms PASS` against the edited hook; `2/5 arms PASS` (D and E only) against the
  pre-change blob.
- `pnpm planning-gates` green.
- No `git push` was run.
</verification>

<success_criteria>
Every passing push refreshes `graphify-out/` with the real `graphify update .`, and the hook's
exit code is exactly the existing chain's exit code in all five measured arms, whether graphify
is present, missing, or failing. The proof is a committed harness that demonstrably fails
against the old hook.
</success_criteria>

<output>
Create `.planning/quick/260928-qmz-add-graphify-update-to-husky-pre-push-so/260928-qmz-SUMMARY.md` when done
</output>
