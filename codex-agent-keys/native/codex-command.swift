import AppKit
import ApplicationServices
import Foundation

enum Command: String {
    case dictate
    case review
    case terminal
}

guard CommandLine.arguments.count == 2,
      let command = Command(rawValue: CommandLine.arguments[1]) else {
    fputs("usage: codex-command dictate|review|terminal\n", stderr)
    exit(64)
}

let expectedPath = URL(fileURLWithPath: "/Applications/Codex.app").standardizedFileURL.path
guard let app = NSWorkspace.shared.runningApplications.first(where: {
    $0.bundleURL?.standardizedFileURL.path == expectedPath
}) else {
    fputs("Codex is not running\n", stderr)
    exit(69)
}

guard CGPreflightPostEventAccess() else {
    fputs("Accessibility access is required to send commands to Codex\n", stderr)
    exit(77)
}

guard app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps]) else {
    fputs("Could not activate Codex\n", stderr)
    exit(69)
}
Thread.sleep(forTimeInterval: 0.3)
guard app.isActive else {
    fputs("Codex did not become the active application\n", stderr)
    exit(69)
}

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else { return nil }
    return result
}

func findButton(_ element: AXUIElement, description: String, depth: Int = 0) -> AXUIElement? {
    guard depth < 40 else { return nil }
    let role = attribute(element, kAXRoleAttribute) as? String
    let label = attribute(element, kAXDescriptionAttribute) as? String
    if role == kAXButtonRole as String, label == description { return element }
    guard let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return nil }
    for child in children {
        if let match = findButton(child, description: description, depth: depth + 1) { return match }
    }
    return nil
}

func findMenuItem(_ element: AXUIElement, title: String, depth: Int = 0) -> AXUIElement? {
    guard depth < 50 else { return nil }
    let role = attribute(element, kAXRoleAttribute) as? String
    let label = attribute(element, kAXTitleAttribute) as? String
    if role == kAXMenuItemRole as String, label == title { return element }
    guard let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return nil }
    for child in children {
        if let match = findMenuItem(child, title: title, depth: depth + 1) { return match }
    }
    return nil
}

func hasVisibleTerminalTab(_ element: AXUIElement, depth: Int = 0) -> Bool {
    guard depth < 50 else { return false }
    let role = attribute(element, kAXRoleAttribute) as? String
    let label = attribute(element, kAXDescriptionAttribute) as? String
    if role == kAXButtonRole as String,
       let label,
       label.hasPrefix("Close "),
       label.hasSuffix(" tab") {
        return true
    }
    guard let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return false }
    return children.contains { hasVisibleTerminalTab($0, depth: depth + 1) }
}

func pointAttribute(_ element: AXUIElement, _ name: String, into point: inout CGPoint) -> Bool {
    guard let raw = attribute(element, name), CFGetTypeID(raw) == AXValueGetTypeID() else { return false }
    return AXValueGetValue(raw as! AXValue, .cgPoint, &point)
}

func sizeAttribute(_ element: AXUIElement, into size: inout CGSize) -> Bool {
    guard let raw = attribute(element, kAXSizeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() else { return false }
    return AXValueGetValue(raw as! AXValue, .cgSize, &size)
}

if command == .dictate {
    let root = AXUIElementCreateApplication(app.processIdentifier)
    guard let button = findButton(root, description: "Stop dictation") ?? findButton(root, description: "Dictate") else {
        fputs("Codex dictation control is not available\n", stderr)
        exit(69)
    }
    var origin = CGPoint.zero
    var dimensions = CGSize.zero
    guard pointAttribute(button, kAXPositionAttribute, into: &origin),
          sizeAttribute(button, into: &dimensions) else {
        fputs("Could not locate the Codex Dictate button\n", stderr)
        exit(70)
    }
    let original = CGEvent(source: nil)?.location ?? .zero
    let center = CGPoint(x: origin.x + dimensions.width / 2, y: origin.y + dimensions.height / 2)
    guard CGWarpMouseCursorPosition(center) == .success else {
        fputs("Could not move to the Codex Dictate button\n", stderr)
        exit(70)
    }
    Thread.sleep(forTimeInterval: 0.2)
    let actual = CGEvent(source: nil)?.location ?? center
    guard abs(actual.x - center.x) < 2, abs(actual.y - center.y) < 2 else {
        CGWarpMouseCursorPosition(original)
        fputs("Mouse did not reach the Codex Dictate button\n", stderr)
        exit(70)
    }
    let source = CGEventSource(stateID: .combinedSessionState)
    guard let mouseDown = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: actual, mouseButton: .left),
          let mouseUp = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: actual, mouseButton: .left) else {
        CGWarpMouseCursorPosition(original)
        fputs("Could not create the Codex Dictate click\n", stderr)
        exit(70)
    }
    mouseDown.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.08)
    mouseUp.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.1)
    CGWarpMouseCursorPosition(original)
    exit(0)
}

if command == .terminal {
    let root = AXUIElementCreateApplication(app.processIdentifier)
    let menuTitle = hasVisibleTerminalTab(root) ? "Toggle Bottom Panel" : "Open Terminal"
    guard let menuItem = findMenuItem(root, title: menuTitle) else {
        fputs("Codex terminal menu action is not available\n", stderr)
        exit(69)
    }
    guard AXUIElementPerformAction(menuItem, kAXPressAction as CFString) == .success else {
        fputs("Could not toggle the Codex terminal\n", stderr)
        exit(70)
    }
    exit(0)
}

if command == .review {
    let root = AXUIElementCreateApplication(app.processIdentifier)
    guard let menuItem = findMenuItem(root, title: "Toggle Review Panel") else {
        fputs("Codex Toggle Review Panel menu action is not available\n", stderr)
        exit(69)
    }
    guard AXUIElementPerformAction(menuItem, kAXPressAction as CFString) == .success else {
        fputs("Could not toggle the Codex review panel\n", stderr)
        exit(70)
    }
    exit(0)
}
