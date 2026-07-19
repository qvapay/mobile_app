import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// User AuthContext
import { useAuth } from '../../auth/AuthContext'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import TopupCard from './components/TopupCard'
import TopupHistory from './components/TopupHistory'
import TopupPhoneInput from './components/TopupPhoneInput'

// API
import { topupApi } from '../../api/topupApi'

// IAP
import { useIAP } from 'react-native-iap'
import { TOPUP_SKUS, TOPUP_CATALOG, getIAPErrorMessage } from '../../helpers/iap'

// Números móviles cubanos: empiezan con 5, 8 dígitos locales
const CUBAN_MOBILE = /^5\d{7}$/
const RECENT_NUMBERS_KEY = '@topup_recent_numbers'
const MAX_RECENT_NUMBERS = 5
// Teléfono de la compra en vuelo — persiste por si la app muere entre la compra
// y la validación con backend (la compra sin consumir se recupera al reabrir)
const PENDING_PHONE_KEY = '@topup_pending_phone'

/**
 * Mobile top-ups paid through the native store (Google Play Billing / StoreKit)
 * as consumable one-time products: recipient phone + amount cards priced by the
 * store, then the native purchase sheet. The receipt goes to the backend, which
 * verifies it and executes the real top-up; only after the backend confirms is
 * the purchase consumed (finishTransaction isConsumable) so the SKU can be
 * bought again. Pending settlements (carrier billing) are NOT consumed
 * client-side — the backend consumes them server-side once the top-up settles.
 * Unconsumed purchases found on mount (app killed mid-flow) are re-validated
 * against the backend, which is idempotent by transactionId.
 */
const TopupScreen = () => {

	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	const [phoneNumber, setPhoneNumber] = useState('')
	const [selectedSku, setSelectedSku] = useState(TOPUP_SKUS?.[0] || null)
	const [recentNumbers, setRecentNumbers] = useState([])
	const [availability, setAvailability] = useState(null) // null = backend aún no respondió → todo disponible
	const [history, setHistory] = useState([])
	const [historyLoading, setHistoryLoading] = useState(true)
	const [isPurchasing, setIsPurchasing] = useState(false)

	// Teléfono E.164 de la compra en vuelo (el estado puede cambiar durante el sheet nativo)
	const pendingPhoneRef = useRef(null)
	// La recuperación de compras sin consumir corre una sola vez por montaje
	const recoveredRef = useRef(false)

	const phoneDigits = phoneNumber.replace(/\D/g, '')
	const phoneValid = CUBAN_MOBILE.test(phoneDigits)

	const loadHistory = useCallback(async () => {
		const res = await topupApi.getTopupHistory()
		if (res.success) setHistory(res.data?.topups || res.data || [])
		setHistoryLoading(false)
	}, [])

	const saveRecentNumber = useCallback(async (phone) => {
		setRecentNumbers((prev) => {
			const next = [phone, ...prev.filter((p) => p !== phone)].slice(0, MAX_RECENT_NUMBERS)
			AsyncStorage.setItem(RECENT_NUMBERS_KEY, JSON.stringify(next)).catch(() => { })
			return next
		})
	}, [])

	// Valida el receipt con backend y, solo si la recarga se confirma, consume la compra
	const handleValidatedPurchase = useCallback(async (purchase, phoneE164) => {
		const receipt = Platform.OS === 'ios' ? purchase.transactionReceipt : purchase.purchaseToken
		if (!receipt) return

		const result = await topupApi.validateTopupReceipt({
			receipt,
			platform: Platform.OS,
			productId: purchase.productId || purchase.id,
			transactionId: purchase.transactionId || purchase.id || purchase.purchaseToken,
			phoneNumber: phoneE164,
		})

		if (result.success && result.data?.success) {
			const { finishTransaction } = require('react-native-iap')
			await finishTransaction({ purchase, isConsumable: true })
			await AsyncStorage.removeItem(PENDING_PHONE_KEY).catch(() => { })
			const info = TOPUP_CATALOG?.[purchase.productId || purchase.id]
			toast.success('¡Recarga enviada!', {
				description: `${info?.label || 'Tu recarga'} en camino a ${phoneE164 || 'tu número'}`,
			})
			if (phoneE164) saveRecentNumber(phoneE164)
			loadHistory()
		} else if (result.data?.pending || result.status === 202) {
			// NO consumir: el backend consume server-side cuando la recarga se confirme
			toast.info('Recarga en proceso', {
				description: 'Te avisaremos cuando se complete. No se te cobrará dos veces.',
			})
			loadHistory()
		} else {
			toast.error(result.error || result.data?.error || 'No se pudo validar la compra')
		}
	}, [saveRecentNumber, loadHistory])

	const { connected, products, fetchProducts, requestPurchase } = useIAP({
		onPurchaseSuccess: async (purchase) => {
			try {
				const phone = pendingPhoneRef.current || await AsyncStorage.getItem(PENDING_PHONE_KEY)
				await handleValidatedPurchase(purchase, phone)
			} catch (error) {
				toast.error('Error al validar la compra')
			} finally {
				setIsPurchasing(false)
			}
		},
		onPurchaseError: (error) => {
			setIsPurchasing(false)
			const message = getIAPErrorMessage(error)
			if (message) toast.error(message)
		},
	})

	// Precios localizados de la tienda ('in-app', no 'subs')
	useEffect(() => {
		if (connected && TOPUP_SKUS?.length) {
			fetchProducts({ skus: TOPUP_SKUS, type: 'in-app' })
		}
	}, [connected, fetchProducts])

	// Disponibilidad backend + historial + números recientes
	useEffect(() => {
		(async () => {
			const res = await topupApi.getTopupProducts()
			if (res.success && Array.isArray(res.data?.products)) {
				setAvailability(Object.fromEntries(res.data.products.map((p) => [p.productId, p.available !== false])))
			}
		})()
		loadHistory()
		AsyncStorage.getItem(RECENT_NUMBERS_KEY)
			.then((raw) => { if (raw) setRecentNumbers(JSON.parse(raw)) })
			.catch(() => { })
	}, [loadHistory])

	// Compras consumibles huérfanas (app cerrada entre compra y validación):
	// re-validarlas es seguro — el backend es idempotente por transactionId
	useEffect(() => {
		if (!connected || recoveredRef.current) return
		recoveredRef.current = true;
		(async () => {
			try {
				const { getAvailablePurchases } = require('react-native-iap')
				const purchases = await getAvailablePurchases()
				const topupSkus = new Set(TOPUP_SKUS || [])
				const orphaned = (purchases || []).filter((p) => topupSkus.has(p.productId || p.id))
				if (!orphaned.length) return
				const phone = await AsyncStorage.getItem(PENDING_PHONE_KEY)
				await Promise.all(orphaned.map((purchase) => handleValidatedPurchase(purchase, phone)))
			} catch (error) { /* la recuperación es best-effort; el backend consume via RTDN */ }
		})()
	}, [connected, handleValidatedPurchase])

	// Precio localizado por SKU desde la tienda
	const priceForSku = useCallback((sku) => {
		const product = products?.find((p) => (p.id || p.productId) === sku)
		return product?.displayPrice
	}, [products])

	const selectedPrice = selectedSku ? priceForSku(selectedSku) : null

	const skuUnavailable = useCallback((sku) => availability != null && availability[sku] === false, [availability])

	const canBuy = useMemo(
		() => phoneValid && !!selectedSku && connected && !isPurchasing && !skuUnavailable(selectedSku),
		[phoneValid, selectedSku, connected, isPurchasing, skuUnavailable],
	)

	const handleBuy = useCallback(async () => {
		if (!phoneValid) { toast.error('Ingresa un número cubano válido'); return }
		if (!selectedSku) { toast.error('Selecciona un monto'); return }

		const phoneE164 = `+53${phoneDigits}`
		pendingPhoneRef.current = phoneE164
		await AsyncStorage.setItem(PENDING_PHONE_KEY, phoneE164).catch(() => { })

		setIsPurchasing(true)
		try {
			// Vincula la compra al usuario QvaPay para que RTDN pueda mapearla si
			// el webhook de la tienda llega antes que nuestra validación
			const accountId = user?.uuid
			await requestPurchase({
				type: 'in-app',
				request: Platform.OS === 'ios'
					? { apple: { sku: selectedSku, ...(accountId && { appAccountToken: accountId }) } }
					: { google: { skus: [selectedSku], ...(accountId && { obfuscatedAccountId: accountId }) } },
			})
		} catch (error) {
			setIsPurchasing(false)
			const message = getIAPErrorMessage(error)
			if (message) toast.error(message)
		}
	}, [phoneValid, selectedSku, phoneDigits, user?.uuid, requestPurchase])

	const handlePickRecent = useCallback((phone) => {
		setPhoneNumber(String(phone).replace(/^\+53/, ''))
	}, [])

	return (
		<ScrollView
			style={[containerStyles.container, { paddingHorizontal: theme.spacing.md }]}
			contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6, marginBottom: 18, lineHeight: 18 }]}>
				Recarga cualquier móvil de Cuba pagando directo con {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} — sin necesidad de saldo QvaPay.
			</Text>

			<TopupPhoneInput
				phoneNumber={phoneNumber}
				phoneValid={phoneValid}
				onChangePhone={setPhoneNumber}
				recentNumbers={recentNumbers}
				onPickRecent={handlePickRecent}
				theme={theme}
				textStyles={textStyles}
			/>

			<View style={styles.section}>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
					Selecciona el monto
				</Text>
				<View style={styles.cardsGrid}>
					{(TOPUP_SKUS || []).map((sku) => (
						<TopupCard
							key={sku}
							label={TOPUP_CATALOG?.[sku]?.label || sku}
							price={priceForSku(sku)}
							selected={selectedSku === sku}
							unavailable={skuUnavailable(sku)}
							onPress={() => setSelectedSku(sku)}
							theme={theme}
							textStyles={textStyles}
						/>
					))}
				</View>
			</View>

			<QPButton
				icon={Platform.OS === 'ios' ? 'apple' : 'google-play'}
				iconStyle="brand"
				iconColor={theme.colors.buttonText}
				title={isPurchasing ? 'Procesando...' : `Comprar recarga${selectedPrice ? ` ${selectedPrice}` : ''}`}
				onPress={handleBuy}
				disabled={!canBuy}
				loading={isPurchasing}
			/>

			<Text style={[textStyles.caption, { textAlign: 'center', marginTop: theme.spacing.sm, color: theme.colors.tertiaryText, lineHeight: 18 }]}>
				El pago se procesa de forma segura por {Platform.OS === 'ios' ? 'Apple' : 'Google'}. La recarga llega en minutos.
			</Text>

			<TopupHistory
				items={history}
				loading={historyLoading}
				theme={theme}
				textStyles={textStyles}
			/>
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	section: {
		marginBottom: 18,
	},
	cardsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
})

export default TopupScreen
