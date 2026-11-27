# Phase 92: GOG, Amazon and sideloaded runners - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 92-gog-amazon-and-sideloaded-runners
**Areas discussed:** Split and order, Cloud saves proof, Discord + live gate, Folded todos

---

## Split and order

| Option | Description | Selected |
|--------|-------------|----------|
| Split now: 92 + 92.1 | 92 = GOG; 92.1 = nile, sideload, storeManagerCommon, ManagerHooks deletion | ✓ |
| One phase, planner may split | 91 D-09 shape | |
| Three phases | 92 GOG, 92.1 Amazon, 92.2 sideload + ManagerHooks | |

**User's choice:** Split now: 92 + 92.1

| Option | Description | Selected |
|--------|-------------|----------|
| One gate per sub-phase | A GOG gate in 92, an Amazon + sideload gate in 92.1 | |
| One gate at the end | A single gate after 92.1 covers all three | ✓ |

**User's choice:** One gate at the end

| Option | Description | Selected |
|--------|-------------|----------|
| Amend in this commit | Edit ROADMAP (92, 92.1, 93's Depends-on) with the CONTEXT commit | ✓ |
| Use /gsd-phase insert after | CONTEXT only; operator inserts 92.1 | |

**User's choice:** Amend in this commit

---

## Cloud saves proof

| Option | Description | Selected |
|--------|-------------|----------|
| Live both ways, throwaway title | Download and upload against a scratch save folder for a title the operator does not care about | ✓ |
| Download live, upload synthetic | Never write to the GOG cloud | |
| All synthetic | No save-sync against the cloud | |

**User's choice:** Live both ways, throwaway title

| Option | Description | Selected |
|--------|-------------|----------|
| Round trip on one title | Play, quit, delete local save, relaunch, save restored | ✓ |
| Sync runs without error | No delete/restore | |
| Round trip native + CrossOver | Also tests Wine-prefix save paths live | |

**User's choice:** Round trip on one title

---

## Discord + live gate

| Option | Description | Selected |
|--------|-------------|----------|
| Remove toggle, keep key | Delete DiscordRPC.tsx and schema entry; existing value kept as an unknown key; gate test | ✓ |
| Remove toggle and key | Versioned migration strips `discordRPC` | |
| Keep toggle, label it | Show as unavailable | |

**User's choice:** Remove toggle, keep key

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with games | Real Amazon title for captures and the gate | ✓ |
| Account, no games | Sign-in real, install/launch synthetic | |
| No account | Synthetic only | |

**User's choice:** Yes, with games

| Option | Description | Selected |
|--------|-------------|----------|
| Native mac + CrossOver | One of each, operator picks | ✓ |
| One title only | | |
| Also comet | Plus a launch with comet support on | |

**User's choice:** Native mac + CrossOver

---

## Folded todos

| Option | Description | Selected |
|--------|-------------|----------|
| Racine / Bloody Hell state | Install state disagrees with disk | ✓ |
| Auth-log sanitizers | Nested tokens leak; absent keys added | ✓ |
| GOG refresh races | Double refresh on reconnect; version-change clear race | ✓ |
| Small runner/sideload quirks | nile app name, GOG dummy empty path, sideload known-fix lookup | ✓ |

**User's choice:** All four groups (seven todos)

---

## Claude's Discretion

- Crate layout, where save_sync's Rust lives, parser/fixture/redaction design, GOG sign-out's route to
  the login-window ops, plan and wave breakdown.

## Deferred Ideas

- Real Windows/Linux gogdl and nile output and the live UAC check → Phase 99.
- A comet launch in the live gate → goldens only.
