import { useEffect, useState } from 'react'
import classNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDownload } from '@fortawesome/free-solid-svg-icons'

/**
 * Icon slot of the Downloads tier-1 tab (quick 261012-dhs, D-02): a download
 * glyph plus a live queue-count badge that renders only while the queue is
 * non-empty.
 *
 * The queue subscription was ported from the deleted DownloadsRing (34.10-03):
 * seed from `getDMQueueInformation`, follow the `handleDMQueueInformation`
 * push, and return the unsubscribe so a re-mount cannot leak a listener.
 *
 * `className` is forwarded to the root because MUI's `<Tab>` clones its
 * `icon` element and passes `className: clsx('MuiTab-iconWrapper', ...)`;
 * dropping it would lose the icon-wrapper spacing.
 */
export default function DownloadsTabIcon({
  className
}: {
  className?: string
}) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    window.api
      .getDMQueueInformation()
      .then(({ elements }) => {
        setCount(elements.length)
      })
      .catch((error) => {
        console.error('Failed to get DM queue information:', error)
      })

    return window.api.handleDMQueueInformation((e, elements) => {
      if (elements) setCount(elements.length)
    })
  }, [])

  return (
    <span className={classNames('NavTabs__downloadsIcon', className)}>
      <FontAwesomeIcon icon={faDownload} />
      {count > 0 && <span className="NavTabs__downloadsCount">{count}</span>}
    </span>
  )
}
