# Phase 6: Library & Game Status UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 06-library-game-status-ux
**Areas discussed:** Playtime on tiles (LIB-05), Install-size source (LIB-06), Playing-session detection (GAME-05), Playing badge behavior (GAME-05)

---

## Playtime on tiles (LIB-05)

Initial questions (tile content / format / runner scope) were rejected by the
user with "this feature already exists." Investigation showed no playtime
renders anywhere in the Library grid — the Phase 02-05 card display was removed
(`325cf7f4 refactor(steam): remove dead card playtime display`) because it never
rendered; only the game-details page (`TimeContainer`) shows Steam playtime.

Presented the discrepancy. User chose **option C: "you are right, is in details,
but don't need to be on grid."**

**User's choice:** Descope grid-tile playtime. Details-page display satisfies the intent.
**Notes:** Overrides LIB-05's original wording ("on library-grid tiles"). Flag at
transition so REQUIREMENTS.md records LIB-05 as met via the details page.

---

## Install-size source (LIB-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Steam store appdetails API | Pre-install size estimate; public, no auth; field often inconsistent/missing | |
| ACF SizeOnDisk (post-install) | Accurate, local, but only known after install | |
| You decide / research it | Let research pick the most reliable trade-off | ✓ |

**User's choice:** Research decides the source.
**Notes:** Also chose **"Best-effort is fine"** for the accuracy bar — any real
number beats `'?? MB'`; keep the fallback only when nothing is obtainable.

---

## Playing-session detection (GAME-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Steam's local running state | Read `RunningAppID` (registry.vdf macOS/Linux, HKCU Windows); cleanest cross-platform | ✓ |
| Poll OS processes | Scan for game exe; needs exe name, noisier/per-platform | |
| You decide / research it | Let research pick | |

**User's choice:** Steam's local running state (`RunningAppID`).
**Notes:** Latency question — chose **"A few seconds is fine"**; poll every few
seconds while the app is open, badge appears/clears within ~5s.

---

## Playing badge behavior (GAME-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing isPlaying UI | Feed Steam session into the same badge path Epic/GOG use | ✓ |
| Steam-specific badge | Distinct 'Playing (Steam)' visual | |

**User's choice:** Reuse existing `isPlaying` UI.
**Notes:** Stop-button question — chose **"Hide Stop for Steam"**; GameLib can't
kill a Steam session, so the badge is observe-only. Other runners unaffected.

---

## Claude's Discretion

- Exact install-size source, fetch, and caching strategy (LIB-06).
- Per-platform `RunningAppID` read implementation and poller placement (GAME-05).
- Backend→frontend plumbing of the detected session state into `isPlaying`.

## Deferred Ideas

- Grid/list-view playtime on cards — considered and declined (LIB-05).
- A working Steam "Stop" via `steam://` — declined; badge is observe-only.
