/* Page script for the G-48-11c scroller harness (Phase 48 plan 17). Inlined by
   build-scroller-page.mjs. Synthetic fixture only (solid grey art, "Fixture NN"
   titles). Plain async/await; waits are rAF raced against a timeout because the
   headless shell never fires rAF. */
;(async function () {
  var FRO = window.FRO
  var CFG = window.__CFG
  var N = 14
  var USE_CONTEXT = typeof FRO.readScrollerAllowance === 'function'
  var MIN = 156
  var clock = 0 // injected clock: +1000ms per call, so the 250ms flip-hold (a different mechanism, pinned elsewhere) never fires between states

  function el(tag, cls, parent) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (parent) parent.appendChild(e)
    return e
  }
  function frame() {
    return new Promise(function (r) {
      var done = false
      function fin() {
        if (!done) {
          done = true
          r()
        }
      }
      requestAnimationFrame(fin)
      setTimeout(fin, 60)
    })
  }
  async function frames(n) {
    for (var i = 0; i < n; i++) await frame()
  }

  function gridCard(parent, i) {
    var outer = el('div', '', parent)
    var card = el('div', 'gameCard', el('div', '', outer))
    var a = el('a', '', card)
    a.setAttribute('href', '#fx' + i)
    var img = el('img', 'gameImg', a)
    img.setAttribute('alt', 'cover')
    img.setAttribute('src', CFG.art)
    var t = el('span', 'gameTitle', a)
    el('span', '', t).textContent = 'Fixture ' + (i < 10 ? '0' : '') + i
    el('span', 'runner', a).textContent = 'Other'
    return outer
  }

  // The app tree: .App > main.content > .listing > [strip, main region].
  function mountApp(opts) {
    var app = el('div', 'App', document.getElementById('stage'))
    app.style.width = '1600px'
    app.style.height = opts.appHeight + 'px'
    var content = el('main', 'content', app)
    content.style.width = opts.contentWidth + 'px'
    content.style.justifySelf = 'start'
    var listing = el('div', 'listing', content)
    var strip = el('div', 'focusRowStrip', listing)
    el('h3', 'libraryHeader', el('div', 'library-section-header', strip)).textContent = 'Recent'
    var viewport = el('div', 'focusRowStrip__viewport', strip)
    var track = el('div', 'focusRowTrack', viewport)
    var list = el('div', 'gameList', track)
    for (var i = 0; i < N; i++) gridCard(list, i)
    var main = el('div', '', listing)
    return {
      app: app,
      content: content,
      listing: listing,
      track: track,
      list: list,
      main: main,
      sync: FRO.createStripCardWidthSync(function () {
        clock += 1000
        return clock
      }),
      spacer: null
    }
  }

  function clearMain(m) {
    m.main.innerHTML = ''
    m.spacer = null
  }
  function showGrid(m, count) {
    clearMain(m)
    var g = el('div', 'gameList', m.main)
    for (var i = 0; i < count; i++) gridCard(g, i)
  }
  function showEmpty(m) {
    clearMain(m)
    var z = el('div', 'FilterZeroResult', m.main)
    el('h3', 'FilterZeroResult__heading', z).textContent = 'No games match your filters'
    el('p', 'FilterZeroResult__body', z).textContent = 'No games match Search: zzzz.'
    el('button', 'FilterZeroResult__action', z).textContent = 'Clear all filters'
  }
  function showListLayout(m, rows) {
    clearMain(m)
    var l = el('div', 'gameListLayout', m.main)
    var h = el('div', 'gameListHeader', l)
    ;['Title', 'Store', 'Size', ''].forEach(function (s) {
      el('span', '', h).textContent = s
    })
    for (var i = 0; i < rows; i++) {
      var r = el('div', 'gameListItem', l)
      r.style.minHeight = '64px'
      el('span', '', r).textContent = 'Fixture ' + (i < 10 ? '0' : '') + i
    }
  }
  function addSpacer(m) {
    m.spacer = el('div', '', m.main)
    m.spacer.style.height = '2000px'
  }

  function paddings(m) {
    var s = getComputedStyle(m.list)
    return {
      pad: (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0),
      gap: parseFloat(s.columnGap)
    }
  }

  async function settle(m, shown) {
    await frames(2)
    var ret
    if (USE_CONTEXT) {
      ret = m.sync(m.track, undefined, {
        gridShown: function () {
          return shown
        },
        scrollbarAllowance: FRO.readScrollerAllowance
      })
    } else {
      ret = m.sync(m.track)
    }
    await frames(2)
    return ret
  }

  function read(m, id, shown) {
    var p = paddings(m)
    var trackW = m.track.getBoundingClientRect().width
    var C = trackW - p.pad
    var wrap = m.track.querySelector('.gameList > *')
    var mainWrap = m.main.querySelector('.gameList > *')
    return {
      id: id,
      gridShown: shown,
      sb: m.content.offsetWidth - m.content.clientWidth,
      trackW: trackW,
      C: C,
      cardW: wrap.getBoundingClientRect().width,
      gridCardW: mainWrap ? mainWrap.getBoundingClientRect().width : null,
      n: FRO.gridColumnCount(C, MIN, p.gap),
      inlineWidth: parseFloat(m.track.style.getPropertyValue('--focus-row-card-width')),
      expectedCardW: FRO.gridColumnWidth(C, MIN, p.gap)
    }
  }

  var states = []
  async function run(m, id, shown, setup) {
    setup()
    await settle(m, shown)
    states.push(read(m, id, shown))
  }

  var m = mountApp({ appHeight: 800, contentWidth: CFG.contentWidth })
  // initial first-paint sync with the grid shown, as the layout effect does
  showGrid(m, N)
  await settle(m, true)
  await run(m, 'A1', true, function () { showGrid(m, N) })
  await run(m, 'A2', false, function () { showEmpty(m) })
  await run(m, 'A3', false, function () { showEmpty(m); addSpacer(m) })
  await run(m, 'A5', false, function () { showListLayout(m, 0) })
  await run(m, 'A6', false, function () { showListLayout(m, N) })
  await run(m, 'A1b', true, function () { showGrid(m, N) })
  await run(m, 'A4', true, function () {
    showGrid(m, N)
    m.content.style.overflowY = 'hidden'
  })

  if (window.__EXTENDED) {
    // A7: a fresh strip, small library, tall app so the scroller does not overflow.
    var s = mountApp({ appHeight: 1500, contentWidth: CFG.contentWidth })
    showGrid(s, 2)
    await settle(s, true)
    states.push(read(s, 'A7', true))
    s.app.remove()

    // A8: Task 1's track; re-establish reference 10, hide the grid, narrow by 100.
    m.content.style.overflowY = ''
    await run(m, 'A8ref', true, function () { showGrid(m, N) })
    var refC = states[states.length - 1].C
    await run(m, 'A8', false, function () {
      showEmpty(m)
      m.content.style.width = CFG.contentWidth - 100 + 'px'
    })
    var a8 = states[states.length - 1]
    a8.refC = refC
    a8.expectedC = refC - 100
    a8.expectedCardW = FRO.gridColumnWidth(refC - 100, MIN, paddings(m).gap)

    // A9: a fresh strip mounted straight into the empty state (no reference).
    var f = mountApp({ appHeight: 800, contentWidth: CFG.contentWidth })
    showEmpty(f)
    await settle(f, false)
    states.push(read(f, 'A9', false))
    f.app.remove()
  }

  window.__resultsJSON = JSON.stringify({
    call: USE_CONTEXT ? 'context' : 'two-arg',
    states: states
  })
})()
