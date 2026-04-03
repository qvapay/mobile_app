import WidgetKit
import SwiftUI

// MARK: - P2P Offers Models

struct P2POfferData {
    let uuid: String
    let type: String  // "buy" or "sell"
    let coin: String
    let amount: Double
    let receive: Double
    let status: String
}

struct P2POffersEntry: TimelineEntry {
    let date: Date
    let count: Int
    let offers: [P2POfferData]
    let isPlaceholder: Bool

    static var placeholder: P2POffersEntry {
        P2POffersEntry(date: Date(), count: 0, offers: [], isPlaceholder: true)
    }
}

// MARK: - Timeline Provider

struct P2POffersProvider: TimelineProvider {
    private static let suiteName = "group.com.qvapay"

    func placeholder(in context: Context) -> P2POffersEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (P2POffersEntry) -> Void) {
        completion(readFromStorage())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<P2POffersEntry>) -> Void) {
        let entry = readFromStorage()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func readFromStorage() -> P2POffersEntry {
        guard let defaults = UserDefaults(suiteName: P2POffersProvider.suiteName),
              let jsonString = defaults.string(forKey: "p2p_offers"),
              let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .placeholder
        }

        let count = json["count"] as? Int ?? 0
        let offersArray = json["offers"] as? [[String: Any]] ?? []

        let offers = offersArray.map { item in
            P2POfferData(
                uuid: item["uuid"] as? String ?? "",
                type: item["type"] as? String ?? "",
                coin: item["coin"] as? String ?? "",
                amount: item["amount"] as? Double ?? 0,
                receive: item["receive"] as? Double ?? 0,
                status: item["status"] as? String ?? ""
            )
        }

        return P2POffersEntry(date: Date(), count: count, offers: offers, isPlaceholder: false)
    }
}

// MARK: - Widget View

struct P2POffersWidgetView: View {
    let entry: P2POffersEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header
            HStack {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: "#6759EF"))
                Text("Mis Ofertas P2P")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                if entry.count > 0 {
                    Text("\(entry.count)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(hex: "#6759EF"))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(hex: "#6759EF").opacity(0.2))
                        .cornerRadius(8)
                }
            }
            .padding(.bottom, 2)

            if entry.offers.isEmpty {
                Spacer()
                HStack {
                    Spacer()
                    VStack(spacing: 4) {
                        Image(systemName: "tray")
                            .font(.system(size: 20))
                            .foregroundColor(Color.white.opacity(0.3))
                        Text("Sin ofertas activas")
                            .font(.system(size: 11))
                            .foregroundColor(Color.white.opacity(0.4))
                    }
                    Spacer()
                }
                Spacer()
            } else {
                ForEach(Array(entry.offers.prefix(4).enumerated()), id: \.offset) { _, offer in
                    Link(destination: URL(string: "qvapay://p2p/\(offer.uuid)")!) {
                        HStack(spacing: 6) {
                            // Type badge
                            Text(offer.type == "buy" ? "C" : "V")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 18, height: 18)
                                .background(offer.type == "buy" ? Color(hex: "#7BFFB1") : Color(hex: "#DB253E"))
                                .cornerRadius(4)

                            // Coin
                            Text(CoinPair.displayNames[offer.coin] ?? offer.coin)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white)
                                .frame(width: 55, alignment: .leading)

                            Spacer()

                            // Amount
                            Text(String(format: "$%.2f", offer.amount))
                                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                .foregroundColor(.white)

                            // Status dot
                            Circle()
                                .fill(statusColor(offer.status))
                                .frame(width: 6, height: 6)
                        }
                        .padding(.vertical, 2)
                    }
                }
                Spacer(minLength: 0)
            }

            if !entry.isPlaceholder {
                Text(entry.date, style: .time)
                    .font(.system(size: 8))
                    .foregroundColor(Color.white.opacity(0.3))
            }
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(hex: "#0E0E1C")
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "open": return Color(hex: "#7BFFB1")
        case "processing": return Color(hex: "#ff9f43")
        case "paid": return Color(hex: "#6759EF")
        case "completed": return Color(hex: "#7BFFB1")
        default: return Color.white.opacity(0.3)
        }
    }
}

// MARK: - Widget Definition

struct P2POffersWidget: Widget {
    let kind = "P2POffersWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: P2POffersProvider()) { entry in
            P2POffersWidgetView(entry: entry)
        }
        .configurationDisplayName("Ofertas P2P")
        .description("Tus ofertas activas en el P2P de QvaPay")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Offers", as: .systemMedium) {
    P2POffersWidget()
} timeline: {
    P2POffersEntry(
        date: Date(),
        count: 3,
        offers: [
            P2POfferData(uuid: "1", type: "buy", coin: "BANK_CUP", amount: 50.0, receive: 5000, status: "open"),
            P2POfferData(uuid: "2", type: "sell", coin: "ZELLE", amount: 100.0, receive: 95, status: "processing"),
            P2POfferData(uuid: "3", type: "buy", coin: "BANK_MLC", amount: 25.0, receive: 600, status: "paid"),
        ],
        isPlaceholder: false
    )
}
#endif
