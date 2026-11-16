import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { size } from 'frontend/helpers'
import useLibraryState from 'frontend/state/libraryState'
import type { SteamUpdateInfo as SteamUpdateInfoData } from 'common/types/steam'

interface Props {
  appName: string
  hasUpdate: boolean
}

/**
 * quick 261114-obu: inline async update-size label appended to the GameStatus
 * line ("Installed - New Version Available! · Download about 916 MB").
 *
 * OPERATOR DECISION 2026-11-14: this deliberately reverses the Phase 74-12
 * click-only gate (D-09/D-15, T-74-39 "no silent authenticated logon"). A
 * stale bridge game with no cached estimate now takes one authenticated
 * steam-user lease automatically on mount.
 *
 * Bounds: the plain read returns the backend's per-boot cached estimate
 * without authenticating, so computeSize is only requested when that read is
 * bridge+stale with no estimate. Concurrent mounts share one in-flight request
 * and failures are memoised per appName@targetBuild, so nothing retries or
 * loops. Failures render nothing. Hooks run unconditionally before any return.
 */
const sizeRequests = new Map<string, Promise<SteamUpdateInfoData | null>>()
const failedSizes = new Set<string>()

const SteamUpdateInfo = ({ appName, hasUpdate }: Props) => {
  const { t } = useTranslation('gamelib')
  const [info, setInfo] = useState<SteamUpdateInfoData | null>(null)
  const [computing, setComputing] = useState(false)
  // Re-read after the game's operation status changes (an update ending clears the line).
  const libraryStatus = useLibraryState(
    (s) => s.libraryStatus.find((g) => g.appName === appName)?.status
  )

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setComputing(false)
    const run = async () => {
      const result = await window.api.getSteamUpdateInfo(appName)
      if (cancelled) return
      setInfo(result)
      if (
        !(result?.kind === 'bridge' && result.state === 'stale') ||
        result.estimate
      )
        return
      const key = `${appName}@${result.targetBuild ?? ''}`
      if (failedSizes.has(key)) return
      setComputing(true)
      let request = sizeRequests.get(key)
      if (!request) {
        request = window.api
          .getSteamUpdateInfo(appName, { computeSize: true })
          .finally(() => sizeRequests.delete(key))
        sizeRequests.set(key, request)
      }
      try {
        const computed = await request
        if (computed?.estimate) {
          if (!cancelled) setInfo(computed)
        } else {
          failedSizes.add(key)
        }
      } catch {
        failedSizes.add(key)
      }
      if (!cancelled) setComputing(false)
    }
    run().catch(() => {
      if (!cancelled) setComputing(false)
    })
    return () => {
      cancelled = true
    }
  }, [appName, hasUpdate, libraryStatus])

  if (!info || info.kind !== 'bridge' || info.state !== 'stale') return null
  if (info.estimate) {
    return (
      <>{` · ${t('gamepage.update.downloadAbout', 'Download about {{download}}', { download: size(info.estimate.downloadBytes) })}`}</>
    )
  }
  if (computing) {
    return (
      <>{` · ${t('gamepage.update.checkingSize', 'Checking update size…')}`}</>
    )
  }
  return null
}

export default SteamUpdateInfo
