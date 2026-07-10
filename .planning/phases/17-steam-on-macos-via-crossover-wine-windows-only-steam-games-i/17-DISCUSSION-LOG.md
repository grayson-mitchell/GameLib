# Phase 17: Steam on macOS via CrossOver/Wine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
**Areas discussed:** Bottle provisioning & scope, Bottled-Steam login, Install/Play UX & first-run, Routing & eligibility rules

---

## Bottle provisioning & scope

### Provisioning method
| Option | Description | Selected |
|--------|-------------|----------|
| Fully automated | GameLib downloads + runs SteamSetup.exe silently end-to-end | |
| Guided click-through | GameLib creates bottle + fetches SteamSetup.exe, opens the real installer for the user to click through | ✓ |
| Point at existing install | User points GameLib at a Steam.exe / bottle they already set up | |

### Bottle scope (raised by user: "do I want one bottle for Steam + GOG + Epic?")
| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Steam bottle | One managed bottle for Steam client; GOG/Epic keep their existing shared bottle | ✓ |
| One mega-bottle for all | Install Steam into the same shared 'GameLib' bottle GOG/Epic use | |
| You decide | Defer to researcher/planner | |

### Engine choice
| Option | Description | Selected |
|--------|-------------|----------|
| Reuse WineSelector (user picks) | User chooses CrossOver / Wine-GE / bundled, defaulting to detected | ✓ |
| GameLib-managed, no choice | Hide the engine choice for zero-config | |
| CrossOver-only | Require CrossOver specifically | |

**User's choice:** Guided click-through; dedicated Steam bottle; reuse WineSelector.
**Notes:** User surfaced the "one bottle for Steam+GOG+Epic?" question mid-flow. Clarified that GameLib already defaults GOG+Epic to a shared prefix/`GameLib` CrossOver bottle, so the real decision was whether to install the resident Steam client into that same bottle. Chose isolation (dedicated Steam bottle) given Steam's resident background services vs. a loose GOG/Epic exe.

---

## Bottled-Steam login

### Auth model
| Option | Description | Selected |
|--------|-------------|----------|
| User logs into bottled Steam UI | Sign into the Windows Steam window once; auth persists in the prefix; opaque to GameLib | ✓ |
| Attempt token bridge | Seed the bottled client with GameLib's existing refresh token/session | |
| You decide | Defer feasibility to researcher | |

### Login timing
| Option | Description | Selected |
|--------|-------------|----------|
| During bottle setup | Login is part of the one-time guided setup | ✓ |
| Lazily on first launch | Login window appears on first install/launch | |
| You decide | Planner sequences it | |

**User's choice:** User logs into bottled Steam UI; during bottle setup.
**Notes:** Established up front that native `steam-session` (library listing) is separate from the bottled Windows client's own auth, and token injection is unsupported/fragile. Added guidance (CONTEXT D-06) that the bottled login should be the same account as the native session or ownership won't match.

---

## Install/Play UX & first-run

### First-run (no bottle yet)
| Option | Description | Selected |
|--------|-------------|----------|
| Guided setup prompt | Click kicks off one-time setup + login, then continues the action | ✓ |
| Disabled + explainer | Install/Play disabled until user sets up the bottle in Settings | |
| You decide | Planner chooses | |

### Bottle indicator
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show an indicator | Badge/row near the existing Crossover emulation compat row | ✓ |
| Route silently | No special indicator | |
| You decide | Defer to /gsd-ui-phase | |

### Install path
| Option | Description | Selected |
|--------|-------------|----------|
| Route through the bottled Steam client | GameLib drives the bottled client's own install; ACF-style polling in the bottle | ✓ |
| Use GameLib's standard install modal | Normal modal with WineSelector/path (but Steam has no download-size data) | |
| You decide | Defer to researcher | |

**User's choice:** Guided setup prompt; show an indicator; route install through the bottled Steam client.
**Notes:** —

---

## Routing & eligibility rules

### Opt-in vs always-on
| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in (setting) | User enables the feature in Settings first | |
| Always-on for macOS | Any Windows-only Steam game on Mac routes to the bottle flow | ✓ |
| You decide | Planner picks | |

### Unknown platform data
| Option | Description | Selected |
|--------|-------------|----------|
| Treat as native until confirmed | Wait for self-heal re-fetch to confirm is_mac_native===false before bottling | ✓ |
| Treat unknown as Windows-only | Follow the is_mac_native ?? false default; unknown → bottle | |
| You decide | Defer to researcher | |

**User's choice:** Always-on for macOS; treat unknown platform data as native until confirmed.
**Notes:** Always-on is paired with the first-run guided prompt (the consent gate for provisioning), so it does not mean surprise background downloads.

---

## Claude's Discretion

- Uninstall / move mechanics for bottled games (expected to route through the bottled Steam client).
- Where the bottle-setup UI lives (Settings vs onboarding/first-run surface).
- How the guided setup + Steam login windows are surfaced (progress, error handling under Wine).
- How the per-OS `isNative()` reversal interacts with `launcher.ts` without disturbing the Linux Proton path.

## Deferred Ideas

- Opt-in Settings toggle for bottled Steam — rejected in favor of always-on; revisit if setup proves intrusive.
- Token/session bridging into the bottled client — rejected as unsupported/fragile; revisit if a reliable path is found.
- Per-game Steam bottles — rejected (many installs/logins/disk).
