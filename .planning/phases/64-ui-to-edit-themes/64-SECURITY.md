---
phase: "64"
slug: "ui-to-edit-themes"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-19"
---

# Phase 64 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user text -> colour parser | `parseColour`/`tryContrast` receive untrusted editor keystrokes | free text, low sensitivity |
| repo source -> generated data | `themes.scss`/`_colors.scss` become the committed `builtinTokens.generated.json` | trusted in-repo source |
| renderer -> Rust relay -> sidecar | `sidecar:store-set-checked` carries a renderer-chosen store name, key path and JSON value | config writes |
| sidecar -> config.json -> renderer boot | `customThemes` is persisted and re-applied before React renders; the file can be hand-edited or corrupt | user config |
| stored token -> body.style / SVG fills | token names and values become CSS custom properties and `fill` attributes | CSS text |
| typed gradient text -> preview strip | untrusted CSS text reaches an inline `background-image` | CSS text (outbound-fetch risk) |
| user-typed theme name -> cards, dialogs, notice | the name is rendered in cards, tooltips, aria-labels, dialogs and the save-failure notice | free text |
| npm registry -> node_modules | `react-colorful` is a new dependency | third-party code |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-64-01 | Denial of service | `parseColour`, `tryContrast` | medium | mitigate | Total functions (null, never throw); 50+ malformed-string no-throw test (64-01-SUMMARY) | closed |
| T-64-02 | Tampering | `themeTokens.test.ts` refactor | low | mitigate | 288-test gate on the lifted suite (64-01-SUMMARY) | closed |
| T-64-03 | Tampering | `builtinTokens.generated.json` | low | mitigate | Drift test plus `meta/genThemeTokens.ts --check` | closed |
| T-64-04 | Information disclosure | gradient values in seeds | low | mitigate | Seeds from in-repo SCSS only; every stored gradient re-checked on read by `isValidGradient` | closed |
| T-64-05 | Elevation of privilege | `sidecar:store-set-checked` handler | high | mitigate | Handler calls the same `applyStoreWrite` choke point as `storeSet` (`src/backend/sidecar/storeWriteHandlers.ts`); only `customThemes` added to the allow-list (`src/common/types/storePolicy.ts:110`) | closed |
| T-64-06 | Tampering | key path on the checked channel | high | mitigate | `isSafeKeyPath` guard in `src/backend/sidecar/fileStore.ts:155,172` plus the field allow-list; whole array written under one fixed key | closed |
| T-64-07 | Denial of service | oversized JSON value | low | accept | See Accepted Risks Log | closed |
| T-64-08 | Information disclosure | checked-write response | low | mitigate | Handler returns a bare boolean; nothing echoed | closed |
| T-64-09 | Repudiation | refused writes | low | mitigate | Each refusal keeps its stderr line (non-string guard logs at `storeWriteHandlers.ts:356`) | closed |
| T-64-10 | Denial of service | `parseCustomThemes` at boot | high | mitigate | Total parse with caps (`MAX_CUSTOM_THEMES = 50`, `customTheme.ts:22`), 500-structure test (64-04-SUMMARY) | closed |
| T-64-11 | Tampering | `applyTheme` setProperty | high | mitigate | `TOKEN_NAME_PATTERN = /^--[a-z0-9-]+$/` (`customTheme.ts:71`) plus known-token universe | closed |
| T-64-12 | Information disclosure | gradient values | high | mitigate | `GRADIENT_DENY` rejects `url(`, `var(`, `;`, `{`, `}`, `@`, `!important`, backslash before `CSS.supports` (`validate.ts:13,32`) | closed |
| T-64-13 | Tampering | prototype pollution via ids | medium | mitigate | `THEME_ID_PATTERN = /^[0-9a-f]{16}$/` (`customTheme.ts:26`); single fixed key | closed |
| T-64-14 | Tampering | built-in themes | medium | mitigate | Setters refuse non-custom ids; zero-write tests for `nord-light`; `themes.scss` untouched (THEME-02) | closed |
| T-64-15 | Tampering | `ThemeThumbnail` fills | medium | mitigate | `safeColour` canonical hex via `thumbnailPalette.ts`; hostile-value markup test | closed |
| T-64-16 | Tampering | dialog messages with a theme name | medium | mitigate | Messages are React elements (`themeDialogs.ts:15`); no `innerHTML`/`dangerouslySetInnerHTML` in ThemeSelector, ThemeEditor or the notice | closed |
| T-64-17 | Denial of service | many custom themes | low | mitigate | Duplicate refuses at 50; `ThemeGalleryCustom.test.tsx:197` and `customThemesState.test.ts:117` pass (2026-11-19) | closed |
| T-64-18 | Tampering | ColourField commit | medium | mitigate | Only canonical hex from `validateColourInput`/`normaliseColour` enters the draft (`ColourField.tsx` uses `safeColour`) | closed |
| T-64-19 | Tampering | draft -> app | medium | mitigate | Draft feeds only the preview; the app changes only via `saveCustomThemeTokens`, which re-validates (`settingsState.ts:208-214`) | closed |
| T-64-20 | Tampering | react-colorful `<style>` injection | low | accept | See Accepted Risks Log | closed |
| T-64-21 | Information disclosure | GradientField strip | high | mitigate | Strip paints only the last value `isValidGradient` accepted; url()/var() refused even when supports is true (64-08-SUMMARY); live UAT test 10 passed | closed |
| T-64-22 | Denial of service | checkFloors on every keystroke | low | mitigate | `tryContrast` total and O(1); three pairs per render | closed |
| T-64-23 | Tampering | unsaved prompt message | medium | mitigate | Message is a React element; the name renders as text | closed |
| T-64-24 | Repudiation | refused Save shown as saved | medium | mitigate | `ThemeEditor/index.tsx:68-69` shows the failure notice on `failed`; live UAT test 17 passed with a forced refusal | closed |
| T-64-25 | Tampering | gate baselines | medium | mitigate | `a7bf4dfe5` adds only the 100 `customThemes.*` keys to the presence baseline, no key removed; `i18nGateScope.json`/`i18nForkTouchedFiles.json` only gained files (wider coverage, not looser gates) | closed |
| T-64-SC | Tampering | `pnpm add react-colorful` (Plans 07, 10) | high | mitigate | Exact pin `"react-colorful": "5.8.1"` in `package.json:136`; `pnpm-lock.yaml:4851` resolves `react-colorful@5.8.1` with integrity hash | closed |
| T-64-SC (01-06, 08, 09) | Tampering | npm/pip/cargo installs | high | accept | No package installed in those plans; see Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-64-01 | T-64-07 | Same trust level as the existing fire-and-forget `storeSet` (local renderer, zod-bounded name/key length); value size capped renderer-side by the theme and token limits | plan 64-03 threat model | 2026-11-19 |
| AR-64-02 | T-64-20 | CSP already allows `style-src 'unsafe-inline'`; react-colorful's injected CSS styles only the picker | plan 64-07 threat model | 2026-11-19 |
| AR-64-03 | T-64-SC (01-06, 08, 09) | Those plans installed no package; nothing to verify | plan threat models | 2026-11-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-19 | 27 | 27 | 0 | /gsd-secure-phase 64 (orchestrator, ASVS L1 grep-depth; plan-time register, auditor short-circuited) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-19
