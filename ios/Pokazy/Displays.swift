// Telewizor przez HDMI: okno z samym pokazem (zdjęcia, filmy) na drugim ekranie
import UIKit
import WebKit

@MainActor
final class Displays {
    static let shared = Displays()
    private(set) var tvScene: UIWindowScene?
    private var tvWindow: UIWindow?
    weak var main: MainViewController?

    var connected: Bool { tvScene != nil }
    /// rozdzielczość telewizora w pikselach (np. 1920×1080, 3840×2160)
    var pixelSize: CGSize? {
        guard let s = tvScene?.screen else { return nil }
        return s.nativeBounds.size
    }

    func attach(_ scene: UIWindowScene) {
        tvScene = scene
        main?.displayChanged()
    }

    func detach(_ scene: UIScene) {
        guard scene === tvScene else { return }
        hide()
        tvScene = nil
        main?.displayChanged()
    }

    /// pokaz „na telewizorze”: strona okna telewizora trafia na ekran HDMI
    @discardableResult
    func show(_ webView: WKWebView) -> Bool {
        guard let scene = tvScene else { return false }
        let w = UIWindow(windowScene: scene)
        w.backgroundColor = .black
        w.rootViewController = TVViewController(webView: webView)
        w.isHidden = false
        tvWindow = w
        return true
    }

    /// koniec trybu „na telewizorze” — iPad znów pokazuje na nim swój ekran
    func hide() {
        tvWindow?.isHidden = true
        tvWindow?.rootViewController = nil
        tvWindow = nil
    }
}

final class TVViewController: UIViewController {
    let webView: WKWebView
    init(webView: WKWebView) {
        self.webView = webView
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) nie jest używane") }

    override func loadView() {
        let v = UIView()
        v.backgroundColor = .black
        webView.frame = v.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = false
        v.addSubview(webView)
        view = v
    }
    override var prefersStatusBarHidden: Bool { true }
}

/// okno podglądu pliku („Otwórz w nowej karcie”) — na całym ekranie iPada
final class PopupViewController: UIViewController {
    let webView: WKWebView
    init(webView: WKWebView) {
        self.webView = webView
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) nie jest używane") }

    override func loadView() {
        let v = UIView()
        v.backgroundColor = UIColor(red: 0.05, green: 0.04, blue: 0.055, alpha: 1)
        webView.frame = v.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        v.addSubview(webView)
        view = v
    }
}
