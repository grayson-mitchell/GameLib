---
title: Steam native install — GameLib downloads depots, Steam adopts the install
trigger_condition: When the spike validates BOTH (a) Steam cleanly adopts a hand-written appmanifest .acf, and (b) a depot download path (steam-user in-process, or a C# DepotDownloader wrapper) produces correct files on disk. Unknown (b) alone is not enough — (a) is architecture-independent and gates the entire model.
planted_date: 2026-07-14
related_phase: 21 (v1.6 — Steam Native Install; promoted to roadmap 2026-07-14)
---

# Seed: Steam native install

> **PROMOTED 2026-07-14 → Phase 21 (v1.6 — Steam Native Install).** Both spike unknowns
> validated (spikes 001 + 002). Kept for provenance; the live plan is the roadmap entry.

## The idea

Stop handing Steam installs off to `steam://rungameid` — a black box that returns no
progress and no errors — and have GameLib download depot content itself, exactly as it
already does for Epic (legendary), GOG (gogdl), and Amazon (nile).

GameLib writes the files into a real `steamapps/` library folder plus an
`appmanifest_{appId}.acf`, so the Steam client **adopts** the install. Launch still goes
through `steam://` (DRM keeps working), and Steam owns all future updates with its own
delta-patching.

**GameLib owns the first install. Steam owns everything after.**

## Why it's worth doing

- Steam is the only store in GameLib with **no install progress UI** — a glaring gap next
  to the other three.
- Failed or interrupted Steam installs are currently **invisible** to GameLib. It cannot
  observe them, report them, or recover from them.
- The user-facing value is concrete: a progress bar, a real error message, and a retry —
  on the operation Steam is worst at surfacing.

## Why it's a seed and not a phase yet

The whole model rests on reverse-engineered behavior with **zero Valve documentation**:
whether Steam will adopt a `.acf` we wrote ourselves. If it won't, the model collapses to
the DRM problem (files on disk that DRM-wrapped games refuse to launch), and there is no
obvious fallback.

That is a cheap thing to test and an expensive thing to assume. Spike first.

## Open architecture fork (deliberately unresolved)

- **Option A** — in-process depot download via `steam-user`'s existing authenticated CM
  connection. No .NET, no second auth stack, native progress events.
- **Option B** — a thin C# wrapper around SteamRE/DepotDownloader, injecting GameLib's
  refresh token via `LogOnDetails.AccessToken` (the stock CLI cannot accept one).

Full analysis, costs, and citations:
`.planning/notes/steam-depot-install-architecture.md`

## Notes for whoever picks this up

- The `StateFlags = 1026` trick (not `4`) makes Steam verify-and-repair our download
  instead of trusting it. Use it — it turns Steam into a safety net.
- Scope creep to watch for: "GameLib owns updates too." That re-opens the entire
  build-vs-bundle decision, because delta-patching is the hard part we deliberately
  scoped out.
