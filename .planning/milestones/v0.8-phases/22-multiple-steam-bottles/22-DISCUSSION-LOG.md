# Phase 22: Steam Game Families (multiple bottle configurations) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 22-multiple-steam-bottles
**Areas discussed:** Family identity & naming, State/store shape + routing, Migration + default resolution, UI surfaces + IPC

---

## Family identity & naming

### Identity model
| Option | Description | Selected |
|--------|-------------|----------|
| Decoupled id + display name | `SteamFamily = { bottleName (stable dir id, immutable), displayName (editable) }`; rename only touches displayName, no dir move | ✓ |
| Name == directory (rename moves dir) | family name IS the bottle dir name; rename = cxbottle move/recreate; migration renames GameLibSteam→Default on disk | |

**User's choice:** Decoupled id + display name.

### Naming rules
| Option | Description | Selected |
|--------|-------------|----------|
| Display name is the user-facing rule; dir id derived from it | sanitize+unique on displayName; bottleName = slug(displayName)+collision-suffix, frozen; auto 'Family N' | ✓ |
| Both sanitized independently; dir id opaque generated | displayName sanitized+unique; bottleName opaque token (GameLibSteam-<n>) | |

**User's choice:** Display name is the user-facing rule; dir id derived from it.

### Default family status
| Option | Description | Selected |
|--------|-------------|----------|
| Ordinary family, just pre-selected | 'Default' is a label on the migrated bottle; renameable/deletable (last-family guard); soft/remembered picker default | ✓ |
| Protected default sentinel | isDefault flag; always pre-selected; can't be deleted even if not last | |

**User's choice:** Ordinary family, just pre-selected.

---

## State/store shape + routing

### Store shape
| Option | Description | Selected |
|--------|-------------|----------|
| Reshape steamBottleConfigStore into keyed collection + assignments | one store: families record + assignments map; old flat keys migrate into families['GameLibSteam'] | ✓ |
| Separate stores: families store + assignments store | keep config store for families; new store for appId→family | |

**User's choice:** Reshape steamBottleConfigStore (one store).

### Routing resolution
| Option | Description | Selected |
|--------|-------------|----------|
| Central resolver up-front; thread bottleName explicitly | resolveFamilyForApp(appId) returns discriminated result; games.ts branches on Req 7; tell*(appId, bottleName); bottle.ts stays pure | ✓ |
| Encapsulated: tell*(appId) resolves internally | keep signatures; each function looks up assignment internally | |

**User's choice:** Central resolver, threaded bottleName (Option A). Initially skipped to clarify what the question meant; after a plain-language re-explanation the user asked for a recommendation, Claude recommended Option A (uses the existing bottleName seam, Req 7 falls out for free, better testability), and the user locked it.
**Notes:** During resolution the `needs-repick` status was later dropped (see delete decision) — resolver only needs `ok | needs-provision`.

---

## Migration + default resolution

### Migration trigger
| Option | Description | Selected |
|--------|-------------|----------|
| Eager one-time migration at startup | versioned; build Default family from flat keys once; clear old keys; stamp schemaVersion | ✓ |
| Lazy migrate-on-read | getFamilies() synthesizes on first read + write-back | |

**User's choice:** Eager one-time migration at startup.

### Fallback + backfill
| Option | Description | Selected |
|--------|-------------|----------|
| Backfill legacy installs; then unassigned → migrated bottle | scan ACF at migration, write explicit assignments for installed games; fallback for the rest | ✓ |
| No backfill; unassigned → migrated bottle fallback only | leave assignments empty; legacy installs stay implicit | |

**User's choice:** Backfill legacy installs; then unassigned → migrated bottle.

### Delete semantics
| Option | Description | Selected |
|--------|-------------|----------|
| Clear assignment + mark uninstalled → re-pick via normal install picker | delete removes dir, clears assignment, marks uninstalled; Install click shows Req 3 picker = re-pick; no dangling state | ✓ |
| Keep dangling assignment → explicit re-pick prompt | leave assignment pointing at missing family; resolver returns needs-repick; distinct prompt | |

**User's choice:** Clear assignment + mark uninstalled → re-pick via normal install picker.
**Notes:** This choice subsumes the resolver `needs-repick` status.

---

## UI surfaces + IPC

### Install picker
| Option | Description | Selected |
|--------|-------------|----------|
| Clone SteamInstallLocationPicker; 'New family' → inline create + guided setup | sibling of existing picker (zustand + GamePage modal); New family creates inline then guided provision+login then install | ✓ |
| New standalone modal; 'New family' → jump to Settings | bespoke modal; New family sends user to Settings to create/provision | |

**User's choice:** Clone the SteamInstallLocationPicker pattern; inline create + guided setup.

### Management UI placement
| Option | Description | Selected |
|--------|-------------|----------|
| New 'Steam Families' section in Settings | alongside CrossoverBottle/EnableSteamNativeInstall; per-row rename/Wine/delete; reuse SteamBottleSetup guided flow | ✓ |
| Dedicated top-level Families screen | new standalone route; richer surface but new nav + scaffolding | |

**User's choice:** New 'Steam Families' section in Settings.

### IPC surface
| Option | Description | Selected |
|--------|-------------|----------|
| New family IPC set; generalize steamBottleStatus into it | listFamilies/create/rename/delete/setFamilyWine/assign/familyStatusForApp; fold steamBottleStatus in; one source | ✓ |
| Keep steamBottleStatus; add family handlers alongside | leave status handler; bolt on family handlers; two overlapping sources | |

**User's choice:** New family IPC set; fold steamBottleStatus in.
**Notes:** User explicitly wanted to avoid the drift/dead-signal problem Phase 17 hit with the removed `loggedIn` field.

---

## Claude's Discretion

- Wave/plan breakdown (SPEC suggests 4 plans).
- `slug()` char-mapping/casing details (must be sanitizeBottleName-clean + collision-checked).
- Delete confirm-dialog copy and how affected games are enumerated.
- How `needs-provision` surfaces per entry point (Install vs Play button state), consistent with the `settingUpBottle` gate.
- Whether `lastUsedFamily` is persisted or derived, and where the picker reads it.

## Deferred Ideas

- Moving an installed game between families in-app (out of scope; reinstall to move).
- Concurrent play across families on one Steam account (not solvable; needs distinct accounts).
- Sharing a single Steam login / downloaded files across families (out of scope; prefix isolation + D-04).
- The native-Steam bridge / Proton-style architecture (seeded; gated on a hard dependency; may supersede this phase if it ships).
