import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { checkFloors } from 'frontend/customThemes/contrastFloors'
import { CORE_TOKEN_GROUPS } from 'frontend/customThemes/tokens'
import { TokenRow } from './TokenRow'
import { resolveGroupLabel } from './tokenLabels'

interface TokenListProps {
  draft: Readonly<Record<string, string>>
  onCommit: (token: string, value: string) => void
}

export function TokenList({ draft, onCommit }: TokenListProps) {
  const { t } = useTranslation()
  // Live contrast warnings (D-15): recomputed from the draft, three pairs at most per render.
  const failures = useMemo(() => checkFloors(draft), [draft])
  return (
    <div className="themeEditor__tokens">
      {CORE_TOKEN_GROUPS.map((group) => (
        <section key={group.id} className="themeEditor__group">
          <h2 className="themeEditor__groupHeading">
            {resolveGroupLabel(group.id, t)}
          </h2>
          {group.tokens.map((token) => (
            <TokenRow
              key={token}
              token={token}
              value={draft[token] ?? ''}
              onCommit={onCommit}
              failures={failures.filter(
                (f) => f.fg === token || f.bg === token
              )}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
