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
 * this file. Plan 11 (D-25, wave 7) added exactly ONE legitimate `disabled`
 * term -- `disabled={eligibilityPending}` on the footer Install button --
 * the sole surviving piece of the retired D-12 busy contract, relocated
 * from the origin control to this dialog's own footer. This is a PLANNED
 * narrowing of 34.13-10's original "no disabled attribute in any state"
 * claim, not a regression: see `__tests__/steamDialogSource.test.ts`'s own
 * D-25 block for the inversion recorded in the test file itself.
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
  logSteamInstallDispatchFailure,
  useInstallGameModal
} from 'frontend/state/InstallGameModal'
import { AvailablePlatforms } from '..'
import type { SteamSectionGatingVerdict } from '../steamSectionGating'
import {
  SteamDialogLibraryOption,
  defaultSteamLibraryPath,
  resolveFreeSpaceProbeSubject,
  resolveSteamInstallPath
} from './installTarget'
import { isBottleCapableEngine } from '../WineSelector/engineFilter'

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
   * gated on that same field could never populate it. */
  steamLibraries: SteamDialogLibraryOption[]
  /** 34.13 review WR-04: whether Settings > Steam > "Enable Steam native
   * install" is ON, computed by the parent from the SAME single IPC read
   * that feeds `gating` (never re-derived here). `contentLightNotice` is
   * `!isMac && !libraryDropdown`, which is true BOTH when the setting is
   * off AND when it is on with exactly one library -- 34.13-05's own
   * comment notes the matrix "renders OFF and ON-with-<=1-library
   * identically". The verdict is right; the COPY is not, because one of
   * those two states must not be told to go turn the setting on. This flag
   * picks between the two sentences without adding a verdict field (the
   * resolver's 8-row/96-combination contract is untouched). */
  nativeInstallOn: boolean
  /** Plan 11, D-25: true while `useSteamBottleEligibility`'s IPC round trip
   * is in flight. The ONE surviving piece of the retired D-12 busy
   * contract, relocated from the origin control to THIS dialog's own
   * footer Install button. D-06 still holds alongside it -- this button is
   * never gated on SIZE, and `getInstallInfo` is still never called. */
  eligibilityPending: boolean
  /** 34.15 D-13: while `false`, this dialog's header renders NO platform
   * glyphs at all -- including the Windows one, which `InstallModal/
   * index.tsx`'s `platforms` array marks `available: true` unconditionally
   * and reads no signal to do so.
   *
   * The row is an ASSERTION about the game. With the signal unresolved the
   * app cannot make it, and a bare Windows glyph is the strongest possible
   * form of a claim it cannot back. Dropping the unconditional Windows
   * glyph along with the rest is CORRECT, not collateral -- it too is
   * unbacked.
   *
   * SCOPE: this dialog only. `DownloadDialog` / `ImportDialog` /
   * `ThirdPartyDialog` consume the same `availablePlatforms` array with the
   * same `.map()` shape and have no depot-signal-uncertainty concept, so the
   * array itself must never be filtered upstream. `PlatformSupport.tsx` on
   * the game page stays deferred by 34.14's route fence.
   *
   * Computed by the parent so both this row and the parent's platform
   * selector read ONE resolution moment (`resolveDepotAvailability`'s
   * single call, E1) rather than two. */
  depotSignalResolved: boolean
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
  steamLibraries,
  nativeInstallOn,
  eligibilityPending,
  depotSignalResolved
}: Props) {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')

  const [selectedPath, setSelectedPath] = useState('')
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null)
  // WR-13: submit-in-flight latch, so a double-click cannot fire
  // `installSteamGame` twice across the `persistBottleWineVersion` await.
  //
  // 34.13 review B-CR-01: WR-13's original comment claimed the latch never
  // needs resetting because "`handleInstall` ends by closing the dialog, so
  // the component unmounts". That is true ONLY on the success path. The very
  // first `await` in the handler is an IPC round trip with no rejection
  // handler, and `ipcRenderer.invoke` / the Tauri sidecar transport BOTH
  // reject on a dead channel or a throwing handler. On that path
  // `backdropClick()` never runs, the component does NOT unmount, and the
  // latch turns the Install button permanently dead with nothing surfaced --
  // a wedge rather than a guard. The handler below now releases it on every
  // non-success terminal path.
  const [submitting, setSubmitting] = useState(false)

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
    // 34.13 review B-WR-03: clear BEFORE probing. The guard above only
    // cleared `diskSpace` when the effect was DISABLED, so changing library
    // left the previous library's value in state until the new round trip
    // resolved -- and the `afterSelect` render is gated only on
    // `diskSpace && validPath && validFlatpakPath`, so for the whole
    // duration of the probe the UI showed library A's free space labelled as
    // library B's. On a slow or unmounted volume that is a materially wrong
    // number attached to the drive the user is about to install onto.
    setDiskSpace(null)
    const getSpace = async () => {
      // 34.13 review B-WR-04: probe the SAME directory the quick path and
      // Console Mode probe (`steamappsDir`), not the library root. Probing
      // different directories for the same library let this dialog render a
      // healthy free-space line for a library `startSteamQuickInstall` had
      // just degraded as `library-missing`.
      const { message, validPath, validFlatpakPath } =
        await window.api.checkDiskSpace(
          resolveFreeSpaceProbeSubject(selectedPath, steamLibraries)
        )
      if (!cancelled) {
        setDiskSpace({ message, validPath, validFlatpakPath })
      }
    }
    // WR-03: `.catch` (not a bare `void`) -- a rejected checkDiskSpace is an
    // UNKNOWN free-space verdict, never a blocking one (D-08), so the line
    // simply does not render. Leaving it floating produced an unhandled
    // rejection under the Tauri sidecar.
    getSpace().catch(() => {
      if (!cancelled) {
        setDiskSpace(null)
      }
    })
    return () => {
      cancelled = true
    }
    // `steamLibraries` added by 34.13 review B-WR-04 -- the effect now reads
    // it to resolve the probe subject, so a list that arrives after the
    // first render must re-run the probe against the real `steamappsDir`
    // rather than leaving a verdict computed from the root fallback.
  }, [gating.freeSpaceLine, selectedPath, steamLibraries])

  const handleInstall = useCallback(async () => {
    // WR-13: re-entrancy guard. `handleInstall` awaits
    // `persistBottleWineVersion` before it calls `backdropClick()`, and
    // nothing disabled the button across that await --
    // `disabled={eligibilityPending}` is already false by the time this
    // handler can run at all -- so a double-click fired `installSteamGame`
    // TWICE for the same appId. This is NOT a D-06 size gate: it is a
    // submit-in-flight latch, the one thing D-06's "never gated on SIZE"
    // rule has no opinion about.
    if (submitting) {
      return
    }
    setSubmitting(true)

    // 34.13 review B-WR-04: the persist step gets its OWN try, and the
    // install dispatch below is deliberately OUTSIDE it. The B-CR-01 fix
    // wrapped the whole handler in one `try` whose `catch` only released the
    // latch — so for the THROW class of failure (as opposed to the rejection
    // class the `.catch` already collapses) control jumped past
    // `backdropClick()` and `installSteamGame()` and the user's install was
    // silently dropped. `window.api.persistBottleWineVersion` being missing
    // or hollow is not hypothetical on this preload surface: this repo has
    // ledgered a dead `safeStorage` stub and a hollow `nativeImage` stub
    // under the Tauri sidecar, and either shape makes `persisted.catch` throw
    // a TypeError rather than reject. That inverted the rule stated ten lines
    // below — "a failed persist degrades to today's behaviour rather than
    // blocking the user's install."
    try {
      // D-14 -> D-15 ordering: persist BEFORE install, so the guided bottle
      // setup reads a store that is already written. Skipped when there is no
      // wine section or no chosen engine -- persisting on a library-only
      // install would write a bottle setting for a path that never uses one.
      // 34.13 review B-WR-08: `isBottleCapableEngine` is the RUNTIME half of
      // the D-16 invariant. Before this, the only thing standing between a
      // GPTK/plain-Wine engine and `steamBottleConfigStore` was the presence
      // of the string `hideSharedPrefixToggle` in one JSX element, protected
      // by a comment-stripped SOURCE gate that cannot observe behaviour --
      // and `persistInstallFormWineVersion` validates the `type` only
      // against the 4-literal union, deliberately (the backend must stay
      // permissive for `launcher.ts`'s `checkWineBeforeLaunch` self-heal,
      // which is a legitimate producer of a non-CrossOver persisted value).
      // So the enforcement belongs here, on the one path that is a USER
      // CHOICE. Skipping the persist is the correct degrade: D-15 already
      // makes the guided bottle setup derive an engine when nothing was
      // persisted.
      if (
        gating.wineSection &&
        wineVersion &&
        !isBottleCapableEngine(wineVersion)
      ) {
        window.api.logError(
          '34.13 SteamDialog: refused to persist a non-CrossOver engine for the Steam bottle (D-16; the bottle is created with cxbottle and nothing else)'
        )
      } else if (gating.wineSection && wineVersion) {
        // B-CR-01: a REJECTED persist is the same class of outcome as a
        // resolved `{ status: 'error' }` -- the guided bottle setup still
        // derives an engine when nothing was persisted (D-15), so neither
        // may block the install. `persistBottleWineVersion` is
        // `ipcRenderer.invoke` under Electron and the sidecar transport
        // under Tauri; both REJECT on a dead channel or a throwing handler,
        // and the pre-fix handler observed only the resolved error shape.
        //
        // Kept as two statements deliberately: the "required wiring" source
        // gate pins the literal `window.api.persistBottleWineVersion(`, and
        // a fluent `window.api\n.persistBottleWineVersion(...)` chain is
        // split across lines by prettier, which silently breaks that token.
        const persisted = window.api.persistBottleWineVersion(wineVersion)
        const result = await persisted.catch(() => ({
          status: 'error' as const
        }))
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
    } catch (persistError) {
      // D-15 again, for the THROW class: the guided bottle setup derives an
      // engine when nothing was persisted, so NEITHER a rejection NOR a throw
      // may block the install. Naming the cause (B-IN-01) without echoing the
      // submitted engine object keeps T-34.13-08-05's "name the field, not
      // the value" rule.
      window.api.logError(
        `34.13-10 SteamDialog: persistBottleWineVersion threw (${String(
          persistError
        )}) -- continuing to the install`
      )
    }

    try {
      const destination = resolveSteamInstallPath(
        selectedPath,
        steamLibraries,
        gating.libraryDropdown
      )

      backdropClick()

      // The verdict's own field, passed through verbatim -- never reconstruct
      // `isMac && !bottleRequired && platformToInstall === 'Windows'` locally.
      // 34.13 review B-WR-01: explicit fire-and-forget. The dialog is already
      // closed by `backdropClick()` above, so there is no surface left to show
      // an error on -- but the dispatch rejecting is exactly the "I clicked
      // Install and nothing happened" outcome, so it must reach a log sink
      // rather than floating off as an unhandled rejection.
      installSteamGame(
        appName,
        gameInfo,
        destination,
        gating.forceWindowsViaBottle
      ).catch(logSteamInstallDispatchFailure(appName))
    } catch (dispatchError) {
      // B-CR-01 belt-and-braces, now scoped to the DISPATCH half only: the
      // `.catch` above already collapses the one KNOWN rejecting await, but
      // this is exactly where a future await gets added, and the failure mode
      // is a permanently dead Install button with nothing on screen.
      // Releasing the latch here means the worst case is always "the click
      // did nothing, try again", never "this dialog is bricked".
      // B-IN-01: bind the thrown value -- a bare `catch {` discarded the one
      // thing a support log needs on a surface whose whole failure mode is
      // "the click did nothing". `String(e)` carries no path and no
      // `gameInfo`.
      setSubmitting(false)
      window.api.logError(
        `34.13-10 SteamDialog: handleInstall dispatch threw (${String(
          dispatchError
        )}) for appName "${appName}" -- submit latch released so the button stays usable`
      )
    }
    // `backdropClick` and `submitting` added by WR-13 -- the callback reads
    // both, and omitting `backdropClick` meant a re-created parent handler
    // left this callback closing over a stale one (ESLint
    // react-hooks/exhaustive-deps flagged it).
  }, [
    appName,
    gameInfo,
    wineVersion,
    selectedPath,
    steamLibraries,
    gating,
    backdropClick,
    submitting
  ])

  return (
    <>
      <DialogHeader onClose={backdropClick}>
        {gameInfo.overrides?.title || gameInfo.title}
        {depotSignalResolved &&
          availablePlatforms.map((p) => (
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
            {/* WR-11 established the rule: never promise "choose another
                below" when the dropdown this copy points at does not render.
                34.13 review B-WR-01 — it keyed that rule on the WRONG field.
                `steamDegrade.onlyLibrary` is computed by
                `startSteamQuickInstall` from ITS OWN library-list length
                (`libraryCount <= 1`), whereas the thing that decides whether
                a picker actually renders is `gating.libraryDropdown` =
                `!wineSection && nativeInstallOn && libraryCount > 1`. Those
                are different predicates and `wineSection` breaks the
                implication, so WR-11 closed one of three corners. The two
                reachable states it missed need NO IPC failure:
                  A) macOS, bottle-required title, 3 libraries, primary drive
                     unplugged -> wineSection true, libraryDropdown false,
                     onlyLibrary false -> "choose another below." with
                     nothing below. EVERY bottle-eligible macOS Steam game
                     lands here.
                  B) macOS, mac-native title with a Windows depot, user picks
                     "Windows" -> same shape.
                A third: with the library fetch unsettled or failed,
                libraryCount is 0 and libraryDropdown false on ANY host while
                a degrade record carrying onlyLibrary:false still selects the
                "choose another" copy.
                Both "Only" keys already exist and already say the right
                thing, so this is a SELECTOR change — no new copy, no
                UI-SPEC amendment. */}
            {steamDegrade.reason === 'library-missing'
              ? gating.libraryDropdown
                ? tGamelib(
                    'gamelib:steam.install.libraryMissingNotice',
                    "Your Steam library couldn't be reached — choose another below."
                  )
                : tGamelib(
                    'gamelib:steam.install.libraryMissingOnlyNotice',
                    "Your Steam library couldn't be reached. Reconnect the drive, then try again."
                  )
              : gating.libraryDropdown
                ? tGamelib(
                    'gamelib:steam.install.libraryFullNotice',
                    'Not enough space in your Steam library — choose another below or free up space.'
                  )
                : tGamelib(
                    'gamelib:steam.install.libraryFullOnlyNotice',
                    'Not enough space in your Steam library. Free up space, then try again.'
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
            label={`${tGamelib(
              'gamelib:steam.install.libraryPickerLabel',
              'Choose Steam library'
            )}:`}
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
                  ? `${lib.path} (${tGamelib(
                      'gamelib:steam.install.libraryPrimarySuffix',
                      'default'
                    )})`
                  : lib.path}
              </MenuItem>
            ))}
          </SelectField>
        )}
        {gating.contentLightNotice && (
          <div className="infoBox">
            <FontAwesomeIcon icon={faWarning} />
            {/* WR-04: the "turn it on in Settings" sentence is only true
                when the setting is actually OFF. With native installs ON
                and exactly one Steam library the verdict is identical, but
                telling that user to go enable an already-enabled setting
                is wrong -- and there is no second library to choose
                anyway. */}
            {nativeInstallOn
              ? tGamelib(
                  'gamelib:steam.install.contentLightSingleLibraryNotice',
                  "There's only one Steam library on this system, so there's nothing to choose here — GameLib will install this game into it."
                )
              : tGamelib(
                  'gamelib:steam.install.contentLightNotice',
                  "This installs through Steam's own client, so there's nothing to choose here. Turn on native Steam installs in Settings to manage install location and Windows compatibility from GameLib."
                )}
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        {/* Plan 11, D-25: the ONE legitimate `disabled` term on this
            button -- relocated from the origin control (retired D-12) to
            this dialog's own footer. D-06 still holds: never gated on
            SIZE, `getInstallInfo` is still never called. */}
        <button
          className="button is-secondary"
          onClick={handleInstall}
          disabled={eligibilityPending || submitting}
        >
          {t('button.install')}
        </button>
      </DialogFooter>
    </>
  )
}
