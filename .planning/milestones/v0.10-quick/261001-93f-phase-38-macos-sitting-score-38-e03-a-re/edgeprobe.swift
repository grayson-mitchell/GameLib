// edgeprobe.swift -- the pixel/geometry instrument for the Phase 38 branch-(a) macOS sitting
// (38-E03(a): retina scale-factor rounding under fractional/changing slot geometry; 38-E04(a):
// drag-resize latency re-measure with the b4517366e throttle fix in place).
//
// Build: swiftc -O edgeprobe.swift -o edgeprobe   (selfproof.mjs does this into $TMPDIR)
//
// Subcommands: winrect, shot, bgsample, edges, sample, synth, selftest. Each prints exactly one
// JSON object on stdout (JSONL, one line per record, for `sample`), and exits non-zero with a
// JSON {"error": ...} object on failure. See 261001-93f-PLAN.md Task 1 for the full spec this
// file implements.
//
// THIS FILE MEASURES. IT NEVER SCORES. No subcommand below compares a reading to a threshold or
// prints a pass/fail word -- that judgment belongs to the operator and the prediction files,
// never to this instrument (see <verification> in the plan).

import Foundation
import CoreGraphics
import ImageIO
import AppKit
import Darwin

// MARK: - Two-profile declaration (CLAUDE.md two-profile rule, half 2: a NAMED, DELIBERATE
// REAL-PROFILE ARM -- see <two_profile_declaration> in 261001-93f-PLAN.md and T-Q93F-04 in
// <threat_model>). The ONLY child process this instrument ever spawns is `/usr/sbin/screencapture`
// (the CoreGraphics in-process capture fallback, in `cmdShot` and `cmdSample` below). That spawn
// deliberately inherits the operator's REAL environment: no `env` literal is passed to `Process`
// anywhere in this file, and none of the eight containment variables from CLAUDE.md's two-profile
// rule (HOME, USERPROFILE, APPDATA, LOCALAPPDATA, XDG_CONFIG_HOME, XDG_STATE_HOME, XDG_DATA_HOME,
// XDG_CACHE_HOME) are ever assigned. `screencapture` is a system binary that reads no GameLib
// profile, and this instrument never spawns GameLib itself -- the operator launches and owns
// GameLib's lifecycle by hand. Isolating this call would buy nothing and would make the sitting
// structurally blind: there would be no logged-in store page, and possibly no embed at all, to
// measure. Accepted per T-Q93F-04.

// MARK: - JSON / CLI helpers

func printJSON(_ obj: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]),
        let str = String(data: data, encoding: .utf8)
    {
        print(str)
    } else {
        print("{\"error\":\"json-serialization-failed\"}")
    }
}

func fail(_ message: String) -> Never {
    printJSON(["error": message])
    exit(1)
}

func appendJSONLine(_ handle: FileHandle, _ record: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
        let line = String(data: data, encoding: .utf8)
    {
        handle.write((line + "\n").data(using: .utf8)!)
    }
}

// Monotonic clock (mach_absolute_time), converted to milliseconds. NOT wall clock -- a wall-clock
// read can jump on NTP correction or sleep/wake, which would corrupt every cadence/gap measure
// downstream.
let machTimebase: mach_timebase_info_data_t = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return info
}()

func nowMs() -> Double {
    let t = mach_absolute_time()
    let nanos = Double(t) * Double(machTimebase.numer) / Double(machTimebase.denom)
    return nanos / 1_000_000.0
}

func parseArgs(_ args: [String]) -> [String: String] {
    var result: [String: String] = [:]
    var i = 0
    while i < args.count {
        if args[i].hasPrefix("--") {
            let key = String(args[i].dropFirst(2))
            if i + 1 < args.count && !args[i + 1].hasPrefix("--") {
                result[key] = args[i + 1]
                i += 2
            } else {
                result[key] = "true"
                i += 1
            }
        } else {
            i += 1
        }
    }
    return result
}

func parseDoubles(_ s: String) -> [Double] {
    s.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
}

func luma(_ r: Double, _ g: Double, _ b: Double) -> Double {
    0.299 * r + 0.587 * g + 0.114 * b
}

// MARK: - Image helpers

func loadImage(_ path: String) -> CGImage {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
        let src = CGImageSourceCreateWithData(data as CFData, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
    else {
        fail("could not read a PNG at \(path)")
    }
    return img
}

// RGBA8, straight-alpha-ish premultiplied-last buffer. Returns (buffer, width, height).
func rgbaBuffer(_ image: CGImage) -> ([UInt8], Int, Int) {
    let width = image.width
    let height = image.height
    var buffer = [UInt8](repeating: 0, count: width * height * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard
        let ctx = CGContext(
            data: &buffer, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else {
        fail("could not create a bitmap context to read pixels")
    }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return (buffer, width, height)
}

func writePNG(_ image: CGImage, to path: String) {
    guard
        let dest = CGImageDestinationCreateWithURL(
            URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil)
    else {
        fail("could not create a PNG destination at \(path)")
    }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else {
        fail("could not finalize PNG write at \(path)")
    }
}

// MARK: - Window instrument (CGWindowList, NOT AX -- see <established_facts>)

func winArea(_ win: [String: AnyObject]) -> Double {
    guard let boundsDict = win[kCGWindowBounds as String] as? [String: Any] else { return 0 }
    let rect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) ?? .zero
    return Double(rect.width * rect.height)
}

struct WinRectReading {
    let found: Bool
    let windowNumber: Int
    let rect: CGRect
    let layer: Int
    let onscreenFlagPresent: Bool
    let isOnscreen: Bool?
    let noWindowReason: String?
}

// Filters CGWindowListCopyWindowInfo (optionOnScreenOnly, excludeDesktopElements) to the given
// owner pid, and picks the largest layer-0 window -- shared by `winrect` and `sample`.
func readWinRect(pid: Int32) -> WinRectReading {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: AnyObject]]
    else {
        return WinRectReading(
            found: false, windowNumber: -1, rect: .zero, layer: -1, onscreenFlagPresent: false,
            isOnscreen: nil, noWindowReason: "CGWindowListCopyWindowInfo returned nil")
    }
    let candidates = list.filter { win in
        (win[kCGWindowOwnerPID as String] as? Int32) == pid
            && (win[kCGWindowLayer as String] as? Int) == 0
    }
    guard let win = candidates.max(by: { winArea($0) < winArea($1) }) else {
        return WinRectReading(
            found: false, windowNumber: -1, rect: .zero, layer: -1, onscreenFlagPresent: false,
            isOnscreen: nil,
            noWindowReason:
                "no on-screen layer-0 window found for pid \(pid) -- if GameLib's Space is not frontmost this is expected and is the inactive-Space trap, not a real absence"
        )
    }
    let boundsDict = win[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let rect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) ?? .zero
    let windowNumber = win[kCGWindowNumber as String] as? Int ?? -1
    let layer = win[kCGWindowLayer as String] as? Int ?? -1
    let onscreen = win[kCGWindowIsOnscreen as String] as? Bool
    return WinRectReading(
        found: true, windowNumber: windowNumber, rect: rect, layer: layer,
        onscreenFlagPresent: onscreen != nil, isOnscreen: onscreen, noWindowReason: nil)
}

func cmdWinrect(_ opts: [String: String]) {
    guard let pidStr = opts["pid"], let pid = Int32(pidStr) else {
        fail("winrect requires --pid <pid>")
    }
    let reading = readWinRect(pid: pid)
    guard reading.found else {
        fail(reading.noWindowReason ?? "no window found")
    }
    var result: [String: Any] = [
        "windowNumber": reading.windowNumber,
        "bounds": [
            "x": reading.rect.origin.x, "y": reading.rect.origin.y,
            "w": reading.rect.size.width, "h": reading.rect.size.height,
        ],
        "layer": reading.layer,
        "onscreenFlagPresent": reading.onscreenFlagPresent,
    ]
    if let onscreen = reading.isOnscreen {
        // Measured, never substituted: this branch only runs when the flag was actually present.
        result["isOnscreen"] = onscreen
    } else {
        result["isOnscreen"] = NSNull()
        result["warning"] =
            "kCGWindowIsOnscreen absent -- the app's Space may not be active; every geometry reading in this sample is garbage until it is"
    }
    printJSON(result)
}

// MARK: - shot

// `CGWindowListCreateImage` is obsoleted as of macOS 15 SDK (confirmed by a real `swiftc
// -typecheck` failure on this machine's macOS 27 SDK: "Please use ScreenCaptureKit instead").
// ScreenCaptureKit's capture API is async-only (SCScreenshotManager / SCStream) and its own
// content-enumeration step requires Screen Recording permission before it can even be asked to
// capture a rect -- adopting it would roughly double this file's size for a CLI tool whose whole
// job is "one rect, one PNG, synchronously". The system `/usr/sbin/screencapture` binary already
// wraps exactly that permission dance and returns a PNG on stdout-equivalent (a file path), so it
// is the SOLE capture path below. It is the real-profile arm declared at the top of this file:
// note this is a narrower fallback-of-last-resort than originally planned (CoreGraphics-first with
// a spawn fallback) -- the CoreGraphics path is gone entirely, not merely deprioritized, because it
// does not compile at all. If Screen Recording permission is refused, `captureRect` fails loudly
// with the verbatim exit status; nothing here estimates or substitutes a reading.
func captureRect(_ rect: CGRect, to outPath: String) throws -> CGImage {
    let rectArg =
        "\(Int(rect.origin.x)),\(Int(rect.origin.y)),\(Int(rect.width)),\(Int(rect.height))"
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    proc.arguments = ["-x", "-o", "-R", rectArg, outPath]
    try proc.run()
    proc.waitUntilExit()
    guard proc.terminationStatus == 0 else {
        throw NSError(
            domain: "edgeprobe", code: Int(proc.terminationStatus),
            userInfo: [
                NSLocalizedDescriptionKey: "screencapture exited \(proc.terminationStatus)"
            ])
    }
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: outPath)),
        let src = CGImageSourceCreateWithData(data as CFData, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
    else {
        throw NSError(
            domain: "edgeprobe", code: -1,
            userInfo: [
                NSLocalizedDescriptionKey: "screencapture wrote no readable PNG at \(outPath)"
            ])
    }
    return img
}

func cmdShot(_ opts: [String: String]) {
    guard let rectStr = opts["rect"], let outPath = opts["out"] else {
        fail("shot requires --rect x,y,w,h --out <path.png>")
    }
    let vals = parseDoubles(rectStr)
    guard vals.count == 4 else { fail("--rect must be x,y,w,h") }
    let rect = CGRect(x: vals[0], y: vals[1], width: vals[2], height: vals[3])

    let start = nowMs()
    let image: CGImage
    do {
        image = try captureRect(rect, to: outPath)
    } catch {
        fail("capture failed: \(error.localizedDescription)")
    }
    let elapsed = nowMs() - start
    printJSON([
        "backend": "screencapture",
        "width": image.width,
        "height": image.height,
        "elapsed_ms": elapsed,
    ])
}

// MARK: - bgsample

func cmdBgsample(_ opts: [String: String]) {
    guard let pngPath = opts["png"], let atStr = opts["at"], let sizeStr = opts["size"],
        let n = Int(sizeStr)
    else {
        fail("bgsample requires --png <path> --at x,y --size <n>")
    }
    let at = parseDoubles(atStr)
    guard at.count == 2 else { fail("--at must be x,y") }
    let img = loadImage(pngPath)
    let (buf, width, height) = rgbaBuffer(img)
    let x0 = Int(at[0])
    let y0 = Int(at[1])
    var rSum = 0.0
    var gSum = 0.0
    var bSum = 0.0
    var count = 0
    for dy in 0..<max(1, n) {
        for dx in 0..<max(1, n) {
            let x = x0 + dx
            let y = y0 + dy
            guard x >= 0, x < width, y >= 0, y < height else { continue }
            let idx = (y * width + x) * 4
            rSum += Double(buf[idx])
            gSum += Double(buf[idx + 1])
            bSum += Double(buf[idx + 2])
            count += 1
        }
    }
    guard count > 0 else { fail("bgsample patch at (\(x0),\(y0)) size \(n) is entirely out of bounds") }
    printJSON([
        "r": rSum / Double(count), "g": gSum / Double(count), "b": bSum / Double(count),
        "samples": count,
    ])
}

// MARK: - edge location (shared by `edges` and `sample`)

struct EdgeResult {
    let unresolved: Bool
    let edgePx: Int?
    let bgRunPx: Int
    let gradMax: Double
    let samples: Int
}

// Scans columns from the right edge of the image inward, averaged over rows [bandLo, bandHi].
// The first column whose mean colour falls outside `tol` of `bg` is the located edge. See
// <established_facts> / Task 1's spec in the plan for the two unresolved cases this implements:
// bgRunPx == 0 means the very outermost column is already non-background (the embed reaches the
// image border -- no background reference exists in this band, so the true edge could lie outside
// the captured region); reaching the end of the scan with no transition means the whole band is
// background (the embed is nowhere in it).
func locateEdgeFromRight(
    buf: [UInt8], width: Int, height: Int, bandLo: Int, bandHi: Int, bg: [Double], tol: Double
) -> EdgeResult {
    let lo = max(0, bandLo)
    let hi = min(height - 1, bandHi)
    guard lo <= hi, width > 0 else {
        return EdgeResult(unresolved: true, edgePx: nil, bgRunPx: 0, gradMax: 0, samples: 0)
    }
    var lumas: [Double] = []
    lumas.reserveCapacity(width)
    var bgRun = 0
    var transitionIndex: Int? = nil
    for i in 0..<width {
        let x = width - 1 - i
        var rS = 0.0
        var gS = 0.0
        var bS = 0.0
        for y in lo...hi {
            let idx = (y * width + x) * 4
            rS += Double(buf[idx])
            gS += Double(buf[idx + 1])
            bS += Double(buf[idx + 2])
        }
        let cnt = Double(hi - lo + 1)
        let mean = (rS / cnt, gS / cnt, bS / cnt)
        lumas.append(luma(mean.0, mean.1, mean.2))
        let isBg = (abs(mean.0 - bg[0]) + abs(mean.1 - bg[1]) + abs(mean.2 - bg[2])) <= tol
        if isBg {
            if transitionIndex == nil { bgRun += 1 }
        } else if transitionIndex == nil {
            transitionIndex = i
        }
    }
    var gradMax = 0.0
    if let ti = transitionIndex {
        let gLo = max(1, ti - 5)
        let gHi = min(lumas.count - 1, ti + 5)
        if gLo <= gHi {
            for i in gLo...gHi { gradMax = max(gradMax, abs(lumas[i] - lumas[i - 1])) }
        }
    }
    if bgRun == 0 {
        return EdgeResult(unresolved: true, edgePx: nil, bgRunPx: 0, gradMax: 0, samples: width)
    }
    guard transitionIndex != nil else {
        return EdgeResult(unresolved: true, edgePx: nil, bgRunPx: bgRun, gradMax: 0, samples: width)
    }
    // edge_px convention: the x-coordinate of the first BACKGROUND column counted from the left
    // (an exclusive upper bound on the foreground run), not the coordinate of the outermost
    // foreground pixel. This equals width - bgRunPx directly, and it is the convention `synth`'s
    // truth.json uses (`isFg = x < embedEdgePx`) -- selftest caught a systematic off-by-one here
    // when the two were misaligned (foreground-pixel coordinate vs. exclusive-boundary coordinate).
    return EdgeResult(
        unresolved: false, edgePx: width - bgRun, bgRunPx: bgRun, gradMax: gradMax, samples: width)
}

// Mirror of the above scanning rows from the bottom inward, averaged over columns [bandLo,
// bandHi]. Used by `edges --from bottom`; `sample` always scans from the right (the sitting only
// needs the widen-direction horizontal edge -- see the Limits section this instrument's own
// self-proof records).
func locateEdgeFromBottom(
    buf: [UInt8], width: Int, height: Int, bandLo: Int, bandHi: Int, bg: [Double], tol: Double
) -> EdgeResult {
    let lo = max(0, bandLo)
    let hi = min(width - 1, bandHi)
    guard lo <= hi, height > 0 else {
        return EdgeResult(unresolved: true, edgePx: nil, bgRunPx: 0, gradMax: 0, samples: 0)
    }
    var lumas: [Double] = []
    lumas.reserveCapacity(height)
    var bgRun = 0
    var transitionIndex: Int? = nil
    for i in 0..<height {
        let y = height - 1 - i
        var rS = 0.0
        var gS = 0.0
        var bS = 0.0
        for x in lo...hi {
            let idx = (y * width + x) * 4
            rS += Double(buf[idx])
            gS += Double(buf[idx + 1])
            bS += Double(buf[idx + 2])
        }
        let cnt = Double(hi - lo + 1)
        let mean = (rS / cnt, gS / cnt, bS / cnt)
        lumas.append(luma(mean.0, mean.1, mean.2))
        let isBg = (abs(mean.0 - bg[0]) + abs(mean.1 - bg[1]) + abs(mean.2 - bg[2])) <= tol
        if isBg {
            if transitionIndex == nil { bgRun += 1 }
        } else if transitionIndex == nil {
            transitionIndex = i
        }
    }
    var gradMax = 0.0
    if let ti = transitionIndex {
        let gLo = max(1, ti - 5)
        let gHi = min(lumas.count - 1, ti + 5)
        if gLo <= gHi {
            for i in gLo...gHi { gradMax = max(gradMax, abs(lumas[i] - lumas[i - 1])) }
        }
    }
    if bgRun == 0 {
        return EdgeResult(unresolved: true, edgePx: nil, bgRunPx: 0, gradMax: 0, samples: height)
    }
    guard transitionIndex != nil else {
        return EdgeResult(
            unresolved: true, edgePx: nil, bgRunPx: bgRun, gradMax: 0, samples: height)
    }
    // Same exclusive-boundary convention as locateEdgeFromRight above: edge_px = height - bgRunPx.
    return EdgeResult(
        unresolved: false, edgePx: height - bgRun, bgRunPx: bgRun, gradMax: gradMax, samples: height)
}

func cmdEdges(_ opts: [String: String]) {
    guard let pngPath = opts["png"], let bandStr = opts["band"], let bgStr = opts["bg"],
        let tolStr = opts["tol"], let tol = Double(tolStr), let from = opts["from"]
    else {
        fail("edges requires --png <path> --band lo,hi --bg r,g,b --tol <n> --from right|bottom")
    }
    guard from == "right" || from == "bottom" else { fail("--from must be right or bottom") }
    let bandVals = parseDoubles(bandStr)
    guard bandVals.count == 2 else { fail("--band must be lo,hi") }
    let bg = parseDoubles(bgStr)
    guard bg.count == 3 else { fail("--bg must be r,g,b") }

    let img = loadImage(pngPath)
    let (buf, width, height) = rgbaBuffer(img)
    let result =
        from == "right"
        ? locateEdgeFromRight(
            buf: buf, width: width, height: height, bandLo: Int(bandVals[0]),
            bandHi: Int(bandVals[1]), bg: bg, tol: tol)
        : locateEdgeFromBottom(
            buf: buf, width: width, height: height, bandLo: Int(bandVals[0]),
            bandHi: Int(bandVals[1]), bg: bg, tol: tol)

    var out: [String: Any] = [
        "bg_run_px": result.bgRunPx,
        "grad_max": result.gradMax,
        "samples": result.samples,
        "unresolved": result.unresolved,
    ]
    if result.unresolved {
        out["reason"] =
            result.bgRunPx == 0
            ? "entire band is non-background -- no background reference near the \(from) edge, the edge lies outside the captured band"
            : "entire band is background -- the embed is nowhere in this band"
    } else {
        out["edge_px"] = result.edgePx!
    }
    printJSON(out)
}

// MARK: - sample (the latency sampler)

func cmdSample(_ opts: [String: String]) {
    guard let rectStr = opts["rect"], let bandStr = opts["band"], let bgStr = opts["bg"],
        let tolStr = opts["tol"], let tol = Double(tolStr), let pidStr = opts["pid"],
        let pid = Int32(pidStr), let durStr = opts["duration-s"], let durationS = Double(durStr),
        let outPath = opts["out"]
    else {
        fail(
            "sample requires --rect x,y,w,h --band lo,hi --bg r,g,b --tol n --pid <pid> --duration-s <n> --out <jsonl>"
        )
    }
    let rectVals = parseDoubles(rectStr)
    guard rectVals.count == 4 else { fail("--rect must be x,y,w,h") }
    let rect = CGRect(x: rectVals[0], y: rectVals[1], width: rectVals[2], height: rectVals[3])
    let bandVals = parseDoubles(bandStr)
    guard bandVals.count == 2 else { fail("--band must be lo,hi") }
    let bg = parseDoubles(bgStr)
    guard bg.count == 3 else { fail("--bg must be r,g,b") }

    FileManager.default.createFile(atPath: outPath, contents: nil)
    guard let handle = FileHandle(forWritingAtPath: outPath) else {
        fail("could not open \(outPath) for writing")
    }

    let startMs = nowMs()
    let deadline = startMs + durationS * 1000.0
    var cadences: [Double] = []
    var lastStart: Double? = nil
    var unresolvedCount = 0
    var n = 0
    var backendSeen = "unknown"

    while nowMs() < deadline {
        let sampleStart = nowMs()
        if let last = lastStart { cadences.append(sampleStart - last) }
        lastStart = sampleStart

        // See `captureRect` above: CGWindowListCreateImage does not compile on this SDK, so
        // `screencapture` is the sole backend -- this loop's cadence IS the cost of spawning it
        // once per sample, and that cost is exactly what Arm 4 of the self-proof exists to
        // measure and record, not hide.
        let capStart = nowMs()
        let backend = "screencapture"
        let tp = NSTemporaryDirectory() + "edgeprobe-sample-\(UUID().uuidString).png"
        var image: CGImage? = nil
        var captureError: String? = nil
        do {
            image = try captureRect(rect, to: tp)
        } catch {
            captureError = error.localizedDescription
        }
        try? FileManager.default.removeItem(atPath: tp)
        let capMs = nowMs() - capStart
        backendSeen = backend

        var record: [String: Any] = ["t_ms": sampleStart, "cap_ms": capMs]

        guard let img = image else {
            record["unresolved"] = true
            record["reason"] = "capture failed: \(captureError ?? "unknown error")"
            record["win"] = NSNull()
            record["edge_px"] = NSNull()
            record["gap_px"] = NSNull()
            unresolvedCount += 1
            appendJSONLine(handle, record)
            n += 1
            continue
        }

        let (buf, width, height) = rgbaBuffer(img)
        let edge = locateEdgeFromRight(
            buf: buf, width: width, height: height, bandLo: Int(bandVals[0]),
            bandHi: Int(bandVals[1]), bg: bg, tol: tol)

        var winInfo: Any = NSNull()
        var gapPx: Any = NSNull()
        let reading = readWinRect(pid: pid)
        if reading.found {
            winInfo =
                [
                    "x": reading.rect.origin.x, "y": reading.rect.origin.y,
                    "w": reading.rect.size.width, "h": reading.rect.size.height,
                    "onscreenFlagPresent": reading.onscreenFlagPresent,
                    "isOnscreen": (reading.isOnscreen as Bool?).map { $0 as Any } ?? NSNull(),
                ] as [String: Any]
            if let edgePx = edge.edgePx, !edge.unresolved, rect.width > 0 {
                // gap_px: the distance (in physical px, within this capture's local coordinate
                // frame) between the window's current right edge and the embed's located right
                // edge. At rest this should sit near a small constant baseline; during a widening
                // drag it grows if the embed has not yet caught up -- this is the signal Arm 2 of
                // the self-proof (see selfproof.mjs) trains on against a KNOWN injected lag.
                let scale = Double(width) / Double(rect.width)
                let winRightLogical = reading.rect.origin.x + reading.rect.size.width
                let localPhysicalX = (winRightLogical - rect.origin.x) * scale
                gapPx = localPhysicalX - Double(edgePx)
            }
        } else {
            winInfo = ["error": reading.noWindowReason ?? "no window"] as [String: Any]
        }

        record["win"] = winInfo
        record["edge_px"] = edge.unresolved ? NSNull() : edge.edgePx!
        record["gap_px"] = gapPx
        record["unresolved"] = edge.unresolved
        if edge.unresolved { unresolvedCount += 1 }

        appendJSONLine(handle, record)
        n += 1
    }
    handle.closeFile()

    let sorted = cadences.sorted()
    func pct(_ p: Double) -> Double {
        guard !sorted.isEmpty else { return 0 }
        let idx = min(sorted.count - 1, Int(Double(sorted.count - 1) * p))
        return sorted[idx]
    }
    printJSON([
        "samples": n,
        "duration_ms": (lastStart ?? startMs) - startMs,
        "cadence_ms": ["median": pct(0.5), "p90": pct(0.9), "max": sorted.last ?? 0],
        "unresolved_count": unresolvedCount,
        "backend": backendSeen,
    ])
}

// MARK: - synth (positive-control generator)

func renderSynthFrame(width: Int, height: Int, bg: [Double], fg: [Double], embedEdgePx: Int)
    -> CGImage
{
    var buffer = [UInt8](repeating: 0, count: width * height * 4)
    for y in 0..<height {
        for x in 0..<width {
            let idx = (y * width + x) * 4
            let isFg = x < embedEdgePx
            let c = isFg ? fg : bg
            buffer[idx] = UInt8(clamping: Int(c[0]))
            buffer[idx + 1] = UInt8(clamping: Int(c[1]))
            buffer[idx + 2] = UInt8(clamping: Int(c[2]))
            buffer[idx + 3] = 255
        }
    }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard
        let ctx = CGContext(
            data: &buffer, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
        let image = ctx.makeImage()
    else {
        fail("could not render a synthetic frame")
    }
    return image
}

@discardableResult
func synthGenerate(
    outDir: String, frames: Int, edge0: Int, step: Int, lag: Int, bg: [Double], fg: [Double],
    widthOverride: Int? = nil
) -> (width: Int, height: Int, truthPath: String) {
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
    // Default sizing always reserves a >=40px background margin past the last frame's edge, so
    // an "entire image is foreground" frame is unreachable through the default path -- by design,
    // every ordinary synth call leaves room for the locator to see background on at least one
    // side. selfproof.mjs's Arm 3 (unresolvable-sample reporting) needs exactly that unreachable
    // case, so `--width` lets a caller override the canvas width explicitly (e.g. edge0 == width
    // makes the whole canvas foreground). Omitted, behavior is unchanged from before this override
    // existed.
    let width = widthOverride ?? max(200, edge0 + step * max(0, frames) + 40)
    let height = 60
    var truth: [[String: Any]] = []
    for i in 0..<frames {
        let windowEdge = edge0 + step * i
        let embedEdge = max(edge0, windowEdge - lag)
        let image = renderSynthFrame(width: width, height: height, bg: bg, fg: fg, embedEdgePx: embedEdge)
        let framePath = outDir + "/frame_\(String(format: "%04d", i)).png"
        writePNG(image, to: framePath)
        truth.append([
            "frame": i,
            "embed_edge_px": embedEdge,
            "window_edge_px": windowEdge,
            "path": framePath,
        ])
    }
    let truthPath = outDir + "/truth.json"
    if let data = try? JSONSerialization.data(
        withJSONObject: ["width": width, "height": height, "frames": truth],
        options: [.prettyPrinted, .sortedKeys])
    {
        try? data.write(to: URL(fileURLWithPath: truthPath))
    }
    return (width, height, truthPath)
}

func cmdSynth(_ opts: [String: String]) {
    guard let outDir = opts["out"], let framesStr = opts["frames"], let frames = Int(framesStr),
        let edge0Str = opts["edge0"], let edge0 = Int(edge0Str),
        let stepStr = opts["step"], let step = Int(stepStr),
        let lagStr = opts["lag"], let lag = Int(lagStr),
        let bgStr = opts["bg"], let fgStr = opts["fg"]
    else {
        fail(
            "synth requires --out <dir> --frames <n> --edge0 <px> --step <px> --lag <px> --bg r,g,b --fg r,g,b [--width <px>]"
        )
    }
    let bg = parseDoubles(bgStr)
    let fg = parseDoubles(fgStr)
    guard bg.count == 3, fg.count == 3 else { fail("--bg/--fg must be r,g,b") }
    let widthOverride = opts["width"].flatMap { Int($0) }
    let (width, height, truthPath) = synthGenerate(
        outDir: outDir, frames: frames, edge0: edge0, step: step, lag: lag, bg: bg, fg: fg,
        widthOverride: widthOverride)
    printJSON([
        "out": outDir, "frames": frames, "width": width, "height": height, "truth": truthPath,
    ])
}

// MARK: - selftest (Arm 1's core check, self-contained: no reliance on an external harness)

func cmdSelftest(_ opts: [String: String]) {
    struct Config {
        let name: String
        let edge0: Int
        let step: Int
        let frames: Int
        let bg: [Double]
        let fg: [Double]
        let tol: Double
    }
    // Coverage deliberately matches Task 2 Arm 1's requirement: a default case, an odd column, a
    // column adjacent to the image border, and a low-contrast fg/bg pair only slightly more than
    // tolerance apart.
    let configs: [Config] = [
        Config(name: "default", edge0: 40, step: 5, frames: 6, bg: [20, 20, 20], fg: [230, 230, 230], tol: 10),
        Config(name: "odd-column", edge0: 41, step: 3, frames: 6, bg: [10, 10, 10], fg: [245, 245, 245], tol: 10),
        Config(name: "border-adjacent", edge0: 1, step: 1, frames: 4, bg: [0, 0, 0], fg: [255, 255, 255], tol: 10),
        Config(name: "near-tolerance", edge0: 50, step: 7, frames: 5, bg: [100, 100, 100], fg: [105, 105, 105], tol: 10),
    ]

    let tmpBase = NSTemporaryDirectory() + "edgeprobe-selftest-\(UUID().uuidString)"
    try? FileManager.default.createDirectory(atPath: tmpBase, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(atPath: tmpBase) }

    var totalFrames = 0
    var worstError = 0
    var mismatches: [[String: Any]] = []
    var perConfig: [[String: Any]] = []

    for cfg in configs {
        let outDir = tmpBase + "/" + cfg.name
        let (_, height, _) = synthGenerate(
            outDir: outDir, frames: cfg.frames, edge0: cfg.edge0, step: cfg.step, lag: 0,
            bg: cfg.bg, fg: cfg.fg)
        var configMismatches = 0
        for i in 0..<cfg.frames {
            let framePath = outDir + "/frame_\(String(format: "%04d", i)).png"
            let img = loadImage(framePath)
            let (buf, w, h) = rgbaBuffer(img)
            let bandLo = height / 4
            let bandHi = height - height / 4
            let result = locateEdgeFromRight(
                buf: buf, width: w, height: h, bandLo: bandLo, bandHi: bandHi, bg: cfg.bg,
                tol: cfg.tol)
            let truthEdge = cfg.edge0 + cfg.step * i
            totalFrames += 1
            if result.unresolved || result.edgePx != truthEdge {
                configMismatches += 1
                let err = result.unresolved ? -1 : abs((result.edgePx ?? -1) - truthEdge)
                worstError = max(worstError, err)
                mismatches.append([
                    "config": cfg.name, "frame": i, "truth": truthEdge,
                    "located": result.unresolved ? "unresolved" : "\(result.edgePx!)",
                ])
            }
        }
        perConfig.append(["name": cfg.name, "frames": cfg.frames, "mismatches": configMismatches])
    }

    if mismatches.isEmpty {
        printJSON([
            "pass": true, "frames": totalFrames, "worst_error_px": 0, "configs": perConfig,
        ])
    } else {
        printJSON([
            "pass": false, "frames": totalFrames, "worst_error_px": worstError,
            "mismatches": mismatches, "configs": perConfig,
        ])
        exit(1)
    }
}

// MARK: - dispatch

let args = CommandLine.arguments
guard args.count > 1 else {
    fail("usage: edgeprobe <winrect|shot|bgsample|edges|sample|synth|selftest> [options]")
}
let command = args[1]
let opts = parseArgs(Array(args.dropFirst(2)))

switch command {
case "winrect": cmdWinrect(opts)
case "shot": cmdShot(opts)
case "bgsample": cmdBgsample(opts)
case "edges": cmdEdges(opts)
case "sample": cmdSample(opts)
case "synth": cmdSynth(opts)
case "selftest": cmdSelftest(opts)
default: fail("unknown command: \(command)")
}
