import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GameInfo } from 'common/types'
import { FactRow } from './InstallTab/FactRow'

interface Props {
  gameInfo: GameInfo
}

/**
 * Maps an InstallPlatform string to a FontAwesome brand icon + title,
 * case-insensitively. Returns null for values with no known icon so the
 * caller can fall back to raw text (e.g. any future/unexpected values).
 * The mac check runs before the win check so 'darwin' (which contains 'win')
 * maps to macOS.
 */
export const getInstallPlatformIcon = (installPlatform: string | undefined) => {
  const value = (installPlatform ?? '').toLowerCase()
  if (
    value === 'osx' ||
    value === 'mac' ||
    value === 'darwin' ||
    value.includes('mac')
  ) {
    return { icon: faApple, title: 'macOS' }
  }
  if (value.includes('win')) {
    return { icon: faWindows, title: 'Windows' }
  }
  if (value.includes('linux')) {
    return { icon: faLinux, title: 'Linux' }
  }
  return null
}

/**
 * DETAIL-01: shows the OS platforms a game supports as small glyphs, as the
 * Platforms fact of the Install tab (Phase 100, D-05). Runner-agnostic — reads the generic GameInfo platform flags.
 * Windows is the implicit baseline (always shown); Apple/Linux are conditional
 * on the native flags (populated by Steam metadata capture + upstream runners).
 * The installed platform, when any, is outlined in the theme accent colour.
 */
const PlatformSupport = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')

  const entries: { key: string; node: JSX.Element }[] = [
    {
      key: 'Windows',
      node: <FontAwesomeIcon icon={faWindows} title="Windows" />
    }
  ]
  if (gameInfo.is_mac_native) {
    entries.push({
      key: 'macOS',
      node: <FontAwesomeIcon icon={faApple} title="macOS" />
    })
  }
  if (gameInfo.is_linux_native) {
    entries.push({
      key: 'Linux',
      node: <FontAwesomeIcon icon={faLinux} title="Linux" />
    })
  }

  if (gameInfo.is_installed) {
    const rawPlatform = gameInfo.install.platform
    const known = getInstallPlatformIcon(rawPlatform)
    const name = known?.title ?? rawPlatform
    if (name) {
      const label = `${name} ${t('info.installedPlatformSuffix', '(installed)')}`
      const boxIt = (inner: JSX.Element | string) => (
        <span
          className="platformSupport__icon platformSupport__icon--installed"
          title={label}
          aria-label={label}
          role="img"
        >
          {inner}
        </span>
      )
      const idx = entries.findIndex((e) => e.key === name)
      if (idx >= 0) {
        const existing = entries[idx]
        if (existing) entries[idx] = { key: name, node: boxIt(existing.node) }
      } else {
        entries.push({
          key: name,
          node: boxIt(
            known ? (
              <FontAwesomeIcon icon={known.icon} title={known.title} />
            ) : (
              name
            )
          )
        })
      }
    }
  }

  return (
    <FactRow label={t('gamelib:gamepage.installTab.platforms', 'Platforms')}>
      <span className="platformSupport__icons">
        {entries.map((e) => (
          <Fragment key={e.key}>{e.node}</Fragment>
        ))}
      </span>
    </FactRow>
  )
}

export default PlatformSupport
