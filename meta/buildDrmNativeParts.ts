/**
 * Phase 56 plan 03 (D-01/D-03/D-07/D-08): builds the GPL-3 x64 ntdll detour payload and the
 * BSD-3 game-process helper (steam.exe) for the `steamclient-layer-cx<build>` component.
 *
 * Operator-run on a build host, never on a user's machine. It is deliberately NOT called from
 * `meta/buildSteamBridgeShims.ts` main: release CI has zig but no mingw-w64.
 *
 * Prerequisites: `brew install mingw-w64` and the pinned zig (meta/downloadZig.ts).
 * Run: node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildDrmNativeParts.ts --build 26.3.0.39832
 *
 * Outputs land in a gitignored staging dir. They are never committed, never signed, and never
 * placed under build/bin or public/bin.
 */
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import { downloadZig } from './downloadZig'

const PATCH_DIR = 'native/steam-bridge/steamclient-layer/ntdll-patch'
const HELPER_DIR = 'native/steam-bridge/steamclient-layer/helper'
const DETOUR_C = `${PATCH_DIR}/detour.c`
const SHIM_S = `${PATCH_DIR}/shim.S`
const LINK_LD = `${PATCH_DIR}/link.ld`
const HELPER_C = `${HELPER_DIR}/steam.c`

// ts-prune-ignore-next
export const DRM_NATIVE_SOURCES = [DETOUR_C, SHIM_S, LINK_LD, HELPER_C] as const

const MINGW_TOOLS = [
  'x86_64-w64-mingw32-gcc',
  'x86_64-w64-mingw32-ld',
  'x86_64-w64-mingw32-objcopy'
] as const

// Copied from meta/buildSteamBridgeShims.ts SHIM_RELEASE_CFLAGS on purpose, not imported:
// importing that module from a CLI run would execute its main(), whose guard is only
// JEST_WORKER_ID.
const HELPER_RELEASE_CFLAGS = ['-O2', '-fno-sanitize=undefined'] as const

// Measured: zig leaves steam.pdb beside steam.exe.
// ts-prune-ignore-next
export const HELPER_BUILD_BYPRODUCTS = ['steam.pdb'] as const

// ts-prune-ignore-next
export interface DetourBuildRow {
  build: string
  cleanNtdllSha256: string
  imageBase: number
  hookRva: number
  resumeRva: number
  stolenHex: string
  wmReg: string
  scratchReg: string
  loadPathSlot: number
  sectionRva: number
  caveSize: number
  caveVa: number
  ldrGetDllHandle: number
  ldrLoadDll: number
  ntProtect: number
  payloadSha256: string
}

// Values: RESEARCH Pattern 1 / resolve.py PINNED row. scratchReg is not in the PINNED row; it is
// derived the way resolve.py shell_vars does (rbx unless the WM register is rbx).
export const DETOUR_BUILD_ROWS: Readonly<Record<string, DetourBuildRow>> = {
  '26.3.0.39832': {
    build: '26.3.0.39832',
    cleanNtdllSha256:
      '6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387',
    imageBase: 0x170000000,
    hookRva: 0x44972,
    resumeRva: 0x4497b,
    stolenHex: '4883bc24f000000000',
    wmReg: 'r14',
    scratchReg: 'rbx',
    loadPathSlot: 0xd0,
    sectionRva: 0xae000,
    caveSize: 0x1000,
    caveVa: 0x1700ae000,
    ldrGetDllHandle: 0x170014bc0,
    ldrLoadDll: 0x170015680,
    ntProtect: 0x17000f380,
    payloadSha256:
      'e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb'
  }
}

export interface BuildStep {
  command: string
  args: string[]
  /** ld resolves `shim.o` from link.ld relative to its cwd. */
  cwd?: string
}

export function drmNativeOutputDir(build: string): string {
  return join('build', 'steamclient-layer', `steamclient-layer-cx${build}`)
}

export function payloadFileName(build: string): string {
  return `detour-cx${build}.bin`
}

export function buildHelperExeCompileArgv(
  zigBinPath: string,
  outDir: string
): { command: string; args: string[] } {
  return {
    command: zigBinPath,
    args: [
      'cc',
      '-target',
      'x86_64-windows-gnu',
      ...HELPER_RELEASE_CFLAGS,
      '-o',
      join(outDir, 'steam.exe'),
      HELPER_C,
      '-luser32',
      '-ladvapi32'
    ]
  }
}

const hex = (n: number) => `0x${n.toString(16)}`

export function buildDetourPayloadSteps(
  row: DetourBuildRow,
  workDir: string,
  outDir: string
): BuildStep[] {
  const stolen = (row.stolenHex.match(/../g) ?? []).map((b) => `0x${b}`)
  const elf = join(workDir, 'detour_linked.elf')
  return [
    {
      command: 'x86_64-w64-mingw32-gcc',
      args: [
        '-c',
        '-Os',
        '-fno-asynchronous-unwind-tables',
        '-ffreestanding',
        '-fno-stack-protector',
        resolve(DETOUR_C),
        '-o',
        join(workDir, 'detour_c.o')
      ]
    },
    {
      command: 'x86_64-w64-mingw32-gcc',
      args: [
        '-c',
        '-x',
        'assembler-with-cpp',
        resolve(SHIM_S),
        '-o',
        join(workDir, 'shim.o'),
        `-DWM_REG=${row.wmReg}`,
        `-DSCRATCH_REG=${row.scratchReg}`,
        `-DLOAD_PATH_SLOT=${hex(row.loadPathSlot)}`,
        `-DSTOLEN_BYTES=${stolen.join(',')}`
      ]
    },
    {
      command: 'x86_64-w64-mingw32-ld',
      cwd: workDir,
      args: [
        '-T',
        resolve(LINK_LD),
        'shim.o',
        'detour_c.o',
        '-o',
        elf,
        '--defsym',
        `CAVE_VA=${hex(row.caveVa)}`,
        '--defsym',
        `BM_RESUME=${hex(row.imageBase + row.resumeRva)}`,
        '--defsym',
        `LDR_GETDLLHANDLE=${hex(row.ldrGetDllHandle)}`,
        '--defsym',
        `LDR_LOADDLL=${hex(row.ldrLoadDll)}`,
        '--defsym',
        `NT_PROTECT=${hex(row.ntProtect)}`
      ]
    },
    {
      command: 'x86_64-w64-mingw32-objcopy',
      args: [
        '-O',
        'binary',
        '-j',
        '.cave',
        elf,
        join(outDir, payloadFileName(row.build))
      ]
    }
  ]
}

export function checkPayloadSha(
  buf: Buffer,
  row: DetourBuildRow
): { ok: true } | { ok: false; actual: string } {
  const actual = createHash('sha256').update(buf).digest('hex')
  if (buf.length === 0 || buf.length > row.caveSize) {
    return { ok: false, actual }
  }
  return actual === row.payloadSha256 ? { ok: true } : { ok: false, actual }
}

export function missingDrmNativeInputs(
  exists: (p: string) => boolean = existsSync
): string[] {
  return DRM_NATIVE_SOURCES.filter((p) => !exists(p))
}

export function missingDrmNativeTools(
  which: (tool: string) => boolean
): string[] {
  return MINGW_TOOLS.filter((t) => !which(t))
}

// Argv-form spawn, no shell. Every invocation gets a fresh fake-HOME profile; this build has no
// real-profile arm because nothing here is profile-dependent.
function spawnArgvIsolated(
  command: string,
  args: string[],
  cwd?: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-drm-native-' })
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: profile.childEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    const done = () => {
      try {
        profile.dispose()
      } catch {
        /* best effort */
      }
    }
    child.on('error', (e) => {
      done()
      reject(e)
    })
    child.on('close', (code) => {
      done()
      resolvePromise({ code, stdout, stderr })
    })
  })
}

async function toolAvailability(): Promise<Set<string>> {
  const found = new Set<string>()
  for (const t of MINGW_TOOLS) {
    const r = await spawnArgvIsolated('/usr/bin/which', [t])
    if (r.code === 0) found.add(t)
  }
  return found
}

function parseArgs(argv: string[]): { build: string; out?: string } {
  let build = '26.3.0.39832'
  let out: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--build') build = argv[++i]
    else if (argv[i] === '--out') out = argv[++i]
  }
  return { build, out }
}

export async function main(argv: string[] = process.argv.slice(2)) {
  const { build, out } = parseArgs(argv)
  const row = DETOUR_BUILD_ROWS[build]
  if (!row) throw new Error(`Unknown CrossOver build: ${build}`)

  const missingSrc = missingDrmNativeInputs()
  if (missingSrc.length) {
    throw new Error(`Missing native sources: ${missingSrc.join(', ')}`)
  }
  const avail = await toolAvailability()
  const missingTools = missingDrmNativeTools((t) => avail.has(t))
  if (missingTools.length) {
    throw new Error(
      `COMPILE GATE FAILED (56-03, prerequisites): missing ${missingTools.join(', ')}; install with brew install mingw-w64`
    )
  }

  const outDir = out ?? drmNativeOutputDir(build)
  mkdirSync(outDir, { recursive: true })
  const workDir = mkdtempSync(join(tmpdir(), 'gamelib-drm-native-work-'))
  const payload = join(outDir, payloadFileName(build))
  const exe = join(outDir, 'steam.exe')
  try {
    for (const step of buildDetourPayloadSteps(row, workDir, outDir)) {
      console.log(`${step.command} ${step.args.join(' ')}`)
      const r = await spawnArgvIsolated(step.command, step.args, step.cwd)
      if (r.code !== 0) {
        throw new Error(
          `COMPILE GATE FAILED (56-03, payload): ${step.command} exited ${r.code}\n${r.stderr}`
        )
      }
    }
    const buf = readFileSync(payload)
    const sha = checkPayloadSha(buf, row)
    if (!sha.ok) {
      unlinkSync(payload)
      throw new Error(
        `COMPILE GATE FAILED (56-03, payload sha): expected ${row.payloadSha256} got ${sha.actual}`
      )
    }

    const zig = await downloadZig()
    const { command, args } = buildHelperExeCompileArgv(zig, outDir)
    console.log(`${command} ${args.join(' ')}`)
    const h = await spawnArgvIsolated(command, args)
    const head = existsSync(exe) ? readFileSync(exe).subarray(0, 2) : null
    if (h.code !== 0 || !head || head.toString('latin1') !== 'MZ') {
      throw new Error(
        `COMPILE GATE FAILED (56-03, helper): zig exited ${h.code}\n${h.stderr}`
      )
    }
    for (const b of HELPER_BUILD_BYPRODUCTS) {
      rmSync(join(outDir, b), { force: true })
    }
    console.log(
      `Compile gate PASSED (56-03) -> ${payload} sha256=${row.payloadSha256}`
    )
    console.log(
      `Compile gate PASSED (56-03) -> ${exe} size=${statSync(exe).size}`
    )
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (!process.env.JEST_WORKER_ID) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
