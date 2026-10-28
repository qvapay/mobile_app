import UserNotifications

/// Notification Service Extension propia (sin dependencias): si la push trae
/// `image` (URL https en la raíz del payload, junto a `aps`) la descarga y la
/// adjunta para que iOS la pinte en la notificación. Exige `mutable-content: 1`
/// en el `aps` que manda qpweb; sin él la extensión ni se ejecuta.
///
/// Si no hay imagen, la descarga falla o se acaba el tiempo (~30 s), la
/// notificación se entrega tal cual: la imagen es un adorno, nunca un bloqueo.
final class NotificationService: UNNotificationServiceExtension {

    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?
    private var task: URLSessionDownloadTask?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

        guard let content = bestAttempt,
              let imageString = request.content.userInfo["image"] as? String,
              let url = URL(string: imageString),
              url.scheme?.lowercased() == "https" else {
            contentHandler(request.content)
            return
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 25
        let session = URLSession(configuration: configuration)

        task = session.downloadTask(with: url) { [weak self] location, response, _ in
            guard let self = self else { return }
            defer { self.finish() }
            guard let location = location,
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
            let ext = NotificationService.fileExtension(for: http.mimeType, url: url)
            let target = FileManager.default.temporaryDirectory.appendingPathComponent("qp-push-\(UUID().uuidString).\(ext)")
            do {
                try FileManager.default.moveItem(at: location, to: target)
                let attachment = try UNNotificationAttachment(identifier: "image", url: target, options: nil)
                content.attachments = [attachment]
            } catch {
                // Sin adjunto: se entrega el texto
            }
        }
        task?.resume()
    }

    override func serviceExtensionTimeWillExpire() {
        task?.cancel()
        finish()
    }

    /// Entrega UNA vez (la descarga y el aviso de tiempo pueden coincidir).
    private func finish() {
        guard let handler = contentHandler, let content = bestAttempt else { return }
        contentHandler = nil
        handler(content)
    }

    /// iOS decide el tipo del adjunto por la extensión del fichero.
    private static func fileExtension(for mimeType: String?, url: URL) -> String {
        switch mimeType?.lowercased() {
        case "image/png": return "png"
        case "image/gif": return "gif"
        case "image/jpeg", "image/jpg": return "jpg"
        case "image/webp": return "webp"
        default:
            let ext = url.pathExtension.lowercased()
            return ["png", "gif", "jpg", "jpeg", "webp"].contains(ext) ? ext : "jpg"
        }
    }
}
