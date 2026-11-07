/**
 * The channel -> schema map the sidecar validates against (Phase 67). Each conversion plan adds
 * its domain's `defineChannelEntries(...)` part to the `mergeChannelEntries` call below.
 */
import type { ChannelEntry } from './schemaTypes'

export function mergeChannelEntries(
  ...parts: Record<string, ChannelEntry>[]
): Record<string, ChannelEntry> {
  const out: Record<string, ChannelEntry> = {}
  for (const part of parts) {
    for (const [name, entry] of Object.entries(part)) {
      if (Object.prototype.hasOwnProperty.call(out, name)) {
        throw new Error(`duplicate channel schema: ${name}`)
      }
      out[name] = entry
    }
  }
  return out
}

export const channelSchemas: Readonly<Record<string, ChannelEntry>> =
  mergeChannelEntries()
