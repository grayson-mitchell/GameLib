# Phase 40 — i18n Census (D-37)

**Base commit:** `8ac3a8c12` ("docs(todos): file macOS releases ship unsigned/un-notarized") — the
last commit before Phase 40's first commit (`924f20d33`, "docs(40): capture phase context").

**Method:** flattened-key diff of `public/locales/en/gamelib.json` and
`public/locales/en/translation.json` between the base commit and the current tree (HEAD after this
plan's Task 1 and Task 2 commits). This counts what was ACTUALLY minted, not what earlier plans'
SUMMARYs predicted.

## `public/locales/en/gamelib.json`

**COUNT: added=6 removed=2 changed=0**

### Added (6)

| Key | English value | Minting plan | Consuming component | Consumer verified by grep |
|-----|----------------|--------------|----------------------|----------------------------|
| `webview.embedPlaceholder.message` | "Paused while window is open" | 40-06 | `src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx:33` | Yes — `tGamelib('webview.embedPlaceholder.message', ...)` at line 33, rendered into `.WebView__embedPlaceholder-message` at line 39 |
| `webview.storeEmbedControls.hostLabel` | "Currently viewing {{host}}" | 40-07 | `src/frontend/components/UI/StoreEmbedControls/index.tsx:114` | Yes — `tGamelib('storeEmbedControls.hostLabel', { host })` used as an `aria-label` |
| `webview.unavailable.platform.heading` | "In-app store and wiki browsing isn't available on this platform yet" | 40-10 (this plan, Task 1) | `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:72` | Yes |
| `webview.unavailable.platform.body` | "GameLib's in-app store and wiki browsing is available on macOS. It isn't available on this platform yet." | 40-10 (this plan, Task 1) | `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:83` | Yes |
| `webview.unavailable.epic.heading` | "Epic Store browsing isn't available in-app yet" | 40-10 (this plan, Task 1) | `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:68` | Yes |
| `webview.unavailable.epic.body` | "GameLib doesn't yet embed Epic Store pages in-app." | 40-10 (this plan, Task 1) | `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:79` | Yes |

`webview.unavailable.next-step` and `webview.unavailable.open-in-browser` are pre-existing keys
(present at the base commit) reused unchanged by both new reason branches — not counted as minted.

### Removed (2)

| Key | English value at base commit | Reason | Retirement check |
|-----|-------------------------------|--------|-------------------|
| `webview.unavailable.heading` | "In-app store and wiki browsing is not available on this build" | Replaced by the `platform`/`epic` reason split (D-02/D-08); the flat key covered a single case that no longer exists | Verified by grep: no `.tsx`/`.ts` file under `src/` or `public/` references `webview.unavailable.heading` after this plan's Task 1 edit. Safe to retire. |
| `webview.unavailable.body` | "GameLib's Tauri build does not yet embed a browser view for the store and wiki pages." | Same as above | Same grep, same result — safe to retire. |

**Note (not a defect, not required by this plan's scope):** the retired keys' VALUES still exist
under the old key path in every non-English `public/locales/<locale>/gamelib.json` (per-locale
translations do not auto-prune when the English source drops a key), and in every
`public/locales/<locale>/gamelib.mt.json` MT-provenance sidecar. `pnpm lint-translations:gamelib`
and `pnpm i18n-churn-guard` both pass with these present — neither gate flags a non-English catalog
holding a key absent from `en/gamelib.json`. Left in place; a future locale-catalog pruning pass
(not this plan's scope) is the natural place to remove them.

### Changed (0)

None. No existing key's English default text was edited in place — confirmed by the diff itself
(all four `webview.unavailable.*` panel keys are NEW paths, not edits to the old `heading`/`body`
values) and matches Task 1's explicit constraint against editing defaults through the translation
function's default argument.

## `public/locales/en/translation.json`

**COUNT: added=0 removed=0 changed=0**

Nothing in this phase touched `translation.json`. All new strings landed in `gamelib.json`, per the
project's standing rule that new strings go in `gamelib.json`, never `translation.json`.

## What the gates do and do not cover

- **`pnpm lint-translations:gamelib` is blind to an absent key.** It checks that keys present in a
  locale catalog have non-empty values and structural parity where a locale file exists; it cannot
  detect that a component references a key which is not in `en/gamelib.json` at all — that failure
  mode renders the `t()` call's default string forever, silently, with no red anywhere. This census
  is the detector: every added key above was verified by grep to have a real consumer, and (by
  construction of reading `WebviewUnavailablePanel.tsx` before writing this census) every consumer
  in the phase's changed files was checked against the catalog.
- **Nothing in this repo detects English-side string drift under an existing key.** If a plan edits
  an existing key's English default in place, `lint-translations` and `i18n-churn-guard` both stay
  green while every translated locale now silently disagrees with the (changed) English source. This
  census's zero-changed-count for both catalogs is the check that no plan in this phase did that;
  it is counted from the diff, not sampled or assumed from plan SUMMARYs.
- **`pnpm i18n-churn-guard` only checks that non-`gamelib` catalogs (the upstream-owned
  `translation.json`/`gamepage.json`/`login.json` families) were not touched.** It does not inspect
  `gamelib.json` content at all, and it does not check locale coverage.
- **Pre-existing, unrelated to this phase's keys:** `pnpm lint-translations` prints `Empty
  translation` warnings for `zh_Hant` and ENOENT stack traces for `br/gamepage.json`,
  `sl/translation.json`, `sl/gamepage.json`, and `uz/login.json` — entirely-missing locale catalog
  files, part of the standing "46 locales have zero gamelib.json fork string coverage" backlog. Exit
  code is 0 regardless; this is a known gap in the gate's own strictness, not something this phase
  introduced or is responsible for fixing.

## Localisation treatment for the newly minted keys

This repo's established mechanism for filling newly minted `gamelib.json` keys into non-English
locales is `GAMELIB_MT_LOCALES=<comma-separated locales> pnpm machine-fill-gamelib`
(`meta/machineFillGamelib.ts`), which calls the Anthropic API to translate only the keys a locale is
missing, writes `public/locales/<locale>/gamelib.json`, and records provenance in the locale's
`gamelib.mt.json` sidecar. It refuses to run against all 48 locales without an explicit
`GAMELIB_MT_CONFIRM_BULK=1` opt-in (D-08) — the established per-phase precedent in this project is a
small, named locale set, e.g. `GAMELIB_MT_LOCALES=de,fr`.

**Outcome in this session: attempted, blocked by an authentication gate, zero locales populated.**
Ran `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib`. The script correctly identified 7 missing
keys for `de` (this phase's 6 new keys plus one pre-existing gap) and attempted the Anthropic API
call, which failed with `HTTP 401`. The `ANTHROPIC_API_KEY` present in this execution environment is
a 10-character placeholder value (literally `sk-ant-...`), not a live credential — this is an
environment limitation, not a code defect in `machineFillGamelib.ts` or a problem with the six
minted keys themselves. The script failed before writing any file (confirmed: `git status` shows no
changes under `public/locales/de/` or `public/locales/fr/` after the failed run), so there is no
partial or corrupt state to clean up.

**To complete the standard treatment:** re-run `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib`
with a valid `ANTHROPIC_API_KEY` set in the environment. No other precondition is outstanding — the
six new English keys are already committed to `en/gamelib.json` and ready to be read as the
translation source the moment a working credential is available.
