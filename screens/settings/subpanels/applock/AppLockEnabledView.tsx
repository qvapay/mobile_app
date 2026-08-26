import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../../../ui/particles/QPButton'
import FaceIDIcon from '../../../../ui/particles/FaceIDIcon'

// Tipos
import type { Theme } from '../../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../../theme/themeUtils'
import type { Settings } from '../../../../settings/settingsConstants'

type AppLockEnabledViewProps = {
	security: Settings['security']
	biometricsAvailable: boolean
	/** 'FaceID' | 'TouchID' | 'Fingerprint' | null (enum BIOMETRY_TYPE del keychain, comparado como string). */
	biometryType: string | null
	onTimeoutSelect: (minutes: number) => void
	onChangePin: () => void
	onDisable: () => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

const TIMEOUT_OPTIONS = [
	{ label: '1 min', value: 1 },
	{ label: '2 min', value: 2 },
	{ label: '5 min', value: 5 },
	{ label: '10 min', value: 10 },
	{ label: '15 min', value: 15 },
	{ label: '30 min', value: 30 },
]

// App-lock enabled state: auto-lock timeout selector, biometric info, change/disable actions.
const AppLockEnabledView = ({ security, biometricsAvailable, biometryType, onTimeoutSelect, onChangePin, onDisable, theme, textStyles, containerStyles }: AppLockEnabledViewProps) => {

	const { t } = useTranslation()

	return (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={textStyles.h1}>{t('settings.appLock.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				{t('settings.appLock.protected')}
			</Text>

			{/* Status icon */}
			<View style={{ alignItems: 'center', paddingVertical: 30 }}>
				<View style={{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.successFill + '20' }}>
					<FontAwesome6 name="lock" size={40} color={theme.colors.successText} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h2, { color: theme.colors.successText, marginTop: 20 }]}>{t('settings.appLock.enabled.active')}</Text>
			</View>

			{/* Auto-lock timeout */}
			<View style={[containerStyles.card, { marginBottom: 16 }]}>
				<Text style={[textStyles.h4, { marginBottom: 12 }]}>{t('settings.appLock.enabled.timeoutTitle')}</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginBottom: 16 }]}>
					{t('settings.appLock.enabled.timeoutDescription')}
				</Text>
				<View style={styles.timeoutGrid}>
					{TIMEOUT_OPTIONS.map((option) => (
						<Pressable
							key={option.value}
							style={[styles.timeoutChip, {
								backgroundColor: security.autoLockTimeout === option.value
									? theme.colors.primary : theme.colors.surface,
								borderColor: security.autoLockTimeout === option.value
									? theme.colors.primary : theme.colors.border,
							}]}
							onPress={() => onTimeoutSelect(option.value)}
						>
							<Text style={[textStyles.h6, {
								color: security.autoLockTimeout === option.value
									? '#FFFFFF' : theme.colors.secondaryText,
							}]}>
								{option.label}
							</Text>
						</Pressable>
					))}
				</View>
			</View>

			{/* Biometric unlock info */}
			{biometricsAvailable && (
				<View style={[containerStyles.card, { marginBottom: 16 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'center' }}>
						{biometryType === 'FaceID' ? (
							<View style={{ marginRight: 12 }}><FaceIDIcon size={20} color={theme.colors.primary} /></View>
						) : (
							<FontAwesome6 name="fingerprint" size={18} style={{ color: theme.colors.primary, marginRight: 12 }} iconStyle="solid" />
						)}
						<Text style={[textStyles.h4, { flex: 1, marginBottom: 0 }]}>
							{t('settings.appLock.enabled.biometricEnabled', { label: biometryType === 'FaceID' ? 'Face ID' : biometryType === 'TouchID' ? 'Touch ID' : t('settings.biometrics.fingerprint') })}
						</Text>
						<FontAwesome6 name="circle-check" size={20} color={theme.colors.successText} iconStyle="solid" />
					</View>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 8 }]}>
						{t('settings.appLock.enabled.biometricHint')}
					</Text>
				</View>
			)}

		</ScrollView>

		{/* Actions */}
		<View style={containerStyles.bottomButtonContainer}>
			<QPButton title={t('settings.appLock.enabled.changePinButton')} onPress={onChangePin} />
			<QPButton title={t('settings.appLock.enabled.disableButton')} onPress={onDisable} style={{ marginTop: 12 }} danger />
		</View>
	</View>
	)
}

const styles = StyleSheet.create({
	timeoutGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	timeoutChip: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 1,
	},
})

export default AppLockEnabledView
