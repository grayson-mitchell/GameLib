/**
 * Fixture coverage for meta/graphifyCodeViz.ts. Every case runs against a
 * synthetic in-memory graph -- nothing here reads `graphify-out/graph.json`,
 * which is a gitignored build artifact that may not exist on a fresh clone
 * and whose contents change on every `graphify update .`.
 *
 * The properties worth pinning are the two that produce a WRONG PICTURE
 * rather than an error: a link left dangling at a pruned node (vis.js
 * resurrects the endpoint as an unlabelled dot, so the prune looks like it
 * silently failed), and a node with no `source_file` being swept up by a
 * prefix it does not have.
 */
import {
  AGGREGATE_NODE_LIMIT,
  DEFAULT_PRUNED_PREFIX,
  FULL_DETAIL_NODE_LIMIT,
  parseArgs,
  pruneBySourcePrefix,
  type GraphJson
} from '../graphifyCodeViz'

function graph(): GraphJson {
  return {
    directed: true,
    multigraph: false,
    built_at_commit: 'deadbeef',
    nodes: [
      { id: 'code-a', source_file: 'src/backend/ipc.ts' },
      { id: 'code-b', source_file: 'src/backend/launcher.ts' },
      { id: 'plan-a', source_file: '.planning/phases/34-01-PLAN.md' },
      { id: 'plan-b', source_file: '.planning/todos/pending/x.md' },
      // graphify emits `concept`/`rationale` nodes with no source file at all.
      { id: 'concept-a' }
    ],
    links: [
      { source: 'code-a', target: 'code-b', relation: 'call' },
      { source: 'code-a', target: 'plan-a', relation: 'mentions' },
      { source: 'plan-a', target: 'plan-b', relation: 'mentions' },
      { source: 'concept-a', target: 'code-b', relation: 'about' }
    ],
    hyperedges: [
      { nodes: ['code-a', 'code-b'] },
      { nodes: ['code-a', 'plan-a'] }
    ]
  }
}

describe('pruneBySourcePrefix', () => {
  it('drops nodes under the prefix and keeps the rest', () => {
    const {
      graph: out,
      kept,
      dropped
    } = pruneBySourcePrefix(graph(), DEFAULT_PRUNED_PREFIX)

    expect(out.nodes.map((n) => n.id)).toEqual([
      'code-a',
      'code-b',
      'concept-a'
    ])
    expect(kept).toBe(3)
    expect(dropped).toBe(2)
  })

  it('leaves no link pointing at a dropped node', () => {
    const { graph: out } = pruneBySourcePrefix(graph(), DEFAULT_PRUNED_PREFIX)

    const ids = new Set(out.nodes.map((n) => n.id))
    for (const link of out.links) {
      expect(ids.has(link.source)).toBe(true)
      expect(ids.has(link.target)).toBe(true)
    }
    expect(out.links).toHaveLength(2)
  })

  it('drops a hyperedge whole when any member is pruned', () => {
    const { graph: out } = pruneBySourcePrefix(graph(), DEFAULT_PRUNED_PREFIX)

    expect(out.hyperedges).toEqual([{ nodes: ['code-a', 'code-b'] }])
  })

  it('carries unknown top-level keys through untouched', () => {
    const { graph: out } = pruneBySourcePrefix(graph(), DEFAULT_PRUNED_PREFIX)

    expect(out.directed).toBe(true)
    expect(out.built_at_commit).toBe('deadbeef')
  })

  it('omits hyperedges entirely when the source graph had none', () => {
    const input = graph()
    delete input.hyperedges
    const { graph: out } = pruneBySourcePrefix(input, DEFAULT_PRUNED_PREFIX)

    expect('hyperedges' in out).toBe(false)
  })

  it('keeps everything when nothing matches the prefix', () => {
    const { kept, dropped } = pruneBySourcePrefix(graph(), 'no/such/dir/')

    expect(kept).toBe(5)
    expect(dropped).toBe(0)
  })

  it('does not mutate the input graph', () => {
    const input = graph()
    pruneBySourcePrefix(input, DEFAULT_PRUNED_PREFIX)

    expect(input.nodes).toHaveLength(5)
    expect(input.links).toHaveLength(4)
  })
})

describe('parseArgs', () => {
  it('defaults to full detail on the planning prefix', () => {
    expect(parseArgs([])).toEqual({
      aggregate: false,
      prefix: DEFAULT_PRUNED_PREFIX
    })
  })

  it('accepts --aggregate and both --prefix spellings', () => {
    expect(parseArgs(['--aggregate']).aggregate).toBe(true)
    expect(parseArgs(['--prefix', 'docs/']).prefix).toBe('docs/')
    expect(parseArgs(['--prefix=docs/']).prefix).toBe('docs/')
  })

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unrecognized/)
  })

  it('rejects --prefix with no value', () => {
    expect(() => parseArgs(['--prefix'])).toThrow(/requires a path prefix/)
  })
})

describe('node limits', () => {
  // `graphify export html` hardcodes its own default to 5000 and ignores
  // GRAPHIFY_VIZ_NODE_LIMIT, so passing a limit below the real node count is
  // what silently produces an aggregated view instead of the promised
  // node-level one. The full-detail constant must stay comfortably above the
  // code-only node count (~8.1k as of 2026-08-22).
  it('asks for full detail well above the current code node count', () => {
    expect(FULL_DETAIL_NODE_LIMIT).toBeGreaterThan(50_000)
  })

  it('forces aggregation with a limit below any real graph', () => {
    expect(AGGREGATE_NODE_LIMIT).toBeLessThan(2)
  })
})
