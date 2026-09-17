/**
 * SEARCHPROBE-REMOVE-ME
 *
 * Temporary, opt-in, default-OFF live-measurement instrument for the shared `SearchBar`
 * suggestions list. Built by quick task `260915-lhm` to supply the "same live-measurement
 * treatment `35-25` Task 1 gave winetricks" that two open todos are waiting on:
 *   - .planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md
 *   - .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md
 *     (the hover-highlight half of Half B)
 *
 * This file produces NO diagnosis and NO fix. It only makes one operator drive of a
 * `SearchBar` consumer sufficient to record the six captures (C-1..C-6) those todos need.
 * See `260915-lhm-PROBE-RETRIEVAL.md` for the drive script and the sqlite retrieval commands.
 *
 * Removal recipe (two steps, once the todos above are settled):
 *   1. Delete this file and its test,
 *      `src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts`.
 *   2. In `../index.tsx`, delete the `ulRef` / `useEffect` pair that calls
 *      `attachSearchProbe`, and the `ref={ulRef}` attribute on the `<ul>`.
 * Grep `SEARCHPROBE-REMOVE-ME` to find every site that has to go.
 *
 * Arming: a single gate, `localStorage['gamelib.searchProbe'] === '1'`. Reachable two ways --
 * typing `::probe-on` into ANY GameLib search bar (this module watches every keystroke's
 * `value` for that literal string, since `SearchBar` already hands it over on every
 * keystroke), or, with the app closed, writing the key directly into WebKit's
 * `localstorage.sqlite3` (see the retrieval doc; Tauri DevTools console paste is unusable on
 * this project, so a console-based arming path would not exist in practice).
 *
 * With the harness unarmed (the default), this module attaches nothing and mutates nothing
 * except checking the typed value for the two magic strings -- `SearchBar` behaves
 * byte-identically to head.
 */

// ---------------------------------------------------------------------------
// Pure colour arithmetic -- unit-testable without a DOM (V-11: no jsdom here).
// This is the one number capable of misleading the diagnosis (C-1 / F-4), so
// it is pinned by `__tests__/searchProbeContrast.test.ts`.
// ---------------------------------------------------------------------------

export interface RgbColor {
  r: number
  g: number
  b: number
  a: number
}

const RGB_PATTERN =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i

/**
 * Parses a CSS `rgb()`/`rgba()` colour string, as returned by
 * `getComputedStyle(...).backgroundColor` / `.color` in every engine this project targets.
 * Returns `null` for anything else (including modern `color(...)` syntax and empty strings)
 * rather than throwing -- a diagnostic that can throw is worse than one that says "unknown".
 * A fully-transparent colour (`a === 0`) parses successfully: transparency is itself a
 * finding (a transparent hover background would explain the symptom), not a parse failure.
 */
export function parseRgb(input: string): RgbColor | null {
  if (!input) {
    return null
  }
  const match = RGB_PATTERN.exec(input.trim())
  if (!match) {
    return null
  }
  const r = Number(match[1])
  const g = Number(match[2])
  const b = Number(match[3])
  const a = match[4] === undefined ? 1 : Number(match[4])
  if (
    Number.isNaN(r) ||
    Number.isNaN(g) ||
    Number.isNaN(b) ||
    Number.isNaN(a)
  ) {
    return null
  }
  return { r, g, b, a }
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance, ignoring alpha (the surfaces this probe compares are opaque). */
export function relativeLuminance(color: RgbColor): number {
  const r = srgbChannelToLinear(color.r)
  const g = srgbChannelToLinear(color.g)
  const b = srgbChannelToLinear(color.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG contrast ratio between two CSS colour strings, range [1, 21]. Returns `null` when
 * either side fails to parse; never throws. This is the number that decides F-4: near `1.0`
 * with `matchesHover === true` means the hover rule is applying and invisible.
 */
export function contrastRatio(a: string, b: string): number | null {
  const colorA = parseRgb(a)
  const colorB = parseRgb(b)
  if (!colorA || !colorB) {
    return null
  }
  const luminanceA = relativeLuminance(colorA) + 0.05
  const luminanceB = relativeLuminance(colorB) + 0.05
  const brighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return brighter / darker
}

// ---------------------------------------------------------------------------
// DOM-facing half. Not unit-testable in this project (no jsdom); exercised
// only by the live operator drive documented in the retrieval doc.
// ---------------------------------------------------------------------------

const ARMED_KEY = 'gamelib.searchProbe'
const ARM_COMMAND = '::probe-on'
const DISARM_COMMAND = '::probe-off'
const LOG_KEY = 'gamelib.searchProbe.log'
const META_KEY = 'gamelib.searchProbe.meta'
const ARMED_RECORD_KEY = 'gamelib.searchProbe.armed'
const MAX_RECORDS = 1500
const BADGE_ID = 'gamelib-searchprobe-badge'
const ROW_SAMPLE_THROTTLE_MS = 150
const RAF_HARD_CAP_MS = 600
const RAF_POST_MOUSEUP_MS = 100
const TAB_SAMPLE_DELAY_MS = 50
const ROW_LABEL_MAX_LENGTH = 24

type PointerSeqKind = 'pointerdown' | 'mousedown' | 'mouseup' | 'click'
type TabSampleKind = 'tab-before' | 'tab-after-raf' | 'tab-after-50ms'

interface RecordBase {
  t: number
  surface: string
}

interface HoverRecord extends RecordBase {
  kind: 'hover'
  matchesHover: boolean
  liBg: string
  liFg: string
  ulBg: string
  accentRaw: string
  backgroundRaw: string
  contrastHighlightVsSurround: number | null
  contrastTextVsBg: number | null
  liPointerEvents: string
  ulPointerEvents: string
  rowIndex: number
  rowLabel: string
  rowTextLength: number
}

interface PointerSequenceRecord extends RecordBase {
  kind: PointerSeqKind
  origin: 'ul' | 'document'
  targetDescriptor: string
  targetIsRow: boolean
}

interface FocusSampleRecord extends RecordBase {
  kind: 'focus-sample'
  activeElementDescriptor: string
  focusWithin: boolean
  ulDisplay: string
  ulConnected: boolean
}

interface HitTestRecord extends RecordBase {
  kind: 'hit-test'
  elementFromPointDescriptor: string
  elementFromPointIsRow: boolean
  elementsFromPointTop5: string[]
}

interface DomMutationRecord extends RecordBase {
  kind: 'mutation'
  target: 'ul' | 'ul-parent'
  added: number
  removed: number
  ulWasRemoved: boolean
  sinceMousedown: number | null
}

interface TabRecord extends RecordBase {
  kind: TabSampleKind
  activeElementDescriptor: string
  focusWithin: boolean
  ulDisplay: string
  ulConnected: boolean
  defaultPrevented: boolean
}

type ProbeRecord =
  | HoverRecord
  | PointerSequenceRecord
  | FocusSampleRecord
  | HitTestRecord
  | DomMutationRecord
  | TabRecord

interface ProbeMeta {
  dropped: number
}

function nowMs(): number {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now()
  }
  return Date.now()
}

function randomNonce(): string {
  const a = Math.random().toString(16).slice(2)
  const b = Date.now().toString(16)
  return `${a}${b}`.slice(0, 16)
}

function describeElement(el: Element | null): string {
  if (!el) {
    return 'null'
  }
  const tag = el.tagName.toLowerCase()
  const id = el.id.length > 0 ? `#${el.id}` : ''
  const rawClass = typeof el.className === 'string' ? el.className.trim() : ''
  const firstClass = rawClass.length > 0 ? rawClass.split(/\s+/)[0] : ''
  const cls = firstClass ? `.${firstClass}` : ''
  return `${tag}${id}${cls}`
}

function truncatedLabel(el: Element, maxLength: number): string {
  const text = (el.textContent ?? '').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function isProbeRecordLike(x: unknown): x is ProbeRecord {
  return (
    typeof x === 'object' &&
    x !== null &&
    'kind' in x &&
    't' in x &&
    'surface' in x
  )
}

function isProbeRecordArray(x: unknown): x is ProbeRecord[] {
  return Array.isArray(x) && x.every(isProbeRecordLike)
}

function isProbeMeta(x: unknown): x is ProbeMeta {
  return (
    typeof x === 'object' &&
    x !== null &&
    'dropped' in x &&
    typeof (x as Record<string, unknown>).dropped === 'number'
  )
}

function readJson<T>(
  key: string,
  isValid: (x: unknown) => x is T,
  fallback: T
): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return fallback
    }
    const parsed: unknown = JSON.parse(raw)
    return isValid(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function readLog(): ProbeRecord[] {
  return readJson(LOG_KEY, isProbeRecordArray, [])
}

function writeLog(records: ProbeRecord[]): void {
  window.localStorage.setItem(LOG_KEY, JSON.stringify(records))
}

function readMeta(): ProbeMeta {
  return readJson(META_KEY, isProbeMeta, { dropped: 0 })
}

function writeMeta(meta: ProbeMeta): void {
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

function isArmed(): boolean {
  return window.localStorage.getItem(ARMED_KEY) === '1'
}

function ensureBadge(): HTMLDivElement {
  const existing = document.getElementById(BADGE_ID)
  if (existing instanceof HTMLDivElement) {
    return existing
  }
  const badge = document.createElement('div')
  badge.id = BADGE_ID
  badge.style.position = 'fixed'
  badge.style.bottom = '8px'
  badge.style.right = '8px'
  badge.style.zIndex = '2147483647'
  badge.style.padding = '4px 8px'
  badge.style.borderRadius = '4px'
  badge.style.fontFamily = 'monospace'
  badge.style.fontSize = '11px'
  badge.style.background = 'rgba(0, 0, 0, 0.75)'
  badge.style.color = '#00ff5f'
  badge.style.pointerEvents = 'none'
  // Appended directly to document.body, NOT through React, so the SearchBar
  // component tree is byte-unchanged while armed.
  document.body.appendChild(badge)
  return badge
}

function removeBadge(): void {
  const existing = document.getElementById(BADGE_ID)
  if (existing && existing.parentElement) {
    existing.parentElement.removeChild(existing)
  }
}

function refreshBadgeFromLog(): void {
  const badge = ensureBadge()
  const log = readLog()
  const meta = readMeta()
  const gestureCount = log.filter((r) => r.kind === 'mousedown').length
  const truncatedSuffix = meta.dropped > 0 ? ' TRUNC' : ''
  badge.textContent = `SEARCHPROBE armed · g${String(gestureCount)} · ${String(
    log.length
  )} rec${truncatedSuffix}`
}

/**
 * Appends one record, capping the durable store at `MAX_RECORDS` with oldest-first eviction.
 * Never drops silently (T-LHM-04): an eviction increments `meta.dropped`, which the badge
 * surfaces as ` TRUNC`.
 */
function appendRecord(record: ProbeRecord): void {
  const log = readLog()
  log.push(record)
  const meta = readMeta()
  while (log.length > MAX_RECORDS) {
    log.shift()
    meta.dropped += 1
  }
  writeLog(log)
  writeMeta(meta)
  refreshBadgeFromLog()
}

function arm(): void {
  if (isArmed()) {
    return
  }
  window.localStorage.setItem(ARMED_KEY, '1')
  writeLog([])
  writeMeta({ dropped: 0 })
  const nonce = randomNonce()
  const armedRecord = {
    nonce,
    href: window.location.href,
    ts: new Date().toISOString()
  }
  // Durable arm-time proof #2: readable from the sqlite file even if the badge were
  // somehow suppressed (T-LHM-06).
  window.localStorage.setItem(ARMED_RECORD_KEY, JSON.stringify(armedRecord))
  ensureBadge()
  refreshBadgeFromLog()
  // Arm-time proof #3, and secondary BY CONSTRUCTION: this leg is send-kind, so its
  // SILENCE proves nothing -- exactly the ambiguity that left the 2026-08-24 todo's
  // `useEffect` probe unexplained. Its PRESENCE in gamelib.log is free confirmation only.
  window.api.logInfo(`[searchprobe] ARMED nonce=${nonce}`)
}

function disarm(): void {
  if (!isArmed()) {
    return
  }
  window.localStorage.removeItem(ARMED_KEY)
  window.localStorage.removeItem(LOG_KEY)
  window.localStorage.removeItem(META_KEY)
  window.localStorage.removeItem(ARMED_RECORD_KEY)
  removeBadge()
  window.api.logInfo('[searchprobe] DISARMED')
}

function handleArmingCommands(value: string): void {
  if (value.includes(ARM_COMMAND)) {
    arm()
  }
  if (value.includes(DISARM_COMMAND)) {
    disarm()
  }
}

function surfaceFor(ul: HTMLUListElement): string {
  if (ul.closest('[data-tour="library-search"]')) {
    return 'library'
  }
  let node: Element | null = ul.parentElement
  while (node) {
    const testId = node.getAttribute('data-testid')
    if (testId) {
      return testId
    }
    const rawClass =
      typeof node.className === 'string' ? node.className.trim() : ''
    if (rawClass.length > 0) {
      return rawClass.split(/\s+/)[0]
    }
    node = node.parentElement
  }
  return 'unknown'
}

function activeElementDescriptor(): string {
  return describeElement(document.activeElement)
}

function isFocusWithin(ul: HTMLUListElement): boolean {
  const owner = ul.closest('.SearchBar')
  if (!owner) {
    return false
  }
  return owner.matches(':focus-within')
}

function ulDisplayValue(ul: HTMLUListElement): string {
  return window.getComputedStyle(ul).display
}

// ---- C-1: does the hover rule apply at all? (the cheapest partition; F-4) ----
function recordHoverSample(
  li: Element,
  ul: HTMLUListElement,
  surface: string
): void {
  const liStyle = window.getComputedStyle(li)
  const ulStyle = window.getComputedStyle(ul)
  const rootStyle = window.getComputedStyle(document.documentElement)
  const liBg = liStyle.backgroundColor
  const liFg = liStyle.color
  const ulBg = ulStyle.backgroundColor
  const rows: Element[] = Array.from(ul.querySelectorAll('li'))
  const record: HoverRecord = {
    kind: 'hover',
    t: nowMs(),
    surface,
    matchesHover: li.matches(':hover'),
    liBg,
    liFg,
    ulBg,
    accentRaw: rootStyle.getPropertyValue('--accent').trim(),
    backgroundRaw: rootStyle.getPropertyValue('--background').trim(),
    contrastHighlightVsSurround: contrastRatio(liBg, ulBg),
    contrastTextVsBg: contrastRatio(liFg, liBg),
    liPointerEvents: liStyle.pointerEvents,
    ulPointerEvents: ulStyle.pointerEvents,
    rowIndex: rows.indexOf(li),
    rowLabel: truncatedLabel(li, ROW_LABEL_MAX_LENGTH),
    rowTextLength: (li.textContent ?? '').trim().length
  }
  appendRecord(record)
}

// ---- C-2: the full pointer sequence on the row ----
function recordPointerSequence(
  kind: PointerSeqKind,
  target: EventTarget | null,
  targetIsRow: boolean,
  surface: string,
  origin: 'ul' | 'document'
): void {
  const record: PointerSequenceRecord = {
    kind,
    t: nowMs(),
    surface,
    origin,
    targetDescriptor: describeElement(
      target instanceof Element ? target : null
    ),
    targetIsRow
  }
  appendRecord(record)
}

// ---- C-3: document.activeElement across the mousedown -> mouseup window ----
function recordFocusSample(
  elapsed: number,
  ul: HTMLUListElement,
  surface: string
): void {
  const record: FocusSampleRecord = {
    kind: 'focus-sample',
    t: elapsed,
    surface,
    activeElementDescriptor: activeElementDescriptor(),
    focusWithin: isFocusWithin(ul),
    ulDisplay: ulDisplayValue(ul),
    ulConnected: ul.isConnected
  }
  appendRecord(record)
}

// ---- C-4: hit-testing at the pointer during mousedown ----
function recordHitTest(
  e: MouseEvent,
  li: Element | null,
  surface: string
): void {
  const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY)
  const stack =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(e.clientX, e.clientY)
      : []
  const elementFromPointIsRow =
    li !== null &&
    elementAtPoint !== null &&
    (elementAtPoint === li || li.contains(elementAtPoint))
  const record: HitTestRecord = {
    kind: 'hit-test',
    t: nowMs(),
    surface,
    elementFromPointDescriptor: describeElement(elementAtPoint),
    elementFromPointIsRow,
    elementsFromPointTop5: stack.slice(0, 5).map((el) => describeElement(el))
  }
  appendRecord(record)
}

// ---- C-5: row mount/unmount across the window ----
function recordMutation(
  mutation: MutationRecord,
  target: 'ul' | 'ul-parent',
  ul: HTMLUListElement,
  mousedownAt: number | null,
  surface: string
): void {
  const removedNodes = Array.from(mutation.removedNodes)
  const ulWasRemoved = removedNodes.includes(ul)
  const record: DomMutationRecord = {
    kind: 'mutation',
    t: nowMs(),
    surface,
    target,
    added: mutation.addedNodes.length,
    removed: mutation.removedNodes.length,
    ulWasRemoved,
    sinceMousedown: mousedownAt === null ? null : nowMs() - mousedownAt
  }
  appendRecord(record)
}

// ---- C-6: what Tab actually changes ----
function recordTabSample(
  kind: TabSampleKind,
  ul: HTMLUListElement,
  surface: string,
  defaultPrevented: boolean
): void {
  const record: TabRecord = {
    kind,
    t: nowMs(),
    surface,
    activeElementDescriptor: activeElementDescriptor(),
    focusWithin: isFocusWithin(ul),
    ulDisplay: ulDisplayValue(ul),
    ulConnected: ul.isConnected,
    defaultPrevented
  }
  appendRecord(record)
}

const UL_POINTER_KINDS: PointerSeqKind[] = [
  'pointerdown',
  'mousedown',
  'mouseup',
  'click'
]
const DOCUMENT_POINTER_KINDS: Array<'mouseup' | 'click'> = ['mouseup', 'click']

function attachArmedProbe(ul: HTMLUListElement): () => void {
  const surface = surfaceFor(ul)
  ensureBadge()
  refreshBadgeFromLog()

  const cleanups: Array<() => void> = []
  let mousedownAt: number | null = null

  // -- C-1 --
  let lastHoverRow: Element | null = null
  let lastHoverAt = 0
  const handleHoverEvent = (e: Event): void => {
    if (!(e instanceof PointerEvent)) {
      return
    }
    const target = e.target
    if (!(target instanceof Element)) {
      return
    }
    const li = target.closest('li')
    if (!li || !ul.contains(li)) {
      return
    }
    const at = nowMs()
    if (li === lastHoverRow && at - lastHoverAt < ROW_SAMPLE_THROTTLE_MS) {
      return
    }
    lastHoverRow = li
    lastHoverAt = at
    recordHoverSample(li, ul, surface)
  }
  ul.addEventListener('pointerover', handleHoverEvent, true)
  ul.addEventListener('pointermove', handleHoverEvent, true)
  cleanups.push(() => {
    ul.removeEventListener('pointerover', handleHoverEvent, true)
    ul.removeEventListener('pointermove', handleHoverEvent, true)
  })

  // -- C-3 sampler, armed from C-2's mousedown below --
  let rafHandle: number | null = null
  let samplerCancelled = true
  let mouseupAtForSampler: number | null = null

  const cancelSampler = (): void => {
    samplerCancelled = true
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
  }

  const startFocusSampler = (): void => {
    cancelSampler()
    samplerCancelled = false
    mouseupAtForSampler = null
    const start = mousedownAt ?? nowMs()
    const sample = (): void => {
      if (samplerCancelled) {
        return
      }
      const elapsed = nowMs() - start
      recordFocusSample(elapsed, ul, surface)
      const pastHardCap = elapsed >= RAF_HARD_CAP_MS
      const pastPostMouseupWindow =
        mouseupAtForSampler !== null &&
        nowMs() - mouseupAtForSampler >= RAF_POST_MOUSEUP_MS
      if (pastHardCap || pastPostMouseupWindow) {
        samplerCancelled = true
        return
      }
      rafHandle = window.requestAnimationFrame(sample)
    }
    rafHandle = window.requestAnimationFrame(sample)
  }
  cleanups.push(cancelSampler)

  const handleMouseupForSampler = (): void => {
    mouseupAtForSampler = nowMs()
  }
  document.addEventListener('mouseup', handleMouseupForSampler, true)
  cleanups.push(() =>
    document.removeEventListener('mouseup', handleMouseupForSampler, true)
  )

  // -- C-2 (ul side) + triggers C-3/C-4 on mousedown --
  for (const kind of UL_POINTER_KINDS) {
    const handler = (e: Event): void => {
      const target = e.target
      const li = target instanceof Element ? target.closest('li') : null
      recordPointerSequence(
        kind,
        target,
        li !== null && ul.contains(li),
        surface,
        'ul'
      )
      if (kind === 'mousedown') {
        mousedownAt = nowMs()
        if (e instanceof MouseEvent) {
          recordHitTest(e, li, surface)
        }
        startFocusSampler()
      }
    }
    ul.addEventListener(kind, handler, true)
    cleanups.push(() => ul.removeEventListener(kind, handler, true))
  }

  // -- C-2 (document side, actual target) --
  for (const kind of DOCUMENT_POINTER_KINDS) {
    const handler = (e: Event): void => {
      const target = e.target
      const li = target instanceof Element ? target.closest('li') : null
      recordPointerSequence(
        kind,
        target,
        li !== null && ul.contains(li),
        surface,
        'document'
      )
    }
    document.addEventListener(kind, handler, true)
    cleanups.push(() => document.removeEventListener(kind, handler, true))
  }

  // -- C-5 --
  const ulObserver = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
      recordMutation(mutation, 'ul', ul, mousedownAt, surface)
    }
  })
  ulObserver.observe(ul, { childList: true })
  cleanups.push(() => ulObserver.disconnect())

  const parent = ul.parentElement
  if (parent) {
    const parentObserver = new MutationObserver((mutationList) => {
      for (const mutation of mutationList) {
        recordMutation(mutation, 'ul-parent', ul, mousedownAt, surface)
      }
    })
    parentObserver.observe(parent, { childList: true })
    cleanups.push(() => parentObserver.disconnect())
  }

  // -- C-6 --
  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') {
      return
    }
    recordTabSample('tab-before', ul, surface, e.defaultPrevented)
    window.requestAnimationFrame(() => {
      recordTabSample('tab-after-raf', ul, surface, e.defaultPrevented)
    })
    window.setTimeout(() => {
      recordTabSample('tab-after-50ms', ul, surface, e.defaultPrevented)
    }, TAB_SAMPLE_DELAY_MS)
  }
  document.addEventListener('keydown', handleKeydown, true)
  cleanups.push(() =>
    document.removeEventListener('keydown', handleKeydown, true)
  )

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}

/**
 * Called on every keystroke via `SearchBar`'s `useEffect(() => attachSearchProbe(ulRef.current,
 * value), [value])` (SEARCHPROBE-REMOVE-ME site). Always checks `value` for the arm/disarm
 * commands, regardless of current arm state, so typing `::probe-on` works from cold. Attaches
 * nothing and returns `undefined` unless armed. Returns a teardown function while armed, which
 * React runs before the next keystroke's re-invocation (and on unmount).
 */
export function attachSearchProbe(
  ul: HTMLUListElement | null,
  value: string
): (() => void) | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return undefined
  }

  handleArmingCommands(value)

  if (!isArmed()) {
    return undefined
  }

  if (!ul) {
    // Armed, but this consumer's suggestions list isn't mounted right now (e.g. the search
    // value is empty). Still confirm arm-state via the badge; nothing to attach to yet.
    ensureBadge()
    refreshBadgeFromLog()
    return undefined
  }

  return attachArmedProbe(ul)
}
