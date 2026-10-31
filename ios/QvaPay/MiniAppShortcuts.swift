import Foundation
import UIKit
import React

/// Accesos rápidos del icono de QvaPay (mantener pulsado): las mini-apps
/// favoritas del usuario (helpers/miniAppShortcuts.ts). iOS no deja que una
/// app ponga iconos en la pantalla de inicio, así que aquí no hay `requestPin`
/// como en Android.
///
/// Cada acceso guarda la URL pública de su mini-app y el SceneDelegate se la
/// entrega a `Linking` como un universal link (`/apps/:slug`): en frío como
/// URL de lanzamiento, en caliente por `RCTLinkingManager.scene(_:continue:)`.
@objc(MiniAppShortcuts)
class MiniAppShortcuts: NSObject {

  static let shortcutType = "com.qvapay.miniapp"
  /// Lo que enseña iOS en el menú del icono.
  private static let maxItems = 4

  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// URL de la mini-app de un acceso rápido nuestro; nil para cualquier otro.
  static func url(for item: UIApplicationShortcutItem) -> URL? {
    guard item.type == shortcutType, let raw = item.userInfo?["url"] as? String else { return nil }
    return URL(string: raw)
  }

  /// La URL como universal link: el mismo camino que un enlace https abierto con la app delante.
  static func browsingActivity(for url: URL) -> NSUserActivity {
    let activity = NSUserActivity(activityType: NSUserActivityTypeBrowsingWeb)
    activity.webpageURL = url
    return activity
  }

  @objc func setQuickActions(_ items: NSArray, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let shortcuts: [UIApplicationShortcutItem] = items.compactMap { $0 as? [String: Any] }
      .prefix(Self.maxItems)
      .compactMap { item in
        guard let label = item["label"] as? String, let url = item["url"] as? String else { return nil }
        return UIApplicationShortcutItem(
          type: Self.shortcutType,
          localizedTitle: label,
          localizedSubtitle: nil,
          icon: UIApplicationShortcutIcon(systemImageName: "star.fill"),
          userInfo: ["url": url as NSString]
        )
      }
    DispatchQueue.main.async {
      UIApplication.shared.shortcutItems = shortcuts
      resolve(true)
    }
  }

  @objc func clearQuickActions(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      UIApplication.shared.shortcutItems = []
      resolve(true)
    }
  }
}
