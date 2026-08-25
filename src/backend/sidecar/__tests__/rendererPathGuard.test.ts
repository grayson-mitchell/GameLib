/**
 * TDD RED-then-GREEN tests for `rendererPathGuard.ts` (Phase 34.6 Plan 11,
 * T-34.5-C6-49-03 discharge). This module is the shared containment/shape
 * primitive `installFlowRegistration.ts` (`moveInstall`/`importGame`) and
 * `wineToolsFlowRegistration.ts` (`runWineCommandForGame`) call to validate
 * renderer-supplied input before it reaches a real filesystem move/import or
 * a real Wine process spawn.
 *
 * Every case below names, in its own title, the PROPERTY it measures (not
 * just "throws" / "does not throw") and is proven in BOTH directions per
 * REQ-34.6-05 non-vacuity discipline: a known-bad input that must be
 * rejected, and a filled legitimate specimen that must be accepted — a gate
 * proven only against a bad input can still be measuring the wrong property
 * (e.g. a bare `startsWith(root)` string check "passes" naive traversal
 * tests while still admitting a sibling-prefix escape; see the "prefix
 * collision" cases below, which a `startsWith` implementation would
 * WRONGLY ALLOW).
 *
 * Mirrors `storeManagers/steam/depot.ts`'s own `resolveContainedPath`
 * (`PathTraversalError`) algorithm exactly — normalize backslashes to
 * forward slashes BEFORE `resolve()`/`relative()`, never a positive
 * safe-character allow list (REQ-37-06's documented anti-pattern: a
 * character allow list would reject "Sid Meier's Civilization V"'s
 * apostrophe, which must always pass containment).
 */

import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  assertContainedPath,
  PathContainmentError,
  assertCommandParts,
  CommandShapeError
} from '../rendererPathGuard'

describe('assertContainedPath (T-34.5-C6-49-03 containment primitive)', () => {
  const root = resolve('/home/user/Games')

  describe('REJECT: escapes the root', () => {
    it('rejects a `../` relative traversal that climbs above the root', () => {
      expect(() =>
        assertContainedPath(root, '../../etc/passwd', 'test')
      ).toThrow(PathContainmentError)
    })

    it('rejects a backslash-separated traversal, proving normalization happens BEFORE containment (not after)', () => {
      // On POSIX, an un-normalized `..\\..\\evil` resolves as one opaque,
      // non-traversing path segment -- if this test passes, the guard is
      // normalizing backslashes to forward slashes before resolve(), exactly
      // as depot.ts's WR-02 regression proved is required.
      expect(() =>
        assertContainedPath(root, '..\\..\\evil.exe', 'test')
      ).toThrow(PathContainmentError)
    })

    it('rejects an absolute path pointing entirely outside the root', () => {
      expect(() => assertContainedPath(root, '/etc/passwd', 'test')).toThrow(
        PathContainmentError
      )
    })

    it('rejects a sibling directory that shares a STRING PREFIX with the root but is not actually contained (proves containment uses relative(), not a bare startsWith(root) string check)', () => {
      // '/home/user/Games-evil/save.dat'.startsWith('/home/user/Games') is
      // TRUE -- a naive prefix-string implementation would wrongly allow
      // this. Real containment via relative() must reject it because the
      // first path segment after root diverges.
      expect(() =>
        assertContainedPath(root, '../Games-evil/save.dat', 'test')
      ).toThrow(PathContainmentError)
    })

    it('rejects when the escaping candidate is itself absolute, proving path.resolve()\'s "absolute-argument-discards-root" behavior does not bypass containment', () => {
      const outsideAbsolute = resolve('/home/user/Games-evil/save.dat')
      expect(() => assertContainedPath(root, outsideAbsolute, 'test')).toThrow(
        PathContainmentError
      )
    })

    it('error message names the context label passed by the caller, so moveInstall/importGame/runWineCommandForGame rejections are distinguishable in logs', () => {
      expect(() =>
        assertContainedPath(root, '../escape', 'moveInstall')
      ).toThrow(/moveInstall/)
    })
  })

  describe('ALLOW: legitimate specimens filled with real-world punctuation and nesting', () => {
    it('allows a simple relative filename directly inside the root', () => {
      expect(() => assertContainedPath(root, 'save.dat', 'test')).not.toThrow()
    })

    it('allows a nested subdirectory path inside the root', () => {
      expect(() =>
        assertContainedPath(root, 'MyGame/saves/slot1.dat', 'test')
      ).not.toThrow()
    })

    it('allows a path containing an apostrophe -- "Sid Meier\'s Civilization V" must never be rejected by a character check (REQ-37-06)', () => {
      expect(() =>
        assertContainedPath(root, "Sid Meier's Civilization V/save.dat", 'test')
      ).not.toThrow()
    })

    it('allows a Windows-style backslash-separated path that stays inside the root once normalized', () => {
      expect(() =>
        assertContainedPath(root, 'MyGame\\saves\\slot1.dat', 'test')
      ).not.toThrow()
    })

    it('allows the root directory itself (empty/`.` candidate)', () => {
      expect(() => assertContainedPath(root, '.', 'test')).not.toThrow()
    })

    it('allows an absolute path that legitimately resolves inside the root', () => {
      const insideAbsolute = resolve(root, 'MyGame')
      expect(() =>
        assertContainedPath(root, insideAbsolute, 'test')
      ).not.toThrow()
    })

    it('returns the resolved destination path on success (callers use the return value, not just the non-throw)', () => {
      const dest = assertContainedPath(root, 'MyGame/save.dat', 'test')
      expect(dest).toBe(resolve(root, 'MyGame/save.dat'))
    })
  })

  it('does not implement containment via a positive safe-character allow list (structural anti-pattern check, REQ-37-06)', () => {
    const source = readFileSync(
      join(__dirname, '../rendererPathGuard.ts'),
      'utf-8'
    )
    expect(/allowlist/i.test(source)).toBe(false)
    expect(/SAFE_.*=\s*\/\[/.test(source)).toBe(false)
  })
})

describe('assertCommandParts (runWineCommandForGame shape guard)', () => {
  describe('REJECT: malformed shapes that must never reach spawn()/join()', () => {
    it('rejects a non-array commandParts (e.g. a raw string)', () => {
      expect(() => assertCommandParts('wine notepad.exe')).toThrow(
        CommandShapeError
      )
    })

    it('rejects an empty array', () => {
      expect(() => assertCommandParts([])).toThrow(CommandShapeError)
    })

    it('rejects an array containing a non-string element (e.g. an object), which would otherwise reach spawn() as "[object Object]"', () => {
      expect(() => assertCommandParts(['notepad.exe', { evil: true }])).toThrow(
        CommandShapeError
      )
    })

    it('rejects null', () => {
      expect(() => assertCommandParts(null)).toThrow(CommandShapeError)
    })

    it('rejects undefined', () => {
      expect(() => assertCommandParts(undefined)).toThrow(CommandShapeError)
    })
  })

  describe('ALLOW: legitimate commandParts arrays, including arguments with spaces (proves this is a SHAPE check, not a content/character check)', () => {
    it('allows a simple single-element command', () => {
      expect(() => assertCommandParts(['winecfg'])).not.toThrow()
    })

    it('allows a multi-element argv array whose elements contain spaces and punctuation -- this is a shape check only, never a content restriction', () => {
      expect(() =>
        assertCommandParts([
          'notepad.exe',
          "C:\\Program Files\\Sid Meier's Civilization V\\save.txt"
        ])
      ).not.toThrow()
    })
  })
})
