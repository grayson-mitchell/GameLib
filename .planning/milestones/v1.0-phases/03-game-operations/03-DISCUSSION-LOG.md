# Phase 3: Game Operations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 3-Game Operations
**Areas discussed:** State reconciliation, Hand-off feedback, Button surface, Uninstall confirmation

---

## State Reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Re-read ACF on focus | Re-read ACF manifests when GamerLib's window regains focus; update badges. No polling. | ✓ |
| Poll while op pending | Poll the game's ACF every few seconds until state changes or timeout. | |
| Manual refresh only | State only updates on existing Refresh button. | |

**User's choice:** Re-read ACF on focus
**Notes:** Builds on Phase 2 D-10 (install state always read live from ACF on disk).

---

## Hand-off Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Toast notification | Brief "Opening in Steam…" toast, then nothing more. | ✓ |
| Transient card state | Temporary "Installing…/Launching…" label on the card until reconciliation. | |
| Nothing | Silently fire the URL; Steam window is the only feedback. | |

**User's choice:** Toast notification
**Notes:** GamerLib has no progress data — toast confirms the hand-off without implying tracking.

---

## Button Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Hide them | Show only Play/Install/Uninstall; hide Settings/Move/Repair/Verify. | ✓ |
| Disable + tooltip | Keep visible but greyed with "Managed by Steam" tooltip. | |
| Open Steam settings | Repurpose to deep-link into Steam. | |

**User's choice:** Hide them
**Notes:** Cleanest surface; no dead controls.

---

## Uninstall Confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Delegate to Steam | Fire steam://uninstall; Steam shows its own confirm. | ✓ |
| GamerLib confirm first | GamerLib's own dialog before firing the URL. | |

**User's choice:** Delegate to Steam
**Notes:** Single source of truth, avoids double-dialog.

---

## Claude's Discretion

- Exact toast wording and notification mechanism.
- Backend `BrowserWindow 'focus'` hook implementation and re-read scoping.
- Whether focus re-read scans whole library or only recently-operated games.
- Steam-not-running edge handling (OS launches Steam; not-installed handled in Phase 1).
- IPC message names for operation/state events.

## Deferred Ideas

- In-app download progress for Steam installs (not possible via steam://).
- Per-game launch options / Proton version picker in GamerLib (Steam owns this).
- Repair / Verify integrity from GamerLib (Steam-managed).
- Active operation tracking / persistent "Installing…" card state (rejected for now in favor of toast; revisit only if badges feel stale).

## Locked Without Discussion

- **Proton (GAME-04):** Fully delegated to Steam via `steam://rungameid`. GamerLib adds no Proton/Wine UI and must not route Steam games through Heroic's compatibility layer. Satisfied by absence of Heroic Wine routing, not by adding Proton logic. (Mandated by GAME-04 success criterion.)
