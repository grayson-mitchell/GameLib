import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import type { WinetricksEnvironmentReport } from 'common/types'
import './index.scss'

type Props = {
  environment: WinetricksEnvironmentReport
  // Node's `process.platform` as the app context reports it.
  platform: string
}

// D-16 / UI-SPEC E2: one persistent, informational row per environment
// warning, at the top of the tab. Deliberately NOT styled as a warning or an
// error (the facts here are expected and harmless to the user), has no dismiss
// control and never auto-dismisses. With nothing to report it renders nothing:
// no placeholder row and no reserved height.
//
// A-45-05: the unsupported-wine row names "GameLib's macOS compatibility
// layer", which is false anywhere but macOS, so it renders on darwin only. The
// missing-dependencies row renders on every platform.
export default function EnvironmentBanner({ environment, platform }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')

  const messages: string[] = []
  if (platform === 'darwin' && environment.unsupportedWineVersion) {
    messages.push(
      tGamelib('winetricksBrowse.environmentBannerGptk', {
        version: environment.unsupportedWineVersion,
        defaultValue:
          "Wine {{version}}, used by GameLib's macOS compatibility layer, is unsupported upstream. This is expected here and can be ignored."
      })
    )
  }
  if (environment.missingDependencies.length > 0) {
    messages.push(
      tGamelib('winetricksBrowse.environmentBannerMissingDeps', {
        tools: environment.missingDependencies.join(', '),
        defaultValue:
          'Missing: {{tools}}. Install them to use every component below.'
      })
    )
  }

  if (messages.length === 0) {
    return null
  }

  return (
    <div className="WinetricksEnvironmentBanner">
      {messages.map((message, index) => (
        <div key={index} className="WinetricksEnvironmentBanner__row">
          <FontAwesomeIcon
            icon={faCircleInfo}
            className="WinetricksEnvironmentBanner__icon"
          />
          <span className="WinetricksEnvironmentBanner__text">{message}</span>
        </div>
      ))}
    </div>
  )
}
