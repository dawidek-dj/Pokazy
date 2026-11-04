// Pokazy na iPada — uruchomienie aplikacji, serwer (Node.js) i sceny: iPad + telewizor (HDMI)
import UIKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // dźwięk gra także przy wyciszonym przełączniku i idzie tam, gdzie obraz (HDMI, AirPlay, Bluetooth)
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .default, options: [])
        try? s.setActive(true)
        Bookmarks.restore()          // foldery wybrane wcześniej z „Plików” (pendrive, iCloud, inne aplikacje)
        NodeHost.shared.start()      // serwer programu: pliki, pilot w telefonie, goście
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let external = session.role == .windowExternalDisplayNonInteractive || session.role.rawValue == "UIWindowSceneSessionRoleExternalDisplay"
        let c = UISceneConfiguration(name: external ? "TV" : "Default", sessionRole: session.role)
        c.delegateClass = external ? TVSceneDelegate.self : SceneDelegate.self
        return c
    }
}

/// Główne okno na iPadzie
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.rootViewController = MainViewController()
        w.makeKeyAndVisible()
        window = w
    }
}

/// Telewizor podłączony kablem (przejściówka USB-C/Lightning → HDMI).
/// Dopóki pokaz nie jest „na telewizorze”, iPad pokazuje na nim swój ekran (odbicie);
/// w trybie „na telewizorze” — tylko zdjęcia i filmy, a sterowanie zostaje na iPadzie.
final class TVSceneDelegate: UIResponder, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        Displays.shared.attach(ws)
    }
    func sceneDidDisconnect(_ scene: UIScene) {
        Displays.shared.detach(scene)
    }
}
