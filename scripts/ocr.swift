import Foundation
import Vision
import AppKit

let paths = Array(CommandLine.arguments.dropFirst())
for path in paths {
    FileHandle.standardOutput.write("===PAGE \((path as NSString).lastPathComponent)===\n".data(using:.utf8)!)
    guard let img = NSImage(contentsOfFile: path),
          let tiff = img.tiffRepresentation,
          let bmp = NSBitmapImageRep(data: tiff),
          let cg = bmp.cgImage else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    req.revision = VNRecognizeTextRequestRevision3
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { continue }
    guard let obs = req.results else { continue }
    for o in obs {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        let line = String(format: "%.5f\t%.5f\t%.5f\t%.5f\t%@\n", b.minX, 1.0 - b.maxY, b.width, b.height, c.string)
        FileHandle.standardOutput.write(line.data(using:.utf8)!)
    }
}
