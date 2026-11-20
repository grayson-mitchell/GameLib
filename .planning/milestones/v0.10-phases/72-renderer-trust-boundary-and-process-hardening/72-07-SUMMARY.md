---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 07
subsystem: tauri-shell
tags: [capabilities, tauri, opener, withGlobalTauri, hardening]
requires: [72-02, 72-04]
provides:
  - trimmed main-window capability (no opener/updater/shell-execute grants)
  - renderer external-link click handler routing through openExternalUrl
affects: [72-10, 72-12]
tech-stack:
  added: []
  patterns: [renderer delegated click handler replacing plugin-injected script]
key-files:
  created:
    - src/frontend/helpers/externalLinkClicks.ts
    - src/frontend/helpers/__tests__/externalLinkClicks.test.ts
  modified:
    - src/frontend/index.tsx
    - src-tauri/capabilities/default.json
    - src-tauri/tauri.conf.json
    - src-tauri/src/main.rs
    - src-tauri/src/relay_commands.rs
    - src/backend/__tests__/capabilitiesDefault.test.ts
    - src/backend/__tests__/tauriConf.test.ts
key-decisions:
  - "updater:default dropped on evidence: no JS/Rust-source caller of plugin-updater or UpdaterExt; Rust updater plugin stays registered (release signing)"
  - "opener registered via Builder with open_js_links_on_click(false); renderer handler replaces its injected script"
requirements-completed: [D-10, D-19]
duration: n/a
completed: 2026-11-08
---

# Phase 72 Plan 07: Capability trim and link routing Summary

Main-window capability trimmed of `opener:default`, `updater:default` and the scoped `shell:allow-execute`, `withGlobalTauri` turned off, and external link clicks rerouted through the validated `openExternalUrl` channel by a renderer handler.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Renderer link handler (`installExternalLinkClickHandler`, wired after `initShortcuts()`) | 7a2dfd329 |
| 2 | Trim capability, `withGlobalTauri: false`, opener Builder with `open_js_links_on_click(false)`, absence pins | bbb125096 |
| 3 | Live boot checkpoint (human-verify) | operator approved |

## Evidence (Task 2)

- No JS/Rust-source callers of `plugin-updater` / `UpdaterExt` / `plugin:updater` exist; only comments and tests mention them. The Rust updater plugin stays registered (the plan's expected registration grep pattern did not match `tauri_plugin_updater::`, but the registration is present and unchanged).
- No `window.__TAURI__` usage in `src`; only `__TAURI_INTERNALS__` is read.

## Live check (Task 3)

Operator replied "approved" to the live-boot checkpoint covering: `pnpm tauri:dev` boot with dev-vault; no ACL denials or unhandled rejections in the console; changelog links open in the default browser; window chrome; router navigation (react-router 7); locale switch (i18next-http-backend 4); Steam library load if signed in; optionally 72-06 open-folder/reveal. Recorded as a single operator approval; no per-step evidence beyond that.

## Deviations from Plan

None in code. Two pre-existing/adjacent failures in `tauriShellSource.test.ts` were logged to `deferred-items.md` (see that file): the REQ-34.3-11 finder-reveal pin (a 72-04 test regression, fixed by the orchestrator in b2e86b427) and the WR-07 `.title("Invite a friend")` literal at store_embed.rs ~2337 (pre-existing, out of scope).

## Threat coverage

T-72-24 to T-72-28 mitigated: grants removed and pinned absent, `withGlobalTauri` pinned false, live boot approved.

## Self-Check: PASSED

Commits 7a2dfd329 and bbb125096 exist; key files present.
