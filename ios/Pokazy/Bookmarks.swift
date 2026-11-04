// Foldery wybrane z aplikacji „Pliki” (pendrive, dysk USB, iCloud Drive, inne aplikacje).
// iPad daje dostęp tylko na czas działania programu — zapamiętujemy „zakładkę”, żeby po ponownym
// uruchomieniu folder był dostępny bez wybierania go od nowa.
import Foundation

enum Bookmarks {
    private static let key = "pokazy.bookmarks"
    private static var active: [URL] = []

    static func save(_ url: URL) {
        guard let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) else { return }
        var all = UserDefaults.standard.dictionary(forKey: key) as? [String: Data] ?? [:]
        all[url.path] = data
        UserDefaults.standard.set(all, forKey: key)
        active.append(url)
    }

    /// po uruchomieniu: odnawiamy dostęp; gdy folder ma nową ścieżkę — zapisujemy „stara → nowa” dla serwera
    static func restore() {
        let all = UserDefaults.standard.dictionary(forKey: key) as? [String: Data] ?? [:]
        var map: [String: String] = [:]
        var keep: [String: Data] = [:]
        for (old, data) in all {
            var stale = false
            guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { continue }
            _ = url.startAccessingSecurityScopedResource()
            active.append(url)
            keep[url.path] = stale ? ((try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)) ?? data) : data
            if url.path != old { map[old] = url.path }
        }
        UserDefaults.standard.set(keep, forKey: key)
        if let json = try? JSONSerialization.data(withJSONObject: map) { try? json.write(to: NodeHost.shared.mapFile) }
    }
}
