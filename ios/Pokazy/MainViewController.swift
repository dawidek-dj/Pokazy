// Okno programu na iPadzie: ten sam program co na Windows (strona z wbudowanego serwera) w WKWebView
import UIKit
import WebKit
import MediaPlayer
import UniformTypeIdentifiers

/// słabe pośredniki — WKUserContentController trzyma obsługę wiadomości na stałe
@MainActor
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: MainViewController?
    init(_ t: MainViewController) { target = t }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.handle(message)
    }
}
@MainActor
final class WeakReplyHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var target: MainViewController?
    init(_ t: MainViewController) { target = t }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        guard let t = target else { return (nil, "brak okna") }
        return await t.handleWithReply(message)
    }
}

final class MainViewController: UIViewController, WKUIDelegate, WKNavigationDelegate, UIDocumentPickerDelegate {
    private var webView: WKWebView!
    private let loading = UILabel()
    private var tvWebView: WKWebView?
    private var popups: [WKWebView] = []
    private var pickCont: CheckedContinuation<String, Never>?
    private var fullscreen = false

    override var prefersStatusBarHidden: Bool { fullscreen }
    override var prefersHomeIndicatorAutoHidden: Bool { fullscreen }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { fullscreen ? .all : [] }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.11, green: 0.08, blue: 0.125, alpha: 1)
        Displays.shared.main = self

        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()                       // ustawienia, ulubione, poprawki zostają po zamknięciu
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []        // filmy i muzyka startują same (także na telewizorze)
        cfg.allowsAirPlayForMediaPlayback = true
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        if #available(iOS 15.4, *) { cfg.preferences.isElementFullscreenEnabled = true }
        let ucc = cfg.userContentController
        ucc.add(WeakHandler(self), name: "pokazy")
        ucc.addScriptMessageHandler(WeakReplyHandler(self), contentWorld: .page, name: "pokazyR")
        ucc.addUserScript(WKUserScript(source: "window.__POKAZY__ = \(configJSON());", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if let u = Bundle.main.url(forResource: "native-shim", withExtension: "js"), let js = try? String(contentsOf: u, encoding: .utf8) {
            ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }   // podgląd błędów: Safari na Macu → Programowanie
        view.addSubview(webView)

        loading.text = "Uruchamiam Pokazy…"
        loading.textColor = UIColor(red: 0.93, green: 0.83, blue: 0.63, alpha: 1)
        loading.font = .italicSystemFont(ofSize: 28)
        loading.numberOfLines = 0
        loading.textAlignment = .center
        loading.frame = view.bounds.insetBy(dx: 40, dy: 40)
        loading.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(loading)

        setupRemote()
        NodeHost.shared.waitReady { [weak self] ok in
            guard let self = self else { return }
            if ok {
                self.webView.load(URLRequest(url: NodeHost.shared.baseURL))
            } else {
                self.loading.font = .systemFont(ofSize: 15)
                self.loading.text = "Serwer programu nie wystartował.\n\n" + NodeHost.shared.lastLog()
            }
        }
    }

    // poza pokazem program nie wchodzi pod pasek stanu; w pokazie — cały ekran
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let w = webView else { return }
        w.frame = fullscreen ? view.bounds : view.bounds.inset(by: UIEdgeInsets(top: view.safeAreaInsets.top, left: 0, bottom: 0, right: 0))
    }

    private func configJSON() -> String {
        var c: [String: Any] = ["token": NodeHost.shared.token, "port": NodeHost.shared.port, "version": NodeHost.shared.version,
                                "data": NodeHost.shared.dataDir.path, "docs": NodeHost.shared.docsDir.path, "ext": Displays.shared.connected]
        if let s = Displays.shared.pixelSize { c["extW"] = Int(s.width); c["extH"] = Int(s.height) }
        let d = (try? JSONSerialization.data(withJSONObject: c)) ?? Data("{}".utf8)
        return String(data: d, encoding: .utf8) ?? "{}"
    }

    // MARK: strona gotowa
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        loading.removeFromSuperview()
        displayChanged()
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false   // bez przypadkowego powiększania całej strony
        webView.becomeFirstResponder()   // klawiatura i piloty Bluetooth od razu sterują programem
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { webView.reload() }
    }
    // MARK: telewizor
    func displayChanged() {
        let on = Displays.shared.connected
        var js = "window.__iosDisplay && window.__iosDisplay(\(on)"
        if let s = Displays.shared.pixelSize { js += ", \(Int(s.width)), \(Int(s.height))" }
        js += ")"
        webView?.evaluateJavaScript(js, completionHandler: nil)
        if !on, let tv = tvWebView { tvWebView = nil; tv.evaluateJavaScript("window.close()", completionHandler: nil) }
    }

    // window.open z programu: okno telewizora (popup 1280×720) albo podgląd pliku
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let isTV = windowFeatures.width?.intValue == 1280 && windowFeatures.height?.intValue == 720
        if isTV {
            guard Displays.shared.connected else { return nil }
            let w = WKWebView(frame: .zero, configuration: configuration)
            w.uiDelegate = self
            w.navigationDelegate = self
            if #available(iOS 16.4, *) { w.isInspectable = true }
            tvWebView = w
            Displays.shared.show(w)
            return w
        }
        if let u = action.request.url, let scheme = u.scheme, ["http", "https"].contains(scheme), !["127.0.0.1", "localhost"].contains(u.host ?? "") {
            UIApplication.shared.open(u)
            return nil
        }
        let w = WKWebView(frame: .zero, configuration: configuration)
        w.uiDelegate = self
        w.navigationDelegate = self
        popups.append(w)
        topController().present(PopupViewController(webView: w), animated: true)
        return w
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === tvWebView || (tvWebView == nil && webView !== self.webView && !popups.contains(webView)) {
            tvWebView = nil
            Displays.shared.hide()
            return
        }
        if let i = popups.firstIndex(of: webView) {
            popups.remove(at: i)
            if let vc = webView.next(of: PopupViewController.self) { vc.dismiss(animated: true) }
            else { presentedViewController?.dismiss(animated: true) }
        }
    }

    // MARK: okienka alert / confirm / prompt (program z nich korzysta)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in c.resume() })
            if !presentAlert(a) { c.resume() }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Anuluj", style: .cancel) { _ in c.resume(returning: false) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in c.resume(returning: true) })
            if !presentAlert(a) { c.resume(returning: false) }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
            let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            a.addTextField { $0.text = defaultText }
            a.addAction(UIAlertAction(title: "Anuluj", style: .cancel) { _ in c.resume(returning: nil) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { [weak a] _ in c.resume(returning: a?.textFields?.first?.text ?? "") })
            if !presentAlert(a) { c.resume(returning: nil) }
        }
    }
    private func presentAlert(_ a: UIAlertController) -> Bool {
        let top = topController()
        if top is UIAlertController { return false }
        top.present(a, animated: true)
        return true
    }
    private func topController() -> UIViewController {
        var c: UIViewController = self
        while let p = c.presentedViewController { c = p }
        return c
    }

    // MARK: wiadomości ze strony
    func handle(_ m: WKScriptMessage) {
        guard let d = m.body as? [String: Any], let t = d["t"] as? String else { return }
        switch t {
        case "power":
            UIApplication.shared.isIdleTimerDisabled = (d["on"] as? Bool) ?? false   // ekran iPada nie gaśnie w trakcie pokazu
        case "fullscreen":
            fullscreen = (d["on"] as? Bool) ?? false
            setNeedsStatusBarAppearanceUpdate()
            setNeedsUpdateOfHomeIndicatorAutoHidden()
            setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
            view.setNeedsLayout()
        case "log":
            NSLog("Pokazy: %@", String(describing: d["m"] ?? ""))
        default: break
        }
    }

    func handleWithReply(_ m: WKScriptMessage) async -> (Any?, String?) {
        guard let d = m.body as? [String: Any], let t = d["t"] as? String else { return (nil, "zła wiadomość") }
        switch t {
        case "pickFolder":
            let path = await pickFolder()
            return (path, nil)
        case "isDir":
            var dir: ObjCBool = false
            let ok = FileManager.default.fileExists(atPath: (d["p"] as? String) ?? "", isDirectory: &dir)
            return (ok && dir.boolValue, nil)
        case "guestDir":
            let raw = (d["name"] as? String) ?? "Projekt"
            let clean = String(raw.components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|")).joined().prefix(60))
            let u = NodeHost.shared.docsDir.appendingPathComponent("Od gości", isDirectory: true).appendingPathComponent(clean.isEmpty ? "Projekt" : clean, isDirectory: true)
            try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
            return (u.path, nil)
        default:
            return (nil, "nieznane polecenie")
        }
    }

    // MARK: wybór folderu z „Plików”
    private func pickFolder() async -> String {
        await withCheckedContinuation { (c: CheckedContinuation<String, Never>) in
            pickCont?.resume(returning: "")
            pickCont = c
            let p = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
            p.delegate = self
            p.allowsMultipleSelection = false
            p.directoryURL = NodeHost.shared.docsDir
            topController().present(p, animated: true)
        }
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        var path = ""
        if let u = urls.first {
            _ = u.startAccessingSecurityScopedResource()
            Bookmarks.save(u)
            path = u.path
        }
        pickCont?.resume(returning: path); pickCont = nil
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickCont?.resume(returning: ""); pickCont = nil
    }

    private func remoteKey(_ k: String) {
        webView?.evaluateJavaScript("window.__iosKey && window.__iosKey('\(k)')", completionHandler: nil)
    }

    // MARK: przyciski multimedialne (pilot Bluetooth, słuchawki, Centrum sterowania)
    private func setupRemote() {
        let c = MPRemoteCommandCenter.shared()
        let send: (String) -> MPRemoteCommandHandlerStatus = { [weak self] k in
            Task { @MainActor in self?.remoteKey(k) }
            return .success
        }
        c.togglePlayPauseCommand.addTarget { _ in send("MediaPlayPause") }
        c.playCommand.addTarget { _ in send("MediaPlayPause") }
        c.pauseCommand.addTarget { _ in send("MediaPlayPause") }
        c.nextTrackCommand.addTarget { _ in send("MediaNextTrack") }
        c.previousTrackCommand.addTarget { _ in send("MediaPreviousTrack") }
    }
}

private extension UIResponder {
    func next<T: UIResponder>(of type: T.Type) -> T? {
        var r: UIResponder? = self.next
        while let x = r { if let t = x as? T { return t }; r = x.next }
        return nil
    }
}
