import Foundation
import UIKit
import React

/// Cambia el icono de la app entre los alternate icons del asset catalog
/// (feature GOLD "Ícono de la app"). Los nombres de icono son los appiconsets
/// declarados en ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES; "default"
/// (nil para UIKit) es el AppIcon primario. iOS muestra una alerta del
/// sistema en cada cambio — inevitable con API pública.
@objc(AppIconChanger)
class AppIconChanger: NSObject {

    @objc
    func getIcon(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            resolve(UIApplication.shared.alternateIconName ?? "default")
        }
    }

    @objc
    func changeIcon(_ iconName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                reject("UNSUPPORTED", "Alternate icons are not supported on this device", nil)
                return
            }
            let name: String? = iconName == "default" ? nil : iconName
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error {
                    reject("ICON_ERROR", error.localizedDescription, error)
                } else {
                    resolve(true)
                }
            }
        }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
