import { useState, useEffect, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// Auth
import { useAuth } from '../../auth/AuthContext'

// API
import { transferApi } from '../../api/transferApi'
import { payApi } from '../../api/payApi'

// Routes
import { ROUTES } from '../../routes'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'

// Helpers
import { getShortDateTime, getFirstChunk, statusText, copyTextToClipboard } from '../../helpers'

// Toast & haptics
import { toast } from 'sonner-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// FastImage for merchant logos
import FastImage from '@d11/react-native-fast-image'

// Lottie for success animation
import LottieView from 'lottie-react-native'

const MOODS = [
	{ value: '', icon: 'face-meh-blank', label: 'Ninguna', color: '#9CA3AF' },
	{ value: 'loved', icon: 'heart', label: 'Encantado', color: '#F472B6' },
	{ value: 'happy', icon: 'face-smile', label: 'Feliz', color: '#34D399' },
	{ value: 'thumbsy', icon: 'thumbs-up', label: 'Genial', color: '#60A5FA' },
	{ value: 'sad', icon: 'face-frown', label: 'Triste', color: '#FBBF24' },
]

// Normalize detail-API shape (lowercase keys) for rendering
const normalize = (tx) => ({
	...tx,
	user: tx.user ?? tx.User ?? null,
	paid_by: tx.paid_by ?? tx.PaidBy ?? null,
	app: tx.app ?? tx.App ?? null,
})

// Status colors helper
const getStatusColor = (status, theme) => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'open': case 'processing': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		default: return theme.colors.secondaryText
	}
}

// Pay Screen — shown from the bottom, handles invoice pay/cancel (deep-linked from pay/:uuid)
const Pay = ({ route, navigation }) => {

	const { uuid } = route.params || {}

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()

	// State
	const [transaction, setTransaction] = useState(null)
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState(null)
	const [paying, setPaying] = useState(false)
	const [payError, setPayError] = useState(null)
	const [success, setSuccess] = useState(false)
	const [selectedMood, setSelectedMood] = useState('')

	// Fetch transaction
	const fetchTransaction = useCallback(async () => {
		if (!uuid) return
		setLoading(true)
		setLoadError(null)
		try {
			const response = await transferApi.getTransactionDetails(uuid)
			if (response.success) {
				setTransaction(normalize(response.data.data))
			} else {
				setLoadError(response.error || 'No se pudo cargar la factura')
			}
		} catch (error) {
			setLoadError(error?.message || 'Error al cargar la factura')
		} finally { setLoading(false) }
	}, [uuid])

	useEffect(() => { fetchTransaction() }, [fetchTransaction])

	// Derived
	const amountFloat = parseFloat(transaction?.amount || 0)
	const amountFixed = amountFloat.toFixed(2)
	const balanceFloat = parseFloat(user?.balance || 0)
	const hasEnough = balanceFloat >= amountFloat
	const isOwn = transaction?.user?.uuid && user?.uuid && transaction.user.uuid === user.uuid
	const alreadyPaid = transaction?.status && transaction.status !== 'pending'
	const canPay = !!transaction && !alreadyPaid && !isOwn && hasEnough

	// Close / cancel
	const handleClose = () => {
		if (navigation.canGoBack()) {
			navigation.goBack()
		} else {
			navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_STACK }] })
		}
	}

	// Pay action
	const handlePay = async () => {
		if (!canPay || paying) return
		ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
		setPaying(true)
		setPayError(null)
		try {
			const result = await payApi.payTransaction(transaction.uuid, selectedMood)
			if (result.success) {
				setSuccess(true)
				toast.success('Pago realizado', { description: `Pagaste $${amountFixed} a ${transaction.app?.name || transaction.user?.name || 'QvaPay'}` })
				setTimeout(() => { handleClose() }, 1800)
			} else {
				setPayError(result.error || 'No se pudo procesar el pago')
				toast.error('Error', { description: result.error || 'No se pudo procesar el pago' })
			}
		} catch (error) {
			setPayError(error?.message || 'Error al procesar el pago')
		} finally { setPaying(false) }
	}

	// Loading
	if (loading) {
		return (
			<View style={[styles.backdrop, { backgroundColor: theme.colors.background }]}>
				<View style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 16 }]}>
					<View style={styles.handle} />
					<View style={{ padding: 40, alignItems: 'center' }}>
						<FontAwesome6 name="spinner" size={28} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: 14 }]}>Cargando factura…</Text>
					</View>
				</View>
			</View>
		)
	}

	// Not found / error
	if (loadError || !transaction) {
		return (
			<View style={[styles.backdrop, { backgroundColor: theme.colors.background }]}>
				<View style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 16 }]}>
					<View style={styles.handle} />
					<View style={{ padding: 24, alignItems: 'center' }}>
						<FontAwesome6 name="circle-exclamation" size={40} color={theme.colors.danger} iconStyle="solid" />
						<Text style={[textStyles.h3, { marginTop: 16, textAlign: 'center' }]}>Factura no disponible</Text>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 8, textAlign: 'center' }]}>
							{loadError || 'No se encontró la factura solicitada'}
						</Text>
						<QPButton title="Cerrar" onPress={handleClose} style={{ marginTop: 20 }} textStyle={{ color: theme.colors.buttonText }} />
					</View>
				</View>
			</View>
		)
	}

	// Merchant (app) data
	const app = transaction.app
	const merchantName = app?.name || transaction.user?.name || 'QvaPay'
	const merchantLogo = app?.logo ? { uri: app.logo.startsWith('http') ? app.logo : `https://media.qvapay.com/${app.logo}` } : null

	return (
		<View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
			<Pressable style={styles.overlayPress} onPress={handleClose} />

			<View style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]}>

				<View style={styles.handle} />

				<Pressable style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]} onPress={handleClose} hitSlop={8}>
					<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>

				<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingTop: 20 }}>

					{/* Merchant header */}
					<View style={styles.merchantHeader}>
						{merchantLogo ? (
							<FastImage source={merchantLogo} style={styles.merchantLogo} resizeMode={FastImage.resizeMode.cover} />
						) : transaction.user ? (
							<QPAvatar user={transaction.user} size={72} />
						) : (
							<View style={[styles.merchantLogo, { backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
								<FontAwesome6 name="store" size={28} color={theme.colors.primary} iconStyle="solid" />
							</View>
						)}
						<Text style={[textStyles.h3, { marginTop: 12, textAlign: 'center' }]}>{merchantName}</Text>
						{app?.desc ? (
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]} numberOfLines={2}>{app.desc}</Text>
						) : null}
					</View>

					{/* Amount */}
					<View style={styles.amountWrap}>
						<Text style={[textStyles.amount, { fontSize: theme.typography.fontSize.display }]}>${amountFixed}</Text>
						<View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status, theme) }]}>
							<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>{statusText(transaction.status)}</Text>
						</View>
					</View>

					{/* Summary card */}
					<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>

						<View style={styles.row}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>ID</Text>
							<Pressable onPress={() => copyTextToClipboard(transaction.uuid)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transaction.uuid)}</Text>
								<FontAwesome6 name="copy" size={13} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>

						{transaction.description ? (
							<View style={[styles.row, { alignItems: 'flex-start' }]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Concepto</Text>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1, textAlign: 'right', marginLeft: 16 }]} numberOfLines={3}>
									{transaction.description}
								</Text>
							</View>
						) : null}

						<View style={[styles.row, styles.rowLast]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Fecha</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getShortDateTime(transaction.created_at)}</Text>
						</View>

					</View>

					{/* Balance hint */}
					{!alreadyPaid && !isOwn && (
						<View style={[styles.balanceHint, { backgroundColor: hasEnough ? theme.colors.surface : theme.colors.danger + '20' }]}>
							<FontAwesome6 name={hasEnough ? 'wallet' : 'triangle-exclamation'} size={14} color={hasEnough ? theme.colors.secondaryText : theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: hasEnough ? theme.colors.secondaryText : theme.colors.danger, marginLeft: 8 }]}>
								{hasEnough ? `Saldo disponible: $${balanceFloat.toFixed(2)}` : `Saldo insuficiente ($${balanceFloat.toFixed(2)})`}
							</Text>
						</View>
					)}

					{/* Reaction selector */}
					{canPay && !success && (
						<View style={{ marginTop: 20 }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 10 }]}>¿Cómo te sientes con este pago?</Text>
							<View style={styles.moodsRow}>
								{MOODS.map((mood) => {
									const selected = selectedMood === mood.value
									return (
										<Pressable key={mood.value || 'none'} onPress={() => setSelectedMood(mood.value)} style={[styles.moodChip, { backgroundColor: selected ? mood.color : theme.colors.surface, borderColor: selected ? mood.color : theme.colors.border }]} >
											<FontAwesome6 name={mood.icon} size={16} color={selected ? '#fff' : mood.color} iconStyle="solid" />
											<Text style={[textStyles.h7, { color: selected ? '#fff' : theme.colors.primaryText, marginLeft: 6 }]}>{mood.label}</Text>
										</Pressable>
									)
								})}
							</View>
						</View>
					)}

					{/* Success state */}
					{success && (
						<View style={styles.successWrap}>
							<LottieView source={require('../../assets/lotties/transfer_ok.json')} autoPlay loop={false} style={{ width: 140, height: 140 }} />
							<Text style={[textStyles.h3, { color: theme.colors.success, marginTop: 8 }]}>Pago realizado</Text>
						</View>
					)}

					{/* Pay error */}
					{payError && !success ? (<Text style={[textStyles.error, { marginTop: 14, textAlign: 'center' }]}>{payError}</Text>) : null}

					{/* Already paid / own transaction info */}
					{alreadyPaid && (
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 16 }]}>
							Esta factura ya fue {statusText(transaction.status).toLowerCase()}.
						</Text>
					)}
					{isOwn && !alreadyPaid && (
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 16 }]}>
							No puedes pagar una factura que creaste tú mismo.
						</Text>
					)}

				</ScrollView>

				{/* Actions */}
				<View style={[styles.actions, { paddingHorizontal: theme.spacing.md }]}>
					{canPay && !success ? (
						<>
							<QPButton
								title={`Pagar $${amountFixed}`}
								icon="lock"
								iconColor={theme.colors.buttonText}
								onPress={handlePay}
								loading={paying}
								disabled={paying}
								textStyle={{ color: theme.colors.buttonText }}
							/>
							<QPButton
								title="Cancelar"
								onPress={handleClose}
								style={{ backgroundColor: 'transparent' }}
								textStyle={{ color: theme.colors.secondaryText }}
							/>
						</>
					) : (
						<QPButton
							title="Cerrar"
							onPress={handleClose}
							style={{ backgroundColor: theme.colors.surface }}
							textStyle={{ color: theme.colors.primaryText }}
						/>
					)}
				</View>

			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		justifyContent: 'flex-end',
	},
	overlayPress: {
		position: 'absolute',
		top: 0, left: 0, right: 0, bottom: 0,
	},
	sheet: {
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		maxHeight: '92%',
		paddingTop: 10,
	},
	handle: {
		alignSelf: 'center',
		width: 44,
		height: 5,
		borderRadius: 3,
		backgroundColor: 'rgba(128,128,128,0.4)',
		marginBottom: 6,
	},
	closeBtn: {
		position: 'absolute',
		top: 14,
		right: 16,
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 10,
	},
	merchantHeader: {
		alignItems: 'center',
		marginTop: 10,
		marginBottom: 8,
	},
	merchantLogo: {
		width: 72,
		height: 72,
		borderRadius: 36,
	},
	amountWrap: {
		alignItems: 'center',
		marginVertical: 14,
		gap: 8,
	},
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
	card: {
		borderRadius: 16,
		paddingHorizontal: 16,
		paddingVertical: 6,
		marginTop: 8,
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.08)',
	},
	rowLast: {
		borderBottomWidth: 0,
	},
	balanceHint: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		marginTop: 12,
	},
	moodsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	moodChip: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
	},
	successWrap: {
		alignItems: 'center',
		marginTop: 20,
	},
	actions: {
		paddingTop: 8,
	},
})

export default Pay
