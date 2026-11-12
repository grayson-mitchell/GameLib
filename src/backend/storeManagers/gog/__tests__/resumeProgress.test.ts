import { createGogResumeBaselines, parseGogdlProgress } from '../resumeProgress'

const line = (pct: string, done: number, total: number) =>
  `[PROGRESS] INFO: = Progress: ${pct} ${done}/${total}, Running for: 00:00:01, ETA: 00:00:00`

describe('gogdl resumed-download progress', () => {
  let baselines = createGogResumeBaselines()
  beforeEach(() => {
    baselines = createGogResumeBaselines()
  })
  const resumeAdjustedPercent = (
    ...args: Parameters<typeof baselines.resumeAdjustedPercent>
  ) => baselines.resumeAdjustedPercent(...args)

  test('parses percent, done and total', () => {
    expect(parseGogdlProgress(line('4.35', 18221309, 419050577))).toEqual({
      percent: 4.35,
      done: 18221309,
      total: 419050577
    })
  })

  test('first run is passed through unchanged', () => {
    const p = parseGogdlProgress(line('1.58', 6741368, 425791945))!
    expect(resumeAdjustedPercent('g', p)).toBe(1.58)
  })

  test('resumed run counts bytes finished before the pause', () => {
    resumeAdjustedPercent('g', {
      percent: 1.58,
      done: 6741368,
      total: 425791945
    })
    // resumed: total shrank by exactly the 6741368 bytes already written
    const resumedStart = parseGogdlProgress(line('0.00', 0, 419050577))!
    expect(resumeAdjustedPercent('g', resumedStart)).toBe(1.58)
    const later = parseGogdlProgress(line('50.00', 209525288, 419050577))!
    expect(resumeAdjustedPercent('g', later)).toBeCloseTo(50.79, 1)
  })
})
