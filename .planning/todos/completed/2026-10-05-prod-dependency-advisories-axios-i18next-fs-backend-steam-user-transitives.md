---
created: 2026-10-05T00:00:00.000Z
title: "pnpm audit --prod: 2 critical / 59 high — upgrade axios, i18next-fs-backend, and steam-user transitives (protobufjs, adm-zip), xmldom"
area: security
severity: major
platform: any
ready: code
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05"
files:
  - package.json
  - pnpm-lock.yaml
---

## Problem

`pnpm audit --prod` on 2026-10-05: 2 critical, 59 high, 62 moderate, 5 low (full audit: 4 critical,
125 high). Shipped paths that matter:

- **axios < 1.16** (direct): prototype-pollution gadgets, Proxy-Authorization leak on redirect,
  HTTP/2 proxy/DNS bypass, form-data CRLF.
- **i18next-fs-backend < 2.6.6**: critical prototype pollution, plus path traversal via `lng`, which
  the renderer can set through `changeLanguage`.
- **protobufjs < 7.5.5** via steam-user: the critical "ACE" needs attacker schemas (steam-user uses
  static protos), so the realistic risk is decoder DoS on Valve CM traffic.
- **adm-zip ≤ 0.6** via steam-user: zip bomb, SUID preservation.
- **@xmldom/xmldom** via plist: injection and DoS.
- **undici / ws** via discord-rpc: local WebSocket DoS.
- Lower: fast-uri (conf), @remix-run/router open-redirect, postcss/nanoid (sanitize-html), lodash
  `_.template` (recharts, not called with untrusted input).

## Failure scenario

See each advisory; the i18next-fs-backend traversal is the one reachable from the renderer.

## Suggested fix

Bump direct deps (axios ≥ 1.20, i18next-fs-backend ≥ 2.6.6); use `pnpm.overrides` for transitive
ones where the parent hasn't released a fix; re-run `pnpm audit --prod` and the full jest suite.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Reproduced.** `pnpm audit --prod --json` on the unmodified tree (`91d4756`):
`critical 2, high 59, moderate 62, low 5`. After this change: `critical 0, high 0, moderate 4,
low 0` (full audit incl. dev: `critical 2, high 64, moderate 33, low 8` — the rest is dev-only).

**Direct bumps (package.json):** axios `^1.13.5` -> `^1.20.0` (also pulls follow-redirects
1.16.1, form-data 4.0.6); i18next-fs-backend `^2.6.0` -> `^2.6.8`; react-router-dom `^6.30.0` ->
`^6.30.6` (@remix-run/router 1.23.4); sanitize-html `^2.16.0` -> `^2.18.0` (postcss 8.5.28,
htmlparser2 12). The axios 1.14-1.19 changelogs were read: nothing touches our usage (the
`validateStatus` functions in howlongtobeat and gog library are still honoured; the 1.18
`validateStatusUndefinedResolves` opt-in only concerns `validateStatus: undefined`, never passed).

**`pnpm.overrides`, inside the parent's declared major:** `protobufjs@^7 ^7.6.5`,
`@xmldom/xmldom@^0.8 ^0.8.15`, `undici@^6 ^6.28.1`, `ws@^8 ^8.21.0`, `ajv@^8 ^8.18.0`,
`fast-uri@^3 ^3.1.8`, `socks@^2 ^2.8.10` (brings ip-address 10.7.3), `lodash@^4 ^4.18.1`,
`nanoid@^3 ^3.3.18`, `diff@^5 ^5.2.2`, `yaml@^1 ^1.10.3`.

Two overrides deliberately cross a 0.x/major boundary, after checking steam-user's usage:

- `steam-appticket ^2.0.1` (steam-user asks `^1.0.1`; 1.x carries protobufjs 6.11.6, the
  critical). steam-user only calls `parseAppTicket(ticket, allowInvalidSignature)` and
  `parseEncryptedAppTicket(ticket, key)` (`components/appauth.js`); 2.0.1 keeps both as CJS named
  exports with the same signatures and inlines its proto schema (no fs read).
- `adm-zip ^0.6.1` (steam-user asks `^0.5.10`). steam-user's only use is
  `new AdmZip(buf).readFile(getEntries()[0])` in `cdn_compression.js`; that API is unchanged in
  0.6.1. steam-user stays 5.3.0, so `patches/steam-user.patch` still applies.

Both were checked by a scratchpad script (run plain, and again esbuild-bundled) that round-trips
a zip through steam-user's own `cdn_compression.unzip`, asserts both steam-appticket exports, and
`require`s steam-user under protobufjs 7.6.6.

**Left deliberately (4 moderate):**

- i18next-http-backend <3.0.5 (renderer): the fix is a major (2.x -> 3.x, packaging change). Its
  new lng/ns check only guards `{{lng}}`/`{{ns}}` placeholder interpolation; our `loadPath` is a
  function, so it would not apply to us anyway. `supportedLngs` is what bounds `lng`.
- react-router (2 advisories) needs v7.18, a major migration.
- uuid <11.1.1 via short-uuid 4 (uuid 8): needs short-uuid 6 (major). The advisory is a missing
  bounds check when a caller-supplied `buf` is passed to v3/v5/v6, which short-uuid does not do.

**Note, not changed here:** like http-backend, i18next-fs-backend's 2.6.4+ path check only covers
placeholder interpolation. `bootstrap.ts`'s function `loadPath` bypasses it, and
`toShippedLanguage` passes unknown codes through; the bound today is i18next's `supportedLngs`
filtering. The upgrade closes the prototype-pollution items, not that traversal class.

**Checks.** `pnpm codecheck` exit 0. Full `pnpm test:ci` before and after: both
`4 failed / 465 passed suites, 9 failed / 9928 passed tests`. The same 8 failing tests in
`genI18nGateScope`, `lintTranslations` and `machineFillGamelib` both times. `appShellFlows` has
one failing initQueue-count test in both runs (a different one each time); re-run in isolation on
the unmodified lockfile it fails the same way, so it predates this change.
`npx prettier --check package.json` is clean.

**Not verified:** no live app run (Steam login and CM traffic, CDN depot download, Discord RPC,
changelog rendering through sanitize-html 2.18 / htmlparser2 12), no SEA build, no
macOS/Windows/Linux live run.
