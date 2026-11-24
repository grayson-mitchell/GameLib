/**
 * The incident-title census (88-04, D-14, D-15).
 *
 * D-14 names the TS tests that pin real incidents (`knownFixesRegistry.test.ts` and the like) and
 * asks that none be dropped by the port. `tsTestTitles` reads every `it(` / `test(` title of such
 * a file, prefixed by its enclosing `describe` titles joined with " > ", and
 * `assertCasesCoverTitles` fails unless each title is either a golden case id (`slug(title)`) or
 * listed in an explicit not-ported table with a reason. A source-text gate test (D-15) goes in
 * that table with the reason "source-text gate, dropped per D-15". An empty title list fails: a
 * census that scanned nothing proves nothing. A not-ported entry that names no title also fails,
 * so a renamed test cannot leave a stale exclusion that hides a dropped one.
 *
 * The scanner is a small lexer, not a parser: it skips comments, string and template literals
 * and regex literals, counts braces to know where a `describe` body ends, and reads the title of
 * `it`, `test` and `describe` calls including the `.skip`, `.only`, `.todo` and `.each(...)(...)`
 * spellings (an `.each` title is returned verbatim, `%s` and all). A title that is not a string
 * or template literal throws rather than being skipped.
 */
import { readFileSync } from 'fs'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/** `Keeps a Valid entry, warns!` becomes `keeps-a-valid-entry-warns`. */
export const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const CALL_WORDS: Readonly<Record<string, 'describe' | 'test'>> = {
  describe: 'describe',
  xdescribe: 'describe',
  fdescribe: 'describe',
  it: 'test',
  xit: 'test',
  fit: 'test',
  test: 'test',
  xtest: 'test'
}
const MODIFIERS = new Set(['skip', 'only', 'todo', 'concurrent', 'failing'])
/** A `/` after one of these starts a regex literal; after anything else it divides. */
const REGEX_AFTER = '(,=:[!&|?{};+-*%<>~^'
const isWordChar = (c: string | undefined): boolean =>
  c !== undefined && /[\w$]/.test(c)

const unescape = (raw: string): string =>
  raw.replace(/\\([\s\S])/g, (_all, c: string) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c
  )

/** Index just past the quoted string starting at `i`, and its decoded text. */
function readQuoted(src: string, i: number): { text: string; end: number } {
  const quote = src.charAt(i)
  let j = i + 1
  while (j < src.length && src.charAt(j) !== quote) {
    j += src.charAt(j) === '\\' ? 2 : 1
  }
  return { text: unescape(src.slice(i + 1, j)), end: j + 1 }
}

/** Index just past the template literal at `i`, and its raw text (`${...}` kept as written). */
function readTemplate(src: string, i: number): { text: string; end: number } {
  let j = i + 1
  while (j < src.length && src.charAt(j) !== '`') {
    if (src.charAt(j) === '\\') {
      j += 2
    } else if (src.startsWith('${', j)) {
      j = skipBalanced(src, j + 1, '{', '}')
    } else {
      j++
    }
  }
  return { text: src.slice(i + 1, j), end: j + 1 }
}

/**
 * The end of the comment, string, template or regex literal starting at `i`, or `null` when `i`
 * starts none of them. `prev` is the last significant character before `i`.
 */
function skipNonCode(src: string, i: number, prev: string): number | null {
  const c = src.charAt(i)
  if (src.startsWith('//', i)) {
    const nl = src.indexOf('\n', i)
    return nl === -1 ? src.length : nl
  }
  if (src.startsWith('/*', i)) {
    const close = src.indexOf('*/', i + 2)
    return close === -1 ? src.length : close + 2
  }
  if (c === "'" || c === '"') return readQuoted(src, i).end
  if (c === '`') return readTemplate(src, i).end
  if (c === '/' && (prev === '' || REGEX_AFTER.includes(prev))) {
    let j = i + 1
    let inClass = false
    while (j < src.length) {
      const d = src.charAt(j)
      if (d === '\n') return null
      if (d === '\\') {
        j += 2
        continue
      }
      if (d === '[') inClass = true
      else if (d === ']') inClass = false
      else if (d === '/' && !inClass) break
      j++
    }
    if (j >= src.length) return null
    j++
    while (/[a-z]/i.test(src.charAt(j))) j++
    return j
  }
  return null
}

/** The index just past the bracket matching the `open` at `i`, skipping literals and comments. */
function skipBalanced(
  src: string,
  i: number,
  open: string,
  close: string
): number {
  let depth = 0
  let prev = ''
  let j = i
  while (j < src.length) {
    const skipped = skipNonCode(src, j, prev)
    if (skipped !== null) {
      j = skipped
      prev = '"'
      continue
    }
    const c = src.charAt(j)
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return j + 1
    }
    if (!/\s/.test(c)) prev = c
    j++
  }
  return src.length
}

const skipSpace = (src: string, i: number): number => {
  let j = i
  while (j < src.length && /\s/.test(src.charAt(j))) j++
  return j
}

interface Call {
  kind: 'describe' | 'test'
  title: string
  end: number
}

/**
 * Reads `.skip` / `.each(...)` modifiers, the `(` and the title literal after the word that ends
 * at `wordEnd`. `null` means this is not a call of the test API (a property, a variable). A call
 * whose first argument is not a string or template literal throws.
 */
function readCall(src: string, word: string, wordEnd: number): Call | null {
  const kind = CALL_WORDS[word]
  if (kind === undefined) return null
  let j = wordEnd
  for (;;) {
    if (src.charAt(j) !== '.') break
    const m = /^\.(\w+)/.exec(src.slice(j))
    const name = m?.[1]
    if (m === null || name === undefined) return null
    if (name === 'each') {
      j = skipSpace(src, j + m[0].length)
      if (src.charAt(j) === '(') j = skipBalanced(src, j, '(', ')')
      else if (src.charAt(j) === '`') j = readTemplate(src, j).end
      else return null
      break
    }
    if (!MODIFIERS.has(name)) return null
    j += m[0].length
  }
  j = skipSpace(src, j)
  if (src.charAt(j) !== '(') return null
  j = skipSpace(src, j + 1)
  const c = src.charAt(j)
  if (c === "'" || c === '"') {
    const { text, end } = readQuoted(src, j)
    return { kind, title: text, end }
  }
  if (c === '`') {
    const { text, end } = readTemplate(src, j)
    return { kind, title: text, end }
  }
  throw new Error(
    `tsTestTitles: the title of ${word}(...) is not a string literal, near "${src.slice(j, j + 40)}"`
  )
}

/** Every `it(` / `test(` title of the file, in source order, prefixed by its `describe`s. */
export function tsTestTitles(path: string): string[] {
  const src = stripSourceComments(readFileSync(path, 'utf8'))
  const titles: string[] = []
  const stack: { title: string; depth: number }[] = []
  let depth = 0
  let pending: string | null = null
  let prev = ''
  let i = 0
  while (i < src.length) {
    const skipped = skipNonCode(src, i, prev)
    if (skipped !== null) {
      i = skipped
      prev = '"'
      continue
    }
    const c = src.charAt(i)
    if (/[A-Za-z_$]/.test(c) && !isWordChar(src[i - 1]) && src[i - 1] !== '.') {
      let end = i
      while (isWordChar(src[end])) end++
      const word = src.slice(i, end)
      const call = readCall(src, word, end)
      if (call !== null) {
        if (call.kind === 'describe') {
          pending = call.title
        } else {
          titles.push([...stack.map((s) => s.title), call.title].join(' > '))
        }
        i = call.end
        prev = '"'
      } else {
        i = end
        prev = 'a'
      }
      continue
    }
    if (c === '{') {
      depth++
      if (pending !== null) {
        stack.push({ title: pending, depth })
        pending = null
      }
    } else if (c === '}') {
      if (stack.at(-1)?.depth === depth) stack.pop()
      depth--
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return titles
}

const has = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key)

/**
 * Throws unless every title is covered: `slug(title)` is one of `caseIds`, or `notPorted[title]`
 * is a non-empty reason. Also throws on an empty `titles` and on a `notPorted` key that names no
 * title.
 */
export function assertCasesCoverTitles(
  caseIds: readonly string[],
  titles: readonly string[],
  notPorted: Readonly<Record<string, string>>
): void {
  if (titles.length === 0) {
    throw new Error(
      'assertCasesCoverTitles: no titles were scanned; the census is vacuous'
    )
  }
  const ids = new Set(caseIds)
  const known = new Set(titles)
  const uncovered: string[] = []
  for (const title of titles) {
    if (ids.has(slug(title))) continue
    if (has(notPorted, title)) {
      if ((notPorted[title] ?? '').trim() !== '') continue
      uncovered.push(`${title} (listed as not ported, but with no reason)`)
    } else {
      uncovered.push(title)
    }
  }
  const stale = Object.keys(notPorted).filter((key) => !known.has(key))
  if (uncovered.length === 0 && stale.length === 0) return
  const lines: string[] = []
  if (uncovered.length > 0) {
    lines.push(
      `${uncovered.length} test title(s) are neither a golden case id nor a reasoned exclusion:`,
      ...uncovered.map((t) => `  - ${t}`)
    )
  }
  if (stale.length > 0) {
    lines.push(
      `${stale.length} not-ported entr(ies) name no test title:`,
      ...stale.map((t) => `  - ${t}`)
    )
  }
  throw new Error(lines.join('\n'))
}
