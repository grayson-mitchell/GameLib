# Phase 26: Steam Key Redemption - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 26-steam-key-redemption
**Areas discussed:** Entry-point placement, Redeem surface shape, Outcome presentation, Format-validation strictness

---

## Entry-point placement

| Option | Description | Selected |
|--------|-------------|----------|
| Login screen, by Steam tile (Rec) | On the manage-accounts/Login screen next to the connected Steam account; naturally gated. | |
| Library header action | Button in the shared library top bar; needs conditional show/hide. | |
| Both | Account-screen action + library header shortcut. | |

**User's choice:** Free-text — "just put in the left menu pane under settings (can always move later)."
**Notes:** Left-sidebar nav item under the Settings link. Low commitment ("can always move later"). SPEC REQ1 still governs — item is gated on Steam login; clicking it opens the redeem modal rather than navigating to a route.

---

## Redeem surface shape

| Option | Description | Selected |
|--------|-------------|----------|
| Simple modal, store hidden (Rec) | One key input + Redeem button; store is a hidden param defaulting to Steam. | ✓ |
| Simple modal + 'Steam' dropdown | Same modal with a visible one-option store selector. | |
| Guided wizard (Humble-style) | Multi-step panel like Phase 14's claim flow. | |

**User's choice:** Simple modal, store hidden.
**Notes:** Reuse the generic Dialog component. Store-aware-ready satisfied in the data model only; no visible selector until a second store is wired.

---

## Outcome presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in the modal (Rec) | Status updates in place; modal stays open; success shows game name + "View in library". | ✓ |
| Toast only | Modal closes, toast reports; less error context. | |
| Both (inline + toast) | Inline for errors, success toast. | |

**User's choice:** Inline in the modal.
**Notes:** Four outcomes each get a distinct message (SPEC REQ5). Errors stay put for correct-and-retry; success names the game and offers a jump to the library.

---

## Format-validation strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Light structural (Rec) | Reject empty/wrong length/charset; normalize case + dashes; don't enforce exact 5-5-5. | ✓ |
| Strict 5-5-5 regex | Require exact XXXXX-XXXXX-XXXXX before send. | |
| Permissive (trim + non-empty) | Only reject empty; let Steam judge the rest. | |

**User's choice:** Light structural.
**Notes:** Matches SPEC REQ3 — catch typos without over-rejecting valid non-standard keys.

---

## Prior clarification (during /gsd-spec-phase, carried into this discussion)

The user asked whether a key's format could route it to the right store (Steam vs GOG). Resolved:
format detection is unreliable (5-5-5 collides across Steam/Origin/Uplay/Rockstar/Bethesda; GOG
has no canonical pattern) and GameLib has no GOG redemption backend. Decision: keep Phase 26
Steam-only, build the UI store-aware-ready, and park GOG as research Q7 + a seed.

## Claude's Discretion

- IPC method name/shape on `src/preload/api/steam.ts` and backend handler wiring.
- Exact normalization rule within the "light structural" bound.
- Modal copy for the four outcome messages.
- Whether the redeem wrapper is a new `SteamUser` static method or a sibling function in `user.ts`.

## Deferred Ideas

- Any-store loose-key redemption (roadmap increment 2).
- GOG key redemption + unified redeem surface (seed; gated on Q7).
- Auto-redeem revealed Humble keys into Steam (seed; gated on this phase shipping).
- Client-side rate-throttle against Steam's activation cooldown (pending Q6).
- Visible store selector (only when a second store is wired).
