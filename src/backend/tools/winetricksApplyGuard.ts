import { WinetricksComponent } from 'common/types'
import { isVisibleVerb } from 'common/winetricks/visibility'
import { VERB_SHAPE_RE } from './winetricksListParse'

// Phase 45 Plan 01 (D-11, T-45-01/T-45-02): shape-and-membership guard for
// renderer-supplied `winetricksApply` verb lists, modeled on
// `assertCommandParts` (src/backend/sidecar/rendererPathGuard.ts). Unlike
// that guard, this one is NOT shape-only -- it also checks catalog
// membership, because a verb string with legal shape but absent from the
// real catalog (e.g. a stale/forged value) must never reach
// `Winetricks.install`. Plan 45-06 adds a visibility re-check (D-09/D-17) on
// the matched catalog entry.
export const WINETRICKS_APPLY_MAX_VERBS = 100

export class WinetricksApplyRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WinetricksApplyRejected'
  }
}

export function assertWinetricksApplyPayload(
  verbs: unknown,
  catalog: readonly WinetricksComponent[]
): string[] {
  if (!Array.isArray(verbs)) {
    throw new WinetricksApplyRejected(
      `winetricksApply: verbs must be an array, got ${typeof verbs}`
    )
  }
  if (verbs.length === 0) {
    throw new WinetricksApplyRejected(
      'winetricksApply: verbs must not be empty'
    )
  }
  if (verbs.length > WINETRICKS_APPLY_MAX_VERBS) {
    throw new WinetricksApplyRejected(
      `winetricksApply: verbs must not exceed ${WINETRICKS_APPLY_MAX_VERBS} entries, got ${verbs.length}`
    )
  }
  if (!verbs.every((verb) => typeof verb === 'string')) {
    throw new WinetricksApplyRejected(
      'winetricksApply: verbs must be an array of strings'
    )
  }

  const verbStrings: string[] = verbs
  if (!verbStrings.every((verb) => VERB_SHAPE_RE.test(verb))) {
    throw new WinetricksApplyRejected(
      'winetricksApply: verbs must match the winetricks verb shape'
    )
  }

  const catalogByVerb = new Map(
    catalog.map((component) => [component.verb, component])
  )
  if (!verbStrings.every((verb) => catalogByVerb.has(verb))) {
    throw new WinetricksApplyRejected(
      'winetricksApply: verbs must be present in the catalog'
    )
  }

  // D-09/D-17, T-45-16: `listAvailable` already returns only visible verbs;
  // re-check the matched entry anyway so a stale or unfiltered catalog (an
  // older cache, a test double) can never smuggle `annihilate`, an app, a
  // benchmark or a needs-GUI verb through to `Winetricks.install`.
  const hidden = verbStrings.filter((verb) => {
    const entry = catalogByVerb.get(verb)
    return entry === undefined || !isVisibleVerb(entry)
  })
  if (hidden.length > 0) {
    throw new WinetricksApplyRejected(
      'winetricksApply: verbs must be installable (hidden verbs are refused)'
    )
  }

  // Dedupe keeping first-occurrence order (T-45-02's `['xact','xact','corefonts']`
  // -> `['xact','corefonts']` case).
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const verb of verbStrings) {
    if (!seen.has(verb)) {
      seen.add(verb)
      deduped.push(verb)
    }
  }
  return deduped
}
