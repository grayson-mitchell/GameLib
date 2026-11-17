// RED stub: signatures only (replaced in GREEN).
export interface ContrastFloor {
  readonly id: string
  readonly fg: string
  readonly bg: string
  readonly min: number
}

export interface FloorFailure {
  id: string
  fg: string
  bg: string
  min: number
  ratio: number
}

export const CONTRAST_FLOORS: readonly ContrastFloor[] = []

export function checkFloors(
  _tokens: Readonly<Record<string, string>>,
  _floors: readonly ContrastFloor[] = CONTRAST_FLOORS
): FloorFailure[] {
  return []
}
