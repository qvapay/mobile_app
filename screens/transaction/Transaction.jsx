import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// API
import { transferApi } from '../../api/transferApi'

// Helpers
import { getShortDateTime, statusText, getFirstChunk, copyTextToClipboard } from '../../helpers'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Toast
import Toast from 'react-native-toast-message'
import QPButton from '../../ui/particles/QPButton'
import ProfileContainer from '../../ui/ProfileContainer'

const Transaction = ({ route, navigation }) => {

	const { transaction } = route.params
	const [transactionDetails, setTransactionDetails] = useState(transaction)
	const [loading, setLoading] = useState(false)

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Fetch detailed transaction data
	useEffect(() => {
		const fetchTransactionDetails = async () => {
			setLoading(true)
			try {
				const response = await transferApi.getTransactionDetails(transaction.uuid)
				if (response.success) {
					setTransactionDetails(response.data.data)
				}
			} catch (error) {
				console.error('Error fetching transaction details:', error)
			} finally { setLoading(false) }
		}
		fetchTransactionDetails()
	}, [transaction.uuid])

	// Determine transaction type and colors
	const user_uuid = user?.uuid || ''
	const paid_by_uuid = transactionDetails.paid_by?.uuid || ''
	const isPaidByMe = user_uuid == paid_by_uuid
	const transactionSign = isPaidByMe ? '-' : '+'
	const transactionColor = isPaidByMe ? theme.colors.danger : theme.colors.successText
	const badgeColor = isPaidByMe ? theme.colors.danger : theme.colors.success
	const badgeIcon = isPaidByMe ? 'arrow-up' : 'arrow-down'

	// Get the other user (not the current user)
	const otherUser = isPaidByMe ? transactionDetails.user : transactionDetails.paid_by

	// Format amount
	const amountFloat = parseFloat(transactionDetails.amount)
	const amountFixed = amountFloat.toFixed(2)

	// Handle PDF download
	const handleDownloadPDF = async () => {
		try {
			const response = await transferApi.getTransactionPDF(transactionDetails.uuid)
			if (response.success) {
				Toast.show({ type: 'success', text1: 'Éxito', text2: 'PDF descargado correctamente' })
			} else { Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo descargar el PDF' }) }
		} catch (error) { Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo descargar el PDF' }) }
	}

	console.log(transactionDetails)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

				{/* Profile Container */}
				<ProfileContainer user={otherUser} />

				{/* Amount Section */}
				<View style={styles.amountSection}>
					<Text style={[textStyles.amount, { color: transactionColor, fontSize: 48 }]}>
						{transactionSign}${amountFixed}
					</Text>
				</View>

				{/* Transaction Details Card */}

				<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 5 }]}>Detalles de la Transacción:</Text>

				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>

					<View style={styles.detailRow}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>ID:</Text>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transactionDetails.uuid)}</Text>
							<Pressable onPress={() => copyTextToClipboard(transactionDetails.uuid)}>
								<FontAwesome6 name="copy" size={16} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>
					</View>

					<View style={styles.detailRow}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Monto:</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>${amountFixed}</Text>
					</View>

					<View style={styles.detailRow}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Tipo de Pago:</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
							{transactionDetails?.p2p?.uuid && 'P2P'}
						</Text>
					</View>

					{transactionDetails?.p2p?.uuid && (
						<View style={styles.detailRow}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>P2P:</Text>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transactionDetails?.p2p?.uuid)}</Text>
								<Pressable onPress={() => navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: transactionDetails?.p2p?.uuid })}>
									<FontAwesome6 name="arrow-up-right-from-square" size={12} color={theme.colors.primaryText} iconStyle="solid" />
								</Pressable>
							</View>
						</View>
					)}

					<View style={styles.detailRow}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Estado:</Text>
						<View style={[styles.statusBadge, { backgroundColor: theme.colors.success }]}>
							<Text style={[textStyles.h6, { color: theme.colors.almostBlack, fontWeight: '600' }]}>
								{statusText(transactionDetails.status)}
							</Text>
						</View>
					</View>

					{transactionDetails.description && (
						<View style={styles.detailRow}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Nota:</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
								{transactionDetails.description}
							</Text>
						</View>
					)}

					<View style={[styles.detailRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Fecha:</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
							{getShortDateTime(transactionDetails.created_at)}
						</Text>
					</View>

				</View>

				{/* Action Buttons */}
				<View style={containerStyles.bottomButtonContainer}>
					<QPButton
						title="Descargar"
						icon="download"
						iconColor="white"
						onPress={handleDownloadPDF}
						style={{ backgroundColor: theme.colors.primary }}
						textStyle={{ color: theme.colors.almostWhite }}
						iconStyle="solid"
					/>
				</View>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	amountSection: {
		alignItems: 'center',
		paddingVertical: 20,
	},
	detailsCard: {
		borderRadius: 16,
		paddingVertical: 15,
		paddingHorizontal: 20,
		marginVertical: 5,
	},
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255, 255, 255, 0.1)',
	},
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
})

export default Transaction