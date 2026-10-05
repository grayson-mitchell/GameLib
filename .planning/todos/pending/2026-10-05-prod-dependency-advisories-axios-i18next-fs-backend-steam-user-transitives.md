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
