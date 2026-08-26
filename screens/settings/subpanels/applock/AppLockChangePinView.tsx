import { View, Text, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPButton from '../../../../ui/particles/QPButton'

// Tipos
import type { ReactNode } from 'react'
import type { Theme } from '../../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../../theme/themeUtils'

type AppLockChangePinViewProps = {
	/** Filas de PIN ya renderizadas por el padre (dueño de los refs y del foco). */
	oldPinRow: ReactNode
	newPinRow: ReactNode
	confirmRow: ReactNode
	onSubmit: () => void
	onCancel: () => void
	isLoading?: boolean
	disabled?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Change-PIN screen. The PIN rows are pre-rendered by the parent (which owns refs/focus).
const AppLockChangePinView = ({ oldPinRow, newPinRow, confirmRow, onSubmit, onCancel, isLoading, disabled, theme, textStyles, containerStyles }: AppLockChangePinViewProps) => {

	const { t } = useTranslation()

	return (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={textStyles.h1}>{t('settings.appLock.changePin.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				{t('settings.appLock.changePin.subtitle')}
			</Text>

			{oldPinRow}
			{newPinRow}
			{confirmRow}

		</ScrollView>

		<View style={containerStyles.bottomButtonContainer}>
			<QPButton title={t('settings.appLock.changePin.submit')} onPress={onSubmit} loading={isLoading} disabled={disabled} />
			<QPButton title={t('common.actions.cancel')} onPress={onCancel} style={{ marginTop: 12 }} danger outlined />
		</View>
	</View>
	)
}

export default AppLockChangePinView
