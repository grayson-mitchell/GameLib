#!/usr/bin/env node
// Shell-overflow harness: does the `.App` grid grow wider than the viewport at
// narrow widths, and which rule (if any) stops it? Uses the SHIPPED stylesheets
// (App.css, NavShell/NavTabs/NavItem/WindowControls scss compiled by sass,
// WebView/index.css, index.scss, themes.scss) unmodified, plus a transcription
// of MUI 5.17.1's Tabs/Tab base rules (emotion injects them at runtime, so a
// static page has to carry them). DOM mirrors NavShell/index.tsx (header >
// NavTabs with the 5 real tabs, aside tier2) and WebView/index.tsx's embed
// container with StoreEmbedTimeoutBanner's markup and English strings.
//   node build-page.mjs <repo> <compiled-css-dir> <out.html>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [repo, cssDir, out] = process.argv.slice(2)
const r = (p) => readFileSync(p, 'utf8')
const appCss = r(join(repo, 'src/frontend/App.css')).replace(/^@import[^\n]*\n/gm, '')
const css = [
  r(join(cssDir, 'index.css')),
  r(join(cssDir, 'themes.css')),
  appCss,
  r(join(cssDir, 'src_frontend_components_UI_NavShell_index.scss.css')),
  r(join(cssDir, 'src_frontend_components_UI_NavShell_components_NavTabs_index.scss.css')),
  r(join(cssDir, 'src_frontend_components_UI_NavShell_components_NavItem_index.scss.css')),
  r(join(cssDir, 'src_frontend_components_UI_WindowControls_index.scss.css')),
  r(join(repo, 'src/frontend/screens/WebView/index.css'))
].join('\n')

// MUI 5.17.1 base rules (ButtonBase + Tabs root/scroller/flexContainer + Tab
// root with icon+label, iconPosition=start), transcribed from
// node_modules/@mui/material/{ButtonBase,Tabs,Tab}/*.js. Standard variant:
// scroller is `fixed` (overflow-x hidden, width 100%), not scrollable.
const mui = `
.MuiTabs-root{overflow:hidden;min-height:48px;display:flex}
.MuiTabs-scroller{position:relative;display:inline-block;flex:1 1 auto;white-space:nowrap;overflow-x:hidden;width:100%}
.MuiTabs-flexContainer{display:flex}
.MuiButtonBase-root{display:inline-flex;align-items:center;justify-content:center;position:relative;box-sizing:border-box;background-color:transparent;outline:0;border:0;margin:0;border-radius:0;padding:0;cursor:pointer;user-select:none;vertical-align:middle;text-decoration:none;color:inherit}
.MuiTab-root{font-family:"Roboto","Helvetica","Arial",sans-serif;font-weight:500;font-size:0.875rem;line-height:1.75;letter-spacing:0.02857em;text-transform:uppercase;max-width:360px;min-width:90px;position:relative;min-height:48px;flex-shrink:0;padding:12px 16px;overflow:hidden;white-space:normal;text-align:center;flex-direction:row;line-height:1.25}
.MuiTab-root.MuiTab-labelIcon{min-height:72px;padding-top:9px;padding-bottom:9px}
.MuiTab-root.MuiTab-labelIcon>.MuiTab-iconWrapper{margin-right:8px}
.svg-inline--fa{display:var(--fa-display,inline-block);height:1em;overflow:visible;vertical-align:-0.125em}
`

const fonts = [
  'node_modules/@fontsource/rubik/index.css',
  'node_modules/@fontsource/cabin/index.css'
].map((p) => `<link rel="stylesheet" href="file://${join(repo, p)}">`).join('\n')

const tab = (id, label, selected, w) =>
  `<a class="MuiButtonBase-root MuiTab-root MuiTab-labelIcon MuiTab-textColorPrimary${selected ? ' Mui-selected' : ''}" role="tab" id="tab-${id}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" href="#">
  <svg class="svg-inline--fa MuiTab-iconWrapper" viewBox="0 0 ${w} 512" style="width:${w / 512}em" aria-hidden="true"><rect width="${w}" height="512"/></svg>${label}</a>`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>shell-overflow harness</title>
${fonts}
<style>${css}</style>
<style>${mui}</style>
<style id="arm"></style>
</head>
<body class="midnightMirage">
<div id="root">
<div class="App macOverlayTitlebar frameless">
  <header class="NavShell__navbar">
    <div class="NavTabs MuiTabs-root" data-tour="nav-menu">
      <div class="MuiTabs-scroller MuiTabs-fixed">
        <div class="MuiTabs-flexContainer" role="tablist">
          ${tab(0, 'Accounts', false, 448)}
          ${tab(1, 'Library', false, 640)}
          ${tab(2, 'Stores', true, 576)}
          ${tab(3, 'Downloads', false, 512)}
          ${tab(4, 'Settings', false, 512)}
        </div>
      </div>
    </div>
  </header>
  <aside class="NavShell__tier2">
    <nav class="NavShell__tier2-list">
      <a class="NavItem" href="#"><span class="NavItem__label">Epic Games</span></a>
      <a class="NavItem" href="#"><span class="NavItem__label">GOG</span></a>
      <a class="NavItem" href="#"><span class="NavItem__label">Amazon Games</span></a>
      <a class="NavItem" href="#"><span class="NavItem__label">Steam</span></a>
    </nav>
  </aside>
  <main class="content">
    <div class="WebView WebView__embedContainer">
      <div class="WebView__embedNoticeRow" role="status">
        <svg class="svg-inline--fa WebView__embedNoticeRow-icon" viewBox="0 0 512 512" style="width:1em" aria-hidden="true"><rect width="512" height="512"/></svg>
        <span class="WebView__embedNoticeRow-message">Epic is taking a while to load</span>
        <div class="WebView__embedNoticeRow-actions">
          <button type="button" class="WebView__embedNoticeRow-action">Reload</button>
          <button type="button" class="WebView__embedNoticeRow-action">Open in browser</button>
        </div>
      </div>
      <div class="WebView__embedSlot"><div class="WebView__embedPlaceholder"><p class="WebView__embedPlaceholder-message">slot</p></div></div>
    </div>
  </main>
</div>
</div>
<pre id="results"></pre>
<script>
const ARMS = {
  shipped: '',
  'content-min-width-0': '.App .content{min-width:0}',
  'navbar-min-width-0': '.NavShell__navbar{min-width:0}',
  'navbar-overflow-hidden': '.NavShell__navbar{overflow:hidden}',
  'F1-container-minmax0': '.WebView__embedContainer{grid-template-columns:minmax(0,1fr)}',
  'F2-row-min-width-0': '.WebView__embedNoticeRow{min-width:0}',
  'F3-row-overflow-hidden': '.WebView__embedNoticeRow{overflow:hidden}'
}
const q = (s) => document.querySelector(s)
const rect = (el) => { const b = el.getBoundingClientRect(); return { left: +b.left.toFixed(2), right: +b.right.toFixed(2), width: +b.width.toFixed(2) } }
function measure() {
  const app = q('.App'), nav = q('.NavShell__navbar'), tabs = q('.NavTabs'), flex = q('.MuiTabs-flexContainer')
  const content = q('.App .content'), row = q('.WebView__embedNoticeRow'), msg = q('.WebView__embedNoticeRow-message'), actions = q('.WebView__embedNoticeRow-actions')
  const vw = document.documentElement.clientWidth
  const tabWidths = [...document.querySelectorAll('.MuiTab-root')].map((t) => +t.getBoundingClientRect().width.toFixed(2))
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:min-content;display:block'
  const clone = nav.cloneNode(true); clone.style.gridArea = 'auto'; probe.appendChild(clone); app.appendChild(probe)
  const navMinContent = +probe.getBoundingClientRect().width.toFixed(2)
  probe.remove()
  return {
    viewportWidth: vw,
    appClientWidth: app.clientWidth, appScrollWidth: app.scrollWidth,
    gridTemplateColumns: getComputedStyle(app).gridTemplateColumns,
    navbar: rect(nav), navbarScrollWidth: nav.scrollWidth, navbarMinContent: navMinContent,
    tabs: rect(tabs), tabsScrollWidth: tabs.scrollWidth, flexContainerWidth: +flex.getBoundingClientRect().width.toFixed(2), tabWidths,
    content: rect(content), contentScrollWidth: content.scrollWidth,
    bodyMargin: getComputedStyle(document.body).margin,
    container: rect(q('.WebView__embedContainer')), containerScrollWidth: q('.WebView__embedContainer').scrollWidth,
    containerGridColumns: getComputedStyle(q('.WebView__embedContainer')).gridTemplateColumns,
    noticeRow: rect(row), message: rect(msg), actions: rect(actions),
    actionsClippedByViewport: actions.getBoundingClientRect().right > vw + 0.5,
    appOverflows: app.scrollWidth > app.clientWidth + 0.5 || content.getBoundingClientRect().right > vw + 0.5
  }
}
function run() {
  const results = {}
  for (const [arm, cssText] of Object.entries(ARMS)) {
    q('#arm').textContent = cssText
    void document.body.offsetWidth
    results[arm] = measure()
  }
  q('#arm').textContent = ''
  const out = { ua: navigator.userAgent, fontsReady: document.fonts.status, arms: results }
  const json = JSON.stringify(out)
  q('#results').textContent = json
  window.__resultsJSON = json
}
document.fonts.ready.then(run)
</script>
</body></html>`
writeFileSync(out, html)
process.stdout.write(out + '\n')
