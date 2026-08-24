import { View, Text, Pressable, Image, Platform, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPButton from '../../../../ui/particles/QPButton'
import { getProductId, getAndroidOfferToken } from '../../../../helpers/iap'
import QPFitText from '../../../../ui/particles/QPFitText'

// Benefits — claves de i18n resueltas en render (constante de módulo)
const benefits = [
	'settings.goldCheck.upsell.benefits.goldenCheck',
	'settings.goldCheck.upsell.benefits.betterRate',
	'settings.goldCheck.upsell.benefits.moreP2POps',
	'settings.goldCheck.upsell.benefits.subdomain',
	'settings.goldCheck.upsell.benefits.earlyOffers',
	'settings.goldCheck.upsell.benefits.zeroP2PFee',
	'settings.goldCheck.upsell.benefits.earlyFeatures',
	'settings.goldCheck.upsell.benefits.cashback',
	'settings.goldCheck.upsell.benefits.prioritySupport'
]

// The "become GOLD" upsell: plan selector, benefits list, and subscribe/restore actions.
const GoldUpsell = ({ plans, selectedPlan, onSelectPlan, subscriptions, connected, busy, isLoading, onSubscribeBalance, onSubscribeIAP, onRestore, insets, theme, textStyles }) => {

	const { t } = useTranslation()
	const { isPurchasing, isPurchasingIAP, isRestoringPurchases } = busy

	// Precio localizado de la tienda para el plan elegido ('' si aún no llegó)
	const storeName = Platform.OS === 'ios' ? 'App Store' : 'Play Store'
	const storePrice = (() => {
		const productId = getProductId(selectedPlan)
		const sub = subscriptions?.find(s => s.productId === productId)
		if (Platform.OS === 'ios') { return sub?.localizedPrice || '' }
		const offerToken = getAndroidOfferToken(selectedPlan, subscriptions)
		const offer = sub?.subscriptionOfferDetails?.find(o => o.offerToken === offerToken)
		return offer?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice || ''
	})()

	return (
		<>
			{/* Subscription Plans */}
			<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xl, gap: theme.spacing.md }}>
				{Object.entries(plans).map(([key, plan]) => (
					<Pressable
						key={key}
						style={[
							{
								flex: 1,
								backgroundColor: theme.colors.surface,
								borderRadius: theme.borderRadius.lg,
								padding: theme.spacing.lg,
								borderWidth: 2,
								borderColor: selectedPlan === key ? theme.colors.primary : theme.colors.border,
								position: 'relative'
							},
							selectedPlan === key && {
								borderColor: theme.colors.primary,
								shadowColor: theme.colors.primary,
								shadowOffset: { width: 0, height: 0 },
								shadowOpacity: 0.3,
								shadowRadius: 8,
								elevation: 8
							}
						]}
						onPress={() => onSelectPlan(key)}
					>
						{key === 'yearly' && (
							<View style={{ position: 'absolute', top: -8, right: 8, backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.borderRadius.sm }}>
								<Text style={[textStyles.caption, { color: theme.colors.buttonText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>
									{t('settings.goldCheck.upsell.bestValue')}
								</Text>
							</View>
						)}

						<Text style={[textStyles.h4, { textAlign: 'center', marginBottom: theme.spacing.sm, color: theme.colors.primaryText }]}>
							{t(`settings.goldCheck.plans.${key}.label`)}
						</Text>

						<View style={{ alignItems: 'center', justifyContent: 'center' }}>
							<QPFitText style={[textStyles.amount, { fontSize: theme.typography.fontSize.xxl, color: theme.colors.primaryText, marginBottom: 4 }]}>
								${plan.value}
							</QPFitText>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>
								{t(`settings.goldCheck.plans.${key}.period`)}
							</Text>
						</View>
					</Pressable>
				))}
			</View>

			{/* Benefits Section */}
			<View style={{ marginBottom: theme.spacing.xl }}>
				<Text style={[textStyles.h3, { marginBottom: theme.spacing.lg, color: theme.colors.primaryText }]}>
					{t('settings.goldCheck.upsell.benefitsTitle')}
				</Text>

				{benefits.map((benefit) => (
					<View key={benefit} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md, paddingLeft: theme.spacing.sm }}>
						<Image source={require('../../../../assets/images/ui/qvapay-logo-gold.png')} style={{ width: 20, height: 20, marginRight: theme.spacing.md }} resizeMode="contain" />
						<Text style={[textStyles.text, { flex: 1, color: theme.colors.primaryText, lineHeight: 22 }]}>
							{t(benefit)}
						</Text>
					</View>
				))}
			</View>

			{/* Subscribe Buttons */}
			<View style={{ gap: theme.spacing.md }}>
				{/* Pay with QvaPay balance */}
				<QPButton
					title={isPurchasing ? t('settings.goldCheck.upsell.processing') : t('settings.goldCheck.upsell.payWithBalance', { amount: plans[selectedPlan].value })}
					onPress={onSubscribeBalance}
					disabled={isPurchasing || isLoading || isPurchasingIAP}
					loading={isPurchasing}
				/>

				{/* Pay with App Store / Play Store */}
				{subscriptions?.length > 0 ? (
					<QPButton
						icon={Platform.OS === 'ios' ? 'apple' : 'google-play'}
						iconStyle="brand"
						iconColor={theme.colors.primaryText}
						title={isPurchasingIAP
							? t('settings.goldCheck.upsell.processing')
							: storePrice
								? t('settings.goldCheck.upsell.payWithStorePrice', { store: storeName, price: storePrice })
								: t('settings.goldCheck.upsell.payWithStore', { store: storeName })
						}
						onPress={onSubscribeIAP}
						disabled={isPurchasingIAP || isPurchasing || isLoading}
						loading={isPurchasingIAP}
						style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.border }}
						textStyle={{ color: theme.colors.primaryText }}
					/>
				) : connected ? (
					<View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
						<ActivityIndicator size="small" color={theme.colors.secondaryText} />
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>
							{t('settings.goldCheck.upsell.loadingPrices')}
						</Text>
					</View>
				) : null}

				{/* Restore Purchases */}
				<Pressable onPress={onRestore} disabled={isRestoringPurchases} style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
					<Text style={[textStyles.text, { color: theme.colors.primary, fontSize: theme.typography.fontSize.sm }]}>
						{isRestoringPurchases ? t('settings.goldCheck.upsell.restoring') : t('settings.goldCheck.upsell.restorePurchases')}
					</Text>
				</Pressable>
			</View>

			{/* Disclaimer */}
			<Text style={[textStyles.caption, { textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: insets.bottom + theme.spacing.sm, color: theme.colors.secondaryText, lineHeight: 18 }]}>
				{t('settings.goldCheck.upsell.disclaimer')}
			</Text>
		</>
	)
}

export default GoldUpsell
