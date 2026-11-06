import { useContext } from 'react'
import { hasCapability } from 'common/storeCapabilities'
import GameContext from '../../GameContext'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

const Developer = ({ gameInfo }: Props) => {
  const { runner } = useContext(GameContext)

  if (!hasCapability(runner, 'hasStoreCatalog')) {
    return null
  }

  return <div className="developer">{gameInfo.developer}</div>
}

export default Developer
