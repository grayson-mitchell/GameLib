# Phase 11: Library Sync + 5-State Key Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 11-library-sync-5-state-key-model
**Areas discussed:** Where keys appear in Phase 11, Sync triggers & cache aggressiveness, UNPICKED / Choice-month modeling, Fail-soft & staleness UX

---

## Where keys appear in Phase 11

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal keys list page | Bare-bones page (title, state badge, expiration); Phase 13 restyles it into the real views | ✓ |
| Manage Accounts tile status only | "N keys synced · last sync" text on the tile; no browsable inventory until Phase 13 | |
| Dev-only debug view | Extend Phase 10's dev validation trigger to dump the classified inventory | |

**User's choice:** Minimal keys list page (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar entry | "Humble Keys" item in the main sidebar; Phase 13 views become tabs of this page; visible only when connected | ✓ |
| Link from the Humble tile | Reachable only via Manage Accounts → Humble tile → "View keys" | |
| Library page section | Keys render inside the existing Library screen — risky against the not-a-Runner lock | |

**User's choice:** Sidebar entry (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list, state-grouped | Grouped by state, expiring-soonest first within groups; bundle origin as secondary label | ✓ |
| Grouped by bundle/order | Mirrors Humble's order-history mental model; hides urgent expirations inside groups | |
| Plain table, sortable | Simple sortable table, clearly throwaway | |

**User's choice:** Flat list, state-grouped (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Strictly read-only | State display only — no reveal, no copy, no expand; classification proof only | ✓ |
| Read-only + detail expand | Row expands metadata but no actions | |
| Link out to Humble | Read-only plus "Open on Humble" external link | |

**User's choice:** Strictly read-only (recommended)

---

## Sync triggers & cache aggressiveness

| Option | Description | Selected |
|--------|-------------|----------|
| Startup + login + manual | Sync at startup (piggybacking D-08 health check), after login/reconnect, and manual refresh; no background timer | ✓ |
| Add a periodic interval | Plus background re-sync every N hours while the app runs | |
| Manual only after first sync | Full sync on first connect, then only on user refresh | |

**User's choice:** Startup + login + manual (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip terminal orders | Re-fetch every order that still has a non-terminal key; all-terminal orders frozen in cache | ✓ |
| Full re-fetch every sync | All N order details every sync — the C5 lockout pattern on big accounts | |
| TTL-based staleness | Re-fetch only details older than a TTL; weakens criterion 3's "next sync" | |

**User's choice:** Skip terminal orders (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Small pool + abort on denial | 2–3 concurrent; first 403/429 aborts the whole sync into fail-soft | ✓ |
| Strictly sequential | One request at a time with delays; minutes-long first syncs | |
| You decide | Planner picks the bound, keeping abort-on-denial | |

**User's choice:** Small pool + abort on denial (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive fill + progress | Keys appear as order details resolve, with "Syncing… N/M orders" | ✓ |
| Spinner until complete | Loading state until the full sync finishes | |
| Show nothing special | List renders cache whenever visited; fresh connect looks broken | |

**User's choice:** Progressive fill + progress (recommended)

---

## UNPICKED / Choice-month modeling

| Option | Description | Selected |
|--------|-------------|----------|
| One pseudo-entry per month | Single UNPICKED row per unpicked Choice month, deadline as expiration | ✓ |
| Track but don't display | Classified and cached but hidden until Phase 13 | |
| Expand month's game choices | Fetch choice_url catalog and show candidate games — heavy, extra endpoint | |

**User's choice:** One pseudo-entry per month (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| All platforms | Every TPK classifies (Steam, GOG, Epic, Ubisoft, …) with platform labels; dedup/claim stay Steam-first | ✓ |
| Steam keys only | Only steam_app_id TPKs; inventory silently incomplete | |

**User's choice:** All platforms (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude from inventory | DRM-free-only entitlements skipped — strictly keys + unpicked Choice months | ✓ |
| Count but don't list | Cache a per-order count without modeling them | |
| Show as a separate group | Stateless section — scope creep against v1.2 out-of-scope | |

**User's choice:** Exclude from inventory (recommended)

---

## Fail-soft & staleness UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline banner on keys page | Persistent banner "Couldn't refresh — showing data from {time}"; clears on next success; no toast | ✓ |
| Banner + one-time toast | Adds a toast at failure time, mirroring D-09 | |
| Tile status only | Only the Manage Accounts tile warns; keys page looks normal | |

**User's choice:** Inline banner on keys page (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Always show last-synced | Subtle "Last synced X ago" near the refresh button at all times | ✓ |
| Only when stale or failed | Timestamp appears only on failure or past a threshold | |
| Tile only | Freshness lives on the Manage Accounts tile | |

**User's choice:** Always show last-synced (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| No auto-retry; 403 cooldown | Next natural trigger is the retry; 403 cooldown gates even the manual button | ✓ |
| Auto-retry with backoff | Background re-attempts — cuts against the C5 history | |
| Manual always allowed | No cooldowns; user can hammer refresh | |

**User's choice:** No auto-retry; 403 cooldown (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep per-order results | Each order's refresh commits independently; banner reads "couldn't finish refresh" | ✓ |
| Atomic snapshot | Cache replaced only on full success; contradicts progressive fill | |

**User's choice:** Keep per-order results (recommended)

---

## Claude's Discretion

- Cache store shape/location, IPC channel names, inventory TypeScript model
- Tightening `OrderDetailSchema` while keeping per-order schema-failure isolation
- 403-cooldown duration and manual-refresh debounce
- Empty states, banner copy, i18n keys (consumed namespace per WR-08)
- Sidebar icon/label and placement
- UNPICKED deadline availability fallback (render without expiration if API lacks it)

## Deferred Ideas

None — discussion stayed within phase scope. Row actions (reveal, gift-link copy, detail
expand, link-out) were consciously excluded from the Phase 11 surface; they arrive with
Phases 13/14 as designed.
