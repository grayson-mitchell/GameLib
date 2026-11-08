# Phase 68: Versioned persisted stores and migrations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 68-versioned-persisted-stores-and-migrations
**Areas discussed:** Discard vs migrate, Downgrade behaviour, Failed migration UX, Which files count

---

## Discard vs migrate

| Option | Description | Selected |
| --- | --- | --- |
| Declare per store | Each store states its kind where it's constructed; a test fails if any store doesn't | ✓ |
| Migrate everything | No discard path; every store gets migrations, even pure caches | |
| Central list | One file lists discardable stores; everything else migrated by default | |

**User's choice:** Declare per store

| Option | Description | Selected |
| --- | --- | --- |
| Migrate library caches | Library caches are must-migrate so the offline Library survives; discard only lookup caches | ✓ |
| Discard, keep until refetch | Discardable, but serve the old copy read-only until a refetch succeeds | |
| Discard immediately | Throw them away; Library empty offline until the next refresh | |

**User's choice:** Migrate library caches

---

## Downgrade behaviour

| Option | Description | Selected |
| --- | --- | --- |
| Read it, don't write | Read what it understands, refuse to save that file, log it | ✓ |
| Read and write freely | Treat it as its own version and keep going | |
| Back up, then use defaults | Copy the newer file aside and start the store from defaults | |

**User's choice:** Read it, don't write

| Option | Description | Selected |
| --- | --- | --- |
| Keep old fields where cheap | Add the new shape, leave the old field; prune later | |
| Clean rewrite | Migrations replace old fields outright | ✓ |
| Per migration | Each migration's author decides | |

**User's choice:** Clean rewrite
**Notes:** Departs from Phase 61's computed-not-written `wineVersion` precedent.

| Option | Description | Selected |
| --- | --- | --- |
| One notice per launch | Single notice through the notice stack plus a log line per store | ✓ |
| Log only | Log line and nothing else | |
| Block the app | Dialog telling the user to update, then quit | |

**User's choice:** One notice per launch

---

## Failed migration UX

| Option | Description | Selected |
| --- | --- | --- |
| Old data, read-only | Read the old version, refuse writes, retry next launch | ✓ |
| Defaults, keep backup | Start from defaults, keep the backup for recovery | |
| Old data, writable | Keep using the old file and allow writes | |

**User's choice:** Old data, read-only

| Option | Description | Selected |
| --- | --- | --- |
| Same notice as downgrade | One notice per launch naming the area, pointing to the log | ✓ |
| Log only | Keep the user out of it | |
| Notice plus Report action | Notice also offers to open the log or backup folder | |

**User's choice:** Same notice as downgrade

| Option | Description | Selected |
| --- | --- | --- |
| Last 3 per store | Three most recent pre-migration copies next to the store, pruned | ✓ |
| Only the last one | One backup per store, overwritten each time | |
| Keep all | Never prune | |

**User's choice:** Last 3 per store
**Notes:** Mid-area the operator paused to ask what Phase 68 is for. The answer: preventive
protection against upgrades resetting or misreading saved data, with no incident on record;
worth doing before Phase 70, whose GameInfo split changes the library caches' shape. The
operator chose to continue.

---

## Which files count

| Option | Description | Selected |
| --- | --- | --- |
| Bring onto the new system | Replace Heroic's per-class versioning in config.ts / game_config.ts; fold in the two fix-ups | ✓ |
| Keep Heroic's mechanism | Leave it; only fix the newer-version case | |
| Out of scope | Stores only | |

**User's choice:** Bring onto the new system

| Option | Description | Selected |
| --- | --- | --- |
| Stores + settings, inventory the rest | Migrate stores and settings; list every other persisted file and localStorage key; todos for user data | ✓ |
| Everything GameLib writes | Bring every GameLib-owned JSON file and localStorage key on now | |
| Stores + settings only | No inventory | |

**User's choice:** Stores + settings, inventory the rest

---

## Claude's Discretion

- Where and when migrations run (inside `FileStore` load vs before `./handlers` import)
- Where the version lives (in-file key vs central registry)
- Whether the existing named-migration runner stays for cross-file moves
- One version and chain for the two stores sharing `steam_store/config.json`

## Deferred Ideas

- Versioning the files found by the inventory (todos, not this phase)
