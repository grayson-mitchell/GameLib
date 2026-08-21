/**
 * Renders a CODE-ONLY `graph.html` from the graphify knowledge graph.
 *
 * Context: `.planning/` used to be excluded from the graph entirely (see
 * `.graphifyignore`). It was unignored on 2026-08-22 so `graphify query` could
 * reach phase plans, todos and debug ledgers -- which took the graph from
 * 7,985 nodes to 31,844, of which 23,212 are `document` nodes and only 8,321
 * are code. That is the right trade for QUERYING (the extra nodes are the
 * point) but the wrong one for the VISUALIZATION: a 31 MB `graph.html` where
 * three quarters of the nodes are planning prose is not a picture of the
 * codebase.
 *
 * graphify has no flag for this. `to_html()` (`exporters/html.py`) accepts
 * only `node_limit` and `learning_overlay`, and `graphify export html`'s
 * argument parser has no file- or type-based filter. But the exporter renders
 * whatever graph it is pointed at, so the filtering has to happen upstream:
 * write a pruned copy of `graph.json` to a side directory and export THAT.
 * `graphify-out/graph.json` is never modified -- queries keep the full graph.
 *
 * Deliberately manual, not wired into a hook: `graphify update .` regenerates
 * the full 31 MB `graph.html` from the unfiltered graph every time it runs, so
 * this is a post-step you re-run when you actually want to look at the picture.
 *
 * Usage:
 *   pnpm graph:viz                      # code-only, full node-level detail
 *   pnpm graph:viz --aggregate          # community-aggregated view (~840 nodes)
 *   pnpm graph:viz --prefix docs/       # prune a different path instead
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Graph shape. Only the fields this script reads are typed; everything else is
// carried through verbatim by the object spread in `pruneBySourcePrefix`, so
// an unknown top-level key added by a future graphify version survives the
// round trip rather than being silently dropped from the exported view.
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string
  /** Repo-relative path the node was extracted from, e.g. `src/backend/ipc.ts`. */
  source_file?: string
  [key: string]: unknown
}

export interface GraphLink {
  source: string
  target: string
  [key: string]: unknown
}

export interface GraphHyperedge {
  nodes?: string[]
  [key: string]: unknown
}

export interface GraphJson {
  nodes: GraphNode[]
  links: GraphLink[]
  hyperedges?: GraphHyperedge[]
  [key: string]: unknown
}

/** The path prefix pruned from the visualization by default. */
export const DEFAULT_PRUNED_PREFIX = '.planning/'

/**
 * graphify's own `to_html` refuses full node-level detail above a limit and
 * falls back to an aggregated community meta-graph instead. `graphify export
 * html` defaults that limit to a hardcoded 5000 (`cli.py`) and does NOT read
 * `GRAPHIFY_VIZ_NODE_LIMIT` on this path -- only the `graphify update` path
 * does. So the limit must be passed explicitly on every invocation or the
 * export silently aggregates; the aggregated view is legible, but it is not
 * what `pnpm graph:viz` promises. Passed as `--node-limit` below.
 */
export const FULL_DETAIL_NODE_LIMIT = 100_000

/** `to_html`'s own aggregation trigger -- any limit below the node count works. */
export const AGGREGATE_NODE_LIMIT = 1

/**
 * Returns a copy of `graph` with every node whose `source_file` starts with
 * `prefix` removed, along with every link and hyperedge that referenced one.
 *
 * Dropping the incident links matters: vis.js in the exported HTML creates a
 * node on demand for any edge endpoint it has not seen, so a dangling link to
 * a pruned `.planning/` node would resurrect that node as an unlabelled dot.
 * Hyperedges are dropped whole rather than narrowed -- a hyperedge is a claim
 * about a SET of nodes, and a partial set is a different claim, not a smaller
 * one.
 *
 * A node with no `source_file` at all (graphify emits some `concept` and
 * `rationale` nodes this way) never matches a prefix and is always kept.
 */
export function pruneBySourcePrefix(
  graph: GraphJson,
  prefix: string
): { graph: GraphJson; kept: number; dropped: number } {
  const kept = new Set<string>()
  for (const node of graph.nodes) {
    if (!(node.source_file ?? '').startsWith(prefix)) kept.add(node.id)
  }

  const nodes = graph.nodes.filter((node) => kept.has(node.id))
  const links = graph.links.filter(
    (link) => kept.has(link.source) && kept.has(link.target)
  )
  const hyperedges = graph.hyperedges?.filter((edge) =>
    (edge.nodes ?? []).every((id) => kept.has(id))
  )

  return {
    graph: {
      ...graph,
      nodes,
      links,
      ...(hyperedges === undefined ? {} : { hyperedges })
    },
    kept: nodes.length,
    dropped: graph.nodes.length - nodes.length
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

export interface CliOptions {
  aggregate: boolean
  prefix: string
}

export function parseArgs(argv: string[]): CliOptions {
  let aggregate = false
  let prefix = DEFAULT_PRUNED_PREFIX

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--aggregate') {
      aggregate = true
    } else if (arg === '--prefix') {
      const value = argv[i + 1]
      if (value === undefined) {
        throw new Error('--prefix requires a path prefix')
      }
      prefix = value
      i++
    } else if (arg.startsWith('--prefix=')) {
      prefix = arg.slice('--prefix='.length)
    } else {
      throw new Error(`unrecognized argument "${arg}"`)
    }
  }

  return { aggregate, prefix }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  // A usage mistake is an operator error, not a crash: without this the throw
  // escapes to Node's default handler and the message the operator needs is
  // buried under a stack trace through the bundled tmpdir copy of this file.
  let options: CliOptions
  try {
    options = parseArgs(argv)
  } catch (err) {
    console.error(`[graph:viz] ${(err as Error).message}`)
    return 1
  }
  const { aggregate, prefix } = options

  // NOT __dirname -- this file is bundled by meta/runTs.cjs into a private
  // tmpdir and run from there, so __dirname points nowhere near the repo.
  // `pnpm graph:viz` always runs from the repo root (meta/cleanDistMac.ts
  // documents the same trap), so cwd-relative is correct.
  const outDir = path.join('graphify-out')
  const sourceGraph = path.join(outDir, 'graph.json')
  const vizDir = path.join(outDir, 'viz')
  const vizGraph = path.join(vizDir, 'graph.json')
  // `graphify export html` writes graph.html into the directory holding the
  // graph it was given, which is why the pruned copy lives in its own
  // subdirectory: exporting in place would clobber the full graph.html that
  // `graphify update .` maintains.
  const vizHtml = path.join(vizDir, 'graph.html')

  if (!existsSync(sourceGraph)) {
    console.error(
      `[graph:viz] ${sourceGraph} not found -- run \`graphify update .\` first`
    )
    return 1
  }

  const graph = JSON.parse(readFileSync(sourceGraph, 'utf-8')) as GraphJson
  const { graph: pruned, kept, dropped } = pruneBySourcePrefix(graph, prefix)

  if (kept === 0) {
    console.error(
      `[graph:viz] pruning "${prefix}" removed every node -- refusing to ` +
        `export an empty graph`
    )
    return 1
  }

  mkdirSync(vizDir, { recursive: true })
  writeFileSync(vizGraph, JSON.stringify(pruned))

  // Community labels live in a sibling of the graph file, so the pruned copy
  // needs its own. Without it the exporter falls back to "Community 0", "1",
  // ... and the legend becomes useless. Community IDs are per-node attributes
  // that pruning preserves, so the existing label file still applies; labels
  // for communities that pruning emptied are simply never referenced.
  const labels = '.graphify_labels.json'
  if (existsSync(path.join(outDir, labels))) {
    copyFileSync(path.join(outDir, labels), path.join(vizDir, labels))
  }

  console.log(
    `[graph:viz] kept ${kept} nodes, dropped ${dropped} under "${prefix}"`
  )

  // spawnSync is fine here where meta/runTs.cjs had to avoid it: that file
  // registers signal handlers, which spawnSync's blocked event loop would
  // starve. This script registers none, so Node's default disposition applies
  // and Ctrl-C reaches the inherited-stdio child directly.
  const result = spawnSync(
    'graphify',
    [
      'export',
      'html',
      '--graph',
      vizGraph,
      '--node-limit',
      String(aggregate ? AGGREGATE_NODE_LIMIT : FULL_DETAIL_NODE_LIMIT)
    ],
    { stdio: 'inherit' }
  )

  if (result.error) {
    const enoent = (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    console.error(
      enoent
        ? '[graph:viz] `graphify` not found on PATH'
        : `[graph:viz] failed to launch graphify: ${result.error.message}`
    )
    return 1
  }

  if (result.status !== 0) {
    console.error(`[graph:viz] graphify export html exited ${result.status}`)
    return result.status ?? 1
  }

  console.log(`[graph:viz] wrote ${vizHtml}`)
  return 0
}

// Guard idiom shared with meta/cleanDistMac.ts: this file is bundled and run
// as a CLI (which sets `require.main`), but is also imported directly by its
// jest suite, so JEST_WORKER_ID is what reliably tells the two apart.
if (!process.env.JEST_WORKER_ID) {
  process.exit(main())
}
