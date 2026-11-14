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
  notes?: string[]
}

/**
 * Quick task 261113-8m6: compact "Steam route" row shared by the game page
 * Install info and the install dialog. One line: the route label, then on an
 * issue (or any limited-feature note) an icon-only warning glyph whose
 * tooltip carries the short issue, the full reason, at most SYMBOL_CAP
 * missing symbols and the notes.
 */
const SteamBridgeRouteSummary = ({
  routeKey,
  reasonKey,
  reasonParams,
  missingSymbols,
  notes = []
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

  if (!issue && notes.length === 0) {
    return (
      <>
        {heading}
        <span className="steamBridgeRouteLabel" title={reason ?? undefined}>
          {routeLabel}
        </span>
      </>
    )
  }

  const badgeText = !issue
    ? null
    : issue.kind === 'notCovered'
      ? t('steam.bridge.route.issue.notCovered', {
          count: issue.count,
          defaultValue: '{{count}} Steam calls not covered'
        })
      : t(`steam.bridge.route.issue.${issue.kind}`)
  const { shown, hiddenCount } = capSymbols(missingSymbols)

  const tooltip = (
    <div className="steamBridgeIssueTooltip">
      {badgeText && <b>{badgeText}</b>}
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
      {notes.map((n) => (
        <div key={n}>{n}</div>
      ))}
    </div>
  )
  const ariaLabel = [badgeText, reason, ...notes].filter(Boolean).join('. ')

  return (
    <>
      {heading}
      <span className="steamBridgeRouteLabel">{routeLabel}</span>
      <Tooltip title={tooltip} arrow placement="top">
        <span
          className="steamBridgeIssueBadge"
          tabIndex={0}
          role="img"
          aria-label={ariaLabel}
        >
          <WarningAmber fontSize="inherit" />
        </span>
      </Tooltip>
    </>
  )
}

export default SteamBridgeRouteSummary
