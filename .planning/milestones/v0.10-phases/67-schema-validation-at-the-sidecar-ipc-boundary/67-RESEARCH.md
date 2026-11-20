# Phase 67: Schema validation at the sidecar IPC boundary - Research

**Researched:** 2026-11-07
**Domain:** zod 4 runtime validation in a Node sidecar behind a Tauri relay, plus TS-to-Rust contract codegen
**Confidence:** HIGH on code facts and zod behaviour (measured in this session); MEDIUM on the Rust codegen details (no spike run)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: zod 4 is the validator.** Bump `zod` to `>=4.6.6`, which closes the high-severity memory-exhaustion advisory `.planning/codebase/CONCERNS.md` records against `zod <4.6.6`. Use zod 4's built-in `z.toJSONSchema()` for codegen (D-16). Bundle size isn't a constraint: zod is already bundled into `build/main/sidecar.js`.
- **D-02: The first plan ports all 15 existing zod files to the zod 4 API**, with the suite green, before any channel schema is written. No `zod/v3` compatibility subpath is left behind. The 15 files: `backend/schemas.ts`, `backend/protocol.ts`, `crossover_index/schema.ts`, `crossover_index/fetcher.ts`, `logger/uploader.ts`, `humble/adapter.ts`, `utils/filesystem/windows.ts`, `utils/systeminfo/gpu/{linux,windows}.ts`, `utils/systeminfo/osInfo/windows.ts`, `steam/bridge/allowlist.ts`, `steam/bridge/bridgeVerdict.ts`, `legendary/commands/{base,eos_overlay}.ts`, `common/knownFixReport.ts`.
- **D-03: Phase 67 owns the zod bump.** Remove zod from Phase 72's supply-chain group in ROADMAP.md. That group keeps undici, follow-redirects, the audit job and the Linux compile leg.
- **D-04: Argument types are inferred from the schemas with `z.infer`, in the same `src/common/types/ipc/<domain>.ts` files.** The `AsyncIPCFunctions`/`SyncIPCFunctions`/`TestSyncIPCFunctions`/`FrontendMessages` entries are derived from the schemas, and the hand-written argument types are deleted so the two can't drift. The frontend and preload already import these files. They should import zod for types only where possible, and zod must not enter the renderer bundle unless it's needed.
- **D-05: Schemas check shape, plus cheap invariants that need no app state.** Examples: non-empty strings, absolute-path format, http(s) URL format, enum members (e.g. `runner`), integer ranges. A schema never reads settings or the filesystem. Containment against configured roots (`rendererPathGuard.ts`'s `assertContainedPath`) and scheme/path allow-lists stay in handlers or go to Phase 72. Existing `rendererPathGuard` calls are kept, not replaced.
- **D-06: Unknown keys are rejected (strict objects).** An undeclared key fails the call. Every legitimate optional field has to be declared.
- **D-07: Large structural payloads get lighter schemas now, and Phase 70 tightens them.** For `GameInfo`-carrying arguments and settings writes (`setSetting`, `writeConfig`, ...), the schema checks what the handler actually reads (e.g. `appName` plus a `runner` enum, or a settings key enum with a per-key value type where that's cheap). Strict mode applies to the declared envelope, and the large nested object is marked as an explicit passthrough, which makes it greppable for Phase 70.
- **D-08: A rejected `invoke` rejects the renderer's promise with a recognisable typed error.** Code `IPC_INVALID_ARGS`, plus the channel and zod issue paths. It travels the existing `{id, ok:false, error}` path in `sidecarRpc.ts` and never throws into the transport. Channel return types don't change, and there's no result-union migration.
- **D-09: A rejected fire-and-forget `send` (`ipcMain.on`) is logged and dropped.**
- **D-10: Rejection logs name the channel and the failing key paths, never the argument values**, because some channels carry credentials, OAuth codes or cookies.
- **D-11: Renderer to sidecar (`invoke` and `send`) is validated at runtime.** This is the trust boundary, because the renderer hosts embedded store pages and login webviews.
- **D-12: Sidecar to renderer push messages (`FrontendMessages`) get schemas for types and codegen only, with no runtime check.** The sender is trusted and these are hot paths. They're counted in their own ratchet bucket so "every channel has a schema" still reaches zero.
- **D-13: `rustInvoke` (sidecar to Rust, the `RUST_INVOKE_CHANNELS` allow-list in `sidecarTransport.ts`, dispatched by `dispatch_rust_channel` in `store_embed.rs`) is the main Rust codegen target.** Each channel gets a zod schema. The generator emits a Rust channel enum and serde argument structs that replace the hand-written `value.get(...)` parsing in the dispatch arms. The sidecar doesn't re-check its own outgoing `rustInvoke` arguments at runtime; the types already enforce them at compile time.
- **D-14: The Rust relay enforces a generated renderer channel-name allow-list.** `sidecar_invoke`/`sidecar_send` (`src-tauri/src/relay_commands.rs`) reject a channel name that isn't in the generated list before it crosses the pipe. Arguments are validated only in the sidecar, so there is one validator in one place.
- **D-15: Every registered channel needs a schema, test-only and dev-only channels included** (e.g. `TestSyncIPCFunctions`, `devEpicCookieSweepRegistration`). The final test reads `handlerRegistry`/`listenerRegistry` and allows no exemptions.
- **D-16: Pipeline is zod -> `z.toJSONSchema()` -> a project-owned TypeScript generator that emits Rust.** The generator supports a deliberately small subset: string, number/integer, boolean, enum, literal, optional, array and object, plus whatever else the real `rustInvoke` schemas prove they need. A schema outside the subset fails generation loudly. No new Rust crate dependency (no `typify`), and the output reads like hand-written serde code.
- **D-17: The transport constants move into the generated contract.** `sidecarTransport.ts` stays the source, and the generator emits `READY_SENTINEL`, `FRONTEND_MESSAGE_EVENT`, `SHELL_WINDOW_FOCUSED`, `STORE_SNAPSHOT_CHANNEL` and `RUST_INVOKE_KIND` into the Rust module. The hand-written Rust consts and their `// transport-mirror:` markers in `sidecar.rs` are deleted. The 62-04 marker parity test (`transportParity.test.ts`) is retired for each mirror the generated code covers, and deleted outright once it covers none.
- **D-18: Generated files are checked in, and CI fails if regenerating changes them.** Both the TS and Rust outputs carry a do-not-edit header. `pnpm gen:ipc-contract` writes them, and `pnpm check:ipc-contract` regenerates and fails on any diff. It runs in CI and in `.husky/pre-commit`. `cargo build` keeps working without Node.
- **D-19: Phase 67 runs before Phase 71.** The generated contract replaces the dispatch arms' hand-written parsing and the marker consts first, so Phase 71 moves smaller files and has no markers left to preserve.
- **D-20:** Convert domain by domain, starting with channels that touch files, processes, credentials or URLs (e.g. `shellFiles`, `install`, `wineTools`, `runnerAuth`, `steamAuth`, `oauthLogin`, `humbleLogin`, `storeEmbed`). Track the unvalidated count with a shrink-only ceiling in the Phase 62 D-14 style. Each plan that converts channels lowers the ceiling in the same commit. At zero, the ceiling becomes the D-15 assertion.

### Claude's Discretion

- How the typed error is encoded on the wire (D-08): a structured `error` object, or a marker-prefixed string like the existing `UNPORTED_CHANNEL_MARKER` in `sidecarRpc.ts`. Also the name and location of the renderer-side `IpcValidationError` class.
- How a schema is attached to a registration: a typed `registerChannel(channel, schema, handler)` wrapper, or a schema map that `platform/index.ts`'s `ipcMain.handle` looks up. Either way, validation happens once, in the shared path, not in each handler.
- Where the generator script lives (`meta/`) and where the Rust output goes (e.g. `src-tauri/src/ipc_contract.rs`), plus the exact npm script names.
- The plan and wave breakdown, and how domains are batched per plan.
- Whether to replace the ad hoc `typeof` checks in `runnerAuthFlowRegistration.ts` and similar once the schema covers them, or leave them as harmless redundancy.

### Deferred Ideas (OUT OF SCOPE)

- Semantic allow-lists for renderer paths and URLs (containment of `removeFolder`'s `folderPath`, the `openExternalUrl`/`openFolder` scheme allow-list): Phase 72, already scoped there.
- Full `GameInfo` and settings schemas: Phase 70 tightens the lighter schemas from D-07.
- ROADMAP.md edit to remove zod from Phase 72's supply-chain group (D-03): a doc change to make separately, not a Phase 67 plan.
- Reviewed todos (19 keyword-noise matches, none concerning IPC validation) were not folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are assigned (Requirements: TBD). The planner derives must-haves from the goal and decisions. Suggested must-have handles, used in the Validation Architecture map below:

| ID | Description | Research Support |
|----|-------------|------------------|
| V67-A | zod 4 installed, all 15 files ported, suite green | "zod 3 to 4 port surface" |
| V67-B | Boundary validates args once, typed `IPC_INVALID_ARGS` for invoke, log-and-drop for send, no values logged | "Insertion point", "Typed rejection on the wire" |
| V67-C | Schemas are the single source for arg types (`z.input`), no zod in renderer bundle | "Pattern 1", Pitfall 5 |
| V67-D | Shrink-only unvalidated-count ceiling, ending in an exemption-free every-channel-has-a-schema test | "Ratchet" |
| V67-E | `gen:ipc-contract` / `check:ipc-contract`: Rust constants, `rustInvoke` enum and arg structs, renderer allow-list, enforced by relay | "Codegen" |
| V67-F | `transportParity.test.ts` retired per covered mirror | "What 62-04 pins today" |
</phase_requirements>

## Summary

The shared registration path is thin and the right place for the schema map is not where CONTEXT guessed. `platform/index.ts`'s `ipcMain.handle/on/once` only does `Map.set` into `handlerRegistry`/`listenerRegistry`. The only production code that ever reads those registries is `sidecarRpc.ts`'s `dispatchInvoke` (line 185) and `dispatchSend` (line 215); every other reader is a test. I measured the live registry by booting `backend/sidecar/handlers` under jest: **185 `handle` channels and 54 `on` channels = 239**, plus `handleProtocolUrl` (registered by `bootstrap.init()`), plus 6 `TestSync` channels that exist only under `CI=e2e`. That is below the roadmap's "~282", which counted something broader. Ten of the 239 registered channels are not declared in any `ipc/<domain>.ts` file today (`health`, `devSweepEpicCookieDomain`, `trayResolveRunner`, `sidecar:store-snapshot`, `sidecar:store-fetch`, `shellWindowFocused`, `storeSet`, `storeDelete`, `storeNew`, plus `handleProtocolUrl`), so the plan must give them a home (suggest `ipc/sidecarInternal.ts`).

zod 4.6.7 is current. All 15 existing zod files **type-check cleanly against zod 4.6.7 with zero errors**, and the jest suites that touch them (about 860 tests) pass when `zod` is mapped to 4.6.7, apart from one `games.test.ts` failure that is identical under stock zod 3 (pre-existing, unrelated). The only hard-API usages are deprecated-but-present (`z.ZodIssueCode.custom` plus `new z.ZodError([...])` in `humble/adapter.ts:504`, `.strict()`, `.passthrough()`, `.url()`, `.datetime()`). So the "port" plan is mostly a version bump, a lockfile change, a deprecation clean-up and a regression run, not a rewrite. The real cost of zod 4 is bundle size: the classic API is ~454 KB minified versus ~61 KB for zod 3 in an equivalent probe, because classic pulls in every locale. `zod/mini` is ~23 KB but forces a functional API and cannot share the existing 15 files. This only affects the SEA bundle (`build:sidecar` uses `--packages=external`, so `build/main/sidecar.js` does not contain zod; `sidecar-sea-bundle.js` does, currently 14.9 MB unminified), so the delta is about +0.6 MB unminified, which D-01 already accepts.

The Rust half is the larger and riskier part. `RUST_INVOKE_CHANNELS` has 43 entries, matched by 43 string arms in `dispatch_rust_channel` (`store_embed.rs:1810`). The arms parse `args: &[Value]` by hand, and some delegate to 100-line helper functions with pinned error strings (`store_embed_open:bad-args:url`, `keyring:bad-args`, `humble_login_cookies_for_domain:bad-args`). Several Jest tests grep Rust source text for those parsing lines, and shared wire fixtures under `meta/fixtures/*.json` are asserted from both ends. Replacing hand parsing with generated serde structs therefore has a test-update cost the planner must budget explicitly, and the generated code must keep the pinned error-string contract (or update every pin in the same commit).

**Primary recommendation:** Put one `channelSchemas` map (channel name to args-tuple schema plus kind) in `common/types/ipc`, validate in `sidecarRpc.ts`'s `dispatchInvoke`/`dispatchSend` through one `ipcValidation.ts` function (not by wrapping the handler inside `ipcMain.handle`, which would break every existing test that calls registry handlers directly with loose args), encode the typed rejection as a marker-prefixed JSON string (the Rust relay and Tauri both carry only strings end to end), and run the shrink-only ceiling as a jest census test that counts registered channels lacking a schema.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Argument validation (renderer to sidecar) | Sidecar (Node, `sidecarRpc.ts` dispatch) | -- | Single validator in one place (D-14); the renderer and Rust relay are untrusted/pass-through |
| Channel-name allow-list | Rust shell (`relay_commands.rs`) | Generator (TS meta script) | Cheapest rejection point before the pipe; list is generated from schemas |
| Typed error to renderer promise | Preload (`src/preload/ipc.ts` `makeHandlerInvoker`) | Rust relay (carries string unchanged) | `tauriTransport.invoke` only sees a rejected string; classification belongs where `window.api` is built |
| Schema authoring / TS arg types | `src/common/types/ipc/<domain>.ts` | -- | Already imported by backend, preload, frontend; value import must stay out of renderer |
| `rustInvoke` arg structs + dispatch enum | Generator output (`src-tauri/src/ipc_contract.rs`) | `store_embed.rs` arms consume it | Sidecar does not re-check outgoing args (D-13) |
| Transport constants in Rust | Generator output | `sidecarTransport.ts` as source | D-17 |
| Ratchet / completeness gate | jest census test in `src/backend/sidecar/__tests__` | -- | Needs the live registry, which only exists in a booted backend jest project |
| Staleness gate | `meta/` script + CI + `.husky/pre-commit` | -- | D-18 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.6.7 (latest, published 2026-10-12; installed today: 3.25.6) | Schema, `z.infer`/`z.input`, `z.toJSONSchema()` | Locked by D-01. Already the project's validator |

[VERIFIED: `npm view zod version` returns 4.6.7; no `postinstall` script; repository `github.com/colinhacks/zod`; `node_modules/zod/package.json` shows 3.25.6]. zod is an existing dependency of this repo (`package.json:148`, `^3.24.3`), so no new package is introduced. No other new npm dependency is needed: the generator is project-owned TypeScript (D-16), run through the existing `meta/runTs.cjs` esbuild wrapper.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| serde / serde_json | 1 / 1 (already in `src-tauri/Cargo.toml:51-52`) | Generated arg structs | Rust side of the generated contract; no new crate |
| esbuild via `meta/runTs.cjs` | existing | Run the generator under Node | `pnpm gen:ipc-contract` follows `gen-vtables` precedent (`package.json:73`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zod 4 classic | `zod/mini` | 23 KB vs 454 KB minified, but functional API only and cannot share the 15 existing files. Rejected: bundle size is not a constraint (D-01) |
| Dispatch-level validation | Wrapping inside `ipcMain.handle` | See Pattern 2: wrapping makes ~83 sidecar test files that call `handlerRegistry.get(ch)(undefined, ...args)` with loose args fail all at once |

**Installation:**
```bash
pnpm add zod@^4.6.7
```

**Version verification:** `npm view zod version` returned `4.6.7` (modified 2026-10-12). Advisory floor is `4.6.6` per CONCERNS.md.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| zod | npm | multi-year, already a dependency here | very high | github.com/colinhacks/zod | not run (version bump of an existing dependency; `npm view zod@4.6.7 scripts.postinstall` empty) | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

No new packages. If the planner adds any, it must run the legitimacy gate itself.

## Architecture Patterns

### System Architecture Diagram

```
 renderer (window.api.*)                         build time
   preload makeHandlerInvoker / makeListenerCaller    common/types/ipc/<domain>.ts (zod schemas)
        | tauriInvoke(sidecar_invoke|sidecar_send)           |
        v                                                      v
 Rust relay_commands.rs                          meta/genIpcContract.ts
   [NEW] channel in generated renderer allow-list?     z.toJSONSchema() per rustInvoke schema
        | no  -> Err(string) to renderer (invoke) / dropped+logged (send)    |
        | yes                                                  v
        v                                          src-tauri/src/ipc_contract.rs (generated)
 stdin frame {id,kind,channel,args}                  consts, RustInvokeChannel enum,
        v                                            XxxArgs structs, RENDERER_CHANNELS
 sidecarRpc.ts handleFrame                          + common/types/ipc/generated TS (if any)
   dispatchInvoke / dispatchSend                        check:ipc-contract = regenerate + git diff
        |
        |-- [NEW] ipcValidation.validate(channel, args)
        |        fail invoke -> {id, ok:false, error:"[GAMELIB_IPC_INVALID_ARGS] {json}"}
        |        fail send   -> log channel + issue paths, drop
        | pass
        v
   handlerRegistry / listenerRegistry handler (unchanged, still calls rendererPathGuard)
        |
        |-- requestRustInvoke(channel, args)  (no runtime re-check, D-13)
        v
 Rust sidecar.rs reader -> dispatch_rust_channel -> [NEW] generated XxxArgs::from_args
```

### Recommended Project Structure

```
src/common/types/ipc/
  <domain>.ts          # schemas + derived interfaces (existing 27 files)
  sidecarInternal.ts   # NEW: the 10 channels not declared anywhere today
  channelSchemas.ts    # NEW: assembles { channel: { kind, args: ZodTuple } } for all domains
src/backend/sidecar/
  ipcValidation.ts     # NEW: validateInbound(channel, args) -> ok | IpcRejection
  __tests__/ipcSchemaCoverage.test.ts   # NEW: ceiling, then zero-exemption test
meta/genIpcContract.ts # NEW: generator (+ meta/__tests__/genIpcContract.test.ts)
src-tauri/src/ipc_contract.rs   # NEW: generated, do-not-edit header
```

### Pattern 1: Derive arg types from schemas without leaking zod into the renderer

**What:** Per domain, declare arg tuples as zod, keep the hand-written return types in a separate map, and build the existing `*Sync`/`*Async` interfaces as mapped types. Use `z.input`, not `z.infer`, for caller-facing types: `z.infer` yields the output type, which for branded or transformed schemas differs from what a caller may send.

```ts
// src/common/types/ipc/shellFiles.ts   (sketch)
import { z } from 'zod'
import type { DiskSpaceData } from '../../types'

export const shellFilesAsyncArgs = {
  checkDiskSpace: z.tuple([z.string().min(1)]),
  getShellPath: z.tuple([z.string().min(1)]),
  pathExists: z.tuple([z.string().min(1)])
}
interface ShellFilesAsyncReturns {
  checkDiskSpace: DiskSpaceData
  getShellPath: string
  pathExists: boolean
}
export type ShellFilesAsync = {
  [K in keyof typeof shellFilesAsyncArgs]: (
    ...args: z.input<(typeof shellFilesAsyncArgs)[K]>
  ) => Promise<ShellFilesAsyncReturns[K]>
}
```

**When to use:** every domain file. The census test `ipcDomainCensus.test.ts` parses these files with a regex over `export interface <Domain><Kind> { ... }` blocks (`parseDomainFile`), so converting an interface into a mapped `type` alias makes the census see zero keys. The conversion plan must either update the census parser to read the schema-object keys, or keep a thin `export interface` that extends the mapped type. Budget that.

**Renderer bundle:** the frontend imports `common/types/ipc` almost entirely with `import type` (28 importers; only `GlobalState.tsx:45` and `backend/ipc.ts:10` use value-form imports, both for types). Type-only imports are erased, so zod stays out of the renderer. Add a guard (eslint `no-restricted-imports` for value imports of `common/types/ipc` from `src/frontend`/`src/preload`, or a test over the built renderer dist) so a stray value import does not silently add ~450 KB.

### Pattern 2: Validate at the dispatch funnel, not inside `handle()`

**Insertion point:** `src/backend/sidecar/sidecarRpc.ts`, immediately after the handler/listener lookup in `dispatchInvoke` (before `handler(undefined, ...request.args)`) and at the top of `dispatchSend` (before the listener loop, so a channel with several listeners is checked once).

**Why not wrap in `ipcMain.handle`:** `handlerRegistry` is read by tests directly (83 files under `sidecar/__tests__`, including `loggerFlows`, `humbleFlows`, `enrichmentFlows`, `eosOverlayFlows`). A wrapper stored in the registry would force each to pass schema-valid args. Dispatch-level validation covers 100% of production traffic (the registry has exactly one production reader) and leaves handler-level unit tests untouched. CONTEXT's "shared registration path" wording is satisfied: it is one shared path, shared by all 23 registration files. This is within Claude's Discretion; the alternative is viable only if the planner accepts a mass test update.

**Registration-side schema attachment:** none needed. A static `channelSchemas` map keyed by channel name is the single source. The completeness test (D-15) compares `handlerRegistry.keys()` and `listenerRegistry.keys()` against that map.

```ts
// src/backend/sidecar/ipcValidation.ts   (sketch)
export const IPC_INVALID_ARGS = 'IPC_INVALID_ARGS' as const
export const IPC_INVALID_ARGS_MARKER = '[GAMELIB_IPC_INVALID_ARGS]' as const

export function validateInbound(channel: string, kind: 'invoke' | 'send', args: unknown[]):
  | { ok: true }
  | { ok: false; channel: string; paths: string[]; codes: string[] } {
  const entry = channelSchemas[channel]
  if (!entry) return { ok: true } // ratchet-era only; the final test removes this branch
  const r = entry.args.safeParse(args)
  if (r.success) return { ok: true }
  // D-10: key paths and issue codes only. Never r.error.message and never issue.input.
  return {
    ok: false,
    channel,
    paths: r.error.issues.map((i) => i.path.join('.') || '(args)'),
    codes: r.error.issues.map((i) => i.code)
  }
}
```

Note: zod 4 issues do not carry the raw input by default (measured: issue objects contain `code`, `path`, `message`, and per-code fields only). `unrecognized_keys` issues carry the offending **key names** in `keys`; key names come from a possibly hostile caller, so log them truncated or omit them. `message` strings for enum failures can embed expected values only, not received input, but log only path and code anyway so a future zod message change cannot leak a credential.

### Pattern 3: Typed rejection on the wire

**Facts, all verified in source:**
- `SidecarRpcResponse.error` is `string | undefined`.
- The Rust reader extracts it with `value.get("error").and_then(|v| v.as_str())` (`sidecar.rs:400`), so a non-string `error` would collapse to `"sidecar error"`.
- `SidecarState::invoke` returns `Result<Value, String>` and `sidecar_invoke` forwards `Err(String)`; Tauri rejects the renderer promise with that string.
- Existing precedent: `UNPORTED_CHANNEL_MARKER` (`[GAMELIB_UNPORTED_CHANNEL]`) and `STORE_LAZY_MISS_MARKER`, each detected by `message.includes(...)` in the renderer.

**Recommendation (Claude's Discretion resolved):** a marker-prefixed string with a JSON tail, `[GAMELIB_IPC_INVALID_ARGS] {"code":"IPC_INVALID_ARGS","channel":"...","paths":["0","1.name"]}`. A structured `error` object would require Rust changes in `sidecar.rs`, `shell_state.rs` and `relay_commands.rs` for no gain. Define the marker constant in `sidecarTransport.ts` next to `UNPORTED_CHANNEL_MARKER` and add it to the generated Rust contract only if Rust needs to read it (it does not).

**Renderer class:** `IpcValidationError extends Error` with `code`, `channel`, `paths`, in `src/preload/` (new `ipcValidationError.ts`), thrown by `makeHandlerInvoker` in `src/preload/ipc.ts:27-31` via `.catch`. Preload has its own `printWidth: 120` prettier config (`src/preload/.prettierrc`), which matters for the `<verify>` prettier rule. `window.api` consumers and `frontend/bootErrorSurface.ts` (which hijacks the page for unported-channel and boot errors by substring match) must not treat this marker as a boot failure: check that `bootErrorSurface`'s matching does not capture it.

**`send` rejection:** `dispatchSend` has no response. Log via the sidecar logger (`logWarning`, not stdout, because stdout is the RPC pipe) and drop. Rust's `sidecar_send` returns `Result<(), String>` and the preload `send()` routes rejections to `window.api.logError`, which is itself a send-kind channel; a rejection of `logError` itself already has a recursion guard (`tauriTransport.ts:105-109`). The new Rust allow-list reject for `send` must therefore log in Rust (`shell_eprintln!`), and must never route a `logError` rejection back through `logError`.

### Pattern 4: Positional args are JSON, so `undefined` becomes `null`

`JSON.stringify(['a', undefined])` is `["a",null]`, and trailing `undefined` survives as `null` in a tuple. A schema `z.tuple([z.string(), z.boolean().optional()])` rejects `["a", null]`, and the renderer will do exactly that whenever it forwards an explicit `undefined`. Use a project helper `optionalArg(schema) = schema.nullish()` for positional optionals on renderer-to-sidecar channels, and write every conversion test as `schema.safeParse(JSON.parse(JSON.stringify(args)))`. Inside objects, `undefined`-valued keys are dropped by JSON, so `z.strictObject({a: z.string().optional()})` is fine. For `rustInvoke` schemas (codegen), keep `.optional()`, because serde maps `null`/absent to `Option<T>`.

### Anti-Patterns to Avoid

- **Replacing existing guards:** keep `rendererPathGuard` calls and `Path.parse` in `checkDiskSpace` (D-05). Optionally drop the `typeof` checks at `runnerAuthFlowRegistration.ts:143,164` after the schema covers them; harmless to leave.
- **`z.infer` for caller types:** use `z.input` (Pattern 1).
- **Logging `error.message` or `error.format()`:** violates D-10 in spirit; log paths and codes only. Note `meta/logSecretGate.ts` exists as a gate; check it still passes.
- **Branded schemas in IPC tuples:** `backend/schemas.ts` `Path` is `.brand('Path')`; inside an IPC tuple the branded output type makes callers cast. Use plain `z.string()` plus the same refine, not the branded `Path`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argument validation | hand `typeof` chains per handler | zod `safeParse` in one funnel | 4 of 23 files do it ad hoc today |
| JSON Schema from zod | custom walker over zod internals | `z.toJSONSchema(schema, { io: 'input' })` | stable public API; the project generator then only walks plain JSON Schema |
| Rust JSON parsing | `value.get("x").and_then(...)` ladders | generated `serde` structs + `from_args` | that is the point of D-13 |
| Shrink-only ratchet | new mechanism | the existing `flowRegistrationCensus.test.ts` `EXPECTED` table pattern and `meta/*Ratchet.cjs` + baseline json pattern | house style |
| Process isolation in tests that spawn | hand `env` literal | `createFakeHomeProfile()` (project convention) | any generator test that spawns the CLI |

**Key insight:** the work is mechanical and repetitive across ~250 channels. The leverage is in the helper (`defineChannels`-style) and the census test, not in per-channel cleverness.

## Exact Channel Inventory

Measured by booting `backend/sidecar/handlers` under jest and dumping `handlerRegistry`/`listenerRegistry` (probe test deleted afterwards), then joining to the `ipc/<domain>.ts` interfaces. `handle` = invoke, `on` = send. Domain attribution is by channel name; three names collide with push-channel names (`legendary`, `steam`, one `handle` each) and are attributed approximately. [VERIFIED: runtime registry dump, 2026-11-07]

| Domain (ipc file) | invoke | send | Touches | Suggested wave |
|---|---|---|---|---|
| shellFiles | 3 | 17 | files, processes, URLs | 1 |
| install | 9 | 0 | files, processes | 1 |
| wineTools | 15 | 0 | processes, files | 1 |
| runnerAuth | 10 | 1 | credentials, URLs | 1 |
| steamAuth | 24 | 1 | credentials | 1 |
| oauthLogin | 1 | 0 | credentials, URLs | 1 |
| humbleLogin | 3 | 1 | credentials, cookies, URLs | 1 |
| storeEmbed | 9 | 1 | URLs, embed windows | 1 |
| dialog | 1 | 0 | files | 1 |
| clipboard | 1 | 2 | clipboard | 1 |
| settings | 11 | 1 | config writes (D-07 passthrough) | 2 |
| gameDetails | 16 | 3 | launch, uninstall (GameInfo, D-07) | 2 |
| eosOverlay | 8 | 0 | files | 2 |
| shortcuts | 6 | 1 | files | 2 |
| runnerMisc | 14 | 0 | processes, paths | 2 |
| engine | 5 | 0 | processes | 2 |
| logger | 3 | 3 | URLs (upload) | 2 |
| humble | 15 | 1 | keys (credentials-adjacent) | 3 |
| enrichment | 17 | 0 | network metadata | 3 |
| appShell | 6 | 14 | misc | 3 |
| downloadQueue | 1 | 4 | misc | 3 |
| legendary / steam (name-collision attributions) | 2 | 0 | misc | 3 |
| sidecarInternal (undeclared today) | 5 | 4 | `health`, `devSweepEpicCookieDomain`, `trayResolveRunner`, `sidecar:store-snapshot`, `sidecar:store-fetch`, `shellWindowFocused`, `storeSet`, `storeDelete`, `storeNew`; plus `handleProtocolUrl` (bootstrap-registered, invoke) | 3 |
| **Total registered** | **185 (+1 `handleProtocolUrl`)** | **54** | | |

Additional categories:
- **TestSync (6):** `setLegendaryCommandStub`, `resetLegendaryCommandStub`, `setGogdlCommandStub`, `resetGogdlCommandStub`, `setNileCommandStub`, `resetNileCommandStub`. Registered only when `CI=e2e` via `addTestOnlyListener`, so the registry dump above does not contain them. D-15 requires schemas anyway.
- **FrontendMessages (42):** push only, schemas for types and codegen, own ratchet bucket (D-12).
- **Declared but not registered in the sidecar (18):** `window.ts` (6 sync, 4 async: `minimizeWindow`...`isMinimized`, `setZoomFactor`), `testStubs` (`createNewWindow`, `clearDMFinished`, `connectivity-changed`, `updateAll`, `gamepadAction`), `mainProcess` (`set-connectivity-online`, `get-connectivity-status`, `getSignInProbeOutcomes`). They are in the umbrella types but no sidecar handler exists. They need schemas for the type derivation but are not in the D-15 registry check. **Open question 1** covers whether they belong in the generated renderer allow-list.
- **Domain type counts (from `ipc/*.ts`):** Sync 60, Async 188, TestSync 6, FrontendMessages 42.
- **`rustInvoke` (sidecar to Rust): 43 channels** in `RUST_INVOKE_CHANNELS` (`sidecarTransport.ts:586`), 43 matching arms in `dispatch_rust_channel`, 6 of them the scanner subset `RUST_SCAN_CHANNELS`. Sidecar call sites of `requestRustInvoke(`: 55 outside tests.

The registered-channel set is the Phase 62 `flowRegistrationCensus.test.ts` `EXPECTED` table territory: it hand-counts `ipcMain.handle`/`ipcMain.on` calls per file and must also be updated if channels move between files (they should not).

## The four validating registrations today

Only a thin pattern exists, so there is little to migrate:
- `shellFilesFlowRegistration.ts:319` `checkDiskSpace` uses `Path.parse(args[0] as string)` from `backend/schemas.ts` as its own validation (T-34.3-01); the comment says it must never be swapped out. It stays; the schema in front of it adds `string.min(1)`.
- `wineToolsFlowRegistration.ts` calls `rendererPathGuard.assertCommandParts` (shape-only: non-empty array of strings). The new schema subsumes the shape; keep the call (D-05).
- `runnerAuthFlowRegistration.ts:143,164` ad hoc `typeof ... !== 'string' || length === 0` checks.
- `runnerMiscFlowRegistration.ts` one zod/`parse` hit, which is `path.parse(exe).dir`, node's `path`, not a validator. This weakens the "4 of 23 validate" premise: `runnerMisc` effectively has no schema validation. Do not treat it as a pattern to copy.
- Other registrations check inline ad hoc (e.g. `handlers.ts` `sidecar:store-fetch` has a `typeof storeName !== 'string'` check plus a name pattern; `bootstrap.ts:366` `handleProtocolUrl` requires a `gamelib://` prefix). These are semantic and stay in place.

`rendererPathGuard.ts` exports `assertContainedPath`, `assertPlausibleAbsolutePath`, `assertCommandParts`, with `PathContainmentError`, `CommandShapeError`, `PathShapeError`.

## zod 3 to 4 port surface

Measured two ways: (1) `tsc` over the 15 files plus `shellFilesFlowRegistration.ts` and `runnerMiscFlowRegistration.ts` (344 source files in the program) with `zod` path-mapped to 4.6.7: **0 errors**; (2) jest with `zod` mapped to 4.6.7 (`moduleNameMapper`) over the zod-touching suites and neighbours (about 860 tests across `crossover_index`, `humble`, `knownFix*`, `bridge/allowlist`, `shellFilesFlows`, `legendary`, `steam/__tests__`): all pass except `steam/__tests__/games.test.ts` "channel constants equal the 56-01 SUMMARY values", which **fails identically under stock zod 3.25.6** (pre-existing, not a port regression). [VERIFIED: ran in this session]

API used across the 15 files and its zod 4 status:

| Usage | File(s) | zod 4 status | Action |
|---|---|---|---|
| `new z.ZodError([{ code: z.ZodIssueCode.custom, ... }])` | `humble/adapter.ts:504-508` | `ZodIssueCode` deprecated but exported; compiles | Replace with `code: 'custom'`; add `input`/`path` if the type now wants them; re-run `adapter.test.ts` |
| `.strict()`, `.passthrough()` | `allowlist.ts`, `knownFixReport.ts`, `humble/adapter.ts` (many) | deprecated aliases of `z.strictObject` / `z.looseObject`, still work | Optional clean-up; `.passthrough()` maps to `looseObject` |
| `.extend`, `.refine(fn, 'msg')`, `.brand`, `.discriminatedUnion`, `z.record(k, v)` (2-arg), `.nullish`, `.int`, `.min/.max`, `z.infer`, `z.ZodType<T>` | various | unchanged | none |
| `.url()`, `.datetime()` | `legendary/commands/base.ts`, `logger/uploader.ts`, `crossover_index/schema.ts` | deprecated in favour of `z.url()` / `z.iso.datetime()`; still work | Optional; behaviour of `.url()` is WHATWG-based in v4, so re-run the URL-shaped tests |
| `.errors` property / `error.format()` | none found | `.errors` removed in v4 | n/a (grep confirms no use) |
| `error.issues` | `fetcher.ts:214`, `humble/adapter.ts:458,493`, `knownFixReport.ts:51` | unchanged | none |
| Error message text | tests asserting zod messages | v4 messages differ ("Invalid input: expected number, received string") | none observed in the run; planner should still grep `toThrow(/` against zod text |

**Version and bundle:**
- Installed 3.25.6; target `^4.6.7`. `pnpm-lock.yaml` changes; `knip`/`depcruise` baselines should not move.
- Bundle probe (same 6-field strict object, esbuild minified, node/cjs): zod 3.25.6 = 60.8 KB, zod 4.6.7 classic = 454.5 KB, `zod/mini` = 23.2 KB. Adding `z.toJSONSchema` costs another ~0.5 KB (it is already included). Unminified: 124 KB, 756 KB, 49 KB. Cause: the classic entry bundles every locale (`zod/v4/locales/*`), which defeats tree shaking. [VERIFIED: esbuild probe in this session]
- **Where it lands:** `build:sidecar` is `esbuild --packages=external` (`package.json:37`), so `build/main/sidecar.js` (2.4 MB) does **not** contain zod; `build/main/sidecar-sea-bundle.js` (14.9 MB unminified) does, via `meta/buildSidecarSea.ts` (no `minify` flag). Expected SEA delta: about +0.6 MB unminified (+4%). CONTEXT D-01's wording ("already bundled into `build/main/sidecar.js`") is slightly off, but the conclusion (not a constraint) holds. The renderer must stay at zero (Pattern 1).
- zod 4 compiles object parsers with `new Function` (JIT). This is fine in Node and in the SEA, and the renderer never runs it. If anything ever runs under a CSP, set `z.config({ jitless: true })`. [ASSUMED: JIT behaviour inferred from `compile.js` appearing in the bundle; not exercised]

## Codegen: JSON Schema shape and generator subset

`z.toJSONSchema()` output measured for the constructs the project will use (draft 2020-12, with a `$schema` key). Always call with `{ io: 'input' }` for argument schemas. In default (output) mode every object gets `additionalProperties:false` and defaulted fields become `required`; in input mode only `strictObject` gets `additionalProperties:false`. [VERIFIED: ran in this session]

| zod | JSON Schema (input mode) | Generator note |
|---|---|---|
| `z.strictObject({a: string.min(1), b: int.min(0).optional(), r: enum})` | `{type:"object", properties:{a:{type:"string",minLength:1}, b:{type:"integer",minimum:0,maximum:9007199254740991}, r:{type:"string",enum:[..]}}, required:["a","r"], additionalProperties:false}` | `.int()` injects a `maximum: 9007199254740991` (safe-integer bound) and `.int()` without `.min` injects a `minimum` too; map `integer` to `i64` and ignore those bounds |
| `z.tuple([string, boolean.optional()])` | `{type:"array", prefixItems:[{string},{boolean}], items:false, minItems:1, maxItems:2}` | positional args. A trailing `.optional()` element lowers `minItems`, it is **not** marked in the item. Derive "optional" from index `>= minItems` |
| `z.tuple([])` | `{type:"array", prefixItems:[], items:false, maxItems:0}` | zero-arg channels (`app_exit`, `clipboard_read_text`) |
| `z.tuple([string], z.number())` (rest) | `prefixItems` plus `items:{type:"number"}` | probably unneeded; fail loudly |
| `z.union([string, number])` | `{type:["string","number"]}` | primitive unions collapse to a **`type` array**, not `anyOf` |
| `z.string().nullable()` | `{type:["string","null"]}` | same array form |
| `z.discriminatedUnion` | `{oneOf:[...]}` | outside the D-16 subset |
| `z.record(string,string)` | `{type:"object", propertyNames:{type:"string"}, additionalProperties:{type:"string"}}` | outside the subset unless a Rust arm needs a map |
| `z.looseObject` | `additionalProperties:{}` | the D-07 explicit passthrough marker; Rust side `serde_json::Value` is acceptable *only* for these and must be an explicit, named exception |
| `z.literal('a')` | `{type:"string", const:"a"}` | |
| `z.url()` | `{type:"string", format:"uri"}` | |
| `.brand()`, `.refine()` | silently dropped (`{type:"string"}`) | refine logic is invisible to Rust, which is acceptable because the sidecar is the one validator |
| `.transform()` | **throws** "Transforms cannot be represented in JSON Schema" | rustInvoke schemas must not use transforms or `preprocess`; the `nullish` helper (Pattern 4) is representable, a `preprocess` is not |
| `z.void()`, `z.function()` | **throw** | return types are not schemas; keep out of arg tuples |
| `z.unknown()` | `{}` (no type) | generator must either map to `serde_json::Value` or fail; per D-16 treat as outside the subset unless explicitly allowed |

**Generator requirements derived from this table:** read `type` as string or string-array; handle `prefixItems` + `minItems`/`maxItems` for positional tuples; handle `const`/`enum`; treat `minimum`/`maximum` on integers as noise; `required` list drives `Option<T>` on object fields; unknown JSON Schema keywords must throw (fail loudly, D-16). Output: per-channel `pub struct <Name>Args { ... }` with named fields plus `pub fn from_args(args: &[Value]) -> Result<Self, String>` that indexes positionally and `serde_json::from_value`s each element. Avoid relying on serde tuple-struct `default` for trailing optionals. [ASSUMED: serde's handling of `#[serde(default)]` on trailing tuple-struct fields was not verified; named fields plus a hand-emitted `from_args` avoid the question.] Do not emit `#[serde(deny_unknown_fields)]` on `rustInvoke` args: the sidecar sends whole Electron-shaped option objects (for example `dialog_open` options carry more keys than Rust reads), and the arguments are sidecar-produced and compile-time typed (D-13).

**Pinned error strings (must be preserved or updated everywhere in one commit):** `keyring:bad-args`, `keyring:unknown-slot`, `store_embed_open:bad-args[:url|:x|:y]`, `humble_login_cookies_for_domain:bad-args`, and 32 `bad-args` occurrences in `store_embed.rs`, 20 in `main.rs`, 10 in `login_window.rs`, 1 in `clipboard.rs`. `keyringTokenStore.ts` classifies `keyring:bad-args` and `keyring:unavailable:*` as `'unavailable'`. The generator's `from_args` error must return the same string per channel, e.g. `format!("{channel}:bad-args")`.

**Test coupling to Rust source text (budget for it):** `tauriShellSource.test.ts` (pins literal source lines, e.g. around line 1177 the `ok_or_else(|| "humble_login_cookies_for_domain:bad-args"...)` lines), `storeEmbedWireContract.test.ts` plus `meta/fixtures/store-embed-wire-args.json` (asserted from both TS and Rust `mod tests` in `main.rs`), `rustInvokeChannel.test.ts`, `scanChannelParity.test.ts`, `longRunningChannels.test.ts`, `abandonedInvokeAttribution.test.ts`, `keyringDiagPersistence.test.ts`, `scannerPortComplete.test.ts`. Run all of them after each Rust arm conversion. The shared fixtures are a ready-made oracle: generated structs must still parse the fixture bytes.

### What 62-04 pins today and what replaces it

`src/backend/sidecar/__tests__/transportParity.test.ts` (5 tests):
1. five `// transport-mirror: NAME` markers appear exactly once across `src-tauri/src/*.rs`: `READY_SENTINEL`, `FRONTEND_MESSAGE_EVENT`, `SHELL_WINDOW_FOCUSED`, `STORE_SNAPSHOT_CHANNEL`, `RUST_INVOKE_KIND` (the last is `kind == Some("rustInvoke")`, not a const);
2. each marked value equals the TS export;
3. string-literal arms of `dispatch_rust_channel` equal `RUST_INVOKE_CHANNELS` (a hand-written brace/paren-depth scanner over Rust source);
4. and 5. near-miss self-tests of the extractors.

The mirrors live in `sidecar.rs:4-23` (consts) and `sidecar.rs:~492` (the `rustInvoke` comparison) and the arm list in `store_embed.rs:1810`. Retirement per D-17: once `ipc_contract.rs` emits those four consts plus the kind, delete the markers and tests 1, 2, 4; once `dispatch_rust_channel` matches on the generated `RustInvokeChannel` enum (exhaustive `match`, compiler-enforced), delete test 3 and 5, and with them the file. Replace with `check:ipc-contract`, which is a strictly stronger gate (a missing arm becomes a compile error, not a text scan).

**Sequencing hazard:** if the arms are converted incrementally (some on the generated enum, some still string arms), test 3 must keep passing for the remainder. The cleanest split is: plan N emits constants and the channel-name enum with a `from_str` and leaves arm bodies alone; plan N+k migrates arm bodies to `XxxArgs::from_args` in batches that mirror the dispatch order.

## Ratchet

Phase 62 patterns to reuse (all measured in this repo): (a) **jest census with an in-file `EXPECTED` table**, `flowRegistrationCensus.test.ts` ("update this table in the SAME commit that adds or removes a channel"); (b) **explicit dated allowlist** with an owner-less tripwire, `ipcDomainCensus.test.ts`'s `NO_REGISTRATION_OWNER` (currently 65 entries); (c) **`meta/*Ratchet.cjs` + baseline json + jest test** (`indexedAccessRatchet.cjs` + `indexedAccessBaseline.json`, `knipRatchet.cjs` + `knip-baseline.txt`, `clippyRatchet.cjs`); (d) `meta/lintScoped.cjs` equality ceilings ("N-1 must be RED and N must be GREEN").

**Recommendation:** pattern (a), single file `src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts`. It boots `backend/sidecar/handlers` (the probe took under 1 s), computes `unvalidated = registered channels (handle + on + bootstrap's handleProtocolUrl + the 6 TestSync via addTestOnlyListener under CI=e2e) minus keys of channelSchemas`, and asserts `toBe(CEILING)` as an **equality** ceiling by bucket (invoke, send, test-only, push). Every converting plan lowers the constant in the same commit. At zero, delete the constant and the buckets and assert `unvalidated` equals `[]`, with no exemption list (D-15). A guard that the schema map has no extra keys that are not registered or declared (a typo in a channel name would otherwise count as converted) belongs in the same file; reuse `ipcDomainCensus`'s `NO_REGISTRATION_OWNER` for declared-but-unregistered channels. Include a mutation proof (delete one schema, expect red) in the first plan, following the 62-04 summary's "drift proofs run" practice.

## Typed contract file placement

The roadmap says generate "TS channel types and the Rust-side...". Because D-04 keeps the schemas as the TS source of truth, no generated TS is needed for the channel types themselves. TS-generated output is limited to what Rust needs mirrored back, which is nothing: `sidecarTransport.ts` stays the source of constants (D-17). So only `src-tauri/src/ipc_contract.rs` is a checked-in generated artefact, and `check:ipc-contract` compares that one file (plus a TS manifest only if the planner decides one is useful for the renderer allow-list, e.g. for a parity unit test).

**Generator input:** import `channelSchemas` (plus the `rustInvoke` schema map and the transport constants) from `common/types/...` in `meta/genIpcContract.ts`; run via `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genIpcContract.ts`. Check that `runTs.cjs` bundling resolves the repo's `baseUrl: ./src/` imports (the existing meta scripts import from `../src/...` relatively; `meta/jest.config.js` carries `modulePaths: [compilerOptions.baseUrl]`). Use relative imports inside the schema files that the generator pulls in. Output formatting: no `rustfmt.toml` in the repo and no `cargo fmt` in CI, so the emitter must format by construction; generated Rust must also be clippy-clean because `meta/clippyRatchet.cjs` counts warnings (emit `#![allow(...)]` only if needed and justified in the header).

**Renderer allow-list set:** derive from `channelSchemas` where `kind` is `invoke` or `send` and `caller` is `renderer`. Channels called only by the Rust shell (`trayResolveRunner`, `shellWindowFocused`, `handleProtocolUrl`, and per `sidecar:store-snapshot`) are written by Rust itself and do not cross `relay_commands.rs`, so including them in the renderer list would hand the renderer channels it never needed. Tag each schema entry `caller: 'renderer' | 'shell'`. Note the preload also invokes the store channels (`STORE_FETCH_CHANNEL`, `STORE_NEW_CHANNEL`, store set/delete) through `sidecar_invoke`/`sidecar_send`, so those stay on the renderer list. Confirm each against `tauriTransport.ts` call sites when writing the tags.

**Relay change (D-14):** add `fn is_renderer_channel(&str) -> bool` over a generated `&[&str]` in `ipc_contract.rs`, called first in `sidecar_invoke` (return `Err("[GAMELIB_IPC_INVALID_CHANNEL] ...")`; a bare `Err(String)` already reaches the renderer as a rejection) and `sidecar_send` (log with `shell_eprintln!` carrying the channel name only, return `Err`). Keep `SidecarRpcRequest` untouched. Rust unit-test it as a pure function, no `State` needed (`relay_commands.rs` has no tests today; `main.rs` hosts `mod tests`).

## Common Pitfalls

### Pitfall 1: `undefined` becomes `null` over the wire
**What goes wrong:** every optional positional arg a renderer forwards as `undefined` arrives as `null` and a `.optional()` schema rejects a previously working call.
**Why:** JSON array serialization in Tauri `invoke` and the stdio frame.
**Avoid:** `optionalArg()` = `.nullish()` for renderer-to-sidecar positional optionals (Pattern 4); test every schema against `JSON.parse(JSON.stringify(args))`.
**Warning signs:** a send channel (silent drop) that "stops working" after conversion with only a warn line in `gamelib.log`; no renderer error appears for sends.

### Pitfall 2: Tuple arity is strict
`z.tuple([...])` rejects extra arguments. Preload factories forward `...args` verbatim, so a call site that passes a stray extra argument (or an Electron event) now fails. With D-04, `tsc` catches typed call sites, but untyped paths (`window.api` wrappers in `frontend/` using spreads, `Parameters<>` forwarding) can escape. Run `pnpm codecheck` in every conversion plan.

### Pitfall 3: Wrapping `handle()` instead of dispatch
Breaks the ~83 sidecar test files that call registry handlers with loose args. Use Pattern 2.

### Pitfall 4: Census parser vs mapped types
`ipcDomainCensus.test.ts` parses `export interface <Domain><Kind>` blocks with a regex; converting interfaces to mapped type aliases makes it count zero keys and the umbrella-intersection check goes silent rather than red. Update the parser in the same plan that converts the first domain, and add a floor assertion (channel count must not drop to zero).

### Pitfall 5: zod leaking into the renderer bundle
A single value-form import of a `common/types/ipc/*.ts` file from `src/frontend` or `src/preload` adds ~450 KB minified. Add a lint or bundle gate in the first schema plan.

### Pitfall 6: Logging values
zod issue `message`, `error.format()`, and `unrecognized_keys.keys` can include caller-controlled text. Log channel plus `path` plus `code` only (D-10). `credentials` channels (`steamAuth`, `runnerAuth`, `oauthLogin`, `humbleLogin`) carry tokens, codes and cookies.

### Pitfall 7: Sidecar exit contract
The validator must add no timers, watchers or boot-time in-flight work. `safeParse` is synchronous and holds no handles, so the contract is met by construction; do not add a lazy "compile all schemas at boot" step, because the sidecar exits by event-loop drain at stdin EOF and `smoke:sidecar` misses slow exit. If schema construction is expensive, build lazily on first use, not in a boot `setImmediate`. (Convention from `Skill("gamelib-conventions")` as summarised in CLAUDE.md.)

### Pitfall 8: Rust error-string and source-text pins
See "Test coupling to Rust source text". Convert Rust arms in small batches with the full Rust-reading jest set plus `cargo test --bin gamelib-shell` after each.

### Pitfall 9: Generated-file staleness and pre-commit cost
`.husky/pre-commit` currently only runs a staged-content prettier check. Adding `check:ipc-contract` there means a Node bundle compile on every commit; keep it fast (skip when no staged path matches `common/types/ipc/`, `sidecarTransport.ts`, `meta/genIpcContract.ts`, or `src-tauri/src/ipc_contract.rs`). The hook's header notes it is skipped by rebase, cherry-pick and `--no-verify`, so CI (`codecheck.yml`) is the real gate. `cargo build` must not require Node, which is satisfied because the generated file is committed.

### Pitfall 10: Generated Rust formatting under prettier
Prettier ignores `.rs`, but the generated TS (if any) is subject to the staged prettier check. The `<verify>` convention requires `npx prettier --check` over exact paths written; run `--file-info` first and omit the check for prettier-ignored paths rather than carry a vacuous green.

## Code Examples

### Validation call in the dispatch funnel

```ts
// src/backend/sidecar/sidecarRpc.ts (sketch of the two insertion points)
async function dispatchInvoke(request: SidecarRpcRequest): Promise<void> {
  const handler = handlerRegistry.get(request.channel)
  if (!handler) { /* unchanged UNPORTED_CHANNEL_MARKER path */ return }
  const verdict = validateInbound(request.channel, 'invoke', request.args)
  if (!verdict.ok) {
    logRejection(verdict) // channel + paths + codes only
    writeLine({ id: request.id, ok: false,
      error: `${IPC_INVALID_ARGS_MARKER} ${JSON.stringify({ code: IPC_INVALID_ARGS, channel: verdict.channel, paths: verdict.paths })}` })
    return
  }
  /* existing try { await handler(undefined, ...request.args) } */
}

function dispatchSend(request: SidecarRpcRequest): void {
  const verdict = validateInbound(request.channel, 'send', request.args)
  if (!verdict.ok) { logRejection(verdict); return } // D-09
  /* existing listener loop */
}
```

### Generator core (shape only)

```ts
// meta/genIpcContract.ts
const js = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema
function rustType(s: JsonSchema, ctx: string): string {
  const t = Array.isArray(s.type) ? s.type : [s.type]
  const nullable = t.includes('null'); const base = t.filter((x) => x !== 'null')
  if (base.length !== 1) throw new Error(`${ctx}: unsupported multi-type ${JSON.stringify(s.type)}`)
  const inner = base[0] === 'string' ? 'String' : base[0] === 'integer' ? 'i64'
    : base[0] === 'number' ? 'f64' : base[0] === 'boolean' ? 'bool'
    : base[0] === 'array' ? `Vec<${rustType(s.items as JsonSchema, ctx + '[]')}>`
    : (() => { throw new Error(`${ctx}: unsupported type ${base[0]}`) })()
  return nullable ? `Option<${inner}>` : inner
}
// unknown top-level keywords: throw (D-16 "fail loudly")
```

### Census ceiling test (shape only)

```ts
const CEILING = { invoke: 185, send: 54, testOnly: 6, push: 42 } // lower in the same commit as each conversion
test('unvalidated channel count never rises', async () => {
  const { handlerRegistry, listenerRegistry } = await import('backend/platform')
  await import('backend/sidecar/handlers')
  const missing = [...handlerRegistry.keys()].filter((c) => !(c in channelSchemas))
  expect(missing.length).toBe(CEILING.invoke)
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `zod` 3, `ZodIssueCode`, `.strict()`, `.passthrough()` | zod 4: `z.strictObject`, `z.looseObject`, string-literal issue codes, built-in `z.toJSONSchema()` | zod 4.0 (stable; 4.6.7 current as of 2026-10) | `zod-to-json-schema` third-party package is not needed |
| `.url()` / `.datetime()` on `z.string()` | top-level `z.url()`, `z.iso.datetime()` | zod 4 | old forms deprecated, still work |
| `error.errors` | `error.issues` only | zod 4 | repo already uses `.issues` |

**Deprecated/outdated:** `zod/v3` compat subpath (explicitly not to be left behind, D-02); `zod-to-json-schema` (not needed).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | zod 4 JIT (`new Function`) is benign in the Node sidecar and SEA, and never runs in the renderer | zod port surface | If the SEA or a CSP forbids it, parsing throws at first use; mitigated by `z.config({ jitless: true })` and caught by the first conversion test under `smoke:sidecar` |
| A2 | serde derive handling of `#[serde(default)]` on trailing tuple-struct fields (reason the generator uses named fields plus `from_args`) | Codegen | Low: the recommended design avoids depending on it |
| A3 | Which channels are called only by the Rust shell (`trayResolveRunner`, `shellWindowFocused`, `handleProtocolUrl`, `sidecar:store-snapshot`) and so belong off the renderer allow-list | Typed contract placement | If wrong, either a legitimate renderer call is blocked (visible, fast) or a shell-only channel is exposed (silent); verify against `tauriTransport.ts` and Rust writers before tagging |
| A4 | Domain attribution of the 2 name-collision channels (`legendary`, `steam` rows) | Channel inventory | Cosmetic; the plan splits by registration file anyway |
| A5 | `window.ts` / testStubs / mainProcess declared-but-unregistered channels (18) are handled outside the sidecar (Rust or preload) and need no runtime schema | Channel inventory | If some are actually dispatched somewhere not seen in the registry dump, the D-15 count is off by that many; confirm with the planner's first census run |

## Open Questions (RESOLVED)

1. **Should the 18 declared-but-unregistered window/testStub/mainProcess channels be on the generated renderer allow-list?**
   - Known: they appear in `SyncIPCFunctions`/`AsyncIPCFunctions` but no sidecar handler exists, so today they reach `dispatchInvoke` and get `UNPORTED_CHANNEL_MARKER` (or are dropped for send).
   - Unclear: whether the renderer actually calls them through `sidecar_invoke` anywhere (window controls may go through Tauri window APIs directly).
   - Recommendation: generate the list from channels that are both declared and have `caller: 'renderer'`, and have the planner grep `window.api.minimizeWindow` etc. in the first plan; remove truly dead declarations rather than allow-listing them.
   - RESOLVED: 67-18 Task 2 tags the window, preload-served and dead channels `caller: 'local'` with grep evidence recorded per channel, and 67-19 Task 1 generates `RENDERER_CHANNELS` only from entries with `caller: 'renderer'`, so none of them reach the relay allow-list.

2. **Where do the 10 undeclared channels' schemas live, and do `storeSet/storeDelete/storeNew` take structured payloads that need D-07-style passthroughs?**
   - Known: they are registered by `storeWriteHandlers.ts` and `handlers.ts`, with policy in `common/types/storePolicy.ts` (`isAllowedStoreField`, `isSafeKeyPath`, `isWritableStoreField`).
   - Recommendation: schema checks the envelope (store name string, key path array/string), leave field policy in `storePolicy.ts`.
   - RESOLVED: 67-18 Task 1 creates `sidecarInternal.ts` for the ten channels; `storeSet/storeDelete/storeNew` get envelope-only schemas (bounded store name, key-path shape, JSON value) and field policy stays in `storePolicy.ts`.

3. **`shellFiles` has 17 send channels, several with tuple-as-single-argument (`removeFolder: ([path, folderName])`).** Confirm call-site shapes before writing the tuple; `removeFolder` shape validation is Phase 67's part, containment is Phase 72's (CONCERNS.md).
   - RESOLVED: 67-05 Task 1 confirms the shapes against the call sites and validates `removeFolder` as a nested strict tuple (shape only; containment stays Phase 72).

4. **Does `bootErrorSurface.ts` substring-match anything that `[GAMELIB_IPC_INVALID_ARGS]` could trip?** It matches `[GAMELIB_UNPORTED_CHANNEL]` only; verify no catch-all path hijacks the page on any rejection.
   - RESOLVED: 67-04 found that every non-unported pre-mount rejection paints the page; its Task 2 adds `classifyBootError` so `[GAMELIB_IPC_INVALID_ARGS]` warns and continues (and 67-19 does the same for the invalid-channel marker).

## Runtime State Inventory

Not a rename/refactor phase. The only migration-like element is the zod major bump.
- Stored data: none -- zod schemas validate in-flight data and some persisted JSON reads (`humble/adapter.ts`, `crossover_index`), which are read-only parse paths; v4's behavioural differences (stricter `.url()`) could newly reject a stored value. Re-run the adapter and crossover tests (done in this session: green).
- Live service config: none.
- OS-registered state: none.
- Secrets/env vars: none.
- Build artifacts: `pnpm-lock.yaml` changes; `build/main/sidecar-sea-bundle.js` grows; stale `build/` bundles need a rebuild before live testing (`tauri dev` does not rebuild the sidecar, per project memory).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | generator, jest | yes | v22.23.4 | -- |
| pnpm | scripts | yes | 10.28.0 | -- |
| cargo | Rust arms, `cargo test --bin gamelib-shell` | yes | 1.99.1 | -- |
| npm registry | zod install | yes | zod 4.6.7 resolved | -- |

**Missing dependencies:** none. Not probed this session: Linux/Windows legs (CI-only), and whether `cargo test --bin gamelib-shell` currently passes locally (CI notes a historical red on both legs, see `rust-test.yml` header).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | jest 29-style multi-project (`jest.config.js` projects: backend, common, frontend, preload, meta, relay) + `cargo test --bin gamelib-shell` |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js`, `src/backend/jest.config.js`, `meta/jest.config.js` |
| Quick run command | `npx jest src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` |
| Full suite command | `pnpm test:ci` plus `pnpm codecheck` plus `cd src-tauri && cargo test --bin gamelib-shell` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| V67-A | zod 4 installed, 15 files compile and their suites pass | unit + typecheck | `pnpm codecheck && npx jest crossover_index humble knownFix bridge/__tests__/allowlist shellFilesFlows` | existing suites; Wave 0 none |
| V67-B | invalid args rejected before handler; typed marker on invoke; send dropped; no values in logs | unit (real `startRpcServer` over PassThrough, as `storeEmbedFlows.test.ts` does) | `npx jest src/backend/sidecar/__tests__/ipcValidation.test.ts` | Wave 0 gap |
| V67-B | JSON round-trip (`undefined` to `null`) accepted for optional args | unit | same file | Wave 0 gap |
| V67-B | renderer receives `IpcValidationError` | unit (preload jest project) | `npx jest src/preload` for the new file | Wave 0 gap |
| V67-C | no zod value import reaches renderer/preload | lint or bundle test | `pnpm lint:src` or a new jest test over the vite output | Wave 0 gap |
| V67-C | census parser reads schema-derived domain files | unit | `npx jest ipcDomainCensus flowRegistrationCensus` | existing, must be updated |
| V67-D | unvalidated ceiling equality, then zero-exemption | unit | `npx jest ipcSchemaCoverage` | Wave 0 gap |
| V67-E | generator subset, loud failure on out-of-subset schema | unit | `npx jest meta/__tests__/genIpcContract.test.ts` | Wave 0 gap |
| V67-E | generated Rust is fresh | script | `pnpm check:ipc-contract` | Wave 0 gap |
| V67-E | generated structs parse the shared wire fixtures | Rust unit | `cd src-tauri && cargo test --bin gamelib-shell store_embed_wire_contract` | existing |
| V67-E | relay rejects non-allow-listed channel | Rust unit | `cd src-tauri && cargo test --bin gamelib-shell ipc_contract` | Wave 0 gap |
| V67-F | transportParity retired per covered mirror | unit | `npx jest transportParity` until deleted | existing |

### Sampling Rate

- **Per task commit:** the quick command for the touched domain plus `npx tsc --noEmit` (via `pnpm codecheck`), plus `pnpm check:ipc-contract` once it exists.
- **Per wave merge:** `pnpm test:ci` (backend project covers the sidecar census), `cargo test --bin gamelib-shell` for any wave that touched Rust.
- **Phase gate:** full suite green, `pnpm check:ipc-contract` green, `ipcSchemaCoverage` at zero with no exemptions, `smoke:sidecar` run (the exit contract is invisible to unit tests), then `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `src/backend/sidecar/__tests__/ipcValidation.test.ts` -- covers V67-B, including JSON round-trip and a log-capture assertion that no argument value appears
- [ ] `src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` -- covers V67-D
- [ ] `meta/__tests__/genIpcContract.test.ts` -- covers V67-E (use `createFakeHomeProfile()` for any spawned CLI)
- [ ] A renderer-bundle guard for V67-C
- [ ] Framework install: none (jest and cargo already present)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | not changed; schemas on `steamAuth`/`runnerAuth`/`oauthLogin`/`humbleLogin` channels reject malformed credential inputs before they reach auth code |
| V3 Session Management | no | -- |
| V4 Access Control | yes | Rust-side channel allow-list (D-14) limits which channels the renderer can name; shell-only channels excluded |
| V5 Input Validation | yes | zod schemas at the dispatch funnel; strict objects (D-06) |
| V6 Cryptography | no | -- |
| V7 Logging | yes | D-10: channel plus key paths plus codes only; check `meta/logSecretGate.ts` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile embedded store page or login webview calling arbitrary channels | Elevation of privilege | Generated relay allow-list plus per-channel arg schema |
| Unknown-key smuggling into option objects | Tampering | `z.strictObject` envelope; explicit `looseObject` passthrough marked for Phase 70 |
| Credential leakage via validation error logs | Information disclosure | Log paths and codes only; never `message`, `input`, or issue `keys` untruncated |
| Memory exhaustion from validator | Denial of service | zod `>=4.6.6` (the advisory in CONCERNS.md); also bound array lengths and string lengths on hot hostile-reachable channels (`.max()`), since D-05 permits cheap invariants |
| Type confusion via `null`/`undefined` positional args | Tampering | `optionalArg` helper; tuple arity strict |
| Path traversal / URL scheme abuse | Tampering | Out of scope here: Phase 72 (containment, scheme allow-list). Shape-only here: non-empty, absolute-path format, http(s) format |

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on Rust/Tauri; do not raise upstream-Heroic mergeability as a concern.
- The Steam stack decision is frozen (`.planning/research/STEAM-STACK.md`); this phase does not touch it.
- **Conventions skill** (`Skill("gamelib-conventions")`): every task's `<verify>` runs `npx prettier --check` over the exact paths written, scoped, never `.`; check `--file-info` first and omit the check where every path is prettier-ignored. `src/preload/.prettierrc` has a different `printWidth` (120). Sidecar timers/watchers/sockets must `unref()` and leave no unbounded boot work. Spawned child processes in `src/` or `meta/` use `createFakeHomeProfile()`. Todo files need `severity:`/`platform:`/`ready:`. UAT item shape rules apply to any `*-UAT.md` edit.
- Work goes through a GSD command; use `/gsd-...` hyphen form in any text.
- `pnpm tauri:dev` (not `:run`) for live dev; `tauri dev` does not rebuild the sidecar, so restart and check `sidecar.js` mtime before live-testing backend changes. A fresh worktree needs `build:sidecar-sea` plus a vite build before `tauri:dev:run`.
- Use `graphify query` for codebase orientation; never read `GRAPH_REPORT.md` or `graph.json` whole; run `graphify update .` after code changes.
- `.planning/research/ARCHITECTURE.md` predates the Tauri shell (Electron model); do not use it for process or IPC structure.

## Sources

### Primary (HIGH confidence)
- This repo, read directly: `src/backend/platform/index.ts:160-190`, `src/backend/sidecar/sidecarRpc.ts` (dispatch, `requestRustInvoke`), `src/common/types/sidecarTransport.ts`, `src/common/types/ipc/*.ts`, `src/backend/sidecar/__tests__/{transportParity,ipcDomainCensus,flowRegistrationCensus}.test.ts`, `src-tauri/src/{relay_commands,sidecar,store_embed}.rs`, `src/preload/{ipc,tauriTransport}.ts`, `package.json`, `.husky/pre-commit`, `.github/workflows/{codecheck,rust-test}.yml`, `meta/{runTs.cjs,lintScoped.cjs,buildSidecarSea.ts}`, `.planning/phases/62-.../62-04-SUMMARY.md`
- Runtime registry dump (jest probe, deleted after use): 185 handle / 54 on
- zod 4.6.7 installed into a scratch directory: `z.toJSONSchema` output, issue shape, bundle size probes
- `tsc` with path-mapped zod 4.6.7 over the 15 files (0 errors) and jest with `moduleNameMapper` to zod 4.6.7 (green apart from a pre-existing failure)
- `npm view zod` (version 4.6.7, no postinstall, repository colinhacks/zod)

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONCERNS.md` for the zod advisory floor (4.6.6) and the renderer-path concerns

### Tertiary (LOW confidence)
- None used. Context7/ctx7 was not consulted; zod behaviour was measured directly instead of read from docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- version resolved, port measured by typecheck and jest
- Architecture: HIGH for the TS side (single production reader of the registries confirmed); MEDIUM for the Rust side (no generator spike, large test coupling to Rust source text)
- Pitfalls: HIGH for `undefined` to `null`, strict arity, census-parser break (reasoned from code, JSON behaviour is standard); MEDIUM for pre-commit cost

**Research date:** 2026-11-07
**Valid until:** 2026-12-07 (zod is on a fast patch cadence; re-check `npm view zod version` at planning time)
