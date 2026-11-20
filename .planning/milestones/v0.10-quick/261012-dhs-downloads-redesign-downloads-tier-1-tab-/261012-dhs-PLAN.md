---
phase: quick-261012-dhs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer): Downloads tab contract + tab + badge, ring removed, nav tests, gate-scope artifacts
  - src/frontend/components/UI/NavShell/navTabs.ts
  - src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
  - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
  - src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx
  - src/frontend/components/UI/NavShell/index.tsx
  - src/frontend/components/UI/NavShell/index.scss
  - src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts
  - src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/NavShell.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/DownloadsTabIcon.test.tsx
  - meta/i18nGateScope.json
  - meta/i18nForkTouchedFiles.json
  # Task 1 deletions (git rm)
  - src/frontend/components/UI/NavShell/components/DownloadsRing/index.tsx
  - src/frontend/components/UI/NavShell/components/DownloadsRing/index.scss
  - src/frontend/components/UI/NavShell/__tests__/DownloadsRing.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/downloadsRingStyles.test.ts
  # Task 2: Steam-style Download Manager page (meta/i18nGateScope.json + i18nForkTouchedFiles.json edited again)
  - src/frontend/screens/DownloadManager/index.tsx
  - src/frontend/screens/DownloadManager/index.css
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.css
  - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
  - src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts
  - src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx
  - src/frontend/screens/DownloadManager/components/ProgressHeader/index.css
  - src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts
  - src/frontend/screens/DownloadManager/DownloadManagerHeader/index.tsx # deleted (git rm)
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
  # Task 3: skill reversal note + comment-only repoints off the deleted ring
  - .claude/skills/sketch-findings-gamelib/references/navigation-shell.md
  - .claude/skills/sketch-findings-gamelib/SKILL.md
  - src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/navTourAnchorCensus.test.ts
  - src/frontend/components/UI/NavShell/__tests__/HeroicVersion.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts
  - src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx
  - src/frontend/components/UI/Dropdown/index.scss
  - src/frontend/screens/Library/components/GameCard/index.css
autonomous: true
requirements:
  - QUICK-261012-dhs

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "The navbar shows five card tabs in this order: Accounts, Library, Stores, Downloads, Settings (D-01, D-02). The Downloads tab links to `/download-manager` and is lit on that route (`resolveActiveTab('/download-manager') === 'downloads'`). The tier-2 column collapses on it, the same way it does for Accounts. An unrouted path still lights no tab."
    - "The navbar's Downloads ring is gone: no `DownloadsRing` component, no `.NavShell__navRight` cluster (D-03). The Downloads tab's icon shows a count badge only when the download queue is non-empty. The count comes from `getDMQueueInformation` at mount, then from the `handleDMQueueInformation` push, and the subscription is removed on unmount."
    - "Exactly one element in `src/frontend` defines `data-tour=\"nav-downloads\"`, and it is the Downloads `<Tab>`. The onboarding tour's downloads step therefore still resolves."
    - "The Download Manager page opens with ONE edge-to-edge progress bar at the very top (D-04). It spans the full content width with no side margin, is filled to the current download's percent, and sits at 0 when idle. No second progress bar exists anywhere on the page: ProgressHeader's 400px `LinearProgress` is gone."
    - "Below the bar, a hero shows the current game's artwork faded behind its details (`art_background`, else `art_cover`, else `art_square`, loaded through `CachedImage` with the others as fallbacks). The details are the cover thumbnail, the title, Install/Update and the store, `percent% · bytes`, the ETA (or the Paused string), the download/disk speed chart with its MB/s readouts, and working pause/resume and cancel buttons. When idle, the hero shows only the 'Nothing to download' line, with no artwork."
    - "Queued items sit under an 'Up Next' section (new gamelib key) and finished items under 'Completed' (D-04). Each section is a header row (title at left, Clear List at right for Completed) over a 1px separator line. The line is visible in every theme because it is drawn from `--text-secondary`, not from `--divider`, which only 2 of the 10 themes declare. Rows are reused `DownloadManagerItem`s with no surrounding bordered box."
    - "The hardcoded-string gate scans the new source files, the gamelib presence baseline records the new key, and `sketch-findings-gamelib` records that the user reversed 'Downloads is not a tab' on 2026-10-12 (D-05)."
  artifacts:
    - path: src/frontend/components/UI/NavShell/navTabs.ts
      provides: "five-tab contract: NAV_TAB_IDS with downloads, NAV_TAB_INDEX downloads:3 settings:4, /download-manager -> 'downloads'"
      contains: "downloads: 3"
    - path: src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx
      provides: "Tab icon: faDownload + live queue-count badge (ported subscription), forwards MUI's cloned className"
      contains: "handleDMQueueInformation"
    - path: src/frontend/components/UI/NavShell/__tests__/DownloadsTabIcon.test.tsx
      provides: "seed, push, unsubscribe-cleanup, className-forwarding, rejected-seed and no-data-tour coverage for the ported subscription"
    - path: src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
      provides: "edge-to-edge bar + cover-art hero with progress text, ETA, speed chart and pause/resume/cancel"
      contains: "heroArtSources("
    - path: src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
      provides: "pure heroArtSources() (art precedence + CachedImage fallbacks) and heroPercent() (clamp, idle=0)"
      contains: "export function heroArtSources"
    - path: src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts
      provides: "comment-immune source gates: no second bar, no legacy boxed sections, bar has no margin, separators not on --divider, art never a CSS url()"
  key_links:
    - from: src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
      to: src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx
      via: "Downloads <Tab icon={<DownloadsTabIcon />}> -- MUI clones the icon passing className, so the label stays a plain t() string"
      pattern: "icon=\\{<DownloadsTabIcon"
    - from: src/frontend/components/UI/NavShell/index.tsx
      to: src/frontend/components/UI/NavShell/navTabs.ts
      via: "tier2Collapsed includes activeTab === 'downloads'"
      pattern: "activeTab === 'downloads'"
    - from: src/frontend/screens/DownloadManager/index.tsx
      to: src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
      via: "<DownloadHero key={currentElement?.params.appName ?? 'idle'} element={currentElement} state={state} /> -- keyed so gameInfo and the hasProgress instance reset per download"
      pattern: "<DownloadHero"
    - from: src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
      to: src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx
      via: "hero lower band renders <ProgressHeader state appName runner /> (chart + readouts only; speedSample.ts untouched)"
      pattern: "<ProgressHeader"
---

<objective>
Downloads redesign, from the user's five-point request. (1) A Downloads tab goes before Settings. (2) It replaces the
titlebar ring. (3) Download progress looks like Steam's, with cover art behind it. (4) The separate "Downloading" box
and download bar are replaced by one edge-to-edge progress bar at the top. (5) Separator lines divide the queue and
completed sections, as in Steam.

**This reverses a recorded design decision on purpose.** `sketch-findings-gamelib` →
`references/navigation-shell.md` §6 says "Downloads is ambient state, not a destination", and its What-to-Avoid list
says "Do not make Downloads a tab". The user explicitly overruled both for this task. Implement the reversal; do not
resist it or soften it. Task 3 records it in the skill so future sessions are not misled.

**Locked decisions** (from the orchestrator's brief; cite them in commits):
- **D-01 Tab contract.** `NAV_TAB_IDS = ['accounts','games','stores','downloads','settings']`. `NAV_TAB_INDEX` is
  `downloads: 3, settings: 4`. `resolveActiveTab('/download-manager')` returns `'downloads'`. The Downloads tab has no
  tier-2 panel, so tier 2 collapses on it.
- **D-02 Downloads tab** sits between Stores and Settings. It is a `NavLink` to `/download-manager` with
  `label={t('download-manager.link','Downloads')}` and `data-tour="nav-downloads"`. Its icon slot is a colocated
  `DownloadsTabIcon`, which owns the ported queue subscription and renders `faDownload` plus a count badge. The badge
  is styled inside `.NavTabs { }` with theme tokens only.
- **D-03 Remove DownloadsRing**: the component, both of its test files, the `.NavShell__navRight` wrapper and its
  scss, and its entry in the gate-scope artifacts.
- **D-04 Steam-style Download Manager**: one edge-to-edge determinate bar at the very top, then a cover-art hero, then
  "Up Next" and "Completed" sections. Each section is a header row with a 1px separator, and the rows are unboxed.
- **D-05 Docs**: a dated reversal note in `navigation-shell.md` §6 and in its What-to-Avoid bullet, plus the
  `navTabs.ts` and `NavTabs` doc comments.
- **D-06** After the code changes, run `graphify update .`.

**Planner's calls and measured refinements** (each one is decided; do not reopen it):
1. **The separator is NOT `var(--divider)`.** The brief named it, but `--divider` is declared in only 2 of the 10
   theme blocks (`themes.scss:185,231`), and `appShellLayout.test.ts:292` already asserts
   `tokenResolvesInEveryTheme('divider')` is false. A `var()` with an undefined property and no fallback drops the whole
   declaration, so the line would vanish in 8 themes. Use `1px solid color-mix(in srgb, var(--text-secondary) 30%,
   transparent)`. `--text-secondary` is declared in the default `body {}` block (`themes.scss:3`), so it resolves
   everywhere, and it contrasts the body by design in both light and dark themes.
2. **The hero art fades to transparent, not to a solid `--body-background`.** `.App .content` paints
   `var(--gradient-body-background, var(--body-background))`, and 9 of the 10 themes define a gradient there, so a fade
   to a solid colour would leave a visible edge. The art layer gets a `mask-image` fade. Readability comes from a scrim
   that mixes `--body-background` down to `transparent`. That still honours the brief's "gradient toward
   `--body-background`", without the seam.
3. **The art is a `CachedImage` (an `<img>`), never a CSS `background-image`.** `CachedImage` routes `http` art
   through the `imagecache://` scheme and supports a `fallback` list. A CSS `url()` would bypass the cache and
   interpolate store-supplied text into a style string (T-261012-dhs-01).
4. **`DownloadManagerHeader` (the column-header row) is dropped and deleted.** Steam's download page has no column
   headers, and each row already prints its own date, type and store. The section title supplies the context
   ("Up Next" means added-at; "Completed" means finished-at). Its only importer is `DownloadManager/index.tsx`.
5. **ProgressHeader is reduced, not folded in.** It keeps only the speed chart and the MB/s readouts. Its `.downloadBar`
   block, its `LinearProgress` and its now-unused `hasProgress` call are removed, and it is rendered inside the hero's
   lower band. `speedSample.ts` is not touched.
6. **Sections render only when non-empty.** "Up Next" renders only when `plannendElements.length > 0`, and
   "Completed" keeps its existing only-when-non-empty rule. The idle hero already says "Nothing to download", so an
   empty Up Next section would repeat it. Each title carries a `(N)` count, as Steam's does.
7. **The new key is added to `en` only, and the presence baseline is regenerated with the documented writer.**
   Precedent: `a1ce5c6d5`. Measured at planning time, the baseline is ALREADY red: 96 hard failures, all from
   `library.tileSize.label` and `library.tileSize.valueText` (added by 261011-t4y, 48 locales each, never recorded).
   The writer cannot record one key alone, so regenerating records those 96 pairs plus this task's 48: totalPairs goes
   720 → 864. State this explicitly in the commit body and the SUMMARY. Do NOT hand-type translations into 48
   catalogues, and do not edit `gamelib.mt.json`.

Purpose: one launcher-wide place to watch and manage downloads, reached like every other destination, styled after the
download page users already know from Steam.
Output: a five-tab nav with a live count badge, the ring deleted, and a rebuilt Download Manager page (bar, hero,
sections). Gates and docs are updated to match.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.claude/skills/sketch-findings-gamelib/references/navigation-shell.md
@src/frontend/components/UI/NavShell/navTabs.ts
@src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
@src/frontend/components/UI/NavShell/index.tsx
@src/frontend/components/UI/NavShell/components/DownloadsRing/index.tsx
@src/frontend/components/UI/NavShell/__tests__/DownloadsRing.test.tsx
@src/frontend/screens/DownloadManager/index.tsx
@src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
@src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx

<interfaces>
<!-- Measured at planning time on this tree (branch quick-261002-b63, HEAD 5edddc8ab). Executor: use these; do not re-explore. -->

Baselines measured on THIS Windows box:
- `npx jest src/frontend/components/UI/NavShell src/frontend/screens/DownloadManager src/frontend/components/UI/Dropdown --selectProjects Frontend`: 34 suites and 666 tests, ALL PASS. 31 of those suites are in `NavShell/__tests__`. After Task 1 that directory holds 30 suites (minus the 2 ring suites, plus `DownloadsTabIcon.test.tsx`).
- `npx jest src/frontend/screens/Library/components/GameCard --selectProjects Frontend`: 4 suites and 59 tests, all pass.
- `npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/lintTranslations.test.ts --selectProjects Meta`: **3 tests ALREADY FAIL. They are pre-existing, not caused by this task.**
  - `genI18nGateScope … A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation`. The drift is exactly three files from other quick tasks: `src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider/index.tsx`, `src/frontend/screens/Game/GameSubMenu/shortcutsToggle.ts` and `src/frontend/screens/Library/libraryTileSize.ts`. This test reads `git diff <base> HEAD`, so it is skipped in CI and only sees committed state. **Leave this drift alone.** Adding those three paths would trip the A-03 ratchet unless they were also scoped, and they belong to other tasks.
  - `lintTranslations … REQ-41-02: zero hard failures for the gamelib namespace` and `comparePresenceBaseline … R13: zero drift`. Both are the 96 unrecorded `library.tileSize.*` pairs. Task 2's baseline regeneration turns both green.
  - `hardcodedStringGate.test.ts` passes (about 150 s).
- `python3` is NOT installed on this box. Use `node -e`, never python, in any check.
- `pnpm lint-translations:gamelib` is `export LINT_TRANSLATIONS_NAMESPACES=gamelib && …`. That is POSIX-only and fails under pnpm's cmd shell on Windows. Use the portable equivalent from Git Bash: `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts`. Its tail line reads `lint-translations[gamelib]: N findings, M hard failures`.
- Restoring a file: `git checkout -- <file>` triggers husky post-checkout's `pnpm i`. Restore with `git show HEAD:<path> > <path>` instead.
- Three pre-existing uncommitted files: `.planning/state.json`, `.planning/debug/rust-test-ci-missing-sidecar.md` and `.planning/milestone.lock`. Never stage them. Every commit names explicit pathspecs.

Frontend jest (`src/frontend/jest.config.js`): `testEnvironment` node, no jsdom, `resetMocks: true`, ts-jest (jest.mock is NOT hoisted, so imports go textually after the mocks). The only moduleNameMapper is `\.svg\?react$` → `src/frontend/__mocks__/svgReactStub.tsx`. CSS/SCSS side-effect imports must be `jest.mock('<path>', () => ({}))`. With `jsx: react-jsx`, JSX goes through `react/jsx-runtime`, so `<Comp/>` creates `{type: Comp, props}` WITHOUT calling `Comp`.

Gate facts that constrain the new CSS and source:
- `appShellLayout.test.ts` "F-34.10-04 MUI scoping": every `MuiTab*`/`MuiTabs*` selector in `NavTabs/index.scss` must nest inside `.NavTabs { }`. The badge rules use no MuiTab selector.
- `themeTokens.test.ts` `selectedTabColourDecl` reads, with a regex, the FIRST `body.<theme>…{…color:` in `NavTabs/index.scss`, then the `&.Mui-selected {…color:` rule. **Add no `body.<theme>` selector to NavTabs/index.scss**, and place the badge rules AFTER the `.MuiTab-root { … }` block.
- `NavTabsComponent.test.tsx` stylesheet gates for NavTabs/index.scss forbid any hex colour (`#[0-9a-fA-F]{3,8}`), `--semibold`, `--navbar-active-background` and `text-transform: none`. They also require `--body-background` at least twice (already satisfied).
- `shellTokens.test.ts`: the literals `78px` and `256px` must each appear exactly once across ALL stylesheets under `src/frontend`. Use neither anywhere.
- `cssTokenSweep.test.ts`: every `var(--x)` must be declared somewhere. It scans `git ls-files`, so `git add` new stylesheets before running it. Every token named in this plan is declared.
- Hardcoded-string gate (`meta/hardcodedStringGate.ts`): user-facing attributes are `title`, `aria-label`, `alt`, `placeholder` and `label`; JSX text counts too. Strings with no letter are not candidates (`%`, `·`, `(2)`). `className`/`style`/`role`/`data-*`/`aria-*` (other than `aria-label`) are excluded. Every user-visible word goes through `t()`.
- `navTourAnchorCensus.test.ts` counts `data-tour="nav-downloads"` occurrences across every non-test `.tsx` under `src/frontend`, excluding `NavShellTour/index.tsx` and `LibraryTour.tsx`, and requires exactly 1. Put it on the Tab only, never on `DownloadsTabIcon`.
- `meta/i18nGateScope.json` is HAND-CURATED. Its `generatedBy` is prose provenance; append to it and hold `generatedAt` constant. `meta/i18nForkTouchedFiles.json` is generator output, but the precedent (plan 45-11, quick 261011-txc) hand-adds new files to BOTH artifacts with `generatedAt` held constant, because the generator diffs `<base>..HEAD` (committed state only). The A-03 ratchet requires (fork-touched minus scope) to equal `DECLARED_UNSCANNED_DEBT` exactly, so every new non-test `.ts`/`.tsx` goes into BOTH files, and a deleted one leaves BOTH.

Code facts:
- `window.api.getDMQueueInformation(): Promise<{ elements: DMQueueElement[]; finished: DMQueueElement[]; state: DownloadManagerState }>`. `window.api.handleDMQueueInformation((e, elements, state) => void)` returns its unsubscribe function.
- `DownloadManagerState = 'idle' | 'running' | 'paused' | 'stopped'` (`common/types.ts:1081`). `DMQueueElement = { type: 'update'|'install'; params: InstallParams; addToQueueTime; startTime; endTime; status? }`. `params` carries `appName`, `runner`, `path`, `gameInfo`.
- `GameInfo` (`common/types.ts:232`) has `title: string`, `art_cover: string`, `art_square: string`, `art_background?: string`, `art_logo?: string`.
- `hasProgress(appName, runner)` returns `[progress, previousProgress]`, with `progress.percent?`, `.bytes?` and `.eta?`.
- `DownloadManagerItem` (reuse its idioms VERBATIM; do not import from it): it takes `useContext(ContextProvider)` → `{ amazon, epic, gog, steam, showDialogModal }`. The title comes from `[...epic.library, ...gog.library, ...amazon.library, ...steam.library].find(v => v.app_name === appName && v.runner === runner)?.title`. Game info is seeded from `params.gameInfo` and refreshed with `getGameInfo(appName, runner)` (ignored when `runner === 'sideload'`). Cancel is `handleStopInstallation(appName, path, t, progress, runner, showDialogModal)`, where `t` is the `gamepage` namespace, and it returns early when gameInfo is falsy. Pause/resume uses `isPaused = ['idle','paused'].includes(state)`, then `window.api.resumeCurrentDownload()` when paused, or `window.api.pauseCurrentDownload()` when `state === 'running'`. Icons: `StopIcon from 'frontend/assets/stop-icon.svg?react'`, `PlayIcon …/play-icon.svg?react`, `PauseIcon …/pause-icon.svg?react`, and `{ CachedImage, SvgButton } from 'frontend/components/UI'`. It also imports `{ handleStopInstallation } from 'frontend/helpers/library'` and `{ getGameInfo, getStoreName } from 'frontend/helpers'`. Titles: `t('queue.label.resume','Resume download')`, `t('queue.label.pause','Pause download')` and `t('button.cancel','Cancel')` (gamepage `t`). Type labels are `t2('download-manager.install-type.install','Install')` and `…update','Update')`, and the store is `getStoreName(runner, t2('Other'))` (translation `t2`).
- `CachedImage` props: `src: string`, `fallback?: string | string[]`, `className?`, plus the img attributes. `SvgButton` props: `onClick`, `title?`, `className?` and children.
- `.App .content` (App.css) is a flex column with `overflow-y: auto` and NO padding. The Download Manager route renders directly inside it, so a 100%-wide first child is already edge-to-edge.
- MUI `<Tab>` clones its `icon` element with `className: clsx('MuiTab-iconWrapper', icon.props.className)`. `DownloadsTabIcon` must therefore accept `className` and forward it to its root.
- `en/gamelib.json:66-68` is `"downloadManager": {` / `"progressPaused": "Paused"` / `},` with 4-space indentation, and keys are sorted (i18next-parser `sort: true`).
- Prettier `--file-info` (measured): `public/locales/en/gamelib.json` and `.claude/skills/sketch-findings-gamelib/references/navigation-shell.md` report `"ignored": true`. Every `src/**` path, `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json` and `meta/i18nCatalogPresenceBaseline.json` report `"ignored": false`.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): Downloads becomes the fourth tier-1 tab with a live queue-count badge; the navbar ring is removed (D-01, D-02, D-03)</name>
  <files>src/frontend/components/UI/NavShell/navTabs.ts, src/frontend/components/UI/NavShell/components/NavTabs/index.tsx, src/frontend/components/UI/NavShell/components/NavTabs/index.scss, src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx, src/frontend/components/UI/NavShell/index.tsx, src/frontend/components/UI/NavShell/index.scss, src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts, src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx, src/frontend/components/UI/NavShell/__tests__/NavShell.test.tsx, src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx, src/frontend/components/UI/NavShell/__tests__/DownloadsTabIcon.test.tsx, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json (deleted: src/frontend/components/UI/NavShell/components/DownloadsRing/index.tsx, src/frontend/components/UI/NavShell/components/DownloadsRing/index.scss, src/frontend/components/UI/NavShell/__tests__/DownloadsRing.test.tsx, src/frontend/components/UI/NavShell/__tests__/downloadsRingStyles.test.ts)</files>
  <action>
This is the thin end-to-end path: route contract → tab strip → shell → `/download-manager` lands with its tab lit.

1. **`navTabs.ts` (D-01).**
   - Set `NAV_TAB_IDS` to `['accounts', 'games', 'stores', 'downloads', 'settings'] as const`, with the doc line "The five tier-1 tabs, in navbar left-to-right order."
   - Set `NAV_TAB_INDEX` to `{ accounts: 0, games: 1, stores: 2, downloads: 3, settings: 4 }` and update its doc line to match.
   - In `resolveActiveTab`, add a clause after the stores block and before the settings block: `pathname.includes('/download-manager')` returns `'downloads'`.
   - Rewrite the `resolveActiveTab` docstring. It returns `null` only for routes with no tab (unrouted paths). Quick task 261012-dhs reversed navigation-shell.md §6 by user decision: Downloads is now a destination tab, so `/download-manager` resolves to `'downloads'` (it was `null` in the ambient-ring era).

2. **New `components/DownloadsTabIcon/index.tsx` (D-02).**
   - Default-export a function component `DownloadsTabIcon({ className }: { className?: string })`.
   - State: `const [count, setCount] = useState(0)` (named `useEffect`/`useState` imports from `react`).
   - One effect with deps `[]`, ported from the deleted ring. Seed with `window.api.getDMQueueInformation().then(({ elements }) => setCount(elements.length)).catch((error) => console.error('Failed to get DM queue information:', error))`. Return `window.api.handleDMQueueInformation((e, elements) => { if (elements) setCount(elements.length) })`; that guard mirrors `DownloadManager/index.tsx`'s own.
   - Render a root `<span className={classNames('NavTabs__downloadsIcon', className)}>` containing `<FontAwesomeIcon icon={faDownload} />`. When `count > 0`, add `<span className="NavTabs__downloadsCount">{count}</span>`.
   - No stylesheet import (the styles live in NavTabs/index.scss), no `data-tour`, no `aria-label`.
   - Docstring: say why `className` is forwarded (MUI clones the icon with `MuiTab-iconWrapper`), and that the subscription was ported from the deleted DownloadsRing (34.10-03).

3. **`NavTabs/index.tsx` (D-02).**
   - Import `DownloadsTabIcon from '../DownloadsTabIcon'`.
   - Insert a `<Tab>` between the Stores and Settings tabs, in the same prop order as its siblings: `component={NavLink} to="/download-manager" value="downloads" id={`tab-${NAV_TAB_INDEX.downloads}`} label={t('download-manager.link', 'Downloads')} icon={<DownloadsTabIcon />} iconPosition="start" disableRipple data-tour="nav-downloads"`.
   - The label stays a plain `t()` string, because the tests compare labels as strings.
   - Update the component docstring: five destinations; `/download-manager` now selects the Downloads tab (quick 261012-dhs, user decision reversing navigation-shell.md §6); only an unrouted path is coerced to `false`; the aria-label sentence becomes "a sixth translatable string … the five that already exist".
   - Do not use a `gamelib:` prefix anywhere in this file (it is test-gated).

4. **`NavTabs/index.scss` (D-02).** Inside the `.NavTabs { }` block, AFTER the closing brace of `.MuiTab-root { … }`, add these two nested rules with a short comment (quick 261012-dhs: the badge replaces the ring's count; tokens only).
   - `.NavTabs__downloadsIcon`: `position: relative; display: inline-flex; align-items: center;`.
   - `.NavTabs__downloadsCount`: `position: absolute; top: -0.6em; inset-inline-end: -0.75em; box-sizing: border-box; min-width: 1.4em; height: 1.4em; padding: 0 0.35em; border-radius: 0.7em; background: var(--accent); color: var(--body-background); font-size: 0.65em; font-weight: var(--bold); line-height: 1.4em; text-align: center; pointer-events: none;`.
   - Respect the gate facts in `<interfaces>`: no hex/rgb literal, no `body.<theme>` selector, no `--semibold`, no `--navbar-active-background`, no `78px`/`256px`.

5. **`NavShell/index.tsx` (D-01, D-03).**
   - Remove the DownloadsRing import and the `<div className="NavShell__navRight">…</div>` wrapper, so the header contains only `<NavTabs />`.
   - Add `activeTab === 'downloads' ||` to `tier2Collapsed`, and extend its comment: Downloads has no tier-2 panel (quick 261012-dhs), so it collapses like Manage Accounts.
   - Leave `tier2Panel` without a downloads branch, and leave the version slot as it is.

6. **`NavShell/index.scss` (D-03).**
   - Delete the whole `.NavShell__navRight { … }` rule, including its nested ring rule.
   - In the drag-region comment, drop the clause about `.NavShell__navRight`'s interactive children.
   - In the D-05 WindowControls comment, change "nav-right cluster" to "the tab strip" (both occurrences).
   - Change nothing else.

7. **Delete the ring** with `git rm -r src/frontend/components/UI/NavShell/components/DownloadsRing src/frontend/components/UI/NavShell/__tests__/DownloadsRing.test.tsx src/frontend/components/UI/NavShell/__tests__/downloadsRingStyles.test.ts`.

8. **Update the pinned tests** (behaviour first: make these edits, run, then fix the source until green).
   - `navTabs.test.ts`:
     - The NAV_TAB_IDS expectation becomes the five ids.
     - NAV_TAB_INDEX becomes `{ accounts: 0, games: 1, stores: 2, downloads: 3, settings: 4 }`.
     - Replace the "resolves '/download-manager' to null" case with `it("resolves '/download-manager' to downloads -- Downloads is a tab since quick 261012-dhs", …)`, which expects `'downloads'`.
     - Keep the unrouted-path null case.
   - `NavTabsComponent.test.tsx`:
     - Tab count 5, with values `['accounts','games','stores','downloads','settings']`.
     - Labels `['Accounts','Library','Stores','Downloads','Settings']`.
     - `to`s `['/login','/','/store/gog','/download-manager','/settings/general']`.
     - Ids `tab-0`..`tab-4`, and rename the test title to match.
     - Change the `/download-manager` case to expect `root.props.value` to be `'downloads'`, with exactly one tab whose value equals it.
     - Add a new case: pathname `'/nowhere'` gives `value === false` and no tab whose value equals it.
     - Extend `BAKED_CAPS_PATTERN` to include `DOWNLOADS`.
     - Import `DownloadsTabIcon from '../components/DownloadsTabIcon'` after the existing component imports. Add a case "the downloads tab icon is a DownloadsTabIcon element and its label is a plain string": the downloads tab's `props.icon.type` is `DownloadsTabIcon`, and its `typeof props.label` is `'string'`.
     - Anchors: add "the downloads tab carries data-tour="nav-downloads"", and change the uniqueness Set size from 5 to 6.
     - `tabs[1]` (games) indexing is unchanged.
   - `NavShell.test.tsx`:
     - Delete the jest.mock block for the ring module and its import. In the docstring list, replace the ring test name with `DownloadsTabIcon.test.tsx`.
     - Both `it.each` tab lists become `['accounts','games','stores','downloads','settings', null]`, mapping `downloads` to `'/download-manager'` and `null` to `'/nowhere'`.
     - The version-slot hidden list becomes `['/login', '/', '/store/epic', '/download-manager', '/nowhere']`.
     - "a null active tab collapses the tier-2 column" now uses `'/nowhere'`.
     - Add "with activeTab downloads the tier-2 column contains no panel and carries the collapsed modifier" (`'/download-manager'`), mirroring the accounts case.
     - Replace the nav-right test with "the navbar renders NavTabs and no separate nav-right cluster": NavTabs is present, and no element has className `NavShell__navRight`.
   - `destinationCoverage.test.tsx`:
     - Delete the ring module mock and the ring name in the docstring's mocked-modules list.
     - In the union expectation, insert `'Downloads'` right after `'Stores'`.
     - Change the Version-mount `it.each` the same way as in NavShell.test.tsx.
   - New `__tests__/DownloadsTabIcon.test.tsx`: copy the harness from the deleted `DownloadsRing.test.tsx` (the `jest.mock('react')` useState/useEffect harness with `__beginRender`/`__resetMount`/`__getEffectCleanups`, `collectElements`, `makeElement`, and the `window.api` mock with `getDMQueueInformation`/`handleDMQueueInformation`). Mock `@fortawesome/react-fontawesome` to return `{ type: 'mock-fontawesome-icon', props }`. After the mocks, import `FontAwesomeIcon`, `faDownload` from `@fortawesome/free-solid-svg-icons`, and the component. Cases:
     - (a) Empty queue: the root className contains `NavTabs__downloadsIcon`, a child is the `FontAwesomeIcon` binding with `props.icon === faDownload`, and there is no `NavTabs__downloadsCount`.
     - (b) The seed resolves two elements; after two `await Promise.resolve()` and a re-invoke, the badge children equal 2.
     - (c) The listener captured from `handleDMQueueInformation.mock.calls[0][0]`, called with three elements, gives 3. Called with `[]`, the badge is gone.
     - (d) Effect cleanup index 0 is the unsubscribe function returned by `handleDMQueueInformation`.
     - (e) Calling with `{ className: 'MuiTab-iconWrapper' }` gives a root className containing both classes.
     - (f) A rejected seed calls `console.error` (spy it with `mockImplementation(() => {})`), does not throw, and shows no badge.
     - (g) With a populated queue, no element in the tree has a `data-tour` prop.

9. **Gate-scope artifacts (D-03).** In BOTH `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json`:
   - Remove the `files` entry for the ring's `index.tsx`.
   - Add `src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx` in alphabetical position.
   - Hold `generatedAt` constant in both.
   - Append one sentence to the end of `i18nGateScope.json`'s `generatedBy` prose: "Quick 261012-dhs deleted the navbar ring component (Downloads became a tier-1 tab by user decision) and promoted its replacement, NavShell/components/DownloadsTabIcon/index.tsx, straight into this list and into meta/i18nForkTouchedFiles.json -- still NOT a pnpm gen-i18n-gate-scope run."
   - Do not regenerate either file. Do not add the three pre-existing drifted paths listed in `<interfaces>`.

10. **Commit.**
   - Stage the explicit paths: everything modified above, the new tsx and test, and the `git rm` deletions.
   - Message: `feat(261012-dhs): Downloads becomes the fourth tier-1 tab with a queue-count badge; navbar ring removed (D-01, D-02, D-03)`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - Never stage the three pre-existing uncommitted planning files.
  </action>
  <verify>
    <automated>npx jest src/frontend/components/UI/NavShell --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'   # expect 30 suites, all PASS, 0 FAIL</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx eslint src/frontend/components/UI/NavShell/navTabs.ts src/frontend/components/UI/NavShell/components/NavTabs/index.tsx src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx src/frontend/components/UI/NavShell/index.tsx src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx src/frontend/components/UI/NavShell/__tests__/NavShell.test.tsx src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx src/frontend/components/UI/NavShell/__tests__/DownloadsTabIcon.test.tsx</automated>
    <automated>npx prettier --check src/frontend/components/UI/NavShell/navTabs.ts src/frontend/components/UI/NavShell/components/NavTabs/index.tsx src/frontend/components/UI/NavShell/components/NavTabs/index.scss src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx src/frontend/components/UI/NavShell/index.tsx src/frontend/components/UI/NavShell/index.scss src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx src/frontend/components/UI/NavShell/__tests__/NavShell.test.tsx src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx src/frontend/components/UI/NavShell/__tests__/DownloadsTabIcon.test.tsx meta/i18nGateScope.json meta/i18nForkTouchedFiles.json</automated>
    (Every path above reports `"ignored": false` under `npx prettier --file-info`, measured at planning time for these trees. The four deleted files are not checked.)
    <automated>node -e "const a=require('./meta/i18nGateScope.json').files,b=require('./meta/i18nForkTouchedFiles.json').files;const need='src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx';const bad=[...a,...b].filter(f=>f.includes('/DownloadsRing/'));if(bad.length||!a.includes(need)||!b.includes(need)){console.error('scope-bad',bad);process.exit(1)}console.log('scope-ok')"</automated>
    After the commit: <automated>npx jest meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts --selectProjects Meta 2>&1 | grep -E '^(PASS|FAIL)|●|Test Suites:|Tests:'</automated>
    Expected: hardcodedStringGate PASS. In genI18nGateScope the ONLY failing test is the pre-existing `A-17 ANTI-ROT`, and the drift it prints is exactly the three pre-existing paths from `<interfaces>`. If any ring or DownloadsTabIcon path appears in that drift, or the A-03 RATCHET fails, the hand edit is wrong: fix it in a follow-up `fix(261012-dhs)` commit.
  </verify>
  <done>The NavShell directory has 30 suites, all green. codecheck, eslint and prettier are clean over every path written. The scope artifacts drop the ring and list DownloadsTabIcon. After the commit, hardcodedStringGate is green and genI18nGateScope fails only on the pre-existing ANTI-ROT drift (three foreign paths, none from this task). The navbar renders five tabs, `/download-manager` lights Downloads and collapses tier 2, and the badge count follows the queue. One `feat(261012-dhs)` commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Steam-style Download Manager -- one edge-to-edge bar, cover-art hero, Up Next / Completed sections with separator lines (D-04)</name>
  <files>src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts, src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts, src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx, src/frontend/screens/DownloadManager/components/DownloadHero/index.css, src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx, src/frontend/screens/DownloadManager/components/ProgressHeader/index.css, src/frontend/screens/DownloadManager/index.tsx, src/frontend/screens/DownloadManager/index.css, src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json (deleted: src/frontend/screens/DownloadManager/DownloadManagerHeader/index.tsx)</files>
  <behavior>
    - heroArtSources({ art_background: 'bg', art_cover: 'c', art_square: 's' }) → { src: 'bg', fallback: ['c', 's'] }
    - heroArtSources({ art_cover: 'c', art_square: 's' }) → { src: 'c', fallback: ['s'] }; empty-string art_background is skipped the same way
    - heroArtSources({ art_square: 's' }) → { src: 's', fallback: [] }
    - heroArtSources({ art_cover: 'x', art_square: 'x' }) → { src: 'x', fallback: [] } (deduped)
    - heroArtSources(undefined) and heroArtSources({ art_cover: '', art_square: '' }) → null
    - heroPercent(false, 50) → 0; heroPercent(true, undefined) → 0; heroPercent(true, 42.5) → 42.5; heroPercent(true, 140) → 100; heroPercent(true, -3) → 0; heroPercent(true, NaN) → 0
    - Layout gates (downloadManagerLayout.test.ts, comment-stripped via stripSourceComments): the page renders DownloadHero, 'gamelib:downloadManager.upNext', 'queue.label.finished' and 'dmSection__header'. It has no h4 title, no legacy boxed-section classes and no DownloadManagerHeader. ProgressHeader has no LinearProgress and no downloadBar. The bar rule has width 100% and no margin. The fill uses var(--accent). Neither new stylesheet uses var(--divider). The section header has a 1px solid bottom border. DownloadHero uses CachedImage plus heroArtSources and never a CSS url()/backgroundImage. Every negative pattern has a SANITY counter-test proving it fires on a known-bad string.
  </behavior>
  <action>
1. **RED.** Create `components/DownloadHero/__tests__/heroModel.test.ts` covering every heroArtSources/heroPercent case in `<behavior>`. Create `src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts` with the layout gates:
   - Paths via `join(__dirname, …)`; `stripSourceComments` from `backend/testUtils/stripSourceComments`, as `NavTabsComponent.test.tsx` already imports it.
   - A brace-counting `cssBlock(source, selector)` helper that finds `${selector} {`, like `themeTokens.test.ts`'s.
   - Hoisted regex constants: `/<h4\b/`, `/dmItemList|downloadManagerCurrentSectionTitle|DownloadManagerHeader/`, `/LinearProgress|downloadBar/`, `/var\(--divider/`, `/backgroundImage|url\(/`, each with a SANITY counter-test.
   Run both test files and observe them fail (the module and the new structure do not exist yet).

2. **GREEN, `heroModel.ts`.**
   - Export `heroArtSources(info?: { art_background?: string; art_cover?: string; art_square?: string })`, returning `{ src: string; fallback: string[] } | null`. Order `[art_background, art_cover, art_square]`, drop falsy values, dedupe, take the first as `src` and the rest as `fallback`, and return `null` when nothing is left.
   - Export `heroPercent(hasElement: boolean, percent: number | undefined): number`. Return 0 when `!hasElement` or when the value is not a finite number; otherwise clamp to 0..100.
   - Pure, no imports beyond types.

3. **`components/DownloadHero/index.tsx`.**
   - Default-export a component with props `{ element?: DMQueueElement; state: DownloadManagerState }`. Import `./index.css` first. Use the imports listed in `<interfaces>` from DownloadManagerItem's idiom, plus `classNames` and `ProgressHeader from '../ProgressHeader'`.
   - **All hooks are unconditional, before any return:**
     - `useContext(ContextProvider)`.
     - `useTranslation('gamepage')` as `t`, `useTranslation('translation')` as `t2`, and `useTranslation('gamelib')` as `tGamelib`.
     - `appName = element?.params.appName ?? ''` and `runner = element?.params.runner ?? 'legendary'`, then `const [progress] = hasProgress(appName, runner)` (the deleted ring's `?? ''` precedent).
     - `const [gameInfo, setGameInfo] = useState(element?.params.gameInfo)`.
     - An effect keyed on `[appName, runner]` that, when `element` exists, awaits `getGameInfo(appName, runner)` and sets it when the result is truthy and not `sideload`.
   - Derived values:
     - `percent = heroPercent(!!element, progress.percent)`.
     - `progressText` is `` `${Math.floor(percent)}%` ``, plus `` ` · ${progress.bytes}` `` when bytes are present.
     - `etaText = state === 'running' ? (progress.eta ?? '00.00.00') : tGamelib('gamelib:downloadManager.progressPaused', 'Paused')`.
     - `art = heroArtSources(gameInfo)`, `cover = gameInfo?.art_cover || gameInfo?.art_square`.
     - `title` from the ContextProvider library lookup, falling back to `gameInfo?.title ?? appName`.
   - Render a `<section className={classNames('downloadHero', { 'downloadHero--idle': !element })}>`. Its first child is the bar `<div className="downloadHero__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(percent)} aria-label={t2('download-manager.title', 'Downloads')}>`, which wraps `<div className="downloadHero__barFill" style={{ width: `${percent}%` }} />`. The bar renders in both states.
   - Idle (no element): render `<p className="downloadHero__idle">{t2('queue.label.empty', 'Nothing to download')}</p>` and nothing else.
   - Active: render `.downloadHero__panel` containing, in order:
     - `{art && <CachedImage className="downloadHero__art" src={art.src} fallback={art.fallback} alt="" aria-hidden="true" />}`
     - `<div className="downloadHero__scrim" aria-hidden="true" />`
     - `.downloadHero__content`, which holds:
       - `{cover && <CachedImage className="downloadHero__cover" src={cover} alt={title} />}`
       - `.downloadHero__info`: `<h3 className="downloadHero__title">{title}</h3>`, then `<span className="downloadHero__meta">` with the translated type, a ` · ` separator and the store name, then `<span className="downloadHero__progress">{progressText}</span>`, then `<span className="downloadHero__eta" title={t2('download-manager.ETA', 'Estimated Time')}>{etaText}</span>`.
       - `.downloadHero__actions`: a pause/resume `SvgButton`, rendered only when `isPaused || state === 'running'`, with a `PlayIcon className="playIcon"` when paused and a `PauseIcon className="pauseIcon"` when running, and the resume/pause titles; then a cancel `SvgButton` titled `t('button.cancel', 'Cancel')` wrapping `StopIcon className="cancelIcon"`, whose handler returns early without gameInfo and otherwise calls `handleStopInstallation(appName, element.params.path, t, progress, runner, showDialogModal)`.
     - `.downloadHero__speed` wrapping `<ProgressHeader state={state} appName={appName} runner={runner} />`.
   - Never put art into a `style`/`backgroundImage` (T-261012-dhs-01).

4. **`components/DownloadHero/index.css`** (flat CSS, no nesting, tokens only, no `78px`/`256px`, no `--divider`):
   - `.downloadHero`: `position: relative; display: flex; flex-direction: column; width: 100%;`
   - `.downloadHero__bar`: `width: 100%; height: 6px; flex: none; overflow: hidden; background: color-mix(in srgb, var(--text-secondary) 20%, transparent);`. NO margin property at all; edge-to-edge is the requirement.
   - `.downloadHero__barFill`: `height: 100%; background: var(--accent); transition: width 0.3s ease;`
   - `.downloadHero__panel`: `position: relative; overflow: hidden; min-height: 220px; display: flex; flex-direction: column; justify-content: flex-end; gap: var(--space-md); padding: var(--space-lg);`
   - `.downloadHero__art`: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; opacity: 0.55; pointer-events: none;` plus a `-webkit-mask-image` and `mask-image` of `linear-gradient(to bottom, black 0%, black 35%, transparent 100%)`.
   - `.downloadHero__scrim`: `position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to right, color-mix(in srgb, var(--body-background) 80%, transparent) 0%, color-mix(in srgb, var(--body-background) 40%, transparent) 55%, transparent 100%);`
   - `.downloadHero__content`: `position: relative; display: flex; align-items: flex-end; gap: var(--space-lg);`
   - `.downloadHero__cover`: `width: 96px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--space-2xs); flex: none; box-shadow: 0 4px 16px rgb(0 0 0 / 45%);`
   - `.downloadHero__info`: `display: flex; flex-direction: column; gap: var(--space-2xs); min-width: 0; flex: 1; text-align: start;`
   - `.downloadHero__title`: `margin: 0; font-size: var(--text-xl); color: var(--text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
   - `.downloadHero__meta` and `.downloadHero__eta`: `color: var(--text-secondary); font-size: var(--text-sm);`. `.downloadHero__progress`: `color: var(--text-default); font-weight: var(--bold);`
   - `.downloadHero__actions`: `display: flex; align-items: center; gap: var(--space-sm);`. `.downloadHero__actions svg`: `width: 36px; height: 36px;`
   - Icon fills, scoped to `.downloadHero` and copied from DownloadManagerItem/index.css: `.downloadHero .cancelIcon circle { fill: var(--cancel-button, var(--danger)); }`, its `:hover` → `var(--danger-hover)`, `.downloadHero .playIcon circle { fill: var(--brand-secondary, var(--success)); }`, and its `:hover` → `var(--brand-primary, var(--success-hover))`.
   - `.downloadHero__speed`: `position: relative;`. `.downloadHero__idle`: `margin: 0; padding: var(--space-lg); color: var(--text-secondary); text-align: start;`

5. **ProgressHeader reduce (planner's call 5).**
   - In `ProgressHeader/index.tsx`, delete the whole conditional `.downloadBar` JSX block, the `hasProgress` import and call, the `Box`/`LinearProgress`/`Typography` import, and the `tGamelib` translation hook. Keep the chart, both readouts, the sampling effect and the props signature.
   - Return just the `.progressHeader` div; the fragment is unnecessary.
   - In `ProgressHeader/index.css`, delete the `.downloadBar`, `.linearProgress`, `.linearProgress > .MuiLinearProgress-bar`, `.downloadProgressStats`, `.downloadProgress` and `.downloadStat` rules. Reduce `.progressHeader` to `padding: 0;`, dropping its border, background, radius and margin, because it is now a transparent band inside the hero.
   - Do not touch `speedSample.ts` or its test.

6. **`DownloadManager/index.tsx`.**
   - Add `const { t: tGamelib } = useTranslation('gamelib')` and import `DownloadHero from './components/DownloadHero'`. Remove the `ProgressHeader` and `DownloadManagerHeader` imports. Keep the state, effects, `hasHelp`, the refreshing branch, `handleClearList`, `handleClearItem` and `doneElements` logic exactly as they are, plus the "Other Keys" comment.
   - Replace the returned JSX with a `<div className="downloadManagerPage">` containing three parts:
     - `<DownloadHero key={currentElement?.params.appName ?? 'idle'} element={currentElement} state={state} />`.
     - When `plannendElements.length > 0`, a `<section className="dmSection">`. Its `<header className="dmSection__header">` holds `<h5 className="dmSection__title">{tGamelib('gamelib:downloadManager.upNext', 'Up Next')}<span className="dmSection__count">{`(${plannendElements.length})`}</span></h5>`. Below it, `<div className="dmSection__list">` maps `DownloadManagerItem key={el.params.appName} element={el} current={false}`.
     - When `doneElements.length` is non-zero, the same section shape titled `t('queue.label.finished', 'Completed')` with its count span. Its header also holds the existing `<button className="button is-text" onClick={() => handleClearList()}>{t('queue.label.clear', 'Clear List')}</button>` at the right. The list maps `DownloadManagerItem key={key} element={el} current={false} handleClearItem={handleClearItem}`.
   - No `<h4>`, no "Downloading" section, no `dmItemList`.
   - `git rm src/frontend/screens/DownloadManager/DownloadManagerHeader/index.tsx` (planner's call 4).

7. **`DownloadManager/index.css`.** Replace the entire file with these rules (delete every old rule, including the dead `.downloadManager > .MuiTabs-*` ones):
   - `.downloadManagerPage`: `display: flex; flex-direction: column; width: 100%; padding-bottom: var(--space-xl);`
   - `.dmSection`: `padding: var(--space-lg) var(--space-lg) 0;`
   - `.dmSection__header`: `display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding-bottom: var(--space-xs); border-bottom: 1px solid color-mix(in srgb, var(--text-secondary) 30%, transparent);`
   - `.dmSection__title`: `margin: 0; text-align: start; text-transform: uppercase; letter-spacing: 0.04em; font-size: var(--text-sm); font-weight: var(--bold); color: var(--text-secondary);`
   - `.dmSection__count`: `margin-inline-start: var(--space-2xs); font-weight: var(--regular);`
   - `.dmSection__list`: `display: flex; flex-direction: column;`
   - `.dmSection__list > .downloadManagerListItem:first-child`: `border-top: none;`. This stops the row's own top border doubling the header line in the two themes that define `--divider`.
   - Add a comment explaining why the separator uses `--text-secondary` (planner's call 1).

8. **i18n key (planner's call 7).**
   - Pre-check: `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts 2>&1 | tail -1` must read `816 findings, 96 hard failures` (the measured baseline). If it reads anything else, STOP and report; do not regenerate.
   - In `public/locales/en/gamelib.json`, change the `downloadManager` block to `"progressPaused": "Paused",` followed by `"upNext": "Up Next"`, with matching 8-space indentation. It is prettier-ignored, so hand-match the surrounding style.
   - Then run the writer: `LINT_TRANSLATIONS_WRITE_BASELINE=1 LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts`.
   - Verify with the node check in `<verify>` that `totalPairs` is 864 and that the `missing` keys `downloadManager.upNext`, `library.tileSize.label` and `library.tileSize.valueText` each list 48 locales.
   - `D=$(git diff -U0 -- meta/i18nCatalogPresenceBaseline.json) && printf '%s\n' "$D" | grep '^-[^-]'` must show only the old `generatedAt` and `totalPairs` lines.

9. **Gate-scope artifacts.** In BOTH `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json`:
   - Add `src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts` and `src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx` in alphabetical position.
   - Hold `generatedAt` constant.
   - Append to `i18nGateScope.json`'s `generatedBy`: "Quick 261012-dhs also promoted DownloadManager/components/DownloadHero/index.tsx and its pure heroModel.ts straight into this list and into meta/i18nForkTouchedFiles.json -- still NOT a pnpm gen-i18n-gate-scope run."
   - `DownloadManager/index.tsx` stays in the declared unscanned debt, unchanged.

10. **Run and commit.**
    - Run `git add` on the new files first, so `cssTokenSweep` sees the new stylesheets, then run the verify commands.
    - Commit with explicit pathspecs, including the `git rm`: `feat(261012-dhs): Steam-style Download Manager -- edge-to-edge progress bar, cover-art hero, Up Next / Completed sections with separators (D-04)`.
    - The body must say that the baseline regeneration also recorded the 96 pre-existing `library.tileSize.*` pairs from 261011-t4y.
    - End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/DownloadManager src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/components/UI/NavShell/__tests__/shellTokens.test.ts --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'   # all PASS; heroModel and downloadManagerLayout among them; speedSample + status unchanged and green</automated>
    <automated>pnpm codecheck && pnpm find-deadcode</automated>
    <automated>npx eslint src/frontend/screens/DownloadManager/index.tsx src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts</automated>
    <automated>pnpm i18n --fail-on-update && pnpm i18n-churn-guard</automated>
    <automated>LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts 2>&1 | tail -1   # must end ", 0 hard failures"</automated>
    <automated>node -e "const b=require('./meta/i18nCatalogPresenceBaseline.json');const n=Object.values(b.missing).reduce((s,l)=>s+l.length,0);const ks=['downloadManager.upNext','library.tileSize.label','library.tileSize.valueText'];const ok=b.totalPairs===864&&n===864&&ks.every(k=>(b.missing[k]||[]).length===48);if(!ok){console.error('baseline-bad',b.totalPairs,n,ks.map(k=>(b.missing[k]||[]).length));process.exit(1)}console.log('baseline-ok')"</automated>
    <automated>node -e "const a=require('./meta/i18nGateScope.json').files,b=require('./meta/i18nForkTouchedFiles.json').files;const need=['src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts','src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx'];if(!need.every(p=>a.includes(p)&&b.includes(p))){console.error('scope-bad');process.exit(1)}console.log('scope-ok')"</automated>
    <automated>npx prettier --check src/frontend/screens/DownloadManager/index.tsx src/frontend/screens/DownloadManager/index.css src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx src/frontend/screens/DownloadManager/components/DownloadHero/index.css src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx src/frontend/screens/DownloadManager/components/ProgressHeader/index.css src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts meta/i18nGateScope.json meta/i18nForkTouchedFiles.json meta/i18nCatalogPresenceBaseline.json</automated>
    (`public/locales/en/gamelib.json` reports `"ignored": true` under `npx prettier --file-info`, so it is deliberately absent from the check. Its consistency comes from `pnpm i18n --fail-on-update` and the lint run above, plus hand-matching the surrounding lines.)
    After the commit: <automated>npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/lintTranslations.test.ts --selectProjects Meta 2>&1 | grep -E '^(PASS|FAIL)|●|Test Suites:|Tests:'</automated>
    Expected: hardcodedStringGate PASS and lintTranslations PASS (both previously red tests now green). genI18nGateScope fails ONLY on the pre-existing `A-17 ANTI-ROT`, with the same three foreign paths.
    Generator cross-check, also after the commit: <automated>pnpm gen-i18n-gate-scope >/dev/null && D=$(git diff -U0 -- meta/i18nForkTouchedFiles.json) && printf '%s\n' "$D" | grep -E '^[-+] ' | grep -v generatedAt; git show HEAD:meta/i18nForkTouchedFiles.json > meta/i18nForkTouchedFiles.json && git status --short meta/</automated>
    Expected: the diff lines are exactly `+` for the three pre-existing foreign paths and nothing else, which proves every hand edit from Tasks 1 and 2 matches the generator. The file is restored afterwards, and `git status --short meta/` is empty. Any other `+`/`-` line means a hand edit diverged: fix it in a follow-up `fix(261012-dhs)` commit, holding `generatedAt`.
  </verify>
  <done>heroModel RED was observed, then GREEN. The layout gates and their SANITY checks are green. The DownloadManager, cssTokenSweep and shellTokens suites are green. codecheck, find-deadcode, eslint, i18n parser and churn-guard are clean. gamelib lint shows 0 hard failures, and the baseline is at 864 with the three keys at 48 locales each. Prettier is clean over every non-ignored path. After the commit, hardcodedStringGate and lintTranslations are green, and genI18nGateScope is red only on the pre-existing ANTI-ROT drift. The generator cross-check shows only the three foreign paths. One `feat(261012-dhs)` commit.</done>
</task>

<task type="auto">
  <name>Task 3: Record the user's reversal in sketch-findings, repoint comments off the deleted ring, refresh the graph, run the regression sweep (D-05, D-06)</name>
  <files>.claude/skills/sketch-findings-gamelib/references/navigation-shell.md, .claude/skills/sketch-findings-gamelib/SKILL.md, src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx, src/frontend/components/UI/NavShell/__tests__/navTourAnchorCensus.test.ts, src/frontend/components/UI/NavShell/__tests__/HeroicVersion.test.tsx, src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts, src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx, src/frontend/components/UI/Dropdown/index.scss, src/frontend/screens/Library/components/GameCard/index.css</files>
  <action>
1. **`navigation-shell.md` (D-05).**
   - Directly under the `### 6. Downloads is ambient state, not a destination` paragraph, add a blockquote: "**Reversed 2026-10-12 by user decision (quick task 261012-dhs).** Downloads is now a tier-1 tab, the fourth, between Stores and Settings (`tab-3`; Settings moved to `tab-4`). The navbar ring (`DownloadsRing`) is deleted. The tab carries a queue-count badge (`NavShell/components/DownloadsTabIcon`). Live progress moved onto the Download Manager page as a Steam-style cover-art hero under one edge-to-edge progress bar. `/download-manager` lights the Downloads tab and collapses tier 2, which has no panel for it. The paragraph above is kept as the original decision record; do not restore the ring or re-argue the tab without a new user decision."
   - Under `### Downloads progress ring` in CSS Patterns, add one line: "Retired 2026-10-12 (quick 261012-dhs): the component is deleted; the recipe is kept for the record only."
   - In What to Avoid, replace the bullet "**Do not make Downloads a tab.** Ambient progress ≠ destination." with "**Downloads IS a tab (reversed 2026-10-12, quick 261012-dhs, user decision)** — the fourth tier-1 tab, `tab-3`. Do not reintroduce the navbar ring."

2. **`SKILL.md`.** In the findings-index row for the navigation shell, change "Downloads is an ambient progress ring, not a tab" to "Downloads was an ambient ring until 2026-10-12, when the user reversed it (quick 261012-dhs): it is now the fourth tier-1 tab".

3. **Comment-only repoints.** Edit prose only; no code, assertion or selector changes.
   - `NavShellTour/index.tsx` docstring: the single element carrying the downloads anchor is now the Downloads tab in `NavTabs` (quick 261012-dhs), not the deleted ring.
   - `navTourAnchorCensus.test.ts:10`: drop the deleted ring test file from the Layer A list. `NavTabsComponent.test.tsx` now owns the downloads anchor's Layer A check.
   - `HeroicVersion.test.tsx:9`: the harness was "originally copied from the since-deleted `DownloadsRing.test.tsx`; `DownloadsTabIcon.test.tsx` carries the same harness".
   - `dropdownDisclosure.test.tsx:8`: same repoint for "the pattern established by …".
   - `Dropdown/index.scss:28`: rephrase "the same fix DownloadsRing/index.scss's header comment records for its own mask fix" so it names the retired navbar ring's mask fix as history (for example, "the same fix the retired navbar ring (deleted in quick 261012-dhs) recorded for its mask").
   - `GameCard/index.css` near line 672: "the same reason WineItem declares its own (as the retired navbar ring did)".
   - `appShellLayout.test.ts:185`: "(Downloads ring / wordmark)" becomes "(the tab strip's trailing edge; the Downloads ring was retired in quick 261012-dhs)".

4. **`graphify update .`** (D-06; AST-only, no API cost). `graphify-out/` is gitignored, so nothing is staged from it.

5. **Commit** the nine files with explicit pathspecs: `docs(261012-dhs): record the user's Downloads-tab reversal in sketch-findings; repoint comments off the deleted ring (D-05)`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The pre-existing three planning files stay unstaged.
  </action>
  <verify>
    <automated>npx jest src/frontend/components/UI/NavShell src/frontend/components/UI/Dropdown src/frontend/screens/DownloadManager src/frontend/screens/Library/components/GameCard --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'   # all PASS, 0 FAIL (baseline was 34 + 4 suites green; now NavShell 30 + Dropdown 1 + DownloadManager 4 + GameCard 4)</automated>
    <automated>npx eslint src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx src/frontend/components/UI/NavShell/__tests__/navTourAnchorCensus.test.ts src/frontend/components/UI/NavShell/__tests__/HeroicVersion.test.tsx src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx</automated>
    <automated>npx prettier --check src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx src/frontend/components/UI/NavShell/__tests__/navTourAnchorCensus.test.ts src/frontend/components/UI/NavShell/__tests__/HeroicVersion.test.tsx src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx src/frontend/components/UI/Dropdown/index.scss src/frontend/screens/Library/components/GameCard/index.css</automated>
    (The two `.claude/skills/...` files report `"ignored": true` under `npx prettier --file-info` (`.claude` is in `.prettierignore`), so a check over them would be vacuous and is omitted. Hand-match the surrounding markdown.)
    <automated>grep -c "261012-dhs" .claude/skills/sketch-findings-gamelib/references/navigation-shell.md   # >= 3</automated>
    <automated>grep -c "261012-dhs" .claude/skills/sketch-findings-gamelib/SKILL.md   # >= 1</automated>
    <automated>git status --short   # only the three pre-existing planning files remain dirty</automated>
  </verify>
  <done>Every Frontend suite in NavShell, Dropdown, DownloadManager and GameCard is green. eslint and prettier are clean over the non-ignored paths. The skill files carry the dated reversal in §6, CSS Patterns, What to Avoid and the index row. `graphify update .` has run. No comment in `src/` points at a ring file as if it still existed. One `docs(261012-dhs)` commit. The SUMMARY records that a live look is owed: the five-tab strip and badge, and the hero, bar and separators, in `midnightMirage`, `gruvbox_dark` and `dracula`, and at the operator's zoom.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar → renderer IPC | DM queue elements (`params.gameInfo`, `path`, title fallbacks) and queue pushes cross from the Node sidecar into the React renderer |
| store CDN → renderer | `art_background` / `art_cover` / `art_square` URLs come from third-party store metadata and are rendered as images |
| renderer → sidecar IPC | pause / resume / cancel buttons in the new hero call existing `window.api` methods |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261012-dhs-01 | Tampering | DownloadHero art rendering | medium | mitigate | Art is rendered only through `<CachedImage src fallback>`, an `<img>` whose `src` goes through `imagecache://${encodeURIComponent(...)}` for http URLs. Store text is never interpolated into a CSS `url()` or `style` string. `downloadManagerLayout.test.ts` gates DownloadHero source against `backgroundImage` / `url(`. |
| T-261012-dhs-02 | Denial of Service | DownloadsTabIcon queue subscription | low | mitigate | The effect returns the unsubscribe function from `handleDMQueueInformation`, and `DownloadsTabIcon.test.tsx` case (d) asserts cleanup identity, so tab re-mounts cannot leak listeners. A rejected seed is caught and logged (case f). |
| T-261012-dhs-03 | Elevation of Privilege | Hero cancel button (destructive: may remove partial downloads) | medium | mitigate | No new IPC. The hero reuses the exact `handleStopInstallation(appName, path, t, progress, runner, showDialogModal)` call from DownloadManagerItem, so cancel keeps that helper's existing confirmation dialog and its backend `folder_name` guard. It returns early without gameInfo, as the row does. |
| T-261012-dhs-04 | Repudiation / Integrity | i18n presence baseline regeneration | low | mitigate | The commit body and SUMMARY state that the regeneration also recorded 96 pre-existing `library.tileSize.*` pairs. The verify asserts the exact key set and counts (864 total, 48 locales per key) and that the diff removes no pairs. |
| T-261012-dhs-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan: `faDownload` comes from the already-installed `@fortawesome/free-solid-svg-icons` (already imported at `DownloadDialog/index.tsx:2`). Any task that finds itself adding a dependency must stop and return a checkpoint. |
</threat_model>

<verification>
- The navbar shows Accounts, Library, Stores, Downloads and Settings. `/download-manager` lights Downloads and collapses tier 2, and an unrouted path lights none (navTabs, NavTabsComponent and NavShell suites).
- The ring is gone: no component, no tests, no `.NavShell__navRight`, no scope entry. The tour anchor `nav-downloads` is defined exactly once, on the Tab (navTourAnchorCensus).
- The Download Manager page has exactly one progress bar, 100% wide with no margin, at the top. The hero shows art, progress text, ETA, speed chart and controls. Up Next and Completed headers each have a 1px separator drawn from `--text-secondary` (downloadManagerLayout gates, heroModel unit tests).
- The i18n gates are clean for this change, and the only remaining red Meta test is the pre-existing, foreign-path ANTI-ROT drift.
- The reversal is recorded in `sketch-findings-gamelib`, and graphify has been refreshed.
- NOT verified by this plan, and stated so in the SUMMARY: the live visual result. That covers the badge position inside MUI's `overflow: hidden` tab, the readability of the hero art and scrim in `midnightMirage`, `gruvbox_dark` and `dracula`, and the edge-to-edge bar against the window edge. The repo has no jsdom or CSS engine in jest, so a live look is owed.
</verification>

<success_criteria>
All five user points are delivered as specified: (1) a Downloads tab before Settings; (2) the ring removed; (3) a Steam-style cover-art hero; (4) one edge-to-edge bar replacing the separate "Downloading" box and download bar; (5) separator lines between Up Next and Completed. D-01 through D-06 are each implemented and cited in a commit. There are three atomic commits (two feat, one docs), plus at most one `fix(261012-dhs)` alignment commit. Every verify command passes, or matches the measured pre-existing baseline exactly as stated.
</success_criteria>

<output>
Create `.planning/quick/261012-dhs-downloads-redesign-downloads-tier-1-tab-/261012-dhs-SUMMARY.md` when done. It must record:
- the three planner refinements to the brief (the separator token, the transparent art fade, `CachedImage` instead of a CSS background);
- that the baseline regeneration also recorded the 96 `library.tileSize.*` pairs;
- the pre-existing ANTI-ROT drift (three foreign paths), deliberately left alone;
- the owed live look (three themes, badge clipping, hero readability, operator zoom).
</output>
