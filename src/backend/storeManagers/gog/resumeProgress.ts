// gogdl resumes a paused download correctly (the second run logs "Attempting
// to continue the download" and its Progress total shrinks by exactly the
// bytes already written), but it reports progress against the REMAINING bytes
// only, so a resumed download's percent restarts at 0. We remember the largest
// total seen per game and fold the already-completed bytes back in.

const PROGRESS_RE = /Progress: (\d+\.\d+) (\d+)\/(\d+)/m

export function parseGogdlProgress(
  data: string
): { percent: number; done: number; total: number } | undefined {
  const match = PROGRESS_RE.exec(data)
  if (!match) return undefined
  return {
    percent: Number(match[1]),
    done: Number(match[2]),
    total: Number(match[3])
  }
}

export interface GogResumeBaselines {
  /** Percent of the whole download, accounting for bytes finished before a pause. */
  resumeAdjustedPercent(
    appName: string,
    progress: { percent: number; done: number; total: number }
  ): number
  clearResumeBaseline(appName: string): void
}

export function createGogResumeBaselines(): GogResumeBaselines {
  const baselineTotals = new Map<string, number>()
  return {
    resumeAdjustedPercent(appName, progress) {
      const known = baselineTotals.get(appName) ?? 0
      const baseline = Math.max(known, progress.total)
      baselineTotals.set(appName, baseline)
      if (progress.total <= 0 || baseline <= progress.total) {
        return progress.percent
      }
      const offset = baseline - progress.total
      return Math.round(((offset + progress.done) / baseline) * 10000) / 100
    },
    clearResumeBaseline(appName) {
      baselineTotals.delete(appName)
    }
  }
}
