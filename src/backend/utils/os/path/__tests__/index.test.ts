import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findExecutableOnPath,
  hasExecutable,
  searchForExecutableOnPath
} from '../index'

describe('findExecutableOnPath', () => {
  let root: string
  let a: string
  let b: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gl-path-'))
    a = join(root, 'a')
    b = join(root, 'b')
    mkdirSync(a)
    mkdirSync(b)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const exe = (dir: string, name: string, mode = 0o755) => {
    const p = join(dir, name)
    writeFileSync(p, '#!/bin/sh\n')
    chmodSync(p, mode)
    return p
  }

  it('finds the executable in a later PATH dir', () => {
    const p = exe(b, 'tool')
    expect(findExecutableOnPath('tool', { PATH: `${a}:${b}` }, 'linux')).toBe(p)
  })

  it('skips a non-executable file', () => {
    exe(a, 'tool', 0o644)
    expect(findExecutableOnPath('tool', { PATH: `${a}:${b}` }, 'linux')).toBe(
      null
    )
  })

  it('skips a directory of the same name', () => {
    mkdirSync(join(a, 'tool'))
    expect(findExecutableOnPath('tool', { PATH: a }, 'linux')).toBe(null)
  })

  it('first match wins in PATH order', () => {
    const first = exe(a, 'tool')
    exe(b, 'tool')
    expect(findExecutableOnPath('tool', { PATH: `${a}:${b}` }, 'linux')).toBe(
      first
    )
  })

  it('skips empty PATH entries and returns null when unset', () => {
    exe(b, 'tool')
    expect(findExecutableOnPath('tool', { PATH: `::${b}` }, 'linux')).toBe(
      join(b, 'tool')
    )
    expect(findExecutableOnPath('tool', {}, 'linux')).toBe(null)
  })

  it('returns an absolute executable path that exists', () => {
    const p = exe(a, 'tool')
    expect(findExecutableOnPath(p, { PATH: '' }, 'linux')).toBe(p)
  })

  it('win32 tries PATHEXT extensions', () => {
    writeFileSync(join(b, 'tool.EXE'), '')
    const r = findExecutableOnPath(
      'tool',
      { Path: `${a};${b}`, PATHEXT: '.EXE;.CMD' },
      'win32',
      join(root, 'nocwd')
    )
    expect(r?.toLowerCase().endsWith('tool.exe')).toBe(true)
  })

  it('win32 checks a name with an extension as-is', () => {
    writeFileSync(join(b, 'tool.cmd'), '')
    const r = findExecutableOnPath(
      'tool.cmd',
      { PATH: b, PATHEXT: '.EXE' },
      'win32',
      join(root, 'nocwd')
    )
    expect(r?.toLowerCase().endsWith('tool.cmd')).toBe(true)
  })

  it('win32 searches the cwd before PATH', () => {
    writeFileSync(join(a, 'tool.EXE'), '')
    writeFileSync(join(b, 'tool.EXE'), '')
    const r = findExecutableOnPath(
      'tool',
      { PATH: b, PATHEXT: '.EXE' },
      'win32',
      a
    )
    expect(r?.startsWith(a)).toBe(true)
  })

  it('async wrappers agree', async () => {
    exe(a, 'gl-unlikely-tool-xyz')
    const old = process.env.PATH
    process.env.PATH = a
    try {
      expect(await searchForExecutableOnPath('gl-unlikely-tool-xyz')).toBe(
        join(a, 'gl-unlikely-tool-xyz')
      )
      expect(await hasExecutable('gl-unlikely-tool-xyz')).toBe(true)
      expect(await hasExecutable('gl-missing-tool-xyz')).toBe(false)
    } finally {
      process.env.PATH = old
    }
  })
})
