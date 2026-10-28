import Foundation
import UIKit
import UserNotifications
import React

/// Núcleo del push en iOS, SIN Firebase: el backend manda a APNs directo, así que
/// aquí solo hace falta el token de APNs, el permiso y los callbacks de
/// UNUserNotificationCenter. Vive como singleton porque el AppDelegate recibe el
/// token y el módulo de React Native (`QPPush`, abajo) nace después y puede
/// morir/renacer con cada recarga de JS.
///
/// Reglas:
/// - Con la app DELANTE no se presenta nada (`[]`): JS la enseña como toast y
///   pone el sonido (hooks/useAppNavigation). Igual que en Android.
/// - Un toque con JS escuchando se emite (`QPPushOpened`); si JS aún no escucha
///   (arranque en frío) se guarda y lo consume `getInitialNotification`.
final class QPPushCenter: NSObject, UNUserNotificationCenterDelegate {

    static let shared = QPPushCenter()

    /// Token APNs en hex, en cuanto el sistema lo entrega (cada arranque lo renueva).
    private(set) var tokenHex: String?
    /// userInfo del toque que llegó antes de que JS escuchara.
    private var pendingInitial: [AnyHashable: Any]?
    private var tokenWaiters: [(String?) -> Void] = []
    private let lock = NSLock()

    /// El módulo de RN vivo (si JS está cargado). Débil: el bridge es su dueño.
    weak var emitter: QPPush?

    /// Se llama UNA vez desde `didFinishLaunchingWithOptions`: toma el delegado del
    /// centro de notificaciones y, si el permiso ya estaba concedido, pide el token
    /// sin molestar al usuario (un token puede cambiar entre arranques).
    func attach() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                self.registerForRemoteNotifications()
            default:
                break
            }
        }
    }

    func registerForRemoteNotifications() {
        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
    }

    // MARK: - Token (lo llama el AppDelegate)

    func didRegister(deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        lock.lock()
        tokenHex = hex
        let waiters = tokenWaiters
        tokenWaiters = []
        lock.unlock()
        waiters.forEach { $0(hex) }
        emitter?.emit(event: "QPPushToken", body: ["token": hex, "environment": QPPushCenter.apnsEnvironment()])
    }

    func didFailToRegister(_ error: Error) {
        lock.lock()
        let waiters = tokenWaiters
        tokenWaiters = []
        lock.unlock()
        waiters.forEach { $0(nil) }
    }

    /// Token actual, o espera a que llegue (pidiéndolo) hasta `timeout`. En el
    /// simulador `didFailToRegister` resuelve nil en el acto.
    func waitForToken(timeout: TimeInterval, completion: @escaping (String?) -> Void) {
        lock.lock()
        if let token = tokenHex {
            lock.unlock()
            completion(token)
            return
        }
        var finished = false
        let once: (String?) -> Void = { token in
            if finished { return }
            finished = true
            completion(token)
        }
        tokenWaiters.append(once)
        lock.unlock()
        registerForRemoteNotifications()
        // Tope: si APNs no contesta (sin red, simulador sin fallo explícito) se resuelve nil;
        // `once` ignora la segunda llamada si el token llegó antes
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { once(nil) }
    }

    func takeInitialNotification() -> [AnyHashable: Any]? {
        lock.lock()
        defer { lock.unlock() }
        let initial = pendingInitial
        pendingInitial = nil
        return initial
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let userInfo = notification.request.content.userInfo
        emitter?.emit(event: "QPPushForeground", body: ["userInfo": QPPushCenter.sanitize(userInfo)])
        // Con la app delante JS la presenta (toast + sonido propio); nada de banner
        completionHandler([])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        defer { completionHandler() }
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
        let userInfo = QPPushCenter.sanitize(response.notification.request.content.userInfo)
        if let emitter = emitter, emitter.emit(event: "QPPushOpened", body: ["userInfo": userInfo]) { return }
        lock.lock()
        pendingInitial = userInfo
        lock.unlock()
    }

    // MARK: - Helpers

    /// Solo tipos que cruzan el bridge (String/Number/Bool/Array/Dictionary).
    static func sanitize(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (key, value) in userInfo {
            guard let name = key as? String else { continue }
            out[name] = sanitizeValue(value)
        }
        return out
    }

    private static func sanitizeValue(_ value: Any) -> Any {
        switch value {
        case let string as String: return string
        case let number as NSNumber: return number
        case let dict as [AnyHashable: Any]: return sanitize(dict)
        case let array as [Any]: return array.map { sanitizeValue($0) }
        default: return String(describing: value)
        }
    }

    /// Entorno APNs del build, leído del perfil de aprovisionamiento embebido
    /// (`aps-environment`): Xcode/TestFlight llevan uno; la App Store no lo embebe
    /// (= production). Es lo que decide a qué servidor de Apple manda el backend:
    /// un token de sandbox contra production (o al revés) es `BadDeviceToken`.
    static func apnsEnvironment() -> String {
        #if targetEnvironment(simulator)
        return "sandbox"
        #else
        guard let path = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
              let data = FileManager.default.contents(atPath: path) else {
            return "production"
        }
        // CMS binario con el plist XML dentro: el XML es ASCII y sobrevive a la decodificación
        let text = String(decoding: data, as: UTF8.self)
        if let keyRange = text.range(of: "<key>aps-environment</key>") {
            let tail = text[keyRange.upperBound...]
            if let open = tail.range(of: "<string>"), let close = tail.range(of: "</string>"), open.upperBound <= close.lowerBound {
                let value = tail[open.upperBound..<close.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
                return value == "development" ? "sandbox" : "production"
            }
        }
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
        #endif
    }

    static func statusName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .provisional: return "provisional"
        case .ephemeral: return "ephemeral"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notDetermined"
        }
    }
}

/// Módulo que ve JavaScript (push/iosTransport.ts). Emisor de eventos clásico:
/// en la nueva arquitectura va por la capa de interop, como el resto de módulos
/// propios (ScreenBrightness, AppIconChanger).
@objc(QPPush)
final class QPPush: RCTEventEmitter {

    private var listening = false

    override init() {
        super.init()
        QPPushCenter.shared.emitter = self
    }

    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! {
        ["QPPushToken", "QPPushForeground", "QPPushOpened"]
    }

    override func startObserving() { listening = true }
    override func stopObserving() { listening = false }

    /// Emite si JS escucha. Devuelve false si no había nadie (el que llama decide qué guardar).
    @discardableResult
    func emit(event: String, body: [String: Any]) -> Bool {
        guard listening else { return false }
        sendEvent(withName: event, body: body)
        return true
    }

    @objc
    func getPermissionStatus(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            resolve(QPPushCenter.statusName(settings.authorizationStatus))
        }
    }

    @objc
    func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            if granted { QPPushCenter.shared.registerForRemoteNotifications() }
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                resolve(QPPushCenter.statusName(settings.authorizationStatus))
            }
        }
    }

    @objc
    func getToken(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        QPPushCenter.shared.waitForToken(timeout: 10) { token in
            guard let token = token else {
                resolve(nil)
                return
            }
            resolve(["token": token, "environment": QPPushCenter.apnsEnvironment()])
        }
    }

    @objc
    func getInitialNotification(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if let initial = QPPushCenter.shared.takeInitialNotification() {
            resolve(initial)
        } else {
            resolve(nil)
        }
    }

    @objc
    func setBadgeCount(_ count: NSNumber) {
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = count.intValue
        }
    }
}
