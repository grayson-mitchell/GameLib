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
 */

function RingProgress({
  appName,
  runner
}: {
  appName: string
  runner: Runner
}) {
  const [progress] = hasProgress(appName, runner)
  const percent = progress.percent ?? 0

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
      {head ? (
        <RingProgress
          key={head.params.appName}
          appName={head.params.appName}
          runner={head.params.runner}
        />
      ) : (
        <span
          className="DownloadsRing__ring"
          style={{ '--dl-progress': '0turn' } as CSSProperties}
        />
      )}
      {elements.length > 0 && (
        <span className="DownloadsRing__count">{elements.length}</span>
      )}
    </Link>
  )
}
