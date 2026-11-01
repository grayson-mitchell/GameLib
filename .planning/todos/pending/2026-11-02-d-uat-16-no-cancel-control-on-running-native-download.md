---
created: 2026-11-02
title: "D-UAT-16: operator found no cancel control on a running native Steam download (unreproduced)"
source: Phase 21 UAT, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
severity: minor
platform: windows
ready: live-gate
---

During the first (mis-configured) 4a attempt a native install against the real Steam ran to
completion; operator: "had to let finish, no cancel option." Game, size and which surface (detail
page or Downloads) were not recorded. Reproduce on Windows first: start a native download, look for
cancel on the game page, the library card and Downloads; record which is missing.
