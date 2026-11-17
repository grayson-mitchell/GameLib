/**
 * The single contrast floor table and checker (D-16): the CI theme test and
 * the theme editor's live warnings both read it, so a floor value has one
 * source of truth. Only the three pure token pairs the 10 built-in themes
 * are measured against (WCAG 2.2 SC 1.4.11, 3:1 non-text). There is
 * deliberately no 4.5:1 text floor. Relative imports only: `meta/runTs.cjs`
 * does not honour the tsconfig `baseUrl`.
 */
import { tryContrast } from './colour'

export interface ContrastFloor {
  readonly id: string
  /** Foreground token name, e.g. `--border-color`. */
  readonly fg: string
  /** Background token name, e.g. `--body-background`. */
  readonly bg: string
  /** Minimum WCAG contrast ratio. */
  readonly min: number
}

export interface FloorFailure {
  id: string
  fg: string
  bg: string
  min: number
  ratio: number
}

export const CONTRAST_FLOORS: readonly ContrastFloor[] = [
  { id: 'border-body', fg: '--border-color', bg: '--body-background', min: 3 },
  {
    id: 'border-modal',
    fg: '--border-color',
    bg: '--modal-background',
    min: 3
  },
  { id: 'accent-body', fg: '--accent', bg: '--body-background', min: 3 }
]

/**
 * Floors the resolved `tokens` fail. A pair with a missing, unparseable or
 * fully transparent side is skipped (never a failure, never a throw), and a
 * ratio exactly equal to the minimum passes: only `ratio < min` fails.
 */
export function checkFloors(
  tokens: Readonly<Record<string, string>>,
  floors: readonly ContrastFloor[] = CONTRAST_FLOORS
): FloorFailure[] {
  const failures: FloorFailure[] = []
  for (const { id, fg, bg, min } of floors) {
    const ratio = tryContrast(tokens[fg], tokens[bg])
    if (ratio !== null && ratio < min) failures.push({ id, fg, bg, min, ratio })
  }
  return failures
}
