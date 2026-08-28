import { View, Text, ScrollView } from 'react-native'
import React from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '../../../i18n'

// Lottie
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Components
import GoldUpsell from './gold/GoldUpsell'

// Estado + compras de la suscripción (saldo, hoja nativa IAP y restaurar)
import useGoldSubscription, { plans } from './gold/useGoldSubscription'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { SettingsStackParamList } from '../../../types/navigation'

const GoldCheck = ({ navigation: _navigation }: NativeStackScreenProps<SettingsStackParamList, 'GoldCheck'>) => {

	// Idioma activo
	const { t } = useTranslation()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Suscripción GOLD: estado, banderas de compra y los tres flujos de alta
	const {
		selectedPlan,
		setSelectedPlan,
		goldCheckStatus,
		goldCheckExpire,
		isLoading,
		busy,
		connected,
		subscriptions,
		handleSubscribe,
		handleSubscribeIAP,
		handleRestore,
	} = useGoldSubscription()

	return (
		<ScrollView style={[containerStyles.container, { paddingHorizontal: theme.spacing.md }]}>

			<View style={containerStyles.scrollContainer}>

				{goldCheckStatus ? (
					<View style={containerStyles.center}>
						<FontAwesome6 name="crown" size={120} color={theme.colors.gold} iconStyle="solid" />
					</View>
				) : (
					<View style={containerStyles.center}>
						<LottieView source={require('../../../assets/lotties/gold.json')} autoPlay loop={false} style={{ width: 180, height: 180 }} />
					</View>
				)}

				<Text style={[textStyles.h1, { textAlign: 'center', marginBottom: theme.spacing.lg, lineHeight: 36 }]}>
					{goldCheckStatus ? t('settings.goldCheck.alreadyGold') : t('settings.goldCheck.unlockTitle')}
				</Text>

				{/* Gold Status Display */}
				{goldCheckStatus && (
					<View style={{
						backgroundColor: theme.colors.gold + '20',
						borderRadius: theme.borderRadius.lg,
						padding: theme.spacing.lg,
						marginBottom: theme.spacing.lg,
						borderWidth: 1,
						borderColor: theme.colors.gold + '40'
					}}>
						<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
							<FontAwesome6 name="crown" size={18} color={theme.colors.gold} iconStyle="solid" style={{ marginRight: theme.spacing.sm }} />
							<Text style={[textStyles.h3, { textAlign: 'center', color: theme.colors.gold }]}>
								{t('settings.goldCheck.activeSubscription')}
							</Text>
						</View>

						{goldCheckExpire && (
							<Text style={[textStyles.text, { textAlign: 'center', color: theme.colors.primaryText }]}>
								{t('settings.goldCheck.expires', { date: new Date(goldCheckExpire).toLocaleDateString(getDateLocale()) })}
							</Text>
						)}
					</View>
				)}

				<GoldUpsell
					plans={plans}
					selectedPlan={selectedPlan}
					onSelectPlan={setSelectedPlan}
					subscriptions={subscriptions}
					connected={connected}
					busy={busy}
					isLoading={isLoading}
					onSubscribeBalance={handleSubscribe}
					onSubscribeIAP={handleSubscribeIAP}
					onRestore={handleRestore}
					insets={insets}
					theme={theme}
					textStyles={textStyles}
				/>
			</View>
		</ScrollView>
	)
}

export default GoldCheck
