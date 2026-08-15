---
quick_id: 260816-a5o
phase: quick-260816-a5o
plan: 01
subsystem: backend-test-gates
tags: [wr-08, source-gate, rust, quote-balance, test-utils, ledger]
requires:
  - src/backend/testUtils/stripSourceComments.ts
provides:
  - src/backend/testUtils/rustQuoteBalance.ts
affects:
  - src/backend/__tests__/longRunningChannels.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
tech-stack:
  added: []
  patterns:
    - "Shared source-gate normalizer module in src/backend/testUtils/ (follows stripSourceComments.ts)"
    - "Logical-line folding before per-line source assertions"
key-files:
  created:
    - src/backend/testUtils/rustQuoteBalance.ts
  modified:
    - src/backend/__tests__/longRunningChannels.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/quick/260816-9o0-guard-gen-i18n-gate-scope-from-clobberin/deferred-items.md
decisions:
  - "WR-08's per-physical-line quote premise removed structurally via a logical-line joiner, not patched with a third special case"
  - "stripRustEscapes must run BEFORE the join; pinned by its own discriminator, falsified by inverting the order"
  - "app_hide declared in the REQ-34.1-07 census with an explicit note that its proof status is weaker than every entry above it"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-08-16
---

# Quick Task 260816-a5o: Teach the Rust quote-balance check about `\`-continued literals — Summary

Replaced the WR-08 guard's per-physical-line quote-balance premise with a shared
`rustQuoteBalance` module that folds `\`-continued Rust lines into logical lines before
counting, and separately closed an unrelated dispatch-arm ledger gap that made a second suite
red for a different reason than the on-record diagnosis claimed.

## What Changed

| Task | Commit | What |
|------|--------|------|
| 1 | `3eb94c97f` | New `src/backend/testUtils/rustQuoteBalance.ts` — three normalizers moved out of the test file byte-identical in body, plus `joinContinuedLogicalLines` and `findUnbalancedQuoteLines`; six discriminators added |
| 2 | `5427adfab` | Sites 2, 3 and 5 routed through `findUnbalancedQuoteLines`; rotted rationale retired; pre-existing prettier dirt fixed |
| 3 | `5c9b0e51e` | `app_hide` declared in `tauriShellSource.test.ts`'s REQ-34.1-07 census with an honest proof note |

`src-tauri/src/main.rs` is **byte-unchanged** — confirmed absent from
`git diff --name-only b59e111cd HEAD`.

## RED Observations (all executed, none inferred)

### Baseline at HEAD, both suites

```
Test Suites: 2 failed, 2 total
Tests:       2 failed, 137 passed, 139 total
```

`longRunningChannels.test.ts:442` — exactly the two entries the plan predicted:

```
Array [
  Object {
    "index": 1852,
    "line": "                    \"[dispatch_rust_channel] app_hide: declared no-op off macOS -- \\",
    "quoteCount": 1,
  },
  Object {
    "index": 1854,
    "line": "                     Electron's own macOS-only app.hide()\"",
    "quoteCount": 1,
  },
]
```

`tauriShellSource.test.ts:344` — exactly the census gap the plan predicted:

```
- Expected  - 0
+ Received  + 1
  Array [
+   "app_hide",
    "tray_set_icon",
  ]
```

### Task 1 RED — `joinContinuedLogicalLines` as an identity mapper

With `return lines.map((line, index) => ({ index, line }))` substituted:

```
Tests: 3 failed, 37 passed, 40 total
```

Failing: the real-file guard (same two entries, `index: 1852` / `1854`, `quoteCount: 1`
each, line 1852 ending in a trailing backslash), the new real-file discriminator, and
`joiner: a \-continued literal that IS properly closed reads as balanced`, which reported:

```
Array [
  Object { "index": 0, "line": "let s = \"a \\",  "quoteCount": 1 },
  Object { "index": 1, "line": "   b\";",         "quoteCount": 1 },
]
```

### Task 1 RED — ordering proof, falsified by inverting the pipeline

Temporarily reordering `findUnbalancedQuoteLines` to join BEFORE stripping escapes made the
ordering discriminator fail:

```
Array [
  Object {
    "index": 0,
-   "quoteCount": 1,
+   "quoteCount": 3,
  },
]
```

### Task 2 non-vacuity re-check

Appending `const BROKEN: &str = "unterminated;` to the site-3 fixture made it RED naming the
line exactly:

```
Array [
  Object {
    "index": 7,
    "line": "const BROKEN: &str = \"unterminated;",
    "quoteCount": 1,
  },
]
```

### Task 3 census falsifiability re-check

Temporarily removing `'clipboard_write_text'` from `preExistingArms`:

```
Array [
+   "clipboard_write_text",
    "tray_set_icon",
  ]
```

Every temporary change above was reverted by **direct `Edit`**. No `git stash`, no
`git checkout -- <file>`, no `git restore` was run at any point.

## Divergences From the Plan (recorded verbatim, not reconciled)

**1. Only ONE of the two continuation discriminators fails under an identity joiner, not two.**
The plan's Task 1 `<verify>` predicted "plus the two continuation discriminators failing."
Measured: the *properly-closed* continuation discriminator fails; the *never-closes* one
**passes under both the identity joiner and the real joiner**. That is correct behavior, not a
weak test — its whole purpose is that a never-closing continuation must be reported in both
worlds. It is an anti-degeneration guard (T-a5o-01), not a joiner discriminator. Recorded so a
future reader does not "strengthen" it into failing under the broken implementation.

**2. The ordering discriminator does NOT fail under an identity joiner either** — an identity
joiner never mis-joins anything. It is falsified by the *actual* defect it guards
(join-before-escape-strip), which was executed separately and is quoted above. Without that
second, differently-shaped RED, the ordering test would have been an unproven assertion.

**3. Inverting the pipeline order does not launder the imbalance to EVEN — it corrupts it.**
The plan's threat T-a5o-02 says a mis-read continuation "would join two unrelated lines and
mask an imbalance". Measured on this fixture: the two lines splice into
`let s = "alet t = "b";`, giving `quoteCount: 3` — still odd, so still reported, but reported
at the wrong count with two source lines merged into one entry. The damage is to
diagnosability and to the joined line's contents, not (on this fixture) to the verdict. A
fixture with an even number of stray quotes would flip the verdict too.

**4. The "test at lines 478-483" the plan asked to rename is not a test — it is a comment plus
two assertions INSIDE the test `stripRustEscapes neutralises escaped quotes without laundering
real findings`, which also covers three unrelated assertions.** Renaming the enclosing test
would have mislabelled the other three, and its current name is still accurate. The comment was
retargeted to the true rationale as instructed, and a direct assertion
(`expect(openingLine.endsWith('\\')).toBe(true)`) was added so the backslash-survival property
the joiner depends on is now asserted by name rather than implied by an odd count.

**5. Positional references in the three moved doc comments were adjusted.** The plan said carry
them across intact. Their bodies are byte-identical, but phrases like "the WR-08 guards below"
and "`parseMsConstantFromSource`'s caveat below" pointed at code that no longer sits below them
in the new file. Left as-is they would be exactly the kind of prose rot this task exists to fix,
so they now name `longRunningChannels.test.ts` explicitly. No claim was changed.

## Deviations (auto-fixed)

**1. [Rule 2 — missing critical correctness] `stripRustCharLiterals`'s doc comment now states
why the apostrophe case is NOT a defect.** The superseded diagnosis in D-9o0-01 blamed exactly
this function, and nothing in the code said otherwise. Without the note, the next reader has the
same evidence that produced the wrong answer the first time. Added to the moved doc comment in
`rustQuoteBalance.ts`.

## Prettier

`longRunningChannels.test.ts` was **already prettier-dirty at HEAD** (it failed
`prettier --check` before any edit). `npx prettier --write` produced ~59 changed lines. Every
incidental hunk was inspected against a pre-write snapshot: **all are pure line-wrapping** —
`parseMsConstantFromSource` / `parseMsConstantFromFile` signatures, a `throw new Error(...)`
template, an `if (a && b)` condition, an array spread, and four `expect(...).toBe(...)` /
`.length` expressions rewrapped. **No identifier, string literal, assertion, or expected value
was changed by prettier.** `rustQuoteBalance.ts` was clean on first write.

## Verification

| Check | Result |
|-------|--------|
| `npx jest --selectProjects Backend --testPathPattern "longRunningChannels\|tauriShellSource"` | **2 suites passed, 145/145 tests** (baseline 2 failed / 137 passed / 139 total; +6 discriminators) |
| `npx tsc --noEmit` | exit 0 |
| `pnpm test:ci` | **278/278 suites passed, 5710 passed / 1 skipped / 5711 total** (baseline 2 failed / 276 passed / 278; 5705 tests). Nothing moved to failing. |
| `npx prettier --check` on both TS files | clean |
| `grep -c 'quoteCount % 2 !== 0'` in `longRunningChannels.test.ts` | **0** (measured 3 at HEAD) |
| `git diff --name-only b59e111cd HEAD` lists `main.rs` | **NO** |
| `graphify update .` | 7668 nodes, 14640 edges, 519 communities |

## Success Criteria

- [x] Real-file per-line guard passes with `main.rs` byte-unchanged
- [x] A never-closing continuation and a plain unterminated literal are both still reported — by executed discriminators
- [x] `stripRustEscapes`-before-join ordering pinned by its own test, and that test proven falsifiable against the real defect shape
- [x] One shared helper module; zero remaining per-line quote-balance pipelines
- [x] Census declares `app_hide` with an honest proof note and can still fail (proven)
- [x] D-9o0-01 closed, wrong diagnosis explicitly corrected, provenance evidence intact

## Deferred

`deferred-items.md` in this directory records **D-a5o-01**: 3 pre-existing eslint errors
(+2 warnings) in the two touched test files, all on lines this task never touched. The most
interesting is that `parseMsConstantFromSource`'s `// eslint-disable-next-line no-new-func`
names the wrong rule (`@typescript-eslint/no-implied-eval` is what actually fires), so it reads
as an unused directive AND leaves a live error. Out of scope; not fixed.

## Self-Check: PASSED

All three created files exist on disk; all three commit hashes resolve in `git log`;
`rustQuoteBalance.ts` exports 5 functions as specified.

## Uncommitted, awaiting the orchestrator

`.planning/quick/260816-9o0-.../deferred-items.md` (Task 3 Part B) is **modified but NOT
committed**. The plan lists it under Task 3's `<files>` but never authorizes committing it, and
the executor constraints route docs artifacts to the orchestrator's docs commit. It is left in
the working tree, unstaged.
