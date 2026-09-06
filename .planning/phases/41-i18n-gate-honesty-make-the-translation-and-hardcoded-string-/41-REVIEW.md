---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
reviewed: 2026-09-06T06:31:58Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - meta/lintTranslations.ts
  - meta/hardcodedStringGate.ts
  - meta/__tests__/lintTranslations.test.ts
  - meta/__tests__/hardcodedStringGate.test.ts
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/__tests__/gamelibCatalogParity.test.ts
  - meta/i18nGateScope.json
  - meta/i18nCatalogPresenceBaseline.json
  - public/locales/en/gamelib.json
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-09-06T06:31:58Z
**Depth:** standard
**Files Reviewed:** 8 (+ `public/locales/en/gamelib.json` data artifact)
**Status:** issues_found

## Summary

Phase 41 rewrote `meta/lintTranslations.ts` from a fire-and-forget script into an
importable, path-injectable module, widened `meta/hardcodedStringGate.ts`'s D-14
declaration-site exemptions, authored six previously-empty English strings, and
committed a 794-pair drift-detecting presence baseline. The test suite for all
four in-scope jest projects passes (392/393, 1 unrelated skip-name false match),
verified by direct re-run.

Three of the five things I was specifically asked to judge turned out to hide
real defects, not just style nits:

1. The CLI guard's own justifying comment is **empirically false** — I proved
   this by requiring a probe module from inside a `meta/` jest test and reading
   `require.main.filename`: under ts-jest, `require.main` resolves to the
   **test file**, never to the module being required, so the standard
   `require.main === module` idiom would have been *safe* under jest, contrary
   to the comment's claim. The module also has a genuine disk-write path
   (`writePresenceBaseline`), so the weaker guard is not merely inelegant.
2. `comparePresenceBaseline`'s wiring into `lintTranslations()` silently
   no-ops — no finding, no hard failure, no log line — whenever the caller's
   `localesPath` doesn't textually resolve to the literal string
   `public/locales` relative to `process.cwd()`, or whenever the baseline
   file is simply absent. This is exactly the "fails open with nothing to see"
   shape this entire phase exists to eliminate elsewhere.
3. A corrupt `en/*.json` catalog is not actually handled the way the module's
   own header claims. I reproduced this directly: `lintTranslations()` throws
   an **uncaught** `CorruptCatalogError` when the *English* source itself is
   corrupt (as opposed to a locale catalog, which is caught inside
   `checkLanguage()`), crashing the whole run with a raw stack trace instead
   of the promised "hard, counted, named failure ... no stack trace in gate
   output" (T-41-03-04).

The hardcoded-string-gate widening (concern 4) is narrower than it looks but is
not dataflow-verified — flagged as a WARNING, not a blocker, since its only
real-world user today (`chipLabels.ts`) is legitimate and the risk is
theoretical. The presence-baseline drift check (concern 5) is genuinely
bidirectional and not vulnerable to a hardcoded-count drift; I found no issue
there worth reporting beyond an INFO note.

## Critical Issues

### CR-01: A corrupt English catalog crashes the whole lint run instead of producing the promised named hard failure

**File:** `meta/lintTranslations.ts:115-131` (`readCatalog`), `meta/lintTranslations.ts:565-568` (`lintTranslations`'s unguarded `readCatalogs(opts.localesPath, 'en', opts.namespaces)` call)

**Issue:** The module's own header and `CorruptCatalogError`'s doc-comment both
assert: *"A corrupt catalog is a real defect in a file that exists ... it is a
hard failure regardless of namespace ownership"* and (T-41-03-04) *"no stack
trace in gate output."* This is true for a **locale's** catalog — `checkLanguage()`
(around line 610) catches `CorruptCatalogError` and pushes a clean, named
message into `result.hardFailures`. It is **not** true for the **English**
source catalog: `lintTranslations()` calls
`readCatalogs(opts.localesPath, 'en', opts.namespaces)` directly, with no
try/catch, and `readCatalogs`/`readCatalog` throw `CorruptCatalogError`
unfiltered. I reproduced this directly against a scratch fixture (corrupt
`en/gamelib.json`, valid `xx/gamelib.json`):

```
THREW: CorruptCatalogError
```

`lintTranslations()` never returns; the exception propagates out of `main()`
uncaught, so `pnpm lint-translations`/`pnpm lint-translations:gamelib` would
exit with Node's raw uncaught-exception stack trace rather than the module's
own clean, named-failure convention. No test in
`meta/__tests__/lintTranslations.test.ts` exercises "the EN catalog itself is
corrupt" — every `CorruptCatalogError` test (R4, and the direct `readCatalog()`
unit test) corrupts a **locale** file, never `en`.

**Fix:** Wrap the English read the same way `checkLanguage()` wraps a locale
read, and route the failure into `result.hardFailures` by namespace:

```ts
export function lintTranslations(opts: LintOptions): LintResult {
  const result: LintResult = { findings: [], hardFailures: [] }
  const enCatalogs: Partial<Record<Namespace, CatalogRecord | null>> = {}

  for (const namespace of opts.namespaces) {
    try {
      enCatalogs[namespace] = readCatalog(opts.localesPath, 'en', namespace)
    } catch (error) {
      if (error instanceof CorruptCatalogError) {
        result.hardFailures.push(error.message)
        continue
      }
      throw error
    }
  }
  // ...rest unchanged, using enCatalogs instead of readCatalogs(...)
}
```
Add a fixture test mirroring R4 but corrupting `en/gamelib.json` instead of a
locale file, asserting a named hard failure and no thrown exception.

---

### CR-02: `comparePresenceBaseline` silently no-ops with zero diagnostic for any non-canonically-spelled (but equivalent) `localesPath`, or when the baseline file is missing

**File:** `meta/lintTranslations.ts:557-577` (the `isCanonicalLocalesPath` gate inside `lintTranslations()`)

**Issue:** The live drift check is gated by:

```ts
const isCanonicalLocalesPath =
  resolve(opts.localesPath) === resolve(CANONICAL_LOCALES_PATH)
...
if (!isForkOwned(namespace) || !isCanonicalLocalesPath || !existsSync(PRESENCE_BASELINE_PATH)) {
  continue
}
```

When any of these three conditions is false, the loop `continue`s with **no
finding pushed, no hard failure pushed, no console output at all** — the run
reports a clean `0 hard failures` exactly as if the drift check had run and
found nothing, when in fact it never ran. Per the phase's own plan notes, this
gate was "added mid-execution because wiring it unconditionally broke 4
fixture-based tests" — i.e. it is a pragmatic patch, not a validated design.

Concretely, this silently disables drift detection if:
- The baseline file (`meta/i18nCatalogPresenceBaseline.json`) is ever deleted
  or renamed by accident — the check simply stops running, forever, with zero
  indication anywhere in the gate's output.
- A future caller invokes `lintTranslations()` with an absolute path to the
  real `public/locales` directory (e.g. `resolve(__dirname, '../public/locales')`
  from a different `cwd`), or any spelling that is logically the same
  directory but does not `path.resolve()`-normalize to the exact literal
  `public/locales` relative to the current working directory.

Today's CLI (`main()`'s hardcoded `'./public/locales'`) and the two live-tree
jest tests (R6, R13) both happen to use the literal string that matches
canonical, so this doesn't currently bite — but nothing tests the boundary
itself (there is no test asserting the check reports *something* diagnosable
when it is skipped), so a future refactor that changes path spelling, or an
accidental deletion of the baseline file, regresses silently past every
existing green test. This is precisely the "gate that fails open" class this
phase's own `REQ-41-02` work explicitly eliminated for ENOENT catalogs
elsewhere in this same file.

**Fix:** When the gate is skipped for a fork-owned namespace, emit a visible,
named diagnostic rather than a silent `continue` — at minimum a `findings`
entry (not a `hardFailures`, to avoid breaking the fixture tests this was
patched around), e.g.:

```ts
if (isForkOwned(namespace) && !existsSync(PRESENCE_BASELINE_PATH)) {
  result.findings.push(
    `presence baseline drift check skipped for ${namespace}: ` +
      `${PRESENCE_BASELINE_PATH} does not exist`
  )
  continue
}
if (isForkOwned(namespace) && !isCanonicalLocalesPath) {
  result.findings.push(
    `presence baseline drift check skipped for ${namespace}: ` +
      `localesPath "${opts.localesPath}" does not resolve to the canonical ` +
      `"${CANONICAL_LOCALES_PATH}"`
  )
  continue
}
```
Add a test asserting this finding appears when the baseline file is
temporarily absent, and one asserting it appears for a non-canonical (but
still real) `localesPath`.

---

### CR-03: The CLI guard's justification comment is empirically false, and the guard it defends is narrower than the "no file writes" premise assumes

**File:** `meta/lintTranslations.ts:653-660` (the trailing `if (!process.env.JEST_WORKER_ID) main()` guard and its comment)

**Issue:** The comment reads:

> "This script is run via `node meta/runTs.cjs` ... which DOES set
> `require.main` -- but this module is also imported directly by its jest
> suite, so the usual `require.main === module` idiom would run this at
> import time under test too."

I verified this claim directly rather than accepting it: I required a probe
module from inside a real `meta/` jest test (`ts-jest`, this repo's actual
transform) and logged `require.main === module`, `require.main.filename`, and
`module.filename`:

```
PROBE require.main === module -> false
PROBE require.main.filename -> .../meta/__tests__/zzreqmainprobe.test.ts
PROBE module.filename -> .../reqmaintest_probe.ts
```

`require.main` resolves to the **test file**, not to the required module —
`require.main === module` is `false` inside a module required by a ts-jest
test, exactly the opposite of what the comment claims. The standard
`require.main === module` idiom would therefore have been **safe** under jest
here, and — unlike the chosen `JEST_WORKER_ID` check — it would *also*
correctly refuse to run when the module is loaded any other way that isn't
the literal process entry point (e.g. `npx tsx -e "import { readCatalog } from
'./meta/lintTranslations'"`), which the `JEST_WORKER_ID` guard does **not**
protect against at all.

This matters concretely because the reviewer brief's own premise — "the
module performs no file writes, so the blast radius is bounded" — is false:
`main()` has a real disk-write branch,
`if (process.env.LINT_TRANSLATIONS_WRITE_BASELINE === '1') { writePresenceBaseline(localesPath); return }`,
which calls `writeFileSync(PRESENCE_BASELINE_PATH, ...)` against the
**hardcoded, checked-in path** `meta/i18nCatalogPresenceBaseline.json`. A
one-off probe of the exact shape this project has already been bitten by once
(`importing-a-meta-script-runs-its-main-and-rewrites-the-artifact.md`, for
`genI18nGateScope.ts`) —
`LINT_TRANSLATIONS_WRITE_BASELINE=1 npx tsx -e "import './meta/lintTranslations'"`
— runs outside jest (`JEST_WORKER_ID` unset), passes straight through the
chosen guard, and silently overwrites the committed 794-pair baseline with a
fresh `generatedAt` timestamp and whatever `missing` set the live tree
currently produces. This is the exact bug class the phase's own `T-41-05-01`
comment claims to guard against ("this project has a recorded failure where
importing a meta script ran its main and rewrote a committed artifact"), just
reintroduced one level over via a guard that only recognizes one specific
import context (jest) instead of "not the process entry point" in general.

**Fix:** Use the standard, verified-safe idiom instead of the
jest-environment-variable check, and correct or remove the false claim in the
comment:

```ts
// This script is run via `node meta/runTs.cjs`, which sets `require.main` to
// this module. Verified empirically (meta/ ts-jest suite) that
// `require.main === module` is FALSE when this module is `import`ed by a
// jest test — require.main resolves to the test file, not to this module —
// so the standard idiom is safe under jest AND correctly refuses to run
// under any other non-entry-point import (tsx, ts-node, ad-hoc probes).
if (require.main === module) {
  main()
}
```
If esbuild's CJS/ESM interop for the bundled CLI path makes `require.main`
unavailable or unreliable in that specific bundle shape, that constraint
should be demonstrated (the same way this finding demonstrates the jest
side), not assumed — the current comment demonstrates neither.

## Warnings

### WR-01: The R5 "import purity" test cannot actually detect the removal of the guard it is named for

**File:** `meta/__tests__/lintTranslations.test.ts:187-201` (R5)

**Issue:** R5's docstring claims: *"proving `process.exit` was not called is
proof that `main()` — and therefore the walk it triggers — never ran
either."* That inference is not valid against the current committed tree:
`main()`'s normal execution path only calls `process.exit(1)` when
`result.hardFailures.length > 0`. Against the real, committed
`public/locales` tree, hard failures are (by design, per R6) zero. So if the
top-level guard were changed from `if (!process.env.JEST_WORKER_ID) main()` to
an unconditional `main()`, R5 would **still pass** — `main()` would run to
completion (reading the real tree, printing several `console.log` lines),
call `process.exit` zero times because there are zero hard failures today,
and the spy assertion (`exitSpy not called`) would be satisfied regardless.
R5 is not capable of failing under that specific regression; the only test
that actually catches guard removal is R15 (which observes a real
side-effecting write via file bytes/mtime).

**Fix:** Either spy on a directly-observable side effect of `main()` itself
(e.g. `console.log`, or `readdirSync`) rather than `process.exit`, or narrow
R5's docstring to stop claiming it proves `main()` never ran — its actual,
provable claim is narrower ("importing does not call `process.exit`").

### WR-02: `isKeyDefaultTupleElement`/`isKeyDefaultObjectProperty` exempt by structural shape alone, never verified against an actual `t()`/`tGamelib()` call site

**File:** `meta/hardcodedStringGate.ts:1219-1284`

**Issue:** Both the pre-existing 2-tuple exemption and this phase's new
`{ key, defaultText }` object-pair exemption fire purely on property/element
shape (a dotted-or-`ns:`-prefixed `key` string plus a sibling `defaultText`/
second-tuple-element string) — there is no check anywhere that a `t()`-alias
call is ever actually made with that `key`/`defaultText` pair. This is a
known, documented trade-off ("a pure per-call-site check cannot see this
link"), but it does mean any future object literal anywhere in the 174-file
blocking scope with properties literally named `key` (dotted-shaped) and
`defaultText` (a plain string) is silently exempted from the gate even if
those two strings are never passed to `t()` — e.g. a config/cache object that
coincidentally uses this exact shape for an unrelated purpose and renders
`defaultText` directly. I confirmed the *current* real footprint is narrow
(`chipLabels.ts` is the only real user of the object-pair shape;
`CrossoverBadge.tsx`/`stateLabels.ts`/`facetLabels.ts` use the tuple shape,
all genuinely wired to `t()`), so this is not exploitable today, but it is an
unenforced assumption rather than a proven invariant, and the blast radius
grows every time the blocking scope widens.

**Fix:** No change required to ship this phase, but consider a light dataflow
check (does `key`/`spec.key` reach a `t`-alias call anywhere in the file?) the
next time this exemption's real-world footprint grows, or add a comment at
the exemption site making the "not verified downstream" caveat as explicit as
the code's own docstrings already make it for the pattern in prose.

### WR-03: `readCatalog()` treats every read failure (not just ENOENT) as "catalog absent"

**File:** `meta/lintTranslations.ts:117-124`

**Issue:** `readCatalog()`'s bare `catch { return null }` swallows any
`readFileSync` failure — permission-denied (EACCES), a directory where a file
was expected (EISDIR), a transient I/O error, etc. — identically to a
genuinely-absent file. The comment documents this as deliberate ("Returns
`null` if the file is absent (ENOENT or **any other read failure**)"), but it
means a real environment/filesystem problem on a fork-owned catalog would be
reported as `"gamelib.json is absent -- this is a fork-owned catalog (D-06)
and must exist"` (a hard failure, so at least it's noticed) but for an
upstream namespace it would be silently downgraded to a one-line "not yet
translated" finding — masking what could be a real bug in CI (e.g. a
mis-mounted volume) as ordinary Weblate incompleteness.

**Fix:** Narrow the catch to `ENOENT` specifically and re-throw (or classify
separately) anything else:

```ts
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
  return null
}
```

## Info

### IN-01: `i18nCatalogPresenceBaseline.json`'s `totalPairs` field is documentary only and unenforced

**File:** `meta/i18nCatalogPresenceBaseline.json:6`, `meta/lintTranslations.ts:344-349`

`comparePresenceBaseline()` derives its entire comparison from `baseline.missing`
and never reads `baseline.totalPairs` — confirmed by reading the function body
and by the file's own comment ("The assertion is over `missing`, never over
`totalPairs`"). This is good practice (no drift-prone redundant count is
load-bearing), but it does mean nothing would catch `totalPairs` itself
silently drifting out of sync with `missing` if the file is ever hand-edited
carelessly — it is pure prose at that point. No fix required; noting for
awareness since a future maintainer might mistakenly treat `totalPairs` as
enforced.

### IN-02: Point-in-time measurement numbers baked into a long-lived header comment

**File:** `meta/lintTranslations.ts:44-55`

The header comment states "measured at HEAD (2026-09-06) this was hiding 794
missing (locale, key) pairs across 17 keys" as justification prose. This is
explicitly dated, which is the right practice, but as the baseline evolves
(pairs get filled, new ones appear) this specific number will read as stale
without any signal that it's historical rather than current. No action
needed beyond what's already done (dating the claim); flagging only so a
future reader doesn't mistake it for a live invariant.

---

_Reviewed: 2026-09-06T06:31:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
