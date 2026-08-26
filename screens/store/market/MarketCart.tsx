import { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContentPadding from '../../../hooks/useContentPadding'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import FastImage from '@d11/react-native-fast-image'

// Toast
import { toast } from 'sonner-native'

// Contexts
import { useAuth } from '../../../auth/AuthContext'
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import AddressPicker, { formatAddress } from '../../../ui/store/AddressPicker'
import NewAddressForm, { EMPTY_US_ADDRESS, validateUsAddress, buildAddressBody } from '../../../ui/store/NewAddressForm'

// Routes & API
import { ROUTES } from '../../../routes'
import { marketApi } from '../../../api/marketApi'
import { shopApi } from '../../../api/shopApi'
import { userApi } from '../../../api/userApi'
import { mediaUrl } from '../../../helpers/mediaUrl'

// Cart core
import useMarketCart from './useMarketCart'
import {
	PROBLEM_LABELS,
	enrichCartItems,
	groupByShop,
	mapOrderError,
	isAbortingOrderError,
	makeIdemKey,
} from './marketCheckout'

import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { RootStackParamList } from '../../../types/navigation'
import type { ShippingAddress } from '../../../ui/store/AddressPicker'
import type { UsAddressForm } from '../../../ui/store/NewAddressForm'
import type { CartLineStatus, FreshProduct } from './marketCheckout'
import type { MarketOrderInput } from '../../../api/marketApi'
import type { ApiFailure, ApiSuccess } from '../../../types/api'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

/** Estado del bloque de envío: dirección guardada elegida o formulario nuevo. */
type ShippingState = { selectedUuid: string | null, useNewAddress: boolean, form: UsAddressForm }

/** Acciones del reducer de envío. */
type ShippingAction =
	| { type: 'selectExisting', value: string }
	| { type: 'useNew' }
	| { type: 'setForm', value: UsAddressForm | ((prev: UsAddressForm) => UsAddressForm) }

// `setTimeout` está tipado como `() => void`; el `resolve` de la promesa recibe
// un valor. Cast de tipos, el temporizador se arma igual.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve as () => void, ms))
const money = (v: number | string | null | undefined) => `$${Number(v || 0).toFixed(2)}`

function shippingReducer(state: ShippingState, action: ShippingAction): ShippingState {
	switch (action.type) {
		case 'selectExisting': return { ...state, selectedUuid: action.value, useNewAddress: false }
		case 'useNew': return { ...state, useNewAddress: true }
		case 'setForm': return { ...state, form: typeof action.value === 'function' ? action.value(state.form) : action.value }
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

// Purchase confirmation — centered card modal (house pattern)
const ConfirmModal = ({ visible, paying, total, count, addressSummary, onPay, onClose, theme, textStyles }: ConfirmModalProps) => {
	const { t } = useTranslation()
	const containerStyles = createContainerStyles(theme)
	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !paying && onClose()}>
			<Pressable style={containerStyles.modalOverlay} onPress={() => !paying && onClose()}>
				<Pressable style={containerStyles.modalCard} onPress={() => { }}>
					<View style={[styles.confirmIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
						<FontAwesome6 name="cart-shopping" size={22} color={theme.colors.primary} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h4, { fontWeight: '600', textAlign: 'center', marginTop: 12 }]}>{t('market.cart.confirm.title')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8, lineHeight: 18 }]}>
						{t('market.cart.confirm.body', { amount: money(total), count })}
					</Text>
					{!!addressSummary && (
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, textAlign: 'center', marginTop: 6, lineHeight: 18 }]} numberOfLines={3}>
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
 * aborts the remaining lines. Physical items require a US shipping address
 * (shared AddressPicker / NewAddressForm).
 */
const MarketCart = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'MarketCart'>) => {

	const { t } = useTranslation()
	const { user, updateUser } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(30, 8)

	const { items, remove, setQty, clear } = useMarketCart()

	// null = revalidando (o sin red); mapa uuid → producto fresco al resolver
	const [freshMap, setFreshMap] = useState<Record<string, FreshProduct> | null>(null)
	const [offline, setOffline] = useState(false)
	const [paying, setPaying] = useState(false)
	const [confirmVisible, setConfirmVisible] = useState(false)
	// key → 'paying' | 'done' | { error }
	const [statuses, setStatuses] = useState<Record<string, CartLineStatus>>({})
	const [succeededCount, setSucceededCount] = useState(0)

	const [addresses, setAddresses] = useState<ShippingAddress[]>([])
	const [shipping, dispatchShipping] = useReducer(shippingReducer, { selectedUuid: null, useNewAddress: false, form: EMPTY_US_ADDRESS })
	const { selectedUuid, useNewAddress, form } = shipping
	const selectedSaved = selectedUuid ? addresses.find(a => a.uuid === selectedUuid) : null
	const selectedAddress = useNewAddress ? form : selectedSaved

	// Una clave de idempotencia por línea y por montaje: un reintento (incluso
	// tras un timeout) reutiliza la misma clave y el backend no duplica la orden.
	const idemRef = useRef<Record<string, string>>({})
	const idemKeyFor = (key: string) => {
		if (!idemRef.current[key]) idemRef.current[key] = makeIdemKey()
		return idemRef.current[key]
	}

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

	// Direcciones: solo cuando hay físicos en el carrito
	useEffect(() => {
		if (!anyPhysical || addresses.length > 0) return
		let cancelled = false
		;(async () => {
			const res = await shopApi.getShippingAddresses()
			if (cancelled || !res.success) return
			// `shopApi.getShippingAddresses` devuelve `unknown`: solo se lee `addresses`
			const list = (res.data as { addresses?: ShippingAddress[] } | undefined)?.addresses || []
			setAddresses(list)
			const preferred = list.find(a => a.is_default) || list[0]
			if (preferred) dispatchShipping({ type: 'selectExisting', value: preferred.uuid })
			else dispatchShipping({ type: 'useNew' })
		})()
		return () => { cancelled = true }
	}, [anyPhysical, addresses.length])

	const formError = useMemo(() => (useNewAddress ? validateUsAddress(form) : null), [useNewAddress, form])
	const addressReady = !anyPhysical || (useNewAddress ? !formError : !!selectedSaved)

	const total = payable.reduce((sum, e) => sum + e.unitPrice * e.qty, 0)
	const balance = Number(user?.balance || 0)
	const enoughBalance = balance >= total
	const revalidating = freshMap === null && !offline && items.length > 0

	const canPay = !paying && !revalidating && !offline && payable.length > 0 && enoughBalance && addressReady && !anyShipBlocked

	const payAll = async () => {
		setConfirmVisible(false)
		setPaying(true)

		// Dirección nueva: se crea UNA vez y todas las órdenes físicas la reusan
		// (mandar new_address por orden duplicaría la dirección en cada compra)
		let addressUuid = !useNewAddress ? selectedUuid : null
		if (anyPhysical && !addressUuid && useNewAddress) {
			// `buildAddressBody` normaliza phone/line2 a `null` y añade `country`, y el
			// input de shopApi los declara `string?` sin `country`: incompatibilidad
			// REAL entre módulos ya migrados — se castea aquí, el body viaja intacto
			const res = await shopApi.createShippingAddress(buildAddressBody(form) as unknown as Parameters<typeof shopApi.createShippingAddress>[0])
			// `shopApi.createShippingAddress` devuelve `unknown`: solo se lee `address`
			const createdUuid = res.success ? (res.data as { address?: ShippingAddress } | undefined)?.address?.uuid : null
			if (!createdUuid) {
						toast.error(t('market.cart.toasts.addressErrorTitle'), { description: (res as ApiFailure).error || t('market.cart.toasts.addressSaveFailed') })
				setPaying(false)
				return
			}
			addressUuid = createdUuid
			setAddresses(prev => [...prev, (res as ApiSuccess<{ address: ShippingAddress }>).data!.address])
			dispatchShipping({ type: 'selectExisting', value: createdUuid })
		}

		let succeeded = 0
		let failed = 0
		let aborted = false
		// Secuencial a propósito: cada orden abre una transacción Serializable que
		// puede escribir la fila del usuario de fees — en paralelo se pisan
		for (const entry of payable) {
			if (aborted) break
			setStatuses(s => ({ ...s, [entry.key]: 'paying' }))
			const payload: MarketOrderInput = {
				product_uuid: entry.item.product_uuid,
				quantity: entry.qty,
				idempotency_key: idemKeyFor(entry.key),
			}
			if (entry.item.variant_uuid) payload.variant_uuid = entry.item.variant_uuid
			if (entry.isPhysical && addressUuid) payload.shipping_address_id = addressUuid

			let outcome: { ok: true } | { ok: false, error: string, raw?: string } | null = null
			for (let attempt = 0; attempt < 4; attempt++) {
				const res = await marketApi.createOrder(payload)
				if (res.status === 429) { await sleep(5000); continue }
				outcome = res.success ? { ok: true } : { ok: false, error: mapOrderError(res.status, res.error), raw: res.error }
				break
			}
			if (!outcome) outcome = { ok: false, error: t('market.checkout.errors.busy') }

			if (outcome.ok) {
				succeeded++
				setStatuses(s => ({ ...s, [entry.key]: 'done' }))
				remove(entry.key)
			} else {
				failed++
				setStatuses(s => ({ ...s, [entry.key]: { error: outcome.error } }))
				// Sin saldo, las líneas restantes fallarían igual: quedan intactas
				if (isAbortingOrderError(outcome.raw)) aborted = true
			}
		}

		setPaying(false)
		setSucceededCount(n => n + succeeded)

		// Refrescar el balance local tras el gasto
		if (succeeded > 0) {
			const profile = await userApi.getUserProfile()
			if (profile.success && profile.data) updateUser(profile.data)
		}

		if (failed === 0 && succeeded > 0) {
			toast.success(t('market.cart.toasts.confirmed', { count: succeeded }))
			navigation.replace(ROUTES.MARKET_ORDERS)
		} else if (succeeded > 0) {
			toast.warning(t('market.cart.toasts.partial', { count: succeeded, failed }))
			await revalidate()
		} else if (failed > 0) {
			toast.error(t('market.cart.toasts.allFailed'))
		}
	}

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
						<View
							key={group.name}
							style={[styles.shopCard, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
						>
							<Pressable
								disabled={!group.slug}
								onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: group.slug as string })}
								style={styles.shopHeader}
							>
								<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{group.name}</Text>
								{!!group.slug && <Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>{t('market.cart.viewStore')}</Text>}
							</Pressable>

							{group.entries.map(e => {
								const image = mediaUrl(e.variant?.image || e.fresh?.main_image || e.item.image)
								const title = e.fresh?.title || e.item.title
								const errored = typeof e.status === 'object' && e.status?.error
								return (
									<View key={e.key} style={[styles.itemRow, e.problem && { opacity: 0.6 }]}>
										<View style={[styles.itemImage, { backgroundColor: theme.colors.elevationLight }]}>
											{image && (
												<FastImage source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />
											)}
										</View>
										<View style={{ flex: 1 }}>
											<Pressable onPress={() => navigation.navigate(ROUTES.MARKET_PRODUCT, { uuid: e.item.product_uuid })}>
												<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{title}</Text>
											</Pressable>
											{!!e.item.variant_label && (
												<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 1 }]} numberOfLines={1}>
													{e.item.variant_label}
												</Text>
											)}

											{e.problem ? (
												<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
													{t(PROBLEM_LABELS[e.problem])}
												</Text>
											) : (
												<View style={styles.qtyRow}>
													<Pressable
														disabled={paying || e.qty <= 1}
														onPress={() => setQty(e.key, e.qty - 1)}
														style={[styles.qtyBtn, { backgroundColor: theme.colors.elevationLight }, e.qty <= 1 && { opacity: 0.4 }]}
													>
														<FontAwesome6 name="minus" size={10} color={theme.colors.primaryText} iconStyle="solid" />
													</Pressable>
													<Text style={[textStyles.h6, styles.qtyValue]}>{e.qty}</Text>
													<Pressable
														disabled={paying || e.qty >= e.maxQty}
														onPress={() => setQty(e.key, e.qty + 1)}
														style={[styles.qtyBtn, { backgroundColor: theme.colors.elevationLight }, e.qty >= e.maxQty && { opacity: 0.4 }]}
													>
														<FontAwesome6 name="plus" size={10} color={theme.colors.primaryText} iconStyle="solid" />
													</Pressable>
													{!!e.fresh?.track_inventory && e.maxQty < 999 && (
														<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 8 }]}>{t('market.cart.stockLeft', { qty: e.maxQty })}</Text>
													)}
												</View>
											)}

											{e.shipBlocked && (
												<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
													{t('market.cart.itemShipBlocked')}
												</Text>
											)}
											{!!errored && (
												<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
													{(e.status as { error: string }).error}
												</Text>
											)}
											{e.status === 'paying' && (
												<Text style={[textStyles.caption, { color: theme.colors.primary, marginTop: 3, fontWeight: '500' }]}>{t('market.cart.processing')}</Text>
											)}
										</View>
										<View style={styles.itemRight}>
											<Text style={[textStyles.h6, { fontWeight: '600' }]}>{money(e.unitPrice * e.qty)}</Text>
											<Pressable disabled={paying} onPress={() => remove(e.key)} hitSlop={8}>
												<FontAwesome6 name="trash-can" size={13} color={theme.colors.tertiaryText} iconStyle="solid" />
											</Pressable>
										</View>
									</View>
								)
							})}
						</View>
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
							useNewAddress={useNewAddress}
							selectedUuid={selectedUuid}
							onSelectAddress={(uuid) => dispatchShipping({ type: 'selectExisting', value: uuid })}
							onNewAddress={() => dispatchShipping({ type: 'useNew' })}
							theme={theme}
							textStyles={textStyles}
						/>
						{useNewAddress && <NewAddressForm form={form} onChange={(value) => dispatchShipping({ type: 'setForm', value })} />}
					</View>
				)}

				{/* Resumen */}
				<View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
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

					{!enoughBalance && (
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
							{t('market.cart.shipBlockedSummary')}
						</Text>
					)}
				</View>

				<QPButton
					title={paying ? t('market.cart.processingPurchases') : failedCount > 0 ? t('market.cart.retryPayment', { failed: failedCount }) : t('market.cart.payAmount', { amount: money(total) })}
					icon="lock"
					onPress={() => setConfirmVisible(true)}
					loading={paying}
					disabled={!canPay}
					style={{ marginTop: 16 }}
				/>

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
				onPay={payAll}
				onClose={() => setConfirmVisible(false)}
				theme={theme}
				textStyles={textStyles}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	banner: {
		padding: 12,
		borderRadius: 12,
		marginBottom: 12,
	},
	shopCard: {
		borderRadius: 14,
		paddingHorizontal: 12,
		paddingBottom: 4,
	},
	shopHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 10,
	},
	itemRow: {
		flexDirection: 'row',
		gap: 10,
		paddingVertical: 10,
	},
	itemImage: {
		width: 56,
		height: 56,
		borderRadius: 10,
		overflow: 'hidden',
	},
	itemRight: {
		alignItems: 'flex-end',
		justifyContent: 'space-between',
		paddingBottom: 2,
	},
	qtyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 6,
	},
	qtyBtn: {
		width: 26,
		height: 26,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	qtyValue: {
		minWidth: 30,
		textAlign: 'center',
		fontWeight: '600',
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
