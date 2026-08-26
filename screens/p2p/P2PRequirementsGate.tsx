import { View, Text, ScrollView, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import { ROUTES } from '../../routes'
import QPPressable from '../../ui/particles/QPPressable'

import type { NavigationProp } from '@react-navigation/native'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../theme/themeUtils'
import type { RootStackParamList, SettingsStackParamList } from '../../types/navigation'
import type { User } from '../../types/domain'

type P2PRequirementsGateProps = {
	user: User
	navigation: NavigationProp<RootStackParamList>
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Shown when the user hasn't met the P2P requirements (KYC + phone + telegram).
// Shared by the P2P marketplace and the create-offer screens.
const P2PRequirementsGate = ({ user, navigation, theme, textStyles, containerStyles }: P2PRequirementsGateProps) => {

	const { t } = useTranslation()

	const requirements: { key: string, label: string, description: string, icon: string, iconStyle?: 'solid' | 'regular' | 'brand', passed: boolean, route: keyof SettingsStackParamList }[] = [
		{ key: 'kyc', label: t('p2p.requirements.kyc.label'), description: t('p2p.requirements.kyc.description'), icon: 'shield-halved', passed: !!user.kyc, route: ROUTES.KYC },
		{ key: 'phone', label: t('p2p.requirements.phone.label'), description: t('p2p.requirements.phone.description'), icon: 'phone', passed: !!user.phone_verified, route: ROUTES.PHONE },
		{ key: 'telegram', label: t('p2p.requirements.telegram.label'), description: t('p2p.requirements.telegram.description'), icon: 'telegram', iconStyle: 'brand' as const, passed: !!user.telegram_id, route: ROUTES.TELEGRAM },
	]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={styles.requirementsContainer} showsVerticalScrollIndicator={false}>
				<FontAwesome6 name="triangle-exclamation" size={40} color={theme.colors.warning} iconStyle="solid" />
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 16 }]}>{t('p2p.requirements.title')}</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
					{t('p2p.requirements.subtitle', { done: [user.kyc, user.phone_verified, user.telegram_id].filter(Boolean).length })}
				</Text>

				{requirements.map((req) => (
					<QPPressable
						key={req.key}
						style={[
							styles.requirementCard,
							{ backgroundColor: req.passed ? theme.colors.successFill + '15' : theme.colors.surface },
							// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de
							// runtime pre-existente que se preserva tal cual; el cast es solo de tipos
							(theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: req.passed ? theme.colors.successFill + '40' : theme.colors.border },
						]}
						onPress={() => !req.passed && navigation.navigate(ROUTES.SETTINGS_STACK, { screen: req.route, initial: false })}
						disabled={req.passed}
					>
						<FontAwesome6
							name={(req.passed ? 'circle-check' : req.icon) as FontAwesome6SolidIconName}
							size={20}
							color={req.passed ? theme.colors.successText : theme.colors.secondaryText}
							// `telegram` es un glifo de MARCA: el par name/iconStyle no encaja
							// en el union solid de FontAwesome6 — casts solo de tipos
							iconStyle={(req.passed ? 'solid' : (req.iconStyle || 'solid')) as 'solid'}
						/>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h5, { color: req.passed ? theme.colors.successText : theme.colors.primaryText }]}>{req.label}</Text>
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
