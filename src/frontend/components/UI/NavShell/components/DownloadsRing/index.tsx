import { CSSProperties, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'

import { DMQueueElement, Runner } from 'common/types'
import { hasProgress } from 'frontend/hooks/hasProgress'
import './index.scss'

/**
 * Ambient Downloads indicator for the navbar's nav-right cluster (34.10-03
 * Task 1). Ports the data hookup of the retired left navigation's
 * `CurrentDownload` row plus its queue subscription (previously
 * `Sidebar/index.tsx:21-44`), but D-07 inverts the old idle guard: the ring
 * is now always mounted -- dimmed and unfilled when the queue is empty --
 * instead of unmounting itself, so the navbar slot never pops in or out.
 *
 * `RingProgress` (F-34.10-02 cause (b), 34.10-F02-DIAGNOSIS.md H3) is now
 * ALSO unconditionally mounted, matching the pattern every other
 * `hasProgress` consumer already uses (`ProgressHeader` in
 * `DownloadManager/index.tsx:113-114` is the direct precedent for the
 * `?? ''` / `?? 'legendary'` fallback below). Previously it was only
 * mounted while `head` was truthy, so its `hasProgress` hook instance was
 * torn down and reseeded at every queue-membership boundary -- the one
 * place `hasProgress`'s empty-object seed defect (`hasProgress.ts:14-19`,
 * a separate, NOT-fixed-here latent bug) is guaranteed to be painted
 * straight to the screen instead of silently resolving before the next
 * render. `RingProgress` itself still gates its own `percent` behind
 * `appName` being non-empty so the idle state renders `0turn` rather than
 * whatever stale value a still-alive hook instance might otherwise carry.
 */

export function RingProgress({
  appName,
  runner
}: {
  appName: string
  runner: Runner
}) {
  const [progress] = hasProgress(appName, runner)
  const percent = appName ? (progress.percent ?? 0) : 0

  return (
    <span
      className="DownloadsRing__ring"
      style={{ '--dl-progress': `${percent / 100}turn` } as CSSProperties}
    />
  )
}

export default function DownloadsRing() {
  const [elements, setElements] = useState<DMQueueElement[]>([])
  const { t } = useTranslation()
  const { pathname } = useLocation()

  useEffect(() => {
    window.api
      .getDMQueueInformation()
      .then(({ elements }) => {
        setElements(elements)
      })
      .catch((error) => {
        console.error('Failed to get DM queue information:', error)
      })

    return window.api.handleDMQueueInformation((e, elements) => {
      setElements(elements)
    })
  }, [])

  const head = elements[0]
  const isIdle = elements.length === 0
  const isActive = pathname.startsWith('/download-manager')

  return (
    <Link
      to="/download-manager"
      className={classNames('DownloadsRing', {
        'DownloadsRing--idle': isIdle
      })}
      aria-label={t('download-manager.link', 'Downloads')}
      aria-current={isActive ? 'page' : undefined}
    >
      <RingProgress
        key={head?.params.appName ?? 'idle'}
        appName={head?.params.appName ?? ''}
        runner={head?.params.runner ?? 'legendary'}
      />
      {elements.length > 0 && (
        <span className="DownloadsRing__count">{elements.length}</span>
      )}
    </Link>
  )
}
