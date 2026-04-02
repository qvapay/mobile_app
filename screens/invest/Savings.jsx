import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// API
import { savingApi } from '../../api/savingApi'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Helpers
import { timeAgo } from '../../helpers'

const Savings = ({ navigation }) => {

	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	const [savings, setSavings] = useState(null)
	const [transactions, setTransactions] = useState([])
	const [isLoading, setIsLoading] = useState(true)

	const fetchSavings = useCallback(async () => {
		setIsLoading(true)
		try {
			const [summaryRes, txRes] = await Promise.all([
				savingApi.getSummary(),
				savingApi.getTransactions(20),
			])
			if (summaryRes.success) setSavings(summaryRes.data)
			if (txRes.success && Array.isArray(txRes.data)) setTransactions(txRes.data)
		} catch {
			// silently handle
		} finally { setIsLoading(false) }
	}, [])

	useFocusEffect(
		useCallback(() => { fetchSavings() }, [fetchSavings])
	)

	if (isLoading) return <QPLoader />

	const balance = Number(savings?.balance || 0).toFixed(2)
	const rate = savings?.currentRate || 0
	const totalDeposited = Number(savings?.totalDeposited || savings?.total_deposited || 0).toFixed(2)
	const totalWithdrawn = Number(savings?.totalWithdrawn || savings?.total_withdrawn || 0).toFixed(2)
	const totalEarned = Number(savings?.totalEarned || savings?.total_earned || 0).toFixed(2)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				{/* Hero */}
				<View style={styles.hero}>
					<View style={[styles.heroIcon, { backgroundColor: theme.colors.primary + '15' }]}>
						<FontAwesome6 name="vault" size={28} color={theme.colors.primary} iconStyle="solid" />
					</View>
					<Text style={[textStyles.amount, styles.heroBalance]}>${balance}</Text>
					<Text style={[styles.heroRate, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
						<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.bold }}>{rate}%</Text> anual
					</Text>
				</View>

				{/* Action buttons */}
				<View style={styles.buttonsRow}>
					<QPButton
						title="Depositar"
						icon="arrow-down"
						onPress={() => navigation.navigate(ROUTES.SAVINGS_DEPOSIT, { mode: 'savings_deposit' })}
						style={styles.actionButton}
					/>
					<QPButton
						title="Retirar"
						icon="arrow-up"
						onPress={() => navigation.navigate(ROUTES.SAVINGS_WITHDRAW, { mode: 'savings_withdraw', savingsBalance: Number(balance) })}
						style={styles.actionButton}
						outlined
						danger={false}
						disabled={Number(balance) === 0}
					/>
				</View>

				{/* Stats */}
				{(Number(totalDeposited) > 0 || Number(totalWithdrawn) > 0 || Number(totalEarned) > 0) && (
					<View style={[styles.statsCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
						<StatRow label="Total depositado" value={`$${totalDeposited}`} theme={theme} />
						<StatRow label="Total retirado" value={`$${totalWithdrawn}`} theme={theme} />
						<StatRow label="Ganancias" value={`$${totalEarned}`} theme={theme} valueColor={theme.colors.successText} isLast />
					</View>
				)}

				{/* Separator */}
				<View style={[styles.separator, { borderBottomColor: theme.colors.border + '40' }]} />

				{/* Activity */}
				<Text style={[textStyles.h3, styles.sectionTitle]}>Actividad</Text>
				{transactions.length > 0 ? (
					<View style={[styles.activityCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && styles.cardBorder(theme)]}>
						{transactions.map((tx, index) => (
							<ActivityRow key={tx.id} tx={tx} theme={theme} isLast={index === transactions.length - 1} />
						))}
					</View>
				) : (
					<View style={styles.emptyActivity}>
						<FontAwesome6 name="clock-rotate-left" size={32} color={theme.colors.secondaryText + '60'} iconStyle="solid" />
						<Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
							Las operaciones aparecerán aquí
						</Text>
					</View>
				)}

				{/* Separator */}
				<View style={[styles.separator, { borderBottomColor: theme.colors.border + '40' }]} />

				{/* Disclaimer */}
				<View style={styles.disclaimer}>
					<FontAwesome6 name="shield-halved" size={20} color={theme.colors.secondaryText + '80'} iconStyle="solid" />
					<Text style={[styles.disclaimerText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
						El servicio de ahorros de QvaPay genera intereses sobre tu balance depositado. Los fondos pueden ser retirados en cualquier momento. Las tasas de interés están sujetas a cambios.
					</Text>
					<Text
						style={[styles.disclaimerLink, { color: theme.colors.primary, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}
						onPress={() => Linking.openURL(ROUTES.TERMS_AND_CONDITIONS)}
					>
						Términos del servicio
					</Text>
				</View>
			</ScrollView>
		</View>
	)
}

const StatRow = ({ label, value, theme, valueColor, isLast }) => (
	<View style={[styles.statRow, !isLast && styles.statBorder(theme)]}>
		<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{label}</Text>
		<Text style={[styles.statValue, { color: valueColor || theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>{value}</Text>
	</View>
)

const txConfig = {
	deposit: { icon: 'arrow-down', color: '#10B981', label: 'Depósito' },
	withdrawal: { icon: 'arrow-up', color: '#F59E0B', label: 'Retiro' },
	earning: { icon: 'coins', color: '#8B5CF6', label: 'Ganancia' },
}

const ActivityRow = ({ tx, theme, isLast }) => {
	const config = txConfig[tx.type] || txConfig.deposit
	const isPositive = tx.type === 'deposit' || tx.type === 'earning'
	const sign = isPositive ? '+' : '-'

	return (
		<View style={[styles.activityRow, !isLast && styles.statBorder(theme)]}>
			<View style={[styles.activityIcon, { backgroundColor: config.color + '18' }]}>
				<FontAwesome6 name={config.icon} size={14} color={config.color} iconStyle="solid" />
			</View>
			<View style={styles.activityInfo}>
				<Text style={[styles.activityLabel, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{tx.description || config.label}</Text>
				<Text style={[styles.activityDate, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{timeAgo(tx.createdAt)}</Text>
			</View>
			<Text style={[styles.activityAmount, { color: isPositive ? theme.colors.successText : theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>
				{sign}${Math.abs(tx.amount).toFixed(2)}
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 40,
	},
	// Hero
	hero: {
		alignItems: 'center',
		paddingTop: 20,
		paddingBottom: 24,
	},
	heroIcon: {
		width: 60,
		height: 60,
		borderRadius: 30,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 16,
	},
	heroBalance: {
		marginBottom: 4,
	},
	heroRate: {},
	// Buttons
	buttonsRow: {
		flexDirection: 'row',
		gap: 10,
		marginBottom: 20,
	},
	actionButton: {
		flex: 1,
	},
	// Stats
	statsCard: {
		borderRadius: 14,
		padding: 12,
		marginBottom: 8,
	},
	cardBorder: (theme) => ({
		borderWidth: 1,
		borderColor: theme.colors.border,
	}),
	statRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 10,
	},
	statBorder: (theme) => ({
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.colors.border + '60',
	}),
	statLabel: {},
	statValue: {},
	// Separator
	separator: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		marginVertical: 16,
	},
	// Activity
	sectionTitle: {
		marginBottom: 16,
	},
	activityCard: {
		borderRadius: 14,
		padding: 4,
		paddingHorizontal: 12,
		marginBottom: 8,
	},
	activityRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
		gap: 10,
	},
	activityIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		justifyContent: 'center',
		alignItems: 'center',
	},
	activityInfo: {
		flex: 1,
		gap: 2,
	},
	activityLabel: {},
	activityDate: {},
	activityAmount: {},
	emptyActivity: {
		alignItems: 'center',
		paddingVertical: 32,
		gap: 12,
	},
	emptyText: {
		textAlign: 'center',
	},
	// Disclaimer
	disclaimer: {
		alignItems: 'center',
		paddingVertical: 8,
		gap: 8,
	},
	disclaimerText: {
		textAlign: 'center',
		lineHeight: 18,
		paddingHorizontal: 16,
	},
	disclaimerLink: {},
})

export default Savings
