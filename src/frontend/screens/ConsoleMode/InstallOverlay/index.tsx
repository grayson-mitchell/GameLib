import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import './index.scss'

import { install, writeConfig } from 'frontend/helpers'
import { hasProgress } from 'frontend/hooks/hasProgress'
import ContextProvider from 'frontend/state/ContextProvider'

import type { GameInfo, InstallPlatform, WineInstallation } from 'common/types'

import { BTN_ACTION, BTN_BACK } from '../controller'
import { useGamepadButtonPress } from '../hooks'
import {
  probeSteamQuickInstallTarget,
  resolveConsoleActionIntent,
  steamBlockedMessage,
  type ConsoleFocusKey as FocusKey
} from './consoleSteamTarget'
import type { SteamQuickInstallDegrade } from 'frontend/state/InstallGameModal'

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
  onDismiss
}: {
  game: GameInfo
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const { platform } = useContext(ContextProvider)
  const [progress] = hasProgress(game.app_name, game.runner)

  const isWin = platform === 'win32'
  const isMac = platform === 'darwin'
  const isLinux = platform === 'linux'
  const isSideload = game.runner === 'sideload'

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
  const hasWine = platformToInstall === 'Windows' && !isWin

  const [wineList, setWineList] = useState<WineInstallation[]>([])
  const [wineIndex, setWineIndex] = useState(0)
  const wineVersion = hasWine ? wineList[wineIndex] : undefined

  const [installPath, setInstallPath] = useState<string>('')

  const [focused, setFocused] = useState<FocusKey>('install')
  const installButtonRef = useRef<HTMLButtonElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const [steamBlocked, setSteamBlocked] =
    useState<SteamQuickInstallDegrade | null>(null)

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

  // Steam install handoff: D-29 runs D-24's local check FIRST, using the
  // same pure decision functions the desktop quick-install path uses
  // (composed by ./consoleSteamTarget.ts -- deliberately NOT the desktop
  // quick-install door itself, whose degrade branch would open the desktop
  // options dialog underneath this full-screen overlay, which D-29
  // forbids). On a not-ok
  // verdict, this shows the D-29 in-place failure card and returns WITHOUT
  // calling install() and WITHOUT arming any timer -- an unconditionally
  // armed timer would make the failure message vanish after 1.5s, a silent
  // failure. Only on an ok verdict does the existing install() call fire
  // (routing to the validated backend steam/games.ts -> the install
  // protocol; no raw Steam protocol URL is constructed here), and only then
  // is the 1500ms auto-dismiss timer armed. Escape/Backspace still dismiss
  // immediately via the existing keydown handler on either path.
  useEffect(() => {
    if (game.runner !== 'steam') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    void probeSteamQuickInstallTarget().then((verdict) => {
      if (cancelled) return
      if (!verdict.ok) {
        setSteamBlocked(verdict.degrade)
        return
      }
      void install({
        gameInfo: game,
        previousProgress: null,
        progress,
        installPath: 'default',
        isInstalling: false,
        platformToInstall: 'Windows',
        t,
        showDialogModal: () => null
      })
      timer = setTimeout(() => {
        if (!cancelled) onDismiss()
      }, 1500)
    })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
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
    const rows: FocusKey[] = []
    if (availablePlatforms.length > 1) rows.push('platform')
    if (hasWine) rows.push('wine')
    rows.push('cancel', 'install')
    return rows
  }, [availablePlatforms.length, hasWine])

  useEffect(() => {
    if (!visibleRows.includes(focused)) setFocused('install')
  }, [visibleRows, focused])

  useEffect(() => {
    const btn =
      focused === 'install'
        ? installButtonRef.current
        : focused === 'cancel'
          ? cancelButtonRef.current
          : null
    btn?.focus({ preventScroll: true })
  }, [focused])

  // D-29: the failure card's Dismiss chip is the only control it renders --
  // land the controller on it directly, since the Steam branch's own
  // FocusKey rows (above) never include it.
  useEffect(() => {
    if (steamBlocked) {
      cancelButtonRef.current?.focus({ preventScroll: true })
    }
  }, [steamBlocked])

  const cycle =
    (length: number, setIndex: (fn: (i: number) => number) => void) =>
    (delta: 1 | -1) => {
      if (length === 0) return
      setIndex((i) => (i + delta + length) % length)
    }

  const cyclePlatform = cycle(availablePlatforms.length, setPlatformIndex)
  const cycleWine = cycle(wineList.length, setWineIndex)

  const installGame = async () => {
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

  // Stash live values in a ref so the keydown listener can stay attached for
  // the lifetime of the overlay; otherwise it'd detach/reattach on every
  // focus change.
  const handlersRef = useRef({
    focused,
    visibleRows,
    cyclePlatform,
    cycleWine,
    installGame,
    onDismiss,
    runner: game.runner
  })
  handlersRef.current = {
    focused,
    visibleRows,
    cyclePlatform,
    cycleWine,
    installGame,
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
        if (h.focused === 'cancel' || h.focused === 'install') {
          e.preventDefault()
          e.stopPropagation()
          setFocused(h.focused === 'install' ? 'cancel' : 'install')
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
        } else if (intent === 'dismiss') {
          e.preventDefault()
          h.onDismiss()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useGamepadButtonPress(BTN_ACTION, () => {
    const intent = resolveConsoleActionIntent({ runner: game.runner, focused })
    if (intent === 'install') void installGame()
    else if (intent === 'dismiss') onDismiss()
  })
  useGamepadButtonPress(BTN_BACK, onDismiss)

  const showPlatform = availablePlatforms.length > 1
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
        {game.runner === 'steam' ? (
          steamBlocked ? (
            // D-29's resolved open question: an in-place TERMINAL failure
            // card, reusing classes already in this file. No platform row,
            // no wine row, no path row, no install control, no new
            // FocusKey -- this is provably not an options path, structurally
            // rather than by promise. No filesystem path is interpolated
            // into any string here (see consoleSteamTarget.ts's doc comment
            // and this task's D3 source gate).
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
                  tGamelib(
                    `gamelib:${steamBlockedCopy[0]}`,
                    steamBlockedCopy[1]
                  )}
              </p>
              <div className="consoleInstallButtons">
                <button
                  ref={cancelButtonRef}
                  className="consoleChip active"
                  onClick={onDismiss}
                >
                  {t('button.dismiss', 'Dismiss')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="consoleModalTitle">
                {t('console.steam.installing', 'Opening Steam to install…')}
              </div>
              <div className="consoleModalGameTitle">{game.title}</div>
            </>
          )
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
                <span className="consoleInstallPath" title={installPath}>
                  {installPath || '…'}
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
                disabled={hasWine && !wineVersion}
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
          aria-label={tGamelib('gamelib:consoleMode.installPrevious', 'Previous')}
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
