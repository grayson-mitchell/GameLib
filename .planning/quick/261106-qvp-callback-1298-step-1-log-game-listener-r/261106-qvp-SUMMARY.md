---
phase: quick-261106-qvp
plan: 01
status: complete
subsystem: steam-bridge
tags: [steam-bridge, callbacks, logging, D-09]
requirements: [D-09]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - meta/gen_vtables.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - .planning/todos/pending/2026-11-01-callback-1298-on-bridge-join-path.md
commits:
  - dc69dcf5b
  - 74140b1df
  - 023ef005d (task 3 todo commit)
---

# Quick 261106-qvp: Callback 1298 step 1, log game listener and cub

The helper's unlisted drop line now ends with `cub=<m_cubParam>`, and a new CONTROL slot 15 (`REPORT_CB_REGISTER`) logs `CBREG` lines for game registrations of unlisted callback ids and for manual-dispatch init. No relay row, struct layout or struct name was added.

## Registration observability

- C++ `CCallback` objects through the shim's `SteamAPI_RegisterCallback` (x64 and x86; the registry is shared): OBSERVABLE, logged `CBREG iCallback=<id> role=game path=register`.
- Manual dispatch (`SteamAPI_ManualDispatch_Init` / `RunFrame` / `GetNextCallback`, used by Steamworks.NET and Facepunch.Steamworks): NOT OBSERVABLE. The managed dispatcher keeps its listener table internally and never tells the shim which ids it wants. The shim logs one `CBREG role=game path=manual-dispatch registration=unobservable` line so the gate cannot mistake absence of `CBREG path=register` for "no listener".
- `SteamAPI_RegisterCallResult`: NOT LOGGED. It carries a call handle, not an id (`gl_cr_register(cb, h)`), and 1298 arrives as a broadcast callback, not a call result. The existing `callresult=` field on the unlisted line already says whether the helper's call-result table knows the id.
- DRM mode (genuine `steam_api64.dll` + GameLib `lsteamclient`, `role=game` trace): NOT OBSERVABLE. Registration lives in the genuine DLL's callback manager; lsteamclient only sees `Steam_BGetCallback` polling. No code change there; recorded as a notes line in the todo.
- Schedule I (3205720) is Unity/Mono with Steamworks.NET 2024.8.0, so it is expected to run in manual-dispatch mode. Question (1) is therefore expected to be answered by the static fallback step in the todo; question (2) is answered by `cub=` regardless of mode.

## Tasks

1. Helper plus protocol (dc69dcf5b): `cub=` on both unlisted literals, slot 15 handler (auth-gated, exact 8 bytes, shapes (path 0, id>0) or (path 1, id 0), listed ids silent, 32-id budget, md line once), `CONTROL_SLOT.reportCbRegister = 15`, tests (protocol parity, slot 15 integration, net harness `unlisted-cub`, 58-07 source pins updated).
2. Shim (74140b1df): registry records unlisted ids (cap 32) and md-init under the lock in `gl_cb_register` / `gl_md_init`, `gl_cbreg_flush()` at the start of `gl_cb_run_callbacks` and `gl_md_run_frame` reports with no lock held through embedder hook `gl_cb_report_register`; nothing transacts inside RegisterCallback. Regenerated `steam_api_shim.c`; .def files unchanged. Harness cases `cbreg_unlisted_reported`, `cbreg_listed_silent`, `cbreg_not_in_register`, `cbreg_cap`, `cbreg_md_once`.
3. Todo: `## Step 1 evidence` section with the notes line, the gate log reads and the static Steamworks.NET fallback (todo commit follows 74140b1df).

## Checks

- jest: protocol, helperIntegration, helperNetHarness, callbackRegistryHost, gen_vtables, shimGenerate all green (552 tests in the final combined run).
- `pnpm gen-vtables`, `pnpm build-steam-bridge`: OK. `pnpm codecheck`: clean. `pnpm planning-gates`: 12/12. prettier --check on written .ts paths: clean. `graphify update .` run.

## Deviations from Plan

**1. [Rule 1 - Bug in plan text] Log-line regexes**: the helper prints the category left-padded to 6 columns (`%-6s`), so `CBQ` and `CBREG` are followed by multiple spaces. Plan-text regexes such as ` CBREG iCallback=` would never match; the tests (and the todo) use `CBREG +iCallback=` / `CBQ +unlisted`. Emitted line text is as specified.

**2. Harness**: the plan's x64-only guard around `cbreg_md_once` was dropped because the host harness already exercises md cases unguarded.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Self-Check: PASSED
