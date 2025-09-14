import { useEffect, useMemo, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, Keyboard, View } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPInput from '../../../ui/particles/QPInput'
import QPLoader from '../../../ui/particles/QPLoader'
import QPCoin from '../../../ui/particles/QPCoin'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// API
import coinsApi from '../../../api/coinsApi'
import { userApi } from '../../../api/userApi'

// Helpers
import { reduceStringInside } from '../../../helpers'

// Helpers
const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const PaymentMethods = () => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// State
	const [loading, setLoading] = useState(true)
	const [methods, setMethods] = useState([])
	const [availableCoins, setAvailableCoins] = useState([])
	const [error, setError] = useState(null)
	const [refreshing, setRefreshing] = useState(false)

	// Create flow state
	const [showCreate, setShowCreate] = useState(false)
	const [showCoinPicker, setShowCoinPicker] = useState(false)
	const [coinSearch, setCoinSearch] = useState('')
	const [selectedCoin, setSelectedCoin] = useState(null)
	const [workingForm, setWorkingForm] = useState({})
	const [paymentMethodName, setPaymentMethodName] = useState('')
	const [creating, setCreating] = useState(false)

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
				setError(null)
				const [coinsRes, methodsRes] = await Promise.all([coinsApi.index(), userApi.getPaymentMethods()])
				if (coinsRes?.success && Array.isArray(coinsRes.data)) { setAvailableCoins(coinsRes.data) }
				if (methodsRes?.success) { setMethods(Array.isArray(methodsRes.data) ? methodsRes.data : (methodsRes.data?.methods || [])) }
				else { setError(methodsRes?.error || 'No se pudieron cargar los métodos de pago') }
			} catch (e) {
				setError(e.message || 'Error de red')
			} finally { setLoading(false) }
		}
		load()
	}, [])

	// Refresh methods
	const refresh = async () => {
		try {
			setRefreshing(true)
			const res = await userApi.getPaymentMethods()
			if (res.success) { setMethods(Array.isArray(res.data) ? res.data : (res.data?.methods || [])) }
			else { Toast.show({ type: 'error', text1: res.error || 'No se pudieron cargar los métodos de pago' }) }
		} catch (e) { Toast.show({ type: 'error', text1: e.message || 'Error de red' }) }
		finally { setRefreshing(false) }
	}

	// Open create modal
	const openCreate = () => {
		setShowCreate(true)
		setSelectedCoin(null)
		setWorkingForm({})
	}

	// Close create modal
	const closeCreate = () => {
		if (creating) return
		setShowCreate(false)
		setSelectedCoin(null)
		setWorkingForm({})
		setShowCoinPicker(false)
		setCoinSearch('')
	}

	// Handle coin select
	const handleCoinSelect = (coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		setWorkingForm({})
	}

	// Handle create method
	const handleCreate = async () => {

		if (!selectedCoin) {
			Toast.show({ type: 'error', text1: 'Selecciona una moneda' })
			return
		}

		console.log(selectedCoin)

		if ((workingFields || []).length > 0) {
			const allFilled = workingFields.every((field) => ((workingForm[keyFromFieldName(field.name)] ?? '').toString().trim()).length > 0)
			if (!allFilled) {
				Toast.show({ type: 'error', text1: 'Faltan datos', text2: 'Completa los campos requeridos' })
				return
			}
		}

		console.log(workingFields)

		try {

			setCreating(true)
			// Build details as an object keyed by field name to match API response shape
			const detailsObject = (workingFields || []).reduce((acc, field) => {
				const key = keyFromFieldName(field.name)
				const value = (workingForm[key] ?? '').toString().trim()
				return { ...acc, [field.name]: value }
			}, {})


			const payload = { name: paymentMethodName, coin: selectedCoin.tick, details: detailsObject }
			const res = await userApi.createPaymentMethod(payload)

			if (res.success) {
				Toast.show({ type: 'success', text1: 'Método creado' })
				await refresh()
				closeCreate()
			} else { Toast.show({ type: 'error', text1: res.error || 'No se pudo crear el método' }) }
		} catch (e) {
			Toast.show({ type: 'error', text1: e.message || 'Error de red' })
		} finally { setCreating(false) }
	}

	// Handle delete method
	const handleDelete = (method) => {

		const id = method?.id || method?.uuid || method?.ID || method?.Id
		if (!id) { Toast.show({ type: 'error', text1: 'ID de método inválido' }); return }
		Alert.alert(
			'Eliminar método',
			'¿Seguro que deseas eliminar este método de pago?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Eliminar', style: 'destructive', onPress: async () => {
						try {
							const res = await userApi.deletePaymentMethod(id)
							if (res.success) { Toast.show({ type: 'success', text1: 'Método eliminado' }); refresh() }
							else { Toast.show({ type: 'error', text1: res.error || 'No se pudo eliminar' }) }
						} catch (e) { Toast.show({ type: 'error', text1: e.message || 'Error de red' }) }
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
				<View style={{ marginTop: 10 }}>
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
								<View key={method.id || method.uuid || JSON.stringify(method)} style={containerStyles.card}>
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
													{d.name == "Wallet" ? (
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

			{/* Bottom Button */}
			<View style={containerStyles.bottomButtonContainer}>
				<QPButton title="Agregar método" onPress={openCreate} icon="plus" textStyle={{ color: theme.colors.buttonText }} />
			</View>

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
							<QPInput value={paymentMethodName} onChangeText={setPaymentMethodName} placeholder="Nombre del método" style={{ marginVertical: 6 }} />

							{/* Coin selector */}
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>Moneda</Text>
							<Pressable style={[styles.selector, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => setShowCoinPicker(true)}>
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
												onChangeText={(text) => setWorkingForm((prev) => ({ ...prev, [key]: text }))}
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
						<Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCoinPicker(false)}>
							<View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
								<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
									<Text style={textStyles.h4}>Seleccionar Moneda</Text>
									<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
										<Pressable onPress={() => setShowCoinPicker(false)} style={styles.closeButton}>
											<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
										</Pressable>
									</View>
								</View>
								<View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
									<QPInput value={coinSearch} onChangeText={setCoinSearch} placeholder="Buscar moneda..." prefixIconName="magnifying-glass" style={styles.searchInput} />
								</View>
								<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
									{(availableCoins || [])
										.filter((coin) => (coin.name || '').toLowerCase().includes(coinSearch.toLowerCase()) || (coin.tick || '').toLowerCase().includes(coinSearch.toLowerCase()))
										.map((coin) => (
											<Pressable key={coin.id || coin.tick} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => handleCoinSelect(coin)}>
												<QPCoin coin={coin.logo} size={40} />
												<View style={{ marginLeft: 12, flex: 1 }}>
													<Text style={textStyles.h4}>{coin.name}</Text>
													<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Ticker: {coin.tick}</Text>
												</View>
											</Pressable>
										))}
								</ScrollView>
							</View>
						</Modal>

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
	coinList: { flex: 1 },
	coinListContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
	coinItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 15,
		borderRadius: 10,
		marginBottom: 10,
		borderWidth: 0.5,
		borderColor: 'rgba(255, 255, 255, 0.2)'
	},
	searchInput: { marginVertical: 0 },
})

export default PaymentMethods