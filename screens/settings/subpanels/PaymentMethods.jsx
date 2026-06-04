import { useEffect, useMemo, useState, useReducer } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, Keyboard, View } from 'react-native'

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
import coinsApi from '../../../api/coinsApi'
import { userApi } from '../../../api/userApi'

// Helpers
import { reduceStringInside } from '../../../helpers'

// Helpers
const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Fetched resource (methods + coins + error) and the create-method wizard are two cohesive units
function dataReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

const initialCreate = { showCreate: false, showCoinPicker: false, selectedCoin: null, workingForm: {}, paymentMethodName: '', creating: false }

function createReducer(state, action) {
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

const PaymentMethods = ({ navigation }) => {

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
	const [data, dispatchData] = useReducer(dataReducer, { methods: [], availableCoins: [], error: null })
	const { methods, availableCoins, error } = data
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
				const [coinsRes, methodsRes] = await Promise.all([coinsApi.index(), userApi.getPaymentMethods()])
				if (coinsRes?.success && Array.isArray(coinsRes.data)) { dispatchData({ type: 'set', field: 'availableCoins', value: coinsRes.data }) }
				if (methodsRes?.success) { dispatchData({ type: 'set', field: 'methods', value: Array.isArray(methodsRes.data) ? methodsRes.data : (methodsRes.data?.methods || []) }) }
				else { dispatchData({ type: 'set', field: 'error', value: methodsRes?.error || 'No se pudieron cargar los métodos de pago' }) }
			} catch (e) {
				dispatchData({ type: 'set', field: 'error', value: e.message || 'Error de red' })
			} finally { setLoading(false) }
		}
		load()
	}, [])

	// Refresh methods
	const refresh = async () => {
		try {
			setRefreshing(true)
			const res = await userApi.getPaymentMethods()
			if (res.success) { dispatchData({ type: 'set', field: 'methods', value: Array.isArray(res.data) ? res.data : (res.data?.methods || []) }) }
			else { toast.error(res.error || 'No se pudieron cargar los métodos de pago') }
		} catch (e) { toast.error(e.message || 'Error de red') }
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
	const handleCoinSelect = (coin) => { dispatchCreate({ type: 'selectCoin', coin }) }

	// Handle create method
	const handleCreate = async () => {

		if (!selectedCoin) {
			toast.error('Selecciona una moneda')
			return
		}

		if ((workingFields || []).length > 0) {
			const allFilled = workingFields.every((field) => ((workingForm[keyFromFieldName(field.name)] ?? '').toString().trim()).length > 0)
			if (!allFilled) {
				toast.error('Faltan datos', { description: 'Completa los campos requeridos' })
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
				toast.success('Método creado')
				await refresh()
				closeCreate()
			} else { toast.error(res.error || 'No se pudo crear el método') }
		} catch (e) {
			toast.error(e.message || 'Error de red')
		} finally { dispatchCreate({ type: 'setCreating', value: false }) }
	}

	// Handle delete method
	const handleDelete = (method) => {
		const id = method?.id || method?.uuid || method?.ID || method?.Id
		if (!id) { toast.error('ID de método inválido'); return }
		Alert.alert(
			'Eliminar método',
			'¿Seguro que deseas eliminar este método de pago?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Eliminar', style: 'destructive', onPress: async () => {
						dispatchData({ type: 'set', field: 'methods', value: methods.filter(m => (m.id || m.uuid) !== id) })
						try {
							const res = await userApi.deletePaymentMethod(id)
							if (res.success) { toast.success('Método eliminado') }
							else { toast.error(res.error || 'No se pudo eliminar'); refresh() }
						} catch (e) { toast.error(e.message || 'Error de red'); refresh() }
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

				<Text style={textStyles.h1}>Métodos de Pago</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Administra tus cuentas y métodos usados en P2P</Text>

				{error && (
					<View style={[containerStyles.card, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
						<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{String(error)}</Text>
					</View>
				)}

				{/* Methods list */}
				<View style={{ marginTop: 10, marginBottom: 20 }}>
					{methods.length === 0 ? (
						<View style={[containerStyles.card, { alignItems: 'center' }]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>No tienes métodos de pago guardados</Text>
						</View>
					) : (
						methods.map((method) => {
							const name = method?.name || method?.coin?.name || 'Método'
							const logo = method?.coin?.logo
							const rawDetails = (method && (method.details || method.Details)) || null
							const details = Array.isArray(rawDetails) ? rawDetails : (rawDetails && typeof rawDetails === 'object') ? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? '') })) : []
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
														<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{reduceStringInside(d.value || d.val, 8)}</Text>
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
							<Text style={textStyles.h4}>Nuevo Método de Pago</Text>
							<Pressable onPress={closeCreate} style={styles.closeButton}>
								<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>

						<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 }}>

							{/* Name */}
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>Nombre</Text>
							<QPInput value={paymentMethodName} onChangeText={(v) => dispatchCreate({ type: 'setName', value: v })} placeholder="Nombre del método" style={{ marginVertical: 6 }} />

							{/* Coin selector */}
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>Moneda</Text>
							<Pressable style={[styles.selector, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => dispatchCreate({ type: 'showCoinPicker', value: true })}>
								{selectedCoin ? (
									<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
									</View>
								) : (
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Seleccionar moneda</Text>
								)}
								<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
							</Pressable>

							{/* Dynamic fields */}
							{!!selectedCoin && workingFields.length > 0 && (
								<View style={{ marginTop: 12 }}>
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>Datos de la cuenta</Text>
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
								title="Guardar método"
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
							selectedCoin={selectedCoin}
							showFees={false}
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