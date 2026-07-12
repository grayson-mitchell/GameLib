---
title: Use CrossOver's own per-game bottle templates from the .tie dump
trigger_condition: When Steam bottle configuration is revisited — i.e. steamBottleDefaults.ts needs per-game tuning, or a Phase 17/18 bottle fails on a game CodeWeavers already has a profile for
planted_date: 2026-07-12
related_phase: 17 (Steam on macOS via CrossOver/Wine), 19 (CrossOver Compatibility Index)
---

# Seed: CrossOver bottle templates from the `.tie` dump

## The idea

The daily CrossOver dump (`crossover.tie.gz` — see
`.planning/notes/crossover-tie-dump-findings.md`) contains far more than compatibility
medals. Every `<app>` record can carry:

- `<bottletemplate>` — which Windows version / bottle template CodeWeavers uses for this game
- `<flag>` — per-app behavioural flags
- `<installprofile>` / `<preinstallregistry>` — registry keys and pre-install setup
- `<predependency>` — required runtimes (e.g. redistributables)
- `<appbottlegroup>` — how apps are grouped into shared bottles
- `<cxdiagcheck>` — diagnostic checks CodeWeavers runs for this app

These are **CodeWeavers' own hard-won per-game tweaks** — the accumulated knowledge that
makes CrossOver work on a title. GameLib is currently hand-rolling the equivalent in
`src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts`.

## Why it's parked, not done

Phase 17 locked a deliberate architecture: run the **Windows Steam client** inside one
GameLib-managed bottle, and install games *through* it. CodeWeavers' profiles are mostly
written for **installing an individual game directly** into its own bottle — a different
model. Their `bottletemplate` for a game may not be meaningful when the game is installed
via bottled Steam rather than via its own installer.

So this needs a feasibility question answered before it's worth planning:

> For the games GameLib actually bottles, does CodeWeavers' `<bottletemplate>` /
> `<flag>` data apply to a *bottled-Steam* install, or only to their
> install-the-game-directly model?

Phase 17's Wave 9 (`17-15-PLAN.md`) already discovered the hard way that the bottle must
be `win10_64`, not `win10` (32-bit), for Steam's CEF UI to composite. That is exactly the
class of knowledge the `<bottletemplate>` field encodes — which is the argument *for*
mining it, once the model question is settled.

## Cheap first step when triggered

The index builder from Phase 19 already parses every `<app>`. Extending it to also emit
`bottletemplate` / `flag` / `predependency` for the ~2.9k game apps is nearly free —
the question is what to *do* with them, not how to get them.
