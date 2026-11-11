import './index.css'

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DMQueueElement, DownloadManagerState } from 'common/types'
import type { IpcRendererEvent } from 'common/types/hostTypes'
import { UpdateComponent } from 'frontend/components/UI'
import DownloadHero from './components/DownloadHero'
import { DMQueue } from 'frontend/types'
import DownloadManagerItem from './components/DownloadManagerItem'
import SetupDownloadItem from './components/SetupDownloadItem'
import SteamManagedItem from './components/SteamManagedItem'
import { steamManagedRows } from './components/SteamManagedItem/steamManagedModel'
import useLibraryState from 'frontend/state/libraryState'
import useDownloadsState, {
  ensureFinishedLoaded
} from 'frontend/state/downloadsState'
import { useSteamSetupDownloads } from 'frontend/state/SteamSetupDownloads'

export default React.memo(function DownloadManager(): JSX.Element | null {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const setupRows = useSteamSetupDownloads()
  const libraryStatus = useLibraryState((s) => s.libraryStatus)
  const managedRows = steamManagedRows(libraryStatus)
  const [refreshing, setRefreshing] = useState(false)
  const [state, setState] = useState<DownloadManagerState>('idle')
  const [plannendElements, setPlannendElements] = useState<DMQueueElement[]>([])
  const [currentElement, setCurrentElement] = useState<DMQueueElement>()
  const finished = useDownloadsState((s) => s.finished)
  const { clearFinished, clearFinishedItem } = useDownloadsState.keys(
    'clearFinished',
    'clearFinishedItem'
  )

  useEffect(() => {
    // Self-heal a failed boot pull without bringing back the refill-on-every-
    // mount (D-15): only pull when the list was never loaded.
    ensureFinishedLoaded()

    setRefreshing(true)
    window.api.getDMQueueInformation().then(({ elements, state }: DMQueue) => {
      setCurrentElement(elements[0])
      setPlannendElements([...elements.slice(1)])
      setRefreshing(false)
      setState(state)
    })

    const removeHandleDMQueueInformation = window.api.handleDMQueueInformation(
      (
        e: IpcRendererEvent,
        elements: DMQueueElement[],
        state: DownloadManagerState
      ) => {
        if (elements) {
          setCurrentElement(elements[0])
          setPlannendElements([...elements.slice(1)])
          setState(state)
        }
      }
    )

    return () => {
      removeHandleDMQueueInformation()
    }
  }, [])

  if (refreshing) {
    return <UpdateComponent />
  }

  const doneElements =
    (finished?.length &&
      [...finished].sort((a, b) => {
        // Sort by endTime
        return b.endTime - a.endTime
      })) ||
    []

  /*
    Other Keys:
    t('queue.label.empty', 'Nothing to download')
    t('download-manager.install-type.install', 'Install')
    t('download-manager.install-type.update', 'Update')
    */

  return (
    <div className="downloadManagerPage">
      <DownloadHero
        key={currentElement?.params.appName ?? 'idle'}
        element={currentElement}
        state={state}
      />
      {setupRows.length > 0 && (
        <section className="dmSection">
          <header className="dmSection__header">
            <h5 className="dmSection__title">
              {tGamelib('gamelib:downloadManager.setup.title', 'Setup')}
              <span className="dmSection__count">{`(${setupRows.length})`}</span>
            </h5>
          </header>
          <div className="dmSection__list">
            {setupRows.map((row) => (
              <SetupDownloadItem key={row.kind} row={row} />
            ))}
          </div>
        </section>
      )}
      {managedRows.length > 0 && (
        <section className="dmSection">
          <header className="dmSection__header">
            <h5 className="dmSection__title">
              {tGamelib(
                'gamelib:downloadManager.steamManaged.title',
                'Managed by Steam'
              )}
              <span className="dmSection__count">{`(${managedRows.length})`}</span>
            </h5>
          </header>
          <div className="dmSection__list">
            {managedRows.map((row) => (
              <SteamManagedItem key={row.appName} row={row} />
            ))}
          </div>
        </section>
      )}
      {plannendElements.length > 0 && (
        <section className="dmSection">
          <header className="dmSection__header">
            <h5 className="dmSection__title">
              {tGamelib('gamelib:downloadManager.upNext', 'Up Next')}
              <span className="dmSection__count">
                {`(${plannendElements.length})`}
              </span>
            </h5>
          </header>
          <div className="dmSection__list">
            {plannendElements.map((el) => (
              <DownloadManagerItem
                key={el.params.appName}
                element={el}
                current={false}
              />
            ))}
          </div>
        </section>
      )}
      {!!doneElements?.length && (
        <section className="dmSection">
          <header className="dmSection__header">
            <h5 className="dmSection__title">
              {t('queue.label.finished', 'Completed')}
              <span className="dmSection__count">
                {`(${doneElements.length})`}
              </span>
            </h5>
            <button className="button is-text" onClick={() => clearFinished()}>
              {t('queue.label.clear', 'Clear List')}
            </button>
          </header>
          <div className="dmSection__list">
            {doneElements.map((el, key) => (
              <DownloadManagerItem
                key={key}
                element={el}
                current={false}
                handleClearItem={clearFinishedItem}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
})
