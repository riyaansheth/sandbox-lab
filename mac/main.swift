// Native macOS shell: a window with a WKWebView that runs the built game from the app bundle.
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!

  func applicationDidFinishLaunching(_ note: Notification) {
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = []
    let web = WKWebView(frame: .zero, configuration: config)
    let game = Bundle.main.resourceURL!.appendingPathComponent("game")
    web.loadFileURL(game.appendingPathComponent("index.html"), allowingReadAccessTo: game)

    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1400, height: 900),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable],
                      backing: .buffered, defer: false)
    window.title = "Sandbox Lab"
    window.contentView = web
    window.setFrameAutosaveName("main")
    window.center()
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(web)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let menu = NSMenu()
let appItem = NSMenuItem()
appItem.submenu = NSMenu()
appItem.submenu!.addItem(withTitle: "Quit Sandbox Lab", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
let viewItem = NSMenuItem()
viewItem.submenu = NSMenu(title: "View")
viewItem.submenu!.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
  .keyEquivalentModifierMask = [.command, .control]
menu.addItem(appItem)
menu.addItem(viewItem)

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.mainMenu = menu
app.setActivationPolicy(.regular)
app.run()
