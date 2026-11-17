# Phase 81: Unify the Steam restart hold into restart-on-Play - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-17
**Phase:** 81-unify-the-steam-restart-hold-into-restart-on-play
**Areas discussed:** What the game page shows, Quitting Steam on Play, Watching for adoption,
Windows/Linux arm

---

## What the game page shows

| Option | Description | Selected |
|--------|-------------|----------|
| Installed + quiet note | Installed + Play, with a note: "Steam will restart once when you press Play" | ✓ |
| Plain Installed + Play | No note | |
| Distinct 'Finish setup' state | Badge plus a "Finish in Steam" button | |

| Option | Description | Selected |
|--------|-------------|----------|
| "Restart Steam now" | A secondary action that restarts Steam without the game | ✓ |
| "Check again" | Re-read the evidence | |
| Both | | |
| None beyond Play | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Note + 'Open Steam' action | "Sign in to Steam to finish setup"; Play stays available | ✓ |
| Block Play until signed in | | |
| Same as signed-in case | | |

**User's choice:** the recommendations, all three.
**Notes:** The operator raised the launch-without-Steam todo. It will be a setting, and when the
setting is on, the adoption restart isn't needed. Otherwise the recommendations stand.

---

## Quitting Steam on Play

| Option | Description | Selected |
|--------|-------------|----------|
| No prompt; the page note warns | Matches 261029-ji2 | ✓ |
| Confirm every time | | |
| Confirm the first time only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep today's refuse + notify | | |
| Refuse + offer 'Launch anyway' | | (modified) |

**User's choice:** for a refused restart, offer the launch-anyway path through launch-without-Steam
rather than a plain rungameid launch.
**Notes:** "This is the case where the option to launch anyway comes in." The operator will run the
launch-without-Steam todo after this discuss step.

---

## Watching for adoption

| Option | Description | Selected |
|--------|-------------|----------|
| Background poll via helper | GetAppInstallState / BLoggedOn on a slow cadence, in Rust | ✓ |
| Check on page open / Play only | | |
| content_log tail | | |

| Option | Description | Selected |
|--------|-------------|----------|
| No InstallApp retry; sign-in adopts on its own (083 fallback only) | | ✓ |
| Always retry after sign-in | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Convert hold records to pending-adoption, delete store | | ✓ |
| Just delete the store | | |

---

## Windows/Linux arm

| Option | Description | Selected |
|--------|-------------|----------|
| Spike before planning | | ✓ |
| Spike as Plan 01, branch after | | |
| Plan Mac-only now | | |

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory hold + evidence release + button | | ✓ |
| Today's hold minus re-arm only | | |
| Same UX as Mac anyway | | |

## Claude's Discretion

- the poll cadence;
- UI placement and i18n keys;
- the state-event shapes;
- how "Restart Steam now" relaunches Steam;
- the live-gate shape.

## Deferred Ideas

- Launch without Steam (todo `2026-11-07`), a separate setting. Phase 81 leaves only the hooks
  for it.
