import Cocoa

// click.swift <x> <y> [right]  -- moves the pointer to (x,y) in global screen coords, dwells, clicks.
let args = CommandLine.arguments
guard args.count >= 3, let x = Double(args[1]), let y = Double(args[2]) else {
  print("usage: click x y [right]"); exit(2)
}
let right = args.count > 3 && args[3] == "right"
let p = CGPoint(x: x, y: y)
let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)
move?.post(tap: .cghidEventTap)
usleep(400_000)
let downType: CGEventType = right ? .rightMouseDown : .leftMouseDown
let upType: CGEventType = right ? .rightMouseUp : .leftMouseUp
let btn: CGMouseButton = right ? .right : .left
let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: p, mouseButton: btn)
let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: p, mouseButton: btn)
down?.post(tap: .cghidEventTap)
usleep(80_000)
up?.post(tap: .cghidEventTap)
print("clicked \(right ? "right" : "left") at \(x),\(y)")
