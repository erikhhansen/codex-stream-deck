import AppKit
import ApplicationServices
import Foundation

enum Command: String {
    case commitMergeDeploy = "commit-merge-deploy"
    case dictate
    case doIt = "do-it"
    case guideMe = "guide-me"
    case review
    case terminal
}

guard CommandLine.arguments.count == 2,
      let command = Command(rawValue: CommandLine.arguments[1]) else {
    fputs("usage: codex-command commit-merge-deploy|dictate|do-it|guide-me|review|terminal\n", stderr)
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

func collectTextInputs(_ element: AXUIElement, into results: inout [AXUIElement], depth: Int = 0) {
    guard depth < 50 else { return }
    let role = attribute(element, kAXRoleAttribute) as? String
    if role == kAXTextAreaRole as String || role == kAXTextFieldRole as String {
        results.append(element)
    }
    guard let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return }
    for child in children { collectTextInputs(child, into: &results, depth: depth + 1) }
}

func composerNearestDictateButton(_ root: AXUIElement) -> AXUIElement? {
    guard let button = findButton(root, description: "Stop dictation") ?? findButton(root, description: "Dictate") else { return nil }
    var buttonOrigin = CGPoint.zero
    var buttonSize = CGSize.zero
    guard pointAttribute(button, kAXPositionAttribute, into: &buttonOrigin),
          sizeAttribute(button, into: &buttonSize) else { return nil }
    let buttonCenter = CGPoint(x: buttonOrigin.x + buttonSize.width / 2, y: buttonOrigin.y + buttonSize.height / 2)
    var inputs: [AXUIElement] = []
    collectTextInputs(root, into: &inputs)
    return inputs.compactMap { input -> (AXUIElement, CGFloat)? in
        var origin = CGPoint.zero
        var dimensions = CGSize.zero
        var focusable = DarwinBoolean(false)
        guard pointAttribute(input, kAXPositionAttribute, into: &origin),
              sizeAttribute(input, into: &dimensions),
              dimensions.width >= 160,
              dimensions.height >= 20,
              AXUIElementIsAttributeSettable(input, kAXFocusedAttribute as CFString, &focusable) == .success,
              focusable.boolValue else { return nil }
        let inputEdge = CGPoint(x: origin.x + dimensions.width, y: origin.y + dimensions.height)
        let distance = hypot(inputEdge.x - buttonCenter.x, inputEdge.y - buttonCenter.y)
        return (input, distance)
    }.min(by: { $0.1 < $1.1 })?.0
}

func focusByClick(_ element: AXUIElement, source: CGEventSource) -> Bool {
    var origin = CGPoint.zero
    var dimensions = CGSize.zero
    guard pointAttribute(element, kAXPositionAttribute, into: &origin),
          sizeAttribute(element, into: &dimensions) else { return false }
    let original = CGEvent(source: nil)?.location ?? .zero
    let target = CGPoint(x: origin.x + dimensions.width / 2, y: origin.y + dimensions.height / 2)
    guard CGWarpMouseCursorPosition(target) == .success,
          let mouseDown = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: target, mouseButton: .left),
          let mouseUp = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: target, mouseButton: .left) else {
        CGWarpMouseCursorPosition(original)
        return false
    }
    mouseDown.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.05)
    mouseUp.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.1)
    CGWarpMouseCursorPosition(original)
    return true
}

func postReturn(source: CGEventSource) -> Bool {
    guard let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true),
          let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false) else { return false }
    keyDown.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.05)
    keyUp.post(tap: .cghidEventTap)
    return true
}

func composerText(for command: Command) -> String? {
    switch command {
    case .commitMergeDeploy: "Commit, Merge, Deploy"
    case .doIt: "do it"
    case .guideMe: "Guide Me"
    default: nil
    }
}

if let composerText = composerText(for: command) {
    let applicationRoot = AXUIElementCreateApplication(app.processIdentifier)
    let focusedWindow = attribute(applicationRoot, kAXFocusedWindowAttribute)
    let root = focusedWindow != nil && CFGetTypeID(focusedWindow!) == AXUIElementGetTypeID()
        ? focusedWindow as! AXUIElement
        : applicationRoot
    var composer: AXUIElement?
    for _ in 0..<20 {
        composer = composerNearestDictateButton(root)
        if composer != nil { break }
        Thread.sleep(forTimeInterval: 0.1)
    }
    guard let composer else {
        fputs("Codex composer is not available\n", stderr)
        exit(69)
    }
    let source = CGEventSource(stateID: .combinedSessionState)
    guard let source, focusByClick(composer, source: source) else {
        fputs("Could not click the Codex composer\n", stderr)
        exit(70)
    }
    guard attribute(composer, kAXFocusedAttribute) as? Bool == true else {
        fputs("Codex composer did not receive focus\n", stderr)
        exit(70)
    }
    guard AXUIElementSetAttributeValue(composer, kAXValueAttribute as CFString, composerText as CFString) == .success else {
        fputs("Could not set text in the Codex composer\n", stderr)
        exit(70)
    }
    Thread.sleep(forTimeInterval: 0.15)
    guard (attribute(composer, kAXValueAttribute) as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) == composerText else {
        fputs("Codex did not accept text in the composer\n", stderr)
        exit(70)
    }
    guard attribute(composer, kAXFocusedAttribute) as? Bool == true else {
        fputs("Codex composer lost focus before submission\n", stderr)
        exit(70)
    }
    guard postReturn(source: source) else {
        fputs("Could not submit the Codex composer\n", stderr)
        exit(70)
    }
    exit(0)
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
