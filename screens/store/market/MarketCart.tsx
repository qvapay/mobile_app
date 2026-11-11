import { useState, useEffect, useMemo, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContentPadding from '../../../hooks/useContentPadding'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Contexts
import { useAuth } from '../../../auth/AuthContext'
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles, scaleType } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import AddressPicker from '../../../ui/store/AddressPicker'
import NewAddressForm from '../../../ui/store/NewAddressForm'
import OfacAttestationModal from '../../../ui/OfacAttestationModal'
import { useModalGate } from '../../../ui/useModalGate'
import { formatAddress, EMPTY_ADDRESS_FORM, formFromSavedAddress, validateAddress, validateCubaAddress } from '../../../ui/store/shippingAddress'
import { cubaAddressNeedsCompletion } from '../../../ui/store/cubaAddress'
import MarketCartShopGroup from './MarketCartShopGroup'
import PixMethodPicker from '../pix/PixMethodPicker'

// Routes & API
import { ROUTES } from '../../../routes'
import { marketApi } from '../../../api/marketApi'
import { shopApi } from '../../../api/shopApi'

// Cart core
import useMarketCart from './useMarketCart'
import useCartCheckout from './useCartCheckout'
import usePixPayment from '../pix/usePixPayment'
import { buildMarketPixBody, cartAddressIssue, cartCubaCoverage, enrichCartItems, groupByShop, isPixPayableCart, pickShippingAddress, requiredCountries } from './marketCheckout'

import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { RootStackParamList } from '../../../types/navigation'
import type { AddressCountry, AddressForm, ShippingAddress } from '../../../ui/store/shippingAddress'
import type { CartLineStatus, FreshProduct, ShippableAddress, ShippingChoice } from './marketCheckout'

/**
 * Estado del bloque de envío. `choice` null = el usuario aún no eligió y manda la preselección
 * (la predeterminada si sirve para el carrito, si no la primera que sirva); `country` null = el
 * país del formulario nuevo lo decide el carrito (Cuba si alguna tienda entrega allí).
 */
type ShippingState = { choice: ShippingChoice | null, form: AddressForm, country: AddressCountry | null }

/** Acciones del reducer de envío. */
type ShippingAction =
	| { type: 'selectSaved', uuid: string }
	| { type: 'useNew' }
	| { type: 'complete', address: ShippingAddress }
	| { type: 'setForm', value: AddressForm | ((prev: AddressForm) => AddressForm) }
	| { type: 'setCountry', value: AddressCountry }

const money = (v: number | string | null | undefined) => `$${Number(v || 0).toFixed(2)}`

function shippingReducer(state: ShippingState, action: ShippingAction): ShippingState {
	// El formulario de completar trae los datos de otra dirección: no pasan a una nueva
	const leavingEdit = state.choice?.kind === 'edit'
	switch (action.type) {
		case 'selectSaved': return { ...state, choice: { kind: 'saved', uuid: action.uuid }, form: leavingEdit ? EMPTY_ADDRESS_FORM : state.form }
		case 'useNew': return { ...state, choice: { kind: 'new' }, form: leavingEdit ? EMPTY_ADDRESS_FORM : state.form }
		case 'complete': return { ...state, choice: { kind: 'edit', uuid: action.address.uuid }, form: formFromSavedAddress(action.address) }
		case 'setForm': return { ...state, form: typeof action.value === 'function' ? action.value(state.form) : action.value }
		// Otro país invalida estado, ciudad y código postal (formatos distintos)
		case 'setCountry': return { ...state, country: action.value, form: { ...state.form, state: '', city: '', postal_code: '' } }
		default: return state
	}
}

type ConfirmModalProps = {
	visible: boolean
	paying: boolean
	total: number
	count: number
	addressSummary: string
	onPay: () => void
	onClose: () => void
	theme: Theme
	textStyles: TextStyles
}

// Purchase confirmation — centered card modal (house pattern). Con puerta (`useModalGate`): la
// atestación OFAC puede abrirse justo después y espera a que este termine de irse
const ConfirmModal = ({ visible, paying, total, count, addressSummary, onPay, onClose, theme, textStyles }: ConfirmModalProps) => {
	const { t } = useTranslation()
	const containerStyles = createContainerStyles(theme)
	const gate = useModalGate(visible)
	if (!gate.mounted) return null
	return (
		<Modal visible={gate.visible} onShow={gate.onShow} onDismiss={gate.onDismiss} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!paying) onClose() }}>
			<Pressable style={containerStyles.modalOverlay} onPress={() => !paying && onClose()}>
				<Pressable style={containerStyles.modalCard} onPress={() => { }}>
					<View style={[styles.confirmIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
						<FontAwesome6 name="cart-shopping" size={22} color={theme.colors.primary} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h4, { fontWeight: '600', textAlign: 'center', marginTop: 12 }]}>{t('market.cart.confirm.title')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8, lineHeight: scaleType(theme, 18) }]}>
						{t('market.cart.confirm.body', { amount: money(total), count })}
					</Text>
					{!!addressSummary && (
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, textAlign: 'center', marginTop: 6, lineHeight: scaleType(theme, 18) }]} numberOfLines={3}>
							{t('market.cart.confirm.shippingTo', { address: addressSummary })}
						</Text>
					)}
					<QPButton title={t('market.cart.payAmount', { amount: money(total) })} onPress={onPay} loading={paying} style={{ marginTop: 18 }} />
					<Pressable style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => !paying && onClose()}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('common.actions.cancel')}</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

/**
 * Marketplace cart + checkout, the mobile mirror of the web's cart-client:
 * items live in AsyncStorage (marketCartStore) as display snapshots, get
 * batch-revalidated against `GET /shop/products` on mount/focus, and payment
 * creates ONE order per line (sequential `POST /market/order`, idempotency
 * key per line reused on retries, 429 retried with backoff). Failed lines
 * stay in the cart with their error inline; an insufficient-balance error
 * aborts the remaining lines. Physical items require a shipping address
 * (shared AddressPicker / NewAddressForm): in the US, or in Cuba for the stores
 * that deliver there, with a municipality they cover and the recipient's ID
 * card. A saved Cuban address missing data is completed in place (PATCH).
 */
const MarketCart = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'MarketCart'>) => {

	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(30, 8)

	const { items, remove, setQty, clear } = useMarketCart()

	// null = revalidando (o sin red); mapa uuid → producto fresco al resolver
	const [freshMap, setFreshMap] = useState<Record<string, FreshProduct> | null>(null)
	const [offline, setOffline] = useState(false)
	const [confirmVisible, setConfirmVisible] = useState(false)
	// key → 'paying' | 'done' | { error }. Vive aquí porque `enrichCartItems` lo lee.
	const [statuses, setStatuses] = useState<Record<string, CartLineStatus>>({})

	const [addresses, setAddresses] = useState<ShippingAddress[]>([])
	const [addressesLoaded, setAddressesLoaded] = useState(false)
	const [shipping, dispatchShipping] = useReducer(shippingReducer, { choice: null, form: EMPTY_ADDRESS_FORM, country: null })
	const { form } = shipping

	// Revalidación batch al montar, al volver al foco y cuando cambia el set.
	// En fallo de red NO se marca nada como 'gone': banner + pago bloqueado.
	const uuidsCsv = useMemo(() => [...new Set(items.map(i => i.product_uuid))].sort().join(','), [items])
	const revalidate = useCallback(async () => {
		if (!uuidsCsv) return
		const res = await marketApi.getProductsBatch(uuidsCsv.split(','))
		if (res.success) {
			// `marketApi.getProductsBatch` devuelve `unknown`: el lote es `{ products }`
			const map: Record<string, FreshProduct> = {}
			for (const p of (res.data as { products?: FreshProduct[] } | undefined)?.products || []) map[p.uuid as string] = p
			setFreshMap(map)
			setOffline(false)
		} else {
			setFreshMap(null)
			setOffline(true)
		}
	}, [uuidsCsv])

	useEffect(() => { revalidate() }, [revalidate])
	useEffect(() => {
		const unsubscribe = navigation.addListener('focus', revalidate)
		return unsubscribe
	}, [navigation, revalidate])

	// Lo que exigen las líneas a la dirección, sin dirección elegida todavía: país, provincias
	// y municipios que cubren, y por qué una dirección guardada no les sirve
	const baseEntries = useMemo(() => enrichCartItems(items, freshMap, null, statuses), [items, freshMap, statuses])
	const countriesNeeded = useMemo(() => requiredCountries(baseEntries), [baseEntries])
	const needsCuba = countriesNeeded.includes('CU')
	const coverage = useMemo(() => cartCubaCoverage(baseEntries), [baseEntries])
	const addressIssue = useCallback((a: ShippableAddress) => cartAddressIssue(baseEntries, a), [baseEntries])
	// «Completar dirección» solo tiene sentido si el carrito entrega en Cuba
	const completable = useCallback((a: ShippingAddress) => needsCuba && cubaAddressNeedsCompletion(a), [needsCuba])
	const formCountry: AddressCountry = shipping.country ?? (needsCuba ? 'CU' : 'US')

	// Preselección mientras el usuario no elija: se recalcula al llegar los datos frescos
	const autoPick = useMemo(() => pickShippingAddress(addresses, addressIssue, completable), [addresses, addressIssue, completable])
	const choice: ShippingChoice | null = shipping.choice ?? (autoPick ? { kind: 'saved', uuid: autoPick.uuid } : addressesLoaded ? { kind: 'new' } : null)
	const savedUuid = choice && choice.kind !== 'new' ? choice.uuid : null
	const selectedSaved = savedUuid ? addresses.find(a => a.uuid === savedUuid) || null : null
	const choiceKind = choice?.kind ?? null
	const selectedAddress = useMemo(() => {
		if (choiceKind === 'new') return { ...form, country: formCountry }
		if (choiceKind === 'edit') return selectedSaved ? { ...selectedSaved, ...form, country: 'CU' } : null
		return selectedSaved
	}, [choiceKind, form, formCountry, selectedSaved])

	// Ítems enriquecidos con el estado fresco
	const enriched = useMemo(
		() => enrichCartItems(items, freshMap, selectedAddress, statuses),
		[items, freshMap, selectedAddress, statuses],
	)

	// Ajuste automático de cantidades que exceden el stock fresco
	useEffect(() => {
		if (!freshMap) return
		for (const e of enriched) {
			if (!e.problem && (Number(e.item.qty) || 1) > e.maxQty) setQty(e.key, e.maxQty)
		}
	}, [freshMap, enriched, setQty])

	const payable = enriched.filter(e => !e.problem && e.status !== 'done')
	const unavailable = enriched.filter(e => e.problem)
	const failedCount = enriched.filter(e => typeof e.status === 'object' && e.status?.error).length
	const anyPhysical = payable.some(e => e.isPhysical)
	const anyShipBlocked = payable.some(e => e.shipBlocked)

	const mixedCountries = countriesNeeded.length > 1

	// Direcciones: solo cuando hay físicos en el carrito (la elegida la deriva `autoPick`)
	useEffect(() => {
		if (!anyPhysical || addressesLoaded) return
		let cancelled = false
		;(async () => {
			const res = await shopApi.getShippingAddresses()
			if (cancelled || !res.success) return
			// `shopApi.getShippingAddresses` devuelve `unknown`: solo se lee `addresses`
			setAddresses((res.data as { addresses?: ShippingAddress[] } | undefined)?.addresses || [])
			setAddressesLoaded(true)
		})()
		return () => { cancelled = true }
	}, [anyPhysical, addressesLoaded])

	const formError = useMemo(() => {
		if (choiceKind === 'new') return validateAddress(form, formCountry)
		if (choiceKind === 'edit') return validateCubaAddress(form)
		return null
	}, [choiceKind, form, formCountry])
	const addressReady = !anyPhysical || (choiceKind === 'new' || choiceKind === 'edit' ? !formError : !!selectedSaved)

	// Al pagar, la preselección pasa a ser la elección: si no, cada línea cobrada cambia lo que el
	// carrito exige y otra dirección podría ganar a mitad del pago o en el reintento
	const pinAddress = () => {
		if (!shipping.choice && choice?.kind === 'saved') dispatchShipping({ type: 'selectSaved', uuid: choice.uuid })
	}

	const total = payable.reduce((sum, e) => sum + e.unitPrice * e.qty, 0)
	const balance = Number(user?.balance || 0)
	const enoughBalance = balance >= total
	const revalidating = freshMap === null && !offline && items.length > 0

	// Checkout: una orden por línea, secuencial e idempotente
	const { paying, succeededCount, payAll, resolveAddress, ofacModalProps } = useCartCheckout({
		payable, anyPhysical, choice, form, country: formCountry, navigation, setStatuses,
		remove, revalidate,
		onAddressSaved: (address) => {
			setAddresses(prev => (prev.some(a => a.uuid === address.uuid) ? prev.map(a => (a.uuid === address.uuid ? address : a)) : [...prev, address]))
			dispatchShipping({ type: 'selectSaved', uuid: address.uuid })
		},
	})

	// PIX: UN cobro por todo el carrito. El carrito no cotiza el envío y el servidor sí lo cobra, así
	// que con físicos el precio en reales es una estimación hasta generar el QR
	const pix = usePixPayment({
		surface: 'market',
		base: total,
		enabled: payable.length > 0,
		excluded: !isPixPayableCart(payable),
		estimate: anyPhysical,
		cartKeys: payable.map(e => e.key),
		buildBody: async () => {
			const address = await resolveAddress()
			return address ? buildMarketPixBody(payable, address.uuid) : null
		},
	})

	const canCheckout = !paying && !pix.starting && !revalidating && !offline && payable.length > 0 && addressReady && !anyShipBlocked
	const canPay = canCheckout && enoughBalance

	// ── Vacío ──
	if (items.length === 0) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<Text style={{ fontSize: 44 }}>🛒</Text>
				<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 12 }]}>{t('market.cart.empty.title')}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]}>
					{t('market.cart.empty.subtitle')}
				</Text>
				{succeededCount > 0 && (
					<Pressable onPress={() => navigation.replace(ROUTES.MARKET_ORDERS)} style={{ marginTop: 10 }}>
						<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>{t('market.cart.empty.seeOrders')}</Text>
					</Pressable>
				)}
				<QPButton
					title={t('market.cart.empty.explore')}
					onPress={() => navigation.navigate(ROUTES.MARKET_STORES)}
					style={{ marginTop: 20, width: 220 }}
				/>
			</View>
		)
	}

	const byShop = groupByShop(enriched)
	const addressSummary = anyPhysical && selectedAddress?.line1 ? formatAddress(selectedAddress) : ''

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				{revalidating && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 10 }]}>
						{t('market.cart.revalidating')}
					</Text>
				)}
				{offline && (
					<View style={[styles.banner, { backgroundColor: `${theme.colors.warning}1A` }]}>
						<Text style={[textStyles.caption, { color: theme.colors.warning }]}>
							{t('market.cart.offlineBanner')}
						</Text>
						<Pressable onPress={revalidate} style={{ marginTop: 6 }}>
							<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>{t('common.actions.retry')}</Text>
						</Pressable>
					</View>
				)}

				{/* Grupos por tienda */}
				<View style={{ gap: 14 }}>
					{byShop.map(group => (
						<MarketCartShopGroup
							key={group.name}
							group={group}
							paying={paying}
							onSetQty={setQty}
							onRemove={remove}
							navigation={navigation}
							money={money}
							theme={theme}
							textStyles={textStyles}
						/>
					))}
				</View>

				{/* Dirección de envío (solo con físicos) */}
				{anyPhysical && (
					<View style={{ marginTop: 20 }}>
						<Text style={[textStyles.h5, { fontWeight: '600' }]}>{t('market.cart.shippingAddress')}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>
							{t('market.cart.shippingAddressHint')}
						</Text>
						<AddressPicker
							addresses={addresses}
							useNewAddress={choiceKind === 'new'}
							selectedUuid={savedUuid}
							onSelectAddress={(uuid) => dispatchShipping({ type: 'selectSaved', uuid })}
							onNewAddress={() => dispatchShipping({ type: 'useNew' })}
							issueFor={addressIssue}
							needsCompletion={completable}
							onComplete={(uuid) => {
								const address = addresses.find(a => a.uuid === uuid)
								if (address) dispatchShipping({ type: 'complete', address })
							}}
							editingUuid={choiceKind === 'edit' ? savedUuid : null}
							theme={theme}
							textStyles={textStyles}
						/>
						{choiceKind === 'new' && (
							<NewAddressForm
								form={form}
								onChange={(value) => dispatchShipping({ type: 'setForm', value })}
								country={formCountry}
								onCountryChange={(value) => dispatchShipping({ type: 'setCountry', value })}
								provinces={coverage.provinces}
								municipalities={coverage.municipalities}
							/>
						)}
						{choiceKind === 'edit' && (
							<View style={styles.completeBlock}>
								<Text style={[textStyles.h6, styles.completeTitle]}>{t('market.cart.completeAddress.title')}</Text>
								<Text style={[textStyles.caption, styles.completeSubtitle, { color: theme.colors.secondaryText }]}>{t('market.cart.completeAddress.subtitle')}</Text>
								<NewAddressForm
									form={form}
									onChange={(value) => dispatchShipping({ type: 'setForm', value })}
									country="CU"
									provinces={coverage.provinces}
									municipalities={coverage.municipalities}
								/>
							</View>
						)}
					</View>
				)}

				{/* Resumen */}
				<View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
							{t('market.common.products', { count: payable.length })}
						</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(total)}</Text>
					</View>
					<View style={[styles.summaryRow, styles.totalRow, { borderTopColor: `${theme.colors.secondaryText}33` }]}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>{t('market.common.total')}</Text>
						<Text style={[textStyles.h5, { fontWeight: '600', color: theme.colors.primary }]}>{money(total)}</Text>
					</View>
					<View style={[styles.summaryRow, { marginTop: 6 }]}>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('market.cart.availableBalance')}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '600' }]}>{money(balance)}</Text>
					</View>

					{!enoughBalance && !pix.selected && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
							{t('market.cart.insufficientBalance')}
						</Text>
					)}
					{unavailable.length > 0 && (
						<Text style={[textStyles.caption, { color: theme.colors.warning, marginTop: 8 }]}>
							{t('market.cart.unavailable', { count: unavailable.length })}
						</Text>
					)}
					{anyPhysical && !addressReady && (
						<Text style={[textStyles.caption, { color: theme.colors.warning, marginTop: 8 }]}>
							{formError || t('market.cart.chooseAddress')}
						</Text>
					)}
					{anyShipBlocked && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
							{mixedCountries ? t('market.cart.mixedCountries') : t('market.cart.shipBlockedSummary')}
						</Text>
					)}
				</View>

				<PixMethodPicker pix={pix} balance={balance} />

				{pix.selected
					? <QPButton title={pix.payLabel} onPress={() => { pinAddress(); pix.pay() }} loading={pix.starting} disabled={!canCheckout} style={{ marginTop: 16 }} testID="pix-pay" />
					: (
						<QPButton
							title={paying ? t('market.cart.processingPurchases') : failedCount > 0 ? t('market.cart.retryPayment', { failed: failedCount }) : t('market.cart.payAmount', { amount: money(total) })}
							icon="lock"
							onPress={() => { pinAddress(); setConfirmVisible(true) }}
							loading={paying}
							disabled={!canPay}
							style={{ marginTop: 16 }}
						/>
					)}

				<Pressable disabled={paying} onPress={clear} style={{ marginTop: 12, alignSelf: 'center' }}>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('market.cart.clearCart')}</Text>
				</Pressable>
			</ScrollView>

			<ConfirmModal
				visible={confirmVisible}
				paying={paying}
				total={total}
				count={payable.length}
				addressSummary={addressSummary}
				onPay={() => { setConfirmVisible(false); payAll() }}
				onClose={() => setConfirmVisible(false)}
				theme={theme}
				textStyles={textStyles}
			/>
			<OfacAttestationModal {...ofacModalProps} />
		</View>
	)
}

const styles = StyleSheet.create({
	completeBlock: {
		marginTop: 16,
	},
	completeTitle: {
		fontWeight: '600',
	},
	completeSubtitle: {
		marginTop: 4,
	},
	banner: {
		padding: 12,
		borderRadius: 12,
		marginBottom: 12,
	},
	summaryCard: {
		padding: 14,
		borderRadius: 14,
		marginTop: 20,
	},
	summaryRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 6,
	},
	totalRow: {
		borderTopWidth: 1,
		paddingTop: 8,
		marginTop: 4,
		marginBottom: 0,
	},
	confirmIcon: {
		width: 52,
		height: 52,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
		alignSelf: 'center',
	},
})

export default MarketCart
