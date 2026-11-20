import Cocoa
// scroll.swift <x> <y> <lines>  -- moves pointer to (x,y) and posts a vertical scroll of <lines> (negative = down).
let a = CommandLine.arguments
guard a.count >= 4, let x = Double(a[1]), let y = Double(a[2]), let n = Int32(a[3]) else { print("usage"); exit(2) }
let p = CGPoint(x: x, y: y)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(200_000)
let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: n, wheel2: 0, wheel3: 0)
e?.location = p
e?.post(tap: .cghidEventTap)
print("scrolled \(n) at \(x),\(y)")
