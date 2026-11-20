---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
reviewed: 2026-11-08T00:00:00Z
depth: standard
files_reviewed: 69
files_reviewed_list:
  - .github/workflows/codecheck.yml
  - .husky/pre-commit
  - meta/genIpcContract.ts
  - src-tauri/src/clipboard.rs
  - src-tauri/src/login_window.rs
  - src-tauri/src/main.rs
  - src-tauri/src/relay_commands.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/store_embed.rs
  - src/backend/crossover_index/schema.ts
  - src/backend/discounts/index.ts
  - src/backend/humble/adapter.ts
  - src/backend/logger/uploader.ts
  - src/backend/platform/index.ts
  - src/backend/scanners/rustScan.ts
  - src/backend/shortcuts/ipc_handler.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/sidecar/eosOverlayFlowRegistration.ts
  - src/backend/sidecar/ipcValidation.ts
  - src/backend/sidecar/shortcutsFlowRegistration.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/storeManagers/legendary/commands/base.ts
  - src/backend/storeManagers/legendary/eos_overlay/ipc_handler.ts
  - src/backend/storeManagers/steam/bridge/allowlist.ts
  - src/backend/testUtils/ipcDomainParse.ts
  - src/backend/testUtils/ipcSchemaFixtures.ts
  - src/backend/testUtils/tauriShellSource.ts
  - src/backend/utils/ipc_handler.ts
  - src/backend/wiki_game_info/ipc_handler.ts
  - src/backend/wine/manager/ipc_handler.ts
  - src/common/knownFixReport.ts
  - src/common/types/ipc/appShell.ts
  - src/common/types/ipc/channelSchemas.ts
  - src/common/types/ipc/clipboard.ts
  - src/common/types/ipc/dialog.ts
  - src/common/types/ipc/downloadQueue.ts
  - src/common/types/ipc/engine.ts
  - src/common/types/ipc/enrichment.ts
  - src/common/types/ipc/eosOverlay.ts
  - src/common/types/ipc/gameDetails.ts
  - src/common/types/ipc/gog.ts
  - src/common/types/ipc/humble.ts
  - src/common/types/ipc/humbleLogin.ts
  - src/common/types/ipc/install.ts
  - src/common/types/ipc/legendary.ts
  - src/common/types/ipc/logger.ts
  - src/common/types/ipc/mainProcess.ts
  - src/common/types/ipc/oauthLogin.ts
  - src/common/types/ipc/runnerAuth.ts
  - src/common/types/ipc/runnerMisc.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/common/types/ipc/schemaTypes.ts
  - src/common/types/ipc/settings.ts
  - src/common/types/ipc/shellFiles.ts
  - src/common/types/ipc/shortcuts.ts
  - src/common/types/ipc/sidecarInternal.ts
  - src/common/types/ipc/steam.ts
  - src/common/types/ipc/steamAuth.ts
  - src/common/types/ipc/storeEmbed.ts
  - src/common/types/ipc/testStubs.ts
  - src/common/types/ipc/window.ts
  - src/common/types/ipc/wineTools.ts
  - src/common/types/sidecarTransport.ts
  - src/frontend/bootErrorSurface.ts
  - src/frontend/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/preload/ipc.ts
  - src/preload/ipcValidationError.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 67: Code Review Report

**Reviewed:** 2026-11-08
**Depth:** standard
**Files Reviewed:** 69
**Status:** issues_found

## Summary

The boundary design is sound. Rejection logs carry only the channel, sanitised paths and issue codes. `validateInbound` fails closed on unknown channels and uses `hasOwnProperty`, so `__proto__` is safe. The Rust allow-list is built from the inbound-keyed map, so a push name cannot open a renderer direction. As a cross-check, every channel the preload factories name (232) is on `RENDERER_CHANNELS`, apart from the intentionally local `createNewWindow`. Phase 67 adds no sidecar timers, sockets or boot work. `ipcValidation` is synchronous and `bootstrap` only installs a sink.

One true false rejection was found (Wine/Proton version objects). Several defense-in-depth gaps and one latent generator divergence follow.

## Critical Issues

### CR-01: `installWineVersion` / `removeWineVersion` reject legitimate network-derived Wine version objects (missing `checksum`, `download`, `downsize`)

**File:** `src/common/types/ipc/wineTools.ts:42-65` (`checksum` at line 59)
**Issue:** `wineVersionInfo` is a `z.strictObject` that requires `download`, `downsize`, `checksum` and `release_notes_link` as present, non-optional values. These objects are built from GitHub release JSON in `src/backend/wine/manager/downloader/utilities.ts:fetchReleases`. That code starts from `{} as VersionInfo` and only sets fields when a matching asset exists. The `Wine-Staging-macOS` branch never sets `checksum`. `Wine-Lutris`, `Wine-Kron4ek`, Wine-Crossover and Game-Porting-Toolkit only set it if a `*sha512sum` asset exists. `download` and `downsize` are absent when no matching asset is found. `downloader/main.ts:205` and `:305` explicitly handle a missing checksum ("No checksum provided"), so the absent case is a supported state.

Absent keys are dropped by JSON serialisation (`undefined`) and stay absent in the persisted `wineDownloaderInfo`. The renderer then sends an object with no `checksum` key. Zod rejects it with `invalid_type` at `0.checksum`, and the handler never runs. The affected types include Wine-Staging-macOS, the pinned macOS engine named in the project memory. Users cannot install or remove those versions. Remove is affected the same way, since it re-sends the stored info.
**Fix:**
```ts
const wineVersionInfo = z.strictObject({
  version: nonEmptyString(1024),
  type: z.enum([/* unchanged */]),
  date: z.string().max(256),
  download: z.string().max(8192).optional(),
  downsize: z.number().optional(),
  disksize: z.number(),
  checksum: z.string().max(1024).optional(),
  release_notes_link: z.string().max(8192),
  isInstalled: z.boolean(),
  hasUpdate: z.boolean(),
  installDir: z.string().max(4096)
})
```
Then align the call-site cast so the derived type still satisfies `WineVersionInfo`. Alternatively, move to `phase70Passthrough` for this network-derived object, as was done for `GameInfo`. Add a fixture test built from `fetchReleases` output for each `Type`, including one with no checksum asset.

## Warnings

### WR-01: `validateInbound` ignores `kind`, and push entries are used as inbound schemas (fail-closed gap)

**File:** `src/backend/sidecar/ipcValidation.ts:41-52` (`void kind` at line 50); `src/common/types/ipc/channelSchemas.ts:155-165`
**Issue:** `channelSchemas` merges non-colliding push entries into the same map the sidecar validates inbound frames against. `validateInbound` looks up by name and then discards `kind` and `entry.kind`. Consequences:
1. Suppose a new inbound handler or listener is registered whose name equals an existing push-only name, and its inbound schema is forgotten. It is validated against the push schema, which is typing-only (`z.custom<...>()` and `z.string()`), and passes. This silently defeats the `no_schema` fail-closed guarantee that the file header (D-08/D-09) claims.
2. An invoke-kind name arriving as `send` (or the reverse) is validated against the other direction's schema.

The Rust allow-list does filter by kind, but only the Rust half, and only for renderer frames.
**Fix:** Reject on mismatch before parsing:
```ts
if (!entry || entry.kind === 'push' || entry.kind !== kind) {
  return { ok: false, channel, paths: ['(channel)'], codes: [entry ? 'wrong_kind' : 'no_schema'] }
}
```
Better, have `channelSchemas` hold only inbound entries and serve pushes through `pushSchemaFor`. Verify that shell-originated frames such as `sidecar:store-snapshot` keep the kind the shell actually sends. Also add a test for each direction.

### WR-02: Unsanitised channel name written to stderr and `gamelib.log` (log forging)

**File:** `src/backend/sidecar/ipcValidation.ts:44-47` and `:79-84`
**Issue:** On the `no_schema` path `verdict.channel` is the raw `request.channel`, with no length cap and no control-character filtering. `formatRejectionLog` interpolates it into a line that goes to `process.stderr` and the uploaded `gamelib.log`. A channel containing `\n[sidecarRpc] ...` forges log lines. The Rust relay's `echo_channel` already treats this as a threat (T-67-61), and the sidecar half of the same defence is missing. It also echoes the channel back verbatim in the `IPC_INVALID_ARGS` wire error, which can be up to the 10 MiB line limit. It is only reachable if something bypasses the relay allow-list, so this is defense in depth.
**Fix:** Apply the same filter as Rust (`slice(0, 64)`, then replace `/[^\x21-\x7e ]/g` with `?`) when building the verdict for unknown channels, and use the sanitised value in both the log line and the wire payload.

### WR-03: Oversized renderer log messages are dropped whole; rejection logging is not rate-limited

**File:** `src/common/types/ipc/logger.ts:15-27`; `src/backend/sidecar/ipcValidation.ts:75-87`
**Issue:** `logText` is capped at 64 KiB with `.max()`, and the array arm at 256 entries. A longer legitimate message, such as a stack plus context or a JSON probe payload, is rejected as a whole. The diagnostic the renderer was trying to record is replaced by a one-line rejection naming only the channel and `too_big`. Separately, `logRejection` has no throttle. A hot send channel, for example `storeEmbedSetBounds` per ResizeObserver tick (NaN becomes `null` over JSON and fails `z.number()`), or a looping `logError`, writes one stderr and `gamelib.log` line per frame without bound.
**Fix:** Do not reject on length for logger channels. Either remove `.max()` from `logText` and truncate in the handler, or accept `z.string()` and slice in `logger/ipc_handler.ts`. Add a per-channel counter or time window in `logRejection` (for example, log the first N, then every Nth with a suppressed count). Do not add a timer for this; use a counter against `Date.now()`.

### WR-04: Strict `WineInstallation` on persisted-config-derived callers

**File:** `src/common/types/ipc/schemaTypes.ts:62-71`, used at `install.ts:92`, `steamAuth.ts:85,115`, `wineTools.ts:109`
**Issue:** `wineInstallationArg()` is `strictObject` and `.optional()` rejects `null`. In `SideloadDialog` the value is `wineVersion || gameSettings.wineVersion`, which is taken from the persisted per-game config JSON. `settings.ts` explicitly makes its `writeConfig` payload loose because persisted `wineVersion` can carry legacy or extra keys (67-13). The same persisted object reaches `importGame.wineVersion` and `persistBottleWineVersion` here, strictly. Any stored extra key (older configs, or `lib: null`) makes the import or bottle persist fail with `unrecognized_keys` / `invalid_type`. I did not find a concrete extra key in this repo. Confidence is medium.
**Fix:** Use `z.looseObject` (or `phase70Passthrough`) for `wineInstallationArg()`, and `.nullish()` on `lib`, `lib32` and `wineserver`. Keep `bin` and `type` required.

### WR-05: Generated `from_args` for a leading `.optional()` positional rejects `null`, contradicting the schema comment

**File:** `meta/genIpcContract.ts:408-412` (emitted at `src-tauri/src/ipc_contract.rs:479`); `src/common/types/ipc/rustInvoke.ts` header ("`.optional()` maps to serde `Option` (absent and null both read as None)")
**Issue:** For optional positionals the generator emits `args.get(i).map(|v| serde_json::from_value(v.clone())).transpose()`. The target type is inferred as `T`, not `Option<T>`. A JSON `null` therefore fails to deserialise as `String`, giving `keyring:bad-args`. Only the absent case is `None`. That contradicts the stated contract. The old hand-written `keyring_slot_arg` read an explicit null as the default slot, though I could not recover its exact body from history. All current sidecar call sites pass a defined slot, so nothing breaks today. But JSON turns a positional `undefined` into `null`, which is the exact hazard `optionalArg` documents in `schemaTypes.ts`. The first caller that passes `[undefined]` hits it. This is a Rust/zod divergence: zod `.optional()` also rejects null, but the comment says otherwise.
**Fix:** Emit `args.get(i).filter(|v| !v.is_null()).map(...)` for optional positionals, or `serde_json::from_value::<Option<T>>`. Use `.nullish()` in `rustInvoke.ts` for slot and update the comment. Add a generator test for `[null]`.

## Info

### IN-01: Test-only and dev-only channels are on the production renderer allow-list

**File:** `meta/genIpcContract.ts:455-466`; `src-tauri/src/ipc_contract.rs` (`setLegendaryCommandStub`, `resetLegendaryCommandStub`, the gogdl and nile equivalents, `devSweepEpicCookieDomain`)
**Issue:** `rendererChannelNames` filters on `caller` and `kind` only, not `testOnly`. The stub listeners register only under `CI=e2e` and the dev sweep handler only in unpackaged builds, so the sidecar would answer `unported` or drop. However, the relay is meant to be the narrowest layer and currently opens names that should not exist in a release build.
**Fix:** Exclude `testOnly` entries in `rendererChannelNames`, and give `devSweepEpicCookieDomain` a non-renderer caller or a dev-only cfg.

### IN-02: Generated argument structs derive `Debug` over secret-bearing fields

**File:** `meta/genIpcContract.ts:277-300`, `:430`; `ipc_contract.rs` (`KeyringSetArgs.secret`, `HumbleRevealPostArgs.csrf_token` / `body`)
**Issue:** Every args struct derives `Debug`. I found no current `{:?}` of an args value. A future `shell_eprintln!("{a:?}")` would print the keyring secret or CSRF token, against D-10.
**Fix:** Skip `Debug` for structs containing credential fields, or emit a redacting manual impl driven by an `x-secret` annotation.

### IN-03: Issue paths can include record/map key names

**File:** `src/backend/sidecar/ipcValidation.ts:26-34`
**Issue:** The header says unrecognised key names are never read. But `z.record` failures (`storeNew` options) and `z.json()` nested failures put the data-dependent key into `issue.path`. The `[A-Za-z0-9_-]` filter and the 64-character cap bound this, but a key name is still user data in an uploadable log. Impact is low.
**Fix:** Redact segments that come from record keys, for example emit `?` for any non-numeric segment under a schema known to be a record, or log only the depth.

### IN-04: Dead parameter, and the schema-first `bootErrorSurface` swallow

**File:** `src/backend/sidecar/ipcValidation.ts:50` (`void kind`); `src/frontend/bootErrorSurface.ts` (`invalid-args` branch)
**Issue:** `kind` is accepted but unused (see WR-01). A boot-time `invalid-args` rejection is downgraded to `console.warn` and boot continues, so a schema rejection on a boot-critical call, for example `requestAppSettings`, yields undefined state with only a console line. This is consistent with the existing `unported` handling but hides regressions of CR-01's kind.
**Fix:** Use `kind` per WR-01. For `invalid-args` at boot, also route a one-line `logError` of the channel and paths so the failure reaches `gamelib.log`.

---

_Reviewed: 2026-11-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
