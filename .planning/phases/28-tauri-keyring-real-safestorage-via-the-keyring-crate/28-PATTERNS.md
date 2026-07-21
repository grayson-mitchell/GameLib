# Phase 28: Tauri keyring — real `safeStorage` via the `keyring` crate - Pattern Map

**Mapped:** 2026-07-22
**Files analyzed:** 7 (6 modified + 1 new-content-only; no wholly new top-level files per RESEARCH.md's "Recommended Project Structure")
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src-tauri/src/main.rs` (new `rustInvoke` reader branch + `dispatch_rust_channel` + `keyring` calls) | controller / dispatch (Rust) | request-response | `SidecarState::invoke` + `sidecar_invoke`/`open_external` commands, same file | exact (same file, mirrored direction) |
| `src-tauri/Cargo.toml` (+ `keyring` dep) | config | n/a | `.planning/spikes/011-electron-api-parity-in-tauri/parity-probe/Cargo.toml` | exact |
| `src/common/types/sidecarTransport.ts` (+ `rustInvoke` kind, + channel-name constants) | config / contract (types only) | request-response (shape definition) | same file, existing `SidecarRpcKind`/`SidecarRpcRequest`/`SidecarRpcResponse` | exact |
| `src/backend/sidecar/sidecarRpc.ts` (+ `requestRustInvoke`, + `rustPending` map, + frame disambiguation) | service / transport | request-response | same file's `requestOpenExternal` (emission shape) + Rust's `SidecarState::invoke` (pending-map/correlation shape) | exact (split across two existing analogs, both in scope) |
| `src/backend/storeManagers/steam/user.ts` (+ `TokenStore` interface, `ElectronTokenStore`, `SidecarKeyringTokenStore`) | service / abstraction seam | CRUD (token get/set/clear) | same file's `encryptionAvailable`/`encryptToken`/`decryptToken` (Electron impl body) + `libraryManagerMap`/`LibraryManager` interface pattern (`src/backend/storeManagers/index.ts`, `common/types/game_manager.ts`) for the interface-with-N-impls shape | role-match |
| `src/backend/sidecar/electronStub.ts` (`safeStorage` stub graduates from no-op to real dispatch) | utility / stub-to-real-API shim | request-response (delegates to transport) | same file's `shell.openExternal`/`ElectronStubTransport` forward-to-transport pattern (L145-148) | exact |
| `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` (new) | test | request-response (integration) | `src/backend/sidecar/__tests__/bootstrap.test.ts` | exact (framework + real-stream convention) |
| `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` (new) | test | CRUD (unit) | `src/backend/sidecar/__tests__/skeletonFlows.test.ts` (mocking convention: `jest.mock('../../storeManagers/steam/user')`-style automock + explicit real-vs-fake seam) + existing `src/backend/storeManagers/steam/__tests__/user.test.ts` | role-match |
| `src/backend/sidecar/__tests__/electronUntouched.test.ts` (new) | test | request-response + file-I/O (integration, real config dir) | `src/backend/sidecar/__tests__/skeletonFlows.test.ts` Test 4 (`sidecar:store-snapshot` — exact same "write real store, run sidecar, assert real store contents, `finally` cleanup" shape) | exact |

## Pattern Assignments

### `src-tauri/src/main.rs` — new `rustInvoke` reader branch + keyring dispatch (controller, request-response)

**Analog:** same file — `SidecarState::invoke` (L98-122) mirrored in the reverse direction, `start_reader()`'s existing two-branch dispatch (L237-313), and the four `#[tauri::command]`s (L125-179), especially `open_external` (L161-166) for the forward-to-native-facility shape.

**The gap this must also fix (verified, not hypothetical):** `start_reader()` currently has exactly two `if` branches — `value.get("ok").is_some()` (L271) and `kind == "frontendMessage"` (L296) — with **no trailing `else`**. Any frame matching neither (including today's `kind: "openExternal"` and tomorrow's `kind: "rustInvoke"`) is silently dropped. A third branch is a required task, not a side effect.

**Existing correlation-map pattern to mirror for the OPPOSITE direction** (`SidecarState`, L72-79, L96-122):
```rust
struct SidecarState {
    stdin: Mutex<ChildStdin>,
    /// id -> one-shot sender the reader thread fulfils when the matching response arrives.
    pending: Mutex<HashMap<String, Sender<Result<Value, String>>>>,
    counter: AtomicU64,
    _child: Mutex<Child>,
}

fn invoke(&self, channel: String, args: Vec<Value>) -> Result<Value, String> {
    let id = self.next_id();
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    { self.pending.lock().map_err(|e| e.to_string())?.insert(id.clone(), tx); }
    let req = SidecarRpcRequest { id: id.clone(), kind: "invoke", channel, args };
    if let Err(e) = self.write_frame(&req) { /* cleanup + return Err */ }
    match rx.recv_timeout(INVOKE_TIMEOUT) { /* resolve or time out */ }
}
```
The new direction needs NO `mpsc`/`pending` map on the Rust side — Rust is the *responder* here, not the requester. It only needs a **new reader branch** that parses `{id, kind:"rustInvoke", channel, args}`, dispatches synchronously on the reader thread (already off the async runtime — do not wrap in `tauri::async_runtime::spawn_blocking`, that pattern is only for `#[tauri::command]` bodies reached via the async runtime, per RESEARCH.md's Anti-Patterns), and writes `{id, ok, result|error}` back via a generalized `write_frame`/`write_raw` (currently `write_frame` takes `&SidecarRpcRequest` (L87-95) — generalize to accept a raw `serde_json::Value` too).

**Command-forwarding shape to mirror** (`open_external`, L161-166):
```rust
#[tauri::command]
fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
```
This is the "receive a request, call a native facility, map `Err` to `String`" shape `dispatch_rust_channel`'s `keyring_get`/`keyring_set`/`keyring_delete`/`keyring_available` arms should follow — `keyring::Error` maps to `.map_err(|e| e.to_string())` the same way `tauri_plugin_opener`'s error does.

**Proven keyring call shape to lift** (spike 011, `.planning/spikes/011-electron-api-parity-in-tauri/parity-probe/src/main.rs:90-96`, already compiled + run):
```rust
fn keyring_roundtrip(service: &str, account: &str, secret: &str) -> keyring::Result<String> {
    let entry = keyring::Entry::new(service, account)?;
    entry.set_password(secret)?;
    let got = entry.get_password()?;
    let _ = entry.delete_credential(); // clean up the probe secret
    Ok(got)
}
```
Production `keyring_get`/`keyring_set`/`keyring_delete` arms are this same `Entry::new` → method → `Result` shape, split into three separate calls (no combined round-trip + no `delete_credential` auto-cleanup after every `set`). Pitfall 3: do NOT reuse the spike's literal `service = "com.gamelib.spike011"` / `account = "steam-refresh-token"` — choose a stable production identifier.

**Reader-branch skeleton to add** (RESEARCH.md's own worked example, verified consistent with the current file's style):
```rust
if value.get("kind").and_then(|v| v.as_str()) == Some("rustInvoke") {
    let id = value.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let channel = value.get("channel").and_then(|v| v.as_str()).unwrap_or_default();
    let args = value.get("args").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let result = dispatch_rust_channel(channel, &args);
    let response = match result {
        Ok(v) => serde_json::json!({ "id": id, "ok": true, "result": v }),
        Err(e) => serde_json::json!({ "id": id, "ok": false, "error": e }),
    };
    let _ = state.write_raw(&response);
    continue;
}
```

**Error handling pattern:** every existing command maps native errors to `String` via `.map_err(|e| e.to_string())` (L138, L154, L165, L178) — no custom error type exists in this codebase yet; the new dispatch should follow the same flat-string convention rather than introducing one.

---

### `src-tauri/Cargo.toml` (config)

**Analog:** `.planning/spikes/011-electron-api-parity-in-tauri/parity-probe/Cargo.toml` (L11-12, literal, already resolved once):
```toml
[dependencies]
keyring = { version = "3", features = ["apple-native"] }
```
Add this line to the existing `[dependencies]` block (`src-tauri/Cargo.toml:14-18`, alongside `tauri`/`tauri-plugin-opener`/`serde`/`serde_json`) — do not create a new dependency section. Per RESEARCH.md, stay pinned to `version = "3"` (resolves to 3.6.3), not the newer unproven v4.

---

### `src/common/types/sidecarTransport.ts` — new `rustInvoke` kind + constants (config/contract)

**Analog:** same file's existing `SidecarRpcKind` (L32), `SidecarRpcRequest`/`SidecarRpcResponse` interfaces (L43-70), and constant-export convention (L93-144, e.g. `SIDECAR_INVOKE`, `OPEN_EXTERNAL`).

**Pattern to extend (types-only, no runtime logic — this module's own docstring at L1-24 forbids adding logic or an `electron` import here):**
```typescript
// L32 — extend the union:
export type SidecarRpcKind = 'invoke' | 'send' | 'openExternal' | 'rustInvoke'

// The SidecarRpcRequest/SidecarRpcResponse shapes (L43-70) are ALREADY generic
// enough to carry a rustInvoke frame unchanged — id/kind/channel/args and
// id/ok/result/error respectively. No new interface needed, just the new
// discriminant value and (if D-10's channel names are constants, following
// SIDECAR_INVOKE/OPEN_EXTERNAL's convention) e.g.:
export const RUST_INVOKE_KEYRING_GET = 'keyring_get' as const
export const RUST_INVOKE_KEYRING_SET = 'keyring_set' as const
export const RUST_INVOKE_KEYRING_DELETE = 'keyring_delete' as const
```

---

### `src/backend/sidecar/sidecarRpc.ts` — `requestRustInvoke()` + `rustPending` map (service, request-response)

**Analog:** same file's `requestOpenExternal()` (L179-187, the request-emission shape to copy) combined with `src-tauri/src/main.rs`'s `SidecarState::invoke` (L98-122, the pending-map/correlation shape — same mechanism, opposite process).

**Imports pattern** (L26-35, existing convention — path aliases via `common/types/...`, no barrel):
```typescript
import type { Readable, Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import {
  OPEN_EXTERNAL,
  UNPORTED_CHANNEL_MARKER,
  type SidecarRpcRequest,
  type SidecarRpcResponse,
  type SidecarNotification
} from 'common/types/sidecarTransport'
import { handlerRegistry, listenerRegistry } from './electronStub'
```

**Request-emission pattern to copy** (`requestOpenExternal`, L179-187 — fire-and-forget, NOT the shape to end up with, but the shape to start from):
```typescript
export function requestOpenExternal(url: string): void {
  const request: SidecarRpcRequest = {
    id: randomUUID(),
    kind: 'openExternal',
    channel: OPEN_EXTERNAL,
    args: [url]
  }
  writeLine(request)
}
```

**Core new pattern — add a `Promise`-returning, `Map`-correlated variant** (RESEARCH.md's worked example, consistent with the file's existing `writeLine`/`MAX_LINE_LENGTH` conventions at L37-44):
```typescript
const rustPending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>()

export function requestRustInvoke(channel: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    rustPending.set(id, { resolve, reject })
    const request: SidecarRpcRequest = { id, kind: 'rustInvoke', channel, args }
    writeLine(request)
    // add a timeout mirroring Rust's own INVOKE_TIMEOUT (60s, main.rs L49)
  })
}
```

**Frame-disambiguation change required in `handleFrame()`** (existing function, L103-123): today `isValidRequest()` (L46-57) only accepts `kind === 'invoke' | 'send' | 'openExternal'` inbound from the shell. A NEW check must run **before** that validation — a line with `ok` present and no `kind` field is a **response to our own outstanding `rustInvoke`**, not an inbound request (mirrors `main.rs`'s own `value.get("ok").is_some()` check at L271, reversed). This resolves the entry in `rustPending` instead of being routed to `dispatchInvoke`/`dispatchSend`.

**Error/DoS handling to reuse, not reinvent:** the existing `MAX_LINE_LENGTH` guardrail (L38, 10 MiB) and malformed-frame drop-and-log pattern (`handleFrame`, L103-114, `process.stderr.write(...)` then `return`) already protects the newline-delimited framing generically — no new guard needed for the `rustInvoke` frame kind specifically.

---

### `src/backend/storeManagers/steam/user.ts` — `TokenStore` seam (service/abstraction, CRUD)

**Analog (Electron-path body, unchanged logic):** same file's `encryptionAvailable()`/`encryptToken()`/`decryptToken()` (L17-52) — these become `ElectronTokenStore`'s method bodies, wrapped in `Promise.resolve()`, byte-identical behavior:
```typescript
function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptToken(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    logWarning('safeStorage unavailable — storing Steam refresh token in plaintext', LogPrefix.Steam)
    return plain
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${TOKEN_PREFIX}${ciphertext}`
}

function decryptToken(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(TOKEN_PREFIX)) return stored // Legacy plaintext fallback
  if (!encryptionAvailable()) return ''
  try {
    const buf = Buffer.from(stored.slice(TOKEN_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    logWarning(['Failed to decrypt Steam refresh token:', err], LogPrefix.Steam)
    return ''
  }
}
```
Note the plaintext fallback at L27-33 is exactly D-11's flagged divergence from D-06 — leave as Electron-only behavior per D-11, or unify per planner's call, but do not let the SidecarKeyringTokenStore inherit this fallback path (D-06/D-04 forbid it categorically).

**Analog (interface-with-N-implementations shape):** `common/types/game_manager.ts`'s `LibraryManager` interface + `src/backend/storeManagers/index.ts:14-21`'s selection map is the existing precedent for "one interface, multiple concrete implementations selected by which build/runner is active":
```typescript
export const libraryManagerMap = {
  sideload: new SideloadLibraryManager(),
  gog: new GOGLibraryManager(),
  legendary: new LegendaryLibraryManager(),
  nile: new NileLibraryManager(),
  zoom: new ZoomLibraryManager(),
  steam: new SteamLibraryManager()
} satisfies Record<Runner, LibraryManager>
```
`TokenStore` follows the same shape but with exactly 2 implementations selected by build (Electron vs. sidecar), not N runners:
```typescript
interface TokenStore {
  isAvailable(): Promise<boolean>
  getToken(): Promise<string>       // '' = none / unavailable (D-06 semantics)
  setToken(token: string): Promise<void>
  clearToken(): Promise<void>
}

class ElectronTokenStore implements TokenStore { /* existing encryptToken/decryptToken body, unchanged, Promise.resolve()-wrapped */ }

class SidecarKeyringTokenStore implements TokenStore { /* calls requestRustInvoke('keyring_get'|'keyring_set'|'keyring_delete', ...) — NEVER touches configStore.TOKEN_STORE_KEY (D-04) */ }
```

**Call sites that change** (all already `async` — verified by direct read):
- `getCredentials()` — L224-231 (currently `configStore.get_nodefault(TOKEN_STORE_KEY)` + `decryptToken`)
- `finishAuth()` — L235-254 (currently `encryptToken` + `configStore.set(TOKEN_STORE_KEY, ...)`)
- `startQRLogin()`'s `authenticated` handler — L401-411 (same `encryptToken`/`configStore.set` pair, inlined)
- `startCredentialLogin`'s guard/no-guard paths both funnel through `finishAuth` (L534, L571)

**Imports pattern** (L1-13, existing convention):
```typescript
import { safeStorage } from 'electron'
import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS, TOKEN_PREFIX, TOKEN_STORE_KEY } from './constants'
```

---

### `src/backend/sidecar/electronStub.ts` — `safeStorage` graduates to real dispatch (utility shim)

**Analog:** same file's `shell.openExternal`/`ElectronStubTransport` forward pattern (L40-45, L145-148) — the exact shape to mirror, except `safeStorage` needs a **request/response** round trip where `openExternal` only needed fire-and-forget:

```typescript
// L40-45 — the existing transport interface shape:
export interface ElectronStubTransport {
  /** Forwards `shell.openExternal(url)` to the Rust shell's opener command. */
  openExternal: (url: string) => void
  /** Forwards `mainWindow.webContents.send(channel, ...args)` as a SidecarNotification. */
  pushFrontendMessage: (channel: string, ...args: unknown[]) => void
}

// L145-148 — the existing fire-and-forget forward:
export const shell = {
  openExternal: async (url: string): Promise<void> => {
    transport?.openExternal(url)
  },
  // ...
}
```

**Current stub being replaced (L136-141) — the "lie" D-06 reverses:**
```typescript
export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (plainText: string): Buffer => Buffer.from(plainText, 'utf-8'),
  decryptString: (encrypted: Buffer): string => encrypted.toString('utf-8')
}
```
Per D-09, this `safeStorage` export itself may no longer be the seam if `user.ts` is refactored to select `TokenStore` implementations directly (in which case the sidecar build never calls `safeStorage` at all — `SidecarKeyringTokenStore` bypasses it entirely, calling `requestRustInvoke` directly). If `user.ts` is NOT refactored (D-09 left as a distinct-key/no-abstraction shape), this stub instead needs to synchronously proxy to the async `requestRustInvoke` — flagged here because `encryptString`/`decryptString` are synchronous in Electron's real API (RESEARCH.md's own note: "synchronous... but their callers are already async — an async accessor is viable if the abstraction is introduced"). Prefer the `TokenStore` route (avoids this sync/async mismatch entirely).

---

### `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` (new, test/integration)

**Analog:** `src/backend/sidecar/__tests__/bootstrap.test.ts` (full file, 143 lines) — real-`init()`-against-`PassThrough`-pairs convention:

**Imports + setup pattern** (L16-22, L46-59):
```typescript
import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { handlerRegistry } from '../electronStub'
import { READY_SENTINEL, UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'

describe('sidecar bootstrap (headless boot)', () => {
  it('reaches READY under bare node without an uncaught exception', () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    expect(() => init(input, output)).not.toThrow()
    expect(lines).toContain(READY_SENTINEL)
  })
```

**Round-trip assertion pattern to mirror** (L61-87 — write a request frame to `input`, `flush()`, find the response line by id):
```typescript
it('round-trips a health/ping invoke frame over stdio', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const lines = collectLines(output)
  init(input, output)
  input.write(`${JSON.stringify({ id: 'test-ping-1', kind: 'invoke', channel: 'health', args: [] })}\n`)
  await flush()
  const responseLine = lines.find((line) => line.includes('"id":"test-ping-1"'))
  expect(responseLine).toBeDefined()
  expect(JSON.parse(responseLine as string)).toEqual({ id: 'test-ping-1', ok: true, result: 'ok' })
})
```
For `rustInvokeChannel.test.ts`, since there is no real Rust process in Jest, the test must instead **write a synthetic `rustInvoke`-shaped response frame directly to `input`** (simulating what Rust would write back) and assert `requestRustInvoke()`'s returned Promise resolves/rejects correctly, and separately assert that `sidecarRpc.ts`'s `handleFrame()` correctly disambiguates an `{id, ok, result}` response-to-self from an inbound `invoke`/`send` request (no `kind` field present vs. present) — this is a transport-shape test per RESEARCH.md's Wave 0 Gaps note ("can stub the Rust side entirely since this is a transport-shape test, not a Keychain test").

**Helper functions to copy verbatim** (`collectLines`, L24-38; `flush`, L40-44):
```typescript
function collectLines(stream: PassThrough): string[] {
  const lines: string[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      lines.push(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return lines
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}
```

---

### `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` (new, test/unit)

**Analog:** `src/backend/sidecar/__tests__/skeletonFlows.test.ts`'s mocking discipline (L47-80) — automock a dependency, assert on observable behavior only:
```typescript
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))
```
For `tokenStore.test.ts`, the equivalent is mocking `requestRustInvoke` from `sidecarRpc.ts` (a fake in-memory keyring responder) to test `SidecarKeyringTokenStore`'s classification logic (D-06: `NoEntry` → available-but-empty vs. `PlatformFailure`/`NoStorageAccess` → unavailable/clean-signed-out) without a real Keychain — exactly RESEARCH.md's Wave 0 Gap description ("using a fake/mocked keyring responder, not the real Keychain"). Also exercise `ElectronTokenStore` against the existing `src/backend/storeManagers/steam/__tests__/user.test.ts` conventions (not read in full this session, but same directory/suite as the file under test — check its existing `jest.mock` setup for `safeStorage`/`configStore` before writing new mocks, to avoid duplicating a mock Jest already auto-applies).

---

### `src/backend/sidecar/__tests__/electronUntouched.test.ts` (new, test/integration)

**Analog:** `src/backend/sidecar/__tests__/skeletonFlows.test.ts` Test 4 (L222-261) — the exact "write real store data, run the sidecar, assert on real store contents, clean up in `finally`" shape needed for D-04's byte-comparison proof:
```typescript
it('Test 4 (snapshot): sidecar:store-snapshot includes steamConfigStore.userData but never refreshToken', async () => {
  steamConfigStore.set('userData', { username: 'skeleton-tester', steamId: 'STEAMID_TEST' })
  steamConfigStore.set('refreshToken', 'super-secret-should-never-leave-the-sidecar')
  try {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'snapshot-1', 'sidecar:store-snapshot', [])
    await flush()
    const response = frames.find((frame) => frame.id === 'snapshot-1') as { ok: boolean; result: { steamConfigStore?: Record<string, unknown> } } | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result.steamConfigStore?.userData).toEqual({ username: 'skeleton-tester', steamId: 'STEAMID_TEST' })
    expect(response?.result.steamConfigStore).not.toHaveProperty('refreshToken')
  } finally {
    steamConfigStore.clear()
  }
})
```
**Critical real-config-directory convention** (module docstring, L1-45, esp. L8-14): this repo's test convention reads/writes the developer's REAL `~/Library/Application Support/GameLib/...` directory — `pathShim.ts` has no `HOME`/`XDG_CONFIG_HOME`/`APPDATA` override for darwin. `electronUntouched.test.ts` MUST therefore: (1) snapshot `steamConfigStore`'s `refreshToken` value BEFORE any sidecar run, (2) run the sidecar path that exercises the keyring channel, (3) assert the `refreshToken` value is byte-identical after, (4) restore/clear in a `finally` block exactly like Test 4 does — never leave fixture data in the real config dir across test runs.

**Import pattern for the real config store** (L74-80, `jest.mock('../../storeManagers/steam/user')` for the network-touching class, but the config store itself unmocked):
```typescript
import { configStore as steamConfigStore } from '../../storeManagers/steam/electronStores'
```

## Shared Patterns

### Request/response correlation over stdio (both directions)
**Source:** `src-tauri/src/main.rs` `SidecarState` (L72-122, Rust→sidecar direction) mirrored by the new `rustPending` Map in `src/backend/sidecar/sidecarRpc.ts` (sidecar→Rust direction).
**Apply to:** `main.rs`'s new reader branch, `sidecarRpc.ts`'s `requestRustInvoke`.
```rust
// id -> one-shot sender/resolve, correlated by string id (never a JS number — 64-bit-safe)
pending: Mutex<HashMap<String, Sender<Result<Value, String>>>>
```
```typescript
const rustPending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
```

### Timeout guardrail on every correlated request
**Source:** `src-tauri/src/main.rs:49` — `const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);`, used at L115 (`rx.recv_timeout(INVOKE_TIMEOUT)`).
**Apply to:** `requestRustInvoke()` in `sidecarRpc.ts` — Pitfall 2 explicitly warns a call that "never resolves and never times out" is what a dropped frame looks like from the sidecar's side; mirror the same 60s bound with a `setTimeout`/`clearTimeout` pair around the Promise.

### Forward-to-transport-then-native-facility (stub graduates from no-op to real)
**Source:** `src/backend/sidecar/electronStub.ts` `shell.openExternal` (L145-148) → `ElectronStubTransport.openExternal` (L40-45, bound in `bootstrap.ts` L88-91) → `open_external` Tauri command (`main.rs` L161-166) → `tauri-plugin-opener`.
**Apply to:** the `safeStorage`/`TokenStore` seam — same three-hop shape (stub → transport → Tauri command → native facility), just request/response instead of fire-and-forget.

### Error mapping to flat `String` (no custom error type)
**Source:** every existing `#[tauri::command]` in `main.rs` (L138, L154, L165, L178) — `.map_err(|e| e.to_string())`.
**Apply to:** `dispatch_rust_channel`'s `keyring::Error` → `String` mapping; do not introduce a new Rust error enum for this phase.

### `TypeCheckedStoreBackend` / `configStore` access convention (Electron-path only)
**Source:** `src/backend/storeManagers/steam/electronStores.ts` (L6-8, `configStore`) and `user.ts`'s `configStore.get_nodefault(TOKEN_STORE_KEY)` / `configStore.set(TOKEN_STORE_KEY, ...)` calls (L225, L238, L404).
**Apply to:** `ElectronTokenStore` only — D-04 makes this pattern explicitly forbidden inside `SidecarKeyringTokenStore`; a grep-based lint (no `TOKEN_STORE_KEY` import in the sidecar-only module) is the enforcement RESEARCH.md's Security Domain section recommends.

### Real-config-directory Jest convention (no sandboxed tmpdir override exists)
**Source:** `src/backend/sidecar/__tests__/bootstrap.test.ts` docstring (L1-14) and `skeletonFlows.test.ts` docstring (L1-45) — both state plainly that `pathShim.ts` has no darwin env-var override, so tests read/write the real OS config directory and MUST clean up in `finally`.
**Apply to:** all three new test files, especially `electronUntouched.test.ts` where this is the entire point of the test.

## No Analog Found

None — all 7 classified files (plus the 3 new test files) have a strong existing analog in the codebase, per the table above. The one genuinely new mechanism (sidecar-initiated request/response) is explicitly a mirror of an existing mechanism running in the opposite direction, not an unprecedented pattern.

## Metadata

**Analog search scope:** `src-tauri/src/main.rs`; `src/backend/sidecar/{electronStub,bootstrap,sidecarRpc,pathShim,fileStore}.ts`; `src/backend/sidecar/__tests__/{bootstrap,skeletonFlows}.test.ts`; `src/backend/storeManagers/steam/{user,constants,electronStores}.ts`; `src/backend/storeManagers/index.ts`; `src/common/types/sidecarTransport.ts`; `.planning/spikes/011-electron-api-parity-in-tauri/parity-probe/{src/main.rs,Cargo.toml}`; `src-tauri/Cargo.toml`.
**Files scanned:** 15 read in full + 1 graphify BFS query (11 nodes) + 1 graphify entity query (362 nodes, truncated).
**Pattern extraction date:** 2026-07-22
