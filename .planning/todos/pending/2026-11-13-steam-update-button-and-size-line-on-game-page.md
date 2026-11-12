---
created: 2026-11-13T00:00:00.000Z
title: 'Give the Steam game page a visible Update button and surface the update size line'
area: steam
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 1 (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src/frontend/components/UI/Hero/GameStatus.tsx:227
  - src/frontend/screens/Game/GamePage/index.tsx:677
---

## Problem

UAT 1: when a Steam game has an update there is no visible Update button, only a
"(Click to Update)" affordance on the status text, and the update size line sits in the Info tab
where it is easy to miss.

## Fix direction

Add an explicit Update button on the game page next to the other primary actions, and show the
size line beside it. Use `Skill("sketch-findings-gamelib")` for the visual direction (tab and
card patterns, theme survival rules).

## Done when

A Steam game with a pending update shows an Update button and its size on the main game page
without opening the Info tab, in every supported theme.
