# Phase 79: Rust CM client replacing steam-user and steam-session - Context

**Gathered:** 2026-11-14
**Status:** Decisions captured. **Planning is blocked** until spike 085 has final results (see Gate).

<domain>
## Phase Boundary

This phase moves every conversation GameLib has with Steam's CM network and Steam's auth Web API
into Rust, and deletes the `steam-user` and `steam-session` npm packages. That covers:

- the anonymous public-data client;
- the signed-in session: owned apps, licence list, PICS, depot keys, manifest request codes,
  CDN hosts and redeem;
- QR and credentials + Steam Guard sign-in;
- the macOS go-offline wrap (while it exists);
- the whole Steam library Refresh, including its HTTP metadata/artwork enrichment;
- the Mac Steam owned-apps path from spike 084 (folded todo).

`STEAM-STACK.md` freezes `steam-user` and `steam-session`, so this phase amends it.

Not in scope: the install/uninstall/update polling state machines (D-17), and refresh-token
renewal (deferred).

### Gate (from ROADMAP)

Spike 085 (`.planning/spikes/085-steam-vent-long-lived-session/`) must have final results before
`/gsd-plan-phase 79`. On 2026-11-14:

- Run C (the 3 h long hold) has no log, and the `## Results` section is a placeholder.
- Runs A and B already establish that steam-vent never notices or heals a dead socket, and that
  GameLib-owned discover + connect + refresh-token logon recovers in 0.8–1.4 s after a network drop
  and after sleep/wake. D-02 relies on that.
- Run C informs D-01 (Claude's discretion on the session model) and the liveness design.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (not re-asked)
- **Phase 63/73/75 pattern:**
  - a Tauri-free crate in the `src-tauri/` Cargo workspace, called in-process over `rustInvoke`,
    with TypeScript signatures unchanged (they turn async where they were sync, 63 D-09);
  - a CLI binary for headless tools, and `createFakeHomeProfile()` for any spawn from `src/` or
    `meta/`;
  - a parity harness;
  - the delete gate (sweep with zero unexplained diffs, a live macOS `pnpm tauri:dev` smoke, and
    `cargo test` green on all three CI legs), then delete the TypeScript clients and both npm
    packages inside this phase.
- **CM crate:** steam-vent from codeberg main, with the git `rev` pinned until 0.6.0 ships. At
  `a9e8164` it needs the one-line anonymous-logon fix from 080's `vendor.sh`.
- **Refresh-token logon sends no account name.** The SteamID comes from the JWT `sub` (071a/c).
- **Subscriptions:** subscribe to `CMsgClientLicenseList` before logon, and to
  `CMsgClientLoggedOff` for the whole life of each session (077).
- **Package access tokens come before PICS package info** (073: 939 vs 1,144 app IDs).
- **No dependency on CDN auth tokens** (071a).
- **One explicit rustls provider install at shell start**, in `main()` before `tauri::Builder`
  (082). Ring vs aws-lc is the planner's choice.
- **QR sign-in runs over the Steam Web API** (`IAuthenticationService`, platform `SteamClient`),
  and handles the ~22 s challenge rotation (072).

### Session lifetime and ownership
- **D-01 (Claude's discretion):** lease-and-idle-close vs an app-lifetime signed-in session.
  - Today's model: lease on demand, concurrent acquires share one logon, close
    `AUTH_SESSION_IDLE_GRACE_MS` (60 s) after the last release.
  - Decide in planning using 085's final results.
  - Default lean: keep lease + idle close. On macOS, D-14 removes the signed-in logon from Refresh
    entirely, so a long-held session buys little.
- **D-02: Mid-lease death means detect, reconnect, and retry once.**
  - GameLib owns liveness, because steam-vent's heartbeat and read-loop failures never reach the
    caller (085).
  - On a failed or timed-out call: probe, rebuild the connection (new `ServerList` pick + refresh-token
    logon, with backoff), then retry the failed call once.
  - `LoggedOff` eresult 34 (session replaced) means stop and drop the session, with no retry loop.
- **D-03: Rust owns the whole session.**
  - The crate owns the connection, liveness, reconnect, lease counting, idle close and ordering
    against the go-offline wrap.
  - `user.ts`'s `acquireAuthenticated` / `acquireOpenAuthenticated` / `ensureConnected` /
    `releaseForShutdown` surface becomes thin calls into Rust with the same signatures.
  - The guarantees today's `user.ts` makes carry over:
    - "never log off a caller mid-download";
    - shutdown release abandons a logon in flight, then pays any goonline owed;
    - no logon lands after sign-out.
- **D-04: The anonymous client is a separate Rust anonymous session with idle close.**
  - It keeps today's behaviour: one shared session, a 15 s connect bound, and a 60 s idle close
    counted from the last in-flight read (54-REVIEW WR-09).
  - It never shares the signed-in session.

### Sign-in and tokens
- **D-05: Credentials + Steam Guard also run over the Web API, like QR.**
  - Today's `steam-session` path, ported: `GetPasswordRSAPublicKey` → RSA-encrypt →
    `BeginAuthSessionViaCredentials` → `UpdateAuthSessionWithSteamGuardCode` → poll for completion
    or app approval.
  - No CM logon at sign-in, and one HTTPS auth module for both flows.
  - EResults are mapped onto today's UI states.
  - The operator asked for the trade-offs before choosing. The deciding factors were: it keeps
    sign-in off the CM and out of the wrap, avoids `logonID` collisions during the fallback window,
    keeps one flow shape, and steam-vent's CM login is not verified to hand back a
    `SteamClient` refresh token.
- **D-06: After sign-in, keep today's one wrapped logon to read the persona name**, through the
  normal session path, bounded at 5 s. If it fails, show the account name (`finishAuth` /
  `resolveSignInProfile` behaviour). The token is stored before that logon, as today.
- **D-07: Refresh-token continuity is parity: reuse the token, no renewal.**
  - The Rust logon uses the stored steam-session token unchanged.
  - The live gate must show an existing signed-in user staying signed in with no new sign-in.
  - An expired or refused token goes down today's credential-refusal → `credentialsMissing` path.
- **D-08: No Steam Guard machine tokens are persisted** (parity). Use a no-op guard-data store.

### macOS go-offline wrap
- **D-09: Retest in this phase, then decide.**
  - Add a live gate item: GameLib's full Refresh sequence run unwrapped against a freshly started
    Mac Steam, watching whether Friends stays signed in. The Friends UI is operator-confirmed;
    081 measured only `BLoggedOn`.
  - Pass: delete the wrap in this phase. Fail: keep it.
  - Schedule the retest early, so the D-10 port is skipped if the wrap goes.
  - D-14 removes Refresh's signed-in logon on macOS whenever Mac Steam is running. The retest
    must cover the CM fallback Refresh path, which still logs on.
- **D-10: While the wrap exists, it is ported to Rust.**
  - `steam://open/gooffline` / `goonline`, the `connection_log.txt` LogOff watch, the 5 s
    guided-offline refusal (`GuidedOfflineRequiredError` semantics: "never a silent logon"), and
    the owed-goonline record with its boot and shutdown cover all move.
  - The owed record's on-disk format stays readable by both sides during the fallback window.
    It is currently versioned by the Phase 68 store engine.
- **D-11: Reconnects go through the wrap.**
  - A D-02 reconnect is a cold logon with Mac Steam back online, so it is wrapped.
  - If the wrap refuses, the retried call fails with today's guided-offline error.
  - It respects the ~15 s spacing between back-to-back wrapped logons (074).

### Scope edges
- **D-12: All of the library Refresh moves to Rust.** That is not just the CM calls: the
  orchestration, the HTTP store metadata/artwork enrichment (today axios via `gameMetadata.ts`
  and friends), `licensedDemos`, and metacritic capture. This reverses Phase 75 D-02's deferral.
  - reqwest replaces axios for Steam Refresh only. Other stores' axios use is untouched.
  - Rust returns the finished library to the existing TS call site.
- **D-13: One phase, in sequence.** Plan order:
  1. CM crate, session and sign-in;
  2. the Rust Refresh on the CM path;
  3. the Mac Steam owned-apps path on top;
  4. the delete gate.

  No thin intermediate Refresh that gets rewritten later.
- **D-14: The Mac Steam owned-apps path is primary on macOS, with CM as fallback** (folded todo,
  spike 084).
  - Use it when Mac Steam is running, `BLoggedOn` holds, and `GetSteamID` equals the stored
    `userData.steamId`.
  - Refresh takes `GetSubscribedApps`:
    - call twice: count, then a buffer of that size;
    - resolve slots by function ID with a uniqueness check, never a hard-coded index;
    - filter by PICS `common.type == game`, with names and types from an anonymous PICS lookup.
  - Free-to-play titles the account holds appear, as they do in Steam's own library.
  - Demos are intersected with Steam's set, which fixes the two demos Steam hides.
  - Any guard failure or account mismatch falls back to the CM path. Windows and Linux always use
    CM.
- **D-15: The Mac Steam read runs out of process.** It runs in the existing bridge helper
  (`native/steam-bridge/helper/`, as 084 did) or a small sibling binary, never by loading
  `steamclient.dylib` into the Tauri process. A crash or bad slot resolution falls back to CM.
- **D-16: Refresh parity compares the finished library on the CM path.**
  - TS vs Rust Refresh on the operator's account, diffing the final library: app IDs, names,
    art URLs, metacritic, demos and playtime.
  - Each divergence is explained and recorded (63 D-07: the old code is not assumed correct).
  - The Mac Steam path is checked separately against 084's set, because it is meant to differ
    (F2P, hidden demos).
- **D-17: The install/uninstall/update polling state machines stay in TypeScript.** They use no CM
  and become a later slice.
- **D-18: Two dev/advanced-only fallback flags,** hidden from the normal UI and deleted at the
  delete gate (75 D-08 shape):
  - `sign-in`: Web API QR + credentials;
  - `cm`: every CM call, anonymous and signed-in, plus Refresh.

  Each defaults to `rust` once its own parity passes, and either can be held on `ts` alone. While
  `cm=ts` is possible, steam-user's `logOn` gets a non-zero per-install `logonID`, generated once
  and persisted, so a Rust and a TS session never kick each other with 34 (077/081). Production
  sets none today.

### Amendments this phase must make
- `.planning/research/STEAM-STACK.md`: replace the frozen `steam-user` / `steam-session` entries
  with steam-vent (pinned rev), Web-API sign-in and the reqwest Refresh. Record why the freeze
  was lifted (071–085).
- `CLAUDE.md` "Technology Stack (Steam)" short version must follow the amendment.

### Claude's Discretion
- D-01: session model (lease + idle close vs app-lifetime), informed by 085 Run C.
- Crate placement (new crate, e.g. `gamelib-steamcm`, or folded into an existing one), CLI
  binary shape, channel names and JSON result shapes. Result shapes mirror today's TS types.
- The liveness probe (085 used a PICS access-token job for app 480, 10 s timeout), reconnect
  backoff (085: 5→60 s), and how the 92 s unexplained stall in 085 Run A is bounded.
- The rustls provider (ring vs aws-lc).
- How the Rust session's async runtime coexists with `gamelib-depot`'s own `block_on` (080: drop
  the CM runtime before `dispatch`).
- Whether Jest tests for TS callers mock the async boundary or spawn the real CLI.

### Folded Todos
- **`2026-11-07-spike-refresh-via-running-steam-client.md`** — "Refresh the Steam library through
  the running Mac Steam client (no GameLib CM logon, so no Friends drop)".
  - Problem: Refresh opens a signed-in steam-user connection that could sign Mac Steam's Friends
    out (`.planning/debug/friends-signout-steam-user.md`).
  - Spike 084 since validated reading owned apps from the running Mac Steam.
  - Folded as D-14/D-15. Close the todo when the phase ships.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and stack record
- `.planning/ROADMAP.md` § "Phase 79" — goal, gate, open questions.
- `.planning/research/STEAM-STACK.md` — the frozen stack this phase amends.

### Spike evidence
- `.claude/skills/spike-findings-gamelib/references/rust-migration-steam.md` — CM-client
  requirements, the steam-vent call sketches (logon, PICS, depot key, request code, CDN hosts,
  GetOwnedGames, redeem), Web-API QR, What to Avoid, and Constraints (the untested list:
  typed guard codes, a real redeem, Family Sharing).
- `.claude/skills/spike-findings-gamelib/references/mac-steam-client-integration.md` — the
  go-offline wrap and the Mac Steam client.
- `.claude/skills/spike-findings-gamelib/references/steam-library-ownership.md` — ownership
  sources.
- `.planning/spikes/085-steam-vent-long-lived-session/README.md` — **gate.** Liveness and
  reconnect evidence; Run C pending.
- `.planning/spikes/081-three-session-coexistence/README.md` — `logonID` coexistence at
  production shape; signed-in Rust depot path without the wrap.
- `.planning/spikes/082-one-process-tls-providers/README.md` — the rustls provider hazard and
  the fix.
- `.planning/spikes/084-owned-apps-from-running-steam/README.md` — Mac Steam owned-apps path and
  its production requirements.
- Spikes 071a–c, 072, 073, 074, 077, 080 — sources are under the skill's `sources/` directory.

### Prior phase decisions
- `.planning/phases/63-rust-migration-pattern-and-executable-scanners/63-CONTEXT.md` — the
  migration pattern, parity tiers, delete gate.
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-CONTEXT.md` — `gamelib-depot`,
  the `DepotRef`/`HostRef` inputs the CM half must produce.
- `.planning/phases/75-steam-local-file-formats-in-rust/75-CONTEXT.md` — D-02 (Refresh
  deferral, reversed here by D-12), D-08 (fallback-flag shape).

### Defect history
- `.planning/debug/friends-signout-steam-user.md` — why the wrap exists.

</canonical_refs>

<code_context>
## Existing Code Insights

### TS to replace (all import `steam-user` or `steam-session`)
- `src/backend/storeManagers/steam/user.ts` (930 lines): the lease/idle session, credential
  refusal mapping (`CREDENTIAL_REFUSAL_*`), `autoRelogin: false`, the `error`/`disconnected`
  handlers, `releaseForShutdown`, and the canary (app 753, 5 s).
- `userSignIn.ts` (435), `userSignInState.ts` (84): steam-session `LoginSession` QR and
  credentials, `finishAuth` and `resolveSignInProfile`.
- `userRedeem.ts` (139), `anonymousClient.ts` (276), `userTypes.ts`, `depot/planModel.ts` (204).
- `macSteamOffline.ts`: the go-offline wrap, a leaf module (D-09/D-10).
- `library/refresh.ts`, `licensedDemos.ts`, `gameMetadata.ts`, `gameRequirements.ts`: Refresh
  and its axios enrichment (D-12).

### Callers that keep their signatures
- `acquireAuthenticated` / `acquireOpenAuthenticated` callers: `gameInstall.ts`,
  `gameInstallDepot.ts`, `gameInstallBridge.ts`, `installLocation.ts`, `depot/plan.ts`,
  `depot/sharedRedist.ts`, `depotRust/install.ts`, `depotRust/secondary.ts`,
  `depotRust/updateEstimate.ts`, `bridge/launchTarget.ts`, `library/refresh.ts`, `userRedeem.ts`.
- IPC types are in `src/common/types/ipc/steam.ts` and `src/preload/api/steam.ts`; the frontend
  `SteamGoOfflineNotice.ts` consumes the guided-offline outcome.
- Tests: `steamAuthSessionPolicy.test.ts` enforces that production callers use the lease API;
  `testUtils/testSteamUser.ts` is the fake.

### Reusable assets
- `src-tauri/` workspace crates: `gamelib-depot(-cli)`, `gamelib-scan(-cli)`,
  `gamelib-steamfiles(-cli)`. `gamelib-depot` consumes the `DepotRef`/`HostRef` this phase
  produces.
- `tokenStore.ts`: the keyring / dev-vault token slot, which stays the token's home.
- `native/steam-bridge/helper/` (`bridge_helper.c`, `gamelib_installapp.h`) and
  `steamInstallApp.ts`: the existing out-of-process pattern for calling Mac Steam's client
  interfaces (D-15).
- `signInProbe/` + `common/signInState.ts`: sign-in outcome and verdict plumbing the Rust
  results must feed unchanged.

### Constraints
- The sidecar exit contract (gamelib-conventions): while TS still holds anything, no referenced
  handle survives stdin EOF.
- `steam-user` cannot simply be removed while `cm=ts` is selectable. Deletion happens only at
  the delete gate.

</code_context>

<specifics>
## Specific Ideas

- 085 recovery numbers to design against: 76 s dead → recovered once the network returned;
  logon 0.8–1.4 s; first liveness call after wake times out at 10 s.
- `LoggedOff` 34 already means "not a credential problem" in production (`user.ts:536`). Keep that
  meaning.
- Live gate items implied by decisions:
  - existing signed-in user survives the switch with no new sign-in (D-07);
  - QR and credentials + typed Steam Guard sign-in (D-05; typed codes are untested anywhere);
  - unwrapped full-Refresh Friends retest (D-09);
  - mid-lease reconnect after network off/on and after sleep. The operator needs the network to
    talk to Claude, so network goes off only for the action;
  - Mac Steam path Refresh with fallback on account mismatch (D-14);
  - a real key redeem if the operator has a key (untested anywhere).

</specifics>

<deferred>
## Deferred Ideas

- Refresh-token renewal before the ~200-day expiry: a new capability, and today's behaviour is
  re-sign-in.
- Persisting Steam Guard machine tokens.
- Moving the install/uninstall/update polling state machines to Rust: the next sidecar-retirement
  slice.
- Excluding free-to-play titles from the Mac Steam path (084 found no local signal; it would need
  a per-app lookup).

</deferred>

---

*Phase: 79-rust-cm-client-replacing-steam-user-and-steam-session*
*Context gathered: 2026-11-14*
