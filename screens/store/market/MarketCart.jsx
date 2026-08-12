import { useState, useEffect, useMemo, useCallback, useReducer, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const money = (v) => `$${Number(v || 0).toFixed(2)}`

function shippingReducer(state, action) {
	switch (action.type) {
		case 'selectExisting': return { ...state, selectedUuid: action.value, useNewAddress: false }
		case 'useNew': return { ...state, useNewAddress: true }
		case 'setForm': return { ...state, form: typeof action.value === 'function' ? action.value(state.form) : action.value }
		default: return state
	}
}

// Purchase confirmation — centered card modal (house pattern)
const ConfirmModal = ({ visible, paying, total, count, addressSummary, onPay, onClose, theme, textStyles }) => {
	const containerStyles = createContainerStyles(theme)
	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !paying && onClose()}>
			<Pressable style={containerStyles.modalOverlay} onPress={() => !paying && onClose()}>
				<Pressable style={containerStyles.modalCard} onPress={() => { }}>
					<View style={[styles.confirmIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
						<FontAwesome6 name="cart-shopping" size={22} color={theme.colors.primary} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h4, { fontWeight: '600', textAlign: 'center', marginTop: 12 }]}>Confirmar compra</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8, lineHeight: 18 }]}>
						Se descontarán {money(total)} de tu balance en {count} {count === 1 ? 'orden' : 'órdenes'}. Cada tienda recibe su pago por separado.
					</Text>
					{!!addressSummary && (
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, textAlign: 'center', marginTop: 6, lineHeight: 18 }]} numberOfLines={3}>
							Enviaremos a: {addressSummary}
						</Text>
					)}
					<QPButton title={`Pagar ${money(total)}`} onPress={onPay} loading={paying} style={{ marginTop: 18 }} />
					<Pressable style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => !paying && onClose()}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Cancelar</Text>
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
const MarketCart = ({ navigation }) => {

	const { user, updateUser } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	const { items, remove, setQty, clear } = useMarketCart()

	// null = revalidando (o sin red); mapa uuid → producto fresco al resolver
	const [freshMap, setFreshMap] = useState(null)
	const [offline, setOffline] = useState(false)
	const [paying, setPaying] = useState(false)
	const [confirmVisible, setConfirmVisible] = useState(false)
	// key → 'paying' | 'done' | { error }
	const [statuses, setStatuses] = useState({})
	const [succeededCount, setSucceededCount] = useState(0)

	const [addresses, setAddresses] = useState([])
	const [shipping, dispatchShipping] = useReducer(shippingReducer, { selectedUuid: null, useNewAddress: false, form: EMPTY_US_ADDRESS })
	const { selectedUuid, useNewAddress, form } = shipping
	const selectedSaved = selectedUuid ? addresses.find(a => a.uuid === selectedUuid) : null
	const selectedAddress = useNewAddress ? form : selectedSaved

	// Una clave de idempotencia por línea y por montaje: un reintento (incluso
	// tras un timeout) reutiliza la misma clave y el backend no duplica la orden.
	const idemRef = useRef({})
	const idemKeyFor = (key) => {
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
			const map = {}
			for (const p of res.data?.products || []) map[p.uuid] = p
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
			const list = res.data?.addresses || []
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
			const res = await shopApi.createShippingAddress(buildAddressBody(form))
			const createdUuid = res.success ? res.data?.address?.uuid : null
			if (!createdUuid) {
				toast.error('Dirección', { description: res.error || 'No se pudo guardar la dirección de envío' })
				setPaying(false)
				return
			}
			addressUuid = createdUuid
			setAddresses(prev => [...prev, res.data.address])
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
			const payload = {
				product_uuid: entry.item.product_uuid,
				quantity: entry.qty,
				idempotency_key: idemKeyFor(entry.key),
			}
			if (entry.item.variant_uuid) payload.variant_uuid = entry.item.variant_uuid
			if (entry.isPhysical && addressUuid) payload.shipping_address_id = addressUuid

			let outcome = null
			for (let attempt = 0; attempt < 4; attempt++) {
				const res = await marketApi.createOrder(payload)
				if (res.status === 429) { await sleep(5000); continue }
				outcome = res.success ? { ok: true } : { ok: false, error: mapOrderError(res.status, res.error), raw: res.error }
				break
			}
			if (!outcome) outcome = { ok: false, error: 'El servicio está ocupado. Intenta de nuevo en unos segundos.' }

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
			toast.success(succeeded === 1 ? '¡Compra confirmada!' : `¡${succeeded} compras confirmadas!`)
			navigation.replace(ROUTES.MARKET_ORDERS)
		} else if (succeeded > 0) {
			toast.warning(`${succeeded} ${succeeded === 1 ? 'compra confirmada' : 'compras confirmadas'} · ${failed} con error. Revisa los ítems restantes.`)
			await revalidate()
		} else if (failed > 0) {
			toast.error('No se pudo completar ninguna compra. Revisa los errores.')
		}
	}

	// ── Vacío ──
	if (items.length === 0) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<Text style={{ fontSize: 44 }}>🛒</Text>
				<Text style={[textStyles.h5, { fontWeight: '600', marginTop: 12 }]}>Tu carrito está vacío</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]}>
					Explora las tiendas y agrega productos para comprarlos juntos.
				</Text>
				{succeededCount > 0 && (
					<Pressable onPress={() => navigation.replace(ROUTES.MARKET_ORDERS)} style={{ marginTop: 10 }}>
						<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>Ver mis compras ›</Text>
					</Pressable>
				)}
				<QPButton
					title="Explorar tiendas"
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
				contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingTop: 8 }}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				{revalidating && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 10 }]}>
						Actualizando precios y disponibilidad…
					</Text>
				)}
				{offline && (
					<View style={[styles.banner, { backgroundColor: `${theme.colors.warning}1A` }]}>
						<Text style={[textStyles.caption, { color: theme.colors.warning }]}>
							Sin conexión — no pudimos verificar precios y stock. El pago está bloqueado hasta reintentar.
						</Text>
						<Pressable onPress={revalidate} style={{ marginTop: 6 }}>
							<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>Reintentar</Text>
						</Pressable>
					</View>
				)}

				{/* Grupos por tienda */}
				<View style={{ gap: 14 }}>
					{byShop.map(group => (
						<View
							key={group.name}
							style={[styles.shopCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
						>
							<Pressable
								disabled={!group.slug}
								onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: group.slug })}
								style={styles.shopHeader}
							>
								<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{group.name}</Text>
								{!!group.slug && <Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>Ver tienda ›</Text>}
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
													{PROBLEM_LABELS[e.problem]}
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
														<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 8 }]}>{e.maxQty} disp.</Text>
													)}
												</View>
											)}

											{e.shipBlocked && (
												<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
													El vendedor no envía a la dirección elegida
												</Text>
											)}
											{!!errored && (
												<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
													{e.status.error}
												</Text>
											)}
											{e.status === 'paying' && (
												<Text style={[textStyles.caption, { color: theme.colors.primary, marginTop: 3, fontWeight: '500' }]}>Procesando…</Text>
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
						<Text style={[textStyles.h5, { fontWeight: '600' }]}>Dirección de envío</Text>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>
							Se usa para todos los productos físicos del carrito. Por ahora solo enviamos dentro de Estados Unidos.
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
				<View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
					<View style={styles.summaryRow}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
							{payable.length} {payable.length === 1 ? 'producto' : 'productos'}
						</Text>
						<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(total)}</Text>
					</View>
					<View style={[styles.summaryRow, styles.totalRow, { borderTopColor: `${theme.colors.secondaryText}33` }]}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>Total</Text>
						<Text style={[textStyles.h5, { fontWeight: '600', color: theme.colors.primary }]}>{money(total)}</Text>
					</View>
					<View style={[styles.summaryRow, { marginTop: 6 }]}>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>Saldo disponible</Text>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '600' }]}>{money(balance)}</Text>
					</View>

					{!enoughBalance && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
							Saldo insuficiente para esta compra.
						</Text>
					)}
					{unavailable.length > 0 && (
						<Text style={[textStyles.caption, { color: theme.colors.warning, marginTop: 8 }]}>
							{unavailable.length === 1 ? 'Un producto ya no está disponible y no se incluirá.' : `${unavailable.length} productos ya no están disponibles y no se incluirán.`}
						</Text>
					)}
					{anyPhysical && !addressReady && (
						<Text style={[textStyles.caption, { color: theme.colors.warning, marginTop: 8 }]}>
							{formError || 'Elige o agrega una dirección de envío para continuar.'}
						</Text>
					)}
					{anyShipBlocked && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
							Hay productos que no se envían a la dirección elegida. Cámbiala o quítalos del carrito.
						</Text>
					)}
				</View>

				<QPButton
					title={paying ? 'Procesando compras…' : failedCount > 0 ? `Reintentar pago (${failedCount})` : `Pagar ${money(total)}`}
					icon="lock"
					onPress={() => setConfirmVisible(true)}
					loading={paying}
					disabled={!canPay}
					style={{ marginTop: 16 }}
				/>

				<Pressable disabled={paying} onPress={clear} style={{ marginTop: 12, alignSelf: 'center' }}>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>Vaciar carrito</Text>
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
