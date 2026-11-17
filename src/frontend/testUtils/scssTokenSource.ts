/**
 * fs-free SCSS block parsers shared by the theme-token test and the token
 * generator (D-16: one source of truth). Every function takes an already
 * comment-stripped source string and returns plain data; callers do the file
 * read and the comment strip, so these stay usable under `meta/runTs.cjs`.
 *
 * Imports in this file must stay relative or absent: `meta/runTs.cjs` does
 * not honour the tsconfig `baseUrl`.
 */

/**
 * Returns the declaration body of the FIRST top-level rule whose selector
 * matches exactly, e.g. `.Header`. Brace-counted rather than
 * regex-terminated so a nested block cannot end the match early.
 */
export function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

/** Top-level `--x: value;` pairs of a block body, ignoring nested rules. */
export const customProps = (blockBody: string): Map<string, string> => {
  const out = new Map<string, string>()
  let depth = 0
  let buf = ''
  for (const ch of blockBody) {
    if (ch === '{') {
      depth++
      buf = ''
    } else if (ch === '}') {
      depth--
      buf = ''
    } else if (ch === ';' && depth === 0) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buf)
      const name = m?.[1]
      const value = m?.[2]
      if (name !== undefined && value !== undefined)
        out.set(name, value.trim().replace(/\s+/g, ' '))
      buf = ''
    } else {
      buf += ch
    }
  }
  return out
}

/**
 * Every block matching `selector`, in source order. Matching the literal
 * `selector {` is what excludes descendant rules such as
 * `body.zombie .alphabet-filter-button--active {`, which would otherwise
 * false-match a prefix search for `body.zombie`.
 */
export const allBlocksFor = (source: string, selector: string): string[] => {
  const needle = `${selector} {`
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) break
    let depth = 0
    let i = source.indexOf('{', start)
    const open = i
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) break
    }
    if (depth !== 0) throw new Error(`unterminated block for ${selector}`)
    out.push(source.slice(open + 1, i))
    from = i
  }
  if (out.length === 0) throw new Error(`selector ${selector} not found`)
  return out
}

/**
 * Global tokens (`--neutral-*`, `--brand-*`) live in `styles/_colors.scss`,
 * NOT in themes.scss. First declaration wins.
 */
export const globalTokensFrom = (colorsScss: string): Map<string, string> => {
  const out = new Map<string, string>()
  for (const m of colorsScss.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    const name = m[1]
    const value = m[2]
    if (name !== undefined && value !== undefined && !out.has(name))
      out.set(name, value.trim())
  }
  return out
}

/**
 * A theme's tokens: the base `body` block, then every `selector` block,
 * last declaration wins.
 */
export const themeTokensFrom = (
  themesScss: string,
  selector: string
): Map<string, string> => {
  const merged = new Map(customProps(cssBlock(themesScss, 'body')))
  for (const body of allBlocksFor(themesScss, selector))
    for (const [k, v] of customProps(body)) merged.set(k, v)
  return merged
}
