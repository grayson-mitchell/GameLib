/**
 * Phase 63 (D-07): THE definition of what scanner parity ignores. The Jest
 * golden test (63-03), the Rust golden harness (63-05) and the sweep (63-10)
 * implement or import exactly these rules. Nothing else may be normalised
 * without a written reason here.
 *
 *  1. Any `diagnostics` key is deleted (log lines are not part of the result).
 *  2. A non-null `readError` becomes `<read-error>` (OS error text differs).
 *  3. `scan_steam_api_imports` `status: 'error'` with an `error` of the
 *     objdump-vs-native unreadable-PE family becomes `<unreadable-pe>`.
 *  4. `scan_winemac_metal_exports` reason `could not read winemac.so: ...`
 *     becomes `could not read winemac.so: <io>`.
 *  5. With `fixturesRoot`, string values starting with it have the prefix
 *     replaced by `${FIXTURES}`.
 *  6. Path separators: in `winemacPath`, `real` and any rule-5 tokenised
 *     string, `\` becomes `/` (applied after rule 5; the root matches in
 *     either separator form), so goldens compare equal on Windows.
 */
import type { ScanOp } from './scanTypes'

const UNREADABLE_PE =
  /^(Failed to run objdump|objdump exited with code|not a parseable PE|could not read )/
const PATH_FIELDS = new Set(['winemacPath', 'real'])
const TOKEN = '${FIXTURES}'

function tokenise(value: string, root: string | undefined): string | null {
  if (!root) return null
  const rootFwd = root.replace(/\\/g, '/')
  const rootBack = root.replace(/\//g, '\\')
  for (const r of [root, rootFwd, rootBack]) {
    if (value.startsWith(r)) {
      return (TOKEN + value.slice(r.length)).replace(/\\/g, '/')
    }
  }
  return null
}

function walk(
  op: ScanOp,
  node: unknown,
  key: string | undefined,
  root: string | undefined,
  parent: Record<string, unknown> | undefined
): unknown {
  if (Array.isArray(node)) {
    return node.map((v) => walk(op, v, undefined, root, undefined))
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    const src = node as Record<string, unknown>
    for (const [k, v] of Object.entries(src)) {
      if (k === 'diagnostics') continue
      out[k] = walk(op, v, k, root, src)
    }
    return out
  }
  if (typeof node !== 'string') {
    if (key === 'readError' && node !== null && node !== undefined) {
      return '<read-error>'
    }
    return node
  }
  if (key === 'readError') return '<read-error>'
  if (
    op === 'scan_steam_api_imports' &&
    key === 'error' &&
    parent?.status === 'error' &&
    UNREADABLE_PE.test(node)
  ) {
    return '<unreadable-pe>'
  }
  if (
    op === 'scan_winemac_metal_exports' &&
    key === 'reason' &&
    node.startsWith('could not read winemac.so: ')
  ) {
    return 'could not read winemac.so: <io>'
  }
  const tokenised = tokenise(node, root)
  if (tokenised !== null) return tokenised
  if (key !== undefined && PATH_FIELDS.has(key)) {
    return node.replace(/\\/g, '/')
  }
  return node
}

export function normalizeScanResult(
  op: ScanOp,
  result: unknown,
  fixturesRoot?: string
): unknown {
  return walk(op, result, undefined, fixturesRoot, undefined)
}
