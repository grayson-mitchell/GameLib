import { thumbnailPalette } from 'frontend/customThemes/thumbnailPalette'

interface ThemeThumbnailProps {
  tokens: Readonly<Record<string, string>>
  base: string
  /** Accessible name. Without it the SVG is decorative (aria-hidden). */
  label?: string
}

const TILE_X = [44, 72, 100, 128] as const
const NAV_ROW_Y = [31, 41, 51] as const

/**
 * A mini-launcher drawn from a theme's own token values (THEME-01). Pure geometry in a 160x100
 * viewBox, no `<text>` (labels are bars), so there is no font dependency and nothing to translate.
 * The tab bar and sidebar paint from their own tokens, never assumed darker than the body.
 * i18n-gate-exempt: the string literals here are SVG geometry and attribute values, never rendered to a user
 */
export function ThemeThumbnail({ tokens, base, label }: ThemeThumbnailProps) {
  const p = thumbnailPalette(tokens, base)
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true, focusable: 'false' } as const)
  const buttons = [
    { fill: p.primary, label: p.primaryLabel, part: 'button-primary' },
    { fill: p.secondary, label: p.secondaryLabel, part: 'button-secondary' },
    { fill: p.success, label: p.successLabel, part: 'button-success' },
    { fill: p.danger, label: p.dangerLabel, part: 'button-danger' }
  ] as const

  return (
    <svg
      className="themeThumbnail"
      viewBox="0 0 160 100"
      preserveAspectRatio="xMidYMid meet"
      {...a11y}
    >
      <rect
        data-part="body"
        x="0"
        y="0"
        width="160"
        height="100"
        fill={p.body}
      />
      <rect
        data-part="tab-bar"
        x="0"
        y="0"
        width="160"
        height="14"
        fill={p.tabBar}
      />
      {[44, 66, 88].map((x) => (
        <rect
          key={x}
          data-part="tab-label"
          x={x}
          y="6.5"
          width="18"
          height="3"
          fill={p.inactiveLabel}
        />
      ))}
      <rect
        data-part="active-tab"
        x="8"
        y="3"
        width="30"
        height="11"
        fill={p.activeTab}
      />
      <rect
        data-part="active-tab-label"
        x="13"
        y="6.5"
        width="20"
        height="3"
        fill={p.activeLabel}
      />
      <rect
        data-part="sidebar"
        x="0"
        y="14"
        width="38"
        height="86"
        fill={p.sidebar}
      />
      <rect
        data-part="active-row"
        x="3"
        y="19"
        width="32"
        height="8"
        rx="2"
        fill={p.activeRow}
      />
      <rect x="6" y="21" width="4" height="4" fill={p.activeLabel} />
      <rect x="12" y="21.5" width="20" height="3" fill={p.activeLabel} />
      {NAV_ROW_Y.map((y) => (
        <g key={y} data-part="nav-row">
          <rect x="6" y={y + 2} width="4" height="4" fill={p.inactiveLabel} />
          <rect
            x="12"
            y={y + 2.5}
            width="20"
            height="3"
            fill={p.inactiveLabel}
          />
        </g>
      ))}
      <rect
        data-part="search"
        x="44"
        y="19"
        width="60"
        height="8"
        rx="2"
        fill={p.searchFill}
        stroke={p.searchStroke}
        strokeWidth="1"
      />
      {TILE_X.map((x) => (
        <g key={x} data-part="tile">
          <rect x={x} y="32" width="24" height="26" rx="2" fill={p.tile} />
          <path
            d={`M${x} 52h24v4a2 2 0 0 1-2 2h-20a2 2 0 0 1-2-2z`}
            fill={p.tileTitle}
          />
        </g>
      ))}
      {buttons.map((button, i) => (
        <g key={button.part} data-part={button.part}>
          <rect
            x={TILE_X[i]}
            y="66"
            width="24"
            height="9"
            rx="2"
            fill={button.fill}
          />
          <rect
            x={(TILE_X[i] ?? 0) + 6}
            y="69.5"
            width="12"
            height="2"
            fill={button.label}
          />
        </g>
      ))}
      <rect
        data-part="text"
        x="44"
        y="83"
        width="50"
        height="2"
        fill={p.text}
      />
      <rect
        data-part="text-secondary"
        x="44"
        y="88"
        width="34"
        height="2"
        fill={p.textSecondary}
      />
    </svg>
  )
}
