/**
 * Quick 261029-sbi: the ONE validator every Metacritic score passes through
 * before it is stored or ranked. Three sources feed it, each loosely typed:
 *  - Steam PICS `appinfo.common.metacritic_score` (a numeric STRING, "90")
 *  - Steam appdetails `data.metacritic.score` (a number)
 *  - PCGamingWiki `GameScoreInfo.score` (a STRING)
 *
 * 0 means "no score", not a real score, so it is rejected along with anything
 * outside 1..100, non-integers and non-numeric input. Returns undefined for
 * "unknown"; never 0.
 */
export function parseMetacriticScore(raw: unknown): number | undefined {
  let n: number
  if (typeof raw === 'number') {
    n = raw
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!/^\d+$/.test(trimmed)) {
      return undefined
    }
    n = Number(trimmed)
  } else {
    return undefined
  }
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    return undefined
  }
  return n
}
