// Phase 45, plan 04. Pure, dependency-free w_metadata parser and
// w_download_manual-derived needs-GUI set (D-19, D-17). No React, no
// electron, no fs, no logger, no process spawning -- the backend (45-06) is
// the only caller that reads the script file from disk; this module only
// ever receives the script text as a string.

export type WinetricksVerbMetadata = {
  verb: string
  category: string
  title?: string
  publisher?: string
  year?: string
  media?: string
  conflicts?: string[]
  homepage?: string
}

// `w_metadata <verb> <category> \` -- the header line opening a block.
const METADATA_HEADER_RE = /^w_metadata\s+(\S+)\s+(\S+)/

// Exactly these field names, so `title_bg="..."` (a localized continuation
// line) never matches `title` (Pitfall 3 / D-19's exact-field requirement).
const FIELD_RE = /^\s+(title|publisher|year|media|conflicts|homepage)="([^"]*)"/

// `load_<verb>()` on its own line opens a function; its body runs until a
// `}` at column 0 (winetricks' own formatting convention -- confirmed
// against every load_<verb>() in the pinned script).
const LOAD_FUNCTION_RE = /^load_([A-Za-z0-9_]+)\(\)\s*$/

/**
 * Pure, single linear pass over `scriptText`'s lines. Returns per-verb
 * metadata in script (insertion) order. A block ends on the first line that
 * does not end with a trailing backslash; unknown or malformed lines inside
 * a block are skipped, never thrown on (D-19, T-45-13: anchored,
 * non-nested regexes only -- no catastrophic backtracking over an ~850 KB
 * script).
 */
export function parseWinetricksMetadata(
  scriptText: string
): Map<string, WinetricksVerbMetadata> {
  const result = new Map<string, WinetricksVerbMetadata>()
  const lines = scriptText.split(/\r?\n/)

  let current: WinetricksVerbMetadata | null = null
  let inBlock = false

  for (const line of lines) {
    if (inBlock && current) {
      const fieldMatch = FIELD_RE.exec(line)
      if (fieldMatch) {
        const [, field, value] = fieldMatch
        switch (field) {
          case 'conflicts':
            current.conflicts = value.split(/\s+/).filter(Boolean)
            break
          case 'title':
            current.title = value
            break
          case 'publisher':
            current.publisher = value
            break
          case 'year':
            current.year = value
            break
          case 'media':
            current.media = value
            break
          case 'homepage':
            current.homepage = value
            break
        }
      }
      if (!line.endsWith('\\')) {
        inBlock = false
        current = null
      }
      continue
    }

    const headerMatch = METADATA_HEADER_RE.exec(line)
    if (headerMatch) {
      const [, verb, category] = headerMatch
      current = { verb, category }
      result.set(verb, current)
      inBlock = line.endsWith('\\')
      if (!inBlock) {
        current = null
      }
    }
  }

  return result
}

/**
 * Derives the needs-GUI verb set exclusively from `w_download_manual` call
 * sites inside `load_<verb>()` bodies (D-17). Never reads the `media` field
 * (Pitfall 3: `gdiplus_winxp`/`protectionid` both set
 * `media="manual_download"` but call ordinary `w_download`).
 */
export function deriveNeedsGuiVerbs(scriptText: string): ReadonlySet<string> {
  const result = new Set<string>()
  const lines = scriptText.split(/\r?\n/)

  let currentFunction: string | null = null

  for (const line of lines) {
    const funcMatch = LOAD_FUNCTION_RE.exec(line)
    if (funcMatch) {
      currentFunction = funcMatch[1]
      continue
    }

    if (currentFunction !== null) {
      if (/^\s+w_download_manual\s/.test(line)) {
        result.add(currentFunction)
      }
      if (line === '}') {
        currentFunction = null
      }
    }
  }

  return result
}
