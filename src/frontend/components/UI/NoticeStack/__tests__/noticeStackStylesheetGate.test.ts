/**
 * NoticeStack stylesheet gate.
 *
 * WHY: quick 261106-pr4 moved the Humble expiry toast into the shared
 * NoticeStack after it overlapped the Steam notices by positioning itself
 * independently. Sketch 006 L1 is "one region, no notice positions itself".
 * Nothing stopped the regression class from returning, so this gate does.
 *
 * WHAT each gate proves (source-level, no DOM, no new dependencies):
 *  - only the `.noticeStack` rule in NoticeStack/index.scss may be
 *    `position: fixed`; `position: sticky` is forbidden everywhere;
 *  - no region-sheet rule other than `.noticeStack`, and no slot toast-root
 *    rule, may set `position: absolute` or a top/bottom/left/right/inset*
 *    anchor;
 *  - INNER decorative rules inside the toast surface (the Steam countdown bar,
 *    `position: absolute` inside the `position: relative` `.noticeStackToast`)
 *    stay allowed: anchors there are fine only when the same rule is absolute;
 *  - a new `renderNoticeSlot(` caller, or a new child of AppNoticeStack, that
 *    is not in the table below fails the discovery guard.
 *
 * SCOPING: a slot-sheet rule is a toast ROOT when a subject class equals the
 * caller's `toastClassName` base or starts with `base + '--'`; every other
 * rule in a slot sheet is INNER.
 *
 * SELF-TESTS use specimens derived from the real sources by string
 * replacement at a real anchor (never hand-authored), each first asserting the
 * replacement changed the text, mirroring steamSyncStatusWiring.test.ts.
 */
import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { at, defined } from '../../../__tests__/fixtures/indexed'

import {
  stripSourceComments,
  stripTrailingLineCommentTs
} from 'backend/testUtils/stripSourceComments'

const ROOT = path.resolve(__dirname, '../../../../../..')
const UI = 'src/frontend/components/UI'

const REGION_SCSS = `${UI}/NoticeStack/index.scss`
const REGION_TSX = `${UI}/NoticeStack/index.tsx`
const NOTICE_SLOT = `${UI}/NoticeStack/noticeSlot.tsx`

type SlotEntry = {
  name: string
  tsx: string
  scss: string
  rootBase: string
}

// Single source of truth: every notice that renders through renderNoticeSlot.
const SLOTS: SlotEntry[] = [
  {
    name: 'SteamEngineLaunchNotice',
    tsx: `${UI}/SteamEngineLaunchNotice/index.tsx`,
    scss: `${UI}/SteamEngineLaunchNotice/index.scss`,
    rootBase: 'steamEngineLaunchNotice'
  },
  {
    name: 'HumbleExpiryToast',
    tsx: `${UI}/HumbleExpiryToast/index.tsx`,
    scss: `${UI}/HumbleExpiryToast/index.scss`,
    rootBase: 'humbleExpiryToast'
  }
]

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const strip = (source: string) =>
  stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineCommentTs)
    .join('\n')

type Decl = { selectors: string[]; prop: string; value: string }

function splitTopLevelCommas(header: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of header) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

type Frame = { selectors: string[]; skip: boolean }

function parseScssDeclarations(text: string): Decl[] {
  const decls: Decl[] = []
  const stack: Frame[] = [{ selectors: [], skip: false }]
  let buf = ''

  const flushDecl = () => {
    const stmt = buf.trim()
    buf = ''
    const top = at(stack, -1)
    if (!stmt || top.skip) return
    if (stmt.startsWith('$') || stmt.startsWith('@')) return
    const idx = stmt.indexOf(':')
    if (idx < 0) return
    decls.push({
      selectors: top.selectors,
      prop: stmt.slice(0, idx).trim().toLowerCase(),
      value: stmt.slice(idx + 1).trim()
    })
  }

  for (const ch of text) {
    if (ch === '{') {
      const header = buf.trim()
      buf = ''
      const parent = at(stack, -1)
      if (parent.skip || /^@(-\w+-)?keyframes\b/.test(header)) {
        stack.push({ selectors: parent.selectors, skip: true })
      } else if (header.startsWith('@')) {
        stack.push({ selectors: parent.selectors, skip: false })
      } else {
        const children = splitTopLevelCommas(header)
        const resolved: string[] = []
        const parents = parent.selectors.length ? parent.selectors : [null]
        for (const p of parents) {
          for (const c of children) {
            if (p === null) resolved.push(c)
            else if (c.includes('&')) resolved.push(c.replace(/&/g, p))
            else resolved.push(`${p} ${c}`)
          }
        }
        stack.push({ selectors: resolved, skip: false })
      }
    } else if (ch === '}') {
      flushDecl()
      if (stack.length > 1) stack.pop()
    } else if (ch === ';') {
      flushDecl()
    } else {
      buf += ch
    }
  }
  return decls
}

const ANCHOR_RE = /^(top|bottom|left|right|inset(-block.*|-inline.*)?)$/

function subjectClasses(selector: string): string[] {
  const compounds = selector.split(/[\s>+~]+/).filter(Boolean)
  const subject = compounds[compounds.length - 1] ?? ''
  return [...subject.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => defined(m[1]))
}

function isToastRoot(selector: string, rootBase: string): boolean {
  return subjectClasses(selector).some(
    (c) => c === rootBase || c.startsWith(`${rootBase}--`)
  )
}

function findViolations(
  file: string,
  role: 'region' | 'slot',
  rootBase: string,
  decls: Decl[]
): string[] {
  const out: string[] = []
  const absoluteSelectors = new Set<string>()
  for (const d of decls) {
    if (d.prop === 'position' && d.value === 'absolute') {
      d.selectors.forEach((s) => absoluteSelectors.add(s))
    }
  }
  const msg = (sel: string, d: Decl, why: string) =>
    `${file}: "${sel}" { ${d.prop}: ${d.value} } - ${why}`

  for (const d of decls) {
    for (const sel of d.selectors) {
      const isStackRule = role === 'region' && sel === '.noticeStack'
      const root = role === 'slot' && isToastRoot(sel, rootBase)
      if (d.prop === 'position') {
        if (d.value === 'fixed' && !isStackRule) {
          out.push(msg(sel, d, 'only .noticeStack may be position: fixed'))
        } else if (d.value === 'sticky') {
          out.push(msg(sel, d, 'position: sticky is forbidden'))
        } else if (d.value === 'absolute' && (role === 'region' || root)) {
          out.push(
            msg(sel, d, 'region/toast-root must not be position: absolute')
          )
        }
      } else if (ANCHOR_RE.test(d.prop)) {
        if (role === 'region' && !isStackRule) {
          out.push(
            msg(sel, d, 'anchor on a region rule other than .noticeStack')
          )
        } else if (root) {
          out.push(msg(sel, d, 'anchor on a toast-root rule'))
        } else if (role === 'slot' && !absoluteSelectors.has(sel)) {
          out.push(
            msg(
              sel,
              d,
              'anchor on an inner rule that is not position: absolute'
            )
          )
        }
      }
    }
  }
  return out
}

const sheets = () => [
  { file: REGION_SCSS, role: 'region' as const, rootBase: '' },
  ...SLOTS.map((s) => ({
    file: s.scss,
    role: 'slot' as const,
    rootBase: s.rootBase
  }))
]

const violationsFor = (
  file: string,
  role: 'region' | 'slot',
  rootBase: string,
  text: string
) => findViolations(file, role, rootBase, parseScssDeclarations(strip(text)))

function derive(text: string, anchor: string, insert: string): string {
  const next = text.replace(anchor, `${anchor}\n${insert}`)
  expect(next).not.toBe(text) // anchor still exists in the real source
  return next
}

describe('NoticeStack stylesheet gate (real sources)', () => {
  it('no notice stylesheet positions itself outside the region', () => {
    const all = sheets().flatMap((s) =>
      violationsFor(s.file, s.role, s.rootBase, read(s.file))
    )
    expect(all).toEqual([])
  })

  it('is not vacuous: parser sees exactly one fixed and an absolute bar', () => {
    const parsed = sheets().flatMap((s) =>
      parseScssDeclarations(strip(read(s.file)))
    )
    const fixed = parsed.filter(
      (d) => d.prop === 'position' && d.value === 'fixed'
    )
    expect(fixed).toHaveLength(1)
    expect(at(fixed, 0).selectors).toEqual(['.noticeStack'])

    const absolute = parsed.filter(
      (d) => d.prop === 'position' && d.value === 'absolute'
    )
    expect(absolute.length).toBeGreaterThanOrEqual(1)
    expect(
      absolute.some((d) => d.selectors.includes('.steamEngineLaunchNoticeBar'))
    ).toBe(true)

    const selectors = new Set(parsed.flatMap((d) => d.selectors))
    expect(selectors.has('.humbleExpiryToast')).toBe(true)
    expect(selectors.has('.noticeStackToast')).toBe(true)
    expect(selectors.has('.noticeStackSlot > div')).toBe(true)
  })

  it('keeps the containment premise: .noticeStackToast is position: relative', () => {
    const parsed = parseScssDeclarations(strip(read(REGION_SCSS)))
    const rel = parsed.find(
      (d) => d.prop === 'position' && d.selectors.includes('.noticeStackToast')
    )
    expect(rel?.value).toBe('relative')
    const region = parsed.find(
      (d) => d.prop === 'position' && d.selectors.includes('.noticeStack')
    )
    expect(region?.value).toBe('fixed')
  })
})

describe('NoticeStack stylesheet gate (derived specimens)', () => {
  const humble = at(SLOTS, 1)
  const steam = at(SLOTS, 0)

  it('flags position fixed + anchors reintroduced on the Humble toast root', () => {
    const text = derive(
      read(humble.scss),
      '.humbleExpiryToast {',
      '  position: fixed;\n  bottom: 0;\n  right: 0;'
    )
    const v = violationsFor(humble.scss, 'slot', humble.rootBase, text)
    const joined = v.join('\n')
    expect(joined).toContain('position: fixed')
    expect(joined).toContain('bottom: 0')
    expect(joined).toContain('right: 0')
  })

  it('flags position absolute on the region slot child', () => {
    const text = derive(read(REGION_SCSS), '> div {', '    position: absolute;')
    const v = violationsFor(REGION_SCSS, 'region', '', text)
    expect(v.join('\n')).toContain('position: absolute')
  })

  it('flags position sticky even on an inner rule', () => {
    const text = derive(
      read(steam.scss),
      '.steamEngineLaunchNoticeIcon {',
      '  position: sticky;'
    )
    const v = violationsFor(steam.scss, 'slot', steam.rootBase, text)
    expect(v.join('\n')).toContain('position: sticky')
  })

  it('flags a stray anchor on an inner rule that is not absolute', () => {
    const text = derive(
      read(steam.scss),
      '.steamEngineLaunchNoticeIcon {',
      '  top: 0;'
    )
    const v = violationsFor(steam.scss, 'slot', steam.rootBase, text)
    expect(v.join('\n')).toContain('top: 0')
  })

  it('ignores a trailing comment mentioning position: fixed', () => {
    const text = derive(
      read(humble.scss),
      '.humbleExpiryToast {',
      '  align-items: center; // position: fixed'
    )
    expect(violationsFor(humble.scss, 'slot', humble.rootBase, text)).toEqual(
      []
    )
  })
})

describe('NoticeStack stylesheet gate (discovery guard)', () => {
  function listSources(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(path.join(ROOT, dir), {
      withFileTypes: true
    })) {
      if (['__tests__', '__mocks__', 'node_modules'].includes(entry.name))
        continue
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) listSources(rel, acc)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name))
        acc.push(rel)
    }
    return acc
  }

  it('every renderNoticeSlot caller is in the table', () => {
    const callers = listSources('src/frontend')
      .filter((f) => f !== NOTICE_SLOT)
      .filter((f) => strip(read(f)).includes('renderNoticeSlot('))
      .sort()
    expect(callers).toEqual(SLOTS.map((s) => s.tsx).sort())
    // On failure: add the new caller's stylesheet and rootBase to SLOTS.
  })

  it('every child of <NoticeStack> in AppNoticeStack is in the table', () => {
    const src = strip(read(REGION_TSX))
    const inner = src.match(/<NoticeStack>([\s\S]*?)<\/NoticeStack>/)
    expect(inner).not.toBeNull()
    const tags = [...defined(inner?.[1]).matchAll(/<([A-Z]\w*)/g)].map((m) =>
      defined(m[1])
    )
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) {
      const imp = src.match(new RegExp(`import\\s+${tag}\\s+from\\s+'([^']+)'`))
      expect(imp).not.toBeNull()
      const rel = defined(imp?.[1]).replace(/^frontend\//, 'src/frontend/')
      expect(SLOTS.map((s) => path.dirname(s.tsx))).toContain(rel)
    }
  })

  it.each(SLOTS)(
    '$name imports its stylesheet and names its root base',
    (s) => {
      const src = strip(read(s.tsx))
      expect(src).toContain("import './index.scss'")
      expect(src).toContain(`'${s.rootBase}'`)
    }
  )
})
