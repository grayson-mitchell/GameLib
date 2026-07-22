# Phase 30: Tauri IPC re-plumb slice 1 — install, uninstall, update-check - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
**Areas discussed:** Login prerequisite, Queue boundary, Runner breadth, Native API needs

---

## Login prerequisite

Scouting found the Tauri build cannot reach an Install button at all: the login
channel is unported, so the library renders empty and signed-out
(SEAM.md §1, 28-PROOF.md §4). This was not visible from the ROADMAP entry.

### Q1 — How should Phase 30 resolve the missing login path?

| Option | Description | Selected |
|--------|-------------|----------|
| Fold login port in first | Port startQRLogin/startCredentialLogin as plan 01, then the install slice on top; Phase 28's keyring makes it safe by construction | ✓ |
| Seed the keyring, skip login UI | Write a valid refresh token into the Keychain out-of-band; cheaper but leaves Phase 27 UAT 2/3 blocked | |
| Prove via direct invoke | Drive the handlers from a test harness with no UI path; weakens the roadmap's "proven E2E in the Tauri build" bar | |

**User's choice:** Fold login port in first
**Notes:** Becomes CONTEXT D-01. Side effect: this is also the change that
unblocks Phase 27 UAT steps 2/3, which Phase 28 explicitly did not.

### Q2 — How much of the login surface?

| Option | Description | Selected |
|--------|-------------|----------|
| QR only (minimum viable) | startQRLogin + polling/push + the reads the login gate needs; no credential/SteamGuard/TOTP branches | ✓ |
| QR + credentials + logout | The whole realistic sign-in surface; pulls in the SteamGuard prompt path, which likely needs real dialog wiring | |
| You decide | Let the planner scope from what GlobalState.tsx's login gate reads | |

**User's choice:** QR only
**Notes:** Becomes D-02. Consistent with the later D-09 decision to port only the
narrowest slice of `dialog`.

### Q3 — The two-token divergence (keyring-native sidecar vs OSCrypt configStore)

| Option | Description | Selected |
|--------|-------------|----------|
| Accept + prove isolation | New proof artifact mirroring 28-PROOF's "Electron session untouched" shape, plus a SEAM.md constraint | |
| Accept, document only | SEAM.md constraint entry + code comment; rely on Phase 28's by-construction argument | ✓ |
| Attempt convergence | Would require hand-rolling Chromium OSCrypt in the sidecar — rejected by Phase 28 D-01 | |

**User's choice:** Accept, document only
**Notes:** Becomes D-03. Signing in under Tauri does not sign you in under
Electron; that is the correct consequence of Phase 28 D-01, not a bug.

### Q4 — Sign-off bar for the folded-in login port

| Option | Description | Selected |
|--------|-------------|----------|
| Real QR scan, human UAT | A human scans the QR in the Tauri window; hardware-verified, same bar as Phases 24/25 | |
| Automated + deferred human step | Assert wiring and token round-trip in tests; log the live scan as a deferred UAT item (Phase 21 pattern) | ✓ |

**User's choice:** Automated + deferred human step
**Notes:** Becomes D-04. **Recorded tension:** D-01's motivation was a real
clickable E2E, and this defers exactly that step — which also defers the install
slice's own hardware proof, since every install acceptance depends on a populated
library. CONTEXT.md carries this forward as an explicit warning so the phase's
claim reads "wired and unit-proven", not "hardware-proven".

---

## Queue boundary

Scouting found `install`/`updateGame` are registered in
`src/backend/downloadmanager/ipc_handler.ts` and do nothing but `addToQueue(...)`
— the real work is inside DownloadManager, which is Phase 32's cluster.

### Q1 — How should the sidecar's install handler work?

| Option | Description | Selected |
|--------|-------------|----------|
| Port the queue with it | Import downloadqueue.ts and register the real handlers unchanged; truest to "real backend code behind the new transport" but absorbs most of Phase 32 | |
| Direct bypass, defer queue | Call SteamGame.install()/uninstall() directly; small and curated, but semantics diverge and it is code Phase 32 deletes | |
| You decide | Let research weigh downloadqueue.ts's import-time cost against divergence risk | ✓ |

**User's choice:** You decide → CONTEXT D-05 / Claude's Discretion D-05a
**Notes:** Noted for research: Phase 29 D-15 already extracted `downloadManager`'s
store declaration into a thin module *specifically* because "downloadManager is
exactly what Phase 30's install/uninstall slice needs" — groundwork that favors
the port.

### Q2 — Push notifications (gameStatusUpdate / progressUpdate)

| Option | Description | Selected |
|--------|-------------|----------|
| Status push yes, byte-progress deferred | Wire gameStatusUpdate so button state is correct; leave high-frequency byte/percent throughput to Phase 32 | ✓ |
| Both, full fidelity now | Identical to Electron, but front-loads the volume question Phase 32 exists to answer | |
| Neither — fire and forget | Install appears to hang until manual refresh; makes the slice unprovable as a user flow | |

**User's choice:** Status push yes, byte-progress deferred
**Notes:** Becomes D-06. Expected to need zero Rust changes — Phase 29's
`storeChanged` already proved the `frontend_message` relay generic over channel
name.

### Q3 — Which SteamGame.install() branch must work?

| Option | Description | Selected |
|--------|-------------|----------|
| Native depot download only | Pure Node/filesystem; no CrossOver, bottle, or bridge helper; where the Phase 21/23/25 investment went | ✓ |
| Depot + bottle | Broader macOS coverage, but drags the CrossOver toolchain and Phase 24's bridge machinery into the sidecar | |
| Whatever the test game needs | Pragmatic but leaves the covered branch implicit | |

**User's choice:** Native depot download only
**Notes:** Becomes D-07. Bottle/bridge branches stay unported and non-fatal per
Invariant B.

**Continue check:** "Next area" — moved on to Runner breadth.

---

## Runner breadth

### Q1 — Steam-only curated import, or the full libraryManagerMap?

| Option | Description | Selected |
|--------|-------------|----------|
| Steam-only, curated | Holds the import graph small; but handlers diverge from Electron's runner-generic shape and Epic/GOG installs stay broken under Tauri | |
| Full libraryManagerMap | Electron's own code unchanged, every runner works; but eagerly constructs all 6 managers — the import-time-wall class spike 009 documented | |
| You decide | Let research measure what storeManagers/index.ts actually costs at sidecar import time | ✓ |

**User's choice:** You decide → Claude's Discretion D-05b
**Notes:** Flagged for research: `storeManagers/index.ts` is *already*
force-imported by `steamFlowRegistration.ts`'s load-bearing first import (the
27-05 circular-init fix), so all six managers likely already exist in the sidecar
today — meaning "Steam-only" may buy no import-graph savings at all. Verify
before planning commits.

### Q2 — Where do the new handlers live?

| Option | Description | Selected |
|--------|-------------|----------|
| Two new domain modules | steamAuthFlowRegistration.ts + installFlowRegistration.ts; matches checklist step 2 and keeps each import graph auditable | ✓ |
| One new module | Fewer files, but mixes an auth domain with a game-lifecycle domain | |
| Extend steamFlowRegistration.ts | Simplest diff, but becomes the catch-all the curated-import discipline prevents | |

**User's choice:** Two new domain modules
**Notes:** Becomes D-08.

**Continue check:** "Next area" — moved on to Native API needs.

---

## Native API needs

### Q1 — Which no-op'd Electron APIs get real behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog only (openDialog) | An install with no folder picker isn't a completable flow; Notification stays a logged no-op | ✓ |
| Dialog + Notification | Both real; more Rust surface + a permission prompt for a non-blocking nicety | |
| Neither — narrow the flow | Default install path, no picker; smallest phase but the E2E isn't the real user flow | |
| You decide | Let research determine which the depot path actually reaches | |

**User's choice:** Dialog only
**Notes:** Becomes D-09. Wired via the generic `rustInvoke` channel per checklist
step 6 — `dialog` was one of the four motivating examples when Phase 28 built it.
The `Notification` decline must be a *logged* no-op, since silent no-ops are the
exact failure mode checklist step 3 warns about.

### Q2 — The InstallModal's unported read cluster

DownloadDialog calls requestAppSettings, requestGameSettings, checkDiskSpace,
getGameOverride, getGameSdl, getPrivateBranchPassword — all unported, mostly
Phase 31's cluster. They reject non-fatally per Invariant B, but the modal may
render unusable.

| Option | Description | Selected |
|--------|-------------|----------|
| Port the minimum reads | Read-only handlers for exactly what the Steam depot path's modal needs; boundary must be declared, not discovered | ✓ |
| Let them degrade | Change nothing; risks a modal that won't submit and blocks the E2E | |
| Bypass the modal | Tauri-only frontend divergence, which the additive/reversible invariant has so far avoided | |

**User's choice:** Port the minimum reads
**Notes:** Becomes D-10.

### Q3 — How is the ported-channel boundary recorded?

| Option | Description | Selected |
|--------|-------------|----------|
| Declared list + SEAM.md update | One explicit list of every ported channel, plus the §3→§1 move checklist step 5 requires | ✓ |
| SEAM.md update only | Less duplication, but the "minimum modal reads" subset is easy to lose in prose | |

**User's choice:** Declared list + SEAM.md update
**Notes:** Becomes D-11. Phase 31 starts from the remainder.

**Final check:** "I'm ready for context" — no further gray areas explored.
Offered but declined: cancel/interrupt semantics for an in-flight sidecar
install, whether Phase 23's open gaps constrain the depot branch, and the
verification shape for the additive/reversible invariant.

---

## Claude's Discretion

- **D-05a** — Port `downloadqueue.ts` into the sidecar vs a direct
  `SteamGame.install()` bypass. Research measures the real import-time cost.
- **D-05b** — Steam-only curated import vs the full `libraryManagerMap`, given
  that the map is likely already constructed in the sidecar today.
- **D-12** — Whether `checkGameUpdates` returns Steam-only or all-runner results;
  follows from D-05b and must not diverge from it silently.

## Deferred Ideas

- Credential / SteamGuard / TOTP login and sign-out (D-02).
- Byte-level `progressUpdate` throughput — Phase 32's headline question (D-06).
- DownloadManager queue semantics: pause/resume/cancel, `removeFromDMQueue`,
  `getDMQueueInformation`, startup resume — Phase 32 unless D-05a pulls it in.
- CrossOver bottle and macOS bridge install branches (D-07) — no phase owns these
  under Tauri yet; one will be needed before the Phase 35 cutover.
- Real `Notification` / `tauri-plugin-notification` (D-09) — Phase 33.
- The full `dialog` cluster beyond open-directory (D-09) — Phase 31.
- The settings/config read cluster beyond D-10's minimum — Phase 31.
- Converging the Electron and Tauri secret policies — Phase 29 D-08, Phase 35.
- A public `onDidChange`/reactive store API — Phase 29 deferred.

### Reviewed Todos (not folded)

All four `todo.match-phase 30` hits were keyword false-positives:

- *Productionize the macOS native Steam bridge* (0.7) — "api" + area "steam";
  Phase 24's arc, and D-07 excludes the bridge branch.
- *Steam bottle setup offers GPTK/Wine engines that produce a broken bottle*
  (0.7) — "backend" + area "steam"; D-07 excludes the bottle branch.
- *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle
  games* (0.6) — "phase, install"; Electron-side startup-resume bug, adjacent to
  Phase 32's queue work.
- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* (0.2) —
  "phase"; unrelated Steam PICS concern.
