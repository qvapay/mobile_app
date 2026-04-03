import WidgetKit
import SwiftUI

// MARK: - Balance Entry

struct BalanceEntry: TimelineEntry {
    let date: Date
    let balance: Double
    let username: String
    let isPlaceholder: Bool

    static var placeholder: BalanceEntry {
        BalanceEntry(date: Date(), balance: 0.00, username: "usuario", isPlaceholder: true)
    }
}

// MARK: - Timeline Provider

struct BalanceProvider: TimelineProvider {
    private static let suiteName = "group.com.qvapay"

    func placeholder(in context: Context) -> BalanceEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
        completion(readFromStorage())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void) {
        let entry = readFromStorage()
        // Refresh every 30 minutes (actual data comes from the app writing to shared storage)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func readFromStorage() -> BalanceEntry {
        guard let defaults = UserDefaults(suiteName: BalanceProvider.suiteName),
              let jsonString = defaults.string(forKey: "balance"),
              let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .placeholder
        }

        return BalanceEntry(
            date: Date(),
            balance: json["balance"] as? Double ?? 0.0,
            username: json["username"] as? String ?? "",
            isPlaceholder: false
        )
    }
}

// MARK: - Widget View

struct BalanceWidgetView: View {
    let entry: BalanceEntry

    var body: some View {
        VStack(spacing: 6) {
            // Header
            HStack {
                Image(systemName: "dollarsign.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "#6759EF"))
                Text("QvaPay")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
            }

            Spacer()

            // Balance
            Text(String(format: "$%.2f", entry.balance))
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)

            if !entry.username.isEmpty {
                Text("@\(entry.username)")
                    .font(.system(size: 10))
                    .foregroundColor(Color.white.opacity(0.4))
            }

            Spacer()

            // Action buttons
            HStack(spacing: 8) {
                Link(destination: URL(string: "qvapay://add")!) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 11))
                        Text("Depositar")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color(hex: "#7BFFB1").opacity(0.25))
                    .cornerRadius(8)
                }

                Link(destination: URL(string: "qvapay://withdraw")!) {
                    HStack(spacing: 4) {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 11))
                        Text("Extraer")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color(hex: "#DB253E").opacity(0.25))
                    .cornerRadius(8)
                }
            }
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(hex: "#0E0E1C")
        }
    }
}

// MARK: - Widget Definition

struct BalanceWidget: Widget {
    let kind = "BalanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceProvider()) { entry in
            BalanceWidgetView(entry: entry)
        }
        .configurationDisplayName("Balance")
        .description("Tu balance de QvaPay con acciones rápidas")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Balance", as: .systemSmall) {
    BalanceWidget()
} timeline: {
    BalanceEntry(date: Date(), balance: 1234.56, username: "erich", isPlaceholder: false)
}
#endif
