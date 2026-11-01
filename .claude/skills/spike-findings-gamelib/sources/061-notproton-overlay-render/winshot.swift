// Spike 061: photograph the game's own window (044/016 convention: pixels, not API returns).
//   swift winshot.swift <owner-substring> <out.png>
import CoreGraphics
import Foundation

let args = CommandLine.arguments
let needle = args[1].lowercased()
let out = args[2]
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
let hits = list.filter {
    let owner = ($0[kCGWindowOwnerName as String] as? String ?? "").lowercased()
    let layer = $0[kCGWindowLayer as String] as? Int ?? -1
    let b = $0[kCGWindowBounds as String] as? [String: Double] ?? [:]
    return owner.contains(needle) && layer == 0 && (b["Width"] ?? 0) > 200 && (b["Height"] ?? 0) > 200
}
for w in list {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    if owner.lowercased().contains(needle) || owner.lowercased().contains("overlay") {
        print("window id=\(w[kCGWindowNumber as String]!) owner=\(owner) pid=\(w[kCGWindowOwnerPID as String]!) layer=\(w[kCGWindowLayer as String]!) bounds=\(w[kCGWindowBounds as String]!) onscreen=\(w[kCGWindowIsOnscreen as String] ?? 0)")
    }
}
func area(_ w: [String: Any]) -> Double {
    let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
    return (b["Width"] ?? 0) * (b["Height"] ?? 0)
}
guard let target = hits.max(by: { area($0) < area($1) }), let id = target[kCGWindowNumber as String] as? Int else {
    print("no window matched \(needle)"); exit(1)
}
let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
p.arguments = ["-x", "-o", "-l\(id)", out]
try! p.run(); p.waitUntilExit()
print("captured window \(id) -> \(out) status=\(p.terminationStatus)")
