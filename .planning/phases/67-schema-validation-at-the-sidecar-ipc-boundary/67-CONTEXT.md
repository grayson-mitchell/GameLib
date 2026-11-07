# Phase 67: Schema validation at the sidecar IPC boundary - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Every channel the sidecar serves to the renderer has a zod schema. The arguments are checked once,
in the shared `ipcMain.handle`/`ipcMain.on` registration path, before the handler runs. A
malformed or hostile call is rejected at the boundary and never reaches store, file or process
code. The same schemas are the single source for the TypeScript channel types, and for the Rust
code that mirrors the IPC contract by hand today: the renderer channel-name allow-list in the
relay, the `rustInvoke` channel enum and argument structs, and the transport constants. A `pnpm`
script generates that code, and CI fails if it is stale.

The phase ends when a test asserts that every registered channel has a schema, with no
exemptions. Until then, a shrink-only ratchet tracks the unvalidated count.

Not in this phase:
- Semantic allow-lists, such as path containment against install roots or the URL scheme
  allow-list for `openExternalUrl`/`openFolder`. Phase 72 owns those.
- Reshaping `GameInfo`. Phase 70 owns that.

</domain>

<decisions>
## Implementation Decisions

### Validator and zod version
- **D-01: zod 4 is the validator.** Bump `zod` to `>=4.6.6`, which closes the high-severity
  memory-exhaustion advisory `.planning/codebase/CONCERNS.md` records against `zod <4.6.6`. Use
  zod 4's built-in `z.toJSONSchema()` for codegen (D-16). Bundle size isn't a constraint: zod is
  already bundled into `build/main/sidecar.js`.
- **D-02: The first plan ports all 15 existing zod files to the zod 4 API**, with the suite
  green, before any channel schema is written. No `zod/v3` compatibility subpath is left behind.
  The 15 files: `backend/schemas.ts`, `backend/protocol.ts`, `crossover_index/schema.ts`,
  `crossover_index/fetcher.ts`, `logger/uploader.ts`, `humble/adapter.ts`,
  `utils/filesystem/windows.ts`, `utils/systeminfo/gpu/{linux,windows}.ts`,
  `utils/systeminfo/osInfo/windows.ts`, `steam/bridge/allowlist.ts`,
  `steam/bridge/bridgeVerdict.ts`, `legendary/commands/{base,eos_overlay}.ts`,
  `common/knownFixReport.ts`.
- **D-03: Phase 67 owns the zod bump.** Remove zod from Phase 72's supply-chain group in
  ROADMAP.md. That group keeps undici, follow-redirects, the audit job and the Linux compile leg.
- **D-04: Argument types are inferred from the schemas with `z.infer`, in the same
  `src/common/types/ipc/<domain>.ts` files.** The `AsyncIPCFunctions`/`SyncIPCFunctions`/
  `TestSyncIPCFunctions`/`FrontendMessages` entries are derived from the schemas, and the
  hand-written argument types are deleted so the two can't drift. The frontend and preload
  already import these files. They should import zod for types only where possible, and zod
  must not enter the renderer bundle unless it's needed.

### Validation depth and rejection behaviour
- **D-05: Schemas check shape, plus cheap invariants that need no app state.** Examples:
  non-empty strings, absolute-path format, http(s) URL format, enum members (e.g. `runner`),
  integer ranges. A schema never reads settings or the filesystem. Containment against
  configured roots (`rendererPathGuard.ts`'s `assertContainedPath`) and scheme/path allow-lists
  stay in handlers or go to Phase 72. Existing `rendererPathGuard` calls are kept, not replaced.
- **D-06: Unknown keys are rejected (strict objects).** An undeclared key fails the call. Every
  legitimate optional field has to be declared.
- **D-07: Large structural payloads get lighter schemas now, and Phase 70 tightens them.** For
  `GameInfo`-carrying arguments and settings writes (`setSetting`, `writeConfig`, …), the schema
  checks what the handler actually reads (e.g. `appName` plus a `runner` enum, or a settings key
  enum with a per-key value type where that's cheap). Strict mode applies to the declared
  envelope, and the large nested object is marked as an explicit passthrough, which makes it
  greppable for Phase 70.
- **D-08: A rejected `invoke` rejects the renderer's promise with a recognisable typed error.**
  Code `IPC_INVALID_ARGS`, plus the channel and zod issue paths. It travels the existing
  `{id, ok:false, error}` path in `sidecarRpc.ts` and never throws into the transport. Channel
  return types don't change, and there's no result-union migration.
- **D-09: A rejected fire-and-forget `send` (`ipcMain.on`) is logged and dropped.**
- **D-10: Rejection logs name the channel and the failing key paths, never the argument
  values**, because some channels carry credentials, OAuth codes or cookies.

### Directions in scope
- **D-11: Renderer→sidecar (`invoke` and `send`) is validated at runtime.** This is the trust
  boundary, because the renderer hosts embedded store pages and login webviews.
- **D-12: Sidecar→renderer push messages (`FrontendMessages`) get schemas for types and codegen
  only, with no runtime check.** The sender is trusted and these are hot paths. They're counted
  in their own ratchet bucket so "every channel has a schema" still reaches zero.
- **D-13: `rustInvoke` (sidecar→Rust, the `RUST_INVOKE_CHANNELS` allow-list in
  `sidecarTransport.ts`, dispatched by `dispatch_rust_channel` in `store_embed.rs`) is the main
  Rust codegen target.** Each channel gets a zod schema. The generator emits a Rust channel enum
  and serde argument structs that replace the hand-written `value.get(...)` parsing in the
  dispatch arms. The sidecar doesn't re-check its own outgoing `rustInvoke` arguments at runtime;
  the types already enforce them at compile time.
- **D-14: The Rust relay enforces a generated renderer channel-name allow-list.**
  `sidecar_invoke`/`sidecar_send` (`src-tauri/src/relay_commands.rs`) reject a channel name that
  isn't in the generated list before it crosses the pipe. Arguments are validated only in the
  sidecar, so there is one validator in one place.
- **D-15: Every registered channel needs a schema, test-only and dev-only channels included**
  (e.g. `TestSyncIPCFunctions`, `devEpicCookieSweepRegistration`). The final test reads
  `handlerRegistry`/`listenerRegistry` and allows no exemptions.

### Rust contract generation
- **D-16: Pipeline is zod → `z.toJSONSchema()` → a project-owned TypeScript generator that
  emits Rust.** The generator supports a deliberately small subset: string, number/integer,
  boolean, enum, literal, optional, array and object, plus whatever else the real `rustInvoke`
  schemas prove they need. A schema outside the subset fails generation loudly. No new Rust
  crate dependency (no `typify`), and the output reads like hand-written serde code.
- **D-17: The transport constants move into the generated contract.** `sidecarTransport.ts`
  stays the source, and the generator emits `READY_SENTINEL`, `FRONTEND_MESSAGE_EVENT`,
  `SHELL_WINDOW_FOCUSED`, `STORE_SNAPSHOT_CHANNEL` and `RUST_INVOKE_KIND` into the Rust module.
  The hand-written Rust consts and their `// transport-mirror:` markers in `sidecar.rs` are
  deleted. The 62-04 marker parity test (`transportParity.test.ts`) is retired for each mirror
  the generated code covers, and deleted outright once it covers none.
- **D-18: Generated files are checked in, and CI fails if regenerating changes them.**
  Both the TS and Rust outputs carry a do-not-edit header. `pnpm gen:ipc-contract` writes them,
  and `pnpm check:ipc-contract` regenerates and fails on any diff. It runs in CI and in
  `.husky/pre-commit`. `cargo build` keeps working without Node.
- **D-19: Phase 67 runs before Phase 71.** The generated contract replaces the dispatch arms'
  hand-written parsing and the marker consts first, so Phase 71 moves smaller files and has no
  markers left to preserve. This fits 71's own wording: "or removed once Phase 67's generated
  contract replaces them".

### Coverage and enforcement (from ROADMAP, restated so the planner has it in one place)
- **D-20:** Convert domain by domain, starting with channels that touch files, processes,
  credentials or URLs (e.g. `shellFiles`, `install`, `wineTools`, `runnerAuth`, `steamAuth`,
  `oauthLogin`, `humbleLogin`, `storeEmbed`). Track the unvalidated count with a shrink-only
  ceiling in the Phase 62 D-14 style. Each plan that converts channels lowers the ceiling in the
  same commit. At zero, the ceiling becomes the D-15 assertion.

### Claude's Discretion
- How the typed error is encoded on the wire (D-08): a structured `error` object, or a
  marker-prefixed string like the existing `UNPORTED_CHANNEL_MARKER` in `sidecarRpc.ts`. Also
  the name and location of the renderer-side `IpcValidationError` class.
- How a schema is attached to a registration: a typed `registerChannel(channel, schema,
  handler)` wrapper, or a schema map that `platform/index.ts`'s `ipcMain.handle` looks up.
  Either way, validation happens once, in the shared path, not in each handler.
- Where the generator script lives (`meta/`) and where the Rust output goes (e.g.
  `src-tauri/src/ipc_contract.rs`), plus the exact npm script names.
- The plan and wave breakdown, and how domains are batched per plan.
- Whether to replace the ad hoc `typeof` checks in `runnerAuthFlowRegistration.ts` and similar
  once the schema covers them, or leave them as harmless redundancy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and neighbours
- `.planning/ROADMAP.md` §"Phase 67" — goal, three parts, open questions (now answered above)
- `.planning/ROADMAP.md` §"Phase 70", §"Phase 71", §"Phase 72" — the GameInfo split (D-07), the
  Rust module split (D-19), and the trust-boundary allow-lists and supply-chain group (D-03, D-05)
- `.planning/phases/62-module-boundaries-and-decomposition/62-CONTEXT.md` — D-09..D-12 (per-domain
  `ipc/<domain>.ts`, the umbrella intersections, the domain census test, the transport parity test)
  and D-16 (shrink-only ceilings)

### Concerns this phase discharges or touches
- `.planning/codebase/CONCERNS.md` §"Dependency vulnerabilities" — zod `<4.6.6` advisory and the
  instruction to "decide zod 3 versus 4 before Phase 67"
- `.planning/codebase/CONCERNS.md` §"`removeFolder` deletes `<renderer path>/<name>` recursively"
  and the renderer-path entry above it — shape validation is Phase 67's part; containment is not
  covered (Phase 72)

### Conventions
- `Skill("gamelib-conventions")` — the `<verify>` prettier rule applies to every task. The
  sidecar exit contract applies to anything the validator adds at boot.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/platform/index.ts:161-190`: the `ipcMain` recorder (`handlerRegistry`,
  `listenerRegistry`). Every `ipcMain.handle`/`on`/`once` across the 23 `*FlowRegistration.ts`
  files goes through it (233 call sites), so validation hooks in here.
- `src/backend/sidecar/sidecarRpc.ts`: the dispatch and response path (`{id, ok, result|error}`,
  `UNPORTED_CHANNEL_MARKER` at ~:196) and `requestRustInvoke` (`RUST_INVOKE_CHANNELS` allow-list
  check at ~:409).
- `src/common/types/ipc/<domain>.ts` (29 files) plus `ipc/index.ts`: the per-domain channel types
  from Phase 62, where the schemas will live.
- `src/common/types/sidecarTransport.ts`: the transport constants and `RUST_INVOKE_CHANNELS`, the
  source for D-17.
- `src/backend/sidecar/rendererPathGuard.ts`: `assertContainedPath`,
  `assertPlausibleAbsolutePath`, `assertCommandParts`. These handler-level semantic guards stay
  (D-05).
- `src/backend/sidecar/__tests__/{ipcDomainCensus,flowRegistrationCensus,transportParity}.test.ts`:
  the census and parity tests to extend or retire.

### Established Patterns
- Shrink-only ceilings in the style of `meta/lintScoped.cjs` (Phase 62 D-14).
- Existing zod usage in `backend/schemas.ts` and `shellFilesFlowRegistration.ts:319` (`Path.parse`
  used as the channel's own validation).
- The rustInvoke arms in `src-tauri/src/store_embed.rs` (`dispatch_rust_channel`, ~:1836 onward:
  `keyring_*`, `dialog_*`, `notification_show`, `shell_*`, `clipboard_*`, `app_exit`,
  `app_relaunch`, cookie arms…) parse `args: &[Value]` by hand.

### Integration Points
- `src-tauri/src/relay_commands.rs`: `sidecar_invoke`/`sidecar_send` get the generated name
  allow-list (D-14).
- `src-tauri/src/sidecar.rs:4-23, ~:492`: marker consts replaced by generated ones (D-17).
- Preload `src/preload/tauriTransport.ts`: where the renderer turns an `IPC_INVALID_ARGS` error
  into a typed exception (D-08).
- CI workflow and `.husky/pre-commit`: `check:ipc-contract` (D-18).

</code_context>

<specifics>
## Specific Ideas

- The generator's limited subset is a deliberate choice: when a schema can't be generated, the
  generator should fail loudly, not degrade to `serde_json::Value`.
- Mark GameInfo and settings passthroughs explicitly so Phase 70 can find every one with grep.

</specifics>

<deferred>
## Deferred Ideas

- Semantic allow-lists for renderer paths and URLs (containment of `removeFolder`'s `folderPath`,
  the `openExternalUrl`/`openFolder` scheme allow-list): Phase 72, already scoped there.
- Full `GameInfo` and settings schemas: Phase 70 tightens the lighter schemas from D-07.
- ROADMAP.md edit to remove zod from Phase 72's supply-chain group (D-03): a doc change to make
  separately, not a Phase 67 plan.

### Reviewed Todos (not folded)
- The `todo.match-phase` matcher returned 19 todos, all keyword noise (Windows code signing,
  depot optionaldlc, toast overlap, clippy Windows leg, …). None concerns IPC validation, so none
  was folded.

</deferred>

---

*Phase: 67-schema-validation-at-the-sidecar-ipc-boundary*
*Context gathered: 2026-11-07*
