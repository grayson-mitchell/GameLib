# Phase 67: Schema validation at the sidecar IPC boundary - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 14 new/modified file groups
**Analogs found:** 12 / 14 (2 partial: generator freshness gate has no in-repo precedent; Rust generated-struct code has no precedent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/sidecar/ipcValidation.ts` (new) | utility (validator) | request-response | `sidecarRpc.ts` dispatch + `rendererPathGuard.ts` | role-match |
| `src/backend/sidecar/sidecarRpc.ts` (modify `dispatchInvoke`/`dispatchSend`) | dispatcher | request-response | itself (`UNPORTED_CHANNEL_MARKER` branch) | exact |
| `src/common/types/sidecarTransport.ts` (add `IPC_INVALID_ARGS_MARKER`) | config/constants | n/a | `UNPORTED_CHANNEL_MARKER`, `STORE_LAZY_MISS_MARKER` (:664, :740) | exact |
| `src/preload/ipc.ts` `makeHandlerInvoker` (modify) + `src/preload/ipcValidationError.ts` (new) | utility | request-response | `makeHandlerInvoker` + `src/frontend/bootErrorSurface.ts` marker detection | role-match |
| `src/common/types/ipc/<domain>.ts` (29 files, convert) + `sidecarInternal.ts`, `channelSchemas.ts` (new) | model (schema) | request-response | `ipc/shellFiles.ts` (current interface form), RESEARCH Pattern 1 | role-match |
| `src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` (new) | test (ratchet) | batch | `flowRegistrationCensus.test.ts` `EXPECTED` table | exact |
| `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` (modify parser) | test | batch | itself `parseDomainFile` (:129-145) | exact |
| `src/backend/sidecar/__tests__/transportParity.test.ts` (retire) | test | batch | itself | exact |
| `src/backend/sidecar/__tests__/ipcValidation.test.ts` (new) | test | request-response | `storeEmbedFlows.test.ts` (real `startRpcServer` over PassThrough) | role-match |
| `meta/genIpcContract.ts` (new) + `meta/__tests__/genIpcContract.test.ts` | utility (generator) | transform | `meta/gen_vtables.ts` | role-match |
| `package.json` scripts `gen:ipc-contract`, `check:ipc-contract` | config | n/a | `gen-vtables` (:73), `check:build-bin-mirror` (:61) | exact |
| `.github/workflows/codecheck.yml`, `.husky/pre-commit` (modify) | config | n/a | `typecheck:indexed-access` step; pre-commit staged-content block | role-match |
| `src-tauri/src/ipc_contract.rs` (new, generated) | model/config | transform | `sidecar.rs:1-23` consts; `clipboard.rs:16-20` arg helper | partial |
| `src-tauri/src/relay_commands.rs`, `sidecar.rs`, `store_embed.rs` (modify) | controller | request-response | themselves; `clipboard.rs` pure-fn + `mod tests` | role-match |
| 15 zod files (port to zod 4) | model | n/a | themselves | exact |

## Pattern Assignments

### `src/backend/sidecar/sidecarRpc.ts` + `ipcValidation.ts` (dispatcher, request-response)

**Analog:** `src/backend/sidecar/sidecarRpc.ts` lines 185-228 (insert validation here, do NOT wrap in `ipcMain.handle`).

**Typed-error-on-the-wire pattern** (lines 185-200) — copy for `IPC_INVALID_ARGS`:
```typescript
async function dispatchInvoke(request: SidecarRpcRequest): Promise<void> {
  const handler = handlerRegistry.get(request.channel)
  if (!handler) {
    const response: SidecarRpcResponse = {
      id: request.id,
      ok: false,
      error: `${UNPORTED_CHANNEL_MARKER} No handler registered for channel '${request.channel}'`
    }
    writeLine(response)
    return
  }
  try {
    const result = await handler(undefined, ...request.args)
    const response: SidecarRpcResponse = { id: request.id, ok: true, result }
    writeLine(response)
  } catch (error) { /* ok:false, error: message */ }
}
```
Insert `validateInbound` between the lookup and the `try`; the reject response reuses `{id, ok:false, error: "<MARKER> <json>"}`.

**Send path** (lines 215-228): `dispatchSend` has no response; fail-soft logging uses `process.stderr.write` here. Validation at the top (before the listener loop); log channel + paths + codes only (D-10), via `logWarning` or the same stderr style. stdout is the RPC pipe, never log there.

**Registry reader (why dispatch not `handle()`)**: `src/backend/platform/index.ts:161-190`: `ipcMain.handle` is only `handlerRegistry.set(channel, handler)`; `on` pushes to `listenerRegistry`. Tests read these maps directly with loose args.

**Handler-level guards that stay** (D-05): `rendererPathGuard.assertCommandParts` (`wineToolsFlowRegistration.ts:85` import), `Path.parse(args[0] as string)` in `shellFilesFlowRegistration.ts:319` ("must never be swapped"), and ad hoc `typeof` checks in `runnerAuthFlowRegistration.ts:143,164`:
```typescript
if (typeof sid !== 'string' || sid.length === 0) {
  logWarning('[runnerAuthFlowRegistration] login rejected: sid must be a non-empty string', LogPrefix.Backend)
  return { status: 'failed', data: undefined }
}
```
Note: these are the "already validating" registrations; they are shape checks inside handlers, not zod schemas at the boundary. `runnerAuthFlowRegistration` and `wineTools` do NOT import zod; only `shellFiles` pulls zod indirectly via `backend/schemas.ts` `Path`. There is no existing in-registration zod tuple pattern to copy; use RESEARCH Pattern 1/2.

### `src/common/types/sidecarTransport.ts` (marker constant)

**Analog:** lines 664 and 740.
```typescript
export const UNPORTED_CHANNEL_MARKER = '[GAMELIB_UNPORTED_CHANNEL]' as const
export const STORE_LAZY_MISS_MARKER = '[GAMELIB_STORE_LAZY_MISS]' as const
```
Add `IPC_INVALID_ARGS_MARKER = '[GAMELIB_IPC_INVALID_ARGS]'` with a doc comment in the same style. Wire is string-only end to end (Rust reads `error` via `as_str()`), so a marker+JSON tail needs no Rust change. `RUST_INVOKE_CHANNELS` (line ~586) stays the source for the generator.

### `src/preload/ipc.ts` (`makeHandlerInvoker`) and `ipcValidationError.ts` (renderer typed error)

**Analog:** `src/preload/ipc.ts` lines 27-31:
```typescript
function makeHandlerInvoker<ChannelName extends keyof AsyncIPCFunctions>(channel: ChannelName) {
  return (...args: Parameters<AsyncIPCFunctions[ChannelName]>) => {
    return tauriInvoke(channel, args) as PromiseOnce<ReturnType<AsyncIPCFunctions[ChannelName]>>
  }
}
```
Add `.catch` that detects the marker with `String(err).includes(IPC_INVALID_ARGS_MARKER)`, parses the JSON tail, rethrows `IpcValidationError`. Use `import type` from `common/types/ipc` only; importing the marker constant from `sidecarTransport` is a value import of a zod-free file, which is fine.

**Marker-detection analog:** `src/frontend/bootErrorSurface.ts:26-49` (`const UNPORTED_CHANNEL_MARKER = '[GAMELIB_UNPORTED_CHANNEL]'` ... `message.includes(UNPORTED_CHANNEL_MARKER)`). Verify it does not catch the new marker (RESEARCH Open Question 4).

**Send-path recursion guard** to preserve: `src/preload/tauriTransport.ts:105-115`:
```typescript
export function send(channel: string, args: unknown[]): void {
  tauriInvoke(SIDECAR_SEND, { channel, args }).catch((err: unknown) => {
    if (channel === 'logError') {
      console.error(`[tauriTransport.send] rejected for channel=logError:`, err)
      return
    }
    const w = globalThis as unknown as { api?: { logError?: (msg: string) => void } }
    w.api?.logError?.(`[tauriTransport.send] rejected for channel=${channel}: ${String(err)}`)
  })
}
```
A relay allow-list reject on `sidecar_send` flows through here. Preload prettier uses `src/preload/.prettierrc` (printWidth 120).

### `src/common/types/ipc/<domain>.ts` (schema + derived types)

**Analog (current form to convert):** `src/common/types/ipc/shellFiles.ts` lines 1-30 — `export interface ShellFilesSync { openExternalUrl: (url: string) => void ... removeFolder: ([path, folderName]: [string, string]) => void ... }` and `export interface ShellFilesAsync { checkDiskSpace: (folder: string) => Promise<DiskSpaceData> ... }`.

Target shape: RESEARCH Pattern 1 (schema object per kind + `ReturnsMap` interface + mapped type using `z.input<>`). Use `import type` for everything that is not the schema construction; never value-import these files from `src/frontend`/`src/preload`.

**Census parser coupling** — `ipcDomainCensus.test.ts:129-145` keys off `export interface <Name>` blocks:
```typescript
const re = /^export interface (\w+) \{\n([\s\S]*?)^\}/gm
...
const kind = DETECT_ORDER.find((k) => name.endsWith(k))
...
const k = /^ {2}('[^']+'|[A-Za-z_]\w*)\??:/.exec(line)
```
Converting to mapped `type` aliases makes this count zero keys silently. Either keep a thin `export interface X extends MappedType {}` (parser would still see zero keys) or update the parser to read schema-object keys, with a floor assertion.

### `src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` (ratchet test)

**Analog:** `flowRegistrationCensus.test.ts` lines 40-60 (in-file `EXPECTED` table with "update this table in the SAME commit"):
```typescript
/**
 * Actual registrations per module, counted from source. Update this table in
 * the SAME commit that adds or removes a channel ...
 */
const EXPECTED: Record<string, { invoke: number; send: number }> = { ... }
```
Use an equality `CEILING = { invoke, send, testOnly, push }` (RESEARCH "Census ceiling test" sketch: `await import('backend/platform')`, `await import('backend/sidecar/handlers')`, compare `handlerRegistry.keys()` to `channelSchemas`). Add the mutation proof and the "no extra keys in channelSchemas" guard. Secondary style references: `meta/indexedAccessRatchet.cjs` + `meta/indexedAccessBaseline.json` (CI step "Check noUncheckedIndexedAccess ratchet"), `meta/lintScoped.cjs` equality ceilings. At zero, delete buckets and assert `[]`.

### `src/backend/sidecar/__tests__/transportParity.test.ts` (retire)

**Analog (what it pins):** `transportParity.test.ts:1-60` — `// transport-mirror: NAME` marker extraction over `src-tauri/src/*.rs`, `TS_VALUES` for five constants, `extractDispatchArms` of `dispatch_rust_channel` vs `RUST_INVOKE_CHANNELS`. Retire per mirror as `ipc_contract.rs` emits it; marker sites are `sidecar.rs:4-23` (`READY_SENTINEL`, `FRONTEND_MESSAGE_EVENT`, `SHELL_WINDOW_FOCUSED`, `STORE_SNAPSHOT_CHANNEL`) plus the `kind == Some("rustInvoke")` comparison (~:492). Keep the arm-set test until `dispatch_rust_channel` matches on the generated enum.

### `meta/genIpcContract.ts` (generator, transform)

**Analog:** `meta/gen_vtables.ts` — module-header doc stating inputs/outputs, "Generated source is COMMITTED", run via `pnpm gen-vtables`; imports `node:fs` (`existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync`) and `node:path`. Script wiring: `package.json:73`
```json
"gen-vtables": "node meta/runTs.cjs --bundle --platform=node --target=node21 meta/gen_vtables.ts",
```
and `package.json:61` `"check:build-bin-mirror": "node meta/runTs.cjs --bundle --platform=node --target=node22 meta/checkBuildBinMirror.ts"`. New scripts: `gen:ipc-contract` (write) and `check:ipc-contract` (regenerate in memory, compare to the checked-in file, exit non-zero with a `::error::` line on diff — see `meta/genI18nGateScope.ts` for `::error::` + `process.exit(1)` style and the `RECOGNISED_FLAGS` "typos must fail loudly" flag parsing at :219-240). Prefer one script with a `--check` flag (like `--rewrite-scope`) over two entry points. Pure functions exported, CLI at the bottom, tested in `meta/__tests__/genIpcContract.test.ts` (any spawned CLI uses `createFakeHomeProfile()`).

**No in-repo "is fresh" CI precedent.** `gen-vtables` is not run in CI at all (grep of `.github` found nothing). The freshness gate is new; wire it like the `typecheck:indexed-access` step in `.github/workflows/codecheck.yml:28-33` (a named `- name:` step running `pnpm ...` after `pnpm codecheck`).

### `.husky/pre-commit` (modify)

**Analog:** the existing hook (header explains reading staged content via `git show :$f`, `--check` not `--write`, hang risk with empty path list). Add a path-filtered `pnpm check:ipc-contract` only when a staged path matches `common/types/ipc/`, `sidecarTransport.ts`, `meta/genIpcContract.ts`, or `src-tauri/src/ipc_contract.rs`. Note the hook reads the working tree for a generator run, which differs from its staged-content philosophy; document that.

### `src-tauri/src/ipc_contract.rs` (generated) and Rust arm conversion

**Analog for consts to replace:** `src-tauri/src/sidecar.rs:1-23`:
```rust
use super::*;
// transport-mirror: READY_SENTINEL
const READY_SENTINEL: &str = "__GAMELIB_SIDECAR_READY__";
// transport-mirror: FRONTEND_MESSAGE_EVENT
const FRONTEND_MESSAGE_EVENT: &str = "frontend_message";
// transport-mirror: SHELL_WINDOW_FOCUSED
pub(crate) const SHELL_WINDOW_FOCUSED: &str = "shellWindowFocused";
// transport-mirror: STORE_SNAPSHOT_CHANNEL
pub(crate) const STORE_SNAPSHOT_CHANNEL: &str = "sidecar:store-snapshot";
```
Files in `src-tauri/src` use `use super::*;` (single-crate module style); generated file should follow, with a do-not-edit header.

**Analog for generated `from_args`:** `src-tauri/src/clipboard.rs:16-20`, with its pinned error string:
```rust
pub(crate) fn clipboard_text_arg(args: &[Value]) -> Result<&str, String> {
    args.first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| "clipboard_write_text:bad-args".to_string())
}
```
Generated `from_args` must return the same `"<channel>:bad-args"` strings (pins: `keyring:bad-args`, `store_embed_open:bad-args[:url|:x|:y]`, `humble_login_cookies_for_domain:bad-args`; `tauriShellSource.test.ts` greps these lines). Pure-fn + `#[cfg(test)] mod tests` shape: `clipboard.rs:7-11` comment, `native_gamepad_shape.rs:249`, `epic_embed_state.rs:187`, `main.rs:1854` host test modules. Relay allow-list unit test as a pure fn (no `State`): `relay_commands.rs` has no tests today.

**Dispatch arm to convert:** `store_embed.rs:1810` `pub(crate) fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> { match channel { "keyring_get" => { let account = keyring_account(keyring_slot_arg(args, 0))?; ...` — string arms with hand parsing; migrate in batches (RESEARCH sequencing hazard).

**Relay insertion points:** `relay_commands.rs:5-17`:
```rust
#[tauri::command]
pub(crate) async fn sidecar_invoke(channel: String, args: Vec<Value>, state: State<'_, Arc<SidecarState>>) -> Result<Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.invoke(channel, args)).await.map_err(|e| e.to_string())?
}
```
Put `is_renderer_channel(&channel)` first (return `Err("[GAMELIB_IPC_INVALID_CHANNEL] ...")`); same in `sidecar_send`, logging the channel name only via `shell_eprintln!`.

## Shared Patterns

### Never log argument values (D-10)
**Source:** RESEARCH Pattern 2 `validateInbound` sketch; existing credential-safe logs in `runnerAuthFlowRegistration.ts:140-150` ("Never logs the payload value"). **Apply to:** `ipcValidation.ts`, `dispatchSend`. Log channel + issue path + issue code only; check `meta/logSecretGate.ts`.

### Positional JSON round-trip
**Source:** RESEARCH Pattern 4. **Apply to:** every renderer-to-sidecar tuple schema. `optionalArg = schema.nullish()`; tests use `safeParse(JSON.parse(JSON.stringify(args)))`.

### Handler-level semantic guards retained
**Source:** `rendererPathGuard.ts` (`assertContainedPath`, `assertPlausibleAbsolutePath`, `assertCommandParts`), `Path.parse` in `shellFilesFlowRegistration.ts:319`. **Apply to:** all converted domains; schemas only add shape checks in front.

### Ratchet-in-same-commit
**Source:** `flowRegistrationCensus.test.ts` header; `indexedAccessBaseline.json` workflow comment in `codecheck.yml`. **Apply to:** every channel-conversion plan lowers the `CEILING` constant in the same commit.

### Verify step
**Source:** `Skill("gamelib-conventions")`. **Apply to:** every task `<verify>`: `npx prettier --check` over exact written paths after `--file-info`; `.rs` is prettier-ignored so omit for Rust-only tasks; use `src/preload/.prettierrc` width for preload files.

### Sidecar exit contract
**Apply to:** `ipcValidation.ts`: synchronous `safeParse`, lazy schema construction, no boot-time work, no timers.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Generated-file freshness gate (`check:ipc-contract` CI + hook step) | CI gate | batch | `gen-vtables` output is committed but never checked for staleness in CI; follow the `indexed-access` CI step shape and `genI18nGateScope.ts` error/exit style |
| Generated serde-style arg structs + `RustInvokeChannel` enum | model | transform | No generated Rust exists besides `native/steam-bridge/generated/*.c`; use RESEARCH "Codegen" section and `clipboard.rs` hand-written `*_arg` helpers as the output style target |
| In-registration zod tuple schemas | model | request-response | No `*FlowRegistration.ts` validates with a zod tuple today (only `Path.parse` and `typeof` checks); use RESEARCH Pattern 1 |
| Renderer `IpcValidationError` | utility | request-response | No typed-error class exists in `src/preload`; marker detection by substring is the only precedent (`bootErrorSurface.ts`) |

## Metadata

**Analog search scope:** `src/backend/sidecar`, `src/backend/platform`, `src/common/types`, `src/preload`, `src/frontend/bootErrorSurface.ts`, `meta/`, `src-tauri/src`, `.github/workflows`, `.husky`, `package.json`
**Files scanned:** about 30 read or grepped
**Pattern extraction date:** 2026-11-07
