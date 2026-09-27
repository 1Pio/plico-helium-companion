// Real isolated-browser capture. No audio, menu bar, desktop or unrelated apps.
// The controller provides the marked browser PID and one exact owned window.
import AppKit
import ScreenCaptureKit
import AVFoundation
import Darwin

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    var first: CMTime?
    var frames = 0
    var failed = false
    init(url: URL, width: Int, height: Int) throws {
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: 60]])
        input.expectsMediaDataInRealTime = true
        super.init()
        writer.add(input)
        guard writer.startWriting() else { throw writer.error! }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        failed = true
        fputs("Capture failed: \(error)\n", stderr)
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, CMSampleBufferIsValid(buffer),
              let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let rawStatus = attachments.first?[.status] as? Int,
              SCFrameStatus(rawValue: rawStatus) == .complete else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(buffer)
        if first == nil {
            first = pts
            writer.startSession(atSourceTime: pts)
            print("{\"event\":\"capture-start\",\"pts\":\(CMTimeGetSeconds(pts)),\"uptime\":\(ProcessInfo.processInfo.systemUptime)}")
            fflush(stdout)
        }
        guard input.isReadyForMoreMediaData else { return }
        if !input.append(buffer) { failed = true }
        frames += 1
    }
}

@main struct Capture {
    static func main() async throws {
        guard CommandLine.arguments.count == 6,
              let pid = Int32(CommandLine.arguments[1]),
              let hostPID = Int32(CommandLine.arguments[2]),
              let windowID = UInt32(CommandLine.arguments[3]),
              let seconds = Double(CommandLine.arguments[5]), seconds > 0, seconds <= 90 else {
            fatalError("capture BROWSER_PID HOST_PID WINDOW_ID NEW_OUTPUT.mov SECONDS")
        }
        let output = URL(fileURLWithPath: CommandLine.arguments[4])
        guard !FileManager.default.fileExists(atPath: output.path) else { fatalError("Output already exists") }
        // Include the companion's ordered-out panel so it can appear after capture starts.
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
        guard let browser = content.applications.first(where: { $0.processID == pid && $0.bundleIdentifier == "net.imput.helium" }),
              let host = content.applications.first(where: { $0.processID == hostPID && $0.bundleIdentifier == "cc.helwig.plico.companion" }),
              let window = content.windows.first(where: { $0.windowID == windowID && $0.owningApplication?.processID == pid }),
              let display = content.displays.first(where: { $0.frame.contains(window.frame) }) else { fatalError("Owned capture surface unavailable or spans displays") }
        // Match the companion to the exact browser parent and development app path.
        var info = proc_bsdinfo()
        let count = proc_pidinfo(hostPID, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size))
        guard count == MemoryLayout<proc_bsdinfo>.size, info.pbi_ppid == UInt32(pid) else { fatalError("Host parent mismatch") }
        let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        let expected = executable.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Plico Helium Companion.app").path
        guard NSRunningApplication(processIdentifier: hostPID)?.bundleURL?.path == expected else { fatalError("Not the development companion") }
        let excluded = content.windows.filter { $0.owningApplication?.processID == pid && $0.windowID != windowID }
        let filter = SCContentFilter(display: display, including: [browser, host], exceptingWindows: excluded)
        filter.includeMenuBar = false
        let config = SCStreamConfiguration()
        config.sourceRect = window.frame.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
        config.width = Int(window.frame.width / 2) * 2
        config.height = Int(window.frame.height / 2) * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        config.queueDepth = 3
        config.showsCursor = false
        config.capturesAudio = false
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        let recorder = try Recorder(url: output, width: config.width, height: config.height)
        let queue = DispatchQueue(label: "plico.demo.capture")
        let stream = SCStream(filter: filter, configuration: config, delegate: recorder)
        try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: queue)
        try await stream.startCapture()
        // Stop if a person switches apps. No unrelated app ever enters the filter.
        let end = ProcessInfo.processInfo.systemUptime + seconds
        while ProcessInfo.processInfo.systemUptime < end && !recorder.failed {
            try await Task.sleep(nanoseconds: 100_000_000)
            let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
            if front != pid && front != hostPID { recorder.failed = true; break }
        }
        try await stream.stopCapture()
        queue.sync { recorder.input.markAsFinished() }
        await recorder.writer.finishWriting()
        print("{\"event\":\"capture-end\",\"frames\":\(recorder.frames),\"failed\":\(recorder.failed)}")
        if recorder.failed || recorder.writer.status != .completed { exit(1) }
    }
}
