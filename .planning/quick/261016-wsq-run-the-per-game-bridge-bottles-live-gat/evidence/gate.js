// Live-gate console probe for quick task 261016-wsq (per-game bridge bottles, 261016-u1w).
// Loaded into the main webview from the Web Inspector console with
//   import('/@fs/<repo>/.planning/quick/261016-wsq-.../evidence/gate.js')
// Every call writes one `[GATE-wsq] <tag> <json>` line through window.api.logInfo, which lands in
// ~/Library/Logs/GameLib/gamelib.log (CR line endings). Nothing here touches the DOM.
;(function () {
  const w = window
  const api = w.api
  const log = (tag, obj) => {
    const line = '[GATE-wsq] ' + tag + ' ' + JSON.stringify(obj)
    console.log(line)
    if (api && typeof api.logInfo === 'function') api.logInfo(line)
  }
  const pick = (g) =>
    g
      ? { app: g.app_name, title: g.title, installed: g.is_installed, path: g.install && g.install.install_path, platform: g.install && g.install.platform }
      : null
  w.__gi = async (id) => {
    const g = await api.getGameInfo(String(id), 'steam')
    log('gi', pick(g))
    return g
  }
  w.__snap = async (tag) => {
    const out = {}
    for (const id of ['206040', '206060', '63000']) out[id] = pick(await api.getGameInfo(id, 'steam'))
    log('snap:' + tag, out)
    return out
  }
  w.__uninst = async (id) => {
    log('uninstall:start', { id })
    const r = await api.uninstall(String(id), 'steam', false, false)
    log('uninstall:done', { id, r })
    return r
  }
  w.__inst = async (id) => {
    const gameInfo = await api.getGameInfo(String(id), 'steam')
    log('install:start', { id, pre: pick(gameInfo) })
    const r = await api.install({ appName: String(id), runner: 'steam', gameInfo, path: '', platformToInstall: 'Windows' })
    log('install:queued', { id, r })
    return r
  }
  w.__launch = async (id) => {
    log('launch:start', { id })
    const r = await api.launch({ appName: String(id), runner: 'steam' })
    log('launch:done', { id, r })
    return r
  }
  w.__refresh = async () => {
    log('refresh:start', {})
    const r = await api.refreshLibrary('steam', 'gate-wsq')
    log('refresh:done', { r })
    return r
  }
  log('probe-installed', { t: Date.now() })
})()
