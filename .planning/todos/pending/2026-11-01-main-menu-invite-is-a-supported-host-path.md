---
created: 2026-11-01
title: "Score the game's main-menu '+' invite as a supported Direction A host path"
area: steam-bridge
files:
  - .planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md
  - native/steam-bridge/helper/bridge_helper.c
severity: medium
platform: macos
ready: live-gate
---

## Trigger

Phase 58 live check, 2026-11-01 (launch 2). Schedule I's main-menu '+' invite works as a host path on the Mac. The closed 58-33 contract treats it as something to refuse, so the next gate would score a working path as a failure.

## What changed

This is a spec change. It supersedes 58-33-LIVE-GATE scope decision 5 and item 2(e), "refuses cleanly", including the operator amendment (which let the picker open at the main menu but still required the menu-press send to be refused). The closed 58-33 contract is deliberately not edited. This todo targets the next gate or phase.

Evidence (launch 2):

- The invite was sent from the main menu at 16:06:47, before Continue.
- The PC accepted and sat at the game's menu.
- Mac Continue at 16:07:37 (`CALL SteamNetworkingSockets013.CreateListenSocketP2P`).
- The PC auto-loaded and connected at 16:07:40 (`AcceptConnection`, `NET role=game kind=join iface=Sockets cb=1221 path=relayed`).

Operator observations: in-game '+' visibility is flaky. That is the game's own logic, and the operator disproved the "Windows must load first" hypothesis. The main-menu '+' always shows.

## What done looks like

The next live gate scores the main-menu invite as a Direction A pass path: invite sent before Continue, PC joins once Continue creates the listen socket. It no longer scores that path as a refusal, and in-game '+' is not required as the only scored gesture.

## Verify

Live gate on the Mac host with the PC peer: send the invite from the main menu, press Continue, and confirm the PC joins with `INVITE sent ok=1` in the log.

## Related

`2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite.md`. Lobby 0 is what makes the first menu press fail.
