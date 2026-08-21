---
created: 2026-08-16T07:40:00.000Z
title: "resolvePlatformWrite trusts an unbounded future timestamp — a clock-skewed write can permanently outrank every later write"
area: steam
severity: low
found_by: "Quick task 260816-qcn code review (WR-02 + IN-01), deferred deliberately at review time"
source: ".planning/quick/260816-qcn-steam-platform-signal-precedence-rule-an/260816-qcn-REVIEW.md"
files:
  - src/backend/storeManagers/steam/platformPrecedence.ts
resolves_phase: 37
planned_as: 37-06
---

## Problem

`resolvePlatformWrite` (`platformPrecedence.ts:99-142`) implements the freshest-write-wins
precedence rule added by quick task `260816-qcn`. It carefully degrades a `NaN` / non-finite /
wrong-type `existingCapturedAt` to "indefinitely old" so a corrupt stamp can never block a write.

It does NOT bound the timestamp from above. Two gaps:

- **WR-02** — a correctly-typed but wrongly-LARGE `platformsCapturedAt` (clock skew, an NTP
  correction, a manually-edited cache file) makes that entry outrank every subsequent write for
  that appId, permanently. There is no repair path: `MigrationSystem` is dead code under Tauri,
  so nothing will ever normalise the stamp back.
- **IN-01** — the INCOMING `capturedAt` parameter is not validated the way `existingCapturedAt`
  is. Safe today because both call sites pass `Date.now()`, but the function is exported and
  general-purpose, so the asymmetry is a trap for a third writer.

## Why it was deferred

Judged optional hardening rather than a shipping blocker by the same review that raised it. The
failure needs a wrong system clock to trigger, and the blast radius is one app's platform
booleans — the three-valued contract still holds, and the install form's fail-open path still
covers an `undefined` signal.

## Direction

Bound the accepted timestamp range at the read boundary — reject a stamp implausibly far in the
future (and treat it as "indefinitely old", matching how a non-finite stamp is already handled)
rather than trusting it. Apply the SAME validation to both the incoming and the existing
timestamp so the function has no asymmetry for a future writer to trip on; or document the trust
assumption explicitly if the asymmetry is deliberate.

Note the repair-path constraint: whatever is chosen must self-heal at the READ boundary. A
`Migration` is a silent no-op under Tauri and will not run.

## Related

- The precedence rule itself: `.planning/quick/260816-qcn-steam-platform-signal-precedence-rule-an/`
- Freshest-write-wins was chosen deliberately over "appdetails always wins" / "PICS always wins"
  — it makes ordering explicit and auditable, but does NOT reconcile a genuine source
  disagreement. Do not "fix" this todo by ranking the two sources.
