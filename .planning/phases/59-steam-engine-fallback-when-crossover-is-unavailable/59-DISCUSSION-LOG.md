# Phase 59: Steam engine fallback when CrossOver is unavailable - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-31
**Phase:** 59-steam-engine-fallback-when-crossover-is-unavailable
**Areas discussed:** No-CrossOver-ever case, Fallback install & switch UX, "Broken" CrossOver detection, Trial notice & override surface

---

## No-CrossOver-ever case

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback creates the bottle | Wineboot with USER=crossover; works for everyone | ✓ |
| Only existing bottles | Fallback only rescues CrossOver-made bottles | |
| Offer a choice | Prompt: install CrossOver or continue with built-in | |

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt into CrossOver | CrossOver becomes first choice on the same prefix | ✓ |
| Stay on fallback | Fallback-made bottles stay on the fallback | |
| You decide | Research picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same place as CX bottles | CrossOver Bottles dir, same naming | ✓ |
| GameLib's own data dir | Separate tree; move or symlink on adoption | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Soft recommend | Dismissible note, non-blocking | ✓ |
| Silent | No mention | |
| Strong recommend | Prominent install step | |

**User's choice:** The recommended option on all four.

---

## Fallback install & switch UX

| Option | Description | Selected |
|--------|-------------|----------|
| On first need | Download when first required | ✓ |
| Up front, in the background | Download as soon as a bridge game exists | |
| Ahead of trial expiry | Pre-fetch at 7 days or fewer | |

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + game-page badge | Toast with reason each time, persistent badge | ✓ |
| Badge only | | |
| One-time dialog then quiet | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-return to CrossOver | Per-launch decision | ✓ |
| Sticky until user resets | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Release-driven only | Re-pin via update; override for power users | ✓ |
| User-facing "use previous version" | | |
| Automatic on failure | | |

**User's choice:** The recommended option on all four.

---

## "Broken" CrossOver detection

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-flight checks only | Missing binaries or a demo-status error/hang/unparseable result | ✓ |
| Pre-flight + launch timeout | A timeout also counts as broken | |
| Pre-flight + repeated failures | Suggest the fallback after N failures | |

**Notes:** The first version of the timeout questions offered "kill + offer fallback". The user
asked: "so in this case there is an error but crossover is installed, so could be a game
compatibility issue?" Claude confirmed that once pre-flight has passed, a timeout most likely
comes from the game (or a slow first run, a wedged wineserver, or the untested near-expiry
nag), and that the fallback is the weaker engine. The questions were reworded:

| Option | Description | Selected |
|--------|-------------|----------|
| Kill + launch-failure error | No fallback offer; point at log/known-fixes | ✓ |
| Kill + error, with fallback hint | Secondary "try built-in" link | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research decides, CX launch kept | Close the 060 open items; handle the nag, stay on CrossOver | ✓ |
| Treat near-expiry as fallback | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Until game process seen | Timer stops when the game process exists | ✓ |
| Until bridge HELLO | | |
| You decide | | |

---

## Trial notice & override surface

| Option | Description | Selected |
|--------|-------------|----------|
| Game page, at 7 days or fewer | Notice with buy link | ✓ |
| Game page always + Settings summary | | |
| Launch toast at 7 days or fewer | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Game settings → Advanced, Wine Manager installs | Collapsed, Automatic default, unsupported warning + badge | ✓ |
| Same, but CrossOver + pinned builds only | | |
| Hidden behind a global advanced toggle | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Once per version + launch log | One-time notice, never blocks | ✓ |
| Every launch toast | | |
| Launch log only | | |

---

## Claude's Discretion

- The timeout value, the `--demo-status` cap, and in-session caching.
- The DRM-mode and bottled-Steam behaviour when CrossOver is unavailable (clear error, never a
  hang).
- The UI components for the badge, toast and notice.

## Deferred Ideas

None.
