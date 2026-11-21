#!/usr/bin/env node
// Spike 092 -- store mirror protocol model (phase 85, S1). Throwaway; plain Node ESM, no dependencies.
//
//   node sim.mjs [--runs N] [--seed S] [--mutant NAME] [--selftest]
//
// Models ONE Rust-owned store file, a sidecar MirrorCell over it, and a renderer. It checks the protocol the
// research proposed (85-RESEARCH.md Pattern 3, Pitfalls 6/7/8) against random interleavings of every
// asynchronous step. It prints counts only; on a violation it prints "counterexample" plus the action trace and
// exits 1.
//
// Protocol under test
//   Rust    : ONE writer. Every write (renderer-native or a sidecar frame) goes through rustApply(): compute the
//             next state, PERSIST, and only then commit rev+1 and EMIT {rev, op, originSeq?} to the sidecar queue
//             and the renderer push queue. A failed persist rolls the op back, consumes no rev and sends the
//             originating sidecar a {nack, originSeq}. Sidecar frames arrive FIFO; renderer writes are unordered.
//   Sidecar : a MirrorCell per file PATH (two TS names share it). base = state at baseRev; pending = unacked local
//             ops; view = pending folded over base. A local write is applied to pending synchronously and sent as
//             one FIFO frame. A Rust event with rev <= baseRev is dropped (cell created late, event already
//             reflected in what it loaded); otherwise rev must be baseRev+1 (in-order, gapless), is applied to base,
//             and removes the pending op named by originSeq. A nack removes the pending op.
//   Renderer: unhydrated until the first snapshot {rev, state} arrives; pushes before that are buffered and
//             replayed with rev > snapshot.rev; afterwards a push with rev <= lastRev is dropped, otherwise it must
//             be lastRev+1. A snapshot arriving hydrated is applied only if snapshot.rev > lastRev. Snapshots and
//             pushes travel by different routes: any delivery order.
//   Ops     : state-assigning and idempotent: set(k,v) delete(k) clear replace(obj).
//
// Invariants checked after EVERY action
//   P  prefix      : mirror base == Rust history[baseRev]; hydrated renderer view == Rust history[lastRev]
//   G  gapless     : an applied event/push has rev == last+1 (no gap, no replay)
//   V  visible     : right after a local write, the view equals the previous view with the op applied (all names)
//   R  read-yours  : per key, the view is the effect of the LAST unacked local op touching it, else base[k]
// and at quiescence
//   C  convergence : every mirror view, every renderer view and Rust's state are equal; nothing left pending.
//
// `--mutant NAME` breaks one rule; `--selftest` proves every mutant is caught (so the checker can fail).

import process from 'node:process'

const KEYS = ['a', 'b', 'c']
const MUTANTS = [
  'none',
  'no-pending', //   the view ignores unacked local writes
  'no-ack', //       an event never removes its originSeq from pending
  'no-nack', //      a failed persist is never reported to the sidecar
  'emit-first', //   emit before persist (and keep the emitted rev when persist fails)
  'no-rev-filter', //observers apply events/pushes without the rev checks
  'per-instance' //  one cell per TS name instead of one per file path
]

function parseArgs(argv) {
  const out = { runs: 10000, seed: 85, mutant: 'none', selftest: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--runs') out.runs = Number(argv[++i])
    else if (a === '--seed') out.seed = Number(argv[++i])
    else if (a === '--mutant') out.mutant = argv[++i]
    else if (a === '--selftest') out.selftest = true
    else throw new Error(`unknown argument ${a}`)
  }
  if (!MUTANTS.includes(out.mutant)) throw new Error(`unknown mutant ${out.mutant}`)
  return out
}

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function applyOp(state, op) {
  switch (op.t) {
    case 'set':
      return { ...state, [op.k]: op.v }
    case 'delete': {
      const s = { ...state }
      delete s[op.k]
      return s
    }
    case 'clear':
      return {}
    case 'replace':
      return { ...op.obj }
  }
}

// What an op leaves at key k: {touched:false} or {touched:true, has, v}.
function effect(op, k) {
  switch (op.t) {
    case 'set':
      return op.k === k ? { touched: true, has: true, v: op.v } : { touched: false }
    case 'delete':
      return op.k === k ? { touched: true, has: false } : { touched: false }
    case 'clear':
      return { touched: true, has: false }
    case 'replace':
      return k in op.obj ? { touched: true, has: true, v: op.obj[k] } : { touched: true, has: false }
  }
}

const canon = (s) => JSON.stringify(Object.keys(s).sort().map((k) => [k, s[k]]))
const same = (a, b) => canon(a) === canon(b)
const showOp = (op) =>
  op.t === 'set' ? `set(${op.k},${op.v})` : op.t === 'delete' ? `delete(${op.k})` : op.t === 'clear' ? 'clear' : `replace(${canon(op.obj)})`

class Violation extends Error {}

class Machine {
  constructor(mutant, rnd, plan) {
    this.mutant = mutant
    this.rnd = rnd
    this.plan = plan // { rendererOps, sidecarOps, failMode, fetchBudget }
    this.rust = { state: {}, rev: 0 }
    this.history = [{}]
    this.frameQ = []
    this.sideQ = []
    this.pushQ = []
    this.snapQ = []
    this.cells = null // { A, B }
    this.unacked = [] // independent oracle of the sidecar's unacked local ops
    this.renderer = { hydrated: false, view: {}, lastRev: 0, buffer: [] }
    this.fetches = 0
    this.seq = 0
    this.trace = []
    this.stats = { events: 0, lateDropped: 0, staleSnap: 0, stalePush: 0, nacks: 0, conflicts: 0, failedPersists: 0 }
  }

  log(s) {
    this.trace.push(s)
  }
  fail(code, msg) {
    throw new Violation(`${code}: ${msg}`)
  }

  uniqueCells() {
    return this.cells ? [...new Set([this.cells.A, this.cells.B])] : []
  }
  view(cell) {
    if (this.mutant === 'no-pending') return cell.base
    return cell.pending.reduce((s, p) => applyOp(s, p.op), cell.base)
  }

  // ---- Rust: the single writer ------------------------------------------------------------------------
  rustApply(op, originSeq, who) {
    const next = applyOp(this.rust.state, op)
    const rev = this.rust.rev + 1
    const ev = { kind: 'evt', rev, op, originSeq }
    if (this.mutant === 'emit-first') this.emit(ev)
    const fails = this.plan.failMode && this.rnd() < 0.12
    if (fails) {
      this.stats.failedPersists++
      this.log(`rust: persist FAILED for ${who} ${showOp(op)} (rolled back, no rev consumed)`)
      if (originSeq !== undefined && this.mutant !== 'no-nack') {
        this.sideQ.push({ kind: 'nack', originSeq })
        this.stats.nacks++
      }
      return false
    }
    this.rust.state = next
    this.rust.rev = rev
    this.history[rev] = next
    if (this.mutant !== 'emit-first') this.emit(ev)
    this.log(`rust: ${who} ${showOp(op)} -> rev ${rev}`)
    return true
  }
  emit(ev) {
    this.sideQ.push(ev)
    this.pushQ.push(ev)
  }

  // ---- actions ----------------------------------------------------------------------------------------
  rendererWrite() {
    const op = this.plan.rendererOps.shift()
    if (this.unacked.length > 0) this.stats.conflicts++
    this.rustApply(op, undefined, 'renderer')
  }
  processFrame() {
    const f = this.frameQ.shift()
    this.rustApply(f.op, f.seq, `sidecar#${f.seq}`)
  }
  createCell() {
    const mk = () => ({ base: { ...this.rust.state }, baseRev: this.rust.rev, pending: [] })
    this.cells = this.mutant === 'per-instance' ? { A: mk(), B: mk() } : (() => {
      const c = mk()
      return { A: c, B: c }
    })()
    this.log(`sidecar: cell created at rev ${this.rust.rev}`)
  }
  sidecarWrite() {
    const { op, name } = this.plan.sidecarOps.shift()
    const cell = this.cells[name]
    const before = { A: this.view(this.cells.A), B: this.view(this.cells.B) }
    const seq = ++this.seq
    cell.pending.push({ seq, op })
    this.unacked.push({ seq, op })
    this.frameQ.push({ seq, op })
    this.log(`sidecar[${name}]: write ${showOp(op)} seq ${seq}`)
    // V: visible at once, through every TS name over the file.
    for (const n of ['A', 'B']) {
      const want = applyOp(before[n], op)
      if (!same(this.view(this.cells[n]), want)) {
        this.fail('V', `after sidecar write ${showOp(op)} the view via name ${n} is ${canon(this.view(this.cells[n]))}, expected ${canon(want)}`)
      }
    }
  }
  deliverSide() {
    const ev = this.sideQ.shift()
    const cells = this.uniqueCells()
    this.log(`sidecar: deliver ${ev.kind === 'nack' ? `nack(${ev.originSeq})` : `evt rev ${ev.rev}${ev.originSeq ? ` ack ${ev.originSeq}` : ''}`}`)
    if (ev.originSeq !== undefined) this.unacked = this.unacked.filter((p) => p.seq !== ev.originSeq)
    if (cells.length === 0) return // no cell yet: nothing to apply, the cell will load a later state
    for (const cell of cells) {
      if (ev.kind === 'nack') {
        cell.pending = cell.pending.filter((p) => p.seq !== ev.originSeq)
        continue
      }
      this.stats.events++
      if (this.mutant !== 'no-rev-filter') {
        if (ev.rev <= cell.baseRev) {
          this.stats.lateDropped++
          if (ev.originSeq !== undefined && cell.pending.some((p) => p.seq === ev.originSeq)) {
            this.fail('C', `event rev ${ev.rev} acks seq ${ev.originSeq} but was dropped as already reflected (baseRev ${cell.baseRev}); the op would stay pending forever`)
          }
          continue
        }
        if (ev.rev !== cell.baseRev + 1) this.fail('G', `mirror got rev ${ev.rev} at baseRev ${cell.baseRev}`)
      }
      cell.base = applyOp(cell.base, ev.op)
      cell.baseRev = this.mutant === 'no-rev-filter' ? ev.rev : ev.rev
      if (this.mutant !== 'no-ack' && ev.originSeq !== undefined) {
        cell.pending = cell.pending.filter((p) => p.seq !== ev.originSeq)
      }
    }
  }
  deliverPush() {
    const ev = this.pushQ.shift()
    const r = this.renderer
    this.log(`renderer: push rev ${ev.rev}`)
    if (!r.hydrated) {
      r.buffer.push(ev)
      return
    }
    this.rendererApply(ev)
  }
  rendererApply(ev) {
    const r = this.renderer
    if (this.mutant !== 'no-rev-filter') {
      if (ev.rev <= r.lastRev) {
        this.stats.stalePush++
        return
      }
      if (ev.rev !== r.lastRev + 1) this.fail('G', `renderer got rev ${ev.rev} at lastRev ${r.lastRev}`)
    }
    r.view = applyOp(r.view, ev.op)
    r.lastRev = ev.rev
  }
  fetch() {
    this.fetches++
    this.snapQ.push({ rev: this.rust.rev, state: { ...this.rust.state } })
    this.log(`renderer: fetch issued (snapshot rev ${this.rust.rev})`)
  }
  deliverSnap() {
    const i = Math.floor(this.rnd() * this.snapQ.length)
    const snap = this.snapQ.splice(i, 1)[0]
    const r = this.renderer
    this.log(`renderer: snapshot rev ${snap.rev} arrives`)
    if (r.hydrated && snap.rev <= r.lastRev) {
      this.stats.staleSnap++
      return
    }
    r.view = { ...snap.state }
    r.lastRev = snap.rev
    if (!r.hydrated) {
      r.hydrated = true
      const buffered = r.buffer
      r.buffer = []
      for (const ev of buffered) if (ev.rev > snap.rev || this.mutant === 'no-rev-filter') this.rendererApply(ev)
    }
  }

  // ---- invariants -------------------------------------------------------------------------------------
  check() {
    for (const cell of this.uniqueCells()) {
      const h = this.history[cell.baseRev]
      if (!h || !same(cell.base, h)) {
        this.fail('P', `mirror base ${canon(cell.base)} is not Rust's state at rev ${cell.baseRev} (${h ? canon(h) : 'no such rev'})`)
      }
    }
    const r = this.renderer
    if (r.hydrated) {
      const h = this.history[r.lastRev]
      if (!h || !same(r.view, h)) {
        this.fail('P', `renderer view ${canon(r.view)} is not Rust's state at rev ${r.lastRev} (${h ? canon(h) : 'no such rev'})`)
      }
    }
    if (this.cells) {
      for (const name of ['A', 'B']) {
        const cell = this.cells[name]
        const v = this.view(cell)
        for (const k of KEYS) {
          let want
          for (let i = this.unacked.length - 1; i >= 0 && !want; i--) {
            const e = effect(this.unacked[i].op, k)
            if (e.touched) want = e
          }
          const has = want ? want.has : k in cell.base
          const val = want ? want.v : cell.base[k]
          if (k in v !== has || (has && v[k] !== val)) {
            this.fail('R', `name ${name} reads ${k}=${k in v ? v[k] : '<absent>'}; the last unacked local op (or base) says ${has ? val : '<absent>'}`)
          }
        }
      }
    }
  }
  checkQuiescent() {
    for (const cell of this.uniqueCells()) {
      if (cell.pending.length !== 0) this.fail('C', `${cell.pending.length} op(s) still pending at quiescence`)
      const v = this.view(cell)
      if (!same(v, this.rust.state)) this.fail('C', `mirror view ${canon(v)} != Rust ${canon(this.rust.state)}`)
    }
    if (!same(this.renderer.view, this.rust.state)) {
      this.fail('C', `renderer view ${canon(this.renderer.view)} != Rust ${canon(this.rust.state)}`)
    }
  }

  enabled() {
    const p = this.plan
    const out = []
    if (p.rendererOps.length) out.push(['rendererWrite', () => this.rendererWrite()])
    if (!this.cells) out.push(['createCell', () => this.createCell()])
    if (this.cells && p.sidecarOps.length) out.push(['sidecarWrite', () => this.sidecarWrite()])
    if (this.frameQ.length) out.push(['processFrame', () => this.processFrame()])
    if (this.sideQ.length) out.push(['deliverSide', () => this.deliverSide()])
    if (this.pushQ.length) out.push(['deliverPush', () => this.deliverPush()])
    if (this.fetches < p.fetchBudget) out.push(['fetch', () => this.fetch()])
    if (this.snapQ.length) out.push(['deliverSnap', () => this.deliverSnap()])
    return out
  }

  run() {
    const ids = []
    for (let guard = 0; guard < 5000; guard++) {
      const en = this.enabled()
      if (en.length === 0) break
      const [id, fn] = en[Math.floor(this.rnd() * en.length)]
      ids.push(id[0] + (id === 'deliverSide' ? 'S' : id === 'deliverPush' ? 'P' : id === 'deliverSnap' ? 'N' : ''))
      fn()
      this.check()
    }
    this.checkQuiescent()
    return ids.join('')
  }
}

function genOp(rnd, counter) {
  const k = KEYS[Math.floor(rnd() * KEYS.length)]
  const x = rnd()
  if (x < 0.55) return { t: 'set', k, v: ++counter.n }
  if (x < 0.75) return { t: 'delete', k }
  if (x < 0.85) return { t: 'clear' }
  const obj = {}
  for (const kk of KEYS) if (rnd() < 0.5) obj[kk] = ++counter.n
  return { t: 'replace', obj }
}

function genPlan(rnd) {
  const counter = { n: 0 }
  const total = 2 + Math.floor(rnd() * 19) // 2..20
  const rendererOps = []
  const sidecarOps = []
  for (let i = 0; i < total; i++) {
    const op = genOp(rnd, counter)
    if (rnd() < 0.5) rendererOps.push(op)
    else sidecarOps.push({ op, name: rnd() < 0.5 ? 'A' : 'B' })
  }
  return { rendererOps, sidecarOps, failMode: rnd() < 0.3, fetchBudget: 1 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0), total }
}

// The fixed trace from the plan: renderer set a=1 and sidecar set a=2 sent before the renderer's event arrives.
function fixedTrace(mutant) {
  const m = new Machine(mutant, () => 0.5, { rendererOps: [], sidecarOps: [], failMode: false, fetchBudget: 0 })
  const step = (label, fn) => {
    fn()
    m.check()
    m.log(`   [fixed] ${label}`)
  }
  step('create cell', () => m.createCell())
  m.plan.sidecarOps.push({ op: { t: 'set', k: 'a', v: 2 }, name: 'A' })
  step('sidecar set a=2 (frame queued)', () => m.sidecarWrite())
  m.plan.rendererOps.push({ t: 'set', k: 'a', v: 1 })
  step('renderer set a=1 reaches Rust first', () => m.rendererWrite())
  const readA = () => m.view(m.cells.B).a
  if (readA() !== 2 && mutant === 'none') m.fail('R', `read-your-writes: sidecar reads a=${readA()} before any event`)
  step('rev 1 event delivered to the sidecar', () => m.deliverSide())
  if (readA() !== 2 && mutant === 'none') m.fail('R', `read-your-writes: sidecar reads a=${readA()} after the renderer event`)
  step('Rust processes the sidecar frame -> rev 2', () => m.processFrame())
  step('rev 2 event (ack) delivered', () => m.deliverSide())
  while (m.pushQ.length) m.deliverPush()
  m.fetch()
  m.deliverSnap()
  m.checkQuiescent()
  if (m.rust.state.a !== 2 || readA() !== 2) m.fail('C', `final a: Rust=${m.rust.state.a} mirror=${readA()}`)
}

function runMany(mutant, runs, seed) {
  const agg = { events: 0, lateDropped: 0, staleSnap: 0, stalePush: 0, nacks: 0, conflicts: 0, failedPersists: 0, ops: 0 }
  const distinct = new Set()
  for (let i = 0; i < runs; i++) {
    const rnd = mulberry32((seed * 100003 + i) >>> 0)
    const plan = genPlan(rnd)
    const m = new Machine(mutant, rnd, plan)
    let sig
    try {
      sig = m.run()
    } catch (e) {
      if (!(e instanceof Violation)) throw e
      return { ok: false, run: i, seed, message: e.message, trace: m.trace }
    }
    distinct.add(`${plan.total}:${sig}`)
    for (const k of Object.keys(m.stats)) agg[k] += m.stats[k]
    agg.ops += plan.total
  }
  return { ok: true, agg, distinct: distinct.size }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.selftest) {
    let allKilled = true
    for (const mu of MUTANTS.filter((x) => x !== 'none')) {
      let killedAt = -1
      try {
        fixedTrace(mu)
      } catch (e) {
        if (!(e instanceof Violation)) throw e
        killedAt = 0
      }
      if (killedAt < 0) {
        const r = runMany(mu, 3000, args.seed)
        if (!r.ok) killedAt = r.run + 1
      }
      console.log(`mutant ${mu.padEnd(14)} ${killedAt >= 0 ? `caught (${killedAt === 0 ? 'fixed trace' : `after ${killedAt} random run(s)`})` : 'NOT CAUGHT'}`)
      if (killedAt < 0) allKilled = false
    }
    process.exit(allKilled ? 0 : 1)
  }

  try {
    fixedTrace(args.mutant)
    console.log(`fixed trace (renderer a=1 vs sidecar a=2): mutant=${args.mutant} converged, read-your-writes held`)
  } catch (e) {
    if (!(e instanceof Violation)) throw e
    console.log(`counterexample (fixed trace, mutant=${args.mutant}): ${e.message}`)
    process.exit(1)
  }

  const r = runMany(args.mutant, args.runs, args.seed)
  if (!r.ok) {
    console.log(`counterexample (mutant=${args.mutant}, run ${r.run}, seed ${r.seed}): ${r.message}`)
    for (const line of r.trace) console.log(`  ${line}`)
    process.exit(1)
  }
  const a = r.agg
  console.log(`runs=${args.runs} seed=${args.seed} mutant=${args.mutant}: all invariants held (P prefix, G gapless, V visible, R read-your-writes, C convergence)`)
  console.log(`  distinct interleavings=${r.distinct} total ops=${a.ops} events applied=${a.events}`)
  console.log(`  late-cell events dropped=${a.lateDropped} stale pushes dropped=${a.stalePush} stale snapshots dropped=${a.staleSnap}`)
  console.log(`  renderer-vs-sidecar conflicts (renderer write while a local op was unacked)=${a.conflicts}`)
  console.log(`  persist failures injected=${a.failedPersists} nacks delivered=${a.nacks}`)
}

main()
