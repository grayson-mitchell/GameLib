import { z } from 'zod'

/**
 * D-09: the trust-boundary validator for the CrossOver compatibility index —
 * a remotely-published (or bundled) payload that drives a user-facing claim
 * ("this game won't run"). Every bound here is a mitigation, not a nicety:
 * - `rating.int().min(1).max(5)` rejects poisoned/out-of-range medal values
 *   (T-19-01, T-19-04).
 * - `entries.min(1000)` rejects a truncated payload (T-19-04).
 * - `version: z.literal(1)` rejects a shape-drifted payload from a future
 *   incompatible publish.
 * Do NOT loosen any of these bounds — they are the mitigation, not styling.
 */
export const crossoverIndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z
    .array(
      z.object({
        name: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        steamid: z.string().optional()
      })
    )
    .min(1000)
})

export type CrossoverIndex = z.infer<typeof crossoverIndexSchema>
