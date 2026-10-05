/** RED-phase stub: signatures only, no behaviour yet. */
export interface TrackMeasurement {
  clientWidth: number
  scrollWidth: number
  scrollLeft: number
}

export const pageScrollDelta = (
  _m: TrackMeasurement,
  _cardPitch: number
): number => 0

export const canScrollForward = (_m: TrackMeasurement): boolean => false

export const canScrollBack = (_m: TrackMeasurement): boolean => false

export const scrollFocusedCardIntoViewHorizontally = (_ev: FocusEvent): void =>
  undefined
