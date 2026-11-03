---
created: 2026-11-02
title: "Game-page Play and Settings buttons are hidden at mid window heights when notices push them below the fold"
area: frontend-ui
files:
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/screens/Game/GamePage/index.tsx
severity: medium
platform: any
ready: live-gate
---

## Trigger

Operator report, 2026-11-02, during the phase 59 re-UAT 2 item 27 run (Fallout 38400, override
forced to CrossOver on an expired trial bottle). The game page showed the 59-28 `cx-expired`
override warning, and both the main (Play) button and the Settings button had disappeared, so the
operator could not reach Settings to set the override back to Automatic. That is the exact action
the warning tells them to take.

Operator's observation of the resize behaviour:

- At the **smallest** vertical window size, the buttons show. They take precedence over the other
  content.
- At a slightly **larger** height that still cannot fit all the content, the buttons are hidden.
- At a height that fits everything, they show again.

## What is known

- `MainButton` and `SettingsButton` are not conditional on engine state. They always render in
  `.buttons`, below `SteamEngineNotices`, `ReleaseDate`, `Description`, `TimeContainer`,
  `GameStatus` and `LaunchOptionSelector` in `.mainInfo` (`GamePage/index.tsx` around L568-590).
- The left panel scrolls: `.mainInfoWrapper` has `overflow-y: auto` (`index.css` around L96-105).
  `.mainInfo` has `overflow: hidden` (around L121-128). A narrow-height media query evidently
  changes the layout so the buttons win at the smallest size. This has not been traced.
- Any long notice can trigger it. The 59-28 override warning is the longest; the earlier
  `cx-missing` and Get-CrossOver panels add to the height too.

## Done when

At every window height from the minimum up to "everything fits", the Play and Settings buttons
stay visible without the user having to discover a scroll. One option is to pin `.buttons`
(sticky, or outside the scrolling region); another is to let the notices or the description
scroll instead. Verify live by resizing the window on a title whose page carries the override
warning.
