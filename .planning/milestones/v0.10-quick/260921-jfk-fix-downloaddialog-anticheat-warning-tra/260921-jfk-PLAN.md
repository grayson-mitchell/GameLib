---
quick_id: 260921-jfk
date: 2026-09-20
status: planned
description: "DownloadDialog's anticheat-warning <Trans> passes key= instead of i18nKey=, so its 35 translated copies are dead"
closes_todo: .planning/todos/pending/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md
files:
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts
  - .planning/todos/pending/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md
must_haves:
  truths:
    - "A user running GameLib in German sees the German anticheat warning, not English."
    - "A wrong or absent `ns` on that <Trans> is caught by an automated test, not only by eye."
    - "No file under public/locales/ changes."
  artifacts:
    - path: src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
      provides: "<Trans> with i18nKey= and ns=\"gamepage\", plus the explanatory comment"
    - path: src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts
      provides: "Real-i18next rendering assertion that reads the attributes out of the production source"
  key_links:
    - from: "DownloadDialog/index.tsx <Trans> attributes"
      to: "public/locales/de/gamepage.json install.anticheat-warning.disabled_installation"
      via: "real i18next instance + i18next-fs-backend in the test"
---

# Quick Task 260921-jfk — flip `key=` to `i18nKey=` + `ns="gamepage"`, and prove it with a render

## Objective

`src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:228-231`
writes the anticheat warning as:

```
<Trans
  key="install.anticheat-warning.disabled_installation"
  i18n={i18n}
>
```

`key` is React's reserved reconciliation prop. It is consumed by React and never reaches
`Trans` as a prop, so `Trans` has no `i18nKey` to resolve, falls through to its inline
English children, and renders English in **every** locale. 35 non-English human
translations of this string are currently dead.

**Output:** the two-attribute source fix, an explanatory comment, and an automated
rendering assertion that would have caught this.

## Established facts — do NOT re-derive

All of these were measured in this session at the current HEAD (`2e81cbd84`). The two
line numbers were re-confirmed after the findings were handed over.

1. **Defect site confirmed at `DownloadDialog/index.tsx:228`** (`<Trans`) closing at `:245`
   (`</Trans>`). `Trans` is imported at `:46`.
2. **`ns` is mandatory, not optional.** `src/frontend/index.tsx` `.init({...})` sets
   `returnEmptyString: false`, `returnNull: false`, `fallbackLng: 'en'`,
   `interpolation.escapeValue: false`, `lng`, `react.useSuspense`, `supportedLngs` — and
   **no `defaultNS`**. i18next therefore defaults to `translation`. The key lives in
   `gamepage`. **Both `i18nKey=` and `ns="gamepage"` are required; either alone still
   renders the English children in every locale.**
3. `DownloadDialog/index.tsx:156` is `const { i18n, t } = useTranslation('gamepage')`.
   That call binds **`t`**, not the `i18n` instance handed to `Trans`. This is precisely
   why `ns` has to be written out.
4. **The key exists in exactly one namespace.** Measured across `public/locales/en/`:
   `install.anticheat-warning.disabled_installation` is present in `gamepage.json` and
   **`undefined` in both `translation.json` and `gamelib.json`**. So an omitted `ns`
   (→ `translation`) and a copy-pasted `ns="gamelib"` are both genuine misses — which is
   what makes the negative controls in Task 2 meaningful.
5. **36 locales carry a non-empty value → 35 non-English.** Matches the todo's count.
6. **Child-index parity is safe.** Catalog values contain literal `<br /><br />`, which
   react-i18next preserves by default via `transKeepBasicHtmlNodesFor`
   (`['br','strong','i','p']`). There are **no numbered `<0/>` tags** in any value and the
   JSX children carry two matching `<br />` pairs. Nothing to disturb.
7. **The backend i18next auto-mock does not reach this test.**
   `src/backend/__mocks__/i18next.ts` exists, but the Frontend jest project
   (`src/frontend/jest.config.js`) sets `roots: ['<rootDir>/src/frontend']`, and
   `src/frontend/__mocks__/` contains only `svgReactStub.tsx`. There is **no repo-root
   `__mocks__/`**, and no global `jest.mock('react-i18next')` — the mocks that exist are
   per-file (e.g. `FilterChipRow/index.test.tsx`). No `jest.unmock()` call is needed.
8. **The Frontend jest project has no DOM.** Its config comment is explicit:
   `testEnvironment` is the default `'node'`; jsdom, `jest-environment-jsdom` and
   `react-test-renderer` are **not installed**, and installing one is out of scope (it
   would need a package-legitimacy checkpoint). Existing component tests call function
   components directly and inspect the element graph. **`react-dom` ^18.3.1 IS installed**,
   and `react-dom/server`'s `renderToStaticMarkup` needs no DOM — that is the render path
   this plan uses.
9. Versions: `react` ^18.3.1, `react-dom` ^18.3.1, `react-i18next` ^12.3.1,
   `i18next` ^22.5.1, `i18next-fs-backend` ^2.6.0.

## Scope

**In:** two attributes on one JSX element, one explanatory comment, one new test file,
and closing the pending todo.

**Out, explicitly:**

- **No edit to anything under `public/locales/`.** The 35 translations already exist; this
  is not a new string. The "new strings go in `gamelib.json`" rule does not apply, and
  there is no `i18n-churn-guard` involvement. Per `REQ-34.8-04`, the response to churn
  under `public/locales/` is `git checkout -- public/locales/`, **never a hand-edit**.
- **No touching the third sibling.** The `GamePage` wikilink instance has its own pending
  todo at
  `.planning/todos/pending/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`.
  Leave it alone.
- **No new npm dependency.** Everything the test needs is already installed (fact 9).

## Why a diff review is not sufficient verification

The todo says it plainly: **reading the diff cannot distinguish a fixed instance from a
broken one.** `ns="gamelib"` and `ns="gamepage"` produce byte-identical-looking diffs, and
the wrong one still renders English with no error, no warning, and no type failure. The
gate has to be a render against the real engine and the real catalog.

## Precedent to mirror

Commit `98a1586e6` fixed the identical defect in `SideloadDialog`. Its comment lives at
`SideloadDialog/index.tsx:376-383` and names the mechanism (`key` is React's reserved
prop, invisible to `Trans`), the namespace, and why both attributes are required. Mirror
that **style**, but the content differs here: this is an existing `gamepage` key with **no
namespace migration, no locale fill, and no `values={{...}}` interpolation**.

---

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Write the real-i18next rendering assertion and prove it RED against the unfixed source</name>

  <files>
src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts
  </files>

  <read_first>
- `src/frontend/screens/Library/components/FilterChipRow/__tests__/chipLabels.realI18next.test.ts`
  — the repo's real-i18next precedent. Follow its shape: a module-scope `REPO_ROOT` built
  from `join(__dirname, '..', ...)`, an `existsSync` guard that throws a *named* error if
  the depth chain is wrong (so a path bug cannot masquerade as a real catch), a fresh
  `createInstance()` per test (never the process-wide singleton), and `.use(Backend).init({...})`
  with `initImmediate: false`.
- `src/frontend/jest.config.js` — for facts 7 and 8 above.
  </read_first>

  <behavior>
The test must be RED at HEAD (before Task 2) and GREEN after it. Three assertions:

- **A1 — the source writes an `i18nKey`.** Read
  `join(__dirname, '..', 'index.tsx')` from disk, strip `{/* ... */}` JSX comments **before**
  matching, then match every `<Trans\b[^>]*>` opening tag and select the single one whose
  attribute text contains `install.anticheat-warning.disabled_installation`. Assert exactly
  **one** such tag matched (fail loudly on 0 or 2+ — a silently-zero match is the
  green-check-proving-nothing shape this repo keeps stamping out). Extract `i18nKey="..."`
  and `ns="..."` out of that attribute chunk. Assert both are present.
- **A2 — that (key, ns) pair resolves to real German through the real engine.** Build a
  fresh `createInstance()` with `i18next-fs-backend`,
  `loadPath: join(REPO_ROOT, 'public/locales/{{lng}}/{{ns}}.json')`,
  `lng: 'de'`, `fallbackLng: 'en'`, `ns: ['translation', 'gamepage', 'gamelib']`,
  `defaultNS: 'translation'`, `returnEmptyString: false`, `returnNull: false`,
  `initImmediate: false`, `interpolation: { escapeValue: false }`.
  Loading all three namespaces is deliberate: it makes a wrong-but-existing `ns` a genuine
  *miss*, not an *unloaded-namespace* miss.
  Then render, using the attributes **extracted from source in A1** (never hand-typed):
  `renderToStaticMarkup(createElement(Trans, { i18nKey: extractedKey, ns: extractedNs, i18n: instance }, SENTINEL))`
  where `SENTINEL` is a distinctive marker string such as
  `'__JFK_ENGLISH_CHILDREN_MUST_NOT_RENDER__'`.
  Read the expected German out of `public/locales/de/gamepage.json` at test time (do NOT
  paste a German literal into the test — the catalog is the source of truth), take
  `value.split('<br />')[0].trim()` as a tag-free segment, and assert the markup
  **contains** it. If React's text escaping bites, apply the same 5-character escape
  (`& < > " '`) via a small local helper before comparing.
- **A3 — the English children did NOT render.** Assert the markup does **not** contain
  `SENTINEL`. This is the assertion that pins the actual defect: with `key=` (no
  `i18nKey`), react-i18next derives its lookup key from the children via `nodesToString`,
  finds nothing, and falls back to the children — so the sentinel appears and A3 fails.
  With `ns="gamelib"` or no `ns`, the key is absent from that namespace (fact 4), Trans
  falls back to the children, and A3 fails the same way.

**State the limitation in the test's header comment, honestly:** this renders a
*reconstructed* element built from attributes read out of the production source, with
sentinel children — not the production element itself. It pins the `(i18nKey, ns)` pair as
written in source and proves that pair resolves to real non-English catalog text through
the real engine. It does **not** pin child-index parity (fact 6 covers why that is safe
here) and it cannot, because the Frontend jest project has no DOM renderer (fact 8).
Do not let a future reader mistake it for a full component render.
  </behavior>

  <action>
Create the directory
`src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/` (it does
not exist yet) and write the file described above.

**Write it as `.test.ts`, not `.test.tsx`, and build elements with
`React.createElement`.** This is not a style preference. `eslint.config.mjs`'s test
override globs `['**/__tests__/**/*.ts', '**/__mocks__/**/*.ts']` — **no `.tsx`** — so a
`.tsx` test file is linted under *production* rules (`no-explicit-any` at error) while
still being counted against the test ceiling. A `.test.ts` file gets the intended override.
Do not "tidy" that glob.

Depth note: `__dirname` is the new `__tests__` dir, so `REPO_ROOT` is **eight** `'..'`
segments up (`__tests__` → `DownloadDialog` → `InstallModal` → `components` → `Library` →
`screens` → `frontend` → `src` → repo root). Guard it with the `existsSync`-throws pattern
from the precedent so a miscounted chain cannot present as a translation failure.

Keep the file free of `any`, unused bindings and `eslint-disable` directives — see the
lint-ceiling note under Verification.
  </action>

  <verify>
    <automated>
npx jest --selectProjects Frontend --runInBand src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts
    </automated>
  </verify>

  <done>
The new test file exists and **FAILS** at HEAD, with the failure naming the real cause —
either "no i18nKey attribute found on the Trans tag" (A1) or the sentinel appearing in the
markup (A3). A failure that reads as a path error, a module-resolution error, or "0 tags
matched" is NOT done: fix the harness until the red is the defect's red. Do not proceed to
Task 2 until you have seen and read that failure output.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply the two-attribute fix with its comment, then prove the test is honest with two negative controls</name>

  <files>
src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  </files>

  <action>
At `DownloadDialog/index.tsx:228-231`, replace `key=` with `i18nKey=` and add
`ns="gamepage"`. Leave `i18n={i18n}` and every child node exactly as they are — the
children are the English fallback and the `<br />` pairs that carry child-index parity
(fact 6). Resulting opening tag:

  `<Trans` / `i18n={i18n}` / `i18nKey="install.anticheat-warning.disabled_installation"` /
  `ns="gamepage"` / `>`

Add a `{/* ... */}` comment immediately above it, mirroring
`SideloadDialog/index.tsx:376-383` in style. It must say: `i18nKey` (NOT `key` — React's
reserved prop, invisible to `Trans`) plus an explicit `ns`, because i18next's `defaultNS`
is `translation` while this key lives in `gamepage`; both are required, either alone
renders the English children in every locale; and — the part that differs from the
`SideloadDialog` case — this is a pre-existing `gamepage` key with 35 live non-English
translations, so **no catalog change is involved**.

**Do not write the literal string `install.anticheat-warning.disabled_installation` inside
that comment.** Task 1's extractor strips JSX comments before matching, but keeping the key
out of the prose keeps the census honest for any future grep-based reader
(`raw-source-gate-is-satisfied-by-the-prose-that-names-it`).
  </action>

  <verify>
    <automated>
# 1. GREEN with the fix in place
npx jest --selectProjects Frontend --runInBand src/frontend/screens/Library/components/InstallModal/DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts

# 2. NEGATIVE CONTROL A -- revert i18nKey -> key, re-run, confirm RED, restore
# 3. NEGATIVE CONTROL B -- change ns="gamepage" -> ns="gamelib", re-run, confirm RED, restore
# (do both by hand, reading the failure text each time; then:)
git diff --stat src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
    </automated>
  </verify>

  <done>
The test passes with the fix, and **both** negative controls were run and observed RED —
control A proving the test sees `key=` vs `i18nKey=`, control B proving it sees a wrong
namespace. This repo has the recorded lesson that *a regression test can sit upstream of
its own symptom*; a test whose red you have not personally read is not a gate. Both
controls are restored afterwards and `git diff` shows only the intended two-attribute
change plus the comment.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the pending todo and run the project gates</name>

  <files>
.planning/todos/pending/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md
  </files>

  <action>
**Correct the todo's body before moving it.** Its "Solution" step 3 hedges on child-index
parity; record what was measured instead (fact 6: literal `<br />`, no numbered tags, no
parity risk). Add `resolved_by: "quick-260921-jfk"` and a `resolved:` date to the
frontmatter, matching the shape of
`.planning/todos/completed/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`.
Also note what the fix does **not** cover: the sibling `GamePage` wikilink instance stays
open under its own todo.

Then move the file to `.planning/todos/completed/`.

**`git mv` trap — this repo has hit it twice.** `git mv` stages the file's **HEAD**
content, silently dropping unstaged edits to it. One occurrence ran seven days undetected.
So: **stage the body edit first** (`git add` the pending path), *then* `git mv`, and after
committing, read the file back **out of the commit** (`git show HEAD:<completed-path>`) and
confirm your edits are present. Do not verify against the working tree — a gate that
measures the tree instead of the commit is a separate recorded trap here.

Note the `planning-gates` scope: the `severity`/`platform`/`ready` frontmatter gate is
**`pending/` only**; `completed/` is exempt. Removing the file from `pending/` therefore
cannot break it, and you must not add or widen any vocabulary value to make it pass.
  </action>

  <verify>
    <automated>
# Full frontend suite (not just the new file) -- catches collateral
npx jest --selectProjects Frontend --runInBand

# Typecheck
pnpm codecheck

# Lint: assert the two COUNTS, not the exit code.
# Ceilings are SRC 1124 / TESTS 638 and headroom is ONE slot repo-wide, with
# tests at ZERO. Measure at HEAD FIRST (git stash, run, unstash) and compare;
# do NOT trust a number quoted from an earlier session -- a verify block that
# pins a stale baseline has produced four false reds in this repo.
pnpm lint

# No catalog drift: both must report nothing.
git status --porcelain public/locales/
pnpm i18n-churn-guard
pnpm lint-translations

# Planning gates (todo frontmatter, pending/ scope)
pnpm planning-gates
    </automated>
  </verify>

  <done>
Frontend suite green with the new test counted in it; `tsc` exit 0; both lint counts
unchanged from the pre-change measurement at HEAD (do **not** raise either ceiling —
if a count rose, find and fix the cause); `git status --porcelain public/locales/` empty;
`i18n-churn-guard` and `lint-translations` clean; `planning-gates` all green. The todo is
in `completed/` and `git show HEAD:<path>` proves the committed content carries the
corrected body, not the HEAD-at-move content.
  </done>
</task>

---

## Threat model

No new dependency, no network call, no credential, no user input crosses a boundary. The
one supply-chain row is vacuous by construction and is recorded so it is not mistaken for
an omission.

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-jfk-SC | Tampering | npm/pip/cargo installs | n/a | **No package install in this task.** Every library used (`react-dom`, `i18next`, `i18next-fs-backend`, `react-i18next`) is already in `package.json`. If a task ever requires an install, stop and raise a legitimacy checkpoint. |
| T-jfk-01 | Information disclosure | new test file reading `public/locales/**` | accept | Read-only, repo-tracked, non-secret public catalog data. No fake-HOME isolation needed: this spawns no child process and touches no profile directory. |

## Success criteria

- [ ] `DownloadDialog/index.tsx:228` uses `i18nKey=` **and** `ns="gamepage"`, with the
      explanatory comment above it.
- [ ] `anticheatWarningTrans.realI18next.test.ts` exists, passes, and has been observed
      **RED** under both negative controls (wrong prop name; wrong namespace).
- [ ] `git status --porcelain public/locales/` is empty — zero catalog bytes changed.
- [ ] `GamePage`'s wikilink `<Trans>` is untouched and its todo is still in `pending/`.
- [ ] Both lint counts are unchanged from the measured pre-change baseline; neither
      ceiling was raised.
- [ ] The pending todo is in `completed/`, its corrected body verified **from the commit**.

## Output

Write `.planning/quick/260921-jfk-fix-downloaddialog-anticheat-warning-tra/260921-jfk-SUMMARY.md`
when done. Record, at minimum: the negative-control outputs (the actual red text, both
controls), the two lint counts before and after, and the honest limitation of the test
(reconstructed element, not a full component render — no DOM renderer is installed).
