/**
 * Pure helpers for Steamworks Common Redistributables (app 228980) installscripts
 * (quick 261025-rkj).
 *
 * Steam's first-launch "Installing ..." step evaluates a depot's `installscript.vdf`: each named
 * entry under `Run Process` runs `process N` with `command N` unless its `HasRunKey` registry
 * value says it already ran. This module parses those scripts, classifies a depot from the
 * script's own verified content (never from a depot-id table), and builds the argv arrays that run
 * inside a CrossOver bottle.
 *
 * Deliberately pure: no fs, no logger, no launcher, no electron. depot.ts and the bottle runner
 * both import it, so it must not pull either of them back in.
 */

/** The Steamworks Common Redistributables app that owns every shared redist depot. */
export const STEAM_COMMON_REDIST_APP_ID = '228980'

/** EDepotFileFlag InstallScript: the manifest flag on a depot's installscript.vdf. */
export const INSTALLSCRIPT_FLAG = 256

/**
 * The Windows version a bridge bottle reports, for `Requirement_OS { OSType }` checks
 * (RESEARCH A6, assumed). Only the opt-in .NET path ever meets an OSType requirement.
 */
export const BOTTLE_WINDOWS_VERSION = 'Windows 10'

export type SharedRedistKind = 'vcredist' | 'directx' | 'other'

interface KvNode {
  key: string
  value: string | KvNode[]
}

interface InstallScriptProcess {
  process: string
  command?: string
}

export interface InstallScriptEntry {
  name: string
  hasRunKey?: string
  minimumHasRunValue: number
  processes: InstallScriptProcess[]
  requirementOs: { is64BitWindows?: string; osType?: string } | null
}

interface SharedRedistClassification {
  kind: SharedRedistKind
  /** `<Family> <Version>` from the installscript path, or null when it does not match. */
  label: string | null
}

const CONTROL_CHARS = /[\r\n\0]/
const FORBIDDEN_CHARS = /["\r\n\0]/
/**
 * Characters cmd.exe treats specially on a `cmd /c` line: command separators and redirection
 * (`& | < >`), the escape (`^`), grouping (`( )`), variable expansion (`%`, and `!` under delayed
 * expansion), the echo-off prefix (`@`), and the quote. `/c` strips the outer quotes Wine adds
 * around a path containing spaces whenever the quoted text holds one of these, so any of them in a
 * `.cmd` path or argument turns the argv into a shell string (CR-01).
 */
const CMD_META = /[&|<>^()%!@"]/

/** True when `s` holds a character cmd.exe would interpret on a `cmd /c` line. */
export function hasCmdMetachar(s: string): boolean {
  return CMD_META.test(s)
}
const COMMON_REDIST_KEY_PREFIX =
  'HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam\\Apps\\CommonRedist\\'

/**
 * Ordered KV1 tokenizer. Keeps duplicate keys, supports quoted and bare tokens and `//` line
 * comments, and decodes only `\\` and `\"` inside quoted strings.
 *
 * A KV1 `[$COND]` conditional (e.g. `"key" "value" [$WIN32]`, or after a key before its `{`) is
 * skipped when it follows on the same line, so it never shifts key/value pairing (IN-03). It is
 * not evaluated: every conditional variant is kept in file order, as a duplicate key would be.
 *
 * Hand-rolled on purpose: `@node-steam/vdf` merges duplicate sibling keys (the .NET scripts have
 * two `"4.8"` entries, the second being the real installer) and leaves `\\` undecoded (measured,
 * RESEARCH Q5.1). Throws on unbalanced braces or an unterminated string.
 */
export function parseKv1(text: string): KvNode[] {
  let pos = 0
  const len = text.length

  type Token =
    | { t: 'str'; v: string }
    | { t: 'open' }
    | { t: 'close' }
    | { t: 'eof' }

  const next = (): Token => {
    for (;;) {
      while (pos < len && /\s/.test(text[pos])) pos++
      if (pos >= len) return { t: 'eof' }
      if (text[pos] === '/' && text[pos + 1] === '/') {
        while (pos < len && text[pos] !== '\n') pos++
        continue
      }
      break
    }
    const c = text[pos]
    if (c === '{') {
      pos++
      return { t: 'open' }
    }
    if (c === '}') {
      pos++
      return { t: 'close' }
    }
    if (c === '"') {
      pos++
      let out = ''
      for (;;) {
        if (pos >= len) throw new Error('unterminated string')
        const ch = text[pos]
        if (ch === '"') {
          pos++
          return { t: 'str', v: out }
        }
        if (ch === '\\' && (text[pos + 1] === '\\' || text[pos + 1] === '"')) {
          out += text[pos + 1]
          pos += 2
          continue
        }
        out += ch
        pos++
      }
    }
    let out = ''
    while (pos < len && !/[\s{}"]/.test(text[pos])) out += text[pos++]
    return { t: 'str', v: out }
  }

  /**
   * Skip a `[...]` conditional on the current line, if one is next. After a key (`beforeBlock`)
   * it is skipped only when a `{` follows, so a bare `[...]` value is still read as the value.
   */
  const skipConditional = (beforeBlock: boolean) => {
    let p = pos
    while (p < len && (text[p] === ' ' || text[p] === '\t')) p++
    if (text[p] !== '[') return
    const close = text.indexOf(']', p)
    const nl = text.indexOf('\n', p)
    if (close === -1 || (nl !== -1 && nl < close)) return
    if (beforeBlock) {
      let q = close + 1
      while (q < len && /\s/.test(text[q])) q++
      if (text[q] !== '{') return
    }
    pos = close + 1
  }

  const parseBlock = (top: boolean): KvNode[] => {
    const nodes: KvNode[] = []
    for (;;) {
      const keyTok = next()
      if (keyTok.t === 'eof') {
        if (!top) throw new Error('unbalanced braces')
        return nodes
      }
      if (keyTok.t === 'close') {
        if (top) throw new Error('unbalanced braces')
        return nodes
      }
      if (keyTok.t === 'open') throw new Error('unexpected {')
      skipConditional(true)
      const valTok = next()
      if (valTok.t === 'str') {
        nodes.push({ key: keyTok.v, value: valTok.v })
        skipConditional(false)
      } else if (valTok.t === 'open')
        nodes.push({ key: keyTok.v, value: parseBlock(false) })
      else throw new Error('missing value')
    }
  }

  return parseBlock(true)
}

function findChild(nodes: KvNode[], key: string): KvNode | undefined {
  const k = key.toLowerCase()
  return nodes.find((n) => n.key.toLowerCase() === k)
}

function childString(nodes: KvNode[], key: string): string | undefined {
  const n = findChild(nodes, key)
  return n && typeof n.value === 'string' ? n.value : undefined
}

/**
 * Parse an installscript.vdf into its `Run Process` entries in file order. Returns null for
 * malformed text or a script with no `Run Process` block (the `kvsignatures` block is ignored).
 */
export function parseInstallScript(text: string): InstallScriptEntry[] | null {
  let root: KvNode[]
  try {
    root = parseKv1(text)
  } catch {
    return null
  }
  const script = findChild(root, 'installscript')
  if (!script || typeof script.value === 'string') return null
  const run = findChild(script.value, 'run process')
  if (!run || typeof run.value === 'string') return null

  const entries: InstallScriptEntry[] = []
  for (const node of run.value) {
    if (typeof node.value === 'string') continue
    const kids = node.value
    const processes: InstallScriptProcess[] = []
    for (let i = 1; ; i++) {
      const process = childString(kids, `process ${i}`)
      if (process === undefined) break
      processes.push({ process, command: childString(kids, `command ${i}`) })
    }
    const minRaw = childString(kids, 'minimumhasrunvalue')
    const minParsed = minRaw === undefined ? NaN : parseInt(minRaw, 10)
    const reqNode = findChild(kids, 'requirement_os')
    let requirementOs: InstallScriptEntry['requirementOs'] = null
    if (reqNode && typeof reqNode.value !== 'string') {
      requirementOs = {
        is64BitWindows: childString(reqNode.value, 'is64bitwindows'),
        osType: childString(reqNode.value, 'ostype')
      }
    }
    entries.push({
      name: node.key,
      hasRunKey: childString(kids, 'hasrunkey'),
      minimumHasRunValue: Number.isFinite(minParsed) ? minParsed : 1,
      processes,
      requirementOs
    })
  }
  return entries
}

function hasDotDotSegment(p: string): boolean {
  return p.split(/[\\/]/).includes('..')
}

const SCRIPT_PATH_RE =
  /^_CommonRedist\\([^\\]+)\\([^\\]+)\\installscript\.vdf$/i

/**
 * Classify a shared redist depot from its own downloaded installscript, never from a depot-id
 * table. `vcredist` / `directx` need the installscript path family, every HasRunKey under
 * `...\CommonRedist\<family>\` and every process under `%INSTALLDIR%\_CommonRedist\<family>\`
 * (and, for DirectX, ending DXSETUP.exe). Anything else, including a missing script, duplicate
 * entry names, a bare `msiexec` or a `..` segment, is `other`.
 */
export function classifySharedRedist(
  scriptPath: string,
  entries: InstallScriptEntry[] | null
): SharedRedistClassification {
  const path = scriptPath.replace(/\//g, '\\')
  const m = SCRIPT_PATH_RE.exec(path)
  const label = m ? `${m[1]} ${m[2]}` : null
  if (!m || !entries || entries.length === 0) return { kind: 'other', label }

  const names = new Set<string>()
  for (const e of entries) {
    const n = e.name.toLowerCase()
    if (names.has(n)) return { kind: 'other', label }
    names.add(n)
  }

  const family = m[1].toLowerCase()
  const kind: SharedRedistKind | null =
    family === 'vcredist' ? 'vcredist' : family === 'directx' ? 'directx' : null
  if (!kind) return { kind: 'other', label }

  const keyPrefix = `${COMMON_REDIST_KEY_PREFIX}${family}\\`.toLowerCase()
  const procPrefix = `%installdir%\\_commonredist\\${family}\\`
  for (const e of entries) {
    if (!e.hasRunKey || !e.hasRunKey.toLowerCase().startsWith(keyPrefix))
      return { kind: 'other', label }
    if (e.processes.length === 0) return { kind: 'other', label }
    for (const p of e.processes) {
      const lower = p.process.toLowerCase()
      if (!lower.startsWith(procPrefix) || hasDotDotSegment(p.process))
        return { kind: 'other', label }
      // The `%INSTALLDIR%` prefix itself is the only `%` an auto kind may carry.
      if (hasCmdMetachar(p.process.slice(procPrefix.length)))
        return { kind: 'other', label }
      const okExt =
        kind === 'directx'
          ? lower.endsWith('dxsetup.exe')
          : lower.endsWith('.exe') || lower.endsWith('.cmd')
      if (!okExt) return { kind: 'other', label }
    }
  }
  return { kind, label }
}

/**
 * Does this entry's Requirement_OS apply to a GameLib bridge bottle? Bridge bottles are win64
 * (measured), so `Is64BitWindows 1` holds. OSType applies only when it equals the bottle's
 * reported Windows version.
 */
export function entryAppliesToBottle(entry: InstallScriptEntry): boolean {
  const req = entry.requirementOs
  if (!req) return true
  if (req.is64BitWindows !== undefined && req.is64BitWindows.trim() === '0')
    return false
  if (
    req.osType !== undefined &&
    req.osType.trim().toLowerCase() !== BOTTLE_WINDOWS_VERSION.toLowerCase()
  )
    return false
  return true
}

/**
 * Host path -> the Windows path a bottle sees. Every bridge bottle maps `z:` to `/` (measured).
 */
export function toBottleWindowsPath(hostPath: string): string {
  if (!hostPath.startsWith('/'))
    throw new Error(`expected an absolute host path, got: ${hostPath}`)
  if (CONTROL_CHARS.test(hostPath))
    throw new Error('host path contains a control character')
  return `Z:${hostPath.replace(/\//g, '\\')}`
}

/** Quote-aware Windows command-line splitter: double quotes group, quotes are removed. */
function splitWindowsCommand(command: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let inQuotes = false
  let has = false
  for (const ch of command) {
    if (ch === '"') {
      inQuotes = !inQuotes
      has = true
    } else if (/\s/.test(ch) && !inQuotes) {
      if (has) tokens.push(cur)
      cur = ''
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (has) tokens.push(cur)
  return tokens
}

const SWITCH_TOKEN_RE = /^\/[A-Za-z0-9:]+$/

/**
 * Build the argv that runs one installscript process inside the bottle, or null when the entry
 * does not satisfy the containment rules (T-rkj-02). Argv array only, never a shell string.
 *
 * Auto kinds (vcredist/directx) accept switch-only arguments. Kind `other` (trusted opt-in)
 * additionally accepts a bare `msiexec` and quoted arguments; any token that referenced
 * `%INSTALLDIR%` must still resolve under `<installDirWin>\_CommonRedist\`.
 *
 * A `.cmd` process runs through `cmd /c`, which re-parses its command line, so for `.cmd` the
 * expanded path and every argument must be free of cmd metacharacters ({@link hasCmdMetachar}).
 * The install dir is held to the same rule for every kind, and no process path may hold a quote.
 */
export function buildRedistProcessCommandParts(
  proc: InstallScriptProcess,
  kind: SharedRedistKind,
  installDirWin: string
): string[] | null {
  const command = proc.command ?? ''
  if (CONTROL_CHARS.test(proc.process) || CONTROL_CHARS.test(command))
    return null
  if (CONTROL_CHARS.test(installDirWin) || hasCmdMetachar(installDirWin))
    return null
  const dir = installDirWin.replace(/\\+$/, '')
  const prefix = `${dir}\\_CommonRedist\\`.toLowerCase()
  const expand = (s: string) => s.replace(/%INSTALLDIR%/gi, dir)
  const contained = (expanded: string) =>
    expanded.toLowerCase().startsWith(prefix) && !hasDotDotSegment(expanded)

  const rawProc = proc.process.trim()
  const isMsiexec = kind === 'other' && rawProc.toLowerCase() === 'msiexec'
  const procPath = isMsiexec ? 'msiexec' : expand(rawProc)
  if (!isMsiexec && !contained(procPath)) return null
  if (procPath.includes('"')) return null
  const lowerProc = procPath.toLowerCase()
  if (!isMsiexec && !(lowerProc.endsWith('.exe') || lowerProc.endsWith('.cmd')))
    return null

  let args: string[]
  if (kind === 'other') {
    args = []
    for (const raw of splitWindowsCommand(command)) {
      const expanded = expand(raw)
      if (/%INSTALLDIR%/i.test(raw) && !contained(expanded)) return null
      args.push(expanded)
    }
  } else {
    args = command.split(/\s+/).filter((t) => t.length > 0)
    if (!args.every((t) => SWITCH_TOKEN_RE.test(t))) return null
  }

  if (isMsiexec) return ['msiexec', ...args]
  if (lowerProc.endsWith('.cmd')) {
    if (hasCmdMetachar(procPath) || args.some(hasCmdMetachar)) return null
    return ['cmd', '/c', procPath, ...args]
  }
  return [procPath, ...args]
}

function assertSafeRegValue(label: string, value: string): void {
  if (FORBIDDEN_CHARS.test(value))
    throw new Error(`${label} contains a forbidden character`)
}

/** `reg add` argv that writes Steam's HasRunKey mark (lowercased entry name, 32-bit view). */
export function buildHasRunKeyAddParts(key: string, name: string): string[] {
  assertSafeRegValue('HasRunKey', key)
  assertSafeRegValue('entry name', name)
  return [
    'reg',
    'add',
    key,
    '/v',
    name.toLowerCase(),
    '/t',
    'REG_DWORD',
    '/d',
    '1',
    '/reg:32',
    '/f'
  ]
}

/** `reg query` argv that reads the HasRunKey mark written by {@link buildHasRunKeyAddParts}. */
export function buildHasRunKeyQueryParts(key: string, name: string): string[] {
  assertSafeRegValue('HasRunKey', key)
  assertSafeRegValue('entry name', name)
  return ['reg', 'query', key, '/v', name.toLowerCase(), '/reg:32']
}

/** Parse the DWORD out of `reg query` stdout; null when no REG_DWORD value is present. */
export function parseRegQueryDword(stdout: string): number | null {
  const m = /REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout)
  return m ? parseInt(m[1], 16) : null
}

/** Wine's per-user driver selection key (Graphics value picks the display driver). */
export const WINE_DRIVERS_KEY = 'HKEY_CURRENT_USER\\Software\\Wine\\Drivers'

/** `reg query` argv for the Wine display driver choice (Graphics). */
export function buildWineGraphicsQueryParts(): string[] {
  return ['reg', 'query', WINE_DRIVERS_KEY, '/v', 'Graphics']
}

/** `reg add` argv that sets the Wine display driver (e.g. `null`). */
export function buildWineGraphicsSetParts(value: string): string[] {
  assertSafeRegValue('Graphics driver', value)
  return [
    'reg',
    'add',
    WINE_DRIVERS_KEY,
    '/v',
    'Graphics',
    '/t',
    'REG_SZ',
    '/d',
    value,
    '/f'
  ]
}

/** `reg delete` argv that removes the Graphics value (back to the default driver). */
export function buildWineGraphicsDeleteParts(): string[] {
  return ['reg', 'delete', WINE_DRIVERS_KEY, '/v', 'Graphics', '/f']
}

/** Parse the Graphics REG_SZ out of `reg query` stdout; '' for empty, null when absent. */
export function parseRegQueryGraphics(stdout: string): string | null {
  const m = /^[ \t]*Graphics[ \t]+REG_SZ(?:[ \t]+([^\r\n]*))?$/im.exec(stdout)
  return m ? (m[1] ?? '').trim() : null
}

/**
 * Steam accepts only exit code 0. Treating 3010 (reboot required) and 1638 (newer version
 * present) as done for `vcredist` is a deliberate, recorded deviation from Steam (RESEARCH Q5.6,
 * A4): direct 2005-2013 exes return them, and Steam would re-run those on every launch.
 */
export function isRedistSuccessExit(
  kind: SharedRedistKind,
  code: number | undefined
): boolean {
  if (code === 0) return true
  if (kind === 'vcredist') return code === 3010 || code === 1638
  return false
}

/** Opt-in ids from a known-fixes profile: numeric strings only, deduped. */
export function normaliseSharedRedistOptIn(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v === 'string' && /^\d+$/.test(v) && !out.includes(v))
      out.push(v)
  }
  return out
}

/**
 * Depot ids in a game's appinfo whose `depotfromapp` is exactly 228980, in appinfo order. Other
 * shared apps (e.g. 1007, which carries steamclient DLLs) are never included (T-rkj-05).
 */
export function declaredSharedRedistDepotIds(appinfo: unknown): string[] {
  const depots = (appinfo as { depots?: unknown } | null | undefined)?.depots
  if (!depots || typeof depots !== 'object') return []
  const out: string[] = []
  for (const [id, d] of Object.entries(depots as Record<string, unknown>)) {
    if (!/^\d+$/.test(id)) continue
    if (!d || typeof d !== 'object') continue
    const from = (d as { depotfromapp?: unknown }).depotfromapp
    if (
      (typeof from === 'string' || typeof from === 'number') &&
      String(from) === STEAM_COMMON_REDIST_APP_ID
    )
      out.push(id)
  }
  return out
}

const encodeKeyPart = (s: string) =>
  s.toLowerCase().replace(/%/g, '%25').replace(/\|/g, '%7C')

/**
 * Ledger key for one installscript entry (IN-02). With a HasRunKey it is `<key>|<name>`, both
 * lowercased, so it matches Steam's own (key, value) identity across depots. Without one it is
 * `|<depotId>|<name>`, so two such entries with the same name in different depots stay distinct.
 * `%` and `|` inside a part are percent-encoded, so a part can never forge a separator and the
 * two shapes (one `|` and two) can never collide.
 */
export function sharedRedistLedgerKey(
  hasRunKey: string | undefined,
  name: string,
  depotId: string
): string {
  if (hasRunKey === undefined)
    return `|${encodeKeyPart(depotId)}|${encodeKeyPart(name)}`
  return `${encodeKeyPart(hasRunKey)}|${encodeKeyPart(name)}`
}
