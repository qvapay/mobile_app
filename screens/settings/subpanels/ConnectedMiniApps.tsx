import { useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { toast } from 'sonner-native'

import { useTheme } from '../../../theme/ThemeContext'
import { useTextStyles, useContainerStyles } from '../../../theme/themeUtils'
import QPLoader from '../../../ui/particles/QPLoader'
import { timeAgo } from '../../../helpers'

import { miniappsApi } from '../../../api/miniappsApi'
import { useMiniAppGrants, MINIAPPS_ROOT } from '../../miniapps/miniappsQueries'
import MiniAppIcon from '../../miniapps/MiniAppIcon'
import type { MiniAppGrant } from '../../../types/domain'

/**
 * Ajustes → Apps conectadas: mini-apps a las que el usuario dio acceso a su
 * identidad, con lo que comparten y un botón para revocarlo. Revocar no borra
 * lo que la mini-app ya recibió; impide que vuelva a recibirlo sin preguntar.
 */
const ConnectedMiniApps = () => {

	const { t } = useTranslation()
	const { theme, isDark } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()

	const { data, isPending, isError, refetch } = useMiniAppGrants()
	const [revoking, setRevoking] = useState<string | null>(null)

	const revoke = async (grant: MiniAppGrant) => {
		if (revoking) return
		setRevoking(grant.slug)
		const result = await miniappsApi.revokeGrant(grant.slug)
		setRevoking(null)
		if (result.success) {
			queryClient.invalidateQueries({ queryKey: MINIAPPS_ROOT })
			toast.success(t('miniapps.host.revoked', { name: grant.name }))
		} else {
			toast.error(t('transactions.common.errorTitle'), { description: result.error })
		}
	}

	if (isPending) return <QPLoader />

	const grants = data ?? []

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>{t('miniapps.connected.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('miniapps.connected.subtitle')}</Text>

				{isError && !data ? (
					<Pressable onPress={() => refetch()} style={{ marginTop: 24, alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.primary }]}>{t('miniapps.host.retry')}</Text>
					</Pressable>
				) : grants.length === 0 ? (
					<View style={{ marginTop: 24, borderRadius: 12, padding: 24, alignItems: 'center', backgroundColor: theme.colors.surface }}>
						<FontAwesome6 name="puzzle-piece" size={24} color={theme.colors.tertiaryText} iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center', marginTop: 10 }]}>{t('miniapps.connected.empty')}</Text>
					</View>
				) : (
					<View style={{ marginTop: 16 }}>
						{grants.map(grant => (
							<View key={grant.slug} style={[{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }, !isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
								<MiniAppIcon app={grant} size={40} />
								<View style={{ flex: 1, marginLeft: 12 }}>
									<Text style={[textStyles.body, { fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>{grant.name}</Text>
									<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={2}>
										{t('miniapps.connected.meta', {
											scopes: grant.scopes.map(s => t(`miniapps.connected.scopeNames.${s}`)).join(', '),
											time: timeAgo(grant.updated_at),
										})}
									</Text>
								</View>
								<Pressable onPress={() => revoke(grant)} hitSlop={10} disabled={!!revoking} accessibilityRole="button" accessibilityLabel={t('miniapps.host.revoke')}>
									{revoking === grant.slug
										? <ActivityIndicator size="small" color={theme.colors.danger} />
										: <Text style={[textStyles.h6, { color: theme.colors.danger }]}>{t('miniapps.connected.revoke')}</Text>}
								</Pressable>
							</View>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	)
}

export default ConnectedMiniApps
