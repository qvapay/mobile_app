import { Text, View, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPButton from '../../../ui/particles/QPButton'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../theme/themeUtils'

type PhoneVerifiedViewProps = {
	userPhone?: string | null
	onRemove: () => void
	isLoading?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Verified-phone state: shows the number + a remove action.
const PhoneVerifiedView = ({ userPhone, onRemove, isLoading, theme, textStyles, containerStyles }: PhoneVerifiedViewProps) => {
	const { t } = useTranslation()
	return (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={textStyles.h1}>{t('settings.phone.verified.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				{t('settings.phone.verified.subtitle')}
			</Text>

			{/* Status icon */}
			<View style={{ alignItems: 'center', paddingVertical: 30 }}>
				<View style={{
					width: 100,
					height: 100,
					borderRadius: 50,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: theme.colors.successFill + '20',
				}}>
					<FontAwesome6 name="phone" size={48} color={theme.colors.successText} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 16 }]}>
					{userPhone}
				</Text>
			</View>

			{/* Info card */}
			<View style={containerStyles.card}>
				<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
					<FontAwesome6 name="circle-check" size={16} color={theme.colors.successText} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						{t('settings.phone.verified.info')}
					</Text>
				</View>
			</View>

		</ScrollView>

		<View style={containerStyles.bottomButtonContainer}>
			<QPButton
				title={t('settings.phone.verified.removeButton')}
				onPress={onRemove}
				loading={isLoading}
				disabled={isLoading}
				style={{ backgroundColor: theme.colors.danger }}
				textStyle={{ color: theme.colors.almostWhite }}
			/>
		</View>
	</View>
	)
}

export default PhoneVerifiedView
