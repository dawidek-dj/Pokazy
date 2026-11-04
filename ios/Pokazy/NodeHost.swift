// Serwer programu (ten sam co na Windows) uruchomiony w Node.js wbudowanym w aplikację (nodejs-mobile)
import Foundation
import Security
import NodeMobile

final class NodeHost {
    static let shared = NodeHost()
    let port = 8765
    let token: String = {
        var b = [UInt8](repeating: 0, count: 18)
        if SecRandomCopyBytes(kSecRandomDefault, b.count, &b) != errSecSuccess { b = (0..<18).map { _ in UInt8.random(in: 0...255) } }
        return b.map { String(format: "%02x", $0) }.joined()
    }()
    private var started = false

    /// „Pliki → Na moim iPadzie → Pokazy” — tu wrzucasz foldery ze zdjęciami i projekty z laptopa
    lazy var docsDir: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    /// dane programu (miniatury, mapy, dziennik) — niewidoczne w „Plikach”
    lazy var dataDir: URL = {
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Pokazy", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()
    var mapFile: URL { dataDir.appendingPathComponent("sciezki.json") }
    var logFile: URL { dataDir.appendingPathComponent("log.txt") }
    var baseURL: URL { URL(string: "http://127.0.0.1:\(port)/")! }
    var version: String { (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0" }

    func start() {
        guard !started else { return }
        started = true
        // folder widoczny w „Plikach” od pierwszego uruchomienia (z krótką instrukcją)
        let readme = docsDir.appendingPathComponent("Wrzuć tu foldery ze zdjęciami.txt")
        if !FileManager.default.fileExists(atPath: readme.path) {
            try? "Wrzuć do tego folderu (Pliki → Na moim iPadzie → Pokazy) foldery ze zdjęciami i filmami albo projekt przyniesiony z laptopa („Zabierz projekt na pendrive / dysk”).\nW programie: Dodaj folder → Foldery na iPadzie.\n".write(to: readme, atomically: true, encoding: .utf8)
        }
        try? FileManager.default.createDirectory(at: docsDir.appendingPathComponent("Od gości", isDirectory: true), withIntermediateDirectories: true)
        guard let project = Bundle.main.url(forResource: "nodejs-project", withExtension: nil) else { return }
        setenv("POKAZY_DATA", dataDir.path, 1)
        setenv("POKAZY_DOCS", docsDir.path, 1)
        setenv("POKAZY_TOKEN", token, 1)
        setenv("POKAZY_PORT", String(port), 1)
        setenv("POKAZY_MAP", mapFile.path, 1)
        setenv("POKAZY_WEB", project.appendingPathComponent("web").path, 1)
        let script = project.appendingPathComponent("main.js").path
        let t = Thread { NodeHost.run(["node", script]) }
        t.name = "nodejs"
        t.stackSize = 2 * 1024 * 1024
        t.start()
    }

    /// node_start wymaga argumentów w jednym, ciągłym bloku pamięci
    private static func run(_ args: [String]) {
        let total = args.reduce(0) { $0 + $1.utf8.count + 1 }
        let buffer = UnsafeMutablePointer<CChar>.allocate(capacity: total)
        var argv: [UnsafeMutablePointer<CChar>?] = []
        var offset = 0
        for a in args {
            let p = buffer + offset
            a.withCString { _ = strcpy(p, $0) }
            argv.append(p)
            offset += a.utf8.count + 1
        }
        argv.append(nil)
        _ = argv.withUnsafeMutableBufferPointer { node_start(Int32(args.count), $0.baseAddress) }
    }

    /// czekamy, aż serwer odpowie (zwykle < 1 s)
    func waitReady(timeout: TimeInterval = 40, done: @escaping @MainActor (Bool) -> Void) {
        let deadline = Date().addingTimeInterval(timeout)
        func attempt() {
            var req = URLRequest(url: baseURL.appendingPathComponent("api/ping"))
            req.timeoutInterval = 1.5
            URLSession.shared.dataTask(with: req) { _, resp, _ in
                if resp is HTTPURLResponse { Task { @MainActor in done(true) }; return }
                if Date() > deadline { Task { @MainActor in done(false) }; return }
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) { attempt() }
            }.resume()
        }
        attempt()
    }

    func lastLog() -> String {
        guard let s = try? String(contentsOf: logFile, encoding: .utf8) else { return "(brak dziennika)" }
        return String(s.suffix(1500))
    }
}
