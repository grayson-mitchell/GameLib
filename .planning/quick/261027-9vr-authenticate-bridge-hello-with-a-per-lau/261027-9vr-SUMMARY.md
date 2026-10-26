---
phase: quick-261027-9vr
plan: 01
status: complete
requirements: [WR-03]
commits:
  - bad35fc50  # Task 1 backend
  - 36f015607  # Task 2 helper
  - 26d37a064  # fix: logSecretGate
  - 50c3024cc  # Task 3 shim generator + regenerated shim
---

# Quick 261027-9vr: Authenticate bridge HELLO with a per-launch secret (WR-03)

Closes Phase 55 WR-03. The helper's callback ring (which can hold a web-API auth ticket, callback 168) is now bound to an authenticated launch, not to a socket. Any local client that has not sent HELLO carrying the helper's per-spawn secret gets STATUS_ERR for DRAIN and every other slot except HEALTH/HELLO.

## What changed

- **Backend** (`protocol.ts`, `helperProcess.ts`, `bridgeConfig.ts`, `games.ts`): a 256-bit `randomBytes` secret per helper spawn, stored on the `BridgeHelperEntry`. It goes to the helper via env only (`GAMELIB_BRIDGE_SECRET`, merged onto `process.env` or the test override; argv unchanged). `ensureBridgeHelperReady` returns the secret of the probed entry (D-A) on `ready` and `fallback-identity`. `writeBridgeConfig` takes a required `secret`, validates `/^[0-9a-f]{64}$/` before any work, writes a `secret=` line after `appid=`, and writes each cfg 0600 (tmp written 0600, chmod'd, renamed). `games.ts` refuses launch when `secret` is missing. The readiness probe is now HEALTH, then HELLO(secret + role byte 0x01), then WHOAMI. A HELLO rejection returns `unreachable`, so an auth bug cannot trigger the 480 fallback.
- **Helper** (`bridge_helper.c`): reads and validates the env secret, then `unsetenv`s it. A per-connection `authenticated` flag is set only by a constant-time HELLO match. Unauthenticated connections get HEALTH and HELLO only. Every other CONTROL slot and all interface dispatch answer STATUS_ERR with an empty ret blob and the connection stays open. A mismatched HELLO de-authenticates the socket. The role byte suppresses the `HELLO  shim attached` evidence line. `AUTH refused` is capped at 16 lines per process. With no valid env secret the helper logs one `AUTH` line and refuses everything authenticated (fail closed). No ring clear was added on accept or close.
- **Shim** (`meta/gen_vtables.ts`, regenerated `steam_api_shim.c`): the cfg parser accepts `secret=` only as exactly 64 lowercase hex. `bridge_ensure_connected` refuses to connect without a secret and runs `bridge_handshake` on every fresh socket before publishing it, so idle SO_RCVTIMEO and WR-02 reconnects re-authenticate. Both explicit HELLO senders send the secret.

OD-4 audit confirmed: the only backend wire client is `probeHealthAndWhoami` (grep of `encodeControl|encodeRequest|CONTROL_SLOT` in non-test `src/`).

## Verification

- Task 1: `protocol`, `helperProcess`, `bridgeConfig`, `games`, `fakeHomeIsolation` jest suites pass (484 tests). `pnpm codecheck` and scoped prettier clean.
- Task 2: `pnpm build-steam-bridge` compiles the helper. `helperIntegration` passes against the real binary (17 tests): unauthenticated refusal, wrong/empty HELLO, matching HELLO then DRAIN, de-authentication, matching reconnect, probe role, no-secret and malformed-secret fail closed, 16-line cap. Ring gates: 0 lines zero/memset `g_cbq`; non-comment `gl_cbq_` count is 5 (unchanged baseline); `GAMELIB_BRIDGE_SECRET` appears once.
- Task 3: `pnpm gen-vtables` leaves `bridge_dispatch.h` unchanged; no `HELLO, NULL, 0` remains. Both shim DLLs, steamclient and the helper build. `gen_vtables`, `buildSteamBridgeShims`, `shimAbiGate`, `protocol`, `helperIntegration` suites pass. Codecheck and scoped prettier clean.
- Broader run of `meta/__tests__`, `src/backend/storeManagers/steam`, `src/backend/__tests__`: 5637 passed, 6 failed (see Deferred Issues).

## Deviations from Plan

**1. [Rule 1 - Bug] logSecretGate flagged the new rejection log in `bridgeConfig.ts`.** The warning interpolated `secret.length`, and the gate flags any log call that reaches the identifier `secret`. Fixed by computing `launchSecretLen` first and logging `len=`. Commit 26d37a064.

**2. [Rule 3 - Blocking] The WR-04 test "shared socket and request id are touched only inside transport or with the lock held" failed.** `bridge_handshake` draws a request id outside the three pinned transport spans. Added `bridge_handshake` to that test's transport span list (it runs only from `bridge_ensure_connected`, under the lock). Included in the Task 3 commit.

**3. Integration test adjustment (plan ambiguity).** The plan said the real `ensureBridgeHelperReady` test should use the result's `secret`. In a fake HOME the result is `not-inited`, which (per D-A) carries no secret. That test now asserts HELLO with a wrong secret is refused (STATUS_ERR). The authenticated round-trip is covered by the direct-spawn tests. The unknown-ordinal test's follow-up frame is HEALTH instead of HELLO, since an unauthenticated HELLO now correctly fails.

## Deferred Issues

6 failures in 3 suites unrelated to this work (i18n / CLDR plural categories, translation lint/baseline, i18n fork-touched-files anti-rot). They concern `pluralCategoriesFor`, `lintTranslations`, `comparePresenceBaseline` and `genI18nGateScope`, none of which touch bridge code. I did not compare against a clean baseline, since stashing is prohibited, so "pre-existing" is an inference.

## Pending human-verify (non-blocking live gate, D-F)

On this Mac, after restarting `tauri dev` (check `sidecar.js` mtime), launch a Phase 55 GetAuthTicketForWebApi title through the bridge and confirm:
1. The helper log shows `HELLO  shim attached` and the game receives callback 168, including after an idle period long enough for the 5 s SO_RCVTIMEO reconnect.
2. A second client connecting to the LISTEN port and sending DRAIN without HELLO gets STATUS_ERR and the helper logs `AUTH refused`.
3. `stat -f %Lp` on every `gamelib_bridge.cfg` copy prints 600, and `ps eww` of the helper shows no secret in argv.

Todo `.planning/todos/pending/2026-10-26-bridge-helper-callback-ring-drainable-by-any-local-process.md` is for the orchestrator to move to `completed/`; not moved here.

## Known Stubs

None.

## Threat Flags

None. All threats in the plan's register (T-9vr-01 through T-9vr-09) are covered as planned; T-9vr-08 (same-user attacker) is accepted and documented in code comments.

## Self-Check: PASSED

All four commits exist in `git log`. All 13 planned files were modified and committed by explicit path; unrelated working-tree edits were not staged.
