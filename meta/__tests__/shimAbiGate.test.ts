/**
 * 51-15 Task 1: the first REAL compile-and-disassemble ABI gate in this
 * repo (every prior ABI assertion in meta/__tests__/gen_vtables.test.ts is
 * a source-text regex check, never a real toolchain invocation). This
 * suite compiles a synthetic ABI-exercise manifest's GENERATOR OUTPUT with
 * the pinned zig toolchain (meta/downloadZig.ts, ZIG_VERSION '0.16.0') for
 * both the i386 (`x86-windows-gnu`) and x86_64 (`x86_64-windows-gnu`)
 * targets, then `objdump -d`s the result -- proving the ACTUAL
 * generator-emitted code places registers per the planner's correction
 * (this plan's <objective>, not 51-RESEARCH's free-function prototype): a
 * class-returning vtable MEMBER stub keeps `self` in the FIRST argument
 * slot (RCX on x64, ECX via __thiscall on i386) and the hidden sret
 * pointer in the SECOND (RDX on x64, the first STACK slot on i386) --
 * never the "shift this to RDX" rule a free-function sret lowering would
 * need. "the gate ... measures the generated code, not a synthetic free
 * function" (plan <objective>): the function under test IS
 * meta/gen_vtables.ts's own emitVtableStub/emitStubBody output, unedited
 * except for the ONE linkage change described below.
 *
 * The target functions are `static`, so they carry no linkable symbol by
 * default and objdump cannot name them. This suite turns ONLY the named
 * function's linkage into `__declspec(dllexport)` via a single targeted
 * text substitution applied to the generator's OWN string output (never a
 * hand-rewritten body, never a change to the calling-convention-relevant
 * code) purely so objdump's disassembly can be sliced by symbol name.
 * Verified against a real zig 0.16.0 compile + Apple's bundled objdump
 * before this file was written (scratchpad proof, not guessed).
 *
 * The compile uses the production release flags (SHIM_RELEASE_CFLAGS, -O2 with
 * UBSan off), so the ABI is proven under the codegen that actually ships.
 *
 * Skips (with an explicit, logged reason, never silently) off-darwin or
 * when zig is not resolvable via downloadZig -- on a cold machine with no
 * network and no cached .build-tools/zig, this suite still passes CI
 * (skip, not fail) but is NOT silently inert on the one platform (darwin)
 * this whole bridge targets.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import { SHIM_RELEASE_CFLAGS } from '../buildSteamBridgeShims'
import { downloadZig } from '../downloadZig'
import {
  generateDefFile,
  generateShimC,
  type ArchToken,
  type InterfaceManifestV2
} from '../gen_vtables'

// 51-15: a synthetic ABI-exercise fixture (NOT a real Steamworks method,
// D-09 -- mirrors the existing meta/__tests__/fixtures/abi-exercise.manifest.json
// precedent gen_vtables.test.ts already uses). `arches` names BOTH targets
// so this ONE fixture's generated code compiles -- and is therefore
// disassemblable -- under i386 AND x86_64; Task 3 is what gives a REAL
// manifest (isteamuser019.manifest.json) `arches: ['x64']` for the first
// time. `_TESTONLY` is the established non-production-method marker (see
// meta/sdk's validateManifest check); this fixture is never written under
// meta/sdk and never passed to validateManifest, so that check never fires.
const FIXTURE_MANIFEST: InterfaceManifestV2 = {
  schemaVersion: 2,
  interface: 'GameLibAbiGate001',
  family: 'GameLibAbiGate',
  ordinal: 9000,
  arches: ['x86', 'x64'],
  mode: 'stub',
  complete: true,
  source: { kind: 'synthetic', ref: 'shimAbiGate.test.ts', file: 'n/a' },
  note:
    'Synthetic ABI-exercise fixture (NOT a real Steamworks method, D-09) -- ' +
    'proves the i386/x64 register-placement disassembly this gate exists for.',
  methods: [
    {
      slot: 0,
      name: 'GetFixtureID_TESTONLY',
      returns: 'CSteamID',
      returnKind: 'class',
      structSize: 8,
      stackBytes: 4,
      params: []
    }
  ]
}

const TARGET_FUNC = 'vt_GameLibAbiGate001_GetFixtureID_TESTONLY'
const NULL_OBJECT_FUNC = 'vt_x64_null_object'

/**
 * Turns ONE named `static ... FUNC(...)` function definition into
 * `__declspec(dllexport) ... FUNC(...)` -- a pure linkage change (never a
 * body rewrite) so objdump can name it. Throws loud if the symbol is
 * absent (e.g. asking for the x64-only null-object stub inside an i386
 * build) rather than silently producing a source file missing the symbol
 * the caller is about to go looking for.
 */
function exportSymbolForDisasm(source: string, funcName: string): string {
  const pattern = new RegExp(`static ([^\\n]*\\b${funcName}\\s*\\()`)
  if (!pattern.test(source)) {
    throw new Error(
      `exportSymbolForDisasm: "${funcName}" not found in generated source`
    )
  }
  return source.replace(pattern, '__declspec(dllexport) $1')
}

// Argv-form spawn (never a shell string) -- mirrors
// meta/buildSteamBridgeShims.ts's own spawnArgv exactly (that one is
// module-private, so this is a reviewed literal copy, not a derived
// import).
function spawnArgv(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

/** Slices `objdump -d`'s output down to just the lines belonging to
 * `funcName`'s own disassembled block (from its `<funcName>:` label up to
 * -- but excluding -- the next function's label). */
function extractFunctionBlock(disasm: string, funcName: string): string {
  const lines = disasm.split('\n')
  const startIdx = lines.findIndex((l) => l.includes(`<${funcName}>:`))
  if (startIdx === -1) {
    throw new Error(
      `extractFunctionBlock: "${funcName}" not found in disassembly`
    )
  }
  const rest = lines.slice(startIdx + 1)
  const endIdx = rest.findIndex((l) => /^[0-9a-f]+ <.*>:$/.test(l.trim()))
  return rest.slice(0, endIdx === -1 ? rest.length : endIdx).join('\n')
}

/** The LAST actual `ret`/`retl`/`retq` instruction line within a function's
 * disassembled block -- objdump pads a function's tail with `nop`/`nopl`/
 * `nopw` alignment filler AFTER the real epilogue, so "the last non-blank
 * line" is unreliable; this searches for the real return instruction
 * specifically. Throws loud (never returns undefined for a caller to
 * silently match against) if the block has no `ret` line at all. */
function lastReturnInstruction(block: string): string {
  const retLines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\bret[a-z]*\b/.test(l))
  const last = retLines.at(-1)
  if (last === undefined) {
    throw new Error('lastReturnInstruction: no ret/retl/retq line in block')
  }
  return last
}

describe('shimAbiGate (51-15 Task 1 -- real compile + disassemble, not a synthetic free function)', () => {
  let skipReason: string | null = null
  let zigBinPath = ''
  const createdProfiles: FakeHomeProfile[] = []

  beforeAll(async () => {
    if (process.platform !== 'darwin') {
      skipReason = `shimAbiGate requires darwin (zig cross-compile host), got "${process.platform}"`
      return
    }
    try {
      zigBinPath = await downloadZig()
    } catch (error) {
      skipReason = `zig unresolvable via downloadZig: ${(error as Error).message}`
    }
  }, 180000)

  afterAll(() => {
    // D4 (two-profile rule, CLAUDE.md): a FRESH profile per compile call,
    // never reused -- every one minted is disposed here, none at module
    // scope.
    for (const profile of createdProfiles) {
      profile.dispose()
    }
  })

  async function compileAndDisasm(
    zigTarget: string,
    defArch: ArchToken
  ): Promise<string> {
    const fakeHome = createFakeHomeProfile({ prefix: 'gamelib-shimabigate-' })
    createdProfiles.push(fakeHome)
    const buildDir = join(fakeHome.root, 'build')
    mkdirSync(buildDir, { recursive: true })

    let source = exportSymbolForDisasm(
      generateShimC([FIXTURE_MANIFEST]),
      TARGET_FUNC
    )
    // The generic null-object fallback stub only exists under
    // `#if defined(__x86_64__)` -- exporting it is only valid (and only
    // needed) when compiling for the x64 target.
    if (zigTarget === 'x86_64-windows-gnu') {
      source = exportSymbolForDisasm(source, NULL_OBJECT_FUNC)
    }
    const defSource = generateDefFile([FIXTURE_MANIFEST], defArch)

    const cPath = join(buildDir, 'shim.c')
    const defPath = join(buildDir, 'shim.def')
    const outPath = join(buildDir, 'shim.dll')
    writeFileSync(cPath, source)
    writeFileSync(defPath, defSource)

    const env = fakeHome.childEnv()
    const compile = await spawnArgv(
      zigBinPath,
      [
        'cc',
        '-target',
        zigTarget,
        '-shared',
        ...SHIM_RELEASE_CFLAGS,
        '-o',
        outPath,
        cPath,
        defPath,
        '-lws2_32'
      ],
      env
    )
    if (compile.code !== 0 || !existsSync(outPath)) {
      throw new Error(
        `zig cc -target ${zigTarget} failed (exit ${compile.code}):\n${compile.stderr}`
      )
    }

    const disasm = await spawnArgv('objdump', ['-d', outPath], env)
    if (disasm.code !== 0) {
      throw new Error(
        `objdump -d failed (exit ${disasm.code}):\n${disasm.stderr}`
      )
    }
    return disasm.stdout
  }

  it('x64: self travels in %rcx, sretOut in %rdx, and the stub ends in a plain retq (planner correction, not the free-function shift)', async () => {
    if (skipReason) {
      console.warn(`shimAbiGate SKIPPED: ${skipReason}`)
      return
    }
    const disasm = await compileAndDisasm('x86_64-windows-gnu', 'x64')
    const block = extractFunctionBlock(disasm, TARGET_FUNC)
    // At -O2 the stub never reads `self`, so %rcx is no longer copied
    // anywhere and the old `mov %rcx,` matcher missed (quick 261023-tyf).
    // The register roles are still asserted: sretOut (%rdx) is both
    // returned in %rax and the store target, and %rcx (self) is NOT used
    // as the sret pointer (the free-function shift would do exactly that).
    expect(block).toMatch(/mov[a-z]*\s+%rdx,\s*%rax/)
    expect(block).toMatch(/mov[a-z]*\s+\$0x0,\s*\(%rdx\)/)
    expect(block).not.toMatch(/\(%rcx\)/)
    expect(block).not.toMatch(/mov[a-z]*\s+%rcx,\s*%rax/)
    expect(lastReturnInstruction(block)).toMatch(/ret[a-z]*\s*$/)
  }, 180000)

  it('i386: the __thiscall stub ends in ret $0x4 (callee-cleans the 4-byte hidden sret pointer)', async () => {
    if (skipReason) {
      console.warn(`shimAbiGate SKIPPED: ${skipReason}`)
      return
    }
    const disasm = await compileAndDisasm('x86-windows-gnu', 'x86')
    const block = extractFunctionBlock(disasm, TARGET_FUNC)
    expect(lastReturnInstruction(block)).toMatch(/ret[a-z]*\s+\$0x4/)
  }, 180000)

  it('x64: the generic null-object fallback stub ends in a plain retq -- Win64 is caller-cleans, never ret N', async () => {
    if (skipReason) {
      console.warn(`shimAbiGate SKIPPED: ${skipReason}`)
      return
    }
    const disasm = await compileAndDisasm('x86_64-windows-gnu', 'x64')
    const block = extractFunctionBlock(disasm, NULL_OBJECT_FUNC)
    const lastRet = lastReturnInstruction(block)
    expect(lastRet).toMatch(/ret[a-z]*\s*$/)
    expect(lastRet).not.toMatch(/\$0x/)
  }, 180000)
})
