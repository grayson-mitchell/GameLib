import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGameInfo } from 'frontend/helpers'
import {
  useSteamBridgeRouteNotice,
  resolveRouteNoticeContent,
  knownBadReasonKey
} from 'frontend/state/SteamBridgeRouteNotice'
import { installSteamGame } from 'frontend/state/InstallGameModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'

// Phase 51 Plan 13 (D-51-08/11): the up-front bridge ROUTE notice -- opened
// exclusively by the global SteamBridgeRouteNotice store (itself only ever
// opened by the backend `steamBridgeRouteNotice` push, games.ts's install(),
// gated on `bridgeRoute.noticeRequired` -- see SteamBridgeRouteNotice.ts),
// this fires BEFORE any install attempt for a known-bad / persisted-scan-
// miss / win64-no-shim bottle route: no silent heavy Windows Steam client
// (D-51-08's whole point). "Use bottled Steam" acknowledges the notice for
// this reason (so it never reappears for the SAME reason) and proceeds with
// the ordinary bottled install; "Try the bridge anyway" (D-51-11, hidden for
// win64-no-shim per D-51-13's fail-closed default) persists the user's
// forced 'bridge' override and retries install() through the bridge.
// "Cancel" is a dead-end-free third option -- nothing is dispatched.
//
// D-51-08 amendment (2026-10-23): a non-DRM known-bad title stays on the
// bridge. Its notice is the INFORMATIONAL variant (`informational`): only
// "Install anyway" (acknowledges 'known-bad', keeping the stored userRoute
// as-is, then retries install through the bridge) and Cancel -- never "Use
// bottled Steam" or "Try the bridge anyway". When a later bottle row
// (scan-miss / win64-no-shim) wins for such a title, the single dialog
// shown there also names the known-bad reason.
const SteamBridgeRouteNotice = () => {
  const { t } = useTranslation('gamelib')
  const {
    isOpen,
    appName,
    reason,
    knownBadReason,
    missingSymbols,
    route,
    userRoute: storedUserRoute,
    close
  } = useSteamBridgeRouteNotice()

  const [gameTitle, setGameTitle] = useState<string>()
  const [busyRoute, setBusyRoute] = useState<'bottle' | 'bridge' | null>(null)
  const [error, setError] = useState<string>()

  // Reset local state and (re-)fetch the game title whenever a NEW notice
  // opens -- a different appName may trigger this after a previous one
  // closed, and `gameInfo.title` is the preferred {{title}} source (D-51-08
  // action text), falling back to the raw appName until it resolves.
  useEffect(() => {
    if (!isOpen || !appName) return

    setBusyRoute(null)
    setError(undefined)
    setGameTitle(undefined)

    let cancelled = false
    void getGameInfo(appName, 'steam').then((info) => {
      if (!cancelled && info) {
        setGameTitle(info.title)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isOpen, appName])

  if (!isOpen || !appName || !reason) {
    return null
  }

  const { bodyKey, showTryBridge, informational } = resolveRouteNoticeContent({
    appName,
    reason,
    knownBadReason,
    missingSymbols,
    route: route ?? 'bottle',
    userRoute: storedUserRoute
  })
  const title = gameTitle ?? appName

  const handleCancel = () => {
    close()
  }

  // Shared by "Use bottled Steam", "Try the bridge anyway" and the
  // informational "Install anyway" -- the only difference between them is the
  // userRoute/acknowledgeReason pair persisted before the SAME
  // installSteamGame(appName, gameInfo) retry (34.13-08 D-17 marshalling
  // precedent, SteamBridgeSetup.tsx). 'acknowledge' persists the notice
  // acknowledgement for 'known-bad' and passes the stored userRoute back
  // unchanged.
  const chooseRoute = async (choice: 'bottle' | 'bridge' | 'acknowledge') => {
    setBusyRoute(choice === 'bottle' ? 'bottle' : 'bridge')
    setError(undefined)

    try {
      const info = await getGameInfo(appName, 'steam')
      if (!info) {
        setError(
          t('steam.bridge.routeNotice.notFound', {
            defaultValue: 'Could not find this game to install it.'
          })
        )
        return
      }

      await window.api.setSteamBridgeUserRoute(
        choice === 'acknowledge'
          ? {
              appId: appName,
              userRoute: storedUserRoute,
              acknowledgeReason: 'known-bad'
            }
          : choice === 'bottle'
            ? { appId: appName, userRoute: null, acknowledgeReason: reason }
            : { appId: appName, userRoute: 'bridge' }
      )
      await installSteamGame(appName, info)
      close()
    } catch (err) {
      setError(
        t('steam.bridge.routeNotice.error', {
          defaultValue: 'Starting the install failed: {{error}}',
          error: err instanceof Error ? err.message : String(err)
        })
      )
    } finally {
      setBusyRoute(null)
    }
  }

  const renderBody = () => {
    switch (bodyKey) {
      case 'knownBad':
        return t('steam.bridge.routeNotice.knownBad', {
          defaultValue:
            '{{title}} is known not to work with the native Steam bridge: {{reason}}.',
          title,
          reason: knownBadReason
            ? t(`steam.bridge.knownBad.${knownBadReasonKey(knownBadReason)}`)
            : ''
        })
      case 'scanMiss':
        return t('steam.bridge.routeNotice.scanMiss', {
          defaultValue:
            'The native Steam bridge does not cover every Steam call {{title}} makes. Not covered: {{symbols}}.',
          title,
          symbols: missingSymbols.join(', ')
        })
      case 'win64NoShim':
        return t('steam.bridge.routeNotice.win64NoShim', {
          defaultValue:
            '{{title}} is a 64-bit game, and this build of GameLib has no 64-bit bridge.',
          title
        })
    }
  }

  return (
    <Dialog
      onClose={handleCancel}
      showCloseButton
      className="steamBridgeRouteNoticeDialog"
    >
      <DialogHeader onClose={handleCancel}>
        {informational
          ? t(
              'steam.bridge.routeNotice.titleBridge',
              'This game may not work with the native Steam bridge'
            )
          : t(
              'steam.bridge.routeNotice.title',
              'This game will use the Windows Steam client'
            )}
      </DialogHeader>
      <DialogContent>
        <p>{renderBody()}</p>
        {!informational && knownBadReason && reason !== 'known-bad' ? (
          <p>
            {t('steam.bridge.route.reason.knownBad', {
              defaultValue: 'Known not to work with the bridge: {{reason}}',
              reason: t(
                `steam.bridge.knownBad.${knownBadReasonKey(knownBadReason)}`
              )
            })}
          </p>
        ) : null}
        <p>
          {informational
            ? t(
                'steam.bridge.routeNotice.bridgeExplainer',
                'GameLib will still install it through the native Steam bridge, but it will probably not run.'
              )
            : t(
                'steam.bridge.routeNotice.bottledExplainer',
                'GameLib will install it into the bottled Windows Steam client instead.'
              )}
        </p>
        {error ? <p className="steamBridgeSetupError">{error}</p> : null}
      </DialogContent>
      <DialogFooter>
        {/* 34.13 review C-23: `void` on every onClick so no promise floats
            off an event handler -- each handler's body is entirely inside
            try/catch/finally above. */}
        {informational ? (
          <button
            onClick={() => void chooseRoute('acknowledge')}
            disabled={busyRoute !== null}
            className="button is-primary"
          >
            {t('steam.bridge.routeNotice.installAnyway', 'Install anyway')}
          </button>
        ) : (
          <button
            onClick={() => void chooseRoute('bottle')}
            disabled={busyRoute !== null}
            className="button is-primary"
          >
            {t('steam.bridge.routeNotice.useBottled', 'Use bottled Steam')}
          </button>
        )}
        {showTryBridge ? (
          <button
            onClick={() => void chooseRoute('bridge')}
            disabled={busyRoute !== null}
            className="button is-secondary outline"
          >
            {t('steam.bridge.routeNotice.tryBridge', 'Try the bridge anyway')}
          </button>
        ) : null}
        <button
          onClick={handleCancel}
          disabled={busyRoute !== null}
          className="button is-secondary outline"
        >
          {t('steam.bridge.routeNotice.cancel', 'Cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default SteamBridgeRouteNotice
