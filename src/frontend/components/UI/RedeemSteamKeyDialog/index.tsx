import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../Dialog'
import ContextProvider from '../../../state/ContextProvider'
import {
  normalizeKey,
  isObviouslyMalformed
} from 'frontend/helpers/steamKeyValidation'
import { fuzzyMatch, normalizeTitle } from 'common/matching/titleMatch'
import { RedeemKeyOutcome } from 'common/types/steam'
import { GameInfo } from 'common/types'
import { redeemOutcomeCopy } from './copy'

export default function RedeemSteamKeyDialog() {
  const { t } = useTranslation()
  // Phase 34.8-07 (REQ-34.8-12/-13): a second, aliased useTranslation() call
  // for the `gamelib` namespace, passed into redeemOutcomeCopy() so it
  // inherits a Suspense-resolved `t` rather than a module-scope binding that
  // could race i18next initialisation. Same two-hook-with-alias pattern as
  // GameCard/index.tsx.
  const { t: tGamelib } = useTranslation('gamelib')
  const navigate = useNavigate()
  const { showRedeemKeyDialog, handleRedeemKeyDialog, steam, refreshLibrary } =
    useContext(ContextProvider)

  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<RedeemKeyOutcome | null>(null)
  const [packageName, setPackageName] = useState<string | undefined>(undefined)
  const [matchedGame, setMatchedGame] = useState<GameInfo | undefined>(
    undefined
  )

  // Resolve the "View in library" jump target once the outcome is a success
  // and the Steam library has been refreshed (Pitfall 3: packageList gives a
  // packageID -> name map, NOT AppIDs, so we title-match against the
  // freshly-refreshed steam.library instead). This effect deliberately
  // depends on `steam.library` so it re-runs once refreshLibrary's state
  // update actually lands, rather than racing a stale closure.
  useEffect(() => {
    if (outcome !== 'success' || !packageName) {
      setMatchedGame(undefined)
      return
    }
    const normalizedTarget = normalizeTitle(packageName)
    const match = (steam.library ?? []).find(
      (game) =>
        normalizeTitle(game.title) === normalizedTarget ||
        fuzzyMatch(packageName, game.title)
    )
    setMatchedGame(match)
  }, [outcome, packageName, steam.library])

  function resetAndClose() {
    setKey('')
    setBusy(false)
    setOutcome(null)
    setPackageName(undefined)
    setMatchedGame(undefined)
    handleRedeemKeyDialog(false)
  }

  async function onRedeem() {
    if (isObviouslyMalformed(key)) {
      // SPEC REQ3: malformed input never reaches the IPC call. Never log the
      // raw key here or anywhere else in this component (T-26-01).
      setOutcome('invalid')
      return
    }

    setBusy(true)
    try {
      const result = await window.api.redeemSteamKey({
        store: 'steam',
        key: normalizeKey(key)
      })

      setOutcome(result.outcome)

      if (result.outcome === 'success') {
        const firstPackageName = result.packageList
          ? Object.values(result.packageList)[0]
          : undefined
        setPackageName(firstPackageName)
        // NOT recomputeOwnership directly — reuse the existing refresh path
        // so the library, ownership, and any dependent UI stay consistent.
        await refreshLibrary({ library: 'steam', origin: 'redeem-steam-key' })
      }
    } catch {
      setOutcome('error')
    } finally {
      setBusy(false)
    }
  }

  function onViewInLibrary() {
    if (!matchedGame) return
    resetAndClose()
    navigate(`/gamepage/steam/${matchedGame.app_name}`, {
      state: { gameInfo: matchedGame }
    })
  }

  if (!showRedeemKeyDialog) return null

  const copy = outcome
    ? redeemOutcomeCopy(outcome, tGamelib, packageName)
    : null

  return (
    <Dialog onClose={resetAndClose} showCloseButton>
      <DialogHeader onClose={resetAndClose}>
        {t('redeemSteamKey.title', 'Redeem a Steam key')}
      </DialogHeader>
      <DialogContent>
        {outcome !== 'success' && (
          <input
            type="text"
            className="Dialog__input"
            autoFocus
            disabled={busy}
            value={key}
            placeholder={t(
              'redeemSteamKey.placeholder',
              'Enter your Steam key'
            )}
            onChange={(e) => {
              setKey(e.target.value)
              // Clear a prior non-success outcome so the user can retry
              // inline without closing the dialog (D-06/D-08: stays open).
              if (outcome) setOutcome(null)
            }}
          />
        )}
        {copy && (
          <p
            className={
              copy.tone === 'success'
                ? 'redeemSteamKey__success'
                : 'redeemSteamKey__error'
            }
          >
            {copy.message}
          </p>
        )}
        {outcome === 'success' && matchedGame && (
          <button className="button is-secondary" onClick={onViewInLibrary}>
            {t('redeemSteamKey.viewInLibrary', 'View in library')}
          </button>
        )}
      </DialogContent>
      <DialogFooter>
        {outcome !== 'success' && (
          <button
            className="button is-primary"
            disabled={busy || key.trim().length === 0}
            onClick={onRedeem}
          >
            {busy
              ? t('redeemSteamKey.redeeming', 'Redeeming...')
              : t('redeemSteamKey.redeem', 'Redeem')}
          </button>
        )}
        <button className="button is-secondary" onClick={resetAndClose}>
          {t('button.close', 'Close')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
