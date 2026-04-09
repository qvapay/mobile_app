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
        VStack(alignment: .leading, spacing: 0) {
            // Header: QvaPay label + QUSD pill
            HStack {
                Text("QvaPay")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                Text("QUSD")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.7))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.15))
                    .cornerRadius(10)
            }

            Spacer()

            // Balance
            Text(String(format: "$%.2f", entry.balance))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)

            // Label
            Text("Balance actual")
                .font(.system(size: 11))
                .foregroundColor(Color.white.opacity(0.45))
                .padding(.top, 2)

            Spacer()

            // Action buttons: circular + and -
            HStack(spacing: 12) {
                Link(destination: URL(string: "qvapay://add")!) {
                    Circle()
                        .fill(Color(hex: "#7BFFB1").opacity(0.25))
                        .frame(width: 36, height: 36)
                        .overlay(
                            Image(systemName: "plus")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(Color(hex: "#7BFFB1"))
                        )
                }

                Link(destination: URL(string: "qvapay://withdraw")!) {
                    Circle()
                        .fill(Color(hex: "#DB253E").opacity(0.25))
                        .frame(width: 36, height: 36)
                        .overlay(
                            Image(systemName: "minus")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(Color(hex: "#DB253E"))
                        )
                }

                Spacer()
            }
        }
        .padding(14)
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
    BalanceEntry(date: Date(), balance: 1964.45, username: "erich", isPlaceholder: false)
}
#endif
