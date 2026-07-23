---
status: diagnosed
trigger: "Phase 30 UAT Test 8 (Tauri): settings cant be reached"
created: 2026-07-23
updated: 2026-07-23
---

## Current Focus

hypothesis: CONFIRMED — Settings route renders a permanent loading spinner because both render gates depend on `requestAppSettings`, an invoke channel deliberately left unported on the Tauri sidecar in Phase 30. Under Tauri it rejects with UNPORTED_CHANNEL_MARKER; the rejection is uncaught, so `currentConfig` stays null and `contextValues` stays null → `<UpdateComponent />` forever.
test: Traced Settings/index.tsx mount effect + useSettingsContext against 30-PORTED-CHANNELS.md "Deliberately NOT ported" list.
expecting: N/A — root cause confirmed.
next_action: Return diagnosis. Fix belongs to plan-phase --gaps (port requestAppSettings, or add error handling so the route degrades gracefully).

## Symptoms

expected: Under Tauri build (`npm run tauri:dev`), the Settings screen should be reachable and render, so its file/path pickers can be tested (openDialog file vs folder mode).
actual: "settings cant be reached" — navigating to Settings never renders the settings content (permanent loading spinner / blank).
errors: None surfaced to the tester. (Backend logs an UNPORTED_CHANNEL_MARKER rejection; the frontend swallows it as an unhandled promise rejection.)
reproduction: Phase 30 UAT Test 8. Tauri build, signed in, library populated. Navigate to Settings.
started: Discovered Phase 30 UAT, 2026-07-23. Present since Tauri build existed — Settings config channels were never ported.

## Eliminated

- hypothesis: Router misconfiguration / route not registered under Tauri
  evidence: Settings() component IS reached and mounts (route `/settings/:type` resolves via App.tsx router). The component itself short-circuits to `<UpdateComponent />` at line 79. Not a routing failure — a data-load failure inside the mounted component.
  timestamp: 2026-07-23

- hypothesis: A `send`-based channel silently no-ops (the G-30-01 logoutSteam pattern)
  evidence: `requestAppSettings` is `makeHandlerInvoker('requestAppSettings')` (preload/api/settings.ts:3) — an INVOKE channel, not a `send`. Invoke channels reject with UNPORTED_CHANNEL_MARKER (per 30-PORTED-CHANNELS.md Invariant B), they do not silently succeed. The failure mode here is a rejected promise, not a silent no-op.
  timestamp: 2026-07-23

## Evidence

- timestamp: 2026-07-23
  checked: src/frontend/screens/Settings/index.tsx lines 65-81
  found: Mount effect calls `const config = await window.api.requestAppSettings(); setCurrentConfig(config)` with NO try/catch. Line 79 gate: `if (!currentConfig || !contextValues) return <UpdateComponent />`. If the await throws, setCurrentConfig is never called → currentConfig stays null → permanent spinner.
  implication: Settings render is hard-gated on requestAppSettings resolving.

- timestamp: 2026-07-23
  checked: src/frontend/hooks/useSettingsContext.ts lines 15-66
  found: appName='default' (Settings/index.tsx:40) → isDefault=true → line 33-36 also calls `await window.api.requestAppSettings()`. On rejection, its local setCurrentConfig never runs → config stays `{}` → line 61 `Object.keys(contextValues.config).length === 0` → returns null. So `contextValues` (the SECOND half of the line-79 gate) is ALSO null.
  implication: BOTH render gates independently depend on requestAppSettings. Even if one were patched, the other still blanks the route.

- timestamp: 2026-07-23
  checked: .planning/phases/30-.../30-PORTED-CHANNELS.md lines 50-58
  found: `requestAppSettings` is explicitly listed under "Deliberately NOT ported this phase" as one of the six DownloadDialog channels. Stated rationale: "DownloadDialog never mounts for runner === 'steam' ... none of its reads are on the Steam depot path this phase covers." Each such entry "still rejects non-fatally with UNPORTED_CHANNEL_MARKER per Invariant B."
  implication: The not-ported decision only considered the DownloadDialog call site. It overlooked that the Settings screen AND useSettingsContext also call requestAppSettings at mount — completely independent of DownloadDialog. That oversight is the gap.

- timestamp: 2026-07-23
  checked: src/preload/api/settings.ts line 3
  found: `export const requestAppSettings = makeHandlerInvoker('requestAppSettings')` — confirms it is an invoke/handler channel (reject-on-unported), routed through makeHandlerInvoker → isTauri() → tauriTransport invoke path.
  implication: Under Tauri this resolves to the sidecar RPC; with no registration it returns the marker rejection.

- timestamp: 2026-07-23
  checked: .planning/phases/30-.../30-UAT.md Test 8
  found: Test 8's actual truth was about openDialog file-vs-folder picker MODE (WR-02/WR-01). The tester could not even reach Settings to exercise the picker. So the picker-mode question is BLOCKED behind this Settings-unreachable bug and remains unverified.
  implication: Two distinct concerns are conflated in Test 8. This diagnosis resolves only the "Settings unreachable" half; the file-vs-folder picker-mode behavior cannot be assessed until Settings renders.

## Resolution

root_cause: |
  The Settings route mounts but never renders its content under Tauri because both of its render
  gates (Settings/index.tsx:79 — `!currentConfig || !contextValues`) depend on `window.api.requestAppSettings()`,
  an INVOKE channel that Phase 30 deliberately left unregistered on the Tauri sidecar
  (30-PORTED-CHANNELS.md:54). Under Tauri it rejects with UNPORTED_CHANNEL_MARKER. Neither call site
  catches the rejection: Settings/index.tsx:65-71's getSettings() has no .catch, and
  useSettingsContext.ts:31-38's getSettings() is `void`-ed. So `currentConfig` (Settings state) stays
  null AND `contextValues` (from useSettingsContext, which returns null while config is `{}`) stays null.
  The gate at line 79 returns `<UpdateComponent />` forever → the screen appears unreachable / stuck loading.
  This is a genuine Phase 30 scoping gap, not merely "Phase 31 not done yet": the not-ported decision
  justified itself only via the DownloadDialog call site and missed that the Settings screen itself (and
  useSettingsContext) consume requestAppSettings at mount.
fix: (deferred — find_root_cause_only mode; plan-phase --gaps owns the fix)
verification: (not applied)
files_changed: []
