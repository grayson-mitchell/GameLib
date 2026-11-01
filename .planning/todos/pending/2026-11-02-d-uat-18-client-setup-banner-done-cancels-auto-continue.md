---
created: 2026-11-02
title: "D-UAT-18: Steam client-setup banner's \"Done\" silently cancels the auto-continue; banner styling inconsistent with the consent dialog"
source: Phase 21 UAT 4c, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
  - public/locales/en/gamepage.json
severity: minor
platform: any
ready: human
---

The non-modal bottom-right `steamClientSetupToast` has one button, "Done", which calls `close()` and
(by the 34.13 C-17 fix) stops the readiness poll and abandons the install. The operator clicked it as
an acknowledgement and the first 4c attempt never continued. Operator also: "inconsistant ui,
shouldn't it be a standard window like the previous one."

Needs a design call (hence `ready: human`): at minimum relabel to "Cancel"/"Cancel install" and say
GameLib is waiting; possibly keep it non-modal but styled as the same family as the consent dialog.
Keep C-17's guarantee that a dismissed prompt never starts a download later.

## Also seen 2026-11-02 (4a re-run): banner copy goes stale

After the installer finished, the banner still read "Installing the Steam client" while GameLib was
actually waiting on D-11 (Steam installed, never launched; `gamelib.log` polled "installed but never
launched" every 3s from 03:08:58). Nothing told the operator to start Steam. The banner should switch
to the launch-once wording when the recheck moves from needs-install to needs-launch.
