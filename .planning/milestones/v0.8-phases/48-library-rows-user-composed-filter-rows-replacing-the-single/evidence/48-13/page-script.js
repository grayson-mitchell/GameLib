/* Page script for the G-48-11b strip harness (Phase 48 plan 13). Inlined by
   build-harness.mjs. No requestAnimationFrame anywhere: it never fires in the
   headless shell. Synthetic fixture only (solid grey art, "Fixture NN" titles). */
;(function () {
  var GAP = 24
  var INSET = 15
  var FRO = window.FRO
  var CFG = window.__CFG
  var stage = document.getElementById('stage')

  function tick() {
    return new Promise(function (r) {
      setTimeout(r, 0)
    })
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (parent) parent.appendChild(e)
    return e
  }

  function titleFor(i, kind) {
    if (kind === 'long') {
      return ('Fixture With A Particularly Long Title ' + i).slice(0, 37).padEnd(37, '.')
    }
    return 'Fixture ' + String(i).padStart(2, '0')
  }

  // The `!visible` placeholder branch of GameCard/index.tsx: a bare div carrying
  // the wrapper classes.
  function placeholder(i) {
    var d = document.createElement('div')
    d.className = 'gameCard'
    d.setAttribute('data-app-name', 'fx' + i)
    d.__placeholder = true
    return d
  }

  // The visible branch (GameCard/index.tsx:523-658): outer div (the flex item),
  // ContextMenu div, .gameCard, link, art, title, runner, icons bar.
  function visibleCard(i, v) {
    var outer = document.createElement('div')
    var ctx = el('div', '', outer)
    ctx.style.cursor = 'context-menu'
    var card = el('div', 'gameCard', ctx)
    card.setAttribute('data-app-name', 'fx' + i)
    var a = el('a', '', card)
    a.setAttribute('href', '#fx' + i)
    var img = el('img', 'gameImg', a)
    img.setAttribute('alt', 'cover')
    img.setAttribute('src', CFG.art[v.artSize])
    img.setAttribute('loading', 'lazy')
    var t = el('span', 'gameTitle', a)
    el('span', '', t).textContent = titleFor(i, v.title)
    el('span', 'runner', a).textContent = 'Other'
    var icons = el('span', 'icons', card)
    var svgNs = 'http://www.w3.org/2000/svg'
    // play + settings SvgButtons (an svg with a viewBox and no width/height, as
    // the app's icon components render), then the store badge.
    ;['playIcon', 'settingsIcon'].forEach(function (cls) {
      var b = el('button', 'svg-button ' + cls, icons)
      var ic = document.createElementNS(svgNs, 'svg')
      ic.setAttribute('viewBox', '0 0 24 24')
      b.appendChild(ic)
    })
    var svg = document.createElementNS(svgNs, 'svg')
    svg.setAttribute('class', 'store-icon')
    svg.setAttribute('viewBox', '0 0 10 10')
    icons.appendChild(svg)
    outer.__placeholder = false
    outer.__card = true
    return outer
  }

  function rectOf(e) {
    return e.getBoundingClientRect()
  }

  function visibleRange(track, list) {
    var tr = rectOf(track)
    var first = -1
    var last = -1
    var kids = list.children
    for (var i = 0; i < kids.length; i++) {
      var r = rectOf(kids[i])
      var overlap = Math.min(r.right, tr.right) - Math.max(r.left, tr.left)
      if (overlap > 1) {
        if (first < 0) first = i
        last = i
      }
    }
    return { first: first, last: last }
  }

  function measureWalkState(track, list, n) {
    var tr = rectOf(track)
    var kids = list.children
    var range = visibleRange(track, list)
    var lastRect = rectOf(kids[kids.length - 1])
    var pitch = FRO.measureCardPitch(track)
    var blankPx = Math.max(0, tr.right - lastRect.right - INSET)
    var empty = Math.floor((tr.right - lastRect.right - INSET + GAP + 1) / pitch)
    if (empty < 0) empty = 0
    var m = {
      clientWidth: track.clientWidth,
      scrollWidth: track.scrollWidth,
      scrollLeft: track.scrollLeft
    }
    return {
      scrollLeft: track.scrollLeft,
      scrollWidth: track.scrollWidth,
      clientWidth: track.clientWidth,
      firstVisible: range.first,
      lastVisible: range.last,
      emptySlots: empty,
      blankPx: Math.round(blankPx * 100) / 100,
      forwardEnabled: FRO.canScrollForward(m)
    }
  }

  // Mimics observeCardVisibility: a placeholder whose rect intersects the
  // track's CLIPPED visible rect becomes a visible card (an
  // IntersectionObserver clips the target by overflow ancestors; its 500px
  // root margin applies to the viewport only, so it does not widen the track).
  async function revealIntersecting(track, list, v) {
    for (var pass = 0; pass < 4; pass++) {
      var tr = rectOf(track)
      var kids = Array.prototype.slice.call(list.children)
      var swapped = 0
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i]
        if (!k.__placeholder) continue
        var r = rectOf(k)
        if (r.right > tr.left && r.left < tr.right) {
          var vis = visibleCard(i, v)
          list.replaceChild(vis, k)
          swapped++
        }
      }
      if (!swapped) break
      await settleImages(list)
    }
  }

  // Art is preloaded once (preloadArt), so a card's <img> with the same data
  // URI is complete at once from the memory cache. Poll with setTimeout only;
  // virtual time does not wait on image decode, so never block on decode().
  async function settleImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'))
    for (var spin = 0; spin < 200; spin++) {
      if (imgs.every(function (im) { return im.complete && im.naturalWidth > 0 })) break
      await tick()
    }
    await tick()
  }

  function preloadArt() {
    var keys = Object.keys(CFG.art)
    return Promise.all(
      keys.map(function (k) {
        return new Promise(function (resolve) {
          var im = new Image()
          im.onload = im.onerror = function () { resolve() }
          im.src = CFG.art[k]
        })
      })
    )
  }

  async function runVariant(v) {
    stage.innerHTML = ''
    var listing = el('div', 'listing', stage)
    listing.style.width = v.contentWidth + 32 + 'px'
    var strip = el('div', 'focusRowStrip', listing)
    var head = el('div', 'library-section-header', strip)
    var h3 = el('h3', 'libraryHeader', head)
    h3.textContent = 'All games'
    var viewport = el('div', 'focusRowStrip__viewport', strip)
    var track = el('div', 'focusRowTrack', viewport)
    track.style.scrollBehavior = 'auto'
    var list = el('div', 'gameList', track)
    for (var i = 0; i < v.n; i++) {
      list.appendChild(v.cardState === 'visible' ? visibleCard(i, v) : placeholder(i))
    }
    if (v.cardState === 'visible') await settleImages(list)
    await tick()

    // The layout effect's first sync, once, as FocusRowStrip does.
    var sync = FRO.createStripCardWidthSync()
    sync(track)
    await tick()
    if (v.cardState === 'lazy') {
      await revealIntersecting(track, list, v)
    }
    await tick()

    var trackW = rectOf(track).width
    var derived = FRO.gridColumnWidth(trackW - 2 * INSET)
    var perPage = FRO.gridColumnCount(trackW - 2 * INSET)
    var first = rectOf(list.firstElementChild)
    var tr0 = rectOf(track)
    var expected = v.n * derived + (v.n - 1) * GAP + 2 * INSET
    var out = {
      n: v.n,
      contentWidth: v.contentWidth,
      cardState: v.cardState,
      artSize: v.artSize,
      title: v.title,
      perPage: perPage,
      cardWidth: Math.round(first.width * 1000) / 1000,
      derivedWidth: Math.round(derived * 1000) / 1000,
      listWidth: Math.round(rectOf(list).width * 1000) / 1000,
      scrollWidth: track.scrollWidth,
      clientWidth: track.clientWidth,
      expectedScrollWidth: Math.round(expected * 1000) / 1000,
      firstCardInset: Math.round((first.left - tr0.left) * 1000) / 1000,
      lastCardInset: null,
      walk: []
    }
    out.walk.push(measureWalkState(track, list, v.n))

    for (var click = 0; click < 30; click++) {
      var m = {
        clientWidth: track.clientWidth,
        scrollWidth: track.scrollWidth,
        scrollLeft: track.scrollLeft
      }
      if (!FRO.canScrollForward(m)) break
      track.scrollLeft += FRO.pageScrollDelta(m, FRO.measureCardPitch(track))
      await tick()
      if (v.cardState === 'lazy') await revealIntersecting(track, list, v)
      await tick()
      out.walk.push(measureWalkState(track, list, v.n))
    }

    // End of travel: the last card's inset from the track's right edge.
    track.scrollLeft = track.scrollWidth
    await tick()
    if (v.cardState === 'lazy') await revealIntersecting(track, list, v)
    var trEnd = rectOf(track)
    var lastKid = list.lastElementChild
    out.lastCardInset = Math.round((trEnd.right - rectOf(lastKid).right) * 1000) / 1000
    out.endScrollLeft = track.scrollLeft
    out.endScrollMax = track.scrollWidth - track.clientWidth
    return out
  }

  async function main() {
    var results = []
    try {
      await preloadArt()
      for (var i = 0; i < CFG.variants.length; i++) {
        results.push(await runVariant(CFG.variants[i]))
        document.getElementById('out').setAttribute('data-done', String(i + 1))
      }
    } catch (e) {
      results.push({ error: String(e && e.stack ? e.stack : e) })
    }
    window.__results = results
    window.__resultsJSON = JSON.stringify(results)
    var pre = document.getElementById('out')
    pre.textContent = window.__resultsJSON
  }

  window.addEventListener('error', function (e) {
    document.getElementById('out').setAttribute('data-error', String(e.message))
  })
  window.addEventListener('load', function () {
    setTimeout(main, 0)
  })
})()
