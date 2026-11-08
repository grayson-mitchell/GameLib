---
phase: quick-261108-ioc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx
  - src/frontend/screens/Settings/sections/StoreSettings/index.tsx
  - src/frontend/screens/Settings/sections/StoreSettings/__tests__/EosActionConfirmationGuard.test.ts
  - src/frontend/screens/Settings/sections/StoreSettings/__tests__/EosDeclineCallSiteGuard.test.ts
  - src/frontend/screens/Settings/sections/StoreSettings/__tests__/removeEosOverlayConfirmation.test.tsx
  - src/frontend/screens/Settings/sections/StoreSettings/__tests__/StoreSettings.test.tsx
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
  - src/frontend/screens/Settings/sections/StoreSettings/index.scss
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - src/frontend/screens/Settings/sections/index.tsx
  - src/frontend/screens/Settings/index.tsx
  - src/frontend/App.tsx
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
  - meta/i18nGateScope.json
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nGlossary.json
autonomous: true
requirements: [QUICK-261108-ioc]

must_haves:
  truths:
    - "Settings tier-2 nav shows a 'Stores' row; clicking it opens /settings/stores with the Amazon tab selected"
    - "The Stores page has five tabs in alphabetical order: Amazon, Epic, GOG, Humble, Steam; switching tabs changes the URL to /settings/stores/<store>, and loading that URL directly selects that tab"
    - "Each store tab renders its settings in order: library/install, then store features, then a collapsed 'Advanced' <details> holding the alt binary (omitted when the store has no advanced item)"
    - "Moved settings no longer render in General or Advanced; SyncSaves, SteamGridDbApiKey, AllowInstallationBrokenAnticheat, ShareDetectedFixes and every other unlisted setting stay where they were"
    - "The EOS Overlay block behaves exactly as before (same probes, same confirm dialogs, same unavailable/decline handling, same isWindows-gated Enable/Disable) but renders in the Epic tab"
    - "Accounts/login UI is unchanged; no account section in any tab"
  artifacts:
    - path: "src/frontend/screens/Settings/sections/StoreSettings/index.tsx"
      provides: "Stores page: MUI Tabs + TabPanel per store, URL-driven"
      contains: "TabPanel"
    - path: "src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx"
      provides: "EOS Overlay block extracted verbatim from AdvancedSettings"
      contains: "callOrDeclare"
  key_links:
    - from: "src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx"
      to: "/settings/stores"
      via: "NavItem url"
      pattern: "url=\"/settings/stores\""
    - from: "src/frontend/App.tsx"
      to: "screens/Settings"
      via: "route settings/:type/:store"
      pattern: "settings/:type/:store"
    - from: "src/frontend/screens/Settings/index.tsx"
      to: "StoreSettings"
      via: "type === 'stores'"
      pattern: "type === 'stores'"
---

<objective>
Consolidate store-specific global settings into a new Settings → "Stores" page with one MUI tab per store (Amazon, Epic, GOG, Humble, Steam), deep-linkable at `/settings/stores/:store`. Components move unchanged; only the EOS Overlay block is extracted out of AdvancedSettings into its own component with identical behaviour.

Purpose: store settings are currently scattered across General and Advanced; grouping them by store makes them findable.
Output: StoreSettings section + EosOverlay component, route, nav row, updated tests/gates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
Load `Skill("gamelib-conventions")` before writing/running `<verify>` (prettier rule: scoped paths only; `public/locales/**` and `.planning/**` are prettier-ignored — confirm with `npx prettier --file-info` and leave them out of `--check`).

Planner findings (already verified — do not re-investigate):

- Router: `src/frontend/App.tsx` ~line 281 declares `{ path: 'settings/:type', lazy: makeLazyFunc(import('./screens/Settings')) }`. Add a sibling `{ path: 'settings/:type/:store', lazy: makeLazyFunc(import('./screens/Settings')) }` right after it. This keeps `useParams().type === 'stores'` for both `/settings/stores` and `/settings/stores/steam`; `:store` is a separate param.
- `src/frontend/screens/Settings/index.tsx` switches on `type` (`isGeneralSettings`, `isAdvancedSetting`, …) and renders sections imported from `./sections`. Add `isStoreSettings = type === 'stores'` and render `<StoreSettings />` (export it from `sections/index.tsx` as `StoreSettings`). Place it after `<GeneralSettings />` in the render list.
- Tabs pattern: `GamesSettings/index.tsx` imports `{ Tabs, Tab } from '@mui/material'` and `{ TabPanel } from 'frontend/components/UI'`; `<Tabs value onChange aria-label variant="scrollable">` with `<Tab label value>`; `<TabPanel value={value} index={'wine'}>`. TabPanel props: `{ index: string; value: string; children }`, renders children only when `value === index`.
- Collapsible pattern: `EngineOverride.tsx` uses `<details className="engineOverride"><summary>…</summary>…</details>`, styled in `GamesSettings/index.scss` (`.engineOverride { margin-top: 1rem; summary { cursor: pointer; font-weight: 600 } &[open] summary { margin-bottom: 0.5rem } }`). Use a `<details className="storeSettingsAdvanced">` with the same rule set in a new `StoreSettings/index.scss` (closed by default — no `open` attribute).
- NavItem uses `NavLink` without `end`, so `url="/settings/stores"` stays active on `/settings/stores/<store>`.
- Deep links: `navigate('/settings/advanced')` in `SideloadDialog/index.tsx:96` and `EditGameDialog/index.tsx:40` both send the user to the SteamGridDB API key ("Settings → Advanced" link under the sgdb warning). SteamGridDbApiKey STAYS in Advanced → leave both untouched.
- PlaytimeSync IS GOG-only (verified): the `disablePlaytimeSync` setting is read only in `launcher.ts:357` (inside `isStore(runner,'gog')`), `runnerMiscFlowRegistration.ts:302` (`getPlaytimeFromRunner` returns a value only for gog), `bootstrap.ts:586` (drains `libraryManagerMap['gog'].syncQueuedPlaytime()`), and `gog/presence.ts`. Its help text says "currently only GOG is supported". → Move it to the GOG tab.
- No `data-tour` anchors exist on any moved setting (grep of `src/frontend/screens/Settings` for `data-tour` is empty). Tour unaffected.
- Platform gating to preserve: in AdvancedSettings the EOS block has no outer platform gate; only its Enable/Disable button and the `isEosOverlayEnabled` probe are `isWindows`-gated; `isLinux` gates only `ShowValveProton` (stays in Advanced). The moved row components gate themselves internally — render them unwrapped exactly as before.
- Frontend jest runs in `testEnvironment: 'node'` (no jsdom). Tests call components as plain functions with `react`/hooks mocked (see `NavShell/__tests__/SettingsPanel.test.tsx`, and `AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx`'s useState slot harness).
- i18n: new fork-owned keys go in `public/locales/en/gamelib.json` via `t('gamelib:…', 'English default')` (SettingsPanel already has `const { t: tGamelib } = useTranslation('gamelib')`). After adding a key, regenerate the presence baseline: `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. Brand names in `meta/i18nGlossary.json` (`Amazon`, `Epic`, `GOG`, `Steam`) may stay literal; `Humble` alone is NOT in the glossary (only `Humble Bundle`).
- i18n gate artifacts: `GeneralSettings/index.tsx`, `Settings/index.tsx`, `sections/index.tsx`, `App.tsx`, `SettingsPanel/index.tsx` are already in both `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json`. `AdvancedSettings/index.tsx` is in `DECLARED_UNSCANNED_DEBT` in `meta/__tests__/genI18nGateScope.test.ts` (~line 464) — its literal `<h3>EOS Overlay</h3>` moves with the block. The A-17 anti-rot test diffs the upstream base against committed `HEAD`, so new files only count once committed; precedent (quick 261029-sbi, see the dated comment blocks above `DECLARED_UNSCANNED_DEBT`) is to hand-insert paths in sorted position, leave `generatedAt` unchanged, and add a dated note.

<interfaces>
From src/frontend/screens/Settings/components/index.ts (barrel; names used here): DefaultSteamPath, EnableSteamNativeInstall, EnableSteamNativeDelete, SteamExperimentalInstallApp, EgsSettings, PlaytimeSync, NotifyHumbleExpirations, AltLegendaryBin, AltGOGdlBin, AltNileBin. DisableGOGPresence is a default import from '../../components/DisableGOGPresence'.

AdvancedSettings EOS dependencies (move with the block): useState/useEffect/useContext; ContextProvider → { libraryStatus, platform, showDialogModal }; GameStatus from 'common/types'; callOrDeclare from 'frontend/helpers/declaredUnavailable'; icons CachedOutlined, UploadOutlined, DownloadOutlined, DeleteOutline, CancelOutlined, SelectAllOutlined, DeselectOutlined from '@mui/icons-material'; constants EOS_FEATURE='EOS Overlay', EOS_DEFERRAL='D-03'; eosOverlayAppName='98bc04bc842e4906993fd6d6644ffb8d'; `const { t: tGamelib } = useTranslation('gamelib')`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract the EOS Overlay block into StoreSettings/EosOverlay.tsx and move its three guard tests</name>
  <files>src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx, src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx, src/frontend/screens/Settings/sections/StoreSettings/__tests__/EosActionConfirmationGuard.test.ts, src/frontend/screens/Settings/sections/StoreSettings/__tests__/EosDeclineCallSiteGuard.test.ts, src/frontend/screens/Settings/sections/StoreSettings/__tests__/removeEosOverlayConfirmation.test.tsx</files>
  <action>Create `StoreSettings/EosOverlay.tsx` exporting a default `EosOverlay` component. Move — verbatim, including every comment — from `AdvancedSettings/index.tsx`: the EOS_FEATURE/EOS_DEFERRAL constants and their comment, all seven `eosOverlay*` useState hooks in their existing order (installed, version, latestVersion, checkingForUpdates, installingOrUpdating, enabledGlobally, unavailable) and `eosOverlayAppName`, the four EOS useEffects, `getMainEosText`, `installEosOverlay`, `confirmInstallEosOverlay`, `removeEosOverlay`, `confirmRemoveEosOverlay`, `updateEosOverlay`, `confirmUpdateEosOverlay`, `cancelEosOverlayInstallOrUpdate`, `toggleEosOverlay`, `checkForEosOverlayUpdates`, and the JSX `<div className="advancedSetting"><h3>EOS Overlay</h3>…<hr /></div>` block exactly as written (keep the literal h3 text, the `isWindows` gate on Enable/Disable, the confirm-wrapper onClicks). EosOverlay reads `libraryStatus, platform, showDialogModal` from ContextProvider and derives `isWindows` itself. Behaviour must be byte-for-byte equivalent: same 11 `window.api.<eosChannel>` call sites, all via `callOrDeclare`.

In `AdvancedSettings/index.tsx` delete everything moved (and the preceding `<hr />` directly before the EOS block only if leaving it would produce a doubled rule — keep one `<hr />` between ShowValveProton and ExperimentalFeatures). Remove now-unused imports (EOS icons, GameStatus, callOrDeclare, tGamelib/ContextProvider fields no longer used; keep `isLinux`/`platform` for ShowValveProton and `ContentCopyOutlined`/isCopiedToClipboard). Do NOT yet remove AltLegendaryBin/AltGOGdlBin/AltNileBin/DisableGOGPresence here — Task 2 does that.

Move the three EOS tests with `git mv` from `AdvancedSettings/__tests__/` to `StoreSettings/__tests__/`; repoint each: `componentPath = join(__dirname, '..', 'EosOverlay.tsx')` in the two source-text guards (update their header prose that names `AdvancedSettings/index.tsx` to `StoreSettings/EosOverlay.tsx`; keep `EXPECTED_EOS_CALL_SITES = 11`). In `removeEosOverlayConfirmation.test.tsx`: import `EosOverlay from '../EosOverlay'`; drop the `../../../components` and `DisableGOGPresence` mocks (EosOverlay no longer imports them) and the SettingsContext mock if unused; useState slots shift by one because `isCopiedToClipboard` is gone — `EOS_OVERLAY_INSTALLED_SLOT = 0`, `EOS_OVERLAY_UNAVAILABLE_SLOT = 6`; fix the "5 useEffects" comment to 4. Also update the AdvancedSettings path mention in `GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts` header comments only if they name the moved test file path (comment-only edit; skip if not).</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Settings/sections/StoreSettings/__tests__ src/frontend/screens/Game/GameSubMenu/__tests__ src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts && test -z "$(ls src/frontend/screens/Settings/sections/AdvancedSettings/__tests__ 2>/dev/null)" && test "$(grep -v '^\s*//' src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx | grep -c 'eosOverlay')" = 0 && pnpm codecheck && npx prettier --check src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx src/frontend/screens/Settings/sections/StoreSettings/__tests__/EosActionConfirmationGuard.test.ts src/frontend/screens/Settings/sections/StoreSettings/__tests__/EosDeclineCallSiteGuard.test.ts src/frontend/screens/Settings/sections/StoreSettings/__tests__/removeEosOverlayConfirmation.test.tsx</automated>
  </verify>
  <done>EosOverlay.tsx holds the whole EOS block with 11 callOrDeclare-wrapped call sites; AdvancedSettings has no EOS code; the three moved guard tests pass against EosOverlay.tsx; codecheck clean. (EosOverlay is not rendered anywhere until Task 2 — commit Tasks 1 and 2 together or accept a transient gap between commits.)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: StoreSettings page with URL-driven tabs, move settings out of General/Advanced, wire route and type switch</name>
  <files>src/frontend/screens/Settings/sections/StoreSettings/index.tsx, src/frontend/screens/Settings/sections/StoreSettings/index.scss, src/frontend/screens/Settings/sections/StoreSettings/__tests__/StoreSettings.test.tsx, src/frontend/screens/Settings/sections/GeneralSettings/index.tsx, src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx, src/frontend/screens/Settings/sections/index.tsx, src/frontend/screens/Settings/index.tsx, src/frontend/App.tsx</files>
  <behavior>
    - store param absent or unknown (e.g. 'zoom') → Tabs value 'amazon'
    - store 'steam' → Tabs value 'steam'
    - Tab values/labels in order: amazon/Amazon, epic/Epic, gog/GOG, humble/Humble, steam/Steam
    - Tabs onChange(_, 'gog') → navigate('/settings/stores/gog', { replace: true })
    - Steam panel renders DefaultSteamPath, EnableSteamNativeInstall, EnableSteamNativeDelete, SteamExperimentalInstallApp in that order and no Advanced details
    - Epic panel: EgsSettings, then EosOverlay, then details containing AltLegendaryBin
    - GOG panel: PlaytimeSync, DisableGOGPresence, then details containing AltGOGdlBin
    - Amazon panel: details containing AltNileBin; Humble panel: NotifyHumbleExpirations, no details
  </behavior>
  <action>Create `StoreSettings/index.tsx` (default export `StoreSettings`). Export a `STORE_SETTINGS_TABS` const array `['amazon','epic','gog','humble','steam'] as const` (alphabetical per user decision). Derive the active tab with NO local state: `const { store } = useParams()`; value = store if it is in the array, else the first entry ('amazon') — default tab when no store given. `onChange` calls `navigate(\`/settings/stores/${next}\`, { replace: true })` so tab changes update the URL (deep-linkable) without stacking history entries. Render a `<h3 className="settingSubheader">` with `t('gamelib:settings.navbar.stores', 'Stores')` (key added in Task 3), then `<Tabs value onChange aria-label="store settings tabs" variant="scrollable">` with `<Tab label="Amazon" value="amazon" />` etc. (literal brand labels; Humble label "Humble"), then one `<TabPanel value index>` per store. Inside each panel, in this order (per user decision: library/install, then features, then collapsed Advanced): Amazon → advanced: AltNileBin. Epic → EgsSettings; EosOverlay; advanced: AltLegendaryBin. GOG → PlaytimeSync; DisableGOGPresence; advanced: AltGOGdlBin. Humble → NotifyHumbleExpirations. Steam → DefaultSteamPath; EnableSteamNativeInstall; EnableSteamNativeDelete; SteamExperimentalInstallApp. Advanced is a small local helper rendering `<details className="storeSettingsAdvanced"><summary>{t('settings.navbar.advanced', 'Advanced')}</summary>{children}</details>` (existing translated key; closed by default); omit it for stores with no advanced item. No account/login content in any tab. Create `StoreSettings/index.scss` with `.storeSettingsAdvanced` mirroring the `.engineOverride` rules and import it from index.tsx.

Remove from `GeneralSettings/index.tsx` (JSX and imports): DefaultSteamPath, EnableSteamNativeInstall, EnableSteamNativeDelete, SteamExperimentalInstallApp, EgsSettings, PlaytimeSync, NotifyHumbleExpirations — ShareDetectedFixes and everything else stay in place. Remove from `AdvancedSettings/index.tsx`: AltLegendaryBin, AltGOGdlBin, AltNileBin, DisableGOGPresence (JSX + imports); SteamGridDbApiKey, AllowInstallationBrokenAnticheat and the rest stay. Add `export { default as StoreSettings } from './StoreSettings'` to `sections/index.tsx`. In `Settings/index.tsx` add `const isStoreSettings = type === 'stores'` and `{isStoreSettings && <StoreSettings />}` after GeneralSettings. In `App.tsx` add the `settings/:type/:store` route directly after `settings/:type` (same lazy import).

Test first (`StoreSettings/__tests__/StoreSettings.test.tsx`, node env): mock `react-router-dom` (`useParams` returns a mutable `params`, `useNavigate` returns `navigateMock`), `react-i18next` (t returns default), `@mui/material` (`Tabs`/`Tab` as named stub functions), `frontend/components/UI` (`TabPanel` stub), `../../../components` (each moved row as a named stub), `../../../components/DisableGOGPresence`, `../EosOverlay`, and the scss import (check `src/frontend/jest.config.js` moduleNameMapper — scss is likely already mapped). Call `StoreSettings()` as a function, walk the element tree, and assert the behaviours above (find Tabs by type; read Tab children's `value`/`label`; for each TabPanel by `index`, list child element types in order; call Tabs' `onChange`).</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Settings && pnpm codecheck && npx prettier --check src/frontend/screens/Settings/sections/StoreSettings/index.tsx src/frontend/screens/Settings/sections/StoreSettings/index.scss src/frontend/screens/Settings/sections/StoreSettings/__tests__/StoreSettings.test.tsx src/frontend/screens/Settings/sections/GeneralSettings/index.tsx src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx src/frontend/screens/Settings/sections/index.tsx src/frontend/screens/Settings/index.tsx src/frontend/App.tsx</automated>
  </verify>
  <done>StoreSettings test green and covers tab order, default tab, URL-driven value, onChange navigation and per-tab contents; General/Advanced no longer render any moved component; `/settings/stores` and `/settings/stores/<store>` both route to Settings with type 'stores'; codecheck clean.</done>
</task>

<task type="auto">
  <name>Task 3: Stores nav row, nav tests, i18n key/baseline, i18n gate scope bookkeeping, graphify</name>
  <files>src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx, src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx, src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts</files>
  <action>SettingsPanel: add `<NavItem url="/settings/stores" icon={faShop} label={tGamelib('gamelib:settings.navbar.stores', 'Stores')} />` directly after the General row (first group, before Game Defaults). Icon `faShop` from `@fortawesome/free-solid-svg-icons` — every tier-2 row needs an icon (sketch-findings 007), and `faStore` is NOT allowed because it is the tier-1 Stores tab glyph (same-glyph-two-levels rule). Add one sentence to the docstring noting the Stores row (quick 261108-ioc). Update `SettingsPanel.test.tsx`: insert 'Stores' after 'General' in the settled-order list (rename "all twelve" → "all thirteen"), add `['Stores', faShop]` to the icon table (import faShop). Update `destinationCoverage.test.tsx`'s settled union: insert 'Stores' after 'General' (the tier-1 'Stores' tab label earlier in the list stays — the array legitimately contains it twice).

i18n: add `"stores": "Stores"` under `settings.navbar` in `public/locales/en/gamelib.json` in alphabetical position, matching the file's 4-space indent (create the `navbar` object under `settings` if absent — check where `gamelib:settings.navbar.run` lives first). Run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`; `git diff meta/i18nCatalogPresenceBaseline.json` must add only `settings.navbar.stores` per locale (plus totals/timestamp).

Gate scope: hand-insert `src/frontend/screens/Settings/sections/StoreSettings/index.tsx` and `src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx` in sorted position in `meta/i18nForkTouchedFiles.json` (leave `generatedAt`). Insert `StoreSettings/index.tsx` in sorted position in `meta/i18nGateScope.json` and append a "then quick 261108-ioc …" clause to its `generatedBy` string. Add `StoreSettings/EosOverlay.tsx` to `DECLARED_UNSCANNED_DEBT` next to `AdvancedSettings/index.tsx` (it inherits the literal `<h3>EOS Overlay</h3>` debt; behaviour-preserving move, not a fix), and add a dated `2026-11-08 (quick 261108-ioc)` note to the comment history above the array matching the precedent format (fork-touched N → N+2, scope M → M+1). Then run the hardcoded-string gate: if it flags the bare `"Humble"` Tab label in StoreSettings, add `"Humble"` to `meta/i18nGlossary.json` `terms` in sorted position (glossary test requires sorted, no duplicates) rather than translating a brand name; if it flags anything else in StoreSettings/index.tsx, fix it with t(). Note: the A-17 anti-rot test diffs upstream base against committed HEAD, so it can only pass once these files are committed — run `meta/__tests__/genI18nGateScope.test.ts` again after the commit.

Finally run `graphify update .` (per CLAUDE.md).</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/components/UI/NavShell meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/i18nGlossary.test.ts && pnpm lint-translations:gamelib && pnpm codecheck && npx prettier --file-info public/locales/en/gamelib.json && npx prettier --check src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx meta/i18nCatalogPresenceBaseline.json meta/i18nGateScope.json meta/i18nForkTouchedFiles.json meta/__tests__/genI18nGateScope.test.ts && graphify update . ; echo "post-commit: npx jest meta/__tests__/genI18nGateScope.test.ts"</automated>
  </verify>
  <done>Stores row renders after General with faShop and the gamelib key; NavShell suites green; presence baseline adds only the new key; hardcoded-string gate and glossary tests green; after commit genI18nGateScope.test.ts is green; graph updated. (Add meta/i18nGlossary.json to the prettier list only if edited and `--file-info` reports it not ignored.)</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| URL → StoreSettings | `:store` route param is user-controllable (deep link) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ioc-01 | Tampering | StoreSettings `:store` param | mitigate | Param is only compared against the fixed `STORE_SETTINGS_TABS` allowlist; unknown values fall back to 'amazon'; never interpolated into anything but a same-app navigate path built from the allowlisted value |
| T-ioc-02 | Elevation | EosOverlay install/update/remove | mitigate | Confirm-wrapper onClicks and callOrDeclare wrapping moved verbatim; EosActionConfirmationGuard and EosDeclineCallSiteGuard re-pointed at the new file keep enforcing both |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Settings src/frontend/components/UI/NavShell meta/__tests__` green (genI18nGateScope after commit)
- `pnpm codecheck` clean; `pnpm lint-translations:gamelib` 0 hard failures
- Optional live check (not required): restart `pnpm tauri:dev`, open Settings → Stores, click each tab, confirm URL changes and the Epic tab's EOS block matches its old Advanced rendering
</verification>

<success_criteria>
Settings has a Stores page with five alphabetical, deep-linkable store tabs; every listed setting moved, nothing else moved; EOS behaviour unchanged; all gates green.
</success_criteria>

<output>
Create `.planning/quick/261108-ioc-consolidate-store-specific-settings-into/261108-ioc-SUMMARY.md` when done. State in it: PlaytimeSync was verified GOG-only and moved; both `/settings/advanced` deep links were left (they target SteamGridDbApiKey, which stayed); whether "Humble" was added to the glossary.
</output>
