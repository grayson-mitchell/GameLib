import { hasCapability, isStore } from 'common/storeCapabilities'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import './index.scss'

import { install, writeConfig } from 'frontend/helpers'
import { hasProgress } from 'frontend/hooks/hasProgress'
import ContextProvider from 'frontend/state/ContextProvider'

import type { GameInfo, InstallPlatform, WineInstallation } from 'common/types'

import { getActionButtonIndex, getBackButtonIndex } from '../controller'
import { useGamepadButtonPress, useGamepadInfo } from '../hooks'
import {
  handOffSteamClientSetupToDesktop,
  probeSteamQuickInstallTarget,
  releaseUnclaimedSteamClientSetup,
  resolveConsoleActionIntent,
  steamBlockedMessage,
  type ConsoleClientSetupHandOff,
  type ConsoleFocusKey as FocusKey
} from './consoleSteamTarget'
import {
  installSteamGame,
  logSteamInstallDispatchFailure,
  type SteamQuickInstallDegrade
} from 'frontend/state/InstallGameModal'

type PlatformOption = {
  value: InstallPlatform
  label: string
}

// `FocusKey` is imported from ./consoleSteamTarget as ConsoleFocusKey (34.13
// review WR-01): `resolveConsoleActionIntent` takes that exact union, so a
// second identical local declaration here was a silent drift hazard -- the
// two could diverge and only the argument position would notice.

export default function InstallOverlay({
  game,
  onDismiss,
  onExitConsole
}: {
  game: GameInfo
  onDismiss: () => void
  onExitConsole: () => void
}) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const { platform } = useContext(ContextProvider)
  const [progress] = hasProgress(game.app_name, game.runner)

  const isWin = platform === 'win32'
  const isMac = platform === 'darwin'
  const isLinux = platform === 'linux'
  const isSideload = isStore(game, 'sideload')

  const availablePlatforms = useMemo<PlatformOption[]>(() => {
    const options: PlatformOption[] = []
    if (isLinux && (isSideload || game.is_linux_native)) {
      options.push({ value: 'linux', label: 'Linux' })
    }
    if (isMac && (isSideload || game.is_mac_native)) {
      options.push({ value: 'Mac', label: 'macOS' })
    }
    // Windows is always installable (via Wine/Proton when not on Windows).
    options.push({ value: 'Windows', label: 'Windows' })
    return options
  }, [isLinux, isMac, isSideload, game.is_linux_native, game.is_mac_native])

  const defaultPlatform: InstallPlatform =
    (isMac && game.is_mac_native && 'Mac') ||
    (isLinux && game.is_linux_native && 'linux') ||
    'Windows'

  const [platformIndex, setPlatformIndex] = useState(() => {
    const idx = availablePlatforms.findIndex((p) => p.value === defaultPlatform)
    return idx >= 0 ? idx : 0
  })
  const platformToInstall =
    availablePlatforms[platformIndex]?.value ?? 'Windows'
  const isSteam = hasCapability(game.runner, 'installHandOffToClient')
  // Platform and Wine selection never applies to Steam here, and Console never
  // offers Windows for a dual-build Steam game (quick 261107-li0). Windows would
  // mean `forceWindowsViaBottle`, but a forced-Windows install is `not-eligible`
  // for the bridge (`assembleBridgeRouteInput` reads
  // `isBottleEligibleFromPlatforms`, which is false for `is_mac_native === true`).
  // It therefore lands on the bottled Windows Steam client in the shared
  // `GameLibSteam` bottle, where a shared Wine choice applies. That choice
  // belongs to the desktop install dialog, and Console never shows a Wine
  // choice for Steam. A one-value Platform row would be a dead focus stop.
  const showPlatform = !isSteam && availablePlatforms.length > 1
  const hasWine = !isSteam && platformToInstall === 'Windows' && !isWin

  const [wineList, setWineList] = useState<WineInstallation[]>([])
  const [wineIndex, setWineIndex] = useState(0)
  const wineVersion = hasWine ? wineList[wineIndex] : undefined

  const [installPath, setInstallPath] = useState<string>('')

  const [focused, setFocused] = useState<FocusKey>('install')
  const installButtonRef = useRef<HTMLButtonElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const setupSteamButtonRef = useRef<HTMLButtonElement | null>(null)
  const [steamReady, setSteamReady] = useState(false)
  const [steamTargetPath, setSteamTargetPath] = useState<string | undefined>()
  const [steamBlocked, setSteamBlocked] =
    useState<SteamQuickInstallDegrade | null>(null)
  const [clientSetupHandOff, setClientSetupHandOff] =
    useState<ConsoleClientSetupHandOff | null>(null)
  // Set once the hand-off has opened the setup store for desktop mode, so the
  // unmount cleanup does not release the very session it just handed over.
  const handedOffRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void window.api.requestAppSettings().then((settings) => {
      if (!cancelled) setInstallPath(settings.defaultInstallPath)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Read by gamepad.ts to block the global `back` action (which would
    // pop out of /console via webContents.goBack()) while this modal is open.
    document.body.classList.add('console-modal-open')
    return () => document.body.classList.remove('console-modal-open')
  }, [])

  // Steam install probe: D-29 runs D-24's local check FIRST, using the same
  // pure decision functions the desktop quick-install path uses (composed by
  // ./consoleSteamTarget.ts -- deliberately NOT the desktop quick-install
  // door itself, whose degrade branch would open the desktop options dialog
  // underneath this full-screen overlay, which D-29 forbids). A not-ok
  // verdict shows the D-29 terminal failure card. An ok verdict only enables
  // Install: nothing installs until the user presses it, and nothing
  // auto-dismisses. Escape/Backspace dismiss immediately via the keydown
  // handler on every path.
  useEffect(() => {
    if (!hasCapability(game.runner, 'installManagedExternally')) return
    let cancelled = false
    let clientSetupSeen = false
    void probeSteamQuickInstallTarget(game.app_name).then((verdict) => {
      if (cancelled) {
        // Unmounted while the recheck was in flight: its push may already
        // have opened the setup store, and the cleanup below ran too early
        // to know. Release it here.
        if (!verdict.ok && verdict.clientSetup) {
          releaseUnclaimedSteamClientSetup(game.app_name)
        }
        return
      }
      if (!verdict.ok) {
        clientSetupSeen = Boolean(verdict.clientSetup)
        setSteamBlocked(verdict.degrade)
        setClientSetupHandOff(verdict.clientSetup ?? null)
        // Client cause: land the controller on the remedy (confirm-first,
        // like the install overlay's own Install-first default).
        if (verdict.clientSetup) setFocused('setupSteam')
        return
      }
      setSteamTargetPath(verdict.targetPath)
      setSteamReady(true)
    })
    return () => {
      cancelled = true
      // Every exit path (B, Escape, Backspace, A or a click on Dismiss, the
      // global console toggle) unmounts the overlay, so one release here
      // covers them all. A hand-off sets the flag first and keeps the store.
      if (clientSetupSeen && !handedOffRef.current) {
        releaseUnclaimedSteamClientSetup(game.app_name)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasWine) return
    let cancelled = false
    void window.api.getAlternativeWine().then((list) => {
      if (cancelled) return
      setWineList(list)
      setWineIndex(0)
    })
    return () => {
      cancelled = true
    }
  }, [hasWine])

  const visibleRows = useMemo<FocusKey[]>(() => {
    if (isSteam && steamBlocked) {
      return clientSetupHandOff ? ['cancel', 'setupSteam'] : ['cancel']
    }
    const rows: FocusKey[] = []
    if (showPlatform) rows.push('platform')
    if (hasWine) rows.push('wine')
    rows.push('cancel', 'install')
    return rows
  }, [showPlatform, hasWine, isSteam, steamBlocked, clientSetupHandOff])

  useEffect(() => {
    if (!visibleRows.includes(focused)) {
      setFocused(visibleRows[visibleRows.length - 1])
    }
  }, [visibleRows, focused])

  useEffect(() => {
    const btn =
      focused === 'install'
        ? installButtonRef.current
        : focused === 'cancel'
          ? cancelButtonRef.current
          : focused === 'setupSteam'
            ? setupSteamButtonRef.current
            : null
    btn?.focus({ preventScroll: true })
  }, [focused])

  // D-29: the failure card's Dismiss chip is the only control it renders --
  // land the controller on it directly, since the Steam branch's own
  // FocusKey rows (above) never include it. The client-cause card also has
  // the hand-off chip, and focus belongs on that one instead.
  useEffect(() => {
    if (steamBlocked && !clientSetupHandOff) {
      cancelButtonRef.current?.focus({ preventScroll: true })
    }
  }, [steamBlocked, clientSetupHandOff])

  const cycle =
    (length: number, setIndex: (fn: (i: number) => number) => void) =>
    (delta: 1 | -1) => {
      if (length === 0) return
      setIndex((i) => (i + delta + length) % length)
    }

  const cyclePlatform = cycle(availablePlatforms.length, setPlatformIndex)
  const cycleWine = cycle(wineList.length, setWineIndex)

  const installGame = async () => {
    if (isSteam) {
      if (!steamReady) return
      // D-23 / WR-01 (34.13 review WR-02): route through `installSteamGame`
      // with NO path argument, exactly like the desktop quick-install path.
      // The generic `install()` helper passed `installPath: 'default'`, which
      // `helpers/library.ts` resolves to `AppSettings.defaultInstallPath` --
      // GameLib's generic install dir, NOT a Steam library. That made the
      // free-space check (`target.steamappsDir`) validate a directory the
      // install would not write to, and produced a spurious `rejected
      // install-path override` backend warning on EVERY Console Mode Steam
      // install when `resolveOverride()` refused the unregistered path and
      // fell back to primary. `installSteamGame` is D-23's stated sole
      // marshalling site for `window.api.install` on the Steam path.
      // 34.13 review B-WR-01: it returns the dispatch promise, so the
      // fire-and-forget intent carries an explicit rejection handler.
      installSteamGame(game.app_name, game).catch(
        logSteamInstallDispatchFailure(game.app_name)
      )
      onDismiss()
      return
    }
    try {
      if (!isWin && wineVersion) {
        const gameSettings = await window.api.requestGameSettings(game.app_name)
        await writeConfig({
          appName: game.app_name,
          config: { ...gameSettings, wineVersion }
        })
      }
      void install({
        gameInfo: game,
        previousProgress: null,
        progress,
        installPath: installPath || 'default',
        isInstalling: false,
        platformToInstall,
        t,
        showDialogModal: () => null
      })
      onDismiss()
    } catch (err) {
      window.api.logError(`Console Mode install failed: ${String(err)}`)
    }
  }

  const handOff = () => {
    if (!clientSetupHandOff) return
    // Before the call: navigation unmounts this overlay, and the cleanup must
    // already see the flag.
    handedOffRef.current = true
    handOffSteamClientSetupToDesktop(
      game.app_name,
      clientSetupHandOff,
      onExitConsole
    )
  }

  // Stash live values in a ref so the keydown listener can stay attached for
  // the lifetime of the overlay; otherwise it'd detach/reattach on every
  // focus change.
  const handlersRef = useRef({
    focused,
    visibleRows,
    cyclePlatform,
    cycleWine,
    installGame,
    handOff,
    onDismiss,
    runner: game.runner
  })
  handlersRef.current = {
    focused,
    visibleRows,
    cyclePlatform,
    cycleWine,
    installGame,
    handOff,
    onDismiss,
    runner: game.runner
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const h = handlersRef.current
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        h.onDismiss()
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const idx = h.visibleRows.indexOf(h.focused)
        if (idx === -1) return
        const delta = e.key === 'ArrowDown' ? 1 : -1
        const next = (idx + delta + h.visibleRows.length) % h.visibleRows.length
        setFocused(h.visibleRows[next])
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const delta = e.key === 'ArrowRight' ? 1 : -1
        if (h.focused === 'platform') {
          e.preventDefault()
          e.stopPropagation()
          h.cyclePlatform(delta)
          return
        }
        if (h.focused === 'wine') {
          e.preventDefault()
          e.stopPropagation()
          h.cycleWine(delta)
          return
        }
        // The button row: toggle between its LAST TWO rows (cancel and
        // install, or cancel and the hand-off chip on the client-cause card).
        const buttonRow = h.visibleRows.slice(-2)
        if (buttonRow.includes(h.focused)) {
          e.preventDefault()
          e.stopPropagation()
          setFocused(h.focused === buttonRow[1] ? buttonRow[0] : buttonRow[1])
        }
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const intent = resolveConsoleActionIntent({
          runner: h.runner,
          focused: h.focused
        })
        if (intent === 'install') {
          e.preventDefault()
          void h.installGame()
        } else if (intent === 'handoff') {
          e.preventDefault()
          h.handOff()
        } else if (intent === 'dismiss') {
          e.preventDefault()
          h.onDismiss()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const { layout, mapping } = useGamepadInfo()
  useGamepadButtonPress(getActionButtonIndex(layout, mapping), () => {
    const intent = resolveConsoleActionIntent({ runner: game.runner, focused })
    if (intent === 'install') void installGame()
    else if (intent === 'handoff') handOff()
    else if (intent === 'dismiss') onDismiss()
  })
  useGamepadButtonPress(getBackButtonIndex(layout, mapping), onDismiss)

  const installTargetLabel = !isSteam
    ? installPath || '…'
    : !steamReady
      ? '…'
      : (steamTargetPath ??
        tGamelib(
          'gamelib:consoleMode.steamInstallTargetDefault',
          'Your Steam library'
        ))
  const wineLabel =
    wineList.length > 0
      ? (wineVersion?.name ?? t('console.install.wineMissing', 'Not selected'))
      : t('console.install.wineLoading', 'Loading…')

  // WR-01: ONE lookup through consoleSteamTarget's exhaustive
  // `[key, default]` table. The render site must never re-branch on
  // `reason` -- the ternary this replaces routed any future third reason
  // into the library-full copy, silently.
  const steamBlockedCopy = steamBlocked
    ? steamBlockedMessage(steamBlocked.reason)
    : undefined

  return (
    <div className="consoleInstallOverlay" role="dialog" aria-live="polite">
      <div className="consoleModal">
        {isSteam && steamBlocked ? (
          // D-29's resolved open question: an in-place TERMINAL failure
          // card, reusing classes already in this file. No platform row,
          // no wine row, no path row, no install control -- this is
          // provably not an options path, structurally rather than by
          // promise. No filesystem path is interpolated into any string
          // here (see consoleSteamTarget.ts's doc comment and this task's
          // D3 source gate). The ok-state "Install to" row below may show
          // the resolved library root, as the non-Steam row does; this card
          // never does.
          //
          // Quick 261102-pgy: when the Steam CLIENT is the cause, the card
          // adds only the `setupSteam` hand-off chip, whose sole effect is
          // leaving for desktop setup (SteamClientSetup is not mounted
          // under /console). There is still no platform, wine or path
          // row, no install control, and no options door.
          <>
            <div className="consoleModalTitle blocked">
              {tGamelib(
                'gamelib:consoleMode.steamInstallBlockedTitle',
                "Can't start this install"
              )}
            </div>
            <div className="consoleModalGameTitle">{game.title}</div>
            <p className="consoleModalReason">
              {steamBlockedCopy &&
                tGamelib(`gamelib:${steamBlockedCopy[0]}`, steamBlockedCopy[1])}
            </p>
            <div className="consoleInstallButtons">
              <button
                ref={cancelButtonRef}
                className={classNames('consoleChip', {
                  active: !clientSetupHandOff || focused === 'cancel'
                })}
                onClick={onDismiss}
                onMouseEnter={() => setFocused('cancel')}
                onFocus={() => setFocused('cancel')}
              >
                {t('button.dismiss', 'Dismiss')}
              </button>
              {clientSetupHandOff && (
                <button
                  ref={setupSteamButtonRef}
                  className={classNames('consoleChip', {
                    active: focused === 'setupSteam'
                  })}
                  onClick={handOff}
                  onMouseEnter={() => setFocused('setupSteam')}
                  onFocus={() => setFocused('setupSteam')}
                >
                  {tGamelib(
                    'gamelib:consoleMode.steamClientSetupHandOff',
                    'Set up Steam in desktop mode'
                  )}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="consoleModalTitle">
              {t('console.install.title', 'Install game')}
            </div>
            <div className="consoleModalGameTitle">{game.title}</div>

            <div className="consoleInstallFields">
              {showPlatform && (
                <SelectorRow
                  focused={focused === 'platform'}
                  onFocus={() => setFocused('platform')}
                  label={t('console.install.platform', 'Platform')}
                  value={availablePlatforms[platformIndex]?.label ?? ''}
                  onPrev={() => cyclePlatform(-1)}
                  onNext={() => cyclePlatform(1)}
                />
              )}
              {hasWine && (
                <SelectorRow
                  focused={focused === 'wine'}
                  onFocus={() => setFocused('wine')}
                  label={t('console.install.wine', 'Wine')}
                  value={wineLabel}
                  onPrev={() => cycleWine(-1)}
                  onNext={() => cycleWine(1)}
                  disabled={wineList.length <= 1}
                />
              )}
              <div className="consoleInstallRow">
                <span className="consoleInstallLabel">
                  {t('console.install.path', 'Install to')}
                </span>
                <span className="consoleInstallPath" title={installTargetLabel}>
                  {installTargetLabel}
                </span>
              </div>
            </div>

            <div className="consoleInstallButtons">
              <button
                ref={cancelButtonRef}
                className={classNames('consoleChip', {
                  active: focused === 'cancel'
                })}
                onClick={onDismiss}
                onMouseEnter={() => setFocused('cancel')}
                onFocus={() => setFocused('cancel')}
              >
                {t('button.cancel', 'Cancel')}
              </button>
              <button
                ref={installButtonRef}
                className={classNames('consoleChip', {
                  active: focused === 'install'
                })}
                onClick={() => void installGame()}
                onMouseEnter={() => setFocused('install')}
                onFocus={() => setFocused('install')}
                disabled={isSteam ? !steamReady : hasWine && !wineVersion}
              >
                {t('generic.install', 'Install')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SelectorRow({
  focused,
  onFocus,
  label,
  value,
  onPrev,
  onNext,
  disabled
}: {
  focused: boolean
  onFocus: () => void
  label: string
  value: string
  onPrev: () => void
  onNext: () => void
  disabled?: boolean
}) {
  const { t: tGamelib } = useTranslation('gamelib')

  return (
    <div
      className={classNames('consoleInstallRow consoleInstallSelector', {
        focused
      })}
      role="group"
      onMouseEnter={onFocus}
    >
      <span className="consoleInstallLabel">{label}</span>
      <div className="consoleInstallSelectorControl">
        <button
          type="button"
          className="consoleInstallArrow"
          onClick={onPrev}
          disabled={disabled}
          aria-label={tGamelib(
            'gamelib:consoleMode.installPrevious',
            'Previous'
          )}
          tabIndex={-1}
        >
          ‹
        </button>
        <span className="consoleInstallValue">{value}</span>
        <button
          type="button"
          className="consoleInstallArrow"
          onClick={onNext}
          disabled={disabled}
          aria-label={tGamelib('gamelib:consoleMode.installNext', 'Next')}
          tabIndex={-1}
        >
          ›
        </button>
      </div>
    </div>
  )
}
