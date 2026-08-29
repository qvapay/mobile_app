import { View, Text, ScrollView, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import { ROUTES } from '../../routes'
import QPPressable from '../../ui/particles/QPPressable'
import { missingP2PRequirements } from './p2pRequirements'

import type { P2PRequirementKey } from './p2pRequirements'

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
	/**
	 * Requisito que señaló el backend en su 400. Manda sobre el perfil local:
	 * si el servidor dice que falta el KYC, se pinta pendiente aunque la copia
	 * cacheada del usuario diga que está hecho.
	 */
	serverMissing?: P2PRequirementKey | null
	/**
	 * Callback opcional para reintentar el acceso tras completar un requisito
	 * (red de seguridad cuando serverMissing indica desfase con el backend).
	 */
	onRetry?: () => void
}

// Shown when the user hasn't met the P2P requirements (KYC + phone + telegram).
// Shared by the P2P marketplace and the create-offer screens.
const P2PRequirementsGate = ({ user, navigation, theme, textStyles, containerStyles, serverMissing = null, onRetry }: P2PRequirementsGateProps) => {

	const { t } = useTranslation()

	const isPending = (key: P2PRequirementKey, localPassed: boolean) => !localPassed || serverMissing === key

	const requirements: { key: string, label: string, description: string, icon: string, iconStyle?: 'solid' | 'regular' | 'brand', passed: boolean, route: keyof SettingsStackParamList }[] = [
		{ key: 'kyc', label: t('p2p.requirements.kyc.label'), description: t('p2p.requirements.kyc.description'), icon: 'shield-halved', passed: !isPending('kyc', !!user.kyc), route: ROUTES.KYC },
		{ key: 'phone', label: t('p2p.requirements.phone.label'), description: t('p2p.requirements.phone.description'), icon: 'phone', passed: !isPending('phone', !!user.phone_verified), route: ROUTES.PHONE },
		{ key: 'telegram', label: t('p2p.requirements.telegram.label'), description: t('p2p.requirements.telegram.description'), icon: 'telegram', iconStyle: 'brand' as const, passed: !isPending('telegram', !!user.telegram_id), route: ROUTES.TELEGRAM },
	]

	// El acceso al P2P también puede estar cerrado por la cuenta (p2p_enabled),
	// y eso no lo arregla ningún paso de esta lista: se dice explícitamente en
	// vez de dejar tres checks verdes sin explicación.
	const accountBlocked = serverMissing === 'p2p_enabled' || missingP2PRequirements(user).includes('p2p_enabled')

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={styles.requirementsContainer} showsVerticalScrollIndicator={false}>
				<FontAwesome6 name="triangle-exclamation" size={40} color={theme.colors.warning} iconStyle="solid" />
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 16 }]}>{t('p2p.requirements.title')}</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
					{t('p2p.requirements.subtitle', { done: requirements.filter(req => req.passed).length })}
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

				{accountBlocked && (
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 14 }]}>
						{t('p2p.requirements.accountBlocked')}
					</Text>
				)}

				{onRetry && (
					<QPPressable
						style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
						onPress={onRetry}
					>
						<Text style={[textStyles.h5, { color: theme.colors.primaryButtonText }]}>{t('p2p.requirements.retry')}</Text>
					</QPPressable>
				)}
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
	retryButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 14,
		borderRadius: 12,
		marginTop: 16,
		width: '100%',
	},
})

export default P2PRequirementsGate
