import { useEffect, useState } from 'react'
import { asStoreGame } from 'common/gameInfoNarrowing'
import { AntiCheatInfo, GameInfo } from 'common/types'
import { isStore } from 'common/storeCapabilities'

export const hasAnticheatInfo = (gameInfo: GameInfo) => {
  const [anticheatInfo, setAnticheatInfo] = useState<AntiCheatInfo | null>(null)

  useEffect(() => {
    const namespace = asStoreGame(gameInfo, 'legendary')?.namespace
    if (
      !isStore(gameInfo, 'sideload') &&
      gameInfo.title &&
      namespace !== undefined
    ) {
      window.api
        .getAnticheatInfo(namespace)
        .then((anticheatInfo: AntiCheatInfo | null) => {
          setAnticheatInfo(anticheatInfo)
        })
    }
  }, [gameInfo])

  return anticheatInfo
}
