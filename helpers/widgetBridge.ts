// Bridge to the custom `SharedStorage` native module backing the home-screen
// widgets. iOS writes JSON into the App Group UserDefaults (group.com.qvapay)
// read by the WidgetKit extension; Android writes SharedPreferences and
// refreshes the matching AppWidgets immediately from the native side.
// Every call is a silent no-op when the module isn't available.
import { NativeModules, Platform } from 'react-native'

/** Surface del módulo nativo usada aquí; opcional porque puede no estar linkeado. */
type SharedStorageModule = {
	setWidgetData?: (key: string, value: string) => Promise<void>
	reloadWidgets?: () => Promise<void>
}

const { SharedStorage } = NativeModules as { SharedStorage?: SharedStorageModule }

/**
 * Normaliza un decimal del backend a NUMBER. Los importes viajan como string
 * ("1964.45", ver `Decimal` en types/domain.ts) y el lado nativo de iOS los lee
 * con `as? Double`, que devuelve nil ante un NSString: sin esta conversion el
 * widget pintaba $0.00 para siempre (Android se salvaba de casualidad porque
 * org.json.optDouble si convierte cadenas).
 *
 * @param value - Decimal crudo del backend (string, number o nullish).
 * @returns El numero equivalente, o 0 si no es finito.
 */
const toNumber = (value: unknown): number => {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

/** Subset de una oferta P2P que el widget resume (una oferta completa lo cumple). */
type WidgetP2POffer = {
	uuid?: string
	type?: string
	coin?: string
	amount?: unknown
	receive?: unknown
	status?: unknown
}

/**
 * Pushes the latest balance snapshot to the home-screen widgets.
 * Called from AuthContext after each profile fetch. Non-critical: fails silently.
 * @param balance - Current USD balance; el decimal-string del backend se normaliza a number (defaults to 0).
 * @param username - Owner's username, shown by the widget.
 */
export const updateWidgetBalance = async (balance?: number | string | null, username?: string | null): Promise<void> => {
	try {
		if (SharedStorage?.setWidgetData) {
			await SharedStorage.setWidgetData(
				'balance',
				JSON.stringify({
					balance: toNumber(balance),
					username: username ?? '',
					updatedAt: Date.now(),
				})
			)
		}
	} catch (error) {
		// Widget update is non-critical, fail silently
	}
}

/**
 * Pushes the savings summary to the home-screen widgets (the LARGE balance
 * widget paints a savings block under the account actions).
 *
 * Va en una clave APARTE de `balance` a proposito: el resumen de ahorro lo
 * sirve otra query, llega en otro momento y puede no existir nunca — el widget
 * oculta el bloque mientras la clave falte, en vez de pintar un $0.00 falso.
 * Non-critical: fails silently.
 *
 * @param balance - Saldo de la cuenta de ahorro (admite el decimal-string del backend).
 * @param rate - Tasa anual en porcentaje (3.75 = 3.75%).
 */
export const updateWidgetSavings = async (balance?: number | string | null, rate?: number | string | null): Promise<void> => {
	try {
		if (SharedStorage?.setWidgetData) {
			await SharedStorage.setWidgetData(
				'savings',
				JSON.stringify({
					balance: toNumber(balance),
					rate: toNumber(rate),
					updatedAt: Date.now(),
				})
			)
		}
	} catch (error) {
		// Widget update is non-critical, fail silently
	}
}

/**
 * Pushes a trimmed summary of the user's P2P offers to the home-screen widgets
 * (first 5 offers, key fields only con los importes normalizados a number, plus the total count).
 * Called from the P2P screen after fetching the user's offers. Non-critical: fails silently.
 * @param offers - Full offer objects; reduced to uuid/type/coin/amount/receive/status.
 */
export const updateWidgetP2POffers = async (offers: WidgetP2POffer[] | null | undefined): Promise<void> => {
	try {
		if (SharedStorage?.setWidgetData) {
			const summary = (offers || []).slice(0, 5).map(o => ({
				uuid: o.uuid,
				type: o.type,
				coin: o.coin,
				amount: toNumber(o.amount),
				receive: toNumber(o.receive),
				status: o.status,
			}))
			await SharedStorage.setWidgetData(
				'p2p_offers',
				JSON.stringify({
					count: offers?.length ?? 0,
					offers: summary,
					updatedAt: Date.now(),
				})
			)
		}
	} catch (error) {
		// Widget update is non-critical, fail silently
	}
}

/**
 * Forces the widgets to refresh their display (WidgetCenter.reloadAllTimelines).
 * iOS only — on Android setWidgetData already triggers the widget update natively.
 */
export const reloadWidgets = async (): Promise<void> => {
	try {
		if (Platform.OS === 'ios' && SharedStorage?.reloadWidgets) {
			await SharedStorage.reloadWidgets()
		}
	} catch (error) {
		// Non-critical
	}
}
