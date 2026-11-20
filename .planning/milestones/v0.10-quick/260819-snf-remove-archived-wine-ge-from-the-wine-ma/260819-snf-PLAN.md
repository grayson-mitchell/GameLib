---
quick_id: 260819-snf
title: "Remove archived Wine-GE from the Wine Manager + make GE-Proton downloads deterministic"
type: execute
mode: quick
wave: 1
depends_on: []
autonomous: true
area: wine/linux
upstream:
  - bdafb95ff  # Heroic v2.22.1 — Remove Wine-GE from the wine manager options (#5251)
  - feb170afb  # Heroic v2.22.1 — Make GE-Proton downloads deterministic (#5708)
files_modified:
  - src/backend/wine/manager/downloader/constants.ts
  - src/backend/wine/manager/downloader/main.ts
  - src/backend/wine/manager/downloader/utilities.ts
  - src/backend/wine/manager/utils.ts
  - src/common/types.ts
  - src/frontend/screens/WineManager/index.tsx
  - src/backend/wine/manager/downloader/__tests__/main/getter.test.ts
  - src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts  # NEW

must_haves:
  truths:
    - "No code path in GameLib can fetch from GloriousEggroll/wine-ge-custom"
    - "The Wine Manager on Linux exposes exactly two tabs: Proton-CachyOS and GE-Proton"
    - "A GE-Proton release's download/checksum are selected by matching process.arch, not by file order"
    - "No file under public/locales/ is modified"
  artifacts:
    - path: "src/backend/wine/manager/downloader/utilities.ts"
      provides: "GE-Proton arch-matched asset selection"
      contains: "type === 'GE-Proton'"
    - path: "src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts"
      provides: "RED-proven gate for the arch filter (the only real gate on feb170afb)"
  key_links:
    - from: "src/backend/wine/manager/utils.ts"
      to: "src/backend/wine/manager/downloader/main.ts"
      via: "Repositorys[] passed to getAvailableVersions"
      pattern: "Repositorys\\.PROTONGE"
---

<objective>
Port two upstream Heroic v2.22.1 commits into GameLib:

1. `bdafb95ff` — remove Wine-GE from the Wine Manager. GloriousEggroll archived
   `wine-ge-custom`; GameLib still lists it, so a Linux user can browse to and install a
   dead Wine build.
2. `feb170afb` — make GE-Proton downloads deterministic. GE-Proton now ships aarch64
   builds; today GameLib picks x86_64 only *by accident* (it is last in the asset list).

Purpose: stop offering an abandoned Wine build, and stop depending on GitHub asset
ordering for the build that replaced it.

Output: 6 source files edited, 1 test file edited, 1 new test file. Zero locale churn.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/remove-archived-wine-ge-and-deterministic-ge-proton.md

Upstream commits are already fetched on remote `origin` and resolve locally.
Read them with `git show bdafb95ff -- src/` and `git show feb170afb` before editing.
</context>

<locked_decisions>
**LOCKED — do not relitigate.**

**Locale catalogs are NOT touched.** Upstream's `bdafb95ff` strips
`wineExplanation.wine-ge` from 47 catalogs under `public/locales/`. GameLib leaves the
orphaned keys INERT. Precedent: quick task `260810-tr4` (Steam Runtime launch-wrapper
removal). Rationale, unchanged and verified in this repo:

- `meta/i18nCatalogChurnGuard.ts` forbids fork edits to upstream-owned catalogs and is
  asserted live under `pnpm test:ci` via `meta/__tests__/i18nCatalogChurnGuard.test.ts`.
- `meta/lintTranslations.ts:53` sets `const printExtraTransations = false` — extra keys
  not present in English are ignored by design.
- Upstream themselves left catalog cleanup to Weblate.

**A task that edits any file under `public/locales/` is WRONG and will fail `test:ci`.**
</locked_decisions>

<scope_decisions>
The todo's `files:` list is incomplete and, in one place, over-broad. These calls are made
here explicitly so no executor has to re-derive them.

| Site | Call | Why |
|------|------|-----|
| `__tests__/test_data/github-api-test-data.json` | **KEEP, byte-for-byte untouched** | It is **not** orphaned. `getter.test.ts:3` imports `test_data_release_list` from it as the mocked GitHub API payload for **every** repository in the loop, not just Wine-GE. Its `wine-ge-custom` URLs are inert fixture strings that are never fetched. Upstream also left this file unchanged in `bdafb95ff`. |
| `src/frontend/screens/Settings/components/PreferSystemLibs.tsx:41` | **KEEP** | Prose about custom Wine builds shipping bundled libraries ("Wine-GE, Wine-Lutris"), not a Wine Manager option. Upstream did not touch it. Editing it would also require a **new** i18n key — renaming via the `t()` default arg is a silent no-op when the key already exists — for zero functional gain. |
| `src/backend/launcher.ts:1313` | **OUT OF SCOPE** | Runtime workaround for Wine-GE/Proton-GE `<= 8.x` builds **already installed on disk**. Removing the download source does not remove existing installs, so the workaround must survive. Upstream did not touch it in `bdafb95ff`. |
| `src/common/types.ts:809` — `Type` union member `'Wine-GE'` | **KEEP** | Upstream kept it. Required: already-installed versions persisted in the `wine-releases` electron-store still carry `type: 'Wine-GE'`, and `WineVersionInfo.type` is typed as `Type`. |
| `src/common/types.ts:931` — `ReleasesInfo` key `'wine-ge'` | **KEEP** | Upstream kept it. It describes the shape of the remote releases JSON fetched by `src/backend/utils/releases.ts`, which GameLib does not control. Only its *consumer* in `wine/manager/utils.ts` is removed. |
| `src/common/types.ts:843` — `Repositorys.WINEGE` | **REMOVE** | Verified safe: `Repositorys` is a numeric enum used **only** in in-memory arrays (`wine/manager/utils.ts`, `downloader/main.ts`). It is never serialised or persisted, so renumbering the remaining members has no migration cost. |
| `__tests__/main/getter.test.ts` | **MUST EDIT** (absent from the todo's file list) | Three assertions hardcode the `wine-ge-custom` URL. Once the default repository list becomes `[PROTONGE]`, enum key `0` is PROTONGE and those assertions must name `proton-ge-custom`. This is part of upstream `bdafb95ff`. |
</scope_decisions>

<uat_ceiling>
**This is a Linux-only, user-visible change. Visual UAT is NOT satisfiable on this macOS
host** — confirming that the Wine Manager renders two tabs instead of three requires a
Linux GUI session.

**The ceiling for this task is a static + test-level gate.** The plan does not claim, and
must not be recorded as having, a visual verification. If a Linux GUI becomes available
later, the outstanding check is: open Wine Manager on Linux, confirm exactly two tabs
(Proton-CachyOS, GE-Proton) and no orange-warning Wine-GE info box.
</uat_ceiling>

<repo_hygiene>
A **concurrent session owns uncommitted work in this tree**: `.planning/STATE.md`
(modified) and `.planning/quick/260819-p2d-uat-3413-bottle-prefill-note/` (untracked).

- Do **NOT** run `git stash`, `git stash pop`, `git checkout -- <path>`, `git clean`, or
  `git reset` against anything. Stashing has stranded a concurrent session's work in this
  project twice.
- Do **NOT** use `gsd-sdk query commit` — it stages the entire tree and would absorb the
  other session's files. Commit by explicit path: `git add <the 8 files>` then `git commit`.
- Run `git status --short` and eyeball it before every commit.
</repo_hygiene>

<tasks>

<task type="auto">
  <name>Task 1: Port bdafb95ff — remove Wine-GE from the Wine Manager</name>
  <files>
    src/backend/wine/manager/downloader/constants.ts,
    src/backend/wine/manager/downloader/main.ts,
    src/backend/wine/manager/utils.ts,
    src/common/types.ts,
    src/frontend/screens/WineManager/index.tsx,
    src/backend/wine/manager/downloader/__tests__/main/getter.test.ts
  </files>
  <action>
    Run `git show bdafb95ff -- src/` and apply every hunk it contains **except** any hunk
    under `public/locales/` (there are none in that path filter — the filter is the point).
    All six files are verified to match upstream's pre-state for the affected hunks, so the
    hunks apply near-clean.

    Concretely:

    `downloader/constants.ts` — delete the `WINEGE_URL` export and its `/// Url to Wine GE
    github release page` comment (lines 1-3 plus the blank separator).

    `downloader/main.ts` — drop `WINEGE_URL` from the `./constants` import list; change the
    `getAvailableVersions` default from `repositorys = [Repositorys.WINEGE,
    Repositorys.PROTONGE]` to `repositorys = [Repositorys.PROTONGE]`; delete the entire
    `case Repositorys.WINEGE:` block.

    `wine/manager/utils.ts` — in `getLatestLocalVersions`, delete the `latestWineGE` property
    from the `isLinux` branch; in `updateWineListsIfOutdated`, delete the whole
    `if (localVersionIsOlder(latestLocalVersions.latestWineGE, releasesData['wine-ge']))
    repositoriesToFetch.push(Repositorys.WINEGE)` guard; in `updateWineVersionInfos`, change
    the non-mac default to `[Repositorys.PROTONGE, Repositorys.PROTONCACHYOS]`.

    `src/common/types.ts` — remove **only** the `WINEGE,` member from the `Repositorys` enum
    (line 843). Leave the `Type` union member `'Wine-GE'` and the `ReleasesInfo` key
    `'wine-ge'` in place — see `<scope_decisions>`; upstream kept both.

    `frontend/screens/WineManager/index.tsx` — drop `faWarning` from the
    `@fortawesome/free-solid-svg-icons` import (verified: line 119 in the Wine-GE info box is
    its **only** use in this file, so the import becomes unused and would trip eslint);
    remove `{ type: 'Wine-GE', value: 'winege' }` from the `isLinux` repositories array;
    simplify `getWineVersions` to `const versions = ...` plus a single
    `return versions.filter((version) => version.type === repo)` (the `let` must become
    `const` or eslint prefer-const fails); delete the `case 'Wine-GE':` arm of
    `wineVersionExplanation` including its `t('wineExplanation.wine-ge', ...)` call.

    **The sole GameLib divergence in this file is at line ~132** — the GE-Proton copy says
    "(default in GameLib)" where upstream says "(default in Heroic)". It sits **outside**
    every hunk above. Do not revert it.

    `__tests__/main/getter.test.ts` — replace all three occurrences of
    `https://api.github.com/repos/GloriousEggroll/wine-ge-custom/releases` with
    `https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases` (two bare URL
    assertions plus the one embedded in the `logError` message). Change nothing else; the
    `Object.keys(Repositorys).length / 2` loops adapt automatically to the shorter enum.

    Do not touch `public/locales/`, `github-api-test-data.json`, `PreferSystemLibs.tsx`, or
    `launcher.ts`.
  </action>
  <verify>
    <automated>pnpm codecheck && npx jest src/backend/wine/manager/downloader --silent && ! grep -rn 'wine-ge-custom\|WINEGE' src --include='*.ts' --include='*.tsx' | grep -v 'test_data/' && git status --short public/locales | grep . && echo LOCALE_DIRTY_FAIL || echo LOCALE_CLEAN_OK</automated>
  </verify>
  <done>
    `pnpm codecheck` exits 0. The 3 wine-downloader suites still pass (baseline: 3 suites,
    13 tests, ~6s). No `wine-ge-custom` or `WINEGE` identifier survives anywhere in `src/`
    outside `__tests__/test_data/`. `git status --short public/locales` prints nothing.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Port feb170afb — arch-matched GE-Proton asset selection, with a RED-proven gate</name>
  <files>
    src/backend/wine/manager/downloader/utilities.ts,
    src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts
  </files>
  <behavior>
    In `fetchReleases`, for `type === 'GE-Proton'`, given a release whose assets are ordered
    x86_64-first and aarch64-**last**:
    - Test 1 (`process.arch === 'x64'`): `download` is the asset **without** `-aarch64` ending
      in `.tar.gz`, and `checksum` is the non-aarch64 `.sha512sum`.
    - Test 2 (`process.arch === 'arm64'`): `download` is the `-aarch64` `.tar.gz` and
      `checksum` is the `-aarch64` `.sha512sum`.
    - Test 3 (regression guard): `type === 'Proton-CachyOS'` still resolves via its existing
      `x86_64.tar.xz` / `x86_64.sha512sum` matchers, unaffected by the new branch.

    The aarch64-last ordering is the deliberate **known-bad input**: under the pre-`feb170afb`
    fallback ("last matching asset wins") Test 1 resolves to the aarch64 build and fails. That
    is what makes this gate non-vacuous.
  </behavior>
  <action>
    Write the test file first, run it, and confirm Test 1 and Test 2 FAIL against the current
    (unmodified) `utilities.ts`. Only then apply the implementation.

    **Test file** — `src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts`.
    Follow the existing patterns in this directory: `jest.mock('backend/logger')`, import
    `fetchReleases` from `'../../utilities'` (it is exported at `utilities.ts:208`), and stub
    the network the way `__tests__/main/getter.test.ts` does —
    `axiosClient.get = jest.fn().mockResolvedValue(payload)` with `axiosClient` imported from
    `'backend/utils'`. Build the payload inline (do **not** extend
    `github-api-test-data.json`): one release, `tag_name: 'GE-Proton10-1'`, with four assets
    in this order — `GE-Proton10-1.sha512sum`, `GE-Proton10-1.tar.gz`,
    `GE-Proton10-1-aarch64.sha512sum`, `GE-Proton10-1-aarch64.tar.gz` — each with a plausible
    `browser_download_url` and distinct `size`. Override the architecture per test with
    `Object.defineProperty(process, 'arch', { value: 'x64', configurable: true })` and restore
    the captured original in `afterEach`. Assert against the entry located by
    `releases.find((r) => r.version === 'GE-Proton10-1')`, **not** by index — `fetchReleases`
    unshifts a synthetic `GE-Proton-latest` entry, so index 0 is not the release.

    **Implementation** — insert the upstream hunk from `git show feb170afb` into
    `fetchReleases` as an `else if (type === 'GE-Proton')` arm positioned between the existing
    `if (type === 'Wine-Staging-macOS')` block and the `else if (type === 'Proton-CachyOS')`
    block. It iterates `release.assets`, computes `isAarch64` from `asset.name.includes('-aarch64')`,
    `isShaChecksum` from `.endsWith('.sha512sum')` and `isTar` from `.endsWith('.tar.gz')`, and
    assigns `checksum` / `download` + `downsize` only when the asset's architecture matches
    `process.arch`. Copy it verbatim — do not "improve" the conditions.

    Note for the record (no action required): the pre-existing `getter.test.ts` fixture ships
    `.tar.xz` assets, so under the new `.tar.gz`-only matcher it leaves `download` unset for
    GE-Proton. That test asserts only `version`, so it stays green — which is precisely why
    the arch filter needs its own gate rather than relying on the existing suite.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && npx jest src/backend/wine/manager/downloader --silent</automated>
  </verify>
  <done>
    The RED step is recorded: Tests 1 and 2 were observed FAILING against unmodified
    `utilities.ts` (paste the failure output into the summary). After the implementation,
    `pnpm codecheck` exits 0 and `npx jest src/backend/wine/manager/downloader` reports 4
    suites passing with the 3 new tests green.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full gate + scoped commit</name>
  <files>(no source edits — gate and commit only)</files>
  <action>
    `pnpm codecheck` is `tsc --noEmit` **only** — it is blind to lint errors, which run in a
    separate CI workflow (`.github/workflows/lint.yml`). Run the lint workflow's commands
    directly rather than assuming codecheck covers them.

    1. `pnpm codecheck`
    2. `pnpm lint`
    3. `pnpm prettier`
    4. `pnpm find-deadcode` — this is `ts-prune --error` and **may already fail on unrelated
       pre-existing entries**. Do not treat a non-zero exit as a blocker on its own. Capture
       the output and confirm no **new** entry names any of the files this task touched
       (`downloader/constants.ts`, `downloader/main.ts`, `downloader/utilities.ts`,
       `wine/manager/utils.ts`, `common/types.ts`, `WineManager/index.tsx`). If unsure, diff
       against the same command run on `git stash`-free HEAD by using
       `git show HEAD:<file>` comparisons — **never** stash.
    5. `npx jest src/backend/wine/manager/downloader --silent` — 4 suites green.
    6. `npx jest meta/__tests__/i18nCatalogChurnGuard.test.ts --silent` — proves the locked
       no-catalog-churn decision held.
    7. `git status --short public/locales` — must print nothing.

    Then commit. Run `git status --short` first and confirm `.planning/STATE.md` and
    `.planning/quick/260819-p2d-uat-3413-bottle-prefill-note/` are still listed as dirty and
    untouched — they belong to a concurrent session. Stage **only** the eight files in this
    plan's `files_modified` by explicit path (`git add <path> ...`), never `git add -A`, never
    `gsd-sdk query commit`. Suggested message:

      fix(quick-260819-snf): drop archived Wine-GE, make GE-Proton downloads deterministic

      Ports Heroic bdafb95ff (#5251) and feb170afb (#5708). Locale catalogs left
      untouched per the 260810-tr4 precedent; orphaned wineExplanation.wine-ge keys
      stay inert.

    Finally, mark `.planning/todos/pending/remove-archived-wine-ge-and-deterministic-ge-proton.md`
    done per the project's todo convention (move to the done directory if that is the
    established pattern — check how sibling closed todos were handled before inventing one),
    and commit that separately by explicit path.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm lint && pnpm prettier && npx jest src/backend/wine/manager/downloader meta/__tests__/i18nCatalogChurnGuard.test.ts --silent && [ -z "$(git status --short public/locales)" ] && echo GATE_OK</automated>
  </verify>
  <done>
    `GATE_OK` printed. `find-deadcode` produced no new entry for any touched file. The commit
    contains exactly the eight planned files; `git status --short` still shows the concurrent
    session's `.planning/STATE.md` and `260819-p2d-*` paths as untouched and uncommitted.
  </done>
</task>

</tasks>

<threat_model>
No new attack surface. The change **removes** one outbound HTTPS fetch target
(`api.github.com/repos/GloriousEggroll/wine-ge-custom/releases`) and adds no dependencies —
no `npm`/`pnpm` install occurs, so no package-legitimacy gate applies.

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-snf-01 | Tampering | GE-Proton asset selection in `fetchReleases` | mitigate | Today the downloaded binary is whichever matching asset appears **last** in the GitHub response — attacker- or upstream-controlled ordering silently changes which build is installed. The arch filter makes selection explicit; the `.sha512sum` checksum for the *same* architecture is now paired with the tarball it actually verifies, instead of potentially pairing an aarch64 checksum with an x86_64 tarball. |
| T-snf-02 | Tampering | Archived `wine-ge-custom` repository | mitigate | An archived GitHub repo is a stale supply-chain endpoint that GameLib no longer needs to trust. Removing `WINEGE_URL` eliminates the fetch entirely. |
</threat_model>

<success_criteria>
- No `wine-ge-custom` URL or `WINEGE` identifier remains in `src/` outside the untouched
  `__tests__/test_data/` fixture.
- `Repositorys` enum no longer contains `WINEGE`; `Type` still contains `'Wine-GE'` and
  `ReleasesInfo` still contains `'wine-ge'` (matching upstream).
- The Linux Wine Manager repositories array contains exactly `Proton-CachyOS` and `GE-Proton`.
- `fetchReleases` selects GE-Proton assets by `process.arch`, proven by a test that was
  observed failing against the pre-fix implementation.
- `git status --short public/locales` is empty.
- `pnpm codecheck`, `pnpm lint`, `pnpm prettier` all exit 0; wine-downloader suites and the
  i18n churn-guard suite pass.
- The concurrent session's `.planning/STATE.md` and `260819-p2d-*` paths are untouched.
- Visual Linux UAT is explicitly **not** claimed — see `<uat_ceiling>`.
</success_criteria>

<output>
Create `.planning/quick/260819-snf-remove-archived-wine-ge-from-the-wine-ma/260819-snf-SUMMARY.md` when done.
Record in it: the RED failure output from Task 2, the `find-deadcode` before/after call, and
the outstanding Linux-GUI visual check as an explicitly unmet (not failed) verification.
</output>
