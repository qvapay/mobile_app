import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPButton from '../../../../ui/particles/QPButton'

// Tipos
import type { ReactNode } from 'react'
import type { Theme } from '../../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../../theme/themeUtils'

type AppLockDisableViewProps = {
	/** Fila del PIN actual, ya renderizada por el padre (dueño del ref y del foco). */
	pinRow: ReactNode
	onSubmit: () => void
	onCancel: () => void
	isLoading?: boolean
	disabled?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Desactivar el bloqueo: el PIN actual es la confirmación (un «¿seguro?» lo aceptaba cualquiera con la app abierta).
const AppLockDisableView = ({ pinRow, onSubmit, onCancel, isLoading, disabled, theme, textStyles, containerStyles }: AppLockDisableViewProps) => {

	const { t } = useTranslation()

	return (
	<View style={[containerStyles.subContainer, styles.container]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={textStyles.h1}>{t('settings.appLock.disable.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				{t('settings.appLock.disable.subtitle')}
			</Text>

			{pinRow}

		</ScrollView>

		<View style={containerStyles.bottomButtonContainer}>
			<QPButton title={t('settings.appLock.disable.submit')} onPress={onSubmit} loading={isLoading} disabled={disabled} danger />
			<QPButton title={t('common.actions.cancel')} onPress={onCancel} style={styles.cancel} outlined />
		</View>
	</View>
	)
}

const styles = StyleSheet.create({
	container: { justifyContent: 'space-between' },
	cancel: { marginTop: 12 },
})

export default AppLockDisableView
