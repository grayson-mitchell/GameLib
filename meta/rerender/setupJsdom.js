// jsdom lacks TextEncoder/TextDecoder, which react-router needs at import.
const { TextEncoder, TextDecoder } = require('util')
Object.assign(globalThis, { TextEncoder, TextDecoder })
// jsdom lacks these browser APIs used by the library grid.
globalThis.IntersectionObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.matchMedia ||= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {}
})
Element.prototype.scrollTo ||= function () {}
Element.prototype.scrollIntoView ||= function () {}
window.scrollTo = () => {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
