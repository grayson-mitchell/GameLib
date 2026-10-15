// Shell-overflow harness probe: load a page in a WKWebView of the given width
// and print window.__resultsJSON. Derived from Phase 48's evidence/48-13/wkprobe.swift
// (non-persistent data store; accessory app; window ordered front without activation
// because layout reads come back zero without one).
//   wkprobe <page.html> <width> <height> [timeoutSeconds]
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 4 else {
  FileHandle.standardError.write("usage: wkprobe <page.html> <width> <height> [timeoutSeconds]\n".data(using: .utf8)!)
  exit(2)
}
let pageURL = URL(fileURLWithPath: args[1])
let width = Double(args[2]) ?? 1280
let height = Double(args[3]) ?? 800
let timeout: Double = args.count > 4 ? (Double(args[4]) ?? 60) : 60

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let config = WKWebViewConfiguration()
config.websiteDataStore = WKWebsiteDataStore.nonPersistent()
let frame = NSRect(x: 0, y: 0, width: width, height: height)
let web = WKWebView(frame: frame, configuration: config)

let w = NSWindow(contentRect: frame, styleMask: [.titled], backing: .buffered, defer: false)
w.contentView = web
w.orderFrontRegardless()

// Read access to "/" so the page's file:// links into the repo's node_modules
// (@fontsource woff2) resolve; the page itself is the only navigation.
web.loadFileURL(pageURL, allowingReadAccessTo: URL(fileURLWithPath: "/"))

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
_ = w
app.run()
