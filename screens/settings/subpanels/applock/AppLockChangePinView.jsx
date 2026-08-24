import { View, Text, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPButton from '../../../../ui/particles/QPButton'

// Change-PIN screen. The PIN rows are pre-rendered by the parent (which owns refs/focus).
const AppLockChangePinView = ({ oldPinRow, newPinRow, confirmRow, onSubmit, onCancel, isLoading, disabled, theme, textStyles, containerStyles }) => {

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
