/**
 * Config-equivalence gate for the plain-Vite renderer build (D-12, Phase 35
 * plan 03).
 *
 * WHAT THIS CATCHES (the RED proof -- every one of these compiles green, ships
 * a broken artifact, and is invisible to `tsc --noEmit`, which does not even
 * look at `vite.config.ts`: `tsconfig.json` lists it under `exclude` and its
 * `include` is `["src"]`):
 *
 *   1. A lift that silently dropped `preserveRunnerSymlinksPlugin`. F-34.9-01:
 *      vite's `copyDir` dereferences every `Python.framework` symlink in the
 *      onedir runners into a real file, and `codesign` then rejects the bundle
 *      as "bundle format is ambiguous". This has already killed a build once.
 *      Asserted on the plugin's `name`, not on array position or length, so it
 *      still means something after a re-order.
 *   2. `emptyOutDir` flipped to `true`. `build/` also holds `bin/`,
 *      `locales/`, the SEA prep blob and the sidecar output, all written by
 *      OTHER build steps; emptying it destroys them.
 *   3. `base` reverting to vite's `'/'` default. `electron-vite`'s renderer
 *      preset set `'./'` in production
 *      (`node_modules/electron-vite/dist/chunks/lib-D9_OPmIh.cjs:507`); plain
 *      vite does not. Absolute `/assets/...` URLs in a packaged bundle are the
 *      white-screen shape `R-34.5-G1-PKG` describes -- and a `tauri:dev` run
 *      CANNOT see it, because `devUrl` serves over HTTP from the dev server
 *      root and never resolves a bundled asset.
 *   4. `sourcemap` becoming unconditional, leaking inline source into a
 *      shipped bundle (T-35-10). Both branches are asserted.
 *   5. The dev server drifting off port 5173, which `tauri.conf.json`'s
 *      `devUrl` hardcodes, or losing `strictPort` and silently landing on 5174.
 *
 * The assertions run against the RESOLVED config object returned by the
 * exported callback, under both `mode: 'production'` and `mode: 'development'`
 * -- not against the file's source text -- except for the two comment/import
 * assertions at the end, which exist to stop a future editor deleting the
 * rationale that explains why the symlink plugin may not be removed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ConfigEnv, Plugin, UserConfig } from 'vite'

import viteConfig from '../../vite.config'

type ConfigCallback = (env: ConfigEnv) => UserConfig

const resolveConfigFor = (mode: 'production' | 'development'): UserConfig => {
  const env: ConfigEnv = {
    command: mode === 'development' ? 'serve' : 'build',
    mode
  }
  return (viteConfig as unknown as ConfigCallback)(env)
}

/**
 * A vite plugin entry can be `false`, a single plugin, or a nested array of
 * plugins (`@vitejs/plugin-react-swc` returns several). Flatten to the set of
 * `name` strings so assertions never depend on position.
 */
const pluginNames = (config: UserConfig): string[] => {
  const names: string[] = []
  const walk = (entry: unknown): void => {
    if (!entry) {
      return
    }
    if (Array.isArray(entry)) {
      entry.forEach(walk)
      return
    }
    const name = (entry as Plugin).name
    if (typeof name === 'string') {
      names.push(name)
    }
  }
  walk(config.plugins)
  return names
}

const CONFIG_PATH = join(__dirname, '..', '..', 'vite.config.ts')

describe('vite.config.ts -- renderer config lifted off electron-vite', () => {
  describe.each(['production', 'development'] as const)(
    'mode: %s (invariants that hold in both modes)',
    (mode) => {
      const config = resolveConfigFor(mode)

      it('builds into build/ without emptying it', () => {
        expect(config.build?.outDir).toBe('build')
        expect(config.build?.emptyOutDir).toBe(false)
      })

      it('keeps the esnext target and a minified bundle', () => {
        expect(config.build?.target).toBe('esnext')
        expect(config.build?.minify).toBe(true)
      })

      it('builds the repo-root index.html from the repo root', () => {
        expect(config.root).toBe('.')
        const input = (
          config.build?.rollupOptions as { input?: string } | undefined
        )?.input
        expect(typeof input).toBe('string')
        expect(input as string).toMatch(/index\.html$/)
      })

      it('aliases backend, frontend and common under src/', () => {
        const alias = config.resolve?.alias as
          | { find: string; replacement: string }[]
          | undefined
        expect(Array.isArray(alias)).toBe(true)
        for (const name of ['backend', 'frontend', 'common']) {
          const entry = (alias ?? []).find((a) => a.find === name)
          expect(entry).toBeDefined()
          expect(entry?.replacement).toMatch(
            new RegExp(`[\\\\/]src[\\\\/]${name}$`)
          )
        }
      })

      // F-34.9-01. Asserted by name, so a re-order cannot make it vacuous.
      it('keeps preserveRunnerSymlinksPlugin in the plugin set', () => {
        expect(pluginNames(config)).toContain(
          'gamelib-preserve-runner-symlinks'
        )
      })

      // Quick task 260901-a2w.
      it('keeps pruneStaleHelperBinariesPlugin in the plugin set', () => {
        expect(pluginNames(config)).toContain(
          'gamelib-prune-stale-helper-binaries'
        )
      })

      // Quick task 260901-b8z: assembles the renderer-only dir frontendDist
      // now points at.
      it('keeps assembleRendererDistPlugin in the plugin set', () => {
        expect(pluginNames(config)).toContain('gamelib-assemble-renderer-dist')
      })

      // 260901-a2w F4 safety argument: the prune plugin must run at
      // buildStart (before vite's publicDir copy) and must NOT be moved
      // onto closeBundle (where the symlink plugin lives) -- that would
      // reopen the exact race this task's ordering comment rules out.
      // Asserted by HOOK IDENTITY, not array index, so a re-order cannot
      // make this vacuous and it WOULD fail if someone "simplified" the
      // prune into closeBundle.
      it('runs the prune plugin at buildStart, strictly before the symlink plugin at closeBundle', () => {
        const flattened: Plugin[] = []
        const walk = (entry: unknown): void => {
          if (!entry) return
          if (Array.isArray(entry)) {
            entry.forEach(walk)
            return
          }
          flattened.push(entry as Plugin)
        }
        walk(config.plugins)

        const prunePlugin = flattened.find(
          (p) => p.name === 'gamelib-prune-stale-helper-binaries'
        )
        const symlinkPlugin = flattened.find(
          (p) => p.name === 'gamelib-preserve-runner-symlinks'
        )

        expect(prunePlugin).toBeDefined()
        expect(prunePlugin?.buildStart).toBeDefined()
        expect(prunePlugin?.closeBundle).toBeUndefined()

        expect(symlinkPlugin).toBeDefined()
        expect(symlinkPlugin?.closeBundle).toBeDefined()
      })

      it('serves the dev server on the port tauri.conf.json devUrl hardcodes', () => {
        expect(config.server?.port).toBe(5173)
        expect(config.server?.strictPort).toBe(true)
      })

      it('carries electron-vite renderer preset defaults that vite does not default to', () => {
        expect(config.build?.modulePreload).toEqual({ polyfill: false })
        expect(config.envPrefix).toEqual(['RENDERER_VITE_', 'VITE_'])
      })
    }
  )

  describe('mode-conditional values', () => {
    it('emits relative asset URLs in production and root-relative in development', () => {
      // The load-bearing one. `'./'` was an electron-vite preset default; vite
      // defaults to `'/'`, which 404s every asset in a packaged bundle.
      expect(resolveConfigFor('production').base).toBe('./')
      expect(resolveConfigFor('development').base).toBe('/')
    })

    it('only inlines sourcemaps in development (T-35-10)', () => {
      expect(resolveConfigFor('development').build?.sourcemap).toBe('inline')
      expect(resolveConfigFor('production').build?.sourcemap).toBe(false)
    })

    it('only injects the react-devtools script outside production', () => {
      expect(pluginNames(resolveConfigFor('development'))).toContain(
        'react-dev-tools-replace'
      )
      expect(pluginNames(resolveConfigFor('production'))).not.toContain(
        'react-dev-tools-replace'
      )
    })
  })

  describe('source-text guards', () => {
    const source = readFileSync(CONFIG_PATH, 'utf-8')

    it('does not import from electron-vite', () => {
      // Plan 35-14 deletes electron.vite.config.ts. This config must not be
      // coupled to it or to electron-vite in any way.
      expect(source).not.toMatch(/from ['"]electron-vite['"]/)
    })

    it('keeps the F-34.9-01 rationale next to the symlink plugin', () => {
      // Without this comment a future reader sees an unexplained plugin call
      // and deletes it; the resulting failure only surfaces at codesign time.
      expect(source).toContain('F-34.9-01')
    })

    it('records that a tauri:dev pass proves nothing about the packaged build', () => {
      expect(source).toContain('not evidence about the packaged build')
    })
  })
})
