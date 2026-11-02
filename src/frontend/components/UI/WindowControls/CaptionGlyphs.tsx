// Caption-button glyphs drawn on a 10x10 box with 1px strokes, modelled on the
// Segoe Fluent Icons Chrome* glyphs Windows 11 draws at 10px. Half-unit
// coordinates keep the 1px strokes on pixel rows at 100% scale. These are
// plain <svg> elements, not MUI SvgIcon, because SvgIcon forces a 24-unit box
// and a 1.5rem size. The buttons carry a `title`, so the glyphs are decorative.

const svgProps = {
  width: 10,
  height: 10,
  viewBox: '0 0 10 10',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1,
  'aria-hidden': 'true'
} as const

export function MinimizeGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M0 5.5H10" />
    </svg>
  )
}

export function MaximizeGlyph() {
  return (
    <svg {...svgProps}>
      <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
    </svg>
  )
}

export function RestoreGlyph() {
  return (
    <svg {...svgProps}>
      <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
      <path d="M2.5 2.5V1.5A1 1 0 0 1 3.5 0.5H8.5A1 1 0 0 1 9.5 1.5V6.5A1 1 0 0 1 8.5 7.5H7.5" />
    </svg>
  )
}

export function CloseGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" />
    </svg>
  )
}
