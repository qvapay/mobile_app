import Foundation
import UIKit
import React

/// Sube el brillo de la pantalla al máximo mientras se enseña un QR y lo
/// devuelve a su valor al salir. En iOS `UIScreen.brightness` es un ajuste del
/// SISTEMA (sobrevive al cierre de la app hasta que se bloquea el teléfono), así
/// que el módulo guarda el valor previo y además escucha el ciclo de vida: al
/// pasar a segundo plano devuelve el brillo original y al volver lo vuelve a
/// subir si el QR sigue en pantalla. `boost` es idempotente (solo guarda el
/// valor la primera vez) y `restore` sin `boost` previo no hace nada.
@objc(ScreenBrightness)
class ScreenBrightness: NSObject {

    /// Brillo previo al boost; nil = no hay boost activo.
    private var saved: CGFloat? = nil

    override init() {
        super.init()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(onResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(onBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private var screen: UIScreen {
        // UIScreen.main está deprecado desde iOS 16; la escena activa es la fuente buena
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return (scenes.first { $0.activationState == .foregroundActive } ?? scenes.first)?.screen ?? UIScreen.main
    }

    @objc
    func boost(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            if self.saved == nil { self.saved = self.screen.brightness }
            self.screen.brightness = 1.0
            resolve(true)
        }
    }

    @objc
    func restore(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            if let previous = self.saved {
                self.screen.brightness = previous
                self.saved = nil
            }
            resolve(true)
        }
    }

    /// Segundo plano: el brillo original vuelve, pero `saved` se conserva para
    /// que un `restore` posterior siga siendo correcto y `onBecomeActive` sepa
    /// que hay que volver a subirlo.
    @objc
    private func onResignActive() {
        if let previous = saved { screen.brightness = previous }
    }

    @objc
    private func onBecomeActive() {
        if saved != nil { screen.brightness = 1.0 }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
