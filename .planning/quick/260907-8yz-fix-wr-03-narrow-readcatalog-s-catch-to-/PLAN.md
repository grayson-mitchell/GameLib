---
quick_id: 260907-8yz
slug: fix-wr-03-narrow-readcatalog-s-catch-to-
type: execute
date: 2026-09-07
autonomous: true
closes_todo: .planning/todos/pending/2026-09-07-readcatalog-swallows-every-read-failure-as-absent.md
files_modified:
  - meta/lintTranslations.ts
  - meta/__tests__/lintTranslations.test.ts
  - .planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW-FIX.md

must_haves:
  truths:
    - "A non-ENOENT read failure is distinguishable from an absent file at EVERY one of readCatalog()'s four call sites, not just inside readCatalog()"
    - "The lint path reports it as a NAMED hard failure and returns normally -- it must not become an uncaught throw, which is the CR-01 defect at a new errno"
    - "The write-baseline path REFUSES to write rather than recording a wrong baseline derived from an unreadable tree"
    - "Every new test was RED-proved against HEAD before the fix landed, with the failure output captured"
  artifacts:
    - path: "meta/lintTranslations.ts"
      provides: "readCatalog() narrowed to ENOENT, plus classification at all four call sites"
    - path: "meta/__tests__/lintTranslations.test.ts"
      provides: "EISDIR-fixture coverage for the read-failure path in all three behaviours"
---

<objective>
Close WR-03: `readCatalog()` reports EACCES / EISDIR / transient I/O failures as "catalog
absent", so a real filesystem fault reads as ordinary Weblate incompleteness.

**The review's prescribed fix — narrowing the catch to ENOENT — is necessary and NOT
sufficient.** Tracing all four call sites shows it would leave two of them behaving exactly as
they do today, and would turn a third into a crash. The scope below is what closing WR-03
actually costs.
</objective>

<critical_context>
**The four call sites, traced at HEAD. Read this before touching anything.**

| Site | Current handling | What a bare "narrow to ENOENT" would do |
|---|---|---|
| `:534` `checkLanguage()` | `catch (e) { if (e instanceof CorruptCatalogError) {...; continue}; throw e }` | The new error is not a `CorruptCatalogError`, so it **propagates out of `lintTranslations()`** — an uncaught crash. That is precisely the CR-01 defect, re-created at a different errno. |
| `:601` English pre-read | identical shape | identical crash |
| `:332` `missingPairs()` English read | **bare `catch { enCatalog = null }`** | **swallows the new error unchanged.** No behaviour change at all. |
| `:349` `missingPairs()` locale read | **bare `catch { localeCatalog = null }`** | **swallows it unchanged.** No behaviour change at all. |

So narrowing `readCatalog()` alone fixes 0 of 4 sites: two crash, two are unchanged.

**And the swallow at `:332`/`:349` is worse than the review knew.** Its justification comment
(`:324-329`) says the error "is reported elsewhere (`lintTranslations()`'s `hardFailures`)".
That premise holds on the lint path — and is **false on the write-baseline path**:

```
main()  :705   if (process.env.LINT_TRANSLATIONS_WRITE_BASELINE === '1') {
        :706     writePresenceBaseline(localesPath)
        :707     return          <-- lintTranslations() is NEVER called
```

`writePresenceBaseline()` (`:452`) calls `missingPairs()` directly. So under
`LINT_TRANSLATIONS_WRITE_BASELINE=1`:

- an unreadable **locale** catalog → `localeFlat = {}` → **every English key recorded as missing
  for that locale**, written to the committed baseline JSON, exit 0;
- an unreadable **`en`** catalog → `return []` → baseline written with `missing: {}`,
  `totalPairs: 0` — "there is no gap at all" — exit 0.

A wrong finding is recoverable. A wrong committed artifact is the thing every later run is
measured against.

**MEASURED BASELINES (orchestrator, isolated runs, immediately before this plan):**
- `npx jest --selectProjects Meta --runInBand` → **37 suites, 1018 passed, 1 skipped, 1019 total**
- `pnpm lint-translations:gamelib` → **`0 findings, 0 hard failures`**, exit 0

**EISDIR is the RED-proof mechanism.** `mkdir <fixture>/xx/translation.json` makes `readFileSync`
fail with `EISDIR` — no `chmod`, no permission games, works as root, works in CI. Do NOT build a
test that relies on `chmod 000`: it is a no-op for root and will fail open in some CI images.

=== ABSOLUTE PROHIBITIONS ===

- **NEVER call `writePresenceBaseline()` from a test, and never run
  `LINT_TRANSLATIONS_WRITE_BASELINE=1`.** It writes `meta/i18nCatalogPresenceBaseline.json` —
  the real committed artifact. There is no path parameter. A test that invokes it corrupts the
  repo. Assert the *propagation contract* (`missingPairs()` throws) instead; that is the
  mechanism by which the writer refuses.
- **NEVER import `meta/genI18nGateScope.ts` or run `pnpm gen-i18n-gate-scope`** — no
  `require.main` guard; importing overwrites `meta/i18nForkTouchedFiles.json`.
- **NEVER `git stash`** in any form — `stash@{0}` belongs to another session.
- **NEVER `git add -A` / `git add .` / `git commit -a`.** Stage by explicit path; verify with
  `git diff --cached --name-only` before every commit.
- **NEVER `git checkout -- <path>` / `git restore` / `git reset --hard` / `git clean`** — the
  post-checkout hook fires a binary download and throws. Use `git show HEAD:<path> > <path>`.
- **NEVER run any `gsd-sdk` write verb** (`state.*`, `roadmap.*`, `phase.complete`). They have
  corrupted STATE.md and ROADMAP.md four times while reporting success.
- **Do NOT run `pnpm test:ci`** (exits 1 at HEAD from an unrelated leaked
  `store_embed_open` timer, `src/backend/sidecar/sidecarRpc.ts:339`) or **`pnpm lint`**
  (warning ceiling already breached, Phase 39 debt). Neither is yours.
</critical_context>

<task id="1" name="RED-prove all three holes at HEAD, before changing anything">
  <read_first>
    - meta/lintTranslations.ts — readCatalog (~:134-165), missingPairs (:320-365), checkLanguage's read (:528-545), the English pre-read (:590-612), writePresenceBaseline (:452), main() (:697-712)
    - meta/__tests__/lintTranslations.test.ts — the existing fixture-tree helpers and R17
  </read_first>
  <action>
  Write three tests against an EISDIR fixture and run them **on unmodified source**. All three
  must FAIL. Capture the failure output verbatim — it goes in the SUMMARY.

  1. **`readCatalog()` classifies an unreadable file as absent.** Expect: throws a
     read-failure error. At HEAD it returns `null`.
  2. **`lintTranslations()` reports an unreadable catalog as a named hard failure and returns
     normally.** At HEAD it silently downgrades to a "not yet translated" finding for an
     upstream namespace. Assert on `hardFailures` content, and assert the call does not throw.
  3. **`missingPairs()` propagates an unreadable catalog instead of recording every key as
     missing.** At HEAD it returns a fully-populated missing set. Build the fixture so the
     difference is unambiguous: an `en` catalog with a known key, one locale directory whose
     catalog is a DIRECTORY.

  If any of the three PASSES at HEAD, stop and report it — a green test before the fix means it
  is not testing what its name says, and this repo has shipped exactly that before.
  </action>
  <acceptance_criteria>
    - Three new tests exist and all three FAIL against unmodified `meta/lintTranslations.ts`
    - The failure output for each is captured verbatim for the SUMMARY
    - No production source file has been modified yet
  </acceptance_criteria>
  <commit>test(260907-8yz): RED-prove the three unreadable-catalog holes</commit>
</task>

<task id="2" name="Narrow readCatalog and classify at all four call sites">
  <action>
  Add a `CatalogReadError` alongside `CorruptCatalogError`, carrying language, namespace and the
  errno **code** (`EACCES`, `EISDIR`, ...). Follow `CorruptCatalogError`'s existing discipline:
  carry the message TEXT, never the raw `Error` object — T-41-03-04 forbids stack traces in
  gate output.

  Then:

  1. **`readCatalog()`** — re-throw as `CatalogReadError` unless
     `(error as NodeJS.ErrnoException)?.code === 'ENOENT'`; ENOENT still returns `null`.
     **Update the doc comment**, which currently documents the broad catch as deliberate
     ("ENOENT or any other read failure"). Leaving that sentence in place would make the code
     read as considered when it is now the opposite.
  2. **`:534` and `:601`** — add a `CatalogReadError` branch that pushes a NAMED entry to
     `result.hardFailures` and continues. It must NOT fall through to `throw error`. Naming
     matters: the message must say the file could not be READ and give the errno code, so it is
     distinguishable from both "absent" and "corrupt" in gate output.
     - At `:601`, mirror what the corrupt path does — the namespace must be excluded from the
       drift check afterwards, or `comparePresenceBaseline()` runs against a catalog that was
       never read. Reuse `corruptEnglishNamespaces` or add a sibling set; if you reuse it,
       rename it so the name still describes its contents.
  3. **`missingPairs()` `:332`/`:349`** — let `CatalogReadError` PROPAGATE. Keep swallowing
     absence. Rewrite the justification comment: its claim that the failure "is reported
     elsewhere" is true on the lint path and false under
     `LINT_TRANSLATIONS_WRITE_BASELINE=1`, and that asymmetry is the reason for the difference
     in handling.
  4. **`:679`, the `comparePresenceBaseline()` call inside `lintTranslations()`** — now that
     `missingPairs()` can throw, this call site must catch `CatalogReadError` and record a hard
     failure, or the lint path crashes. This is the site that decides whether the fix closes
     CR-01's defect class or re-opens it.

  `writePresenceBaseline()` needs no catch: propagation is the desired behaviour there. Its
  refusal to write must be a real consequence, so confirm by code-read that nothing between
  `missingPairs()` and the write swallows it.
  </action>
  <acceptance_criteria>
    - All three task-1 tests now PASS
    - `lintTranslations()` returns normally on an unreadable catalog — assert it does not throw
    - Hard-failure text names the errno code and distinguishes read-failure from absent/corrupt
    - `readCatalog()`'s doc comment no longer describes the broad catch as intended behaviour
  </acceptance_criteria>
  <commit>fix(260907-8yz): an unreadable catalog is a named hard failure, not an absent one</commit>
</task>

<task id="3" name="Verify against the measured baselines, close the todo, write the SUMMARY">
  <action>
  Run each as a SEPARATE tool call — never chained onto a write with `&&`, which has read stale
  in this repo:

      pnpm lint-translations:gamelib 2>&1 | tail -2
      npx jest --selectProjects Meta --runInBand --silent 2>&1 | tail -5
      pnpm codecheck 2>&1 | tail -2

  Expected: `0 findings, 0 hard failures`; Meta at **1018 passed + your new tests**, 1 skipped,
  37 suites, **no test that previously passed now failing**; codecheck exit 0. Name any new
  failure explicitly, including outside your own area.

  Then:
  - `git mv` the todo to `.planning/todos/completed/` with a closure record stating what was
    actually fixed and that the scope exceeded the review's prescription — including the
    write-baseline path finding, which the review did not have.
  - Update the `Outstanding` list in
    `.planning/phases/41-.../41-REVIEW-FIX.md`: WR-03 moves out of `outstanding:` into the
    disposition table as FIXED, `findings_fixed` 4 → 5, and `status:` stays `partial` (WR-02,
    IN-01, IN-02 remain open). **Do not touch `41-REVIEW.md`.**
  - Write `SUMMARY.md` with the captured RED output from task 1 and every measured count.
  </action>
  <acceptance_criteria>
    - `pnpm lint-translations:gamelib` → `0 findings, 0 hard failures`
    - Meta reports no NEW failure against 1018 passed / 1 skipped / 37 suites
    - `pnpm codecheck` exit 0
    - `41-REVIEW-FIX.md` frontmatter shows `findings_fixed: 5` and `outstanding: [WR-02, IN-01, IN-02]`
    - `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` is EMPTY
  </acceptance_criteria>
  <commit>docs(260907-8yz): close the WR-03 todo and record the fix pass</commit>
</task>

<verification>
- `pnpm lint-translations:gamelib` — `0 findings, 0 hard failures`
- `npx jest --selectProjects Meta --runInBand` — no new failures vs 1018 passed
- `pnpm codecheck` — exit 0
- `git status --porcelain meta/i18nCatalogPresenceBaseline.json meta/i18nForkTouchedFiles.json` — EMPTY (neither artifact was rewritten)
- `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` — EMPTY
</verification>
