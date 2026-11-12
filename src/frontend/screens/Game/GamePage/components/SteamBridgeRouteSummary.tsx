import { Tooltip } from '@mui/material'
import WarningAmber from '@mui/icons-material/WarningAmber'
import { useTranslation } from 'react-i18next'
import { capSymbols, resolveBridgeRouteIssue } from './steamBridgeRouteIssue'
import './SteamBridgeRouteSummary.scss'

interface Props {
  routeKey: 'native' | 'bottled'
  reasonKey: string | null
  reasonParams: Record<string, string>
  missingSymbols: string[]
}

/**
 * Quick task 261113-8m6: compact "Steam route" row shared by the game page
 * Install info and the install dialog. Short label as text; on an issue, a
 * warning badge whose tooltip carries the full reason and at most
 * SYMBOL_CAP missing symbols.
 */
const SteamBridgeRouteSummary = ({
  routeKey,
  reasonKey,
  reasonParams,
  missingSymbols
}: Props) => {
  const { t } = useTranslation('gamelib')

  const routeLabel =
    routeKey === 'native'
      ? t('steam.bridge.route.native', 'Native Steam bridge')
      : t('steam.bridge.route.bottled', 'Bottled Steam client')
  const reason = reasonKey
    ? t(reasonKey, {
        reason: reasonParams.reasonKey ? t(reasonParams.reasonKey) : undefined
      })
    : null
  const issue = resolveBridgeRouteIssue({ reasonKey, missingSymbols })

  const heading = (
    <b>
      {t('steam.bridge.route.label', 'Steam route')}
      {': '}
    </b>
  )

  if (!issue) {
    return (
      <>
        {heading}
        <span className="steamBridgeRouteLabel" title={reason ?? undefined}>
          {routeLabel}
        </span>
      </>
    )
  }

  const badgeText =
    issue.kind === 'notCovered'
      ? t('steam.bridge.route.issue.notCovered', {
          count: issue.count,
          defaultValue: '{{count}} Steam calls not covered'
        })
      : t(`steam.bridge.route.issue.${issue.kind}`)
  const { shown, hiddenCount } = capSymbols(missingSymbols)

  const tooltip = (
    <div className="steamBridgeIssueTooltip">
      {reason && <div>{reason}</div>}
      {shown.length > 0 && (
        <>
          <div>{t('steam.bridge.route.notCoveredHeading', 'Not covered:')}</div>
          <ul>
            {shown.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <div>
              {t('steam.bridge.route.moreSymbols', { count: hiddenCount })}
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <>
      {heading}
      <span className="steamBridgeRouteLabel">{routeLabel}</span>
      <Tooltip title={tooltip} arrow placement="top">
        <span
          className="steamBridgeIssueBadge"
          tabIndex={0}
          aria-label={reason ? `${badgeText}. ${reason}` : badgeText}
        >
          <WarningAmber fontSize="inherit" />
          {badgeText}
        </span>
      </Tooltip>
    </>
  )
}

export default SteamBridgeRouteSummary
