import Cocoa

// drag.swift <x1> <y1> <x2> <y2>  -- left-button press at (x1,y1), move in steps to (x2,y2), release.
let a = CommandLine.arguments
guard a.count >= 5, let x1 = Double(a[1]), let y1 = Double(a[2]), let x2 = Double(a[3]), let y2 = Double(a[4]) else {
  print("usage: drag x1 y1 x2 y2"); exit(2)
}
func post(_ t: CGEventType, _ p: CGPoint) {
  CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
}
let p1 = CGPoint(x: x1, y: y1), p2 = CGPoint(x: x2, y: y2)
post(.mouseMoved, p1); usleep(300_000)
post(.leftMouseDown, p1); usleep(150_000)
let steps = 20
for i in 1...steps {
  let f = Double(i) / Double(steps)
  post(.leftMouseDragged, CGPoint(x: x1 + (x2 - x1) * f, y: y1 + (y2 - y1) * f))
  usleep(20_000)
}
usleep(150_000)
post(.leftMouseUp, p2)
print("dragged \(x1),\(y1) -> \(x2),\(y2)")
