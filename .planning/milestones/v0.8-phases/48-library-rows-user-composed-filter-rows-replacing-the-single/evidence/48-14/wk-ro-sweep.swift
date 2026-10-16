// G-48-11a: load a --ro harness page in a WKWebView window and drive UAT item
// 11's resize sweep, then print JSON.stringify(window.__ro).
//   wk-ro-sweep <page.html> [timeoutSeconds]
// Sweep (item 11): content width 1280 -> 600 -> 1280 in 40px steps, then content
// height 800 -> 400 -> 800 in 25px steps, one step every 0.15s, then a 1s settle.
//
// Non-activating: an accessory app, the window is ordered front WITHOUT
// activation, so the operator's focus is not taken. Isolation:
// WKWebsiteDataStore.nonPersistent(). The page loads only the file it is given.
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("usage: wk-ro-sweep <page.html> [timeoutSeconds]\n".data(using: .utf8)!)
  exit(2)
}
let pageURL = URL(fileURLWithPath: args[1])
let timeout: Double = args.count > 2 ? (Double(args[2]) ?? 120) : 120

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let config = WKWebViewConfiguration()
config.websiteDataStore = WKWebsiteDataStore.nonPersistent()
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800), configuration: config)

let window = NSWindow(
  contentRect: NSRect(x: 40, y: 80, width: 1280, height: 800),
  styleMask: [.titled],
  backing: .buffered,
  defer: false
)
window.contentView = web
window.orderFrontRegardless()  // no activation

web.loadFileURL(pageURL, allowingReadAccessTo: pageURL.deletingLastPathComponent())

// The sweep as a list of (width, height) content sizes.
var steps: [(CGFloat, CGFloat)] = []
var w: CGFloat = 1280
while w > 600 { w -= 40; steps.append((max(w, 600), 800)) }
while w < 1280 { w += 40; steps.append((min(w, 1280), 800)) }
var h: CGFloat = 800
while h > 400 { h -= 25; steps.append((1280, max(h, 400))) }
while h < 800 { h += 25; steps.append((1280, min(h, 800))) }

let started = Date()
var sweepStarted: Date? = nil
var stepIndex = 0
var finished = false

func finish() {
  web.evaluateJavaScript("JSON.stringify(window.__ro || null)") { value, _ in
    if let s = value as? String {
      print(s)
      exit(0)
    }
    FileHandle.standardError.write("wk-ro-sweep: window.__ro unreadable\n".data(using: .utf8)!)
    exit(4)
  }
}

Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
  if Date().timeIntervalSince(started) > timeout {
    FileHandle.standardError.write("wk-ro-sweep: timed out\n".data(using: .utf8)!)
    exit(3)
  }
  if finished { return }
  if sweepStarted == nil {
    // wait for the page to be ready, then 1s of load settle
    if Date().timeIntervalSince(started) < 1.0 { return }
    web.evaluateJavaScript("window.__ro && window.__ro.ready === true") { value, _ in
      if (value as? Bool) == true && sweepStarted == nil { sweepStarted = Date() }
    }
    return
  }
  let elapsed = Date().timeIntervalSince(sweepStarted!)
  let due = Int(elapsed / 0.15)
  while stepIndex < steps.count && stepIndex < due {
    let (cw, ch) = steps[stepIndex]
    window.setContentSize(NSSize(width: cw, height: ch))
    stepIndex += 1
  }
  if stepIndex >= steps.count && elapsed > Double(steps.count) * 0.15 + 1.0 {
    finished = true
    finish()
  }
}
app.run()
