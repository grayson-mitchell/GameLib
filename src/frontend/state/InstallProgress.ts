import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import type { InstallProgress, Runner } from 'common/types'

type StoreType = Record<`${string}_${Runner}`, InstallProgress>

const useInstallProgressRaw = create<StoreType>()(() => ({}))

window.api.onProgressUpdate((e, { appName, progress, runner }) => {
  const key = `${appName}_${runner}`
  useInstallProgressRaw.setState({ [key]: progress })
})

export const useInstallProgress = <T>(
  selector: Parameters<typeof useShallow<StoreType, T>>[0]
) => useInstallProgressRaw(useShallow(selector))

/**
 * Reads the latest progress for a game without subscribing to the store.
 *
 * Consumers that sample on their own schedule (the DownloadManager speed
 * chart's 1s timer) need the newest emit at the moment they fire, not a
 * render-triggering subscription — the backend emits at up to 2Hz and every
 * one of those would otherwise be a re-render. Returns undefined until the
 * first progressUpdate for the pair arrives.
 */
export const getInstallProgress = (
  appName: string,
  runner: Runner
): InstallProgress | undefined =>
  useInstallProgressRaw.getState()[`${appName}_${runner}`]
