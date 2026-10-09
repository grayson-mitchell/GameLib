// G-48-11b: load a harness page in a WKWebView and print window.__resultsJSON.
//   wkprobe <page.html> [timeoutSeconds]
// macOS only (AppKit + WebKit). NOT compiled or run on the Windows host that
// wrote it: swiftc does not exist there. Owed to a Mac rerun (see SUMMARY).
//
// Isolation: WKWebsiteDataStore.nonPersistent(). A fake HOME does not isolate
// WebKit storage; the non-persistent store does. The page loads only the file
// it is given (file:// and data: content).
//
// The view gets an explicit frame. A window is created only when WK_WINDOW=1
// (layout reads came back zero without one): an accessory app, window ordered
// front WITHOUT activation, so it takes no focus from the operator.
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("usage: wkprobe <page.html> [timeoutSeconds]\n".data(using: .utf8)!)
  exit(2)
}
let pageURL = URL(fileURLWithPath: args[1])
let timeout: Double = args.count > 2 ? (Double(args[2]) ?? 120) : 120

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let config = WKWebViewConfiguration()
config.websiteDataStore = WKWebsiteDataStore.nonPersistent()
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1600, height: 1000), configuration: config)

var window: NSWindow? = nil
if ProcessInfo.processInfo.environment["WK_WINDOW"] == "1" {
  let w = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 1600, height: 1000),
    styleMask: [.titled],
    backing: .buffered,
    defer: false
  )
  w.contentView = web
  w.orderFrontRegardless()  // no activation
  window = w
}

web.loadFileURL(pageURL, allowingReadAccessTo: pageURL.deletingLastPathComponent())

let started = Date()
Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in
  web.evaluateJavaScript("window.__resultsJSON || ''") { value, _ in
    if let s = value as? String, !s.isEmpty {
      print(s)
      exit(0)
    }
  }
  if Date().timeIntervalSince(started) > timeout {
    FileHandle.standardError.write("wkprobe: timed out waiting for window.__resultsJSON\n".data(using: .utf8)!)
    exit(3)
  }
}
_ = window  // keep the optional window alive for the run loop
app.run()
