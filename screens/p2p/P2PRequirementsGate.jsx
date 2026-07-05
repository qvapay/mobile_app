import { View, Text, ScrollView, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { ROUTES } from '../../routes'
import QPPressable from '../../ui/particles/QPPressable'

// Shown when the user hasn't met the P2P requirements (KYC + phone + telegram).
// Shared by the P2P marketplace and the create-offer screens.
const P2PRequirementsGate = ({ user, navigation, theme, textStyles, containerStyles }) => {

	const requirements = [
		{ key: 'kyc', label: 'Verificación de identidad', description: 'Completa la verificación de identidad para operar en P2P', icon: 'shield-halved', passed: !!user.kyc, route: ROUTES.KYC },
		{ key: 'phone', label: 'Teléfono verificado', description: 'Verifica tu número de teléfono para mayor seguridad', icon: 'phone', passed: !!user.phone_verified, route: ROUTES.PHONE },
		{ key: 'telegram', label: 'Telegram vinculado', description: 'Vincula tu cuenta de Telegram para recibir notificaciones P2P', icon: 'telegram', iconStyle: 'brand', passed: !!user.telegram_id, route: ROUTES.TELEGRAM },
	]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={styles.requirementsContainer} showsVerticalScrollIndicator={false}>
				<FontAwesome6 name="triangle-exclamation" size={40} color={theme.colors.warning} iconStyle="solid" />
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 16 }]}>Requisitos para P2P</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
					Completa los siguientes pasos para acceder al mercado P2P ({[user.kyc, user.phone_verified, user.telegram_id].filter(Boolean).length}/3)
				</Text>

				{requirements.map((req) => (
					<QPPressable
						key={req.key}
						style={[
							styles.requirementCard,
							{ backgroundColor: req.passed ? theme.colors.success + '15' : theme.colors.surface },
							theme.mode === 'light' && { borderWidth: 1, borderColor: req.passed ? theme.colors.success + '40' : theme.colors.border },
						]}
						onPress={() => !req.passed && navigation.navigate(ROUTES.SETTINGS_STACK, { screen: req.route, initial: false })}
						disabled={req.passed}
					>
						<FontAwesome6
							name={req.passed ? 'circle-check' : req.icon}
							size={20}
							color={req.passed ? theme.colors.success : theme.colors.secondaryText}
							iconStyle={req.passed ? 'solid' : (req.iconStyle || 'solid')}
						/>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h5, { color: req.passed ? theme.colors.success : theme.colors.primaryText }]}>{req.label}</Text>
							{!req.passed && (
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>{req.description}</Text>
							)}
						</View>
						{!req.passed && (
							<FontAwesome6 name="chevron-right" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
						)}
					</QPPressable>
				))}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	requirementsContainer: {
		alignItems: 'center',
		paddingVertical: 30,
	},
	requirementCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 16,
		borderRadius: 12,
		marginBottom: 10,
		width: '100%',
	},
})

export default P2PRequirementsGate
