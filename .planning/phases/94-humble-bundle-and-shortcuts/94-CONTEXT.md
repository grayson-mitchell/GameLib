# Phase 94: Humble Bundle and shortcuts - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Humble key handling and desktop shortcuts run from Rust (SVC-04, SVC-05).

- **Humble** (`src/backend/humble/`, ~6.2k source lines, 12.9k test lines): account (login webview
  cookie capture loop, reconnect, disconnect, session probe and health/expiry flag), key sync
  (orders, classify, dedup, Steam ownership cross-reference, Steam appid resolver), reveal/claim
  (the hidden-window reveal post already in Rust), mark/undo redeemed, ownership overrides,
  gift-link records, claim annotations and audit, expiry alerts, the dev validation run. The
  three sidecar registrations `humbleFlowRegistration.ts`, `humbleLoginFlowRegistration.ts` and
  `humbleSecretStore.ts` go with it.
- **Shortcuts** (`src/backend/shortcuts/`, ~1.9k source lines, 2.7k test lines): desktop and
  Start-menu/Applications shortcuts on macOS (`.app` with Info.plist + run.sh + icns), Windows
  (`.lnk` via PowerShell, `IconLocation` from an exe/ico/dll) and Linux (`.desktop`), and add/remove
  to Steam (`nonesteamgame`, shortcuts.vdf through `gamelib-steamfiles`). `shortcutsFlowRegistration.ts`
  goes with it.

Success criteria (ROADMAP): keys sync/claim/redeem as before with secrets through the keyring
dispatch and no new Keychain prompt; shortcuts created and removed as before on all three OSes;
the Humble and shortcut test oracles ported as Rust tests or recorded fixtures; the Humble and
shortcuts TS and their sidecar registrations deleted in this phase (scheduled survivors excepted,
D-03, D-04).

Steam key redeem itself (`steam/userRedeem.ts`) is Phase 90's surface, not 94's.

</domain>

<decisions>
## Implementation Decisions

### Timing and worktree
- **D-01:** **94 runs now, in parallel with Phase 87, in its own git worktree** (user direction,
  2026-11-24). It uses the Lane C dependency (needs only Phase 86). It therefore lands **before
  88–93**, so every TS caller of Humble or shortcuts that those phases have not yet ported still
  exists and must be shimmed (D-03).
- **D-02:** **The worktree rebases onto main before each wave** and resolves shared-file conflicts
  as they appear, then merges to main when 94 verifies. Expected conflict surface with 87:
  `src-tauri/src/rust_dispatch.rs`, `src-tauri/src/ipc_contract.rs`, the IPC snapshot,
  `src/backend/sidecar/handlers.ts`, `sidecarRpc.ts`, `channelSchemas.ts`, the shim schedule test
  (`src/backend/__tests__/engineWineShimSchedule.test.ts` / its 86 twin), `Cargo.toml` workspace
  members. Plans should keep edits to those files small and append-only where possible.
  **94's STATE is worktree-local:** its executor writes `.planning/STATE.md` / `state.json` only in
  the worktree. At merge, keep main's Current Position (87 or later) and fold in only 94's
  completion row (memory: phase.complete / planned-phase clobber a live executor's STATE). Fresh
  worktree needs build prep before `pnpm tauri:dev` (memory: `build:sidecar-sea` + `vite build`).

### Callers that outlive the TS
- **D-03:** **`humble/loginWindowSeam.ts` is relocated out of `humble/` unchanged** (e.g.
  `src/backend/login/loginWindowSeam.ts`) and becomes a scheduled survivor, deleted by Phase 92,
  because `oauthLoginCapture.ts` and the GOG/Epic/Amazon `user.ts` sign-in flows still drive it.
  Humble's own login poll/deadline loop (`watchForLogin`, `COOKIE_POLL_INTERVAL_MS`,
  `LOGIN_WATCH_TIMEOUT_MS`) moves to Rust. OAuth sign-in is not touched in 94. Amend
  `82-STATE-OWNERSHIP.md`'s `humble-services` row (it lists "login-window seam slot") with the
  reason. — **Reversibility:** reversible — a file move.
- **D-04:** **Remaining TS callers use same-signature `rustInvoke` shims or resolvers** (86 D-05,
  D-06, D-24; 87 D-15, D-23): `signInProbe/pass.ts` (`humbleUser.isLoggedIn`/`probeSession`), and
  the shortcuts callers in `storeManagers/{steam,gog,legendary,nile,sideload}/games.ts` and
  `sideload/library.ts`. Research must produce the complete list. Each shim is a row in the shim
  schedule test with the phase that deletes it (88–92 per owner).

### Humble parity oracle
- **D-05:** **Goldens come from the existing synthetic fixtures plus one real capture.** A TS
  harness (isolated with `createFakeHomeProfile()`) drives `__tests__/fixtures/tpks.ts` /
  `steamGames.ts` through sync, classify, dedup, Steam cross-reference, reveal, mark/undo redeemed,
  overrides and expiry alerts and emits golden JSON, committed before any Rust for that sub-slice.
  **Plus one recorded sync of the operator's real Humble account** (order list and a handful of
  orders), redacted of key values, gamekeys, email, account name, cookies and CSRF tokens, to pin
  real response shapes and the request URLs, methods and headers (86 D-10 request pinning). Goldens
  carry the Phase 82 D-05 vacuous-pass guards. — **Reversibility:** reversible.
- **D-06:** **Pure-logic suites port as Rust unit tests; stateful flows are covered by golden
  replay.** Port classify, dedup, expirationAlerts, viewFilters, urgencyBadge, keyTypePresentation,
  expirationDisplay, userAgent, validation and steamAppIdResolver as Rust tests. Cover the
  library/user flows (`library.test.ts`, `user.test.ts`, `probeSession`, `stores`,
  `library.realstore`) by golden replay. Source-text gate tests are deleted, not ported.
- **D-07:** **Non-refetchable Humble state round-trips byte for byte.** A golden loads today's
  files (`humble_library`, `humble_revealed`, `humble_ownership_override`, `humble_gifted_at`,
  `humble_audit`, `humble_local_redeemed`, `humble_notified_expiration`, `humble_settle_declined`,
  `humble_steam_appid`, `humble_sync`, `humbleConfigStore`), including a legacy pre-backfill file
  for the `expirationAlerts` one-time backfill, runs a no-op sync in Rust and must write back
  identical bytes. A corrupt file is copied aside, never reset (FND-06, 85 D-05).
  — **Reversibility:** one-way — a Rust writer that rewrote these files differently on a user's
  machine cannot be undone, and the state cannot be refetched from Humble.

### Live gate (macOS, authored before coding)
- **D-08:** **Reveal is proven live on one throwaway key.** The operator picks one unrevealed key
  they don't care about. The gate reveals it, sees the value, marks it redeemed, then undoes the
  mark. The C2 owned-elsewhere block and the ineligible refusal are pinned by goldens. Steam redeem
  is not exercised (Phase 90). Before the gate, the operator names the key in the gate file.
- **D-09:** **Gate items** (offline-UAT shape where relevant: network off only for the action):
  1. **Humble account:** after the upgrade the Keys screen is signed in with no Keychain prompt for
     `humble-session`/`humble-csrf`; Sync completes; expiry badges and Steam-owned markers show as
     before; reconnect and disconnect work (disconnect keeps user-state files, D-07).
  2. **Reveal/claim:** D-08 on the throwaway key.
  3. **Desktop + Applications `.app`:** create both for one game, the icon shows, double-click
     launches it through `gamelib://`, then remove both.
  4. **Add to Steam:** add a game as a non-Steam shortcut, it appears in Mac Steam after a restart,
     then remove it. shortcuts.vdf is written atomically.
  5. **Iconless fallback:** a game with no artwork still gets a `.app`, without the
     `CFBundleIconFile` key.
- **D-10:** **The gate build is a signed 94 build installed over a signed build of the main commit
  the worktree branched from**, with Humble signed in on the base build. This proves SC1/FND-07
  (no new Keychain prompt). A dev build does not count for item 1.
- **D-11:** **Windows and Linux are covered by CI only** (86 D-16): golden replay on the three-OS
  matrix, including the `.lnk` writer argv/stdin and the `.desktop` file. Their live check rides
  with Phase 99.

### Shortcuts output
- **D-12:** **The Windows `.lnk` writer stays PowerShell.** The same fixed-argv
  `powershell.exe -Command -` with the C# helper on stdin and the same timeout, spawned through
  `gamelib-proc` as `SpawnClass::Helper`; `reg.exe` for the redirected Desktop folder likewise. The
  golden pins argv and stdin. The `windowsShortcutIcon` source chain (store exe → bounded install
  scan → shell exe; only `.exe/.ico/.dll`) ports as-is.
- **D-13:** **macOS icns parity is "valid icns, same geometry".** The golden checks a decodable
  `ic11` 512×512 icon (resize to 512 width, crop 0,0,512,512) and the Info.plist with or without
  `CFBundleIconFile`. Pixels may differ from the JS encoder. `@shockpkg/icon-encoder` and the
  `imageTools` dependency are dropped (STACK.md: `icns` + `image` crates).
- **D-14:** **Text outputs are byte-identical, including hostile names.** `run.sh`, `Info.plist`
  and the Linux `.desktop` file must match the TS output byte for byte. Goldens include app names
  and runners containing `;`, `$(...)`, backticks, single and double quotes, `&` and spaces
  (T-34.5-C6-17 injection fix: double-quoted exe path, single-quoted percent-encoded `gamelib://`
  URL).

### Carried forward (already decided, not re-asked)
- **D-15:** No `GAMELIB_HUMBLE` / `GAMELIB_SHORTCUTS` flag. Each sub-slice's TS is deleted once its
  goldens pass (86 D-13, 87 D-06).
- **D-16:** A native channel never falls back to the sidecar. Its Rust serde struct
  (`deny_unknown_fields`, camelCase) is the schema; the zod entry in `channelSchemas.ts` is deleted
  with its TS registration; the IPC snapshot is regenerated (83 D-04/D-06/D-07).
- **D-17:** Event names and payloads stay the same (Humble sync state, expiry notices, shortcut
  outcome toasts), so the renderer is untouched (86 D-08, 90 D-15).
- **D-18:** Secrets stay behind `keyring_dispatch` with slot names `humble-session` and
  `humble-csrf` unchanged, with the same read caching and invalidate-before-delete on disconnect.
  The dev vault's Humble slots are ported (86 D-26) so `pnpm tauri:dev` stays prompt-free. A `-cli`
  never touches the real Keychain (85 D-14).
- **D-19:** Persisted state goes through the Rust StoreHost (`gamelib-store`) with byte-identical
  writes (85 D-05, D-18).
- **D-20:** Quirks are copied for parity and each is filed as a `.planning/todos/pending/` todo with
  the three triage keys (86 D-03).
- **D-21:** Rust shutdown contract: PowerShell/reg.exe spawns through `gamelib-proc`; the login
  cookie poll, the sync, the bounded reveal and the appid resolve pass hold a
  `gamelib_core::shutdown::global()` Registrant; no unbounded boot work. Load
  `Skill("gamelib-conventions")` before planning.
- **D-22:** Destructive reads refuse on "unknown" (FND-02): shortcut removal never deletes a path it
  cannot prove it created.
- **D-23:** v0.11 rules: the live gate is authored before coding, goldens are recorded from TS
  before porting, and the phase's last plan leaves no TS or registrations for any ported slice
  beyond the scheduled survivors.

### Claude's Discretion
- Crate layout: research suggested `gamelib-humble` and `gamelib-shortcuts` (with `-cli` where
  `meta/` needs it), following the per-domain crate pattern of 63–87. Planner may merge or split.
- Whether the Humble HTTP client uses reqwest's `cookies` feature or passes the session cookie
  explicitly; it must send the same headers as the TS (D-05).
- Plan order inside 94 (Humble vs shortcuts first), chosen to minimise conflicts with 87 (D-02).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and pattern
- `.planning/REQUIREMENTS-v0.11.md` — SVC-04, SVC-05; FND-02/06/07 constraints
- `.planning/ROADMAP.md` §"Phase 94: Humble Bundle and shortcuts" — goal and success criteria
- `.planning/research/v0.11/SUMMARY.md` — milestone spine; item 94
- `.planning/research/v0.11/FEATURES.md` — Humble/shortcuts sizes, registrations, oracle guidance
- `.planning/research/v0.11/STACK.md` — reqwest features (`cookies`), `icns`/`image`, `crc32fast`, steamfiles shortcuts.vdf
- `.planning/research/v0.11/PITFALLS.md` — keyring ACL/re-prompt risk, non-refetchable Humble state, atomic shortcuts.vdf
- `.planning/research/v0.11/ARCHITECTURE.md` — slice J dependencies
- `src-tauri/crates/README.md` — per-domain crate pattern, tri-state rule

### Prior phase decisions this builds on
- `.planning/phases/86-pure-leaf-services/86-CONTEXT.md` — shims, resolvers, schedule test, goldens + request pinning, dev vault port, no-flag deletion
- `.planning/phases/87-engine-wine-and-tools/87-CONTEXT.md` — parallel-running phase; scheduled survivors; gate shape
- `.planning/phases/90-steam-services-and-typescript-depot-path/90-CONTEXT.md` — Steam redeem ownership; error-path-only redeem proof
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md` — StoreHost, signed-over-signed gate, keyring rules
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` — Humble store rows flip at 94; `humble-services` row needs the D-03 amendment

### Conventions
- `Skill("gamelib-conventions")` — fake-HOME isolation, Rust shutdown contract, todo triage keys, UAT item shape, `<verify>` prettier check
- `Skill("spike-findings-gamelib")` — login webview / cookie-read surface (Humble login and reveal hidden window)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/login_window/` (`humble_cookies.rs`, `humble_reveal.rs`, `humble_open.rs`, `humble_helpers.rs`, `macos_cookies.rs`): the login webview, cookie reads, storage clear and the hidden-window reveal post are already Rust. 94 moves the orchestration around them.
- `src-tauri/src/keyring_dispatch.rs` + `info_secrets.rs` (86's `SecretSource`): the secret path for `humble-session`/`humble-csrf`.
- `gamelib-steamfiles` `shortcuts` module (`steamfiles_shortcuts_read/apply`): shortcuts.vdf is already Rust; `nonesteamgame.ts` already calls it via `rustEntryFields`.
- `gamelib-store` (StoreHost), `gamelib-proc`, `gamelib-core::shutdown`, `gamelib-testutil`.
- `gamelib-info` (86) and `gamelib-engine`/`gamelib-wine` (87) as models for crate + dispatch + `-cli` + golden layout.

### Established Patterns
- Humble services are built once per boot (`humble/index.ts`: user, library, sync fence, action-id cache, login seam slot) — map to one Rust state object owned by the shell.
- `HumbleSecretStore` totality: never throws; null read = first run; one warning per failure, never the value.
- Shortcuts outcome reporting (`addShortcutsOutcome`, `removeShortcutsOutcome`, `shortcutsExistsFallback` tests) is the shape of the renderer contract.

### Integration Points
- Sidecar registrations to delete: `src/backend/sidecar/humbleFlowRegistration.ts` (~15 channels), `humbleLoginFlowRegistration.ts` (`humbleStartLogin`, `humbleReconnect`, `humbleRevealKey`, `humbleStopLogin`), `humbleSecretStore.ts`, `shortcutsFlowRegistration.ts` (`addShortcut`, `removeShortcut`, `processShortcut`).
- Boot wiring: `src/backend/sidecar/bootstrap.ts`, `stores/createStores.ts`, `services/types.ts`, `host/appInfo.ts` (`userAgentFallback`), `devSecretVault.ts`, `testUtils/testHumble.ts`.
- TS callers needing shims (D-04): `signInProbe/pass.ts`; `storeManagers/{steam,gog,legendary,nile,sideload}/games.ts`, `sideload/library.ts`.
- Login seam users after 94 (D-03): `sidecar/oauthLoginCapture.ts`, `storeManagers/{gog,legendary,nile}/user.ts`, `store/storeEmbedSeam.ts` (mirrors it).

</code_context>

<specifics>
## Specific Ideas

- The operator chooses the throwaway key for D-08 and records it in the gate file before the gate runs.
- The real Humble capture (D-05) is recorded once from the operator's account and redacted before commit; nothing identifying lands in git.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Automatic todo matching returned only keyword
matches (Windows/Steam/test todos unrelated to Humble or shortcuts); none were folded.

</deferred>

---

*Phase: 94-humble-bundle-and-shortcuts*
*Context gathered: 2026-11-24*
