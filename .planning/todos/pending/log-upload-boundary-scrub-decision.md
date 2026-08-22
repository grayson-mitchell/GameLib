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
