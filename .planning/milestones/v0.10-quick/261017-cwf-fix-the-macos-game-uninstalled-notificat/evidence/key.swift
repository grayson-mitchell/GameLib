import Cocoa
// key.swift <keycode> [cmd] -- posts keyDown+keyUp for a virtual keycode via the HID event tap.
let args = CommandLine.arguments
guard args.count >= 2, let code = UInt16(args[1]) else { print("usage: key <keycode> [cmd]"); exit(2) }
let cmd = args.count > 2 && args[2] == "cmd"
let src = CGEventSource(stateID: .hidSystemState)
let down = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: true)
let up = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: false)
if cmd { down?.flags = .maskCommand; up?.flags = .maskCommand }
down?.post(tap: .cghidEventTap)
usleep(60_000)
up?.post(tap: .cghidEventTap)
print("key \(code) cmd=\(cmd)")
