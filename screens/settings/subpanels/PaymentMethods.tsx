import { useEffect, useMemo, useState, useReducer } from 'react'
import type { ReactNode } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, Keyboard, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPInput from '../../../ui/particles/QPInput'
import QPLoader from '../../../ui/particles/QPLoader'
import QPCoin from '../../../ui/particles/QPCoin'
import QPPressable from '../../../ui/particles/QPPressable'
import QPCoinPicker from '../../../ui/QPCoinPicker'
import WithdrawAccountFields from '../../withdraw/WithdrawAccountFields'
import CashZoneFields from '../../withdraw/CashZoneFields'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// API
import useCoins from '../../../hooks/useCoins'
import { userApi } from '../../../api/userApi'
import { useCashZonesQuery } from '../../withdraw/withdrawQueries'

// Helpers
import { keyFromFieldName } from '../../withdraw/withdrawFees'
import { cashFieldNames, cashZoneModeFor, findZone, hasCashZoneFields } from '../../withdraw/cashZones'
import { detailsToForm, formToDetails, normalizeMethodDetails } from '../../withdraw/paymentMethodDetails'
import type { RawMethodDetails } from '../../withdraw/paymentMethodDetails'

// Tipos
import QPAddress from '../../../ui/particles/QPAddress'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ApiFailure } from '../../../types/api'
import type { Coin, CoinWorkingField } from '../../../types/domain'
import type { SettingsStackParamList } from '../../../types/navigation'

/** Método de pago guardado (`GET /user/payment-methods`): `coin` es el objeto Coin, o null si la moneda se retiró. */
type PaymentMethod = {
	id?: string | number
	uuid?: string
	/** Alias en mayúsculas que el backend ha mandado alguna vez. */
	ID?: string | number
	Id?: string | number
	name?: string
	coin?: { name?: string, tick?: string, logo?: string } | null
	details?: RawMethodDetails
	Details?: RawMethodDetails
}

/** Identificador con los alias que el backend ha usado. */
const methodId = (method: PaymentMethod | null | undefined): string | number | undefined => method?.id || method?.uuid || method?.ID || method?.Id

/** `working_data` de una moneda, que puede venir como JSON en string. */
const parseWorkingFields = (coin: Coin | null): CoinWorkingField[] => {
	if (!coin || !coin.working_data) return []
	try {
		const raw: unknown = typeof coin.working_data === 'string' ? JSON.parse(coin.working_data) : coin.working_data
		return Array.isArray(raw) ? raw as CoinWorkingField[] : []
	} catch (e) { return [] }
}

/** Recurso cargado: lista + error de carga. */
type MethodsData = { methods: PaymentMethod[], error: string | null }

type MethodsAction = { type: 'set', field: keyof MethodsData, value: unknown }

/**
 * Asistente de alta y edición: moneda elegida + campos de `working_data` + nombre.
 * `editing` = el método que se edita (misma hoja precargada; la moneda queda fija).
 */
type CreateState = {
	showCreate: boolean
	showCoinPicker: boolean
	selectedCoin: Coin | null
	workingForm: Record<string, string>
	paymentMethodName: string
	creating: boolean
	editing: PaymentMethod | null
}

type CreateAction =
	| { type: 'open' }
	| { type: 'openEdit', method: PaymentMethod, coin: Coin | null, form: Record<string, string> }
	| { type: 'close' }
	| { type: 'selectCoin', coin: Coin }
	| { type: 'showCoinPicker', value: boolean }
	| { type: 'setField', key: string, value: string }
	| { type: 'setName', value: string }
	| { type: 'setCreating', value: boolean }

// Fetched resource (methods + coins + error) and the create-method wizard are two cohesive units
function dataReducer(state: MethodsData, action: MethodsAction): MethodsData {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

const initialCreate: CreateState = { showCreate: false, showCoinPicker: false, selectedCoin: null, workingForm: {}, paymentMethodName: '', creating: false, editing: null }

function createReducer(state: CreateState, action: CreateAction): CreateState {
	switch (action.type) {
		case 'open':
			return { ...initialCreate, showCreate: true }
		case 'openEdit':
			return { ...initialCreate, showCreate: true, editing: action.method, selectedCoin: action.coin, workingForm: action.form, paymentMethodName: action.method.name ?? '' }
		case 'close':
			return initialCreate
		case 'selectCoin':
			// En edición la moneda no cambia: otra moneda es otro método
			if (state.editing) return { ...state, showCoinPicker: false }
			return { ...state, selectedCoin: action.coin, showCoinPicker: false, workingForm: {} }
		case 'showCoinPicker':
			return { ...state, showCoinPicker: action.value }
		case 'setField':
			return { ...state, workingForm: { ...state.workingForm, [action.key]: action.value } }
		case 'setName':
			return { ...state, paymentMethodName: action.value }
		case 'setCreating':
			return { ...state, creating: action.value }
		default:
			return state
	}
}

// Mismos accesos rápidos y recientes que el resto de selectores de moneda de
// la app (P2P, retiros, depósitos): el picker se comporta igual en todas partes
const RECENT_METHOD_COINS_KEY = "qp_recent_method_coins"
const DEFAULT_METHOD_COINS = [
	{ tick: "BANK_CUP", label: "CUP" },
	{ tick: "BANK_MLC", label: "MLC" },
	{ tick: "CLASICA", label: "Clásica" },
	{ tick: "ETECSA", label: "ETECSA" },
]

const PaymentMethods = ({ navigation }: NativeStackScreenProps<SettingsStackParamList, 'PaymentMethods'>) => {

	// i18n
	const { t } = useTranslation()

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Header button "+"
	useEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<Pressable onPress={openCreate} hitSlop={8}>
					<FontAwesome6 name="plus" size={24} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
			)
		})
	}, [navigation, containerStyles.headerRight, theme.colors.primaryText])

	// State
	const [loading, setLoading] = useState(true)
	const [data, dispatchData] = useReducer(dataReducer, { methods: [], error: null } as MethodsData)
	const { methods, error } = data
	// Catálogo compartido y cacheado (mismo hook que Depositar/Extraer/P2P)
	const { coins: availableCoins, isLoading: loadingCoins } = useCoins('all')
	const [, setRefreshing] = useState(false)

	// Create flow state
	const [create, dispatchCreate] = useReducer(createReducer, initialCreate)
	const { showCreate, showCoinPicker, selectedCoin, workingForm, paymentMethodName, creating, editing } = create

	// Derived working fields from selected coin
	const workingFields = useMemo<CoinWorkingField[]>(() => parseWorkingFields(selectedCoin), [selectedCoin])

	// Entrega de efectivo por zonas (USDCASH…): provincia y municipio se eligen de las zonas
	// que cubre el servidor, igual que en el retiro. Un lugar escrito a mano que no casa con
	// ninguna zona dejaba el método inservible al retirar (CASH_ZONE_UNAVAILABLE)
	const { payload: cashPayload, status: cashZonesStatus, refetch: retryCashZones } = useCashZonesQuery(selectedCoin?.tick, hasCashZoneFields(workingFields))
	const cashZonesPending = cashZonesStatus === 'loading' || cashZonesStatus === 'error'
	const cashMode = useMemo(() => cashZoneModeFor(cashPayload, workingFields), [cashPayload, workingFields])
	const { provinceField, municipalityField } = cashFieldNames(workingFields)
	const provinceKey = provinceField ? keyFromFieldName(provinceField) : null
	const municipalityKey = municipalityField ? keyFromFieldName(municipalityField) : null
	const cashZone = cashMode && provinceKey && municipalityKey ? findZone(cashMode.zones, { province: workingForm[provinceKey], municipality: workingForm[municipalityKey] }) : null

	// Fetch initial data
	useEffect(() => {
		// Guarda: si el efecto se re-ejecuta (cambio de idioma) o la pantalla se desmonta
		// con la petición en vuelo, la respuesta vieja no debe escribir encima
		let cancelled = false
		const load = async () => {
			try {
				setLoading(true)
				dispatchData({ type: 'set', field: 'error', value: null })
				const methodsRes = await userApi.getPaymentMethods()
				if (cancelled) return
				if (methodsRes?.success) { dispatchData({ type: 'set', field: 'methods', value: Array.isArray(methodsRes.data) ? methodsRes.data : ((methodsRes.data as { methods?: PaymentMethod[] } | undefined)?.methods || []) }) }
				else { dispatchData({ type: 'set', field: 'error', value: methodsRes?.error || t('settings.paymentMethods.toasts.loadFailed') }) }
			} catch (e) {
				if (cancelled) return
				dispatchData({ type: 'set', field: 'error', value: (e as Error).message || t('settings.paymentMethods.toasts.networkError') })
			} finally { if (!cancelled) setLoading(false) }
		}
		load()
		return () => { cancelled = true }
	}, [t])

	// Refresh methods
	const refresh = async () => {
		try {
			setRefreshing(true)
			const res = await userApi.getPaymentMethods()
			if (res.success) { dispatchData({ type: 'set', field: 'methods', value: Array.isArray(res.data) ? res.data : ((res.data as { methods?: PaymentMethod[] } | undefined)?.methods || []) }) }
			else { toast.error(res.error || t('settings.paymentMethods.toasts.loadFailed')) }
		} catch (e) { toast.error((e as Error).message || t('settings.paymentMethods.toasts.networkError')) }
		finally { setRefreshing(false) }
	}

	// Open create modal
	const openCreate = () => {
		dispatchCreate({ type: 'open' })
	}

	// Editar: la misma hoja precargada. La moneda sale del catálogo por tick (sin distinguir
	// mayúsculas: las filas viejas lo guardan con otra grafía); si ya no existe, solo se edita el nombre
	const openEdit = (method: PaymentMethod) => {
		const tick = method.coin?.tick
		const coin = tick ? availableCoins.find((c) => String(c.tick).toLowerCase() === tick.toLowerCase()) ?? null : null
		dispatchCreate({ type: 'openEdit', method, coin, form: detailsToForm(method.details ?? method.Details, parseWorkingFields(coin)) })
	}

	// Close create modal
	const closeCreate = () => {
		if (creating) return
		dispatchCreate({ type: 'close' })
	}

	// Handle coin select
	const handleCoinSelect = (coin: Coin) => { dispatchCreate({ type: 'selectCoin', coin }) }

	// Campos de la moneda completos y, en efectivo por zonas, un municipio que casa con una zona
	const validateForm = (): boolean => {
		if ((workingFields || []).length > 0) {
			const allFilled = workingFields.every((field) => ((workingForm[keyFromFieldName(field.name)] ?? '').toString().trim()).length > 0)
			if (!allFilled) {
				toast.error(t('settings.paymentMethods.toasts.missingData'), { description: t('settings.paymentMethods.toasts.missingDataDescription') })
				return false
			}
		}
		// Las zonas pueden haber cambiado desde que se eligió el municipio
		if (cashMode && !cashZone) {
			toast.error(t('settings.paymentMethods.toasts.zoneRequired'))
			return false
		}
		return true
	}

	// Handle create method
	const handleCreate = async () => {

		if (!selectedCoin) {
			toast.error(t('settings.paymentMethods.toasts.selectCoin'))
			return
		}
		if (!validateForm()) return

		try {

			dispatchCreate({ type: 'setCreating', value: true })
			// Details keyed por el nombre original del campo (la forma que devuelve la API)
			const payload = { name: paymentMethodName, coin: selectedCoin.tick, details: formToDetails(workingForm, workingFields) }
			const res = await userApi.createPaymentMethod(payload)

			if (res.success) {
				toast.success(t('settings.paymentMethods.toasts.created'))
				await refresh()
				closeCreate()
				// `PaymentMethodCreateResult` calcula `success` como boolean, no como literal:
				// TS no puede estrechar a ApiFailure en esta rama.
			} else { toast.error((res as { error?: string }).error || t('settings.paymentMethods.toasts.createFailed')) }
		} catch (e) {
			toast.error((e as Error).message || t('settings.paymentMethods.toasts.networkError'))
		} finally { dispatchCreate({ type: 'setCreating', value: false }) }
	}

	// Guardar la edición: PATCH con el nombre y, si la moneda sigue en el catálogo, los detalles.
	// La fila se sustituye en sitio (sin recargar la lista); el `coin` de la respuesta es el
	// tick y la lista necesita el objeto, así que no se vuelca `res.data`
	const handleUpdate = async () => {
		const id = methodId(editing)
		if (!id) { toast.error(t('settings.paymentMethods.toasts.invalidId')); return }
		const details = selectedCoin ? formToDetails(workingForm, workingFields) : undefined
		if (selectedCoin && !validateForm()) return
		if (!details && !paymentMethodName.trim()) {
			toast.error(t('settings.paymentMethods.toasts.missingData'), { description: t('settings.paymentMethods.toasts.missingDataDescription') })
			return
		}

		try {
			dispatchCreate({ type: 'setCreating', value: true })
			const payload = { id, name: paymentMethodName, ...(details ? { details } : {}) }
			const res = await userApi.updatePaymentMethod(payload)

			if (res.success) {
				dispatchData({ type: 'set', field: 'methods', value: methods.map((m: PaymentMethod) => methodId(m) === id ? { ...m, name: paymentMethodName, ...(details ? { details } : {}) } : m) })
				toast.success(t('settings.paymentMethods.toasts.updated'))
				closeCreate()
				return
			}
			const failure = res as ApiFailure & { reason?: 'backendTooOld' }
			if (failure.reason === 'backendTooOld') { toast.error(t('settings.paymentMethods.toasts.updateUnsupported')); return }
			toast.error(failure.error || t('settings.paymentMethods.toasts.updateFailed'))
			// Borrado desde otro sitio: la lista local ya no es verdad
			if (failure.status === 404) refresh()
		} catch (e) {
			toast.error((e as Error).message || t('settings.paymentMethods.toasts.networkError'))
		} finally { dispatchCreate({ type: 'setCreating', value: false }) }
	}

	// Handle delete method
	const handleDelete = (method: PaymentMethod) => {
		const id = methodId(method)
		if (!id) { toast.error(t('settings.paymentMethods.toasts.invalidId')); return }
		Alert.alert(
			t('settings.paymentMethods.alerts.deleteTitle'),
			t('settings.paymentMethods.alerts.deleteBody'),
			[
				{ text: t('common.actions.cancel'), style: 'cancel' },
				{
					text: t('common.actions.delete'), style: 'destructive', onPress: async () => {
						dispatchData({ type: 'set', field: 'methods', value: methods.filter((m: PaymentMethod) => methodId(m) !== id) })
						try {
							const res = await userApi.deletePaymentMethod(id)
							if (res.success) { toast.success(t('settings.paymentMethods.toasts.deleted')) }
							else { toast.error(res.error || t('settings.paymentMethods.toasts.deleteFailed')); refresh() }
						} catch (e) { toast.error((e as Error).message || t('settings.paymentMethods.toasts.networkError')); refresh() }
					}
				}
			]
		)
	}

	// Loading
	if (loading) { return (<QPLoader />) }

	// Provincia + municipio: los selects de zonas o, mientras la tarifa no llega, la espera y
	// el reintento — sin ella los campos de texto dejarían guardar cualquier lugar. Sin zonas
	// para la moneda (o sin esos campos) se pintan los campos de siempre
	let zoneSlot: { keys: string[], node: ReactNode } | null = null
	if (provinceKey && municipalityKey) {
		const keys = [provinceKey, municipalityKey]
		if (cashMode) {
			zoneSlot = {
				keys,
				node: (
					<CashZoneFields
						mode={cashMode}
						province={workingForm[provinceKey] || ''}
						municipality={workingForm[municipalityKey] || ''}
						zone={cashZone}
						charge={null}
						belowMin={false}
						// Cambiar de provincia invalida el municipio elegido
						onChangeProvince={(value) => {
							dispatchCreate({ type: 'setField', key: provinceKey, value })
							dispatchCreate({ type: 'setField', key: municipalityKey, value: '' })
						}}
						onChangeMunicipality={(value) => dispatchCreate({ type: 'setField', key: municipalityKey, value })}
						showNotice={false}
						theme={theme}
						textStyles={textStyles}
					/>
				),
			}
		} else if (cashZonesStatus === 'loading') {
			zoneSlot = { keys, node: <ActivityIndicator style={styles.zonesLoading} color={theme.colors.primary} /> }
		} else if (cashZonesStatus === 'error') {
			zoneSlot = {
				keys,
				node: (
					<View testID="cash-zones-error" style={[styles.zonesCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('settings.paymentMethods.modal.zonesLoadError')}</Text>
						<Pressable onPress={() => retryCashZones()} hitSlop={8} accessibilityRole="button" style={styles.zonesRetry}>
							<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('common.actions.retry')}</Text>
						</Pressable>
					</View>
				),
			}
		}
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>{t('settings.paymentMethods.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.paymentMethods.subtitle')}</Text>

				{error && (
					<View style={[containerStyles.card, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
						<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{String(error)}</Text>
					</View>
				)}

				{/* Methods list */}
				<View style={{ marginTop: 10, marginBottom: 20 }}>
					{methods.length === 0 ? (
						<View style={[containerStyles.card, { alignItems: 'center' }]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('settings.paymentMethods.empty')}</Text>
						</View>
					) : (
						methods.map((method: PaymentMethod) => {
							const name = method?.name || method?.coin?.name || t('settings.paymentMethods.fallbackName')
							const logo = method?.coin?.logo
							const details = normalizeMethodDetails(method.details ?? method.Details)
							const id = methodId(method)
							// La tarjeta entera abre la edición (el propio elemento es el control); la papelera sigue dentro
							return (
								<QPPressable key={id || JSON.stringify(method)} onPress={() => openEdit(method)} variant="opacity" style={[containerStyles.card, { marginVertical: 4 }]} accessibilityRole="button" testID={`payment-method-${id}`}>
									<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
										<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
											<QPCoin coin={logo} size={28} />
											<Text style={textStyles.h4}>{name}</Text>
										</View>
										<Pressable onPress={() => handleDelete(method)} style={{ padding: 6 }}>
											<FontAwesome6 name="trash" size={16} color={theme.colors.danger} iconStyle="solid" />
										</Pressable>
									</View>
									{details.length > 0 && (
										<View style={{ marginTop: 8, gap: 4 }}>
											{details.slice(0, 4).map((d) => (
												<View key={d.name} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
													<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name}</Text>
													{d.name === "Wallet" ? (
														<QPAddress address={d.value} visible={{ head: 8, tail: 8 }} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle" />
													) : (
														<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{d.value}</Text>
													)}
												</View>
											))}
										</View>
									)}
								</QPPressable>
							)
						})
					)}
				</View>
			</ScrollView>

			{/* Create Modal */}
			<Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCreate}>
				<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
					<View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

						<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
							<Text style={textStyles.h4}>{t(editing ? 'settings.paymentMethods.modal.editTitle' : 'settings.paymentMethods.modal.title')}</Text>
							<Pressable onPress={closeCreate} style={styles.closeButton}>
								<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>

						<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 }}>

							{/* Name */}
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>{t('settings.paymentMethods.modal.nameLabel')}</Text>
							<QPInput value={paymentMethodName} onChangeText={(v) => dispatchCreate({ type: 'setName', value: v })} placeholder={t('settings.paymentMethods.modal.namePlaceholder')} style={{ marginVertical: 6 }} />

							{/* Coin selector */}
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>{t('settings.paymentMethods.modal.coinLabel')}</Text>
							{/* En edición la moneda queda fija (otra moneda es otro método); si ya no está en el catálogo, solo el nombre */}
							<Pressable style={[styles.selector, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, !!editing && styles.selectorLocked]} onPress={() => dispatchCreate({ type: 'showCoinPicker', value: true })} disabled={!!editing} testID="method-coin-selector">
								{selectedCoin ? (
									<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
									</View>
								) : editing ? (
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{editing.coin?.name || editing.coin?.tick || t('settings.paymentMethods.fallbackName')}</Text>
								) : (
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{t('settings.paymentMethods.modal.selectCoin')}</Text>
								)}
								{!editing && <FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />}
							</Pressable>
							{!!editing && !selectedCoin && (
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 6 }]} testID="method-coin-unavailable">{t('settings.paymentMethods.modal.coinUnavailable')}</Text>
							)}

							{/* Dynamic fields: los mismos del retiro (selects como opciones, provincia y municipio por zonas) */}
							{!!selectedCoin && workingFields.length > 0 && (
								<WithdrawAccountFields
									title={t('settings.paymentMethods.modal.accountData')}
									workingFields={workingFields}
									workingForm={workingForm}
									onChangeField={(key, value) => dispatchCreate({ type: 'setField', key, value })}
									slot={zoneSlot}
									theme={theme}
									textStyles={textStyles}
								/>
							)}

						</ScrollView>

						{/* Actions */}
						<View style={[containerStyles.bottomButtonContainer, { paddingHorizontal: 20 }]}>
							<QPButton
								title={t(editing ? 'settings.paymentMethods.modal.saveChanges' : 'settings.paymentMethods.modal.saveButton')}
								onPress={editing ? handleUpdate : handleCreate}
								loading={creating}
								disabled={creating || cashZonesPending || (!editing && !selectedCoin)}
								textStyle={{ color: theme.colors.buttonText }}
							/>
						</View>

						{/* Coin Picker Modal */}
						<QPCoinPicker
							visible={showCoinPicker}
							onClose={() => dispatchCreate({ type: 'showCoinPicker', value: false })}
							onSelect={handleCoinSelect}
							coins={availableCoins}
							isLoading={loadingCoins}
							selectedCoin={selectedCoin}
							showFees={false}
							recentKey={RECENT_METHOD_COINS_KEY}
							defaultCoins={DEFAULT_METHOD_COINS}
						/>

					</View>
				</TouchableWithoutFeedback>
			</Modal>
		</View>
	)
}

const styles = StyleSheet.create({
	modalContainer: { flex: 1 },
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5,
	},
	closeButton: { padding: 5 },
	selectorLocked: { opacity: 0.6 },
	zonesLoading: { marginVertical: 16 },
	zonesCard: { marginVertical: 6, padding: 12, borderRadius: 12 },
	zonesRetry: { alignSelf: 'flex-start', marginTop: 8 },
	selector: {
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 0.5,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
})

export default PaymentMethods