---
task: 260923-q6w
title: Grant disable-library-validation to steam-bridge-helper alone
date: 2026-09-23
status: complete
---

# Quick Task 260923-q6w Summary

Hazard 4 of the macOS notarization todo was an OPEN unknown. It is now an **observed crash with a
remedy proven locally**, scoped to exactly one of 253 binaries.

## Commits

| sha | what |
| --- | --- |
| `453b11375` | plist + `HELPER_ENTITLEMENTS` entry + path resolution/preflight |
| `146029393` | retired the ships-EMPTY tripwire, asserted exactly-one `--entitlements` |
| `026b23617` | recorded the finding in the notarization todo |
| `c34b0d9a0` | **fix: the plist was malformed and codesign refused it** (see below) |

## The defect found while resuming

The executor was terminated mid-run by a session rate limit, after all three task commits but
**before its verification battery finished**. Completing that battery caught a real defect in the
committed work.

`meta/steam-bridge-helper.entitlements.plist` carried `--` inside its XML comment, in three
places, which XML forbids. `codesign` rejected the entire file:

```
Failed to parse entitlements: AMFIUnserializeXML: syntax error near line 11
```

**Consequence had it shipped:** the CI signing step would have signed `steam-bridge-helper` with
no entitlement at all, and the dlopen crash this grant exists to fix would have returned — while
every gate stayed green.

**Why the suite missed it.** The test parsed the plist with `parsePlist` (the `plist` npm
package), which accepts what AMFI refuses. Two parsers, two answers, and the suite only ever asked
the lenient one. A new assertion now covers the stricter one: no double hyphen inside any XML
comment in the file. The plist also now carries a NOTE TO ANY EDITOR explaining that this is not a
style rule.

## Controls run (all of them, in both directions)

| control | expected | result |
| --- | --- | --- |
| new AMFI assertion vs the committed-broken plist | RED | **FAIL** ✓ |
| new AMFI assertion vs the fixed plist | GREEN | 38/38 pass ✓ |
| map key `steam-bridge-helper` → `nile` | RED | **4 failed** ✓ |
| map value → nonexistent plist | RED | **5 failed** ✓ |
| both reverted | GREEN | 38/38, clean `git diff` ✓ |

Control 1 proves the assertions bind to the **name**, not merely to "some entry exists". Control 2
proves the preflight fires rather than deferring to codesign's behaviour on a missing file.

## Post-fix verification

- `python3 plistlib` (expat, strict): parses to **exactly one key**,
  `com.apple.security.cs.disable-library-validation`; `allow-jit` absent.
- `codesign --entitlements` against a scratch binary: accepted, and
  `codesign -d --entitlements -` confirms the entitlement landed.
- Dry run over the real tree: **253 argv, exactly 1 carrying `--entitlements`**, and it is
  `build/bin/arm64/darwin/steam-bridge-helper`.
- `pnpm codecheck` exit 0 · `pnpm lint` exit 0, `production: PASS | tests: PASS` at **1107/1124**
  and **638/638** (the zero-headroom test ceiling, unchanged — the new test added no warnings) ·
  `pnpm find-deadcode` `unreachable: 47 OK | used-in-module: 0 OK` (exact-set ledger) ·
  `pnpm planning-gates` 12/12.
- `npx prettier --check` on the `.ts` is clean and **non-vacuous**. On the `.plist` it exits 2
  ("No parser could be inferred"), so the pre-commit hook's form was used instead
  (`git show :<file> | prettier --check --stdin-filepath`), exit 0.

## NOT VERIFIED

- **Whether Apple notarizes a binary carrying `disable-library-validation`.** Permitted for
  Developer ID distribution; permitted is not observed. This todo's whole history is about that
  distinction.
- Whether the helper works **from inside the real `.app`**, spawned by the sidecar. The evidence
  here is a binary invoked from a shell.
- The CI signing path itself. Signing was done locally with the production script, not through the
  workflow's throwaway-keychain step.

## Security disposition

`disable-library-validation` genuinely weakens a control. Accepted, scoped to **1 of 253**, because
that helper's entire job is dlopening Valve's `libsteam_api.dylib` — a different Team ID by
definition, unreachable by signing our own files. Nothing about that reasoning extends to the other
252, and the suite now fails if the grant moves or widens.
