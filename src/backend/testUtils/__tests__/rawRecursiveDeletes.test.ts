import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findRawRecursiveDeletes,
  scanGuardedFiles
} from '../rawRecursiveDeletes'

describe('findRawRecursiveDeletes', () => {
  it('finds a single-line recursive delete, bare and qualified', () => {
    const src = [
      `import { rmSync } from 'fs'`,
      `rmSync(dir, { recursive: true })`,
      `fs.rmdirSync(dir, { recursive: true, force: true })`,
      `await fsp.rm(dir, { force: true, recursive: true })`,
      `await fs.promises.rm(dir, { recursive: true })`
    ].join('\n')
    const out = findRawRecursiveDeletes(src, 'a.ts')
    expect(out.map((o) => o.line)).toEqual([2, 3, 4, 5])
    expect(out[0]?.call).toBe('rmSync(dir, { recursive: true })')
  })

  it('finds a multi-line call and reports the line it starts on', () => {
    const src = `const x = 1\nrmSync(\n  join(a, b),\n  {\n    recursive: true,\n    force: true\n  }\n)\n`
    const out = findRawRecursiveDeletes(src, 'b.ts')
    expect(out).toHaveLength(1)
    expect(out[0]?.line).toBe(2)
  })

  it('ignores commented-out deletes, line and block, including a trailing comment', () => {
    const src = [
      `// rmSync(a, { recursive: true })`,
      `/* rmSync(b, {`,
      `     recursive: true }) */`,
      `doThing() // rmSync(c, { recursive: true })`,
      `/**`,
      ` * rmSync(d, { recursive: true })`,
      ` */`
    ].join('\n')
    expect(findRawRecursiveDeletes(src, 'c.ts')).toEqual([])
  })

  it('keeps line numbers right after a multi-line block comment', () => {
    const src = `/*\n one\n two\n*/\nrmSync(a, { recursive: true })\n`
    expect(findRawRecursiveDeletes(src, 'd.ts')[0]?.line).toBe(5)
  })

  it('ignores non-recursive deletes', () => {
    const src = [
      `rmSync(file)`,
      `rmSync(file, { force: true })`,
      `unlinkSync(file)`,
      `fs.rmdirSync(dir)`
    ].join('\n')
    expect(findRawRecursiveDeletes(src, 'e.ts')).toEqual([])
  })

  it('finds member calls whatever the receiver (WR-07)', () => {
    const probes = [
      `deps.rm(x, { recursive: true })`,
      `deps.fs.rmSync(x, { recursive: true })`,
      `nfs.rmSync(x, { recursive: true })`,
      `this.deps.fs.promises.rm(x, { recursive: true })`,
      `deps?.fs?.rmSync(x, { recursive: true })`,
      `store.rm(key, { recursive: true })`
    ]
    const out = findRawRecursiveDeletes(probes.join('\n'), 'g.ts')
    expect(out.map((o) => o.line)).toEqual([1, 2, 3, 4, 5, 6])
    expect(out.map((o) => o.call)).toEqual(probes)
    expect(out[1]?.call.startsWith('deps.fs.rmSync(')).toBe(true)
  })

  it('matches the name only at an identifier boundary', () => {
    const src = [
      `formSync(x, { recursive: true })`,
      `xrm(x, { recursive: true })`
    ].join('\n')
    expect(findRawRecursiveDeletes(src, 'h.ts')).toEqual([])
  })

  it('does not trip on a string that merely contains parentheses or comment markers', () => {
    const src = `rmSync(join(a, ')//'), { recursive: true })\n`
    const out = findRawRecursiveDeletes(src, 'f.ts')
    expect(out).toHaveLength(1)
  })

  it('orders offenders by file then line, stably', () => {
    const a = findRawRecursiveDeletes(
      `rm(a, {recursive:true})\nrm(b, {recursive:true})`,
      'z.ts'
    )
    expect(a.map((o) => o.line)).toEqual([1, 2])
  })
})

describe('scanGuardedFiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gamelib-rawdel-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const write = (name: string, body: string): string => {
    const p = join(dir, name)
    writeFileSync(p, body)
    return p
  }

  it('finds a seeded raw delete across files, sorted by file then line', () => {
    const b = write('b.ts', `x()\nrmSync(p, { recursive: true })\n`)
    const a = write('a.ts', `rmSync(p, { recursive: true })\n`)
    const clean = write('clean.ts', `rmSync(p)\n`)
    const out = scanGuardedFiles([b, a, clean], 3)
    expect(out.map((o) => [o.file, o.line])).toEqual([
      [a, 1],
      [b, 2]
    ])
  })

  it('an empty path list throws through the floor guard', () => {
    expect(() => scanGuardedFiles([], 1)).toThrow(/below the floor/)
  })

  it('fewer files than the floor throws', () => {
    const only = write('only.ts', 'x()\n')
    expect(() => scanGuardedFiles([only], 2)).toThrow(/below the floor/)
  })

  it('a missing file throws rather than scanning nothing', () => {
    expect(() => scanGuardedFiles([join(dir, 'nope.ts')], 1)).toThrow()
  })
})
