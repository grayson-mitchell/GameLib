// slotprobe.js -- pasted by hand into the GameLib devtools console (WebView/index.tsx's own
// window, NOT the embedded store page) during a RUN-SHEET step. Records the DOM-side view of the
// `.WebView__embedSlot` element's geometry over time, for correlation against edgeprobe's
// screen-pixel readings (see RUN-SHEET.md and evidence/instrument-selfproof.md's Limits section
// for the two-clock caveat this correlation carries: performance.now() here vs. edgeprobe's
// mach_absolute_time).
//
// This is glue, not the instrument: it never computes a verdict, only records raw DOM
// measurements with a timestamp. `analyze.mjs` is the only reducer, and it emits no verdict either.
//
// Usage (paste the whole IIFE below into the console once; then call the exposed methods):
//   __glSlotProbe.start()          -- begin recording on a requestAnimationFrame loop
//   __glSlotProbe.mark("label")    -- record a labeled instant (e.g. "drag-start", "drag-end")
//   __glSlotProbe.stop()           -- stop the rAF loop
//   __glSlotProbe.dump()           -- returns a JSON STRING; copy it out (devtools "Copy" on the
//                                      returned string, or right-click > Store as global variable)
//                                      into the evidence directory by hand

(function () {
  "use strict";

  const SELECTOR = ".WebView__embedSlot";

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function findSlot() {
    const el = document.querySelector(SELECTOR);
    if (!el) {
      // Throw loudly -- per the plan, a null match must never be silently swallowed into an
      // empty/zeroed record. A silent null here is the one failure that would make the renderer
      // arm look green while measuring air. An operator running this against the wrong window
      // (e.g. the embedded store page's own devtools, rather than GameLib's) needs to see this
      // immediately.
      throw new Error(
        `slotprobe: no element matched "${SELECTOR}" -- is this the GameLib window's devtools, not the embedded store page's?`
      );
    }
    return el;
  }

  // Throw once at load time too, so a mistaken paste fails immediately rather than only on the
  // first start() call.
  findSlot();

  const state = {
    recording: false,
    rafHandle: null,
    records: [],
    marks: [],
  };

  function tick() {
    if (!state.recording) return;
    const el = findSlot();
    // getBoundingClientRect() is the single geometry oracle (D-18). Values are kept as FLOATS to
    // three decimals -- rounding to whole px here would destroy the very fractionality 38-E03
    // measures.
    const rect = el.getBoundingClientRect();
    state.records.push({
      t_ms: performance.now(),
      x: round3(rect.x),
      y: round3(rect.y),
      width: round3(rect.width),
      height: round3(rect.height),
      right: round3(rect.right),
      bottom: round3(rect.bottom),
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    });
    state.rafHandle = requestAnimationFrame(tick);
  }

  function median(arr) {
    if (arr.length === 0) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  window.__glSlotProbe = {
    start() {
      if (state.recording) {
        console.warn("slotprobe: already recording");
        return;
      }
      state.recording = true;
      state.rafHandle = requestAnimationFrame(tick);
      console.log("slotprobe: recording started");
    },
    stop() {
      state.recording = false;
      if (state.rafHandle !== null) {
        cancelAnimationFrame(state.rafHandle);
        state.rafHandle = null;
      }
      console.log(
        `slotprobe: recording stopped, ${state.records.length} records, ${state.marks.length} marks`
      );
    },
    mark(label) {
      if (typeof label !== "string" || label.length === 0) {
        throw new Error("slotprobe: mark(label) requires a non-empty string label");
      }
      state.marks.push({ t_ms: performance.now(), label });
      console.log(`slotprobe: mark "${label}" at ${performance.now().toFixed(2)}ms`);
    },
    // Returns a JSON STRING (not an object) for the operator to copy out of devtools verbatim.
    // Reports the raw records/marks PLUS derived rAF-interval stats and the count of frames whose
    // rect did not change from the previous frame -- glue-level reduction only (interval/unchanged
    // counts, no verdict), matching analyze.mjs's own no-threshold contract.
    dump() {
      const intervals = [];
      for (let i = 1; i < state.records.length; i++) {
        intervals.push(state.records[i].t_ms - state.records[i - 1].t_ms);
      }
      let unchangedCount = 0;
      for (let i = 1; i < state.records.length; i++) {
        const prev = state.records[i - 1];
        const cur = state.records[i];
        if (
          prev.x === cur.x &&
          prev.y === cur.y &&
          prev.width === cur.width &&
          prev.height === cur.height
        ) {
          unchangedCount++;
        }
      }
      const payload = {
        selector: SELECTOR,
        frames: state.records.length,
        rafIntervalMs: {
          median: intervals.length ? round3(median(intervals)) : null,
          max: intervals.length ? round3(Math.max(...intervals)) : null,
        },
        unchangedRectFrames: unchangedCount,
        records: state.records,
        marks: state.marks,
      };
      return JSON.stringify(payload);
    },
    clear() {
      state.records = [];
      state.marks = [];
      console.log("slotprobe: cleared");
    },
  };

  console.log(
    "slotprobe: loaded -- call __glSlotProbe.start(), .mark(label), .stop(), .dump(), .clear()"
  );
})();
