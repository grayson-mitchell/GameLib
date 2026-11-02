# Phase 60: Steam overlay in bridged games on macOS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 60-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 60-steam-overlay-in-bridged-games-on-macos
**Areas discussed:** On by default or opt-in, Clone + version gate, Failure behaviour, Shim policy + live gate

---

## On by default or opt-in

| Question | Options presented | Selected |
|---|---|---|
| Overlay on by default? | On by default (rec) / Opt-in global / Opt-in per game | On by default |
| How can users turn it off? | Per-game toggle (rec) / Global + per-game / Global only / No toggle | Per-game toggle |
| Can a known-fix entry disable it? | Yes, user toggle wins (rec) / No, user toggle only | Yes |

## Clone + version gate

| Question | Options presented | Selected |
|---|---|---|
| Which clone for TCP mode? | Separate overlay clone (rec) / One shared DRM clone | Separate overlay clone |
| Overlay for DRM-mode titles? | Yes, add wineloader re-sign (rec) / TCP only this phase | Yes |
| Untested CrossOver version? | Tested list, untested = no overlay (rec) / Try on any version / Tested list + override | Try on any version |
| Phase 59 fallback engine? | No overlay on fallback (rec) / Research whether it works | Research whether it works |

## Failure behaviour

| Question | Options presented | Selected |
|---|---|---|
| Pre-launch setup failure? | Launch without overlay + toast (rec) / Log only / Block launch | Launch without overlay + toast |
| Repeat toast? | Once per cause per game (rec) / Every launch | Every launch |
| Early crash with overlay? | Hint to turn off (rec) / Auto-retry without / Nothing special | Hint to turn off |
| Post-launch attach check? | Log only (rec) / Log + toast / Don't check | Log only |

## Shim policy + live gate

| Question | Options presented | Selected |
|---|---|---|
| When to inject shim? | Always, first (rec) / Only D3DMetal D3D12 | Always, first |
| Unknown GPU/macOS? | Research decides (rec) / Always inject / Gate on tested hardware | Research decides |
| Live-gate titles (multi) | Schedule I / Planet Crafter / Manor Lords / Grim Dawn (DRM) | All four |
| Invite dialog vs GameLib picker | Keep picker, record (rec) / Route to real overlay / Out of scope | Keep picker, record |

## Claude's Discretion
- Toggle placement and label; abnormal-exit window; attach-watch timeout; clone code sharing;
  known-fix schema naming; toast component/copy.

## Deferred Ideas
- Real-overlay invite routing; HDR/DXMT/WineD3D-GL/fullscreen coverage; fallback-engine overlay if not cheap.
