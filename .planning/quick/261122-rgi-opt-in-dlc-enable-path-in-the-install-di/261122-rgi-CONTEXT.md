# Quick 261122-rgi: CONTEXT (locked decisions)

Source todo: `.planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md`
Prior work: quick 261120-st3 (selectAllDepots skips opt-in DLC unless `enabledOptInDlc` names it) and
quick 261120-tbr (installed opt-in DLC depots map through `config.optionaldlc` into `enabledOptInDlc`).

Decided by the operator on 2026-11-22. They are locked; do not revisit them.

## D-01 Enable path: install dialog + Install tab

- **Install dialog (Steam, `SteamDialog`)**: an "Optional content" group with a tick per *owned*
  opt-in DLC (one whose depots carry `config.optionaldlc`), showing the name and size. Unticked by
  default. Ticked DLC ids go into the install as `enabledOptInDlc`.
- **Game page, Install tab**: an "Optional content" switch row per owned opt-in DLC (follow the
  existing `SwitchRow` pattern and sketch-findings: an action sits next to the fact it changes).
  Switching on downloads that DLC's depots into the existing install (add-to-existing-install).
  Switching off removes them (D-02). The note says "turning on downloads it / turning off removes
  its files".

## D-02 Turn off: remove depot files now

Switching an installed opt-in DLC off deletes its depot files immediately and drops those depots
from the ACF, as Steam does. `decideRetirement` (`depotRust/retire.ts`) currently keeps
still-on-branch depots; give it an explicit "disabled" input so a deliberately disabled opt-in DLC's
depots are retired rather than kept as `still-on-branch`.

## D-03 Persistence: installed depots are the record

No new store and no per-game setting. "Enabled" means its depots are installed, which
`optInDlcOfInstalledDepots` (261120-tbr) already reads. A fresh-install tick passes straight through
to that install as `enabledOptInDlc`. Do NOT write the unconfirmed ACF
`UserConfig`/`MountedConfig` `optionaldlc` key.

## Out of scope

- Non-Steam stores.
- Non-opt-in DLC (it is already installed by default).

## Post-plan confirmations (operator, 2026-11-22)

- **D-04 Steam-owned copies are read-only.** Phase 74's rule stands. The Install-tab switch adds or
  removes only on bridge installs. On Steam-registered and bottled-Steam copies the row shows state
  and points to Steam → Properties → DLC. The install-dialog tick works on every host.
- **D-05 Unknown ownership is shown.** Hide only `owned === false`. The depot ownership gate stops an
  unowned DLC from downloading, and the Install-tab row reports that failure inline.
- **D-06 One plan, all 3 tasks.** A toggle on a stale game also updates it to the current build
  (delta), as Steam does.
