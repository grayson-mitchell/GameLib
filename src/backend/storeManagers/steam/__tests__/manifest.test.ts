// Phase 21 (21-02): Unit tests for the hand-templated `.acf` manifest writer.
//
// Proves, with real assertions (not prose): StateFlags is hard-coded "1026",
// 64-bit InstalledDepots GIDs survive as exact strings (no @node-steam/vdf
// involvement, no Number coercion), multi-depot input produces one child
// block per depot, the minimum Steam-adoption field set is present, and the
// write is atomic (temp file + fsync + rename onto the final filename).
//
// Note on the atomic-write test: Node's builtin `node:fs/promises` module
// exposes its exports as non-configurable getters (confirmed via
// `Object.getOwnPropertyDescriptor`), so neither `jest.spyOn` nor a
// `jest.mock` factory reliably intercepts a *specific* call (`rename`)
// without breaking the underlying real I/O in this project's ts-jest/CJS
// interop setup. Atomicity is instead proven black-box: pre-seed BOTH a
// stale `.tmp` and a stale final `.acf`, run the real write, and assert the
// stale bytes are fully replaced and no `.tmp` artifact survives — combined
// with a structural check that the implementation actually goes through a
// same-directory `.tmp` + fsync + rename sequence (not an in-place write).

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeAppManifest, type AppManifestParams } from '../depot/manifest'

describe('depot/manifest', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-manifest-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const baseParams: AppManifestParams = {
    appId: '264160',
    installdir: 'WazHack',
    name: 'WazHack',
    sizeOnDisk: '123456789',
    installedDepots: [
      { depotId: '264161', manifest: '1234567890123456789', size: 1000 }
    ]
  }

  it('emits StateFlags exactly "1026"', async () => {
    const path = await writeAppManifest(dir, baseParams)
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('preserves a 19-digit InstalledDepots GID with exact string equality (no rounding)', async () => {
    const gid = '1234567890123456789' // 19 digits — well past Number.MAX_SAFE_INTEGER
    const path = await writeAppManifest(dir, {
      ...baseParams,
      installedDepots: [{ depotId: '264161', manifest: gid, size: 1000 }]
    })
    const text = readFileSync(path, 'utf8')
    const match = text.match(/"manifest"\s+"(\d+)"/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe(gid)
  })

  it('writes one InstalledDepots child block per depot for multi-depot input', async () => {
    const depots = [
      { depotId: '264161', manifest: '111111111111111111', size: 1000 },
      { depotId: '264162', manifest: '222222222222222222', size: 2000 },
      { depotId: '264163', manifest: '333333333333333333', size: 3000 }
    ]
    const path = await writeAppManifest(dir, {
      ...baseParams,
      installedDepots: depots
    })
    const text = readFileSync(path, 'utf8')
    for (const d of depots) {
      expect(text).toContain(`"${d.depotId}"`)
      expect(text).toContain(`"${d.manifest}"`)
    }
    expect((text.match(/"manifest"/g) ?? []).length).toBe(depots.length)
  })

  it('includes the minimum fields required for Steam adoption', async () => {
    const path = await writeAppManifest(dir, baseParams)
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/"appid"\s+"264160"/)
    expect(text).toMatch(/"Universe"\s+"1"/)
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
    expect(text).toMatch(/"installdir"\s+"WazHack"/)
  })

  it('never touches the VDF parsing package and never writes StateFlags "4"', () => {
    const source = readFileSync(join(__dirname, '../depot/manifest.ts'), 'utf8')
    expect(source).not.toContain('@node-steam/vdf')
    // A bare "4" must never appear as a quoted StateFlags value.
    expect(source).not.toMatch(/"StateFlags"[^\n]*"4"/)
  })

  it('rejects a non-numeric appId before interpolation (T-21-05)', async () => {
    await expect(
      writeAppManifest(dir, { ...baseParams, appId: '123; rm -rf /' })
    ).rejects.toThrow()
  })

  it('rejects a non-numeric depotId before interpolation (T-21-05)', async () => {
    await expect(
      writeAppManifest(dir, {
        ...baseParams,
        installedDepots: [
          { depotId: 'abc123', manifest: '1234567890123456789', size: 1 }
        ]
      })
    ).rejects.toThrow()
  })

  it('rejects a non-numeric manifest GID before interpolation (WR-01 completeness) — cannot inject a sibling VDF key', async () => {
    await expect(
      writeAppManifest(dir, {
        ...baseParams,
        installedDepots: [
          { depotId: '264161', manifest: '123"\n\t"StateFlags"\t\t"4', size: 1 }
        ]
      })
    ).rejects.toThrow()
  })

  it('writes atomically: replaces stale temp/final artifacts, leaves only the correct final file behind', async () => {
    const finalPath = join(dir, `appmanifest_${baseParams.appId}.acf`)
    const tmpPath = `${finalPath}.tmp`

    // Pre-seed stale bytes at BOTH locations to prove the real write fully
    // replaces (not appends/merges with) whatever was there before.
    writeFileSync(tmpPath, 'STALE-TMP-GARBAGE')
    writeFileSync(finalPath, 'STALE-FINAL-GARBAGE')

    const returnedPath = await writeAppManifest(dir, baseParams)

    expect(returnedPath).toBe(finalPath)
    // The temp artifact is consumed by the rename — never left behind (no orphan).
    expect(existsSync(tmpPath)).toBe(false)
    expect(existsSync(finalPath)).toBe(true)

    const finalText = readFileSync(finalPath, 'utf8')
    expect(finalText).not.toContain('STALE-FINAL-GARBAGE')
    expect(finalText).not.toContain('STALE-TMP-GARBAGE')
    expect(finalText).toMatch(/"StateFlags"\s+"1026"/)
    expect(finalText).toMatch(/"appid"\s+"264160"/)
  })

  it('implements the write via a same-directory .tmp file, fsync, then rename onto the final filename (structural proof)', () => {
    const source = readFileSync(join(__dirname, '../depot/manifest.ts'), 'utf8')
    expect(source).toMatch(/\.acf\.tmp/)
    expect(source).toMatch(/\.sync\(\)/) // fsync before the rename
    expect(source).toMatch(/rename\(/)
  })

  it('WR-01: a crafted name embedding a StateFlags injection payload cannot add a second parseable StateFlags key', async () => {
    const path = await writeAppManifest(dir, {
      ...baseParams,
      name: 'Foo" "StateFlags" "4'
    })
    const text = readFileSync(path, 'utf8')
    // Exactly one StateFlags key, still 1026 — the injected content landed
    // inside the escaped name value, not as a sibling AppState key.
    expect((text.match(/"StateFlags"/g) ?? []).length).toBe(1)
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('WR-01: embedded quote/backslash/newline in name and installdir are neutralized (no VDF structure break)', async () => {
    const path = await writeAppManifest(dir, {
      ...baseParams,
      name: 'Weird\\Name"With\nControl\rChars\tHere',
      installdir: 'Weird\\Dir"With\nControl\rChars\tHere'
    })
    const text = readFileSync(path, 'utf8')
    // No raw newline/carriage-return survives inside a quoted value.
    expect(text).not.toMatch(/"name"\s+"[^"]*\n/)
    expect(text).not.toMatch(/"installdir"\s+"[^"]*\n/)
    // Backslash escaped so VDF parses it literally.
    expect(text).toContain('\\\\Name')
    expect(text).toContain('\\\\Dir')
    // Quote escaped, not left as a bare unescaped terminator.
    expect(text).toContain('\\"With')
    // Still exactly one AppState, StateFlags untouched.
    expect((text.match(/"StateFlags"/g) ?? []).length).toBe(1)
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('WR-01: a well-formed name/installdir round-trips unchanged', async () => {
    const path = await writeAppManifest(dir, {
      ...baseParams,
      name: 'Half-Life 2',
      installdir: 'Half-Life 2'
    })
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/"name"\s+"Half-Life 2"/)
    expect(text).toMatch(/"installdir"\s+"Half-Life 2"/)
  })

  it('WR-01: buildAppManifestText applies vdfEscape to both name and installdir interpolations', () => {
    const source = readFileSync(join(__dirname, '../depot/manifest.ts'), 'utf8')
    expect((source.match(/vdfEscape\(/g) ?? []).length).toBeGreaterThanOrEqual(
      3
    )
    expect(source).toMatch(/"installdir"[^\n]*vdfEscape\(params\.installdir\)/)
    expect(source).toMatch(/"name"[^\n]*vdfEscape\(params\.name\)/)
  })

  // ── Phase 23 (23-02, T-23-05): buildid numeric-shape guard ─────────────────
  describe('buildid guard', () => {
    it('a real public-branch buildid is interpolated verbatim (D-02)', async () => {
      const path = await writeAppManifest(dir, {
        ...baseParams,
        buildid: '9044149'
      })
      const text = readFileSync(path, 'utf8')
      expect(text).toMatch(/"buildid"\s+"9044149"/)
    })

    it('the buildid ?? "0" fallback still emits "0" when buildid is omitted', async () => {
      const path = await writeAppManifest(dir, baseParams)
      const text = readFileSync(path, 'utf8')
      expect(text).toMatch(/"buildid"\s+"0"/)
    })

    it('rejects a non-numeric buildid before interpolation (T-23-05) — cannot inject a sibling VDF key', async () => {
      await expect(
        writeAppManifest(dir, {
          ...baseParams,
          buildid: '9044149"\n\t"StateFlags"\t\t"4'
        })
      ).rejects.toThrow(/non-numeric buildid/i)
    })

    it('"0" is exempt from the numeric guard (the intentional untouched-fallback sentinel)', async () => {
      const path = await writeAppManifest(dir, { ...baseParams, buildid: '0' })
      const text = readFileSync(path, 'utf8')
      expect(text).toMatch(/"buildid"\s+"0"/)
    })
  })
})
