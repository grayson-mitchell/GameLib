---
phase: quick-260930-lyk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/trayIconVariant.ts
  - src/common/__tests__/trayIconVariant.test.ts
  - meta/fixtures/tray-set-icon-wire-args.json
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - src/common/types/sidecarTransport.ts
  - src-tauri/src/main.rs
  - src/common/types.ts
  - src/backend/config.ts
  - src/backend/__mocks__/config.ts
  - src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx
  - public/locales/en/translation.json
  - src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - meta/trayIconVariants.ts
  - src/backend/__tests__/trayIconAssets.test.ts
  - .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md
autonomous: true
requirements: [QUICK-260930-lyk]

estimate:
  tokens: 160000
  raw_tokens: 160000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "An existing config with `darkTrayIcon: true` loads as Dark, `darkTrayIcon: false` loads as Light, and a config with neither key loads as Auto; an explicit `trayIconVariant` always wins over the legacy boolean"
    - "Polarity is preserved exactly: Dark = the BLACK glyph (TRAY_ICON_DARK, for a light taskbar) = the legacy `true`; Light = the WHITE glyph (TRAY_ICON_LIGHT, for a dark taskbar) = the legacy `false`"
    - "On Windows, Auto resolves from `SystemUsesLightTheme` under HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize: 1 -> black glyph, 0 -> white glyph, unreadable -> white glyph; the app theme is never consulted"
    - "On Windows, Auto re-reads the registry whenever that Personalize key changes, so a TASKBAR-only theme change updates the glyph with no restart (live verification pending, not claimed)"
    - "Settings shows a three-option selector (Auto / Light / Dark) on Windows, a two-option selector (Light / Dark, no Auto) on Linux, and nothing on macOS (D-05); a selection applies immediately through the existing changeTrayColor path"
    - "No tray setting text claims a restart, and every t() fallback in UseDarkTrayIcon.tsx equals its shipped en/translation.json string"
    - "The sidecar and the Rust `tray_set_icon` arm are pinned to ONE shared wire fixture, so neither side can change the payload shape without breaking the other's tests"
    - "The todo stays in .planning/todos/pending/ with `ready: live-gate`, is not marked resolved, and carries a note pointing at this quick task"
  artifacts:
    - path: "src/common/trayIconVariant.ts"
      provides: "TrayIconVariant type, TRAY_ICON_VARIANTS, isTrayIconVariant, migrateTrayIconVariant, trayIconVariantOptions, displayedTrayIconVariant, trayIconWireArgs, TRAY_ICON_AUTO_FALLBACK"
      exports: ["TrayIconVariant", "TRAY_ICON_VARIANTS", "TRAY_ICON_AUTO_FALLBACK", "isTrayIconVariant", "migrateTrayIconVariant", "trayIconVariantOptions", "displayedTrayIconVariant", "trayIconWireArgs"]
    - path: "meta/fixtures/tray-set-icon-wire-args.json"
      provides: "Canonical tray_set_icon payloads, asserted by the Common jest suite (emit side) and main.rs mod tests (accept side)"
      contains: "tray_set_icon"
    - path: "src-tauri/src/main.rs"
      provides: "TrayIconMode, parse_tray_icon_mode, tray_set_icon_mode_from_args, tray_glyph_dark_for_system_uses_light_theme, resolve_tray_icon_dark, read_system_uses_light_theme, the TRAY_ICON_MODE store, spawn_taskbar_theme_watcher, and tray_variant_* cargo tests"
      contains: "SystemUsesLightTheme"
    - path: "src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx"
      provides: "SelectField-based tray icon selector driven by trayIconVariantOptions(platform)"
      contains: "useSetting('trayIconVariant'"
    - path: "src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts"
      provides: "Source-text gates: fallback/catalogue parity, no restart claim, config.ts migration wiring"
  key_links:
    - from: "src/backend/config.ts GlobalConfigV0.getSettings()"
      to: "src/common/trayIconVariant.ts migrateTrayIconVariant"
      via: "called on the RAW on-disk `defaultSettings` object, assigned AFTER the factory-default spread, so the factory default 'auto' can never mask a legacy boolean"
      pattern: "trayIconVariant: migrateTrayIconVariant\\(defaultSettings\\)"
    - from: "src/backend/sidecar/appShellFlowRegistration.ts syncTrayIcon()"
      to: "src-tauri/src/main.rs dispatch_rust_channel \"tray_set_icon\" arm"
      via: "requestRustInvoke(RUST_TRAY_SET_ICON, trayIconWireArgs(variant)) -> tray_set_icon_mode_from_args(&args); both ends pinned to meta/fixtures/tray-set-icon-wire-args.json"
      pattern: "trayIconWireArgs"
    - from: "src-tauri/src/main.rs spawn_taskbar_theme_watcher (Windows)"
      to: "read_system_uses_light_theme + the tray's set_icon_with_as_template"
      via: "RegNotifyChangeKeyValue on the Personalize key as a TRIGGER only; the glyph is always recomputed from a fresh SystemUsesLightTheme read"
      pattern: "RegNotifyChangeKeyValue"
---

<objective>
Close the design question in `.planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md`
the way the operator chose: replace the boolean `darkTrayIcon` with a tri-state tray glyph setting
(Auto / Light / Dark, Auto the default), make Windows Auto follow the TASKBAR theme
(`SystemUsesLightTheme`), keep macOS on its AppKit template with the setting hidden (D-05), and give
Linux only the choices it can honour. The live Windows check stays outstanding and is recorded as a
pending UAT item, not a pass.

Purpose: the todo's own mechanism shows the trap. Wiring the glyph to the app theme looks right for
default users and misfires precisely for users who customised their taskbar. The artwork is already
sound (`38-W02` PASS); the only open question is who picks the variant.

Output: a shared pure module plus a wire fixture, the migrated setting, a selector UI, a Rust
resolver with a registry read and a registry-change watcher, cargo and jest coverage, and a todo note.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md

## Decisions recorded by the planner (read these before touching code)

**DEC-1: the new key and its values.** A NEW key `trayIconVariant: 'auto' | 'light' | 'dark'`
replaces `darkTrayIcon` in `AppSettings`. A new key rather than re-typing the old one, because a key
named "dark" holding 'light' reads wrong forever, and a new key makes the migration a clean
precedence rule. Values name the GLYPH, matching the existing asset and legacy-setting polarity:
`dark` = the black glyph (`TRAY_ICON_DARK`, for a light taskbar) = legacy `true`; `light` = the
white glyph (`TRAY_ICON_LIGHT`, for a dark taskbar) = legacy `false`. The UI labels spell out the
taskbar each glyph is for, because "Dark" alone is ambiguous between glyph and taskbar.

**DEC-2: where the migration lives.** No migration framework exists: `GlobalConfigV0.upgrade()` is a
no-op at `v0`. The existing pattern is the inline backwards-compat fix-up inside
`GlobalConfigV0.getSettings()` in `src/backend/config.ts` (the `defaultWinePrefixDir` from
`defaultWinePrefix` line). The mapping itself is a pure function (`migrateTrayIconVariant`) in
`src/common/trayIconVariant.ts` so it can be unit-tested. **Ordering trap:** `getSettings()` builds
`{ ...this.getFactoryDefaults(), ...defaultSettings, winePrefix }`. Once the factory defaults carry
`trayIconVariant: 'auto'`, running the migration on the MERGED object would return that 'auto' and
silently discard a legacy `darkTrayIcon: true`. The migration must therefore read the RAW on-disk
`defaultSettings` object and be assigned as the last property of the merged literal. The legacy key
is left on disk untouched: it is inert, because an explicit `trayIconVariant` always wins, the first
flush of any setting persists the migrated value, and leaving it keeps a downgrade harmless.

**DEC-3: Windows Auto reads the registry directly, and the trigger is `RegNotifyChangeKeyValue`, not
tao's ThemeChanged.** Measured by the planner in the installed crate, tao 0.35.3
`src/platform_impl/windows/event_loop.rs:2269-2291` (`update_theme`, called from the
`WM_SETTINGCHANGE` arm at `:2120`): it recomputes the window's theme from the APP-theme registry
value and emits `WindowEvent::ThemeChanged` ONLY when that value differs from the stored one, and it
returns early with no event at all when a preferred theme is set. A taskbar-only change (Colors set
to "Custom" and only the Windows mode flipped) therefore never fires ThemeChanged. That is exactly the
scenario this task exists for. So ThemeChanged would reproduce the field misfire the todo warns
about, this time on the trigger instead of on the value. The operator's requirement allows
ThemeChanged as a trigger but does not require it. This plan uses `RegNotifyChangeKeyValue` on the
same `...\Themes\Personalize` key that holds `SystemUsesLightTheme`. That call fires on any value
change under the key, including the taskbar-only one, and the glyph is always recomputed from a fresh
`SystemUsesLightTheme` read. Both calls, `RegGetValueW` for the read and `RegNotifyChangeKeyValue`
for the watch, are declared in the vendored `windows-sys-0.60.2` under the
`Win32_System_Registry` feature that `src-tauri/Cargo.toml` ALREADY enables (quick-260925-uok's
HKCU self-heal). The planner confirmed `RegGetValueW` at `Registry/mod.rs:45`,
`RegNotifyChangeKeyValue` at `:52`, `RRF_RT_REG_DWORD` at `:1082`, `KEY_NOTIFY` at `:167` and
`REG_NOTIFY_CHANGE_LAST_SET` at `:1032`. So there is no Cargo.toml change, no new crate and no new
feature.

**DEC-4: Linux (D-05).** Linux has no reliable panel-colour signal (the todo's Mechanism: tray hosts
vary, and the XDG portal `color-scheme` is an app hint, not the panel colour). Linux is therefore
offered only Light and Dark, with no Auto. But the migration maps an ABSENT legacy value to Auto on
every platform, so every Linux user who never touched the toggle will carry Auto. That is the common
case, not an edge. Auto on Linux therefore resolves to the WHITE glyph (Light), which is the tray's
historical startup default, so those users see no change. The selector DISPLAYS a stored Auto as
"Light icon", which is what the tray actually shows. Picking either option writes an explicit value.
The migration stays platform-independent, and Auto is kept rather than rewritten to 'light', so a
config that later moves to Windows gains real Auto. The same white-glyph fallback is what Windows
Auto uses when the registry read fails (the Windows 11 default dark taskbar). One constant,
`TRAY_ICON_AUTO_FALLBACK = 'light'`, names it on the TS side, and `resolve_tray_icon_dark` mirrors it
in Rust.

**DEC-5: l10n catalogue, operator-directed.** The operator asked for the new keys in
`public/locales/en/translation.json`. That is in tension with Phase 34.8's D-06 split (fork
content in `gamelib.json`), which `meta/i18nCatalogChurnGuard.ts` backstops. It is followed anyway,
for three reasons. It is the explicit instruction. There is precedent: Phase 34.12's tour keys and
260901-ud5 both added fork keys to `translation.json`. And the gamelib route requires filling all 48
non-en locales (gamelibCatalogParity plus the lint-translations:gamelib presence baseline), which is
outside this task. Two consequences for the executor. First, `meta/__tests__/i18nCatalogChurnGuard.test.ts`'s
"live tree" test reads the UNCOMMITTED `git diff -- public/locales` and goes red while the
`translation.json` edit is unstaged or uncommitted. That is by design, and it is green once Task 2
commits, so Task 3 runs it after that commit. Second, the pre-push gate `pnpm i18n --fail-on-update`
is the real check that the hand-added entries are exactly what the parser would produce (measured at
HEAD on 2026-09-30: exit 0, no diff). Key names follow the neighbouring tray keys' kebab style:
`setting.tray-icon-variant.{label,auto,light,dark}`.

**DEC-6: the stale fallback.** The line-49 ToggleSwitch and its `'Use Dark Tray Icon (needs restart)'`
fallback are REPLACED by the selector, so the false restart claim leaves with it. The now-unreferenced
`setting.darktray` catalogue entry stays, because `keepRemoved: true` in
`i18next-parser.config.js` means no churn. A gate proves the component carries no restart claim and
that every fallback it passes equals its shipped catalogue string, which is the durable form of
"the fallback must match the shipped string".

**DEC-7: `meta/trayIconVariants.ts` needs NO functional change.** Auto, Light and Dark all select
between the same two generated rasters (and the macOS template), so the generator's inputs, outputs
and its byte-identical-pair gate are unchanged. Only two present-tense doc references and one
thrown error-message string name the retired key, and Task 3 refreshes those. Line 9's reference is
history and is left alone. Proof of no functional change: the committed `public/icon-tray-*.png`
files carry zero diff, and `trayIconAssets.test.ts` stays green.

## Facts the executor needs (measured by the planner; do not re-derive)

- Every `darkTrayIcon` reader and writer: `src/common/types.ts:128` (type);
  `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx:12-17,47-49` (UI);
  `src/backend/sidecar/appShellFlowRegistration.ts:236-240` (`syncTrayIcon`) plus comments at
  `:72-77,230-233,612,620-623`; `src/backend/__mocks__/config.ts:5`;
  `src/backend/sidecar/__tests__/appShellFlows.test.ts:1506-1612` (payload assertions);
  `src-tauri/src/main.rs:6537-6559` (`tray_set_icon` arm reads `"dark"`) plus comments at
  `:89-111,6532-6536`; `src/common/types/sidecarTransport.ts:254-262` (doc); comments only in
  `meta/trayIconVariants.ts:445-452,578-583` and `src/backend/__tests__/trayIconAssets.test.ts:27,103`.
- `src/backend/__tests__/tauriShellSource.test.ts` pins, in comment-stripped main.rs, the literal
  `fn tray_image(dark: bool)`, the arm-body text
  `set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())`, exactly one
  `"tray_set_icon" =>` arm, and a census of dispatch arms. KEEP `tray_image`'s signature and that
  exact arm call text, and add NO dispatch arm. These gates must stay green without edits.
- `meta/fixtures/store-embed-wire-args.json` is the precedent for a TS<->Rust wire fixture: a
  `_comment` string array followed by one key per arm. `main.rs` `mod tests` loads it with
  `include_str!("../../meta/fixtures/...")`. Mirror that. Do NOT import the new fixture from any
  `src/backend/sidecar/__tests__/*` file: `testContainment.test.ts` polices those suites' imports.
  The emit side is asserted from the Common project instead.
- The frontend jest project has NO jsdom, so components cannot be rendered. Follow the source-text
  idiom in `src/frontend/screens/Settings/components/__tests__/framelessWindowCopy.test.ts`
  (`stripSourceComments` from `backend/testUtils/stripSourceComments`).
- The select-setting pattern to match is `src/frontend/screens/Settings/components/LibraryTopSection.tsx`
  (`SelectField` + MUI `MenuItem` + `SelectChangeEvent` + `useSetting`).
- Jest projects: `src/common/__tests__/*.test.ts` runs under the `Common` project;
  `src/backend/**/__tests__` under `Backend`; the frontend path under `Frontend`. `npx jest <path>`
  from the repo root selects the right one.
- Cargo: `build/renderer/index.html` exists, which `generate_context!` needs. `main.rs` is NOT
  rustfmt-clean at HEAD (`cargo fmt --check` exits 1), so do not add a rustfmt gate: it would drag
  in repo debt. Hand-match the surrounding style. `npx prettier --file-info src-tauri/src/main.rs`
  reports `"inferredParser": null`, so prettier cannot check `.rs` files. Do not pass main.rs to
  prettier.
- Prettier visibility, measured with `--file-info`: every `src/**/*.ts(x)`, `meta/**/*.ts` and
  `meta/fixtures/*.json` path in this plan is NOT ignored (real check).
  `public/locales/en/translation.json` and `.planning/**` ARE ignored, so a check there would be
  vacuous and is omitted by design. `translation.json` is 4-space indented and key-sorted by the
  i18next parser; hand-match it.
- `pnpm planning-gates` currently reports 11/12 on this Windows machine because of a pre-existing
  `planning-frontmatter-gate.py` failure unrelated to todos. Run the todo gate directly:
  `PYTHONIOENCODING=utf-8 python .planning/todos/todo-frontmatter-gate.py` (measured exit 0, 18 todos).
- Sidecar exit contract (CLAUDE.md): this plan adds NO Node timer, watcher or boot-time request.
  `syncTrayIcon` keeps using the existing `trayColorTimer` and the existing guarded one-shot initial
  sync. The only new long-lived handle is a Rust shell thread, which process exit tears down.
- Fake-HOME rule (CLAUDE.md): this plan runs no compiled sidecar or SEA binary. `cargo test` reads
  the real HKCU registry READ-ONLY in one explicitly `#[ignore]`d test. That is a deliberate
  real-profile measurement, because the point is to prove the FFI read against this machine's actual
  value. It writes nothing.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): one tri-state value flows config -> sidecar -> Rust arm -> glyph, pinned by a shared wire fixture</name>
  <files>src/common/trayIconVariant.ts, src/common/__tests__/trayIconVariant.test.ts, meta/fixtures/tray-set-icon-wire-args.json, src/backend/sidecar/appShellFlowRegistration.ts, src/backend/sidecar/__tests__/appShellFlows.test.ts, src/common/types/sidecarTransport.ts, src-tauri/src/main.rs</files>
  <read_first>
    - src/backend/sidecar/appShellFlowRegistration.ts (lines 60-80, 225-245, 600-660)
    - src/backend/sidecar/__tests__/appShellFlows.test.ts (lines 300-315, 1460-1615)
    - src-tauri/src/main.rs (lines 75-165 tray constants and tray_image; 6530-6560 the tray_set_icon arm; 9590-9610 the windows-sys Registry import and local `wide` helper to mirror; 11680-11690 the TrayIconBuilder `.icon(tray_image(false))` call; 12055-12080 mod tests header and the STORE_EMBED_WIRE_FIXTURE include_str precedent)
    - meta/fixtures/store-embed-wire-args.json (shape and `_comment` convention only)
    - src/common/types/sidecarTransport.ts (lines 250-262)
  </read_first>
  <action>
This task delivers the whole data path. The type swap in `AppSettings` and the UI come in Task 2. Until then, the migration reads the legacy boolean the current toggle still writes, so the tray keeps working at every commit.

**A. New pure module `src/common/trayIconVariant.ts`.** It must be self-contained and import nothing from `common/types`, so Task 2 can import the type into `types.ts` without a cycle. Export these, each with a short doc comment:
- `type TrayIconVariant = 'auto' | 'light' | 'dark'`.
- `TRAY_ICON_VARIANTS: readonly TrayIconVariant[]`, ordered `['auto', 'light', 'dark']`.
- `TRAY_ICON_AUTO_FALLBACK: TrayIconVariant = 'light'`. Doc it per DEC-4: this is what Auto resolves to where no taskbar signal exists (always on Linux; on Windows when the `SystemUsesLightTheme` read fails). It is the white glyph for a dark taskbar, which is the Windows 11 default and the tray's historical startup variant. `resolve_tray_icon_dark` in main.rs mirrors it.
- `isTrayIconVariant(value: unknown): value is TrayIconVariant`. Exact lowercase match only.
- `migrateTrayIconVariant(stored: { trayIconVariant?: unknown; darkTrayIcon?: unknown } | null | undefined): TrayIconVariant`, per DEC-1/DEC-2, rules in this order:
  1. A valid `trayIconVariant` wins.
  2. Otherwise `darkTrayIcon === true` gives 'dark', and `darkTrayIcon === false` gives 'light'. The comparison is strict: a string 'true' or the number 1 is NOT a boolean.
  3. Otherwise the result is 'auto'. This covers an absent legacy value, an invalid new value with no legacy value, and null/undefined input.
  The doc comment must state the DEC-2 ordering trap: the caller must pass the RAW stored object, never a factory-default-merged one.
- `trayIconVariantOptions(platform: string): readonly TrayIconVariant[]`. 'darwin' gives `[]` (the D-05 hide). 'win32' gives `['auto', 'light', 'dark']`. Any other platform gives `['light', 'dark']` (DEC-4: Auto is not offered where it cannot be honoured).
- `displayedTrayIconVariant(stored: TrayIconVariant, platform: string): TrayIconVariant`. If `stored` is among that platform's options, return it. If `stored` is 'auto' and Auto is not offered, return `TRAY_ICON_AUTO_FALLBACK`. Otherwise return `stored`.
- `trayIconWireArgs(variant: TrayIconVariant): [{ variant: TrayIconVariant }]`. This is the ONE place the `tray_set_icon` payload shape is built.

**B. Wire fixture `meta/fixtures/tray-set-icon-wire-args.json`.** Mirror the store-embed fixture: a `_comment` string array saying this is the single shared artifact for the `tray_set_icon` arm. Name the TS side as `src/common/__tests__/trayIconVariant.test.ts` and the Rust side as `main.rs mod tests (tray_variant_wire_contract_*)`, and record that the payload changed on 2026-09-30 from `{ dark: boolean }` to `{ variant }`. Then one key, `tray_set_icon`, mapping each of `auto`/`light`/`dark` to its args array, for example `"dark": [{ "variant": "dark" }]`.

**C. Common test `src/common/__tests__/trayIconVariant.test.ts`.** Import with the relative path `../trayIconVariant`. Cover:
- Migration mapping (requirement 8): `{ darkTrayIcon: true }` gives 'dark'; `{ darkTrayIcon: false }` gives 'light'; `{}`, `null` and `undefined` give 'auto'.
- Precedence: `{ trayIconVariant: 'light', darkTrayIcon: true }` gives 'light', and `{ trayIconVariant: 'auto', darkTrayIcon: true }` gives 'auto'.
- Invalid new value falls through to legacy: `{ trayIconVariant: 'purple', darkTrayIcon: true }` gives 'dark'. Invalid new value alone gives 'auto'.
- Non-boolean legacy values `'true'` and `1` give 'auto'.
- One case titled as the DEC-2 trap documentation: a spread of `{ trayIconVariant: 'auto' }` then `{ darkTrayIcon: true }` returns 'auto'. This shows why config.ts must pass the raw object.
- `isTrayIconVariant` rejects 'Auto', '', true and undefined.
- `trayIconVariantOptions` for win32, linux and darwin.
- `displayedTrayIconVariant`: ('auto', 'linux') gives 'light'; ('dark', 'linux') gives 'dark'; ('auto', 'win32') gives 'auto'.
- The wire contract: read the fixture with `readFileSync` + `JSON.parse` (path from `__dirname` up to the repo root, then `meta/fixtures/tray-set-icon-wire-args.json`). For every variant in `TRAY_ICON_VARIANTS`, `trayIconWireArgs(v)` must `toEqual` the fixture entry, and the fixture's variant keys must equal `TRAY_ICON_VARIANTS` exactly. That makes it non-vacuous in both directions.

**D. Sidecar `src/backend/sidecar/appShellFlowRegistration.ts`.**
- In `syncTrayIcon()`, replace the `darkTrayIcon` destructure and the `{ dark: Boolean(...) }` payload with `requestRustInvoke(RUST_TRAY_SET_ICON, trayIconWireArgs(migrateTrayIconVariant(GlobalConfig.get().getSettings())))`. Import from `'../../common/trayIconVariant'`, relative, matching this file's import style. Keep the existing try/catch and `.catch(logSendFailure...)` exactly.
- Passing the whole settings object is deliberate. It is correct both now, while the toggle still writes the legacy boolean, and after Task 2, when `trayIconVariant` exists. The `AppSettings` type is assignable to the loose parameter.
- Add no timer and no handle (sidecar exit contract).
- Update the comments that describe this path at `:72-77`, `:230-233`, `:612` and `:620-623` so they name `trayIconVariant` and `{ variant }`. The `:622` comment's claim that main.rs `.setup()` always starts with `tray_image(false)` becomes false in step F. Rewrite it to say the startup image is the resolved Auto variant and this sync corrects it to the user's stored mode.

**E. Sidecar test `src/backend/sidecar/__tests__/appShellFlows.test.ts`, lines ~1506-1612.** Update the payload assertions and titles:
- `mockAppSettings({ trayIconVariant: 'dark' })` expects `[{ variant: 'dark' }]`. Keep the 499ms/1ms timing structure.
- The 'light' case expects `[{ variant: 'light' }]`.
- `mockAppSettings({})` expects `[{ variant: 'auto' }]`. Title it as absent-to-Auto.
- ADD two legacy cases: `{ darkTrayIcon: true }` expects `[{ variant: 'dark' }]`, and `{ darkTrayIcon: false }` expects `[{ variant: 'light' }]`. `mockAppSettings` takes `Record<string, unknown>`, so no cast is needed.
- In the rejected-invoke and debounce cases, switch the mocked settings to `trayIconVariant: 'dark'`. In the isolated initial-sync case, mock `getSettings: () => ({ trayIconVariant: 'light' })` and expect `[{ variant: 'light' }]`.
- Keep the REQ-34.1-07 prefix on every title. Do not import the fixture here (see context).

**F. Rust `src-tauri/src/main.rs`.** Put the new items directly after `tray_image` (~line 163).

Items to add:
- `#[derive(Clone, Copy, Debug, PartialEq, Eq)] enum TrayIconMode { Auto, Light, Dark }`.
- `fn parse_tray_icon_mode(value: Option<&str>) -> TrayIconMode`. Exact "auto"/"light"/"dark". Anything else, including None and "Dark", gives `Auto`, the documented default.
- `fn tray_set_icon_mode_from_args(args: &[Value]) -> TrayIconMode`. Reads `args.first()` -> `.get("variant")` -> `.as_str()` and feeds `parse_tray_icon_mode`.
- `fn tray_glyph_dark_for_system_uses_light_theme(system_uses_light_theme: Option<u32>) -> bool`. `Some(0)` gives false (dark taskbar, white glyph). `Some(_)` gives true (light taskbar, black glyph). `None` gives false (the DEC-4 fallback).
- `fn resolve_tray_icon_dark(mode: TrayIconMode, system_uses_light_theme: Option<u32>) -> bool`. Light gives false and Dark gives true, both ignoring the registry argument. Auto delegates to the previous function.
- A process-wide `static TRAY_ICON_MODE: AtomicU8`, initialised to Auto. Add `AtomicU8` to the existing `use std::sync::atomic::{AtomicU64, Ordering}` import. Add small `store_tray_icon_mode` and `current_tray_icon_mode` accessors with a `u8` round-trip, where any unknown byte reads as Auto.
- `#[cfg(windows)] fn read_system_uses_light_theme() -> Option<u32>`:
  - Use `windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD}` and `windows_sys::Win32::Foundation::ERROR_SUCCESS`.
  - Define `#[cfg(windows)]` consts for the subkey `r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"` and the value name `SystemUsesLightTheme`, plus a local NUL-terminated UTF-16 `wide` helper mirroring the one inside `repair_windows_gamelib_protocol_registration`. That helper is nested and cannot be reused.
  - Call with `RRF_RT_REG_DWORD`, which rejects any non-DWORD type, a null type pointer, a `u32` data buffer and `cb = 4`. Return `Some(data)` only on `ERROR_SUCCESS` with `cb == 4`, otherwise None.
  - Write a SAFETY comment in this file's style.
  - No logging inside the function.
- `#[cfg(not(windows))] fn read_system_uses_light_theme() -> Option<u32>` returning `None`. This makes Linux Auto resolve to white (DEC-4). macOS never reaches the colour choice because `tray_image` returns the template.

Wire the new items in:
- In the `"tray_set_icon"` arm, replace the `"dark"` bool parse:
  1. `let mode = tray_set_icon_mode_from_args(&args);` (adapt to however `args` is typed at that arm).
  2. `store_tray_icon_mode(mode);`
  3. Read the registry only for Auto: `let system_uses_light_theme = if mode == TrayIconMode::Auto { read_system_uses_light_theme() } else { None };`
  4. `let dark = resolve_tray_icon_dark(mode, system_uses_light_theme);`
  5. When mode is Auto and the read returned None, log exactly one line (`[shell] tray_set_icon: SystemUsesLightTheme unreadable -- Auto falling back to the light glyph`). When a `variant` string was present but unrecognised, log one WARN carrying only its byte length, not the value.
  6. Leave the existing `match app.tray_by_id(...)` and the literal call `tray.set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())` byte-identical, because tauriShellSource.test.ts pins that text.
- At the TrayIconBuilder (~11685), replace `.icon(tray_image(false))` with the image for the current mode, resolved the same way (Auto at startup). On Linux that is still the white glyph, so behaviour there is unchanged. On Windows it is correct before the sidecar's first sync arrives.
- Refresh the comments that now lie: the block at `:89-103` (macOS "`darkTrayIcon` becomes VESTIGIAL" should name the tri-state setting instead), the `TRAY_ICON_DARK`/`TRAY_ICON_LIGHT` doc lines at `:104-111`, and the arm comment at `:6532-6536` (`{ variant }` now, still the only arm). In the new items' doc comment, state DEC-3 briefly: the TASKBAR value is read, never the app-theme value and never the window theme.

Add to `mod tests` (~12055). Every name starts with `tray_variant_`:
- Parse cases, including 'Dark' and None giving Auto.
- The mapping: `Some(0)` gives false, `Some(1)` gives true, `None` gives false.
- Resolve: Light with `Some(1)` gives false; Dark with `Some(0)` and with `None` gives true; Auto follows the registry value; Auto with `None` gives false.
- `tray_variant_wire_contract_*`: `include_str!("../../meta/fixtures/tray-set-icon-wire-args.json")`. For each fixture variant key, `tray_set_icon_mode_from_args` on its array must equal `parse_tray_icon_mode(Some(key))`, and there must be exactly 3 keys. Plus a regression lock asserting the retired shape `[{"dark": true}]` gives Auto, NOT Dark, which pins that the contract changed.
- ONE `#[cfg(windows)] #[ignore]` test `tray_variant_system_uses_light_theme_read_matches_reg_exe`. It spawns `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" /v SystemUsesLightTheme` via `std::process::Command`, parses the `REG_DWORD` hex (`0x0`/`0x1`), and asserts `read_system_uses_light_theme()` returns the same `Some(value)`. When reg.exe reports the value absent, it asserts None instead. This is the only proof the FFI flags and buffer are right. A wrong flag would silently return None forever and look like a working feature on a default dark taskbar. It is `#[ignore]` because a CI runner's profile may lack the key. The executor runs it explicitly on this Windows machine.

**G. `src/common/types/sidecarTransport.ts`.** Update `RUST_TRAY_SET_ICON`'s doc: it takes a single `{ variant: 'auto' | 'light' | 'dark' }` object built by `trayIconWireArgs`, read from `trayIconVariant` (migrated from the legacy `darkTrayIcon`), and it is pinned by `meta/fixtures/tray-set-icon-wire-args.json`. It is still the one arm.

Do not touch `src-tauri/Cargo.toml`, `Cargo.lock`, `package.json` or `pnpm-lock.yaml`.
  </action>
  <verify>
    <automated>npx jest src/common/__tests__/trayIconVariant.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/__tests__/tauriShellSource.test.ts</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell tray_variant_</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell tray_variant_system_uses_light_theme_read_matches_reg_exe -- --ignored</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/common/trayIconVariant.ts src/common/__tests__/trayIconVariant.test.ts meta/fixtures/tray-set-icon-wire-args.json src/backend/sidecar/appShellFlowRegistration.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/common/types/sidecarTransport.ts</automated>
    <automated>git diff --quiet -- src-tauri/Cargo.toml src-tauri/Cargo.lock package.json pnpm-lock.yaml</automated>
  </verify>
  <done>
The Common suite passes, including the true/false/absent mapping, precedence, the DEC-2 trap case and the fixture contract. appShellFlows passes with `{ variant }` payloads, including both legacy cases. tauriShellSource passes unchanged. The `tray_variant_` cargo tests pass, and the ignored reg.exe comparison passes on this machine; record the measured `SystemUsesLightTheme` value in the SUMMARY. codecheck is clean, prettier is a real pass on all six TS/JSON paths, and there is no dependency diff. main.rs is not prettier-checkable (null parser); that is recorded rather than faked.
  </done>
</task>

<task type="auto">
  <name>Task 2: the user-facing tri-state setting with migrated config, selector UI, catalogue and parity gate</name>
  <files>src/common/types.ts, src/backend/config.ts, src/backend/__mocks__/config.ts, src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx, public/locales/en/translation.json, src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts</files>
  <read_first>
    - src/backend/config.ts (lines 283-400: getSettings and getFactoryDefaults)
    - src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx (whole file)
    - src/frontend/screens/Settings/components/LibraryTopSection.tsx (the SelectField pattern)
    - src/frontend/screens/Settings/components/__tests__/framelessWindowCopy.test.ts (the source-text gate idiom and catalogue path resolution)
    - public/locales/en/translation.json (the "setting" object starting at line 797; the `darktray`, `exit-to-tray`, `no-tray-icon` neighbours)
  </read_first>
  <action>
<!-- planner-discipline-allow: darkTrayIcon -->
<!-- planner-discipline-allow: restart -->

**A. Types, DEC-1.** In `src/common/types.ts`, add `import type { TrayIconVariant } from './trayIconVariant'`. Replace `darkTrayIcon: boolean` in `AppSettings` with `trayIconVariant: TrayIconVariant`, in the same alphabetical neighbourhood. Then run `pnpm codecheck` and fix every error it reports. The planner's census (context) predicts only the component and the mock.

**B. Config, DEC-2.** In `src/backend/config.ts`:
- Import `migrateTrayIconVariant` from `'common/trayIconVariant'`.
- Add `trayIconVariant: 'auto'` to `getFactoryDefaults()`.
- In `getSettings()`, add `trayIconVariant: migrateTrayIconVariant(defaultSettings)` as the LAST property of the merged object literal, after `...this.getFactoryDefaults()`, `...defaultSettings` and `winePrefix`. Here `defaultSettings` is the raw parsed `settings.defaultSettings` from disk.
- Beside it, add a comment that explains the ordering trap and cites the existing `defaultWinePrefixDir` fix-up as the pattern followed.
- Do not delete the legacy key from disk (DEC-2).
- The no-config-file branch returns factory defaults, which is 'auto'. That is correct for a fresh install.

**C. Mock.** In `src/backend/__mocks__/config.ts`, replace `darkTrayIcon: false` with `trayIconVariant: 'light'`, the exact migrated equivalent of `false`, so any consumer's behaviour is unchanged.

**D. Selector.** Rewrite `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx`. Keep the filename and the `UseDarkTrayIcon` default export, because `meta/i18nForkTouchedFiles.json` and `meta/__tests__/genI18nGateScope.test.ts` pin that path. Match `LibraryTopSection.tsx`:
- `const [trayIconVariant, setTrayIconVariant] = useSetting('trayIconVariant', 'auto')`.
- `const options = trayIconVariantOptions(platform)`. When `options.length === 0`, return the empty fragment. That is the macOS D-05 hide; keep the existing D-05 rationale comment, updated to the tri-state wording.
- Render `SelectField` with `htmlId="trayIconVariant"` and `value={displayedTrayIconVariant(trayIconVariant, platform)}`, which covers the DEC-4 Linux display.
- The `onChange` handler reads `event.target.value`, returns early unless `isTrayIconVariant` accepts it, then calls `setTrayIconVariant(next)` followed by `window.api.changeTrayColor()`, the same live path as today.
- Build one `MenuItem` per entry in `options`, labelled from a `Record<TrayIconVariant, string>` of LITERAL `t()` calls. The i18next parser only extracts literal keys, so never template the key. The calls and fallbacks, which are exactly the catalogue strings:
  - `t('setting.tray-icon-variant.label', 'Tray Icon')`
  - `t('setting.tray-icon-variant.auto', 'Auto (match the taskbar)')`
  - `t('setting.tray-icon-variant.dark', 'Dark icon (for light taskbars)')`
  - `t('setting.tray-icon-variant.light', 'Light icon (for dark taskbars)')`
- The old ToggleSwitch and its `(needs restart)` fallback go away entirely (DEC-6).
- Update the long comment block so it describes the tri-state path: selector -> `changeTrayColor` -> `syncTrayIcon` -> `{ variant }` -> `tray_set_icon` -> `resolve_tray_icon_dark` -> `tray_image`. Also cover DEC-4's Linux rule, and note that a selection applies immediately, as live-confirmed on 2026-09-26.

**E. Catalogue, DEC-5, operator-directed.**
- Add to `public/locales/en/translation.json` under the `"setting"` object a nested `"tray-icon-variant"` object with keys `auto`, `dark`, `label` and `light`, sorted, whose values equal the four fallbacks above exactly. Use 4-space indentation matching the file. Touch no other locale file and no other key; leave `setting.darktray` in place.
- Then run `pnpm i18n --fail-on-update`. It exited 0 with no diff at HEAD on 2026-09-30.
  - If it exits non-zero with "Some keys were sorted", the parser has rewritten the file into its sort order. Accept that only if `git diff --stat -- public/locales` shows `en/translation.json` alone, then re-run to exit 0.
  - If it reports translations were updated, a key or fallback mismatches. Fix the catalogue entry, not by templating the call.
- Expect `meta/__tests__/i18nCatalogChurnGuard.test.ts` "live tree" to be red until this task commits. Do not run the full jest suite before the commit and read that red as a regression. Task 3 re-runs it after the commit.

**F. New gate `src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts`.** Follow the framelessWindowCopy idiom: comment-stripped source, catalogue JSON read from disk, with a docblock explaining it is a source-text gate because there is no jsdom. Assertions:
1. The stripped component has no match for `/restart/i` (DEC-6, requirement 5).
2. Extract every call matching `/\bt\(\s*'(setting\.tray-icon-variant\.[a-z]+)'\s*,\s*'([^']*)'\s*\)/g` from the stripped component. There must be exactly 4 matches (non-vacuity), and each fallback must equal the value at that dotted path in `public/locales/en/translation.json`.
3. The stripped component contains `useSetting('trayIconVariant'`, `trayIconVariantOptions(` and `displayedTrayIconVariant(`, and contains neither the legacy key name nor `ToggleSwitch`.
4. The stripped `src/backend/config.ts` contains `trayIconVariant: migrateTrayIconVariant(defaultSettings)` and `trayIconVariant: 'auto'`, and does NOT contain the legacy key name. This pins the DEC-2 wiring. The migration's mapping is proven behaviourally in Task 1's Common suite.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts src/common/__tests__/trayIconVariant.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm i18n --fail-on-update</automated>
    <automated>pnpm lint</automated>
    <automated>npx prettier --check src/common/types.ts src/backend/config.ts src/backend/__mocks__/config.ts src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts</automated>
    <automated>test "$(git diff --name-only -- public/locales)" = "public/locales/en/translation.json"</automated>
  </verify>
  <done>
The setting gate passes all four assertions, including exactly 4 fallback/catalogue matches. The Common and appShellFlows suites are still green. codecheck is clean with the legacy key gone from `AppSettings`. `pnpm i18n --fail-on-update` exits 0. Both lint ceilings pass. Prettier is a real pass on the five TS paths. The only locale change is `en/translation.json`; that file is prettier-ignored, so its consistency rests on the parser check. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Windows Auto follows a taskbar-only change live; source gates, stale-comment refresh, todo note</name>
  <files>src-tauri/src/main.rs, src/backend/__tests__/tauriShellSource.test.ts, meta/trayIconVariants.ts, src/backend/__tests__/trayIconAssets.test.ts, .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md</files>
  <read_first>
    - src-tauri/src/main.rs (the items Task 1 added after `tray_image`; lines ~11740-11750 where `.build(app)` result is checked with `if let Err(e) = tray`)
    - src/backend/__tests__/tauriShellSource.test.ts (lines 60-90 `loadMainRsCode`; 200-260 the tray describe block to extend)
    - meta/trayIconVariants.ts (lines 440-456, 572-586)
    - src/backend/__tests__/trayIconAssets.test.ts (lines 20-32, 98-106)
    - ~/.cargo/registry/src/*/windows-sys-0.60.2/src/Windows/Win32/System/Registry/mod.rs lines 52 (RegNotifyChangeKeyValue signature), 167 (KEY_NOTIFY), 1032 (REG_NOTIFY_CHANGE_LAST_SET)
  </read_first>
  <action>
<!-- planner-discipline-allow: AppsUseLightTheme -->

**A. Watcher, DEC-3.** Add `#[cfg(windows)] fn spawn_taskbar_theme_watcher(app: tauri::AppHandle)` beside the Task 1 items.

It spawns one named thread with `std::thread::Builder::new().name("tray-taskbar-theme".into())`. If the spawn fails, log `[shell] WARN:` and continue. Never unwrap or panic (T-34.1-22 discipline).

The thread body:
1. Open HKCU with the Personalize subkey constant and `KEY_NOTIFY` via `RegOpenKeyExW`. If that fails, log one WARN ("Auto keeps the value read at the last sync") and return.
2. Loop on `RegNotifyChangeKeyValue(key, 0 /* no subtree */, REG_NOTIFY_CHANGE_LAST_SET, null event, 0 /* synchronous: blocks until a value under the key changes */)`. Check the exact BOOL/HANDLE parameter types against the vendored signature.
3. On any non-success return, log one WARN with the code and BREAK. Never `continue` on error: a failing notify must not become a busy loop.
4. After each notification, act only if `current_tray_icon_mode() == TrayIconMode::Auto`. Then compute `resolve_tray_icon_dark(TrayIconMode::Auto, read_system_uses_light_theme())` and set it via `app.tray_by_id(TRAY_ICON_ID)` with `set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())`. On error, log a WARN and keep looping. When no tray is found, log once and break.
5. After the loop, `RegCloseKey`.

Constraints:
- The notification only TRIGGERS a fresh read, and nothing from it is used as a value.
- Write a SAFETY comment covering the handle lifetime.
- Write a doc comment stating DEC-3's measured reason for not using tao's ThemeChanged: `update_theme` fires only when the app-theme value (AppsUseLightTheme) changes, and never when a preferred theme is set. Cite tao 0.35.3 `event_loop.rs:2269-2291`. The same comment must say the app-theme value is deliberately not read anywhere. That comment is what makes Task 3's negative gate below non-vacuous.

Call site: replace `if let Err(e) = tray { ...WARN... }` after `.build(app)` with a `match`. The `Ok(_)` arm calls `spawn_taskbar_theme_watcher(app.handle().clone())` under `#[cfg(windows)]`. The `Err(e)` arm keeps the existing WARN text verbatim. The watcher therefore exists only when a tray exists; a `noTrayIcon` user gets no thread.

**B. Source gates.** Add a new describe block to `src/backend/__tests__/tauriShellSource.test.ts`, "quick 260930-lyk: tray Auto reads the TASKBAR theme, never the app theme", using `loadMainRsCode()` (comment-stripped). Assertions:
- The code contains `SystemUsesLightTheme` and the Personalize subkey text (JS literal `'Themes\\Personalize'`).
- The code contains `RegNotifyChangeKeyValue` and `REG_NOTIFY_CHANGE_LAST_SET`.
- The code does NOT contain `AppsUseLightTheme`.
- The code does NOT match `/\.theme\(\)/`. This is the no-argument window-theme getter. The existing `.theme(Some(tauri::Theme::Light))` builder calls take an argument and do not match; the planner measured zero current matches.
- A non-vacuity check: the RAW, unstripped main.rs DOES contain `AppsUseLightTheme` at least once (the rationale comment). This proves the negative assertion is comment-scoped rather than trivially true.

**C. Stale references, DEC-7.** In `meta/trayIconVariants.ts`:
- Rewrite the present-tense docblock at `:445-452` to say the pair is selected by the tri-state `trayIconVariant` setting. Dark or Windows-Auto on a light taskbar gets the black `dark` fill; Light, Linux-Auto, or Windows-Auto on a dark or unreadable taskbar gets the white `light` fill. Drop the stale `getIcon()` reference (the Electron tray it named is gone).
- Change the thrown message at `:582` to say "the tray icon variant setting" instead of the retired key.
- Leave line 9 (history) and ALL generator logic untouched.

In `src/backend/__tests__/trayIconAssets.test.ts`, reword the comments at `:27` and `:103` to refer to the tray icon variant setting. Comments only; no assertion changes.

**D. Todo, requirement 7.** In the todo file:
- Change the frontmatter `ready: code` to `ready: live-gate`, and `platform: any` to `platform: windows`. The remaining work is a live run on the operator's Windows machine, and the CLAUDE.md vocabulary's `windows` value means exactly that.
- Keep `severity: minor` and the key order severity/platform/ready.
- Append a section `## Status (quick 260930-lyk, 2026-09-30)` stating:
  - Tri-state Auto/Light/Dark shipped in quick task `.planning/quick/260930-lyk-tray-glyph-tri-state-auto-light-dark-wit/`.
  - Windows Auto reads `SystemUsesLightTheme` and re-reads it on `RegNotifyChangeKeyValue`, not ThemeChanged, for the DEC-3 reason in one sentence.
  - Linux offers Light/Dark only, with Auto resolving to the white glyph.
  - The stale `(needs restart)` fallback is gone.
  - The ONLY outstanding item is this todo's own Verification paragraph, run live on Windows. That paragraph stays as written.
- Do NOT move the file to completed/, do NOT add any resolved/closed marker, and do NOT edit the Mechanism or Verification sections.

**E. Post-Task-2 check.** Run the churn guard now that Task 2's catalogue edit is committed, and record the result in the SUMMARY.

**F. SUMMARY UAT item.** The SUMMARY must carry a `## UAT` item in the CLAUDE.md UAT shape: a column-0 `### 1. Windows Auto follows the TASKBAR theme, not the app theme` heading, an inline `expected:` line, and `result: pending` as the next line. `expected:` states: Windows Colors set to Custom, the taskbar (Windows mode) set to the opposite of the app mode, Auto selected; the glyph matches the TASKBAR (black on a light taskbar, white on a dark one); flipping only the Windows mode updates the glyph with no restart. It is pending, never a pass.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell</automated>
    <automated>npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/trayIconAssets.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/backend/__tests__/tauriShellSource.test.ts meta/trayIconVariants.ts src/backend/__tests__/trayIconAssets.test.ts</automated>
    <automated>PYTHONIOENCODING=utf-8 python .planning/todos/todo-frontmatter-gate.py</automated>
    <automated>test -f .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md && ! test -e .planning/todos/completed/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md && grep -q '^ready: live-gate$' .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md && grep -q '260930-lyk' .planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md</automated>
    <automated>test -z "$(git status --porcelain -- public/icon-tray-dark.png public/icon-tray-light.png public/icon-tray-template.png)" && test -z "$(git log --format=%h 7a6641ec7..HEAD -- public/icon-tray-dark.png public/icon-tray-light.png public/icon-tray-template.png)"</automated>
  </verify>
  <done>
The full `cargo test --bin gamelib-shell` passes. Record passed/ignored counts against the 2026-09-23 baseline of 234 passed / 2 ignored, noting any drift from unrelated commits since. The new tauriShellSource gates are green, including the raw-source non-vacuity check. trayIconAssets is green and the generated rasters carry zero diff, which is DEC-7's proof of no functional generator change. The churn guard's live-tree test is green after Task 2's commit. codecheck is clean and prettier is a real pass on the three TS paths. The todo gate exits 0, and the todo is still pending with `ready: live-gate`, `platform: windows` and a 260930-lyk pointer. The SUMMARY carries the pending UAT item. The `.planning` files are prettier-ignored, so no check is claimed for them.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> Rust shell (`tray_set_icon` args) | JSON from the Node sidecar crosses into the privileged shell |
| HKCU registry -> Rust shell | `SystemUsesLightTheme` is user-writable OS state read by the shell |
| config.json on disk -> GlobalConfig | a hand-edited, synced or legacy config value is parsed at load |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260930-lyk-01 | Tampering | main.rs `tray_set_icon_mode_from_args` | low | mitigate | Exact allow-list parse of "auto"/"light"/"dark"; anything else becomes Auto; an unrecognised value is logged by byte length only, never verbatim; pinned by the `tray_variant_wire_contract_*` tests |
| T-260930-lyk-02 | Tampering | main.rs `read_system_uses_light_theme` | low | mitigate | `RegGetValueW` with `RRF_RT_REG_DWORD` rejects non-DWORD types; fixed 4-byte `u32` buffer with a `cb == 4` check; no pointer arithmetic; failure falls back to the documented white glyph. The worst case for a same-user attacker is a flipped glyph colour |
| T-260930-lyk-03 | Denial of Service | main.rs `spawn_taskbar_theme_watcher` | medium | mitigate | Any non-success `RegNotifyChangeKeyValue` return BREAKS the loop (no retry spin); thread-spawn and key-open failures log and continue; no unwrap/panic; a thread exists only when a tray was built |
| T-260930-lyk-04 | Tampering | config.ts / `migrateTrayIconVariant` | low | mitigate | Invalid stored values are normalised (invalid new key falls to legacy, then to Auto); the sidecar sends only `trayIconWireArgs` output; Rust re-validates |
| T-260930-lyk-05 | Information Disclosure | shell logs | low | accept | Logs carry only fixed text, a registry error code, or a byte length; no config or registry string is logged verbatim |
| T-260930-lyk-06 | Denial of Service | sidecar exit contract | low | mitigate | No new Node timer, watcher or boot request; `syncTrayIcon` reuses the existing debounced `trayColorTimer` and the existing guarded one-shot initial sync |
| T-260930-lyk-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package installs in this plan: `windows-sys` 0.60 with `Win32_System_Registry` is already declared; Task 1 gates `git diff --quiet` on Cargo.toml, Cargo.lock, package.json and pnpm-lock.yaml |
</threat_model>

<verification>
- `pnpm codecheck` clean; `pnpm lint` ceilings pass.
- `npx jest src/common/__tests__/trayIconVariant.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/trayIconAssets.test.ts src/frontend/screens/Settings/components/__tests__/trayIconVariantSetting.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts` green after all commits.
- `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` green, plus the one `--ignored` reg.exe comparison on this Windows machine.
- `pnpm i18n --fail-on-update` exits 0.
- Every non-`.rs`, non-ignored path written passes a scoped `npx prettier --check`.
- NOT verifiable by the executor: the live Windows Custom-colors check. It is recorded as a pending UAT item and the todo stays pending (`ready: live-gate`).
</verification>

<success_criteria>
- Legacy `true`/`false`/absent map to Dark/Light/Auto; an explicit `trayIconVariant` wins.
- Windows Auto follows `SystemUsesLightTheme` (1 = black glyph, 0 or unreadable = white glyph), re-read on registry change, never from the app theme or the window theme.
- Linux offers Light/Dark only, with Auto resolving to and displaying as Light; macOS shows no control and keeps the template.
- Selector fallbacks equal the shipped catalogue strings; no restart claim anywhere in the component.
- The sidecar and Rust share one wire fixture; no new dispatch arm; no dependency change.
- The todo stays pending with `ready: live-gate`, `platform: windows` and a pointer here; the SUMMARY has a pending (not passed) UAT item.
</success_criteria>

<output>
Create `.planning/quick/260930-lyk-tray-glyph-tri-state-auto-light-dark-wit/260930-lyk-SUMMARY.md` when done, including: DEC-3's tao finding, DEC-5's catalogue decision (operator-directed, D-06 tension, with the gamelib-namespace alternative named as a possible follow-up), the answer for `meta/trayIconVariants.ts` (no functional change, doc and message refresh only), the measured `SystemUsesLightTheme` value from the ignored test, cargo pass counts, and the pending UAT item.
</output>
