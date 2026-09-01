---
created: 2026-08-22T00:00:00.000Z
title: "Decide whether log upload needs a boundary scrub (defense in depth) — source-level discipline is currently the only control"
area: security
files:
  - src/backend/logger/uploader.ts
  - src/backend/logger/
---

## Problem

`.planning/debug/resolved/log-upload-has-no-redaction.md` closed the *reachability* question:
every credential in the backend was censused, one real leak was found (GOG token-exchange stdout
in `gog/user.ts`) and fixed at the source, and the rest were eliminated with per-site verdicts.

What that session did NOT do is add redaction at the **upload boundary**. `uploadLogFile` still
POSTs up to 10 MiB of log content to `https://dpaste.com/api/v2/` verbatim. The only thing
standing between a credential and a public paste is per-call-site discipline — the
`keyPresent=` / `bodyLength=` / `len=` convention used consistently across `humble/`,
`keyringTokenStore.ts` and `devSecretVault.ts`.

That discipline is currently sound (77 secret-adjacent log calls reviewed, 1 defect), but it is
unenforced: nothing fails CI when a new log call interpolates a secret. The next one lands
silently.

## Decision required (this is a design call, not a defect)

**Option A — do nothing.** Keep source-level discipline as the sole control. Cheapest; relies on
review. The 34.5 census + this one both found the discipline holding, so the base rate is low.

**Option B — boundary scrub.** Regex-scrub known token shapes in `uploadLogFile` before POST.
Argued AGAINST in the debug session's "Deferred decision" section: it can only catch patterns
someone anticipated, this session's finding was not pattern-shaped (a token inside an otherwise
ordinary stdout dump), and shipping it risks *manufacturing confidence* that retires the
source-level convention that actually works.

**Option C — a lint/AST gate.** Fail CI when a log call interpolates an identifier named
`stdout`/`token`/`password`/`cookie`/`secret` without `.length`. Catches the defect class this
session actually found, at its source, and is enforceable. More work than A, more targeted
than B. **Recommended if anything is done at all.**

Note for whoever picks this up: the multi-line census script in the resolved debug ledger's
Evidence section is reusable as the gate's core — a line-oriented grep provably MISSES this
defect class (it missed the real finding in this very session; `logError(` and its template
literal sit on different lines).

## Non-goal

Do not reopen the reachability audit. It was done exhaustively on 2026-08-22 and every vector
has a recorded verdict. This todo is only about whether to add a second layer.

---

## Decision (2026-09-01): **Option C, narrowed.** Not A, not B.

Resolved by quick task `260901-nvg`. Commit `cd5a5c8bb`.

### The measurement that decided it

The three options were argued in the abstract above. Before picking one, the candidate gate was
built as a throwaway ts-morph probe and run against the real `src/backend` tree, because the only
thing that separates a useful gate from a suppressed one is its false-positive rate, and that is
measurable rather than arguable.

**This todo's own suggested vocabulary was wrong.** Option C as written above proposes flagging
identifiers named `stdout`/`token`/`password`/`cookie`/`secret`. Run as written that yields
**23 hits, roughly 22 of them false**:

| identifier | hits | what it actually means |
| ---------- | ---- | ---------------------- |
| `key`      | 6    | config/settings key **names** (`game_config.ts:326`, `logger/index.ts:200`, `humbleSecretStore.ts` x3) |
| `code`     | 4    | process **exit** codes (`bottle.ts:804`/`:1212`, `helperProcess.ts:124`, `importScan.ts:112`) |
| `stderr`   | 10   | tool stderr |
| `stdout`   | 3    | process stdout |

Shipping that vocabulary would have produced a gate that fires on normal use from day one, which
gets suppressed wholesale and is worse than no gate.

**Tuned, it is affordable.** Dropping `key`/`code`/`session` and teaching the scan to accept
`.length`, `!`/`!!` and `Boolean(...)` as reductions gives a **baseline of 12**, entirely process
output: `stderr` x10 (robocopy, rsync, `mv -f`, `tar -xf`, cxbottle x2, `cmd /c winepath`,
powershell VCRuntime probe, legendary toggle-sync, game launch) and `stdout` x2 (REDmod deploy,
legendary toggle-sync). All twelve were read at the call site; no auth command is among them.

**Side result worth recording:** there are **zero** unguarded `token` / `refreshToken` /
`accessToken` / `password` / `cookie` / `secret` / `credentials` / `sessionId` / `apiKey`
identifiers in any backend log call. That reproduces the 2026-08-22 census's conclusion by a
different method — an AST walk rather than the python brace-matching scan — which is worth more
than the original single-method result.

### Why not B

Rejected, and for one reason beyond those already in the ledger: the measurement shows there is
nothing reliable to match *at the sink*. The asymmetry that decides it is that at the sink you
match unbounded token **values** over 10 MiB of arbitrary text, while at the source you match a
small bounded vocabulary of identifier **names**. Only the second is tractable.

### Why not A — and how close it was

Closer than the framing above implies. The gate ships with 12 exemptions and 0 current catches,
and each of those 12 is benign *because of which command produced the output*, which the gate
structurally cannot see. So its value is narrower than "prevents credential leaks": it forces a
conscious act at the moment someone writes a raw-output log call. That is exactly the control that
was absent when `gog/user.ts:97` was written, so it is worth having — but it is documented as
that, in the module header, and not as a guarantee.

### What shipped

- **`meta/logSecretGate.ts`** — ts-morph scan, mirroring `meta/hardcodedStringGate.ts`'s idiom.
  Scope is a **live glob** over `src/backend`, not a committed snapshot: a snapshot is a thing
  someone can scope a file out of, silently shrinking the gate.
- **`meta/__tests__/logSecretGate.test.ts`** — 60 tests. Lives in the `meta` jest project, so
  `pnpm test:ci` runs it in CI with **no new workflow wiring**; a gate needing a bespoke step is
  one that ends up running nowhere (cf. `meta/checkRunnerInvocations.ts`, wired to nothing).
- **12 individual exemptions**, each a `log-secret-gate-exempt: <reason>` comment naming the
  command whose output it is. **No whole-file marker exists**, deliberately — `utils.ts` alone
  holds five sites, and a file-level marker there would blank a 1,700-line file. A bare marker
  with no reason exempts nothing (asserted).
- **RED-proven against the real defect, not a synthetic one.** The pre-fix `gog/user.ts` line was
  reintroduced into the live tree and the ratchet went red naming that exact call site
  (`src/backend/storeManagers/gog/user.ts:110  process-output  "stdout" reaches a log call
  unreduced`). Restored via `cp`, never `git checkout` (post-checkout hook hazard); `git status`
  confirms the file is byte-identical to HEAD.

### Still true, and deliberately not done

`uploadLogFile` still POSTs up to 10 MiB verbatim to `https://dpaste.com/api/v2/`. That is the
accepted consequence of choosing C over B. The control on that surface remains source-level
discipline — now enforced at the point where it is written, rather than only reviewed.

Related: [[log-upload-has-no-redaction]] (the audit this closes the follow-up of),
[[uploaded-log-delete-button-lies]] (the other half of this surface).
