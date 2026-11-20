---
status: complete
quick_task: 261008-gf1
title: Restrictive CSP on the bundled Tauri webview, live-gated
one_liner: Replaced `csp: null` with a census-derived directive map; the live gate on a bundled build caught two things the census could not (a Vite-inlined data: font and Tauri's style nonce nullifying 'unsafe-inline'), both fixed; corrected bundle logs zero violations across 12 launches.
date: 2026-10-08
tags: [security, tauri, csp, live-gate, source-gate]
dependency_graph:
  requires: []
  provides: [tauri-csp, csp-violation-forwarder]
  affects: [src-tauri/tauri.conf.json, src/frontend/index.tsx]
key_files:
  modified:
    - src-tauri/tauri.conf.json
    - src/frontend/index.tsx
    - src/backend/__tests__/tauriConf.test.ts
  moved:
    - .planning/todos/pending/2026-10-05-set-a-restrictive-csp-on-the-tauri-webview.md -> .planning/todos/completed/
commits:
  - cd9ca2125 fix(security): set a restrictive CSP on the bundled Tauri webview
---

## What changed

`app.security.csp` is now a directive map (see the commit and the gate's doc comment for the
per-directive census). `src/frontend/index.tsx` forwards `securitypolicyviolation` events to
`window.api.logError`, so violations land in `gamelib.log`. `tauriConf.test.ts` pins every
directive, the absence of `unsafe-eval`, the absence of `devCsp`, the
`dangerousDisableAssetCspModification` value, and the forwarder (54 tests green).

## What the live gate found that the census did not

The todo was `ready: live-gate` for exactly this reason, and it was right. Bundled build #1
(census policy) logged 3 violations on the startup path:

| Violation | Cause | Fix |
|---|---|---|
| `font-src blocked data:` | `@fontsource` Cabin subset under Vite's 4 KB `assetsInlineLimit`, shipped as `url(data:font/woff2…)`. Census grepped `src/` for `@font-face`; the faces live in `node_modules`. | `font-src 'self' data:` |
| `style-src-elem blocked inline` ×2 | `tauri-codegen` puts a nonce on every `<style>` in bundled HTML (ours: `<style id="customCSS">`) and `set_csp` appends `'nonce-N'` to `style-src` at serve time. A nonce in a directive makes browsers **ignore** `'unsafe-inline'` in it, so MUI/emotion's runtime `<style>` injection was blocked despite the config saying `'unsafe-inline'`. | `dangerousDisableAssetCspModification: ["style-src"]` — stops Tauri adding the nonce; does not weaken what we set. `script-src` stays Tauri-managed. |

Bundled build #2 (corrected): **0 violations across 12 launches**. The Web Inspector console
(auto-opened in the debug build) showed no "Refused to…" lines either.

## The rendering wobble, stated plainly

Of the 12 launches, `.App` was present at the t+6 s DOM probe in 9 (8/8 in the controlled series:
20 s per launch, process killed and confirmed gone between launches). Two launches sat on the
`Loading` fallback past 30 s with zero violations and nothing in the log; one was killed before
its probe. That shape is the open 2026-09-17 initial-route hang (`App.tsx` `fallbackElement`
comment; todo still `ready: blocked`, "no error reached log"), whose post-fix measurement was
0/10. 2/12 here is not attributable to the policy on this evidence — stuck and rendered launches
ran the identical bundle, and a CSP block of the route module would have both fired the forwarder
and tripped the 20 s `ROUTE_MODULE_TIMEOUT_MS` into `errorElement`, neither of which happened —
but it is not excluded either. If the hang's rate is ever measured again, the CSP build is now
the baseline.

## Tauri facts verified against `tauri-2.11.5` source (not docs)

- CSP is applied only in `manager/mod.rs get_asset` (header on `tauri://` responses; `<meta>` on
  Linux). With `build.devUrl`, `tauri-codegen` embeds no assets → **no policy under `tauri dev`**.
  `devCsp` would be inert and is not set; the gate pins that.
- IPC is `fetch('ipc://localhost/<cmd>')` on desktop (`scripts/ipc-protocol.js`), Windows
  `http://ipc.localhost` → both in `connect-src`. IPC worked on every launch (hydrate,
  `frontendReady`, library refresh).

## Not measured

WebKitGTK and WebView2. The policy uses only directives every engine honours in header and
`<meta>` form; the forwarder makes a platform-specific block a one-line log find. Store embeds and
login windows are remote-URL native webviews — outside this policy by construction.

## Side observation, not acted on

`gamelib.log` carries `[ERROR]: [Frontend]: null` once per launch: the pre-existing
`window.addEventListener('error', ev => logError(ev.error))` fires for the benign
"ResizeObserver loop completed with undelivered notifications" window error, whose `.error` is
null. Predates this task; noise, not a defect in this scope.
