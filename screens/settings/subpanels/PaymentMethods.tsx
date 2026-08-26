import { useEffect, useMemo, useState, useReducer } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, Keyboard, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPInput from '../../../ui/particles/QPInput'
import QPLoader from '../../../ui/particles/QPLoader'
import QPCoin from '../../../ui/particles/QPCoin'
import QPCoinPicker from '../../../ui/QPCoinPicker'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// API
import useCoins from '../../../hooks/useCoins'
import { userApi } from '../../../api/userApi'

// Helpers
import { reduceStringInside } from '../../../helpers'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { Coin } from '../../../types/domain'
import type { SettingsStackParamList } from '../../../types/navigation'

/** Detalle de un método guardado: el backend manda pares o mapa plano. */
type MethodDetail = { name?: string, key?: string, value?: string, val?: string }

/** Método de pago guardado (`GET /user/payment-methods`). */
type PaymentMethod = {
	id?: string | number
	uuid?: string
	/** Alias en mayúsculas que el backend ha mandado alguna vez. */
	ID?: string | number
	Id?: string | number
	name?: string
	coin?: { name?: string, logo?: string }
	details?: MethodDetail[] | Record<string, unknown> | null
	Details?: MethodDetail[] | Record<string, unknown> | null
}

/** Recurso cargado: lista + error de carga. */
type MethodsData = { methods: PaymentMethod[], error: string | null }

type MethodsAction = { type: 'set', field: keyof MethodsData, value: unknown }

/** Asistente de alta: moneda elegida + campos de `working_data` + nombre. */
type CreateState = {
	showCreate: boolean
	showCoinPicker: boolean
	selectedCoin: Coin | null
	workingForm: Record<string, string>
	paymentMethodName: string
	creating: boolean
}

type CreateAction =
	| { type: 'open' }
	| { type: 'close' }
	| { type: 'selectCoin', coin: Coin }
	| { type: 'showCoinPicker', value: boolean }
	| { type: 'setField', key: string, value: string }
	| { type: 'setName', value: string }
	| { type: 'setCreating', value: boolean }

// Helpers
const keyFromFieldName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Fetched resource (methods + coins + error) and the create-method wizard are two cohesive units
function dataReducer(state: MethodsData, action: MethodsAction): MethodsData {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

const initialCreate: CreateState = { showCreate: false, showCoinPicker: false, selectedCoin: null, workingForm: {}, paymentMethodName: '', creating: false }

function createReducer(state: CreateState, action: CreateAction): CreateState {
	switch (action.type) {
		case 'open':
			return { ...initialCreate, showCreate: true }
		case 'close':
			return initialCreate
		case 'selectCoin':
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
	const { showCreate, showCoinPicker, selectedCoin, workingForm, paymentMethodName, creating } = create

	// Derived working fields from selected coin
	const workingFields = useMemo(() => {
		if (!selectedCoin || !selectedCoin.working_data) return []
		try {
			const raw = typeof selectedCoin.working_data === 'string' ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
			return Array.isArray(raw) ? raw : []
		} catch (e) { return [] }
	}, [selectedCoin])

	// Fetch initial data
	useEffect(() => {
		const load = async () => {
			try {
				setLoading(true)
				dispatchData({ type: 'set', field: 'error', value: null })
				const methodsRes = await userApi.getPaymentMethods()
				if (methodsRes?.success) { dispatchData({ type: 'set', field: 'methods', value: Array.isArray(methodsRes.data) ? methodsRes.data : ((methodsRes.data as { methods?: PaymentMethod[] } | undefined)?.methods || []) }) }
				else { dispatchData({ type: 'set', field: 'error', value: methodsRes?.error || t('settings.paymentMethods.toasts.loadFailed') }) }
			} catch (e) {
				dispatchData({ type: 'set', field: 'error', value: (e as Error).message || t('settings.paymentMethods.toasts.networkError') })
			} finally { setLoading(false) }
		}
		load()
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

	// Close create modal
	const closeCreate = () => {
		if (creating) return
		dispatchCreate({ type: 'close' })
	}

	// Handle coin select
	const handleCoinSelect = (coin: Coin) => { dispatchCreate({ type: 'selectCoin', coin }) }

	// Handle create method
	const handleCreate = async () => {

		if (!selectedCoin) {
			toast.error(t('settings.paymentMethods.toasts.selectCoin'))
			return
		}

		if ((workingFields || []).length > 0) {
			const allFilled = workingFields.every((field) => ((workingForm[keyFromFieldName(field.name)] ?? '').toString().trim()).length > 0)
			if (!allFilled) {
				toast.error(t('settings.paymentMethods.toasts.missingData'), { description: t('settings.paymentMethods.toasts.missingDataDescription') })
				return
			}
		}

		try {

			dispatchCreate({ type: 'setCreating', value: true })
			// Build details as an object keyed by field name to match API response shape
			const detailsObject = (workingFields || []).reduce((acc, field) => {
				const key = keyFromFieldName(field.name)
				const value = (workingForm[key] ?? '').toString().trim()
				return { ...acc, [field.name]: value }
			}, {})


			const payload = { name: paymentMethodName, coin: selectedCoin.tick, details: detailsObject }
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

	// Handle delete method
	const handleDelete = (method: PaymentMethod) => {
		const id = method?.id || method?.uuid || method?.ID || method?.Id
		if (!id) { toast.error(t('settings.paymentMethods.toasts.invalidId')); return }
		Alert.alert(
			t('settings.paymentMethods.alerts.deleteTitle'),
			t('settings.paymentMethods.alerts.deleteBody'),
			[
				{ text: t('common.actions.cancel'), style: 'cancel' },
				{
					text: t('common.actions.delete'), style: 'destructive', onPress: async () => {
						dispatchData({ type: 'set', field: 'methods', value: methods.filter((m: PaymentMethod) => (m.id || m.uuid) !== id) })
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
							const rawDetails = (method && (method.details || method.Details)) || null
							const details: MethodDetail[] = Array.isArray(rawDetails) ? rawDetails : (rawDetails && typeof rawDetails === 'object') ? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? '') })) : []
							return (
								<View key={method.id || method.uuid || JSON.stringify(method)} style={[containerStyles.card, { marginVertical: 4 }]}>
									<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
										<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
											<QPCoin coin={logo} size={28} />
											<Text style={textStyles.h4}>{name}</Text>
										</View>
										<Pressable onPress={() => handleDelete(method)} style={{ padding: 6 }}>
											<FontAwesome6 name="trash" size={16} color={theme.colors.danger} iconStyle="solid" />
										</Pressable>
									</View>
									{!!details && details.length > 0 && (
										<View style={{ marginTop: 8, gap: 4 }}>
											{details.slice(0, 4).map((d, idx) => (
												<View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
													<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name || d.key}</Text>
													{d.name === "Wallet" ? (
														<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{reduceStringInside((d.value || d.val) as string, 8)}</Text>
													) : (
														<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{d.value || d.val}</Text>
													)}
												</View>
											))}
										</View>
									)}
								</View>
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
							<Text style={textStyles.h4}>{t('settings.paymentMethods.modal.title')}</Text>
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
							<Pressable style={[styles.selector, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => dispatchCreate({ type: 'showCoinPicker', value: true })}>
								{selectedCoin ? (
									<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
									</View>
								) : (
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{t('settings.paymentMethods.modal.selectCoin')}</Text>
								)}
								<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
							</Pressable>

							{/* Dynamic fields */}
							{!!selectedCoin && workingFields.length > 0 && (
								<View style={{ marginTop: 12 }}>
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>{t('settings.paymentMethods.modal.accountData')}</Text>
									{workingFields.map((field) => {
										const key = keyFromFieldName(field.name)
										return (
											<QPInput
												key={key}
												value={workingForm[key] || ''}
												onChangeText={(text) => dispatchCreate({ type: 'setField', key, value: text })}
												placeholder={field.name}
												keyboardType={field.type === 'number' ? 'numeric' : 'default'}
												style={{ marginVertical: 6 }}
												autoCapitalize="none"
											/>
										)
									})}
								</View>
							)}

						</ScrollView>

						{/* Actions */}
						<View style={[containerStyles.bottomButtonContainer, { paddingHorizontal: 20 }]}>
							<QPButton
								title={t('settings.paymentMethods.modal.saveButton')}
								onPress={handleCreate}
								loading={creating}
								disabled={creating || !selectedCoin}
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