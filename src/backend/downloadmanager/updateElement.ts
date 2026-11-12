import type { DMQueueElement, GameInfo } from 'common/types'

/** The 'update' queue element for an installed game; shared by autoUpdate and the launch prompt. */
export function buildUpdateQueueElement(
  gameInfo: GameInfo,
  appName: string
): DMQueueElement {
  const {
    install: { install_path, platform },
    runner
  } = gameInfo
  const dmQueueElement: DMQueueElement = {
    params: {
      appName,
      gameInfo,
      runner,
      path: install_path!,
      platformToInstall: platform!
    },
    type: 'update',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  return dmQueueElement
}
