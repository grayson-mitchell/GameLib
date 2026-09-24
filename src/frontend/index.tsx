// Phase 27 Plan 05: install the on-page error surface FIRST (zero-import module), so its
// global error/unhandledrejection handlers are live before any other module in the bundle
// evaluates and can render import-time throws to #root instead of a silent blank page (the
// Tauri dev webview has no devtools/inspect). Placed above tauriAttach: it pulls in nothing,
// so it does not disturb tauriAttach's own "runs before GlobalState" ordering requirement.
import './bootErrorSurface'

// BLOCKER-1 (27-01) / T-27-07: must be the FIRST *meaningful* import in this file. ES modules
// resolve every static import in a file, in declaration order, before any of that file's own
// top-level statements run -- and `preload/tauriAttach`'s attach-window.api side effect
// must complete before `./helpers/electronStores` (transitively imported by
// `./state/GlobalState`, imported below) evaluates: that module constructs several
// `TypeCheckedStoreFrontend`s at ITS OWN module scope, each of which calls
// `window.api.storeNew(...)` synchronously the moment it is first imported. Being this
// file's first-declared meaningful import guarantees its (Electron/Node-free) dependency
// subtree evaluates before every sibling import below. No-ops entirely under Electron -- the
// real preload script already attached window.api, in its own separate execution context,
// before this renderer bundle's JS ever starts running.
import '../preload/tauriAttach'

// TEMPORARY (debug session `packaged-blank-render`): geometry probe for the ~1-in-4
// blank packaged render. Delete with `src/frontend/blankRenderProbe.ts`.
import { probeMark } from './blankRenderProbe'

import { I18nextProvider, initReactI18next } from 'react-i18next'
import HttpApi from 'i18next-http-backend'
import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import i18next from 'i18next'
import { initGamepad } from './helpers/gamepad'

import './index.scss'
import './themes.scss'
import GlobalState from './state/GlobalState'
import { initShortcuts } from './helpers/shortcuts'
import { configStore } from './helpers/electronStores'
import { initOnlineMonitor } from './helpers/onlineMonitor'
import { defaultThemes } from './components/UI/ThemeSelector'
import Loading from './screens/Loading'
import { hydrateStoreSnapshot } from '../preload/tauriTransport'
import { applyFramelessDecorations } from '../preload/api/tauriWindowChrome'
import {
  i18nextLanguageOptions,
  toI18nextCode,
  toShippedLanguage
} from 'common/languages'

initOnlineMonitor()

window.addEventListener('error', (ev: ErrorEvent) => {
  window.api.logError(ev.error)
})

// Must resolve before the first synchronous store read below (`configStore.get_nodefault`)
// -- the Steam login-gate in GlobalState's constructor (later in this file, via
// `root.render`) also depends on this being hydrated by the time React renders.
// Top-level await is safe here: this is the entry module, nothing imports it. Resolved
// immediately when the sidecar is absent (the old Electron build never populated it).
//
// Guarded (Phase 27 Plan 05): NEVER let a sidecar/transport failure prevent React from
// mounting. `root.render()` is later in this module body, AFTER this await -- an
// unguarded rejection here would abort module evaluation and leave the Tauri window
// showing a permanent BLANK screen with no diagnostics (the original 27-05 blank-screen
// symptom). On failure we log loudly and render with an empty snapshot: GlobalState's
// synchronous store reads then fall back to defaults (degraded but visible), and the real
// error is inspectable in the webview devtools console instead of hidden behind a blank page.
// Phase 35 plan 17: this used to be gated behind a Tauri-context check with no else
// branch (Electron never ran this body -- it had no sidecar to hydrate a snapshot
// from). Tauri is now the only shell, so the guard always evaluated true; it is
// removed and this always runs.
probeMark('before-hydrate')

try {
  // Race against a timeout so a wedged transport (dead sidecar, unregistered command)
  // becomes a visible degraded render within a few seconds instead of hanging the mount
  // forever behind a blank screen.
  await Promise.race([
    hydrateStoreSnapshot(),
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () =>
          reject(
            new Error('sidecar store-snapshot hydration timed out after 8000ms')
          ),
        8000
      )
    )
  ])
} catch (error) {
  console.error(
    '[GameLib] sidecar store-snapshot hydration failed; mounting with an empty ' +
      'snapshot (stores will read defaults). Underlying error:',
    error
  )
}

// CR-02 (Phase 34.1 code review): RE-apply the frameless decoration state now that
// `configStore.settings` is actually in the snapshot.
//
// `preload/tauriAttach` (this file's first import) calls `applyFramelessDecorations()`
// from its MODULE BODY, deliberately, so the window never visibly flips on startup.
// But ES modules evaluate every static import before any of this file's own top-level
// statements run -- and `hydrateStoreSnapshot()` above is a top-level STATEMENT. So at
// attach time the snapshot map is still empty, `snapshotGet('configStore','settings')`
// returns `undefined`, and the pre-paint call always resolves the DEFAULT
// (`framelessWindow: false` -> `setDecorations(true)`), never the user's setting.
//
// For a `framelessWindow: true` user that shipped a visibly broken window on every
// launch: the native titlebar was restored here, while `App.tsx` reads `isFrameless`
// LATER (GlobalState.tsx, post-hydration) and correctly got `true` -- so GameLib
// rendered its OWN overlay window controls on top and the user got BOTH chromes at
// once. Nothing re-applied afterwards; the only other call site is the `setSetting`
// toggle.
//
// The pre-paint call is still the right default-state paint; this is the correcting
// second pass. `applyFramelessDecorations` is idempotent and TOTAL (never throws --
// see tauriWindowChrome.ts's header), so a redundant re-apply for the common
// decorated case costs one `setDecorations(true)` and nothing else.
probeMark('after-hydrate')
applyFramelessDecorations()

const DEFAULT_THEME = 'midnightMirage'

const Backend = new HttpApi(null, {
  // Quick task 260901-b8z: `addPath` used to live here as
  // 'build/locales/{{lng}}/{{ns}}'. It is reached only via
  // `backendConnector.saveMissing`, which is nowhere set in this repo, so it
  // never executed -- and its `build/...` prefix would have been actively
  // wrong once frontendDist repointed at build/renderer (it resolved
  // relative to the OLD frontendDist root, not the new one). Removed rather
  // than "fixed", since a dead option pointing at a plausible-looking path
  // is a trap for the next reader. `loadPath` below is LIVE -- do not touch.
  //
  // quick-260925-bq4: a function rather than the '{{lng}}' string, because the
  // code i18next resolves is now the BCP-47 tag ('pt-BR') while the directory
  // on disk keeps its shipped name ('pt_BR'). `toShippedLanguage` maps back.
  // NOTE the signature: i18next-http-backend 2.7.3 calls loadPath with ARRAYS
  // (`loadPath(languages, namespaces)`, :89-90); i18next-fs-backend 2.6.0 calls
  // it with SCALARS. The sidecar's copy of this is therefore NOT identical --
  // writing one shape for both silently yields '[object Array]' in a path.
  loadPath: (languages: string[], namespaces: string[]) =>
    `locales/${toShippedLanguage(languages[0])}/${namespaces[0]}.json`
})

initGamepad()
initShortcuts()

const storage: Storage = window.localStorage
storage.removeItem('nonAvailableGames')

const languageCode: string =
  configStore.get_nodefault('language') ?? storage.getItem('language') ?? 'en'
configStore.set('language', languageCode)
// The BCP-47 tag, not the shipped code: `lang="pt_BR"` is not a valid language
// tag and the four underscore-named locales would emit one (quick-260925-bq4).
document
  .querySelector('html')
  ?.setAttribute('lang', toI18nextCode(languageCode))

window.setCustomCSS = (cssString: string) => {
  const style = document.createElement('style')
  style.innerHTML = cssString
  document.getElementById('customCSS')!.innerText = style.innerText
}

window.api
  .getCustomCSS()
  .then(window.setCustomCSS)
  .catch(() => {})

i18next
  // load translation using http -> see /public/locales
  // learn more: https://github.com/i18next/i18next-http-backend
  .use(Backend)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(initReactI18next)
  .init({
    returnEmptyString: false,
    returnNull: false,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    // `lng` + `supportedLngs` as one unit -- see i18nextLanguageOptions' header
    // for why they must stay in step (a BCP-47 `lng` against the underscore
    // `supportedLngs` list filters the locale out entirely and sends
    // EVERYTHING to English, not just plurals).
    ...i18nextLanguageOptions(languageCode),
    react: {
      useSuspense: true
    }
  })

const container = document.getElementById('root')
const root = createRoot(container!) // createRoot(container!) if you use TypeScript
const App = lazy(async () => {
  probeMark('app-chunk-import-start')
  const mod = await import('./App')
  probeMark('app-chunk-import-done')
  return mod
})

probeMark('before-root-render')

root.render(
  // <React.StrictMode>
  <GlobalState>
    <I18nextProvider i18n={i18next}>
      <Suspense fallback={<Loading />}>
        <App />
      </Suspense>
    </I18nextProvider>
  </GlobalState>
  // </React.StrictMode>
)

probeMark('after-root-render')
i18next.on('initialized', () => probeMark('i18next-initialized'))
i18next.on('loaded', () => probeMark('i18next-loaded'))

// helper function to set the theme class and load custom css if needed
window.setTheme = async (themeClass: string) => {
  document.querySelector('style.customTheme')?.remove()

  if (
    themeClass !== DEFAULT_THEME &&
    !Object.keys(defaultThemes).includes(themeClass)
  ) {
    const cssContent = await window.api.getThemeCSS(themeClass)
    themeClass = themeClass
      .replace('.css', '') // remove extension
      .replace(/[\s.]/, '_') // remove dots and empty spaces
    const style = document.createElement('style')
    style.classList.add('customTheme')
    style.innerHTML = cssContent
    document.body.insertAdjacentElement('afterbegin', style)
  }

  document.body.className = themeClass

  // `navigator.windowControlsOverlay` is undefined in the Tauri WKWebView (it is a
  // Chromium/Electron-only surface), so guard the access — mirrors App.tsx's
  // `navigator['windowControlsOverlay']?.visible`. Without the `?.` this throws an
  // unhandled "undefined is not an object" rejection at startup under `tauri:dev`.
  if (navigator.windowControlsOverlay?.visible) {
    const titlebarOverlay = Object.fromEntries(
      ['height', 'color', 'symbol-color']
        .map((item) => [
          item === 'symbol-color' ? 'symbolColor' : item,
          getComputedStyle(document.body)
            .getPropertyValue(`--titlebar-${item}`)
            .trim()
        ])
        .filter(([, val]) => !!val)
    )
    window.api.setTitleBarOverlay(titlebarOverlay)
  }
}

const themeClass = configStore.get('theme', DEFAULT_THEME)
window.setTheme(themeClass)

// helper function to generate images for steam
// image is centered, sides are padded with blurred image
// returns dataURL of the generated image

// This is added globally to be able to call it directly from the backend
window.imageData = async (
  src: string,
  cw: number,
  ch: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('CANVAS') as HTMLCanvasElement
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const img = document.createElement('IMG') as HTMLImageElement
    img.crossOrigin = 'anonymous' // prevents cors errors when exporting

    img.addEventListener(
      'load',
      function () {
        // measure canvas and image
        canvas.width = cw
        canvas.height = ch
        const imgWidth = img.width
        const imgHeight = img.height

        // calculate drawing of the background
        const bkgW = cw
        const bkgH = (imgHeight * cw) / imgWidth
        const bkgX = 0
        const bkgY = ch / 2 - bkgH / 2
        ctx.filter = 'blur(10px)' // add blur and draw
        ctx.drawImage(img, bkgX, bkgY, bkgW, bkgH)

        // calculate drawing of the foreground
        const drawH = ch
        const drawW = (imgWidth * ch) / imgHeight
        const drawY = 0
        const drawX = cw / 2 - drawW / 2
        ctx.filter = 'blur(0)' // remove blur and draw
        ctx.drawImage(img, drawX, drawY, drawW, drawH)

        // resolve with dataURL
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      },
      false
    )

    img.addEventListener('error', (error) => {
      reject(new Error(error.message, { cause: error }))
    })

    // set src to trigger the callback
    img.src = src
  })
}
