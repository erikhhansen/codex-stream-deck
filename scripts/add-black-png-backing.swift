import AppKit
import Foundation

for argument in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: argument)
    guard let image = NSImage(contentsOf: url),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
          let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: cgImage.width,
            pixelsHigh: cgImage.height,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
          ) else {
        fputs("Could not decode \(argument)\n", stderr)
        exit(1)
    }

    let bounds = NSRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor.black.setFill()
    bounds.fill()
    let radius = min(bounds.width, bounds.height) * 0.10
    NSBezierPath(roundedRect: bounds, xRadius: radius, yRadius: radius).addClip()
    image.draw(in: bounds, from: .zero, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fputs("Could not encode \(argument)\n", stderr)
        exit(1)
    }
    try data.write(to: url)
}
