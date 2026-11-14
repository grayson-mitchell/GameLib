import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { Speed } from '@mui/icons-material'
import HowLongToBeat from 'frontend/components/UI/WikiGameInfo/components/HowLongToBeat'

const HLTB = () => {
  const { t } = useTranslation('gamepage')
  const { wikiInfo } = useContext(GameContext)

  const howlongtobeat = wikiInfo?.howlongtobeat

  if (!howlongtobeat) {
    return null
  }

  return (
    <div className="hltbWrapper">
      <div className="hltbHeader">
        <Speed />
        <b>{t('howLongToBeat', 'How Long To Beat')}</b>
      </div>
      <HowLongToBeat info={howlongtobeat} />
    </div>
  )
}

export default HLTB
