import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  /// Lo fija SceneDelegate: hay librerías que aún leen `UIApplication.shared.delegate?.window`.
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  /// Raíz de React Native ya creada. Si iOS descarta la escena (presión de memoria) y la
  /// reconecta, se cuelga de la ventana nueva en vez de arrancar una SEGUNDA instancia de RN.
  var reactRootViewController: UIViewController?

  /// Aquí solo se prepara la factoría: React Native arranca en `SceneDelegate`, que es
  /// quien tiene la ventana. Desde el SDK de iOS 27 una app sin ciclo de vida por escenas
  /// muere al arrancar (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

/// Ciclo de vida por escenas. Con escenas, los deep links ya NO llegan a los métodos
/// `application(_:open:)` / `application(_:continue:)` del AppDelegate, sino aquí:
/// - arranque en frío: en `connectionOptions`, que se traducen a las `launchOptions` que
///   `Linking.getInitialURL()` sabe leer (URL de esquema y universal link);
/// - app ya abierta: `scene(_:openURLContexts:)` y `scene(_:continue:)`, reenviados a
///   `RCTLinkingManager` como antes.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // Reconexión de la escena: React Native ya está vivo, se reutiliza su raíz
    if let existing = appDelegate.reactRootViewController {
      window.rootViewController = existing
      window.makeKeyAndVisible()
      // Un deep link que llega con la reconexión se entrega como con la app abierta
      if let url = connectionOptions.urlContexts.first?.url {
        RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
      } else if let activity = connectionOptions.userActivities.first {
        RCTLinkingManager.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
      }
      return
    }

    factory.startReactNative(
      withModuleName: "QvaPay",
      in: window,
      launchOptions: SceneDelegate.launchOptions(from: connectionOptions)
    )
    appDelegate.reactRootViewController = window.rootViewController
  }

  /// Las claves que lee `RCTLinkingManager.getInitialURL`.
  static func launchOptions(from options: UIScene.ConnectionOptions) -> [UIApplication.LaunchOptionsKey: Any]? {
    if let url = options.urlContexts.first?.url {
      return [.url: url]
    }
    if let activity = options.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }) {
      return [.userActivityDictionary: [
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]]
    }
    return nil
  }

  // Custom URL scheme (qvapay://p2p/...) con la app abierta
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  // Universal Links (https://qvapay.com/p2p/...) con la app abierta
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
