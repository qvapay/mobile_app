import { useState, useEffect, useCallback } from 'react'
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

const Savings = ({ route }) => {

	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)

	// Use params if passed from Invest, otherwise fetch
	const [savings, setSavings] = useState(route.params?.savings || null)
	const [isLoading, setIsLoading] = useState(!route.params?.savings)

	const fetchSavings = useCallback(async () => {
		setIsLoading(true)
		try {
			const res = await savingApi.getSummary()
			if (res.success) setSavings(res.data)
		} catch {
			// silently handle
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		if (!route.params?.savings) fetchSavings()
	}, [route.params?.savings, fetchSavings])

	if (isLoading) return <QPLoader />

	const balance = Number(savings?.balance || 0).toFixed(2)
	const rate = savings?.currentRate || 0
	const totalDeposited = Number(savings?.total_deposited || 0).toFixed(2)
	const totalWithdrawn = Number(savings?.total_withdrawn || 0).toFixed(2)
	const totalEarned = Number(savings?.total_earned || 0).toFixed(2)

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
					<Text style={[styles.heroRate, { color: theme.colors.secondaryText }]}>
						<Text style={{ color: theme.colors.successText, fontFamily: 'Rubik-Bold' }}>{rate}%</Text> anual
					</Text>
				</View>

				{/* Action buttons */}
				<View style={styles.buttonsRow}>
					<QPButton
						title="Depositar"
						icon="arrow-down"
						onPress={() => { }}
						style={styles.actionButton}
					/>
					<QPButton
						title="Retirar"
						icon="arrow-up"
						onPress={() => { }}
						style={styles.actionButton}
						outlined
						danger={false}
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
				<View style={styles.emptyActivity}>
					<FontAwesome6 name="clock-rotate-left" size={32} color={theme.colors.secondaryText + '60'} iconStyle="solid" />
					<Text style={[styles.emptyText, { color: theme.colors.secondaryText }]}>
						Las operaciones aparecerán aquí
					</Text>
				</View>

				{/* Separator */}
				<View style={[styles.separator, { borderBottomColor: theme.colors.border + '40' }]} />

				{/* Disclaimer */}
				<View style={styles.disclaimer}>
					<FontAwesome6 name="shield-halved" size={20} color={theme.colors.secondaryText + '80'} iconStyle="solid" />
					<Text style={[styles.disclaimerText, { color: theme.colors.tertiaryText }]}>
						El servicio de ahorros de QvaPay genera intereses sobre tu balance depositado. Los fondos pueden ser retirados en cualquier momento. Las tasas de interés están sujetas a cambios.
					</Text>
					<Text
						style={[styles.disclaimerLink, { color: theme.colors.primary }]}
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
		<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>{label}</Text>
		<Text style={[styles.statValue, { color: valueColor || theme.colors.primaryText }]}>{value}</Text>
	</View>
)

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
	heroRate: {
		fontSize: 15,
		fontFamily: 'Rubik-Regular',
	},
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
	statLabel: {
		fontSize: 14,
		fontFamily: 'Rubik-Regular',
	},
	statValue: {
		fontSize: 14,
		fontFamily: 'Rubik-SemiBold',
	},
	// Separator
	separator: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		marginVertical: 16,
	},
	// Activity
	sectionTitle: {
		marginBottom: 16,
	},
	emptyActivity: {
		alignItems: 'center',
		paddingVertical: 32,
		gap: 12,
	},
	emptyText: {
		fontSize: 14,
		fontFamily: 'Rubik-Regular',
		textAlign: 'center',
	},
	// Disclaimer
	disclaimer: {
		alignItems: 'center',
		paddingVertical: 8,
		gap: 8,
	},
	disclaimerText: {
		fontSize: 12,
		fontFamily: 'Rubik-Regular',
		textAlign: 'center',
		lineHeight: 18,
		paddingHorizontal: 16,
	},
	disclaimerLink: {
		fontSize: 13,
		fontFamily: 'Rubik-Medium',
	},
})

export default Savings
