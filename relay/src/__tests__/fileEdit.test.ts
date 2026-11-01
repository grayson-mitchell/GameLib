import {
  decodeGitHubContent,
  encodeGitHubContent,
  fixFilePath,
  planAdd,
  planRemove,
  serializeFixFile
} from '../fileEdit'

describe('fileEdit', () => {
  describe('planAdd', () => {
    it('creates a new file with title first', () => {
      expect(planAdd(null, 'macArch', '32', 'Game')).toEqual({
        kind: 'create',
        text: '{\n  "title": "Game",\n  "macArch": "32"\n}\n'
      })
    })

    it('keeps existing keys in order and never overwrites the title', () => {
      const plan = planAdd(
        '{"title":"Old","notes":"x — y","macArch":"32"}',
        'drm',
        'ceg',
        'New'
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
        planAdd('{"title":"T","macArch":"32"}', 'macArch', '32', 'T')
      ).toEqual({ kind: 'already-known' })
    })

    it('updates a differing value in place', () => {
      const plan = planAdd(
        '{"macArch":"64","title":"T","drm":"ceg"}',
        'macArch',
        '32',
        'T'
      )
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      const obj = JSON.parse(plan.text)
      expect(Object.keys(obj)).toEqual(['macArch', 'title', 'drm'])
      expect(obj.macArch).toBe('32')
    })

    it('adds title first only when the file has none', () => {
      const plan = planAdd('{"drm":"ceg"}', 'macArch', '32', 'Canon')
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      expect(Object.keys(JSON.parse(plan.text))).toEqual([
        'title',
        'drm',
        'macArch'
      ])
    })

    it('keeps unknown and tier-2 keys', () => {
      const plan = planAdd(
        '{"title":"T","launchOptions":"-x","weird":{"a":1}}',
        'macArch',
        '32',
        'T'
      )
      expect(plan.kind).toBe('update')
      if (plan.kind !== 'update') return
      expect(JSON.parse(plan.text)).toEqual({
        title: 'T',
        launchOptions: '-x',
        weird: { a: 1 },
        macArch: '32'
      })
    })

    it.each(['[1]', 'not json', '"s"', 'null'])('skips %s', (text) => {
      expect(planAdd(text, 'macArch', '32', 'T').kind).toBe('skipped')
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
