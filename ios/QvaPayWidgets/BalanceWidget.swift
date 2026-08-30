import WidgetKit
import SwiftUI

// MARK: - Balance Entry

struct BalanceEntry: TimelineEntry {
    let date: Date
    let balance: Double
    let username: String
    /// Saldo de la cuenta de ahorro. `nil` mientras el puente no lo haya
    /// publicado nunca (instalación nueva o app sin abrir la pantalla de Home).
    let savings: Double?
    let savingsRate: Double
    let isPlaceholder: Bool

    static var placeholder: BalanceEntry {
        BalanceEntry(date: Date(), balance: 0.00, username: "usuario", savings: nil, savingsRate: 3.75, isPlaceholder: true)
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

    /// Lee un objeto JSON guardado por el puente bajo `key` en el App Group.
    private func readJSON(_ defaults: UserDefaults, _ key: String) -> [String: Any]? {
        guard let jsonString = defaults.string(forKey: key),
              let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json
    }

    private func readFromStorage() -> BalanceEntry {
        guard let defaults = UserDefaults(suiteName: BalanceProvider.suiteName),
              let balanceJSON = readJSON(defaults, "balance") else {
            return .placeholder
        }

        // El ahorro llega por una clave APARTE: lo publica otra query, en otro
        // momento, y puede no existir todavía (el tamaño large lo oculta).
        let savingsJSON = readJSON(defaults, "savings")

        return BalanceEntry(
            date: Date(),
            balance: widgetDouble(balanceJSON["balance"]),
            username: balanceJSON["username"] as? String ?? "",
            savings: savingsJSON.map { widgetDouble($0["balance"]) },
            savingsRate: savingsJSON.map { widgetDouble($0["rate"]) } ?? 3.75,
            isPlaceholder: false
        )
    }
}

// MARK: - Paleta

/// Los tokens de `theme/ThemeContext.tsx` resueltos por apariencia. El widget
/// no puede leer el ajuste de tema de la app (vive en AsyncStorage, fuera del
/// App Group), así que sigue la apariencia del sistema — que es además lo que
/// esperan iOS y Android de un widget.
struct QPPalette {
    let background: Color
    let tile: Color
    let primaryText: Color
    let secondaryText: Color
    let successFill: Color
    let successFillText: Color
    let successText: Color
    let pillFill: Color
    let successPillFill: Color
    let divider: Color

    static func resolve(_ scheme: ColorScheme) -> QPPalette {
        scheme == .dark ? .dark : .light
    }

    static let dark = QPPalette(
        background: Color(hex: "#0E0E1C"),
        tile: Color(hex: "#1E2039"),
        primaryText: Color(hex: "#F7F7F7"),
        secondaryText: Color(hex: "#9DA3B4"),
        successFill: Color(hex: "#7BFFB1"),
        successFillText: Color(hex: "#0E0E1C"),
        successText: Color(hex: "#7BFFB1"),
        pillFill: Color(hex: "#9DA3B4").opacity(0.14),
        successPillFill: Color(hex: "#7BFFB1").opacity(0.14),
        divider: Color(hex: "#9DA3B4").opacity(0.16)
    )

    static let light = QPPalette(
        background: Color(hex: "#FFFFFF"),
        tile: Color(hex: "#E8E9F2"),
        primaryText: Color(hex: "#1A1A1A"),
        secondaryText: Color(hex: "#6C757D"),
        // En claro el menta de marca es ilegible sobre blanco: el sólido va
        // oscuro con tinta blanca, igual que `successFill` del tema.
        successFill: Color(hex: "#15803D"),
        successFillText: Color(hex: "#FFFFFF"),
        successText: Color(hex: "#15803D"),
        pillFill: Color(hex: "#E8E9F2"),
        successPillFill: Color(hex: "#15803D").opacity(0.12),
        divider: Color(hex: "#6C757D").opacity(0.20)
    )
}

// MARK: - Tipografía

/// Rubik, la familia de la app. Los .ttf viajan en el bundle de la extensión
/// (fase Resources del target + UIAppFonts de su Info.plist); si faltaran,
/// `Font.custom` cae a la fuente del sistema sin romper nada.
enum QPFont {
    static func black(_ size: CGFloat) -> Font { .custom("Rubik-Black", size: size) }
    static func semiBold(_ size: CGFloat) -> Font { .custom("Rubik-SemiBold", size: size) }
    static func medium(_ size: CGFloat) -> Font { .custom("Rubik-Medium", size: size) }
    static func regular(_ size: CGFloat) -> Font { .custom("Rubik-Regular", size: size) }
}

/// Separador de miles y dos decimales, como `QPBalance` en la app.
private let moneyFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    return formatter
}()

func formattedMoney(_ value: Double) -> String {
    moneyFormatter.string(from: NSNumber(value: value)) ?? "0.00"
}

// MARK: - Destinos

/// Rutas del widget. Todas están declaradas en `linking.ts`; sin esa entrada
/// el toque abre la app y se queda en el Home.
enum QPLink {
    static let home = URL(string: "qvapay://home")
    static let add = URL(string: "qvapay://add")!
    static let withdraw = URL(string: "qvapay://withdraw")!
    static let send = URL(string: "qvapay://send")!
    static let trade = URL(string: "qvapay://p2p")!
    static let savings = URL(string: "qvapay://savings")!
}

// MARK: - Piezas

/// Cabecera: identidad a la izquierda, píldora de contexto a la derecha.
struct WidgetHeader: View {
    let palette: QPPalette
    let title: String
    let pill: String
    var pillTint: Color? = nil
    var pillFill: Color? = nil
    var titleSize: CGFloat = 12

    var body: some View {
        HStack(spacing: 0) {
            Text(title)
                .font(QPFont.medium(titleSize))
                .foregroundColor(palette.secondaryText)
            Spacer(minLength: 6)
            Text(pill)
                .font(QPFont.semiBold(10))
                .foregroundColor(pillTint ?? palette.secondaryText)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(pillFill ?? palette.pillFill)
                .clipShape(Capsule())
        }
    }
}

/// Héroe numérico calcado de `QPBalance` (ui/particles/QPBalance.tsx): el
/// símbolo va en semiBold con la tinta SECUNDARIA y a la mitad del tamaño de
/// las cifras (30 sobre 60 en la app), centrado en vertical contra ellas — no
/// por línea base — y la figura entera centrada, como en el BalanceCard.
struct HeroAmount: View {
    let amount: Double
    let digitSize: CGFloat
    let palette: QPPalette

    /// Proporciones de QPBalance: símbolo a la mitad, separación de 8 sobre 60.
    private var symbolSize: CGFloat { (digitSize * 0.5).rounded() }
    private var gap: CGFloat { max(3, (digitSize * 8 / 60).rounded()) }

    var body: some View {
        HStack(alignment: .center, spacing: gap) {
            Text("$")
                .font(QPFont.semiBold(symbolSize))
                .foregroundColor(palette.secondaryText)
            Text(formattedMoney(amount))
                .font(QPFont.black(digitSize))
                .foregroundColor(palette.primaryText)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }
}

/// Tile de acción de la cuenta: icono arriba, etiqueta abajo, squircle 16.
struct ActionTile: View {
    let symbol: String
    let label: String
    let palette: QPPalette
    var iconSize: CGFloat = 15
    var labelSize: CGFloat = 10
    var height: CGFloat = 52

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: symbol)
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundColor(palette.primaryText)
            Text(label)
                .font(QPFont.medium(labelSize))
                .foregroundColor(palette.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(palette.tile)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Pill de ahorros: relleno sólido con su tinta, icono y texto en fila.
struct SavingsPill: View {
    let symbol: String
    let label: String
    let palette: QPPalette
    var height: CGFloat = 48

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(palette.successFillText)
            Text(label)
                .font(QPFont.semiBold(13))
                .foregroundColor(palette.successFillText)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(palette.successFill)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: - Small

/// En `.systemSmall` WidgetKit IGNORA los `Link`: todo el widget es un único
/// destino. Los tiles se dibujan como indicadores y el toque abre el dashboard.
struct BalanceSmallView: View {
    let entry: BalanceEntry
    let palette: QPPalette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(palette: palette, title: "QvaPay", pill: "QUSD", titleSize: 11)

            Spacer(minLength: 8)

            HeroAmount(amount: entry.balance, digitSize: 24, palette: palette)

            Spacer(minLength: 8)

            HStack(spacing: 8) {
                ActionTile(symbol: "plus", label: "Depositar", palette: palette, iconSize: 14, labelSize: 9, height: 46)
                ActionTile(symbol: "paperplane.fill", label: "Enviar", palette: palette, iconSize: 14, labelSize: 9, height: 46)
            }
        }
    }
}

// MARK: - Medium

struct BalanceMediumView: View {
    let entry: BalanceEntry
    let palette: QPPalette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(palette: palette, title: "QvaPay", pill: "QUSD")

            Spacer(minLength: 10)

            HeroAmount(amount: entry.balance, digitSize: 34, palette: palette)

            Spacer(minLength: 10)

            HStack(spacing: 10) {
                Link(destination: QPLink.add) {
                    ActionTile(symbol: "plus", label: "Depositar", palette: palette)
                }
                Link(destination: QPLink.withdraw) {
                    ActionTile(symbol: "arrow.turn.up.right", label: "Extraer", palette: palette)
                }
                Link(destination: QPLink.send) {
                    ActionTile(symbol: "paperplane.fill", label: "Enviar", palette: palette)
                }
                Link(destination: QPLink.trade) {
                    ActionTile(symbol: "arrow.left.arrow.right", label: "Comerciar", palette: palette)
                }
            }
        }
    }
}

// MARK: - Large

struct BalanceLargeView: View {
    let entry: BalanceEntry
    let palette: QPPalette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(palette: palette, title: "QvaPay", pill: "QUSD", titleSize: 13)

            Spacer(minLength: 12)

            VStack(spacing: 7) {
                HeroAmount(amount: entry.balance, digitSize: 44, palette: palette)
                Text("Balance disponible")
                    .font(QPFont.regular(12))
                    .foregroundColor(palette.secondaryText)
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 14)

            HStack(spacing: 10) {
                Link(destination: QPLink.add) {
                    ActionTile(symbol: "plus", label: "Depositar", palette: palette, iconSize: 16, labelSize: 11, height: 56)
                }
                Link(destination: QPLink.withdraw) {
                    ActionTile(symbol: "arrow.turn.up.right", label: "Extraer", palette: palette, iconSize: 16, labelSize: 11, height: 56)
                }
                Link(destination: QPLink.send) {
                    ActionTile(symbol: "paperplane.fill", label: "Enviar", palette: palette, iconSize: 16, labelSize: 11, height: 56)
                }
                Link(destination: QPLink.trade) {
                    ActionTile(symbol: "arrow.left.arrow.right", label: "Comerciar", palette: palette, iconSize: 16, labelSize: 11, height: 56)
                }
            }

            // El bloque de ahorro solo aparece cuando el puente lo ha publicado:
            // dibujar $0.00 cuando en realidad no hay dato sería mentir.
            if let savings = entry.savings {
                Spacer(minLength: 16)

                Rectangle()
                    .fill(palette.divider)
                    .frame(height: 1)

                Spacer(minLength: 16)

                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Ahorros")
                            .font(QPFont.regular(11))
                            .foregroundColor(palette.secondaryText)
                        Text("$\(formattedMoney(savings))")
                            .font(QPFont.semiBold(20))
                            .foregroundColor(palette.primaryText)
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Text("\(formattedRate(entry.savingsRate))% anual")
                        .font(QPFont.semiBold(11))
                        .foregroundColor(palette.successText)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(palette.successPillFill)
                        .clipShape(Capsule())
                }

                Spacer(minLength: 10)

                HStack(spacing: 10) {
                    Link(destination: QPLink.savings) {
                        SavingsPill(symbol: "arrow.down", label: "Depositar", palette: palette)
                    }
                    Link(destination: QPLink.savings) {
                        SavingsPill(symbol: "arrow.up", label: "Retirar", palette: palette)
                    }
                }
            } else {
                Spacer()
            }
        }
    }

    /// La tasa se enseña sin decimales cuando es entera (3.75% pero 4%).
    private func formattedRate(_ rate: Double) -> String {
        rate == rate.rounded() ? String(format: "%.0f", rate) : String(format: "%.2f", rate)
    }
}

// MARK: - Widget View

struct BalanceWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    let entry: BalanceEntry

    private var palette: QPPalette { QPPalette.resolve(colorScheme) }

    var body: some View {
        content
            .padding(family == .systemLarge ? 16 : 14)
            // Destino de reserva: en small es el ÚNICO (los Link no cuentan);
            // en medium y large cubre el fondo entre tiles.
            .widgetURL(QPLink.home)
            .containerBackground(for: .widget) {
                palette.background
            }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemLarge:
            BalanceLargeView(entry: entry, palette: palette)
        case .systemMedium:
            BalanceMediumView(entry: entry, palette: palette)
        default:
            BalanceSmallView(entry: entry, palette: palette)
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
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Preview

#if DEBUG
private let previewEntry = BalanceEntry(
    date: Date(), balance: 1964.45, username: "erich",
    savings: 842.10, savingsRate: 3.75, isPlaceholder: false
)

#Preview("Balance small", as: .systemSmall) { BalanceWidget() } timeline: { previewEntry }
#Preview("Balance medium", as: .systemMedium) { BalanceWidget() } timeline: { previewEntry }
#Preview("Balance large", as: .systemLarge) { BalanceWidget() } timeline: { previewEntry }
#endif
