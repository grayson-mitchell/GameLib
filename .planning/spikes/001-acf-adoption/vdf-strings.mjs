/**
 * Minimal string-preserving VDF parser.
 *
 * WHY THIS EXISTS — this is the single most important finding of spike 001:
 *
 *   @node-steam/vdf's parse() coerces numeric-looking values to JS Number.
 *   Depot manifest GIDs and SteamID64s are 64-bit and exceed
 *   Number.MAX_SAFE_INTEGER (2^53-1), so they are silently rounded:
 *
 *     manifest  3306037234848478854 → 3306037234848478700   (off by 154)
 *     LastOwner   76561197995867096 →   76561197995867100   (off by 4)
 *
 *   Writing a corrupted manifest GID into an appmanifest tells Steam the
 *   installed content is a different build than it actually is. Steam then
 *   force-redownloads or corrupts the entry — the exact "broken and lost
 *   install" failure this feature exists to eliminate.
 *
 * RULE FOR THE REAL IMPLEMENTATION: 64-bit IDs are STRINGS, end to end.
 * Never let them touch a JS Number. Do not use @node-steam/vdf.parse() on any
 * VDF containing a manifest GID or a SteamID64.
 */

export function parseVdfStrings(text) {
  let i = 0

  function skipWs() {
    while (i < text.length) {
      const c = text[i]
      if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++
      } else if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++
      } else break
    }
  }

  function readToken() {
    skipWs()
    if (i >= text.length) return null
    if (text[i] === '{' || text[i] === '}') return text[i++]
    if (text[i] !== '"') throw new Error(`Unexpected char at ${i}: ${text[i]}`)
    i++ // opening quote
    let out = ''
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') {
        i++
        const esc = text[i++]
        out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc
      } else {
        out += text[i++]
      }
    }
    i++ // closing quote
    return { str: out }
  }

  function parseObject() {
    const obj = {}
    for (;;) {
      const key = readToken()
      if (key === null || key === '}') return obj
      if (typeof key === 'string') throw new Error(`Unexpected "${key}" where key expected`)
      const next = readToken()
      if (next === '{') obj[key.str] = parseObject()
      else if (next && typeof next === 'object') obj[key.str] = next.str // ALWAYS a string
      else throw new Error(`Unexpected value for key ${key.str}`)
    }
  }

  const root = readToken()
  if (!root || typeof root === 'string') throw new Error('Malformed VDF: no root key')
  const brace = readToken()
  if (brace !== '{') throw new Error('Malformed VDF: root not an object')
  return { [root.str]: parseObject() }
}

/** Serialize back to Steam's tab-indented, quoted VDF form. */
export function renderVdf(obj, indent = 0) {
  const pad = '\t'.repeat(indent)
  let out = ''
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      out += `${pad}"${k}"\n${pad}{\n${renderVdf(v, indent + 1)}${pad}}\n`
    } else {
      out += `${pad}"${k}"\t\t"${v}"\n`
    }
  }
  return out
}
