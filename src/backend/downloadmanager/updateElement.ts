import type { DMQueueElement, GameInfo } from 'common/types'

/** The 'update' queue element for an installed game; shared by autoUpdate and the launch prompt. */
export function buildUpdateQueueElement(
  gameInfo: GameInfo,
  appName: string,
  opts?: { unattended?: boolean }
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
  if (opts?.unattended === true) dmQueueElement.params.unattended = true
  return dmQueueElement
}
