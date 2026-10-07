---
created: 2026-10-05T00:00:00.000Z
title: "Set a restrictive CSP on the Tauri webview (csp: null with withGlobalTauri: true)"
area: security
severity: minor
platform: any
ready: live-gate
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05 (split from 2026-10-05-security-hardening-minors-from-trust-boundary-review, item 3)"
status: "RESOLVED 2026-10-08, quick task 261008-gf1 (cd9ca2125), live-gated on macOS WebKit. Policy: default-src/script-src 'self' (no unsafe-inline, no unsafe-eval); style-src 'self' 'unsafe-inline' (the Settings Custom CSS feature writes into a <style>); img-src 'self' data: https: http: (artwork from arbitrary CDNs); font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://steamgrid.usebottles.com; object/frame/worker 'none'; base-uri/form-action 'self'. devCsp deliberately NOT set: with build.devUrl present tauri-codegen embeds no assets and nothing is served through Tauri under `tauri dev`, so no policy applies there (tauri-2.11.5 manager/mod.rs get_asset is the only injection site). LIVE GATE (`pnpm tauri:dev:packaged`): the census-derived first bundle logged 3 violations on the startup path -- `font-src blocked data` (a @fontsource Cabin subset Vite-inlined under 4 KB; census grepped src/ only) and `style-src-elem blocked inline` x2 (tauri-codegen nonces the bundled <style id=customCSS>, the runtime nonce makes 'unsafe-inline' ignored, MUI's runtime <style> blocked) -- fixed by `font-src data:` and `dangerousDisableAssetCspModification: ['style-src']`. Corrected bundle: 0 violations across 12 launches; `.App` rendered by t+6s in 9 (8/8 in the controlled 20s-per-launch series); 2 launches sat on the Loading fallback past 30s with ZERO violations and nothing in the log -- same shape as the open 2026-09-17 initial-route hang, not attributable to the policy on this evidence, not excluded either; 1 killed before its probe. Violations are now forwarded to gamelib.log by a securitypolicyviolation listener in src/frontend/index.tsx. NOT measured: WebKitGTK, WebView2; the store/login embeds are remote-URL native webviews outside this policy entirely."
files:
  - src-tauri/tauri.conf.json
  - src/frontend/index.tsx
  - src/backend/__tests__/tauriConf.test.ts
---

## Problem

`src-tauri/tauri.conf.json` has `"csp": null` with `"withGlobalTauri": true`. Any XSS in the main
renderer reaches `sidecar_invoke`, which has no Rust-side channel allow-list. No live XSS sink was
found (MessageBoxModal decodes via textarea, GameChangeLog uses sanitize-html), so this is defence
in depth only.

## Why this is live-gate, not code

A CSP set blind can break the renderer (inline styles/scripts, `asset:`/`ipc:` URLs, remote
artwork and CDN images), the store/login embeds, and the Vite dev server (HMR websocket,
`http://localhost`). None of that is observable from jest or `cargo check`; it needs the app run
with the policy applied, ideally on each OS's webview (WebKit on macOS, WebKitGTK, WebView2).

## Suggested fix

Start from a report-only style audit in a live run: list every origin the renderer actually loads
(images, fonts, connect targets), then set `app.security.csp` (and `devCsp` for the dev server) to
that set, with `default-src 'self'` and no `unsafe-eval`. Verify the library, store embeds, login
windows and dev server all still work.
