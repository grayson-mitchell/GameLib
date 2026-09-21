// Loads the app's Vite-served frontend in a real WKWebView -- the same engine
// GameLib ships -- and evaluates the probe against it. No inspector, no synthetic
// typing, no focus contention.
//
// What this proves: CSS cascade resolution over the app's real stylesheets in
// WebKit. What it does NOT prove: anything about the running app's own webview
// instance, its React tree, or emotion's injected runtime styles.
import Cocoa
import WebKit

let url = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "http://localhost:5173/"
let probePath = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "probe_wk.js"
// 260921-qru: viewport is now a parameter. The height is the whole experiment --
// `max-height: 80%` only binds against a SHORT window, so a hardcoded 800px
// harness would have been structurally blind to the rule under test.
let vpW = CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3]) ?? 1280 : 1280
let vpH = CommandLine.arguments.count > 4 ? Int(CommandLine.arguments[4]) ?? 500 : 500
let settleMs = CommandLine.arguments.count > 5 ? Int(CommandLine.arguments[5]) ?? 3500 : 3500

guard let probeSrc = try? String(contentsOfFile: probePath, encoding: .utf8) else {
    print("FATAL: cannot read probe at \(probePath)")
    exit(1)
}

final class Runner: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let probe: String
    var fired = false

    init(probe: String) {
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        self.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: vpW, height: vpH), configuration: cfg)
        self.probe = probe
        super.init()
        self.webView.navigationDelegate = self
    }

    func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) {
        guard !fired else { return }
        fired = true
        // Give the app's own bundle a moment to import its stylesheets before we
        // add ours; the probe re-checks the sheet count either way.
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(settleMs) / 1000.0) { self.run() }
    }

    func webView(_ w: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("FATAL: navigation failed: \(error.localizedDescription)")
        exit(2)
    }

    func webView(_ w: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("FATAL: provisional navigation failed: \(error.localizedDescription)")
        exit(2)
    }

    func run() {
        webView.callAsyncJavaScript(probe, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value):
                if let s = value as? String {
                    print(s)
                } else {
                    print("FATAL: probe returned non-string: \(String(describing: value))")
                    exit(3)
                }
                exit(0)
            case .failure(let err):
                print("FATAL: probe threw: \(err)")
                exit(4)
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let runner = Runner(probe: probeSrc)
// WKWebView needs to be in a window for layout to run; keep it off-screen so it
// never steals focus from whatever the operator is doing.
let win = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: vpW, height: vpH),
                   styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView?.addSubview(runner.webView)
win.orderBack(nil)

runner.webView.load(URLRequest(url: URL(string: url)!))

// Hard deadline so a hung load cannot wedge the run.
DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
    print("FATAL: timed out after 45s (fired=\(runner.fired))")
    exit(5)
}

app.run()
