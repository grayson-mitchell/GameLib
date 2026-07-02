# Phase 2: Steam Library - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 2-Steam Library
**Areas discussed:** Library sync trigger, Metadata pipeline, Playtime source, Offline behavior

---

## Library Sync Trigger

### Q1: When should GamerLib fetch the user's Steam game list?

| Option | Description | Selected |
|--------|-------------|----------|
| On app startup | Matches GOG/Epic pattern; risks blocking on large libraries | |
| Background after login | Non-blocking; library syncs in background while app is usable | ✓ |
| On-demand only | User presses Refresh; no auto-sync | |

**User's choice:** Background after login

---

### Q2: While background sync is running, what does the library show?

| Option | Description | Selected |
|--------|-------------|----------|
| Cached library + spinner | Show previous sync from electron-store immediately; spinner on Steam header | ✓ |
| Empty state + loading indicator | Nothing until first batch arrives; simpler but feels empty | |
| Installed games first | ACF manifest scan first, then network fill-in | |

**User's choice:** Cached library + spinner

---

### Q3: How often should the library auto-re-sync?

| Option | Description | Selected |
|--------|-------------|----------|
| Once per session | Sync on login, cached for rest of session; manual refresh available | ✓ |
| Periodic background polling | Re-sync every N minutes; more complex | |
| Never auto-re-sync | Restart or manual Refresh only | |

**User's choice:** Once per session

---

## Metadata Pipeline

### Q1: When to fetch game metadata from Steam store API?

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy + cached | Fetch on-demand when a game card is first rendered; cache indefinitely | ✓ |
| Eager on sync | Fetch all metadata during background sync; rate-limit risk for large libraries | |
| Batched background fetch | Queue all AppIDs, fetch in batches; most robust but most complex | |

**User's choice:** Lazy + cached

---

### Q2: What does a Steam game card show before metadata is fetched?

| Option | Description | Selected |
|--------|-------------|----------|
| AppID + skeleton | AppID as placeholder title; grey skeleton for cover art | ✓ |
| Nothing until ready | Don't render card until metadata arrives | |
| Install state only | "Steam Game (AppID)" title; no image placeholder | |

**User's choice:** AppID + skeleton

---

### Q3: How long should cached metadata be considered fresh?

| Option | Description | Selected |
|--------|-------------|----------|
| Forever until manual refresh | Keep indefinitely; only re-fetch on manual refresh | ✓ |
| 7 days | Re-fetch metadata older than 7 days automatically | |
| Per session | Re-fetch every app session; too many API calls for large libraries | |

**User's choice:** Forever until manual refresh

---

## Playtime Source

### Q1: Where should GamerLib get playtime data?

| Option | Description | Selected |
|--------|-------------|----------|
| steam-user rich API call | Use a steam-user method that returns playtime (researcher to identify exact call) | ✓ |
| Steam Web API fallback | `IPlayerService/GetOwnedGames` returns `playtime_forever`; authenticated call | |
| Skip playtime in Phase 2 | Defer LIB-03 to later phase; show '—' in playtime field | |

**User's choice:** steam-user rich API call
**Notes:** Researcher should confirm which steam-user v5.x method returns per-game playtime. `getOwnedApps()` per CLAUDE.md returns AppIDs only, so a richer call is needed.

---

### Q2: How should playtime be displayed?

| Option | Description | Selected |
|--------|-------------|----------|
| Hours only, rounded | "47 hours" — matches Steam's own library display | ✓ |
| Hours + minutes | "47 hrs 23 min" — more precise but noisier | |
| You decide | Claude picks based on existing GameCard pattern | |

**User's choice:** Hours only, rounded

---

## Offline Behavior

### Q1: What does the library show if Steam CM is unreachable?

| Option | Description | Selected |
|--------|-------------|----------|
| Cached library from last sync | Show electron-store result from previous session; stale indicator | ✓ |
| Locally installed games only | ACF manifest scan; subset of library — potentially confusing | |
| Empty state with error | Honest but frustrating | |

**User's choice:** Cached library from last sync

---

### Q2: Should install state reflect ACF manifests even offline?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — read ACF files even offline | Local filesystem read; always accurate regardless of network | ✓ |
| No — use cached install state | Simpler; potentially stale | |

**User's choice:** Yes — always read ACF manifests for install state

---

## Claude's Discretion

- Spinner/badge placement on Steam section header during background sync
- Wording of the "last synced X ago" stale indicator
- electron-store schema for library list cache and per-game metadata cache
- IPC message names for sync progress/complete/error events
- Error handling strategy when background sync fails mid-session

## Deferred Ideas

- Achievement display — v2 backlog (REQUIREMENTS.md)
- Update detection indicator (ACF `StateFlags` polling) — v2 backlog
- Batch metadata prefetch for recently played games — deferred to avoid Phase 2 complexity
- Library folder picker for custom Steam library paths — deferred until auto-detection proves insufficient
