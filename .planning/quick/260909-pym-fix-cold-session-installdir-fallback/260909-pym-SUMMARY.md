---
phase: quick-260909-pym
plan: 01
subsystem: steam-depot
tags: [steam, installLocation, acf, pics, ensureConnected, tdd]
requires: []
provides:
  - readAcfInstalldir (src/backend/storeManagers/steam/acfInstalldir.ts)
  - STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS (src/backend/storeManagers/steam/withTimeout.ts)
affects:
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/library.ts
tech-stack:
  added: []
  patterns:
    - "Shared leaf module for a filesystem read used by two callers that must never diverge (mirrors the existing single-sanitizer pattern)"
    - "ensureConnected() awaited with an explicit withTimeout bound before a decision that depends on connection state, rather than an unbounded await"
key-files:
  created:
    - src/backend/storeManagers/steam/acfInstalldir.ts
    - src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts
  modified:
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/withTimeout.ts
    - .planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md
decisions:
  - "ACF takes precedence over PICS in resolveSteamInstallTarget, and short-circuits the connect/PICS round-trip entirely when found — protects the three live app_257350/app_25900/app_402060 installs from ever growing a second directory on reinstall"
  - "STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS = 20000ms keeps the inner worst case (45000ms) strictly under games.ts's 50000ms outer WR-01 bound, with 5000ms headroom"
  - "The ACF candidate funnels through the exact same sanitizeInstalldir call as the PICS candidate — no ACF-only bypass, UnsafeInstalldirError not caught for either source"
metrics:
  duration: "~55 minutes"
  completed: 2026-09-09
---

# Phase quick-260909-pym Plan 01: Fix cold-session installdir fallback Summary

Cold-session native Steam installs stopped resolving the real title directory
name via `SteamUser.ensureConnected()`, and an existing on-disk ACF now wins
over a fresh PICS lookup so a reinstall reuses its own directory instead of
creating a duplicate `app_<appid>` beside it.

## What was built

**Task 1 — `acfInstalldir.ts` (new leaf module) + RED tests.** Extracted
`readAcfInstalldir(steamappsDir, appId)` as the single source both
`installLocation.ts` and `library.ts` now use to read an on-disk
`appmanifest_<appId>.acf`'s `installdir`, returning the raw on-disk value with
no sanitization (D-03 contract — sanitization is the caller's job via the one
shared `sanitizeInstalldir`). 8 new tests in `acfInstalldir.test.ts` cover
present/absent/corrupt/blank-installdir/whitespace-only/read-throw cases plus
a `'../../evil'` fixture pinning the no-sanitization contract. Added three RED
tests plus a negative control to `installLocation.test.ts` against the
unmodified `installLocation.ts`.

**Task 2 — `installLocation.ts` fix.** `fetchInstalldir`'s cold path
(`SteamUser.getClient()` null) now awaits `SteamUser.ensureConnected()`,
bounded by a new `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS = 20000` exported from
`withTimeout.ts`, then retries `getClient()` — a connect failure, rejection,
or timeout all still fall through to the existing safe `app_<id>` fallback.
`resolveSteamInstallTarget` now reads an existing on-disk ACF first via
`readAcfInstalldir` and, when found, skips the connect/PICS round-trip
entirely; otherwise it falls through to `fetchInstalldir` as before. Both
candidate sources funnel through the same `sanitizeInstalldir` call.
`installdirFallbackUsed` is now derived from the finally-chosen candidate
(ACF or PICS), not the PICS variable alone.

**Task 3 — `library.ts` routed through the shared helper.**
`locateDownloadingTarget`'s inline `existsSync`/`readFileSync`/`parse` ACF
read was replaced with a call to `readAcfInstalldir`. The per-library loop and
`continue`-on-falsy-installdir behaviour are unchanged. The
cold-session-installdir todo was marked `RESOLVED` with a resolution note.

## RED evidence (Task 1, verbatim, against unmodified `installLocation.ts`)

Command: `npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/installLocation.test.ts`

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Running one project: Backend
FAIL Backend src/backend/storeManagers/steam/__tests__/installLocation.test.ts
  listSteamLibraryTargets
    ✓ returns every registered library, primary first (1 ms)
  resolveSteamInstallTarget
    ✓ with one registered library, defaults to that library, no override needed
    ✓ D-09: with multiple libraries and an override matching a registered library, uses it
    ✓ D-08: an override NOT matching any registered library is rejected, defaults to primary
    ✓ D-02/D-04: a hostile PICS installdir (traversal) ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion, which is wrong under D-04 (a containment violation is a security event, not a silent fallback) (4 ms)
    ✓ D-02/D-04: a hostile PICS installdir (path separator) ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion (1 ms)
    ✓ falls back to a safe appId-derived installdir when PICS returns nothing
    ✓ WR-01: a never-settling installdir getProductInfo does NOT hard-fail — fetchInstalldir bounds it, catches, and resolveSteamInstallTarget RESOLVES with a safe fallback dir (never rejects) (1 ms)
    ✓ T-21-05: rejects a non-numeric appId before any PICS lookup, still resolves via fallback installdir
    ✓ WR-04/D-02/D-04: a quote-containing installdir ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion; quote stays denylisted as defense-in-depth against VDF injection even though downstream manifest.ts already escapes it
    ✓ WR-04/D-02/D-04: a control-char/newline-containing installdir ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion; control chars are part of D-02's literal denylist
    ✓ WR-04/D-02/D-04: a Windows drive-relative installdir (colon, no separator) ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion; colon stays denylisted as defense-in-depth against the Windows drive-relative escape (path.win32.resolve semantics), which the POSIX containment check alone cannot catch in this environment
    ✓ WR-04: a well-formed installdir with spaces/dots/dashes/underscores passes through unchanged
    ✓ D-02/D-04/T-37-03: resolveSteamInstallTarget REJECTS with UnsafeInstalldirError for a traversal installdir, rather than resolving to a safe fallback
    ✕ RED-1 (cold session): a cold-session resolve awaits ensureConnected and reads the real PICS installdir, instead of returning app_<appid> in 1ms (1 ms)
    ✕ RED-2 (ACF precedence): an existing on-disk ACF wins over PICS, so a reinstall/resume never creates a second directory beside a live install (1 ms)
    ✕ RED-3 (ACF short-circuits the connect): a reinstall over an existing ACF pays no cold connect and no PICS round-trip at all
    ✓ negative control: getClient() null AND ensureConnected resolves false still resolves (never rejects) with the safe app_<id> fallback — keeps RED-1 honest, passes at HEAD and after Task 2
    ✓ throws when no Steam libraries are registered at all
  sanitizeInstalldir — REQ-37-06: containment, not character class
    ✓ D-02: accepts "Sid Meier's Civilization V" unchanged — the live specimen, appId 8930
    ✓ D-02: accepts "Len's Island" unchanged — the ACF-measured specimen, currently installed via Steam
    ✓ accepts "Half-Life 2" unchanged — restated against the new containment path to prove the rewrite did not lose ordinary punctuation
    ✓ D-02 precondition: "../../etc" (the RED traversal case the todo explicitly demands) THROWS UnsafeInstalldirError naming the value (1 ms)
    ✓ throws for an absolute-path candidate, naming it
    ✓ throws for a forward-slash separator candidate ("foo/bar")
    ✓ throws for a backslash separator candidate ("foo\\bar") (1 ms)
    ✓ throws for a bare ".." candidate
    ✓ throws for a leading-dot candidate (".hidden")
    ✓ throws for a trailing-dot candidate ("trailing.")
    ✓ throws for a newline control-character candidate ("Foo\nbar")
    ✓ throws for a NUL control-character candidate
    ✓ D-04: undefined candidate falls back to app_<id> WITHOUT throwing, and LOGS a warning naming the appId and the fallback name (1 ms)
    ✓ D-04: whitespace-only candidate ("   ") falls back to app_<id> WITHOUT throwing, and LOGS a warning
  classifyDepotError reachability — UnsafeInstalldirError (D-04, T-37-03)
    ✓ an UnsafeInstalldirError classifies as steam.download.error.unsafePath via the existing /traversal/i branch, with no change to depotErrors.ts
  37-REVIEW C-01: games.ts classifies UnsafeInstalldirError itself
    ✓ imports classifyDepotError rather than only naming it in a comment
    ✓ returns the CLASSIFIED message, never the raw err.message
    ✓ still logs the raw candidate, so the diagnostic is not lost
    ✓ is non-vacuous: the exact shipped-defect shape fails this gate

  ● resolveSteamInstallTarget › RED-1 (cold session): a cold-session resolve awaits ensureConnected and reads the real PICS installdir, instead of returning app_<appid> in 1ms

    expect(received).toBe(expected) // Object.is equality

    Expected: "Avadon The Black Fortress"
    Received: "app_12345"

      381 |     // ensureConnected calls — the getClient() null-guard returns
      382 |     // `undefined` from fetchInstalldir before ever awaiting a connection.
    > 383 |     expect(result.installdir).toBe('Avadon The Black Fortress')
          |                               ^
      384 |     expect(result.installdirFallbackUsed).toBeUndefined()
      385 |     expect(jest.mocked(SteamUser.ensureConnected)).toHaveBeenCalled()
      386 |   })

      at Object.<anonymous> (src/backend/storeManagers/steam/__tests__/installLocation.test.ts:383:31)

  ● resolveSteamInstallTarget › RED-2 (ACF precedence): an existing on-disk ACF wins over PICS, so a reinstall/resume never creates a second directory beside a live install

    expect(received).toBe(expected) // Object.is equality

    Expected: "app_257350"
    Received: "Baldurs Gate II Enhanced Edition"

      405 |     // At HEAD this fails: it returns the PICS name, which is exactly the
      406 |     // second-directory-beside-a-live-install harm this plan fixes.
    > 407 |     expect(result.installdir).toBe('app_257350')
          |                               ^
      408 |   })
      409 |
      410 |   it('RED-3 (ACF short-circuits the connect): a reinstall over an existing ACF pays no cold connect and no PICS round-trip at all', async () => {

      at Object.<anonymous> (src/backend/storeManagers/steam/__tests__/installLocation.test.ts:407:31)

  ● resolveSteamInstallTarget › RED-3 (ACF short-circuits the connect): a reinstall over an existing ACF pays no cold connect and no PICS round-trip at all

    expect(received).toBe(expected) // Object.is equality

    Expected: "app_257350"
    Received: "app_12345"

      425 |     // getProductInfo was never reachable anyway) — assert the installdir
      426 |     // too so it is non-vacuous once Task 2 wires the ACF-first branch.
    > 427 |     expect(result.installdir).toBe('app_257350')
          |                               ^
      428 |     expect(jest.mocked(SteamUser.ensureConnected)).not.toHaveBeenCalled()
      429 |     expect(client.getProductInfo).not.toHaveBeenCalled()
      430 |   })

      at Object.<anonymous> (src/backend/storeManagers/steam/__tests__/installLocation.test.ts:427:31)

Test Suites: 1 failed, 1 total
Tests:       3 failed, 35 passed, 38 total
Snapshots:   0 total
Time:        0.529 s, estimated 1 s
Ran all test suites matching /src\/backend\/storeManagers\/steam\/__tests__\/installLocation.test.ts/i.
```

Exactly 3 failures (RED-1, RED-2, RED-3), all pre-existing tests plus the
negative control (35) still passing. The failure is behavioural
(`Received: "app_12345"` / `Received: "Baldurs Gate II Enhanced Edition"`),
not a module-resolution error — `acfInstalldir.ts` was created in this same
task specifically so `installLocation.test.ts` could import
`readAcfInstalldir` for arming without a `Cannot find module` red.

## GREEN evidence (Task 2)

Command: `npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/installLocation.test.ts src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts`

```
PASS Backend src/backend/storeManagers/steam/__tests__/installLocation.test.ts
PASS Backend src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts

Test Suites: 2 passed, 2 total
Tests:       46 passed, 46 total
```

`grep -v '^\s*[/*]' src/backend/storeManagers/steam/installLocation.ts | grep -c 'ensureConnected'` → `3` (real call in code, not only in prose).
Exactly one `sanitizeInstalldir(` call site inside `resolveSteamInstallTarget`, reached by both the ACF and PICS candidate paths.

## Full-suite verification (Task 3)

Command: `npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/`

```
Test Suites: 38 passed, 38 total
Tests:       2 skipped, 1412 passed, 1414 total
```

- `npx tsc --noEmit -p tsconfig.json` → clean, no output.
- `npx eslint <six touched files>` → exit 0, 0 errors, 114 warnings (all pre-existing patterns — the two `no-unsafe-assignment`/`no-unsafe-member-access` warnings in the new `acfInstalldir.ts` are the same untyped-`@node-steam/vdf`-`parse()` shape already present at every other ACF-read call site in `library.ts`).
- `npx prettier --check <six touched files>` → initially flagged `acfInstalldir.test.ts`; fixed via `prettier --write`, then re-verified clean and re-ran the suite to confirm the reformat didn't change behavior (8/8 still passing).
- `pnpm planning-gates` → `9/9 planning gates passed.`

`git status --porcelain src/` after all three commits shows a clean tree for `src/` — every file this plan touched is committed, and no file outside the declared set (`acfInstalldir.ts`, `acfInstalldir.test.ts`, `installLocation.test.ts`, `installLocation.ts`, `library.ts`) was modified.

## TDD Gate Compliance

- RED gate: `1630e509a test(quick-260909-pym): extract shared ACF installdir reader, land RED tests`
- GREEN gate: `5b681d24a fix(quick-260909-pym): connect before deciding, prefer on-disk ACF over PICS`
- Task 3 (non-TDD, `type="auto"` without `tdd="true"`): `192acc10e fix(quick-260909-pym): route library.ts through the shared ACF reader`

Both required gate commits are present and correctly ordered.

## Deviations from Plan

None — plan executed exactly as written. The one unplanned action (running
`prettier --write` on `acfInstalldir.test.ts` after `prettier --check`
flagged formatting) is a mechanical formatting fix within Task 3's own
`prettier --check` verify step, not a deviation from the plan's design.

## Hard constraints held

- `sanitizeInstalldir`'s signature, denylist, and warning string are byte-for-byte unchanged; both existing pinned tests (`~L478`/`~L493` region) still pass unchanged.
- The no-hard-fail degrade is preserved: the negative control (`getClient()` null AND `ensureConnected` resolves `false`) still resolves (never rejects) with `app_12345` / `installdirFallbackUsed: true`.
- WR-01 arithmetic: `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS` (20000) + `STEAM_PICS_TIMEOUT_MS` (25000) = 45000ms inner worst case, strictly under `games.ts`'s 50000ms outer bound — arithmetic documented in the constant's own docstring in `withTimeout.ts`.
- ACF precedence over PICS is in place (RED-2/RED-3 now GREEN).
- `installdirFallbackUsed` is derived from the finally-chosen candidate.
- No file or command in this plan touched `~/Library/Application Support/Steam` or any `steamapps/common/app_*` path — this was pure source + tests + docs, verified by inspection of every file this plan modified (all listed above, none under a Steam data path).

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/acfInstalldir.ts
- FOUND: src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts
- FOUND: src/backend/storeManagers/steam/installLocation.ts (modified)
- FOUND: src/backend/storeManagers/steam/library.ts (modified)
- FOUND: src/backend/storeManagers/steam/withTimeout.ts (modified)
- FOUND: .planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md (status: RESOLVED)
- FOUND commit 1630e509a (Task 1 — test)
- FOUND commit 5b681d24a (Task 2 — fix)
- FOUND commit 192acc10e (Task 3 — fix)
