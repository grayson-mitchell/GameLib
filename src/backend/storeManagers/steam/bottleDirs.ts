/**
 * Bottle-directory helpers for the Steam bottle modules that have no deps bundle in scope
 * (bottle.ts and bridgeBottle.ts expose module-level functions with dozens of external callers).
 *
 * engine/bottlePrimitives takes its `userHome` from the caller (66.4-05); these two bind it to the
 * process home once. Retired when those modules are threaded onto `ctx.paths` (see the 66.4-05
 * SUMMARY, deferred items). Nothing runs at import: no timer, no I/O.
 */
import { userHome } from 'backend/constants/paths'
import {
  getBottleDir as getBottleDirIn,
  isBottleProvisioned as isBottleProvisionedIn
} from 'backend/engine/bottlePrimitives'

export const getBottleDir = (bottleName: string): string =>
  getBottleDirIn({ userHome }, bottleName)

export const isBottleProvisioned = (bottleName: string): boolean =>
  isBottleProvisionedIn({ userHome }, bottleName)
