import { View, Text, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import LottieView from 'lottie-react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../../../ui/particles/QPButton'

// Tipos
import type { ReactNode } from 'react'
import type { Theme } from '../../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../../theme/themeUtils'
import type { Settings } from '../../../../settings/settingsConstants'

type AppLockSetupViewProps = {
	/** Paso visible: solo 'info' | 'setup' | 'confirm' llegan aquí ('changePin' lo pinta otra vista). */
	mode: 'info' | 'setup' | 'confirm' | 'changePin'
	security: Settings['security']
	/** Filas de PIN ya renderizadas por el padre (dueño de los refs y del foco). */
	setupRow: ReactNode
	confirmRow: ReactNode
	onActivate: () => void
	onSubmit: () => void
	onCancel: () => void
	isLoading?: boolean
	pinComplete?: boolean
	confirmComplete?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Disabled-info / setup / confirm flow. PIN rows are pre-rendered by the parent.
const AppLockSetupView = ({ mode, security, setupRow, confirmRow, onActivate, onSubmit, onCancel, isLoading, pinComplete, confirmComplete, theme, textStyles, containerStyles }: AppLockSetupViewProps) => {

	const { t } = useTranslation()

	return (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			{mode === 'info' && (
				<>
					<Text style={textStyles.h1}>{t('settings.appLock.title')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						{t('settings.appLock.setup.subtitle')}
					</Text>

					{/* Status icon */}
					<View style={{ alignItems: 'center', paddingVertical: 30 }}>
						<LottieView
							style={{ width: 120, height: 120 }}
							source={require('../../../../assets/lotties/security.json')}
							autoPlay
							loop={false}
						/>
					</View>

					{/* Info card */}
					<View style={[containerStyles.card, { marginBottom: 24 }]}>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
							<FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								{t('settings.appLock.setup.features.autoLock', { minutes: security.autoLockTimeout || 5 })}
							</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
							<FontAwesome6 name="fingerprint" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								{t('settings.appLock.setup.features.unlockMethods')}
							</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
							<FontAwesome6 name="lock" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								{t('settings.appLock.setup.features.localOnly')}
							</Text>
						</View>
					</View>
				</>
			)}

			{mode === 'setup' && (
				<>
					<Text style={textStyles.h1}>{t('settings.appLock.setup.createTitle')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						{t('settings.appLock.setup.createSubtitle')}
					</Text>

					{setupRow}
				</>
			)}

			{mode === 'confirm' && (
				<>
					<Text style={textStyles.h1}>{t('settings.appLock.setup.confirmTitle')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						{t('settings.appLock.setup.confirmSubtitle')}
					</Text>

					{confirmRow}
				</>
			)}

		</ScrollView>

		<View style={containerStyles.bottomButtonContainer}>
			{mode === 'info' && (
				<QPButton title={t('settings.appLock.setup.activateButton')} onPress={onActivate} />
			)}

			{mode === 'setup' && (
				<>
					<QPButton title={t('common.actions.continue')} onPress={onSubmit} disabled={!pinComplete} />
					<QPButton title={t('common.actions.cancel')} onPress={onCancel} style={{ marginTop: 12 }} danger outlined />
				</>
			)}

			{mode === 'confirm' && (
				<>
					<QPButton
						title={t('settings.appLock.setup.activateButton')}
						textStyle={{ color: theme.colors.buttonText }}
						onPress={onSubmit}
						loading={isLoading}
						disabled={!confirmComplete}
					/>
					<QPButton title={t('common.actions.cancel')} onPress={onCancel} style={{ marginTop: 12 }} danger outlined />
				</>
			)}
		</View>
	</View>
	)
}

export default AppLockSetupView
