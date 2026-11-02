import {
  decodeGitHubContent,
  encodeGitHubContent,
  fixFilePath,
  planAdd,
  planRemove,
  releaseVersion,
  reportNote,
  serializeFixFile
} from '../fileEdit'

const N = { gamelibVersion: '0.8.0', firstSeen: Date.UTC(2026, 10, 2) }
const MAC_NOTE = reportNote('macArch', N)

describe('fileEdit', () => {
  describe('planAdd', () => {
    it('creates a new file with title first', () => {
      expect(planAdd(null, 'macArch', '32', 'Game', N)).toEqual({
        kind: 'create',
        text: serializeFixFile({
          title: 'Game',
          macArch: '32',
          notes: { macArch: MAC_NOTE }
        })
      })
    })

    it('writes the seed-style note with version and first-seen date', () => {
      expect(MAC_NOTE).toBe(
        "The macOS build is 32-bit only (i386); Apple silicon cannot run it, so GameLib installs the Windows build. Reported by GameLib 0.8.0's post-install Mach-O check through the known-fix relay, first received 2026-11-02."
      )
      expect(reportNote('drm', N)).toContain("GameLib 0.8.0's PE CEG scan")
    })

    it('writes only a release-shaped version into the note (WR-01)', () => {
      for (const v of ['0.8.0', '1.10.2', '0.9.0-beta.2', '1.0.0-rc']) {
        expect(releaseVersion(v)).toBe(v)
        expect(reportNote('macArch', { ...N, gamelibVersion: v })).toContain(
          `GameLib ${v}'s`
        )
      }
      for (const v of [
        'www.attacker-site.com',
        'buy-cheap-pills.example',
        '1.2.3-evil.example',
        '1.2',
        '1.2.3+meta',
        ''
      ]) {
        expect(releaseVersion(v)).toBeNull()
        const note = reportNote('drm', { ...N, gamelibVersion: v })
        expect(note).toContain("Reported by an unknown GameLib version's")
        if (v) expect(note).not.toContain(v)
      }
    })

    it('adds its note to an existing notes object, last, without overwriting', () => {
      const plan = planAdd(
        '{"title":"T","notes":{"drm":"hand"},"drm":"ceg"}',
        'macArch',
        '32',
        'T',
        N
      )
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      const obj = JSON.parse(plan.text)
      expect(Object.keys(obj)).toEqual(['title', 'drm', 'macArch', 'notes'])
      expect(obj.notes).toEqual({ drm: 'hand', macArch: MAC_NOTE })
      const kept = planAdd(
        '{"title":"T","notes":{"macArch":"hand"},"macArch":"64"}',
        'macArch',
        '32',
        'T',
        N
      )
      if (kept.kind !== 'update') throw new Error(kept.kind)
      expect(JSON.parse(kept.text).notes).toEqual({ macArch: 'hand' })
    })

    it('keeps existing keys in order and never overwrites the title', () => {
      const plan = planAdd(
        '{"title":"Old","notes":"x — y","macArch":"32"}',
        'drm',
        'ceg',
        'New',
        N
      )
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      const obj = JSON.parse(plan.text)
      expect(Object.keys(obj)).toEqual(['title', 'notes', 'macArch', 'drm'])
      expect(obj.title).toBe('Old')
      expect(obj.notes).toBe('x — y')
      expect(plan.text.endsWith('}\n')).toBe(true)
    })

    it('returns already-known when the value is present', () => {
      expect(
        planAdd('{"title":"T","macArch":"32"}', 'macArch', '32', 'T', N)
      ).toEqual({ kind: 'already-known' })
    })

    it('updates a differing value in place', () => {
      const plan = planAdd(
        '{"macArch":"64","title":"T","drm":"ceg"}',
        'macArch',
        '32',
        'T',
        N
      )
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      const obj = JSON.parse(plan.text)
      expect(Object.keys(obj)).toEqual(['macArch', 'title', 'drm', 'notes'])
      expect(obj.macArch).toBe('32')
    })

    it('adds title first only when the file has none', () => {
      const plan = planAdd('{"drm":"ceg"}', 'macArch', '32', 'Canon', N)
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      expect(Object.keys(JSON.parse(plan.text))).toEqual([
        'title',
        'drm',
        'macArch',
        'notes'
      ])
    })

    it('keeps unknown and tier-2 keys', () => {
      const plan = planAdd(
        '{"title":"T","launchOptions":"-x","weird":{"a":1}}',
        'macArch',
        '32',
        'T',
        N
      )
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      expect(JSON.parse(plan.text)).toEqual({
        title: 'T',
        launchOptions: '-x',
        weird: { a: 1 },
        macArch: '32',
        notes: { macArch: MAC_NOTE }
      })
    })

    it.each(['[1]', 'not json', '"s"', 'null'])('skips %s', (text) => {
      expect(planAdd(text, 'macArch', '32', 'T', N).kind).toBe('skipped')
    })
  })

  describe('planRemove', () => {
    it('deletes a file with only title and macArch', () => {
      expect(planRemove('{"title":"T","macArch":"32"}')).toEqual({
        kind: 'delete'
      })
    })

    it('deletes a file with only title, notes and macArch', () => {
      expect(planRemove('{"title":"T","notes":"n","macArch":"32"}')).toEqual({
        kind: 'delete'
      })
    })

    it('keeps drm when removing macArch', () => {
      const plan = planRemove('{"title":"T","macArch":"32","drm":"ceg"}')
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      expect(JSON.parse(plan.text)).toEqual({ title: 'T', drm: 'ceg' })
      expect(plan.text.endsWith('\n')).toBe(true)
    })

    it('drops notes.macArch and keeps other notes', () => {
      const plan = planRemove(
        '{"title":"T","macArch":"32","drm":"ceg","notes":{"macArch":"m","drm":"d"}}'
      )
      if (plan.kind !== 'update') throw new Error(plan.kind)
      expect(JSON.parse(plan.text)).toEqual({
        title: 'T',
        drm: 'ceg',
        notes: { drm: 'd' }
      })
    })

    it('deletes the file when notes held only the macArch note', () => {
      expect(
        planRemove('{"title":"T","macArch":"32","notes":{"macArch":"m"}}')
      ).toEqual({ kind: 'delete' })
    })

    it('is not-in-repo for absent file', () => {
      expect(planRemove(null)).toEqual({ kind: 'not-in-repo' })
    })

    it('is not-in-repo without macArch', () => {
      expect(planRemove('{"title":"T","drm":"ceg"}')).toEqual({
        kind: 'not-in-repo'
      })
    })

    it('is not-in-repo for macArch 64', () => {
      expect(planRemove('{"macArch":"64"}')).toEqual({ kind: 'not-in-repo' })
    })

    it('skips unparseable content', () => {
      expect(planRemove('nope').kind).toBe('skipped')
      expect(planRemove('[1]').kind).toBe('skipped')
    })
  })

  describe('github content encoding', () => {
    it('round-trips non-ASCII text', () => {
      const s = 'é — 日本'
      expect(decodeGitHubContent(encodeGitHubContent(s))).toBe(s)
    })

    it('decodes base64 wrapped every 60 chars', () => {
      const s = 'é — 日本 '.repeat(30)
      const b64 = encodeGitHubContent(s)
      const wrapped = (b64.match(/.{1,60}/g) ?? []).join('\n') + '\n'
      expect(decodeGitHubContent(wrapped)).toBe(s)
    })

    it('encodes a 100 KB string without throwing', () => {
      const s = 'a'.repeat(100 * 1024)
      expect(decodeGitHubContent(encodeGitHubContent(s))).toBe(s)
    })

    it('throws on invalid UTF-8 (fatal decode)', () => {
      expect(() => decodeGitHubContent(btoa('\xff\xfe'))).toThrow()
    })
  })

  it('fixFilePath builds the steam path', () => {
    expect(fixFilePath('1234')).toBe('steam/1234-steam.json')
  })

  it('serializeFixFile uses 2-space JSON and a trailing newline', () => {
    expect(serializeFixFile({ a: 1 })).toBe('{\n  "a": 1\n}\n')
  })
})
