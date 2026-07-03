import { useTranslation } from 'react-i18next'
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

/**
 * DETAIL-01: shows the OS platforms a game supports as small glyphs, inside the
 * Install-info tab. Runner-agnostic — reads the generic GameInfo platform flags.
 * Windows is the implicit baseline (always shown); Apple/Linux are conditional
 * on the native flags (populated by Steam metadata capture + upstream runners).
 */
const PlatformSupport = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')

  return (
    <div className="platformSupport">
      <b>{t('info.supportedPlatforms', 'Supported platforms')}:</b>
      <span className="platformSupport__icons">
        <FontAwesomeIcon icon={faWindows} title="Windows" />
        {gameInfo.is_mac_native && (
          <FontAwesomeIcon icon={faApple} title="macOS" />
        )}
        {gameInfo.is_linux_native && (
          <FontAwesomeIcon icon={faLinux} title="Linux" />
        )}
      </span>
    </div>
  )
}

export default PlatformSupport
