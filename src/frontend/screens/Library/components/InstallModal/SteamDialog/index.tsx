/**
 * Phase 34.13, Plan 10 -- D-01's fifth `InstallModal` sibling, modelled on
 * `ThirdPartyDialog` (146 lines), NOT `DownloadDialog` (803 lines of DLC/
 * SDL/branch/build/language machinery Steam has none of).
 *
 * ALL section visibility comes from 34.13-05's `resolveSteamSectionGating()`
 * verdict, supplied by the parent (34.13-12) as the `gating` prop, and must
 * NEVER be re-derived here -- no local `availablePlatforms.length > 1`, no
 * second `libraryCount > 1`, no `platformToInstall === 'Windows'` section
 * condition. `steamDegrade` below is the ONE region NOT keyed off the
 * verdict, and deliberately so: it is a per-click event record from
 * 34.13-08 (was this open a deliberate "Install with options..." click, or
 * a degrade from a failed quick install?), not a section-relevance fact.
 *
 * Forbidden by decision, enforced by `__tests__/steamDialogSource.test.ts`:
 * - `getInstallInfo` (D-06/D-07) -- the Steam library manager's own stub
 *   can never hang this modal, because this dialog never calls it.
 * - `writeConfig` (D-14) -- a bottle-eligible Steam game's settings lookup
 *   returns the bottle config and ignores per-game config entirely; writing
 *   one here would silently do nothing.
 * - the generic `install()` helper (D-01) -- it lacks Steam's hardcoded
 *   DLC/SDL/language defaults; `installSteamGame` is the only install call
 *   this file may make.
 * - a local Steam-library-targets fetch -- this dialog's dropdown
 *   visibility IS `gating.libraryDropdown`, itself computed FROM the count
 *   such a fetch would produce; a fetch gated on that field could never
 *   populate it. The parent (34.13-12) performs the one read and hands the
 *   result down as `steamLibraries`.
 *
 * The Install button is never gated on SIZE (D-06) -- `getInstallInfo`,
 * `diskSize`, `spaceLeftAfter` and `notEnoughDiskSpace` appear nowhere in
 * this file. As shipped by THIS plan the button carries no `disabled` prop
 * in any state, but that is a fact about this plan's output, not a
 * permanent invariant: D-25 adds exactly one legitimate `disabled` term
 * (`disabled={eligibilityPending}`) and 34.13-11 (wave 7) wires it into
 * this same file, alongside the D-25 loading row. Do not read a future
 * `disabled` attribute here as a regression.
 *
 * This component is created, not mounted, by this plan -- the parent branch
 * that renders it is added by 34.13-12 in Wave 6. Nothing here is reachable
 * at runtime until then.
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWarning } from '@fortawesome/free-solid-svg-icons'
import {
  GameInfo,
  InstallPlatform,
  Runner,
  WineInstallation
} from 'common/types'
import {
  DialogFooter,
  DialogHeader,
  DialogContent
} from 'frontend/components/UI/Dialog'
import { SelectField } from 'frontend/components/UI'
import { MenuItem } from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  installSteamGame,
  useInstallGameModal
} from 'frontend/state/InstallGameModal'
import { AvailablePlatforms } from '..'
import type { SteamSectionGatingVerdict } from '../steamSectionGating'
import {
  SteamDialogLibraryOption,
  defaultSteamLibraryPath,
  resolveSteamInstallPath
} from './installTarget'

interface Props {
  backdropClick: () => void
  appName: string
  /** Accepted for sibling prop-contract parity; unused here -- D-06 forbids
   * any Install gate, so this dialog never branches on `runner`. */
  runner: Runner
  /** Accepted for parity; unused here -- `gating.forceWindowsViaBottle`
   * already carries the resolved D-17 platform decision, so this dialog
   * never reads the live `platformToInstall` state directly. */
  platformToInstall: InstallPlatform
  availablePlatforms: AvailablePlatforms
  /** Accepted for parity; unused here -- D-14 routes the wine choice through
   * the shared bottle config store rather than per-game config, so this
   * dialog never reads `winePrefix`. */
  winePrefix: string
  /** Accepted for parity; unused here -- same D-14 routing as `winePrefix`,
   * and D-05 makes the bottle name itself read-only/provisioning-owned. */
  crossoverBottle: string
  wineVersion: WineInstallation | undefined
  children: React.ReactNode
  gameInfo: GameInfo
  /** 34.13-05's verdict -- the SOLE source of section visibility in this
   * file. Supplied by the parent (34.13-12). */
  gating: SteamSectionGatingVerdict
  /** The parent's single Steam-library-targets IPC read (34.13-12), handed
   * down rather than re-fetched: the parent needs the library count to
   * compute `gating.libraryDropdown` in the first place, so a fetch here
   * gated on that same field could never populate it. NOTE: 34.13-11 (wave
   * 7) adds a THIRD prop, `eligibilityPending: boolean` -- not added here,
   * and this prop set is not closed. */
  steamLibraries: SteamDialogLibraryOption[]
}

interface DiskSpaceInfo {
  message: string
  validPath: boolean
  validFlatpakPath: boolean
}

export default function SteamDialog({
  appName,
  gameInfo,
  availablePlatforms,
  backdropClick,
  wineVersion,
  children,
  gating,
  steamLibraries
}: Props) {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')

  const [selectedPath, setSelectedPath] = useState('')
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null)

  // D-24: `undefined` on a deliberate "Install with options..." click;
  // populated only when `startSteamQuickInstall` degraded into this dialog
  // (missing/full primary library); cleared by `closeInstallGameModal` so it
  // can never bleed onto the next game's open. A selector read, not a
  // whole-store read, so an unrelated store field cannot re-render this
  // dialog.
  const steamDegrade = useInstallGameModal((state) => state.steamDegrade)

  // Effect A -- D-02 default selection. Keyed on `steamLibraries` (the
  // parent's fetch resolves a tick after first render, arriving `[]`
  // first). Deliberately NOT gated on `steamLibraries.length` -- that would
  // be a second library-count derivation, which 34.13-05 records as a
  // review obligation against this plan. Visibility is `gating.libraryDropdown`
  // alone; a momentarily-empty array just renders a `SelectField` with no
  // options and `selectedPath: ''`, which `resolveSteamInstallPath` already
  // maps to the backend's own default destination.
  useEffect(() => {
    if (!steamLibraries.some((lib) => lib.path === selectedPath)) {
      setSelectedPath(defaultSteamLibraryPath(steamLibraries))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamLibraries])

  // Effect B -- D-08 free space, selected-library drive only. Never reads
  // free/diskSize -- only message/validPath/validFlatpakPath.
  useEffect(() => {
    if (!gating.freeSpaceLine || !selectedPath) {
      setDiskSpace(null)
      return
    }
    let cancelled = false
    const getSpace = async () => {
      const { message, validPath, validFlatpakPath } =
        await window.api.checkDiskSpace(selectedPath)
      if (!cancelled) {
        setDiskSpace({ message, validPath, validFlatpakPath })
      }
    }
    getSpace()
    return () => {
      cancelled = true
    }
  }, [gating.freeSpaceLine, selectedPath])

  const handleInstall = useCallback(async () => {
    // D-14 -> D-15 ordering: persist BEFORE install, so the guided bottle
    // setup reads a store that is already written. Skipped when there is no
    // wine section or no chosen engine -- persisting on a library-only
    // install would write a bottle setting for a path that never uses one.
    if (gating.wineSection && wineVersion) {
      const result = await window.api.persistBottleWineVersion(wineVersion)
      if (result.status === 'error') {
        // Name the plan and the failing status only -- never echo the
        // submitted engine object (mirrors 34.13-07's own "name the field,
        // not the value" logging rule). The install proceeds anyway: the
        // guided bottle setup still derives an engine when nothing was
        // persisted (D-15), so a failed persist degrades to today's
        // behaviour rather than blocking the user's install.
        window.api.logError(
          `34.13-10 SteamDialog: persistBottleWineVersion failed with status "${result.status}"`
        )
      }
    }

    const destination = resolveSteamInstallPath(
      selectedPath,
      steamLibraries,
      gating.libraryDropdown
    )

    backdropClick()

    // The verdict's own field, passed through verbatim -- never reconstruct
    // `isMac && !bottleRequired && platformToInstall === 'Windows'` locally.
    installSteamGame(
      appName,
      gameInfo,
      destination,
      gating.forceWindowsViaBottle
    )
  }, [appName, gameInfo, wineVersion, selectedPath, steamLibraries, gating])

  return (
    <>
      <DialogHeader onClose={backdropClick}>
        {gameInfo.overrides?.title || gameInfo.title}
        {availablePlatforms.map((p) => (
          <FontAwesomeIcon
            className="InstallModal__platformIcon"
            icon={p.icon}
            key={p.value}
          />
        ))}
      </DialogHeader>
      <DialogContent>
        {steamDegrade && (
          <div className="infoBox">
            <FontAwesomeIcon
              icon={faWarning}
              style={{ color: 'var(--status-danger)' }}
            />
            {steamDegrade.reason === 'library-missing'
              ? tGamelib(
                  'gamelib:steam.install.libraryMissingNotice',
                  "Your Steam library couldn't be reached — choose another below."
                )
              : tGamelib(
                  'gamelib:steam.install.libraryFullNotice',
                  'Not enough space in your Steam library — choose another below or free up space.'
                )}
          </div>
        )}
        {children}
        {gating.wineSection && (
          <div className="infoBox">
            <FontAwesomeIcon icon={faWarning} />
            {tGamelib(
              'gamelib:steam.install.sharedBottleNotice',
              'The wine version you choose here is used for every Steam game that needs a bottle — not just this one. Changing it later will change how those games run too.'
            )}
          </div>
        )}
        {gating.libraryDropdown && (
          <SelectField
            htmlId="steamLibraryPick"
            label={`${t('install.steam-location.title', 'Choose Steam library')}:`}
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            afterSelect={
              gating.freeSpaceLine &&
              diskSpace &&
              diskSpace.validPath &&
              diskSpace.validFlatpakPath ? (
                <span className="smallInputInfo">
                  {`${t('install.disk-space-left', 'Space Available')}: `}
                  <strong>{diskSpace.message}</strong>
                </span>
              ) : undefined
            }
          >
            {steamLibraries.map((lib) => (
              <MenuItem key={lib.path} value={lib.path}>
                {lib.isPrimary
                  ? `${lib.path} (${t('install.steam-location.primary', 'default')})`
                  : lib.path}
              </MenuItem>
            ))}
          </SelectField>
        )}
        {gating.contentLightNotice && (
          <div className="infoBox">
            <FontAwesomeIcon icon={faWarning} />
            {tGamelib(
              'gamelib:steam.install.contentLightNotice',
              "This installs through Steam's own client, so there's nothing to choose here. Turn on native Steam installs in Settings to manage install location and Windows compatibility from GameLib."
            )}
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <button className="button is-secondary" onClick={handleInstall}>
          {t('button.install')}
        </button>
      </DialogFooter>
    </>
  )
}
