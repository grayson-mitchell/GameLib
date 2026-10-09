---
created: 2026-08-17T00:00:00.000Z
title: "Humble's two keyring slots still read unattended at bootstrap — 260817-d61 deferred one slot of three, so the boot-prompt symptom is only partly fixed"
area: auth
severity: minor
platform: any
ready: blocked
needs: design-then-code-fix
status: "RESOLVED 2026-10 by Phase 49 — the boot read is now deliberate, bounded and labelled; see the Resolution section"
resolves_phase: 49
found_by: "Quick task 260817-d61 live gate (measured on hardware, two independent launches)"
source: ".planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md"
files:
  - src/backend/humble/user.ts
  - src/backend/humble/library.ts
  - src/backend/sidecar/humbleSecretStore.ts
  - src/backend/storeManagers/steam/authTrigger.ts
---

## PARKED 2026-09-04 — superseded by a design decision

Deferring the Humble keyring read **conflicts with** a planned cross-store signed-out/offline
mode (ROADMAP Phase 999.1), which needs boot-time auth state in order to render its warning
banner at all. You cannot both refuse to read the credential at boot and accurately tell the user
at boot that their session has expired.

Three findings, measured 2026-09-04:

1. **The dev symptom this todo was filed against is not what it fixes.** The ~6 Keychain prompts
   on a `tauri dev` rebuild are a prompt *quantity* problem; deferral changes prompt *timing*
   only. `GAMELIB_DEV_SECRET_VAULT=1` (`src/backend/sidecar/devSecretVault.ts`, verified present
   2026-09-04) skips all three slots in dev and removes them outright.
2. **Shipped-build prompt count is governed by code signing, not read timing.**
   `.github/workflows/release-tauri.yml` signs + notarizes only when `APPLE_CERTIFICATE`,
   `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` are all enrolled; otherwise it emits
   `::warning::...shipping unsigned` and ships anyway. An unsigned build gets a fresh code
   identity per release, so the Keychain ACL never matches and macOS re-prompts on every update.
   **Open action, not yet done: confirm those secrets are enrolled.** That is the real lever on
   prompt quantity for real users, and it is independent of everything else in this file.
3. **The boot signal is already partly free.** `HumbleUser.isLoggedIn()` reads a plain
   `configStore` flag with no keyring access, so "Humble is not connected" costs nothing at boot.
   Only "session expired" needs `checkHealthAndFlagExpiry()` (`user.ts:757`), which is precisely
   what reads both slots (`user.ts:757` → `humble-session`, `user.ts:803` → `humble-csrf`).

**What remains true.** The measured evidence in this file is not withdrawn: two independent
launches did record ~12.5 s of unattended Keychain prompt latency across the two Humble slots.
Only the proposed *remedy* is parked, not the observation.

**Unpark condition:** if Phase 999.1 is dropped, or lands in a shape that does not need boot-time
auth state, this todo's original UX argument stands again unchanged.

**2026-10-08: Phase 999.1 was promoted out of the backlog as Phase 49** (same title, still
unplanned: Requirements TBD, 0 plans). This does NOT unpark the todo — the condition above is
about the *shape* the phase lands in, and promotion settles nothing about shape. Read every
"Phase 999.1" below as "Phase 49". Whoever specs Phase 49 should decide the boot-time-auth question
explicitly; that decision is what unparks or permanently closes this file.

**2026-10-08, later the same day: DECIDED in `49-SPEC.md`, round 2.** Phase 49 probes all five
stores at boot in one bounded pass, Humble and Steam keyring reads included. It does need
boot-time auth state, so the unpark condition can no longer be met: this todo's remedy
(deferring the read) is permanently superseded. Its evidence is carried forward as the reason
Phase 49's R3 is time-bounded rather than unbounded. Close this file when Phase 49's plan lands
R3; until then it stays `ready: blocked` so the measured prompt latency is not lost.

## Problem

Quick task `260817-d61` deferred the **Steam** refresh-token read off the startup path so its
Keychain prompt arrives attached to a deliberate user action. There are **three** keyring slots
(`keyring_account`, `src-tauri/src/main.rs:257`):

| Slot | Reads at startup? |
|---|---|
| `steam-refresh-token` | **No** — deferred by `260817-d61` |
| `humble-session` | **Yes**, unattended |
| `humble-csrf` | **Yes**, unattended |

So the user-visible symptom this whole line of work exists to fix — *"an unexplained Keychain prompt
at boot"* — is **still present**. Two of three prompts remain, and they are exactly as
context-free as Steam's used to be.

## Measured on hardware, 2026-08-17

Two independent launches, both with the Steam deferral live. Preserved evidence:
`260817-d61-gateA-evidence.log` and `260817-d61-gateA-run2-evidence.log`.

Launch 1 (11:38):
```
(11:38:35) SidecarKeyringSlotStore(humble-session).getToken(): issuing keyring_get (may prompt) trigger=unspecified
(11:38:42) SidecarKeyringSlotStore(humble-session).getToken(): keyring_get ok present=true len=208 trigger=unspecified elapsed=6688ms
(11:38:43) SidecarKeyringSlotStore(humble-csrf).getToken():    issuing keyring_get (may prompt) trigger=unspecified
(11:38:48) SidecarKeyringSlotStore(humble-csrf).getToken():    keyring_get ok present=true len=29  trigger=unspecified elapsed=5887ms
```

Launch 2 (11:46) reproduced the same shape. **12.5 s of unattended prompt latency across the two
slots**, before the user has done anything.

`trigger=unspecified` is correct and by design — `260817-d61` kept `keyringTokenStore.ts`
slot-agnostic rather than importing a Steam module into a shared store. Any fix here should supply
Humble's own trigger label, not reuse Steam's.

## Why this is worth doing, and one reason it may be worth MORE than the Steam fix

The operator reported ~4 password prompts on a `tauri dev` rebuild. Two were these Humble reads;
the rest were the dev-ACL path. **Steam contributed zero.** From the user's seat, `260817-d61`
removed one prompt out of several — a real improvement they may not notice.

There is also a compounding argument. If context-free prompts train a dismiss-reflex, Humble's two
unattended prompts arrive **first**, at boot, and Steam's later well-contextualised prompt inherits
whatever habit they establish. Fixing Steam alone leaves the training intact.

## Direction

Mirror `260817-d61`'s shape rather than inventing a second mechanism:

- Establish what actually forces the Humble reads at bootstrap. Start at
  `humbleSecretStore.ts:73`'s `SLOT_STORES.sessionCookie` and `humble/library.ts`'s startup sync
  (`Humble sync:` lines appear immediately after the reads in both logs) — the sync is the likely
  driver, matching how Steam's `refresh()` drove its read.
- Reuse the existing `authTrigger.ts` pattern (sticky, process-scoped unlock; origin **allowlist**,
  never a denylist) or generalise that module to be slot-keyed. Do NOT copy-paste a second
  divergent gate.
- Keep the deferred state honest in the UI, as the Steam gate does: `260817-d61` emits the existing
  `steamSyncStatus: 'idle'` rather than stranding the UI in `syncing` or falsely reporting `failed`.
  Humble needs the equivalent, and its cached library must still render.
- Preserve `encryptionDegraded` semantics (`humble/user.ts:115`) — that flag is driven off
  `isAvailable()`, which is itself a prompting read; see the sibling todo.

## Honest caveat, carried from `260817-d61`

Do **not** justify this work as fixing a keyring failure *rate*. The observed 9:1 read-failure ratio
is a **dev-build artifact of ad-hoc code signing** (memory `keyring-timeout-races-keychain-approval`),
not a prompt-context problem, and `260817-d61` retired that measurement as ill-posed. The
justification here is solely the UX property: on a production build the prompt fires once, and it
should fire attached to something the user did.

## UPDATE 2026-09-30 — finding 2's open action is CLOSED; this todo stays PARKED

This section does not revise `## PARKED 2026-09-04` above it. That section records what was known
on its own date and is left intact; this one adds what was measured on 2026-09-30.

**Finding 2's "Open action, not yet done: confirm those secrets are enrolled" is DONE, and went
past confirmation.** All six Apple secrets were enrolled 2026-09-14, and on 2026-09-30 the
mechanism itself was measured rather than assumed. The evidence lives in section
`## STATUS 2026-09-30 (quick-260930-nt4)` of
`.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`.
Treat finding 2's closing sentence as spent — do not re-run it as an open action.

**Finding 2's mechanism claim was CORRECT, and if anything understated.** It said an unsigned build
"gets a fresh code identity per release, so the Keychain ACL never matches". Measured: the signed
bundle's designated requirement carries NO cdhash at all — it is identifier plus Apple anchor plus
Team OU — whereas the ad-hoc dev builds carry bare cdhash DRs AND Cargo-derived identifiers
(`gamelib_shell-<hash>`, not `com.gamelib.shell`). That is two independent reasons a dev rebuild
re-prompts, not one. A probe pinned to the same `keyring` version read an item silently across a
different build sharing one identity, and blocked behind a password prompt under an ad-hoc
signature.

**THIS DOES NOT UNPARK THIS TODO, and `ready: blocked` is deliberately unchanged.** The unpark
condition above is about Phase 999.1, not about signing — finding 2 says in its own words that it
is "independent of everything else in this file". Re-measured 2026-09-30: ROADMAP still carries
`### Phase 999.1: Cross-store signed-out / offline mode (BACKLOG)`, Goal
"[Captured for future planning]", Requirements TBD, 0 plans, and the same shape that needs
boot-time auth state to render its banner. The conflict that parked this file stands untouched.

**One new data point that IS about these two slots.** On 2026-09-30 all three live
`com.gamelib.launcher` items were deleted and confirmed absent. After one launch of a signed build
with no login, `steam-refresh-token` came back, but `humble-session` and `humble-csrf` stayed
ABSENT. So the Humble credentials appear to be Keychain-only, with no second on-disk home — unlike
Steam's, now tracked separately in
`.planning/todos/pending/2026-09-30-clearing-the-keychain-does-not-revoke-the-steam-refresh-token.md`.
That asymmetry was not known when this file was written, and it may matter to the remedy: a
deferral design for these two slots cannot lean on a non-Keychain fallback, because there is none.

## Related

- `260817-d61` live gate: `.planning/quick/260817-d61-.../260817-d61-LIVE-GATE.md`
- Resolved sibling: `.planning/todos/completed/keyring-read-lazy-at-point-of-use.md`
- Sibling todo: `2026-08-17-keyring-available-is-a-silent-prompt-channel.md`
- Memory `dev-secret-vault-avoids-keychain-prompts` — `GAMELIB_DEV_SECRET_VAULT=1` skips all three
  slots in dev; it is opt-in, and unset is what makes dev runs pester.

## Resolution — Phase 49

Closed by Phase 49 plan 08 (cross-store signed-out / offline mode). The SPEC round-2 decision
— probe all five stores at boot in one bounded pass, Humble and Steam keyring reads included
— permanently closes the unpark condition above: this todo's remedy (deferring the read) is
superseded, not parked.

- **The measured prompt latency is not withdrawn.** The ~12.5 s of unattended Keychain prompt
  latency across the two Humble slots is the reason R3 is bounded at 45 s (D-01):
  `SIGN_IN_PROBE_BOUND_MS` equals Rust's `KEYRING_READ_TIMEOUT`, so a probe stuck behind a
  prompt resolves `unknown` rather than holding boot.
- **Humble now supplies its own trigger label (D-15).** The boot read carries
  `trigger=boot-probe` through `HumbleSecretStore.readSecret` without importing the Steam gate
  (`authTrigger.ts`), which answers this file's request for a Humble-specific label.
- **The csrf slot is no longer read at boot (D-18).** The pass reads one Humble slot
  (`humble-session`), not two.
- **The dev-build prompt symptom belongs to `GAMELIB_DEV_SECRET_VAULT=1` (D-04).** The pass has one
  code path on every platform and build and has no dev-only branch; dev-build Keychain prompts are
  that vault's job, not the pass's.
- **The renderer-mount health call is gone (D-16).** Nothing in the Library tree starts a probe;
  the pass runs once per launch after READY and again only on a later offline-to-online edge.
