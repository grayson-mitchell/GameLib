---
created: 2026-08-16T11:30:00.000Z
title: "Absent `is_mac_native` is treated as \"no Mac build\" — the exact mirror of the conflation Phase 34.14 fixed for Windows"
area: steam
severity: medium
found_by: "Phase 34.14 D-08 UAT, Run 2 observation 2.0 (operator, 2026-08-16)"
resolved: 2026-08-16
resolved_by: "Phase 34.15 -- steam-platform-signal-and-sync-integrity (VERIFICATION.md status: passed, 16/16; D-16 human UAT gate PASSED 4/2/0 on both runtimes)"
files:
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts
---

## Problem

Phase 34.14 established the principle that an **absent** depot signal must not be read as a
**negative** one: `is_windows_native === undefined` means "not fetched yet", not "this game has no
Windows build". That fix landed for Windows only. The Mac side still makes exactly the mistake
34.14 was created to eliminate.

Observed live during 34.14's own UAT (Run 2, Electron, `appdetails` blocked, cold cache):

- The dialog's game-title row showed the **Windows symbol only**. The same game with a warm cache
  (Run 1) showed **Apple + Windows**.
- The platform selector **defaulted to Windows** instead of macOS (macOS stayed manually
  selectable).

Target game was Terraria (`105600`), which genuinely ships both Windows and macOS builds — so
"Windows-only" is a false assertion, not a true one.

## Cause

The UAT's forcing step deletes the whole cache entry, which destroys `is_mac_native` alongside
`is_windows_native`. Two call sites then read the absent flag as a definitive negative:

```ts
// index.tsx:240-246
const getDefaultplatform = (): InstallPlatform => {
  if (isMac && gameInfo?.is_mac_native) return 'Mac'
  return 'Windows'
}

// index.tsx:165
const isMacNative = Boolean(gameInfo?.is_mac_native)
```

`Boolean(undefined)` and the falsy `&&` branch both collapse "unknown" into "false" — the same
`treatsAbsentAsAvailable`-class conflation, in mirror image.

## Why it matters

The icon row is an **assertion about the game**, and under an uncaptured signal it asserts
something the app cannot know. D-07 forbids the dialog claiming a game is macOS-only precisely
because that reads as false nearly every time; "Windows-only" is the same category of unsupported
claim, and it is currently rendered as a bare icon with no hedge.

The default-platform flip is milder and arguably defensible (Windows-via-bottle always works, so
it is the safer fallback when nothing is known), but on a Mac host it silently steers the user
away from a native Mac build that does exist. It should be a deliberate decision, not a fallthrough.

## How to fix

Mirror 34.14's own solution rather than inventing a new one:

- Extend the pure resolver in `steamPlatformRow.ts` to return a mac-side availability triple the
  way `resolveDepotAvailability` already does for Windows (`depotSignalResolved` +
  `windowsDepotOffered`), so "unknown" is representable instead of collapsing to false.
- Suppress the platform-icon row entirely while `depotSignalResolved` is false, rather than
  rendering a confident subset. No icons is honest; a Windows-only icon is not.
- Decide `getDefaultplatform`'s uncaptured-case behaviour explicitly and comment the rationale.

**Do NOT** fix this by loosening the comparison to `is_mac_native !== false`. That is the
`treatsAbsentAsAvailable` saboteur shape that three shipped gates in `steamPlatformRow.test.ts`
exist to reject, and the same trap applies on the mac side.

## Scope note

Not a 34.14 regression — `getDefaultplatform` and the icon row predate the phase and were not
touched by it. It is a directly adjacent gap that 34.14's own gate surfaced, and it is the natural
follow-on phase.
