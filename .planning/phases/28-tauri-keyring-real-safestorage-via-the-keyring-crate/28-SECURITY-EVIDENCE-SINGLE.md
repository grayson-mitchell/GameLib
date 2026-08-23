# Phase 28 Security Re-Audit — Shard S (11 single-occurrence units)

Re-verification against TODAY's tree (2026-08-23), not against 28-SECURITY.md's July 22 claims.
28-SECURITY.md read for context only; its rows were not accepted as evidence.

| Threat ID | Plan | Category | Component | Disposition | Status | Drift since July |
|-----------|------|----------|-----------|--------------|--------|-------------------|
| T-28-03b | 28-01 | Spoofing | `handleFrame()` inbound direction | mitigate | CLOSED | Unchanged |
| T-28-06 | 28-01 | DoS | oversized/malformed frames, new `rustInvoke` kind | accept | CLOSED | Unchanged |
| T-28-07 | 28-02 | Tampering | `openExternal` URL from sidecar frame | accept | CLOSED | Unchanged |
| T-28-08 | 28-03 | Tampering | untrusted caller invoking `setTokenStore()` | accept | CLOSED | Unchanged (new adjacent caller, still backend-only) |
| T-28-10 | 28-04 | Tampering | token store swap ordering | mitigate | CLOSED | Mechanism intact; plan's own literal verification grep now FAILS — see note |
| T-28-11 | 28-05 | DoS (data loss) | test destroying real Steam session | mitigate | CLOSED | Mechanism REPLACED (stronger) after a real incident |
| T-28-12 | 28-06 | Tampering | self-check overwriting production Keychain entry | mitigate | CLOSED | Unchanged — code removed as designed |
| T-28-13 | 28-06 | Elevation of Privilege | `GAMELIB_KEYRING_SELFCHECK` mistaken for D-08 escape hatch | mitigate | CLOSED | Unchanged — flag fully removed |
| T-28-14 | 28-06 | Repudiation | phase claimed complete without hardware observation | mitigate | CLOSED | Unchanged — observation recorded, not just instructed |
| T-28-15 | 28-06 | Tampering | un-owned scaffolding surviving the phase | mitigate | CLOSED | Unchanged — zero scaffolding markers remain |
| T-28-SC | 28-02 | Tampering | `keyring` crate supply chain | mitigate | CLOSED | Additive feature-flag change only, still major v3 |

**Reconciling count: 11/11 CLOSED, 0 OPEN.**

---

## T-28-03b (28-01) — `handleFrame()` inbound direction — mitigate — CLOSED

Evidence: `src/backend/sidecar/sidecarRpc.ts:146-154` — `isValidRequest()` accepts only
`request.kind === 'invoke' | 'send' | 'openExternal'`; `'rustInvoke'` is never in that list, so
the Rust shell cannot drive a `rustInvoke` frame into the sidecar (direction enforced by an
allow-list, not by convention).

```
151:    (request.kind === 'invoke' ||
152:      request.kind === 'send' ||
153:      request.kind === 'openExternal') &&
```

`git log --since=2026-07-22 -- src/backend/sidecar/sidecarRpc.ts` shows 6 commits touching this
file since the July audit (frame-queueing fix, prettier pass, keyring_get timeout/caching,
CR-04 dialog_open exemption, two diagnostic-logging commits later reverted). None touch
`isValidRequest()`'s accepted-kind list. **Unchanged since July.**

## T-28-06 (28-01) — oversized/malformed frames on the new kind — accept — CLOSED

Evidence: `src/backend/sidecar/sidecarRpc.ts:51` (`MAX_LINE_LENGTH = 10 * 1024 * 1024`) and
`:279` (`if (buffer.length > MAX_LINE_LENGTH && !buffer.includes('\n'))`) — the same
newline-framing guard from Phase 27 still applies generically to every frame kind, including
`rustInvoke`; no per-kind bypass exists. Accepted-risk entry AR-28-02 is present in
`28-SECURITY.md`'s Accepted Risks Log (dated 2026-07-22, `grayson.mitchell`) and the rationale
(pre-existing generic guard, no new/bypassed per-kind guard) still matches the current code.
**Unchanged since July.**

## T-28-07 (28-02) — `openExternal` URL arriving from a sidecar frame — accept — CLOSED

Evidence:
- Sidecar-side guard unchanged: `src/backend/storeManagers/steam/games.ts:284-296`
  (`buildSteamProtocolUrl`) rejects any `appId` failing `/^\d+$/` before constructing a
  `steam://` URL, logging the rejection and returning `null` rather than emitting a frame.
- Rust-side forwarding unchanged in posture: `src-tauri/src/main.rs:451-452` (`fn open_external`)
  and `:5755-5761` (the `rustInvoke`-adjacent `kind == "openExternal"` inbound branch) hand the
  URL straight to `tauri-plugin-opener`'s `open_url` with no independent validation — Rust
  continues to trust the sidecar's guard, exactly the accepted posture inherited from Phase
  27 (T-27-02/T-27-08) and restated by AR-28-03.
- Accepted-risk entry AR-28-03 present in `28-SECURITY.md`.

**Unchanged since July.** (Not the same code path as `main.rs`'s ~97 other commits touched —
confirmed `open_external`/`openExternal` region untouched by the F-9/slot-parameterization/
cache-epoch commits listed in the re-audit brief, which land elsewhere in the file.)

## T-28-08 (28-03) — untrusted caller invoking `setTokenStore()` to redirect token writes — accept — CLOSED

Evidence: `src/backend/storeManagers/steam/tokenStore.ts:197-203` — `setTokenStore()` remains a
plain backend export (no `window.api.*`/preload/IPC surface) that logs on every call
(`logInfo(\`Steam TokenStore implementation set to ${next.constructor.name}\`, ...)`) before
reassigning the module-global `activeTokenStore`.

`grep -rn "setTokenStore" src/preload/ src/frontend/` returns zero matches — confirmed today,
same as the July finding behind AR-28-04.

**Drift note (informational, not a gap):** a new caller exists since July —
`src/backend/sidecar/devSecretVault.ts:270` calls `setTokenStore(new DevVaultTokenStore(path))`
under the `GAMELIB_DEV_SECRET_VAULT=1` developer-only escape hatch (added by the 34.5 gap-cycle-4
dev-vault work; documented in the user's own memory as a mechanism to avoid Keychain prompting
during development). This caller is itself in-process backend code with the same privilege level
as every other caller this threat's disposition already covers ("any caller already has full
in-process backend privileges") — it does not add a new *trust boundary crossing*, only a new
in-process caller. Structurally still accept-and-closed, but flagged here since it is new attack
surface adjacent to this threat's component that the July audit could not have seen.

## T-28-10 (28-04) — token store swapped before/after handlers observe it (ordering) — mitigate — CLOSED (with a flagged verification-drift)

Evidence: `src/backend/sidecar/bootstrap.ts` — `init()` is synchronous (`export function init(...): void`,
no `await` anywhere in its body between `startRpcServer(input, output)` at line 507 and
`installTokenStore(new SidecarKeyringTokenStore())` at line 541). Order confirmed by direct read:
`startRpcServer()` (507) → `registerProtocolUrlHandler()` (511) → `electronStub.bindTransport({...})`
(512-515) → exclusive branch: `installDevSecretVault()` or else
`installTokenStore(new SidecarKeyringTokenStore())` + `installSidecarHumbleSecretStore()` (531-551).
Because `init()` never yields to the event loop before this point, no inbound stdin frame can be
dispatched to a handler while the default `ElectronTokenStore` is still active — the property the
threat asks for is verified by control-flow tracing, not merely by comment.

The code comment at `bootstrap.ts:516-524` explicitly restates the T-28-10 ordering constraint
and explains why the (July-nonexistent) `installDevSecretVault()` exclusive branch, added by the
34.5 gap-cycle-4 dev-vault work, preserves it.

**Verification-drift finding:** the 28-04-PLAN.md Task 3 acceptance criterion —
`grep -n "bindTransport" -A 12 src/backend/sidecar/bootstrap.ts | grep -c "SidecarKeyringTokenStore"`
— was the plan's own declared proof that the install call sits "adjacent to, and after,
`bindTransport`." Re-run against today's tree:

```
$ grep -n "bindTransport" -A 12 src/backend/sidecar/bootstrap.ts | grep -c "SidecarKeyringTokenStore"
0
```

This returns 0, not >=1: the dev-vault branch inserted ~29 lines between `bindTransport()` and
`installTokenStore(new SidecarKeyringTokenStore())`, pushing it outside the `-A 12` window. This
grep is **not wired into any test or CI gate** — it was a one-shot Task 3 acceptance criterion,
never encoded as a durable assertion (confirmed: no test file references `T-28-10` by ID, and no
test asserts adjacency/ordering between `bindTransport` and `installTokenStore`). The substantive
property (order + no yield point) is still true by hand-verification above, so this closes as
CLOSED, but the plan's own chosen proof mechanism is now silently false — if anyone re-ran the
literal Task 3 acceptance criterion today believing it still protects this ordering, it would
report a false negative. Recommend widening the grep window or adding a durable structural test
if this ordering is re-touched again.

## T-28-11 (28-05) — the test destroying the developer's real Steam session — mitigate — CLOSED (mechanism replaced, stronger)

Evidence: `src/backend/sidecar/__tests__/electronUntouched.test.ts:1-30` — the file's own
docstring records that the mechanism the July plan/SECURITY.md described (**"Full pre-run
snapshot captured and RESTORED in `finally`/`afterEach`"**) is no longer what ships. That
snapshot/restore approach **actually failed once**: "That restore never ran when the Jest worker
was force-killed ... and it permanently destroyed a real developer's Steam session — their
refresh token was wiped and `config.json` was left as `{}`." (commit `92c29a5ea`,
`fix(28-05): make electronUntouched.test.ts strictly read-only, isolate skeletonFlows Test 4`).

Current mechanism (stricter than July's plan text): the suite is now **purely read-only** —
`beforeAll` only calls `readRealStoreFileBytes()` (line ~153), never writes, and the docstring
bans `.set()`/`.delete()`/`.clear()` calls anywhere in the file. Verified today:

```
$ grep -n "\.clear(" src/backend/sidecar/__tests__/electronUntouched.test.ts
4: * ── STRICTLY READ-ONLY. DO NOT ADD `.set()`/`.delete()`/`.clear()` CALLS HERE. ──
155:  // `.set()`/`.delete()`/`.clear()` call exists anywhere in this file.
```

Both hits are inside comments — zero executable `.clear()`/`.set()`/`.delete()` calls in the
file. `clear()` is not merely "forbidden by an acceptance criterion" as the July plan states —
there is nothing left in the mechanism capable of writing at all.

**Drift finding (favorable):** the July SECURITY.md's claimed mitigation mechanism for T-28-11
was already superseded by the time of the July audit's own date (the incident and the
read-only rewrite both predate 28-SECURITY.md's `created: 2026-07-22` per the commit trail), so
the July audit closed this against a description that no longer matched shipped code even then.
Today's actual code is a strictly stronger mitigation (no write path exists at all, vs.
"write-then-restore"), so still CLOSED — but this is a concrete instance of documentation
describing a mechanism the code had already moved past.

## T-28-12 (28-06) — the self-check overwriting the production Keychain entry — mitigate — CLOSED

Evidence: the self-check code this threat concerns no longer exists in `src-tauri/src/main.rs`
(removed by Task 4, commit `a1966f7b`, confirmed below under T-28-15) — so there is no code path
left that could write to the production `KEYRING_ACCOUNT` under a self-check trigger. Production
constants are untouched and isolated:

```
$ grep -n "KEYRING_SERVICE\|KEYRING_ACCOUNT" src-tauri/src/main.rs | head -3
246:const KEYRING_SERVICE: &str = "com.gamelib.launcher";
247:const KEYRING_ACCOUNT: &str = "steam-refresh-token";
```

`28-PROOF.md` §2 Step 1 records the self-check, while it existed, in fact wrote/read/deleted only
`account=steam-refresh-token-selfcheck` (the `-selfcheck` suffix), never `steam-refresh-token`
itself — confirming the mitigation held for the window it was live, and Task 4's removal is the
now-permanent closure. **Unchanged from July's intended end-state** (self-check gone).

## T-28-13 (28-06) — `GAMELIB_KEYRING_SELFCHECK` mistaken for/growing into a D-08 escalation — mitigate — CLOSED

Evidence: zero references to the flag remain anywhere in the shipped tree:

```
$ grep -rln "GAMELIB_KEYRING_SELFCHECK" --include="*.rs" --include="*.ts" --include="*.toml" . | grep -v node_modules | grep -v .planning/
(no output)
```

The flag cannot "grow into" an escape hatch because it no longer exists to grow. This is the
strongest possible closure of an Elevation-of-Privilege concern about a diagnostic flag: removal,
not containment. **Unchanged since July** (it was already removed by the time of the July audit
per its own trail note "Grepped `src-tauri/src/main.rs` for surviving `selfcheck` /
`GAMELIB_KEYRING_SELFCHECK` references — zero"; re-confirmed against today's tree independently).

## T-28-14 (28-06) — the phase claimed complete without the hardware observation — mitigate — CLOSED

Evidence: `.planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-PROOF.md`
§2 "Hardware proof" (lines 42-115) records **verbatim terminal output**, not a paraphrase or an
instruction-to-verify, for Steps 1 (round-trip, byte-identical verdict), 2 (Deny path, exact
`keyring::Error` debug: `PlatformFailure(Error { code: -128, message: "User canceled the
operation." })`), 3 (rebuild re-prompt), and 4 (Electron-untouched diff/md5 comparison) — all
marked PASS. Step 5 (openExternal live launch) is explicitly marked **NOT VERIFIED**, with the
prose stating plainly it is "not claimed as a pass," matching the disposition's exact requirement
("step 5 must be reported NOT VERIFIED rather than assumed"). This is a genuine hardware
observation record, not merely an instructed-but-unrun checkpoint — the specific error code,
message, and byte-comparison verdicts could not have been fabricated without running the actual
build.

`28-PROOF.md` §"Scaffolding removal record (Task 4)" additionally confirms the precondition gate
held in practice: the removal commit came *after* this proof was recorded, matching Task 4's
"refuses to delete until 28-PROOF.md already holds the recorded hardware output" acceptance
criterion. **Unchanged since July** — this is a point-in-time artifact, not touched by any of
the ~97 later `main.rs` commits.

## T-28-15 (28-06) — un-owned scaffolding surviving the phase — mitigate — CLOSED

Evidence, re-run today:

```
$ grep -c "SCAFFOLDING (28-06 Task 1)" src-tauri/src/main.rs
0
$ grep -c "GAMELIB_KEYRING_SELFCHECK" src-tauri/src/main.rs
0
$ grep -ci "selfcheck" src-tauri/src/main.rs
0
$ grep -v "^\s*//" src-tauri/src/main.rs | grep -c "dispatch_rust_channel"
3
$ grep -c 'KEYRING_SERVICE: &str = "com.gamelib.launcher"' src-tauri/src/main.rs
1
```

All five Task 4 acceptance-criteria greps pass identically to their designed post-removal state:
zero banner markers, zero selfcheck references (case-insensitive), and production keyring
dispatch/constants intact and unmoved. `cargo build` was not re-run live in this audit (read-only
constraint over implementation), but the absence of any `SCAFFOLDING`/`selfcheck` token and the
presence of the production constants is independently sufficient evidence the scaffolding did not
survive.

`28-PROOF.md`'s "Finding 3 — Scaffolding residue left behind by the Deny run" is worth noting for
completeness: it records that a Keychain entry (`steam-refresh-token-selfcheck`) and a scratch
file (`$TMPDIR/gamelib-keyring-selfcheck-seed.txt`) were left on the *developer's local machine*
by the self-check while it was live, and were never claimed to be auto-cleaned. This is
developer-machine residue from a diagnostic that no longer exists in the codebase, not shipped
scaffolding — out of scope for a code-level "un-owned scaffolding surviving the phase" threat,
but flagged here since a literal reading of "surviving" could include it. **Unchanged since
July.**

## T-28-SC (28-02) — the `keyring` crate supply chain (cargo) — mitigate — CLOSED

Evidence:

```
$ grep -n "keyring" src-tauri/Cargo.toml
31:keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
$ grep -n -A3 'name = "keyring"' src-tauri/Cargo.lock
2085:name = "keyring"
2086:version = "3.6.3"
2087:source = "registry+https://github.com/rust-lang/crates.io-index"
2088:checksum = "eebcc3aff044e5944a8fbaf69eb277d11986064cba30c468730e8b9909fb551c"
```

Still resolves from `crates.io`, still on major version `3` as RESEARCH.md's Package Legitimacy
Audit approved (17.4M downloads, `open-source-cooperative/keyring-rs`). The one change since July
— commit `0912daca9` (`feat(34-02): add cross-platform keyring features + updater/shell crates`,
2026-07-24) — is purely additive (`windows-native`, `sync-secret-service` features added
alongside `apple-native`), stays on the same pinned major version, and shipped with its own
regression coverage (`src/backend/__tests__/cargoFeatures.test.ts`, confirmed present today) and
a build verification note in the commit message ("no libdbus pulled into the mac build"). No new
crate, no version bump past major `3`, no unpinned/wildcard dependency introduced.
**Drift: additive-only, still CLOSED.**

---

## Notes for the parent audit (not part of this shard's 11-count)

- No `unregistered_flag` entries found from 28-03/28-04/28-05 SUMMARY.md `## Threat Flags`
  sections — all three explicitly say "None," and the flag content matches the phase's own
  register (T-28-01/02/04/05/08/09/10/11).
- `28-01-SUMMARY.md` and `28-02-SUMMARY.md` and `28-06-SUMMARY.md` have no `## Threat Flags`
  heading at all — treated as no new attack surface reported by the executor for those plans
  (consistent with the phase's own register having only accept/mitigate rows, no residual gaps
  flagged at execution time).
- The `devSecretVault.ts` addition (noted under T-28-08 above) is new attack surface adjacent to
  this shard's units but does not itself map cleanly to a single-occurrence ID in this shard;
  flagging it here for the parent audit's awareness in case shard R's recurring-ID sweep (which
  covers T-28-01/02/04/05/09) should account for it against those IDs instead.
