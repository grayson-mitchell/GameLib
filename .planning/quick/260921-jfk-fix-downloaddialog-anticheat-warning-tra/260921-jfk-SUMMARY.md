---
quick_id: 260921-jfk
date: 2026-09-20
status: complete
one_liner: "DownloadDialog anticheat-warning <Trans> flipped key= to i18nKey=+ns=\"gamepage\", proven against a real i18next render, not a diff review"
files_created:
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts
files_modified:
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - .planning/todos/pending/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md (moved to completed/)
commits:
  - e10e63b0f: "test(quick-260921-jfk): add failing real-i18next assertion for anticheat Trans"
  - 958116fde: "feat(quick-260921-jfk): flip anticheat Trans to i18nKey and ns=\"gamepage\""
  - a463e5228: "docs(quick-260921-jfk): close DownloadDialog anticheat Trans todo"
---

# Quick Task 260921-jfk Summary

## What changed

`DownloadDialog/index.tsx:228-231`'s anticheat-warning `<Trans>` wrote React's reserved `key=`
prop instead of `i18nKey=`, so `Trans` never had a lookup key and always fell back to its inline
English `children`, in every locale. 35 non-English human translations of
`install.anticheat-warning.disabled_installation` (in `gamepage.json`) were dead. Fixed by
replacing `key=` with `i18nKey=` and adding an explicit `ns="gamepage"` (i18next's `defaultNS` is
`translation`, not `gamepage`), with an explanatory comment mirroring the `SideloadDialog` fix's
style at `SideloadDialog/index.tsx:376-383`. No catalog file was touched — this was a pre-existing
key with 35 live translations already in place, not a new string.

A new real-i18next test,
`DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts`, reads the `(i18nKey, ns)`
attributes straight out of the production source (never hand-typed) and renders them through a
fresh `i18next.createInstance()` against the real `public/locales/de/gamepage.json` catalog,
proving the exact pair written in source actually resolves to real German text and that the
English sentinel children do not leak through.

## Task-by-task

**Task 1** — wrote the test (A1/A2/A3 assertions) and confirmed it RED at HEAD before touching
the fix. **Task 2** — applied the two-attribute fix plus comment, confirmed GREEN, then ran both
required negative controls by hand (see below) and restored the source after each. **Task 3** —
corrected and closed the pending todo, then ran the full gate suite.

## Negative controls (non-negotiable verification, both actually run)

**Control A — revert `i18nKey` back to `key` (keeping `ns="gamepage"`):**

Observed failure (module-scope throw, "Test suite failed to run"):

```
extractTransAttributes: no i18nKey attribute found on the Trans tag -- the source is still writing
React's reserved "key" prop (or some other attribute) instead of "i18nKey", so Trans has nothing to
resolve and falls through to its English children.
```

This is the defect's own red — it names the actual cause (no `i18nKey` attribute), not a
module-resolution or path error. Restored immediately after; re-ran the test and confirmed GREEN
before proceeding to control B.

**Control B — change `ns="gamepage"` to `ns="gamelib"`:**

Observed failures (2 of 3 assertions failed; A1 still passed since both attributes were present,
just with a wrong value):

```
● A2: that (key, ns) pair resolves to the real German catalog text

  getNestedCatalogValue: path "install.anticheat-warning.disabled_installation" does not resolve
  inside gamelib.json (stopped at segment "anticheat-warning"). If this happened while running the
  wrong-ns negative control, this is expected -- read the A3 (sentinel) assertion's failure
  instead, not this one.

● A3: the reconstructed element does NOT fall back to its English sentinel children

  expect(received).not.toContain(expected) // indexOf

  Expected substring: not "__JFK_ENGLISH_CHILDREN_MUST_NOT_RENDER__"
  Received string:        "__JFK_ENGLISH_CHILDREN_MUST_NOT_RENDER__"
```

A3's failure is the load-bearing one and is exactly the sentinel-string-appears defect's red the
non-negotiable verification instructions asked for: the reconstructed element fell back to its
English sentinel children because `install.anticheat-warning.disabled_installation` does not
exist in `gamelib.json`. A2's failure is a secondary, deliberately-worded diagnostic (not a raw
path/module-resolution error) that explicitly points the reader at A3 for the real explanation.
Restored immediately after; re-ran the test and confirmed GREEN (3/3 passing) before moving to
Task 3.

## Lint counts (measured baseline vs. after, no `git stash` used per orchestrator correction)

Per the orchestrator's correction, both counts were measured as the very first action of this
session, before any file was edited — via `pnpm lint` run against the untouched working tree at
HEAD (`2e81cbd84`):

| | Before (measured first, HEAD `2e81cbd84`) | After (measured last, HEAD `a463e5228`) |
|---|---|---|
| Production (SRC) problems | 1119 (ceiling 1124) | 1119 |
| Test problems | 638 (ceiling 638) | 638 |
| `pnpm lint` exit code | 0 | 0 |

Both counts are unchanged. The new test file added zero lint findings of its own (it is a
`.test.ts` file, matching `eslint.config.mjs`'s test-override glob, and uses no `any`, no unused
bindings, and no `eslint-disable` directives).

## Gates run after all three tasks

- `npx jest --selectProjects Frontend --runInBand` (full suite, not just the new file): **168/168
  suites, 2663/2663 tests passed** (2660 pre-existing + 3 new).
- `pnpm codecheck` (`tsc --noEmit`): exit 0, clean before and after.
- `pnpm lint`: exit 0, counts unchanged (see table above).
- `git status --porcelain public/locales/`: empty — zero catalog bytes changed.
- `pnpm i18n-churn-guard`: "clean -- no upstream public/locales/ catalog changed."
- `pnpm lint-translations`: exit 0, "7450 findings, 0 hard failures" (pre-existing, unrelated
  legacy noise from other locales/keys — no hard failures, which is the pass condition).
- `pnpm planning-gates`: **11/11 planning gates passed.**

## Honest limitation of the test

Stated in the test file's own header comment: the element rendered in A2/A3 is a *reconstructed*
element — built from the `i18nKey`/`ns` attributes read out of the production source, with
sentinel children substituted for the real English fallback — not the production element itself.
It pins the `(i18nKey, ns)` pair as written in source and proves that pair resolves to real
non-English catalog text through the real engine. It does **not** pin child-index parity between
the reconstructed sentinel and the production's two `<br />` pairs, and it structurally cannot,
because the Frontend jest project (`src/frontend/jest.config.js`) has no DOM renderer —
`jest-environment-jsdom` and `react-test-renderer` are not installed, confirmed before writing any
code. Child-index parity is safe here regardless: the catalog value at
`public/locales/de/gamepage.json`'s `install.anticheat-warning.disabled_installation` is a single
string containing literal `<br /><br />` (verified by reading the raw JSON, not just the parsed
value), with no numbered `<0/>`-style tags, so there is nothing for child-index to disturb.

The orchestrator's decision on the escalated question (whether to extract the `<Trans>` into an
exported leaf module for a true component render) was followed: no production code was
restructured to suit the test. This limitation is recorded, not engineered around.

## Todo closure

`.planning/todos/pending/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md` was
corrected (its Solution step 3's child-index-parity hedge was struck through with the measured
fact substituted, not silently deleted) and moved to
`.planning/todos/completed/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md`,
with `resolved_by: "quick-260921-jfk"` and a `completed:` date added. The `git mv` trap this repo
has hit twice was avoided by staging the body edit first, then `git mv`-ing, then verifying with
`git show HEAD:<completed-path>` that the committed content carries the corrected body (confirmed:
`resolved_by`, the struck-through step 3, the `## Resolution` and `## Not fixed here` sections are
all present in the commit, not just the working tree).

The sibling `GamePage` wikilink `<Trans>` instance and its own pending todo
(`.planning/todos/pending/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`) were
confirmed untouched throughout (`git status --short .planning/todos/` showed only the target file
modified at every check).

## Deviations from Plan

None. The plan was executed as written, including the orchestrator's decision (no test-driven
production restructuring) and the orchestrator's correction (measure lint baseline directly
instead of via `git stash`).

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change was introduced.
The plan's own threat model (T-jfk-SC, T-jfk-01) covers the full surface touched: no new
dependency was installed, and the new test only reads already-tracked, non-secret
`public/locales/**` files.

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts`
- FOUND: `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx`
- FOUND: `.planning/todos/completed/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md`
- CONFIRMED: removed from `.planning/todos/pending/`
- FOUND commit: `e10e63b0f`
- FOUND commit: `958116fde`
- FOUND commit: `a463e5228`
