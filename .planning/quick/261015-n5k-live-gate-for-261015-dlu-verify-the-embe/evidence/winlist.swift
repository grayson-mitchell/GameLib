import Cocoa

// Lists on-screen windows whose owner name contains the argv[1] substring (default "gamelib"),
// printing: windowID pid ownerName x y w h title
let needle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1].lowercased() : "gamelib"
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
  print("no window list"); exit(1)
}
for w in list {
  let owner = (w[kCGWindowOwnerName as String] as? String) ?? ""
  if !owner.lowercased().contains(needle) { continue }
  let id = (w[kCGWindowNumber as String] as? Int) ?? -1
  let pid = (w[kCGWindowOwnerPID as String] as? Int) ?? -1
  let b = (w[kCGWindowBounds as String] as? [String: Any]) ?? [:]
  let x = (b["X"] as? Double) ?? 0, y = (b["Y"] as? Double) ?? 0
  let wd = (b["Width"] as? Double) ?? 0, ht = (b["Height"] as? Double) ?? 0
  let title = (w[kCGWindowName as String] as? String) ?? ""
  let layer = (w[kCGWindowLayer as String] as? Int) ?? 0
  print("\(id) \(pid) \(owner) \(Int(x)) \(Int(y)) \(Int(wd)) \(Int(ht)) layer=\(layer) title=\(title)")
}
