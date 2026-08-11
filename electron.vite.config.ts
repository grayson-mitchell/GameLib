import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr'
import path from 'path'

import type { Plugin } from 'vite'

import { preserveRunnerSymlinksPlugin } from './meta/preserveRunnerSymlinks'

const srcAliases = ['backend', 'frontend', 'common'].map((aliasName) => ({
  find: aliasName,
  replacement: path.join(__dirname, 'src', aliasName)
}))

const dependenciesToNotExternalize = [
  '@xhmikosr/decompress',
  '@xhmikosr/decompress-targz',
  '@xhmikosr/decompress-unzip'
]

// FIXME: Potentially publish this as a dedicated plugin, if other projects
//        run into the same issue
const vite_plugin_react_dev_tools: Plugin = {
  name: 'react-dev-tools-replace',
  transformIndexHtml: {
    handler: (html) =>
      html.replace(
        '<!-- REACT_DEVTOOLS_SCRIPT -->',
        '<script src="http://localhost:8097"></script>'
      )
  }
}

export default defineConfig(({ mode }) => ({
  main: {
    build: {
      rollupOptions: {
        // Object map (not a bare string) — Phase 21 gap closure (21-15) adds
        // the DecompressPool's worker_threads entry as a second emitted
        // bundle, `decompressWorker.js`, co-located with `main.js` in
        // build/main/ (dev AND packaged asar builds). The `main` key is
        // named to match package.json's `"main": "build/main/main.js"` — do
        // not rename it, output filenames follow the object's keys.
        input: {
          main: 'src/backend/main.ts',
          decompressWorker: 'src/backend/storeManagers/steam/depot/decompressWorker.ts'
        }
      },
      outDir: 'build/main',
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [externalizeDepsPlugin({ exclude: dependenciesToNotExternalize })]
  },
  preload: {
    build: {
      rollupOptions: {
        input: 'src/preload/index.ts'
      },
      outDir: 'build/preload',
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [externalizeDepsPlugin({ exclude: dependenciesToNotExternalize })]
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve('index.html')
      },
      target: 'esnext',
      outDir: 'build',
      emptyOutDir: false,
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [
      react(),
      svgr(),
      mode !== 'production' && vite_plugin_react_dev_tools,
      // F-34.9-01: vite's copyDir (publicDir -> outDir) dereferences
      // symlinks -- every Python.framework symlink inside the onedir
      // runners becomes a real file/directory in build/, which codesign
      // then rejects ("bundle format is ambiguous"). This restores every
      // source symlink after the copy runs. Unconditional -- a no-op
      // wherever the source tree has no symlinks (Linux/Windows checkouts).
      preserveRunnerSymlinksPlugin()
    ]
  }
}))
